import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  LANDMARKS,
  LANDMARK_BUILDING_HEIGHT_OVERRIDES,
  createBuildingFootprintPlacement,
  createPeterboroughLandmarks,
} from './landmark-models.js?v=1.5.5-streets4';
import { ROAD_SURFACE_CLEARANCE, RoadSurfaceIndex, laneCountFor, reconcileRoadNetworkElevations, roadProfile, roadRibbonCrossSections, resampleRoadLine } from './road-network.js?v=1.5.5-r10';
import { OfficialDrivableSurfaceIndex, officialSurfaceStatusActive } from './official-road-surfaces.js?v=1.5.5-pavement1';
import { FLY_TUNING, adjustFlySpeedScale, applyFlyLookDelta, dampingFactors, flyAxesFromKeys, flySpeedFor, flyYawToward, isFlyControlCode, wrapFlyYaw } from './fly-controls.js?v=1.5.5-fly4';
import { clearLandCoverRaster, paintLandCoverPolygon } from './land-cover-raster.js?v=1.5.5-raster1';
import { sampleOfficialTerrainElevation, validOfficialTerrainMetadata } from './terrain-heightmap.js?v=1.5.5-lidar1';
import { sampleTriangulatedTerrainHeight } from './terrain-surface.js?v=1.5.5-terrain1';
import { HydroSurfaceIndex, WATER_SURFACE_CLEARANCE, WATER_TERRAIN_RECESS, createWaterStageSampler, relativeWaterElevation, robustFallbackWaterHeight, subdivideWaterTriangle, watercourseWidth } from './water-system.js?v=1.5.5-hydro2';
import { CitySplatLayer } from './city-splat-layer.js?v=1.5.5-hybrid1';
import {
  estimatedBuildingFloors,
  facadeDetailClass,
  mappedCycleLaneSides,
  mappedTurnLaneGroups,
  roadLaneMarkingBoundaries,
  selectStreetSignIntersections,
  shouldRenderUrbanCurb,
} from './city-detail-rules.js?v=1.5.5-streets3';
import {
  createSkyAtmosphere,
  installWorldSurfaceDetail,
  projectedVerticalSliceBounds,
  worldPointInVerticalSlice,
} from './vertical-slice-quality.js?v=1.5.5-aaa6';
import {
  FIRE_STATION_ONE,
  PLAYER_TUNING,
  TRUCK_TUNING,
  createFireStationFacade,
  createFireTruck,
  createFirefighter,
  dampAngle,
  directionFromHeading,
  exponentialStep,
  gameplayAxesFromKeys,
  headingFromDirection,
  stepFireTruckKinematics,
} from './gameplay-systems.js?v=1.5.6-station4';
import {
  SEMANTIC_POINT_TYPES,
  createDraftPointFeature,
  createOrthophotoOverlay,
  createSemanticSurveyLayer,
  semanticSurveySummary,
  validateSemanticSurvey,
} from './semantic-survey.js?v=1.5.6-survey3';

// Render tiles preserve a useful balance between material batching and
// camera-local culling. The semantic GIS features remain independent.
const RENDER_TILE_SIZE = 1800;
const ROAD_RENDER_TILE_SIZE = 3600;
const explorerStartedAt = performance.now();

const CITY = {
  name: 'Peterborough, Ontario',
  center: { lat: 44.3091, lon: -78.3197 },
  // These defaults cover the complete prepared city extract. `hydrateWorldBounds`
  // replaces them with the deployment manifest bounds when that file is available.
  dataBounds: { west: -78.405, south: 44.245, east: -78.245, north: 44.385 },
  terrainSize: 18000,
  terrainSegments: 224,
  terrainCenter: { x: 0, z: 0 },
  worldBounds: { minX: -9000, maxX: 9000, minZ: -9000, maxZ: 9000 },
  terrainZoom: 12,
  // Keep source elevations at real-world scale; recognizability should come
  // from accurate grades, not artificial vertical exaggeration.
  terrainExaggeration: 1,
};

const els = {
  app: document.querySelector('#app'),
  canvas: document.querySelector('#city-canvas'),
  loading: document.querySelector('#loading-screen'),
  loadingProgress: document.querySelector('#loading-progress'),
  loadingMessage: document.querySelector('#loading-message'),
  locationName: document.querySelector('#location-name'),
  coordinates: document.querySelector('#coordinates'),
  worldStatus: document.querySelector('#world-status'),
  statusDot: document.querySelector('#status-dot'),
  objectCount: document.querySelector('#object-count'),
  fps: document.querySelector('#fps-counter'),
  altitude: document.querySelector('#altitude-counter'),
  modeHint: document.querySelector('#mode-hint'),
  playMode: document.querySelector('#play-mode'),
  flyMode: document.querySelector('#fly-mode'),
  mapMode: document.querySelector('#map-mode'),
  searchButton: document.querySelector('#search-button'),
  landmarksButton: document.querySelector('#landmarks-button'),
  timeButton: document.querySelector('#time-button'),
  soundButton: document.querySelector('#sound-button'),
  splatToggle: document.querySelector('#splat-toggle'),
  splatCalibration: document.querySelector('#splat-calibration'),
  referencePanel: document.querySelector('#reference-panel'),
  referencePosition: document.querySelector('#reference-position'),
  referenceMapillary: document.querySelector('#reference-mapillary'),
  referenceOntario: document.querySelector('#reference-ontario'),
  searchDialog: document.querySelector('#search-dialog'),
  landmarksDialog: document.querySelector('#landmarks-dialog'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  searchResults: document.querySelector('#search-results'),
  landmarkList: document.querySelector('#landmark-list'),
  toast: document.querySelector('#toast'),
  mapScaleLine: document.querySelector('#map-scale-line'),
  mapScaleLabel: document.querySelector('#map-scale-label'),
  gameplayHud: document.querySelector('#gameplay-hud'),
  gameplayRole: document.querySelector('#gameplay-role'),
  gameplaySpeed: document.querySelector('#gameplay-speed'),
  gameplayGear: document.querySelector('#gameplay-gear'),
  gameplayRoad: document.querySelector('#gameplay-road'),
  interactionPrompt: document.querySelector('#interaction-prompt'),
  surveyPanel: document.querySelector('#survey-panel'),
  surveyClose: document.querySelector('#survey-close'),
  surveyStatus: document.querySelector('#survey-status'),
  surveyFeatureType: document.querySelector('#survey-feature-type'),
  surveyAddPoint: document.querySelector('#survey-add-point'),
  surveyUndo: document.querySelector('#survey-undo'),
  surveyExport: document.querySelector('#survey-export'),
  surveyOverlayVisible: document.querySelector('#survey-overlay-visible'),
  surveyOverlayOpacity: document.querySelector('#survey-overlay-opacity'),
};

// Source-ID keyed overrides are reserved for reviewed landmark footprints.
// They replace scattered visual offsets with one auditable, data-oriented
// record while the geographic footprint remains authoritative.
const REVIEWED_BUILDING_STYLES = Object.freeze({
  'way/1009651229': Object.freeze({
    name: 'Peterborough Fire Station 1',
    wallMaterial: 'civicBrick',
    wallHeight: 5.75,
    roofHeight: 0.28,
    roofShape: 'flat',
    customFacade: true,
  }),
});

const state = {
  mode: 'onFoot',
  lastNonMapMode: 'onFoot',
  keys: new Set(),
  yaw: Math.PI,
  pitch: -0.24,
  pointerLocked: false,
  dragLooking: false,
  dragPointerId: null,
  previousPointer: null,
  flySpeedScale: 1,
  previousTouch: null,
  loadedSource: 'live',
  objectCount: 0,
  lastFlyPosition: new THREE.Vector3(0, 180, 520),
  lastFlyYaw: Math.PI,
  lastFlyPitch: -0.24,
  gameplayYaw: Math.PI,
  gameplayPitch: -0.2,
  gameplayCameraDistanceScale: 1,
  gameplayLastLookTime: 0,
  emergencyLights: false,
  theme: 'day',
  terrainAvailable: false,
  multipolygonsAvailable: false,
  dataGeneratedAt: '',
  manifest: null,
  localPlaces: [],
  locationPlaces: [
    ...LANDMARKS,
    { name: FIRE_STATION_ONE.name, category: 'Fire station', lat: FIRE_STATION_ONE.lat, lon: FIRE_STATION_ONE.lon },
  ],
  cityOpenDataCount: 0,
  officialRoadSurfacesAvailable: false,
  officialRoadSurfaceCount: 0,
  officialCurbSegmentCount: 0,
  officialDrivableSurfaceIndex: new OfficialDrivableSurfaceIndex(),
  officialHydroAvailable: false,
  officialHydroCount: 0,
  roadSurfaceIndex: new RoadSurfaceIndex(),
  roadSurfaceCount: 0,
  roadBridgeStats: { total: 0, raised: 0, crossings: 0, maximumLift: 0 },
  // Only landmark-referenced footprints are retained. The complete building
  // layer stays GPU-batched, while authored roof/facade details can share the
  // exact source footprint and foundation datum instead of a hand-entered pin.
  landmarkBuildingPlacements: new Map(),
};

const landmarkBuildingReferences = new Set(
  LANDMARKS.flatMap((landmark) => landmark.osmRefs || []),
);

const terrain = {
  available: false,
  source: 'none',
  zoom: CITY.terrainZoom,
  minTileX: 0,
  minTileY: 0,
  tilesAcross: 0,
  pixelsAcross: 0,
  pixelWidth: 0,
  pixelHeight: 0,
  pixels: null,
  officialMetadata: null,
  baseElevation: 0,
  minElevation: 0,
  maxElevation: 0,
  renderGrid: null,
};

// Land use is painted into one transparent texture that rides on an exact
// clone of the rendered terrain. This keeps even city-scale OSM polygons on
// the lidar surface and avoids long triangulation chords that can appear as
// floating slabs or cut across hills.
const landCoverRaster = {
  canvas: null,
  context: null,
  texture: null,
  mesh: null,
  extent: null,
  entries: [],
  dirty: false,
  polygons: 0,
  rings: 0,
  vertices: 0,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb6bd);
scene.fog = new THREE.FogExp2(0x9bb6bd, 0.000068);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 27000);
camera.position.copy(state.lastFlyPosition);
camera.rotation.order = 'YXZ';

const compatibilityMode = new URLSearchParams(location.search).get('lite') === '1';
const lowPowerProfile = compatibilityMode
  || innerWidth < 760
  || (Number(navigator.deviceMemory) > 0 && Number(navigator.deviceMemory) <= 4)
  || (Number(navigator.hardwareConcurrency) > 0 && Number(navigator.hardwareConcurrency) <= 4);
document.documentElement.dataset.cityCompatibilityMode = compatibilityMode ? 'forced' : lowPowerProfile ? 'automatic' : 'full';
const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: !lowPowerProfile, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, lowPowerProfile ? 1.2 : 1.65));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.04;
renderer.shadowMap.enabled = !lowPowerProfile;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const ambient = new THREE.HemisphereLight(0xe3f2eb, 0x52644f, 1.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffefd1, 2.8);
sun.position.set(-1200, 2200, 900);
scene.add(sun);
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;
sun.castShadow = !lowPowerProfile;
if (sun.castShadow) {
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 25;
  sun.shadow.camera.far = 5200;
  sun.shadow.camera.left = -1450;
  sun.shadow.camera.right = 1450;
  sun.shadow.camera.top = 1450;
  sun.shadow.camera.bottom = -1450;
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.055;
}
const atmosphere = createSkyAtmosphere(THREE, 18000);
scene.add(atmosphere.mesh);

const world = new THREE.Group();
scene.add(world);
const terrainGroup = new THREE.Group();
const roadGroup = new THREE.Group();
const mapRoadGroup = new THREE.Group();
const buildingGroup = new THREE.Group();
const vegetationGroup = new THREE.Group();
const landmarkGroup = new THREE.Group();
const gameplayGroup = new THREE.Group();
const streetscapeGroup = new THREE.Group();
const streetLabelGroup = new THREE.Group();
const semanticSurveyGroup = new THREE.Group();
const surveyMarkerGroup = new THREE.Group();
world.add(terrainGroup, roadGroup, mapRoadGroup, buildingGroup, vegetationGroup, streetscapeGroup, landmarkGroup, gameplayGroup, semanticSurveyGroup, surveyMarkerGroup, streetLabelGroup);
mapRoadGroup.visible = false;
streetLabelGroup.visible = false;
surveyMarkerGroup.visible = false;
const verticalSliceBounds = projectedVerticalSliceBounds(project, 0);
const verticalSliceShadowBounds = projectedVerticalSliceBounds(project, 600);
const verticalSliceDetails = { built: false, rooftopUnits: [] };

const clock = new THREE.Clock();
const velocity = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const roadSide = new THREE.Vector3();
const roadSurfaceNormal = new THREE.Vector3();
const roadBasis = new THREE.Matrix4();
const flyForward = new THREE.Vector3();
const flyRight = new THREE.Vector3();
const flyDesired = new THREE.Vector3();
const flyStep = new THREE.Vector3();
let toastTimer = 0;
let ambientAudio = null;
let frameCounter = 0;
let frameWindowStarted = performance.now();
let lastLocationUpdate = 0;
let animationFrameId = 0;
let animatedFountain = null;
let lastMapLabelHeight = 0;
let citySplatLayer = null;
let playerActor = null;
let fireTruckActor = null;
let fireStationDetail = null;
let semanticSurveyCollection = null;
let semanticSurveyOverlay = null;
let semanticSurveyActive = false;
let semanticSurveyPlacing = false;
const semanticSurveyDrafts = [];
const surveyRaycaster = new THREE.Raycaster();
const surveyPointer = new THREE.Vector2();
let playerHeading = Math.PI;
let playerSpeed = 0;
const playerVelocity = new THREE.Vector3();
const gameplayCameraTarget = new THREE.Vector3();
const gameplayDesiredCamera = new THREE.Vector3();
const gameplayDesiredTarget = new THREE.Vector3();
const fireStationWorld = new THREE.Vector3();
const gameplayForward = new THREE.Vector3();
const gameplayRight = new THREE.Vector3();
const gameplayMove = new THREE.Vector3();
const truckState = { x: 0, z: 0, y: 0, heading: Math.PI, speed: 0, steering: 0, pitch: 0, roll: 0, wheelRotation: 0 };
let gameplayReady = false;
let vehicleAudio = null;
let lastRoadLabel = '';
let gamepadActionDown = false;
let gamepadCameraDown = false;

function publishSplatStatus(status) {
  const root = document.documentElement;
  root.dataset.splatStatus = status.status;
  root.dataset.splatSupported = String(status.supported);
  root.dataset.splatEnabled = String(status.enabled);
  root.dataset.splatLoaded = String(status.loaded);
  root.dataset.splatVisible = String(status.visible);
  root.dataset.splatCount = String(status.visibleSplats);
  root.dataset.splatMemoryBytes = String(status.approximateBytes);
  root.dataset.splatBudget = String(status.budget);
  root.dataset.splatPreflight = String(status.preflight || 'not-requested');
  globalThis.__PTBO_SPLAT_STATS__ = status;
  if (!els.splatToggle) return;
  els.splatToggle.classList.toggle('is-active', status.enabled);
  els.splatToggle.setAttribute('aria-pressed', String(status.enabled));
  if (!status.supported) els.splatToggle.textContent = 'Detail fallback';
  else if (status.loaded) els.splatToggle.textContent = `Detail ${status.visible}/${status.loaded}`;
  else if (status.unavailable) els.splatToggle.textContent = 'Mesh detail';
  else els.splatToggle.textContent = status.enabled ? 'Detail on' : 'Detail off';
  els.splatToggle.title = status.unavailable
    ? `${status.unavailable} pilot captures await approved licensed assets; the complete mesh city is active.`
    : 'Toggle licensed captured landmark detail';
}

async function initializeCapturedDetailLayer() {
  citySplatLayer = new CitySplatLayer({
    THREE,
    scene,
    renderer,
    camera,
    project,
    terrainHeightAtWorld,
    getTerrainBaseElevation: () => terrain.baseElevation,
    manifestUrl: './data/splats/manifest.json',
    moduleSpecifier: '@sparkjsdev/spark',
    lowPowerProfile,
    debugElement: els.splatCalibration,
    onStatus: publishSplatStatus,
  });
  await citySplatLayer.initialize();
  citySplatLayer.setEnvironmentTheme(state.theme);
}

function setRoadQuaternion(target, direction) {
  const forward = direction;
  roadSide.crossVectors(worldUp, forward);
  if (roadSide.lengthSq() < 1e-10) {
    target.quaternion.identity();
    return;
  }
  roadSide.normalize();
  roadSurfaceNormal.crossVectors(forward, roadSide).normalize();
  roadBasis.makeBasis(roadSide, roadSurfaceNormal, forward);
  target.quaternion.setFromRotationMatrix(roadBasis);
}

const standard = (color, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness: options.roughness ?? 0.82,
  metalness: options.metalness ?? 0,
  ...(options.side !== undefined ? { side: options.side } : {}),
  ...(options.transparent !== undefined ? { transparent: options.transparent } : {}),
  ...(options.opacity !== undefined ? { opacity: options.opacity } : {}),
  ...(options.depthWrite !== undefined ? { depthWrite: options.depthWrite } : {}),
  ...(options.emissive !== undefined ? { emissive: options.emissive } : {}),
  ...(options.emissiveIntensity !== undefined ? { emissiveIntensity: options.emissiveIntensity } : {}),
});

const materials = {
  // Building materials deliberately use a compact palette. Footprints and any
  // authoritative colours come from OSM; the palette keeps city-scale batching fast.
  residential: standard(0xa7674d, { side: THREE.DoubleSide }),
  residentialBrick: standard(0x9e5c43, { side: THREE.DoubleSide }),
  residentialPale: standard(0xc2b49c, { side: THREE.DoubleSide }),
  residentialSlate: standard(0x737b77, { side: THREE.DoubleSide }),
  commercial: standard(0x82948d, { roughness: 0.58, metalness: 0.04, side: THREE.DoubleSide }),
  commercialGlass: standard(0x496c76, { roughness: 0.27, metalness: 0.14, side: THREE.DoubleSide }),
  industrial: standard(0x78867d, { side: THREE.DoubleSide }),
  industrialMetal: standard(0x85918f, { roughness: 0.46, metalness: 0.22, side: THREE.DoubleSide }),
  civic: standard(0xa0937b, { side: THREE.DoubleSide }),
  civicBrick: standard(0x80584b, { side: THREE.DoubleSide }),
  tower: standard(0x718f94, { roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide }),
  roofDark: standard(0x303a3b, { roughness: 0.9 }),
  roofClay: standard(0x70463c, { roughness: 0.92 }),
  roofMetal: standard(0x6d7d80, { roughness: 0.4, metalness: 0.28 }),
  windowGlass: standard(0x294751, { roughness: 0.25, metalness: 0.14, emissive: 0x071013, emissiveIntensity: 0.05, side: THREE.DoubleSide }),
  windowWarm: standard(0x8b7b57, { roughness: 0.42, metalness: 0.04, emissive: 0x2b200c, emissiveIntensity: 0.06, side: THREE.DoubleSide }),
  storefrontGlass: standard(0x315f69, { roughness: 0.18, metalness: 0.16, emissive: 0x071719, emissiveIntensity: 0.06, side: THREE.DoubleSide }),
  facadeTrim: standard(0x8d8e84, { roughness: 0.72, metalness: 0.08, side: THREE.DoubleSide }),
  roofEquipment: standard(0x7b8380, { roughness: 0.5, metalness: 0.34 }),
  roadHighway: standard(0x30383b, { roughness: 0.9, side: THREE.DoubleSide }),
  roadArterial: standard(0x343c3e, { roughness: 0.92, side: THREE.DoubleSide }),
  roadCollector: standard(0x384041, { roughness: 0.94, side: THREE.DoubleSide }),
  roadLocal: standard(0x3d4443, { roughness: 0.96, side: THREE.DoubleSide }),
  roadService: standard(0x464a46, { roughness: 0.97, side: THREE.DoubleSide }),
  roadUnpaved: standard(0x75664e, { roughness: 1, side: THREE.DoubleSide }),
  roadTunnel: standard(0x22292b, { roughness: 0.9, side: THREE.DoubleSide }),
  officialRoad: standard(0x363d3e, { roughness: 0.95, side: THREE.DoubleSide }),
  roadEdge: standard(0x7d8079, { roughness: 0.98, side: THREE.DoubleSide }),
  roadShoulder: standard(0x565c59, { roughness: 0.98, side: THREE.DoubleSide }),
  roadUnpavedEdge: standard(0x665b49, { roughness: 1, side: THREE.DoubleSide }),
  roadBridgeEdge: standard(0x626a69, { roughness: 0.72, metalness: 0.08, side: THREE.DoubleSide }),
  curbConcrete: standard(0xa3a49b, { roughness: 0.98, side: THREE.DoubleSide }),
  roadPaintYellow: standard(0xe6bd43, { roughness: 0.68, emissive: 0x3a2704, emissiveIntensity: 0.03 }),
  roadPaintWhite: standard(0xf2f0df, { roughness: 0.7, emissive: 0x2f3029, emissiveIntensity: 0.025 }),
  mapRoadMajor: new THREE.LineBasicMaterial({ color: 0xf2bd5f, transparent: true, opacity: 0.9, depthTest: false, fog: false }),
  mapRoadMinor: new THREE.LineBasicMaterial({ color: 0xe1ded0, transparent: true, opacity: 0.76, depthTest: false, fog: false }),
  tunnelWall: standard(0x596263, { roughness: 0.86, side: THREE.DoubleSide }),
  tunnelRoof: standard(0x424b4d, { roughness: 0.9, side: THREE.DoubleSide }),
  crossingPaint: standard(0xf2ead2, { roughness: 0.74 }),
  path: standard(0x87907e, { roughness: 0.96 }),
  sidewalk: standard(0xa9aaa1, { roughness: 0.98 }),
  officialTrail: standard(0xb39b69, { roughness: 0.96 }),
  railway: standard(0x514b45, { roughness: 0.72, metalness: 0.2 }),
  bridge: standard(0x6f7977, { roughness: 0.62, metalness: 0.16 }),
  bridgeRail: standard(0x9a9f96, { roughness: 0.38, metalness: 0.3 }),
  water: standard(0x286b78, { roughness: 0.2, metalness: 0.06, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide }),
  park: standard(0x245e3d, { side: THREE.DoubleSide }),
  grass: standard(0x386c46, { side: THREE.DoubleSide }),
  residentialLand: standard(0x315b40, { side: THREE.DoubleSide }),
  commercialLand: standard(0x475a52, { side: THREE.DoubleSide }),
  industrialLand: standard(0x42534b, { side: THREE.DoubleSide }),
  parking: standard(0x3c4444, { roughness: 0.98, side: THREE.DoubleSide }),
  treeTrunk: standard(0x5c4730),
  treeCrown: standard(0x2a633c),
  treeCrownLight: standard(0x3b7750),
  treeConifer: standard(0x1d5538),
  lightPole: standard(0x495354, { roughness: 0.38, metalness: 0.48 }),
  signalHousing: standard(0x1b2020, { roughness: 0.46, metalness: 0.22 }),
  signalRed: new THREE.MeshStandardMaterial({ color: 0xdf4f40, emissive: 0x45100c, emissiveIntensity: 0.6, roughness: 0.42 }),
  signalGreen: new THREE.MeshStandardMaterial({ color: 0x4eb77a, emissive: 0x0d321c, emissiveIntensity: 0.42, roughness: 0.42 }),
  lampLens: new THREE.MeshStandardMaterial({ color: 0xffe7ad, emissive: 0xffc75c, emissiveIntensity: 0.12, roughness: 0.34 }),
  transitBlue: standard(0x2f6f98, { roughness: 0.54, metalness: 0.08 }),
  shelterGlass: standard(0x83aeb4, { roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.54, depthWrite: false }),
};

[
  ['residential', 'brick'], ['residentialBrick', 'brick'], ['civicBrick', 'brick'],
  ['residentialPale', 'masonry'], ['residentialSlate', 'masonry'], ['commercial', 'masonry'],
  ['industrial', 'masonry'], ['industrialMetal', 'masonry'], ['civic', 'masonry'], ['tower', 'masonry'],
  ['roofDark', 'roof'], ['roofClay', 'roof'], ['roofMetal', 'roof'],
  ['roadHighway', 'asphalt'], ['roadArterial', 'asphalt'], ['roadCollector', 'asphalt'],
  ['roadLocal', 'asphalt'], ['roadService', 'asphalt'], ['roadTunnel', 'asphalt'], ['officialRoad', 'asphalt'], ['parking', 'asphalt'],
  ['park', 'grass'], ['grass', 'grass'], ['residentialLand', 'grass'], ['water', 'water'],
].forEach(([materialKey, detailKind]) => installWorldSurfaceDetail(materials[materialKey], detailKind));
document.documentElement.dataset.verticalSliceQuality = 'downtown-little-lake-v1';
document.documentElement.dataset.qualityShadows = sun.castShadow ? 'pcf-soft-2048' : 'mobile-off';

function setProgress(percent, message) {
  els.loadingProgress.style.width = `${Math.max(4, Math.min(percent, 100))}%`;
  if (message) els.loadingMessage.textContent = message;
  globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.touch?.(message || `loading ${percent}%`);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function project(lat, lon) {
  const latScale = 110540;
  const lonScale = 111320 * Math.cos(THREE.MathUtils.degToRad(CITY.center.lat));
  return new THREE.Vector2((lon - CITY.center.lon) * lonScale, -(lat - CITY.center.lat) * latScale);
}

function unproject(x, z) {
  const latScale = 110540;
  const lonScale = 111320 * Math.cos(THREE.MathUtils.degToRad(CITY.center.lat));
  return {
    lat: CITY.center.lat - z / latScale,
    lon: CITY.center.lon + x / lonScale,
  };
}

function configureWorldBounds(bbox) {
  const keys = ['west', 'south', 'east', 'north'];
  if (!bbox || !keys.every((key) => Number.isFinite(Number(bbox[key])))) return false;

  const bounds = {
    west: Number(bbox.west),
    south: Number(bbox.south),
    east: Number(bbox.east),
    north: Number(bbox.north),
  };
  const corners = [
    project(bounds.south, bounds.west), project(bounds.south, bounds.east),
    project(bounds.north, bounds.west), project(bounds.north, bounds.east),
  ];
  const padding = 520;
  CITY.dataBounds = bounds;
  CITY.worldBounds = {
    minX: Math.min(...corners.map((point) => point.x)) - padding,
    maxX: Math.max(...corners.map((point) => point.x)) + padding,
    minZ: Math.min(...corners.map((point) => point.y)) - padding,
    maxZ: Math.max(...corners.map((point) => point.y)) + padding,
  };
  const width = CITY.worldBounds.maxX - CITY.worldBounds.minX;
  const depth = CITY.worldBounds.maxZ - CITY.worldBounds.minZ;
  CITY.terrainCenter = {
    x: (CITY.worldBounds.minX + CITY.worldBounds.maxX) / 2,
    z: (CITY.worldBounds.minZ + CITY.worldBounds.maxZ) / 2,
  };
  CITY.terrainSize = Math.max(width, depth);
  // Terrarium samples are roughly 26 m apart at this latitude. A ~58 m world
  // mesh keeps the broad city inexpensive while preserving Peterborough's
  // recognizable drumlins, river valley, and west-end grades far better than
  // the former ~92 m grid.
  CITY.terrainSegments = THREE.MathUtils.clamp(Math.ceil(CITY.terrainSize / 58), 192, 320);
  camera.far = Math.max(27000, CITY.terrainSize * 1.6);
  camera.updateProjectionMatrix();
  return true;
}

async function hydrateWorldBounds() {
  try {
    const response = await fetch(new URL('data/manifest.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) return false;
    const manifest = await response.json();
    const configured = configureWorldBounds(manifest?.bbox);
    if (configured) state.dataGeneratedAt = String(manifest.generated_at || '');
    state.manifest = manifest;
    return configured;
  } catch (error) {
    console.info('Using bundled full-city world bounds.', error);
    return false;
  }
}

function lonToTileX(lon, zoom) {
  return ((lon + 180) / 360) * (2 ** zoom);
}

function latToTileY(lat, zoom) {
  const radians = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(lat, -85.05112878, 85.05112878));
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * (2 ** zoom);
}

function decodeTerrariumPixel(data, index) {
  return data[index] * 256 + data[index + 1] + data[index + 2] / 256 - 32768;
}

function sampleTerrainElevation(lat, lon) {
  if (!terrain.available || !terrain.pixels) return terrain.baseElevation || 0;
  if (terrain.source === 'ontario-lidar-2025' && terrain.officialMetadata) {
    const officialElevation = sampleOfficialTerrainElevation(terrain.officialMetadata, terrain.pixels, lat, lon);
    return Number.isFinite(officialElevation) ? officialElevation : terrain.baseElevation || 0;
  }
  const px = (lonToTileX(lon, terrain.zoom) - terrain.minTileX) * 256;
  const py = (latToTileY(lat, terrain.zoom) - terrain.minTileY) * 256;
  const max = terrain.pixelsAcross - 1;
  const x = THREE.MathUtils.clamp(px, 0, max);
  const y = THREE.MathUtils.clamp(py, 0, max);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, max);
  const y1 = Math.min(y0 + 1, max);
  const tx = x - x0;
  const ty = y - y0;
  const stride = terrain.pixelsAcross * 4;
  const sample = (sx, sy) => decodeTerrariumPixel(terrain.pixels, sy * stride + sx * 4);
  const top = THREE.MathUtils.lerp(sample(x0, y0), sample(x1, y0), tx);
  const bottom = THREE.MathUtils.lerp(sample(x0, y1), sample(x1, y1), tx);
  return THREE.MathUtils.lerp(top, bottom, ty);
}

function terrainSourceHeightAtWorld(x, z) {
  if (!terrain.available) return 0;
  const geo = unproject(x, z);
  return (sampleTerrainElevation(geo.lat, geo.lon) - terrain.baseElevation) * CITY.terrainExaggeration;
}

function terrainHeightAtWorld(x, z) {
  const grid = terrain.renderGrid;
  if (!grid) return terrainSourceHeightAtWorld(x, z);
  return sampleTriangulatedTerrainHeight(grid, x, z);
}

function loadImage(url, timeoutMs = 14000) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => reject(new Error(`Terrain tile timed out: ${url}`)), timeoutMs);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Terrain tile failed: ${url}`));
    };
    image.src = url;
  });
}

async function loadPreparedOfficialTerrain() {
  const metadataFile = state.manifest?.terrain?.official?.metadata_file
    || 'terrain/peterborough-dtm-2025.json';
  const metadataUrl = new URL(`data/${metadataFile}`, import.meta.url);
  const assetVersion = state.manifest?.terrain?.official?.generated_at || state.manifest?.generated_at || 'v1.5.5';
  metadataUrl.searchParams.set('v', assetVersion);
  const metadataResponse = await fetch(metadataUrl, { cache: 'force-cache' });
  if (!metadataResponse.ok) throw new Error(`Official terrain metadata returned ${metadataResponse.status}`);
  const metadata = await metadataResponse.json();
  if (!validOfficialTerrainMetadata(metadata)) throw new Error('Official terrain metadata is invalid');

  const imageUrl = new URL(metadata.asset, metadataUrl);
  imageUrl.searchParams.set('v', assetVersion);
  const imageResponse = await fetch(imageUrl, { cache: 'force-cache' });
  if (!imageResponse.ok) throw new Error(`Official terrain heightmap returned ${imageResponse.status}`);
  const blob = await imageResponse.blob();
  const canvas = document.createElement('canvas');
  canvas.width = metadata.dimensions.width;
  canvas.height = metadata.dimensions.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas terrain decoding is unavailable');

  let drawable;
  let objectUrl = '';
  if (typeof createImageBitmap === 'function') {
    try {
      drawable = await createImageBitmap(blob, {
        colorSpaceConversion: 'none',
        imageOrientation: 'none',
        premultiplyAlpha: 'none',
      });
    } catch {
      drawable = await createImageBitmap(blob);
    }
  } else {
    objectUrl = URL.createObjectURL(blob);
    drawable = await loadImage(objectUrl);
  }

  try {
    context.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  } finally {
    drawable?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  terrain.source = 'ontario-lidar-2025';
  terrain.pixelWidth = canvas.width;
  terrain.pixelHeight = canvas.height;
  terrain.pixelsAcross = canvas.width;
  terrain.pixels = imageData.data;
  terrain.officialMetadata = metadata;
  terrain.available = true;
  terrain.baseElevation = sampleTerrainElevation(CITY.center.lat, CITY.center.lon);
  state.terrainAvailable = true;
  document.documentElement.dataset.terrainSource = terrain.source;
}

async function loadTerrainTiles() {
  const zoom = CITY.terrainZoom;
  const centerX = Math.floor(lonToTileX(CITY.center.lon, zoom));
  const centerY = Math.floor(latToTileY(CITY.center.lat, zoom));
  const radius = 1;
  const tilesAcross = radius * 2 + 1;
  const minTileX = centerX - radius;
  const minTileY = centerY - radius;
  const canvas = document.createElement('canvas');
  canvas.width = tilesAcross * 256;
  canvas.height = tilesAcross * 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas terrain decoding is unavailable');

  const jobs = [];
  for (let y = 0; y < tilesAcross; y += 1) {
    for (let x = 0; x < tilesAcross; x += 1) {
      const tileX = minTileX + x;
      const tileY = minTileY + y;
      const url = new URL(`data/terrain/${zoom}/${tileX}/${tileY}.png`, import.meta.url);
      jobs.push(loadImage(url).then((image) => context.drawImage(image, x * 256, y * 256, 256, 256)));
    }
  }
  await Promise.all(jobs);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

  terrain.zoom = zoom;
  terrain.minTileX = minTileX;
  terrain.minTileY = minTileY;
  terrain.tilesAcross = tilesAcross;
  terrain.pixelsAcross = canvas.width;
  terrain.pixelWidth = canvas.width;
  terrain.pixelHeight = canvas.height;
  terrain.pixels = imageData.data;
  terrain.source = 'terrarium-fallback';
  terrain.officialMetadata = null;
  terrain.available = true;
  terrain.baseElevation = sampleTerrainElevation(CITY.center.lat, CITY.center.lon);
  state.terrainAvailable = true;
  document.documentElement.dataset.terrainSource = terrain.source;
}

function configureTerrainMeshResolution() {
  const official = terrain.source === 'ontario-lidar-2025';
  const targetSpacing = official ? (lowPowerProfile ? 56 : 34) : 58;
  const maximumSegments = official ? (lowPowerProfile ? 340 : 560) : 320;
  CITY.terrainSegments = THREE.MathUtils.clamp(
    Math.ceil(CITY.terrainSize / targetSpacing),
    192,
    maximumSegments,
  );
  document.documentElement.dataset.terrainSegments = String(CITY.terrainSegments);
}

async function loadTerrain() {
  try {
    await loadPreparedOfficialTerrain();
  } catch (error) {
    console.info('Prepared Ontario lidar terrain is unavailable; using the bundled Terrarium fallback.', error);
    await loadTerrainTiles();
  }
  configureTerrainMeshResolution();
}

function disposeLandCoverRaster() {
  if (landCoverRaster.mesh) {
    terrainGroup.remove(landCoverRaster.mesh);
    landCoverRaster.mesh.geometry.dispose();
    landCoverRaster.mesh.material.dispose();
  }
  landCoverRaster.texture?.dispose();
  Object.assign(landCoverRaster, {
    canvas: null,
    context: null,
    texture: null,
    mesh: null,
    extent: null,
    entries: [],
    dirty: false,
    polygons: 0,
    rings: 0,
    vertices: 0,
  });
}

function initializeLandCoverRaster(terrainGeometry) {
  disposeLandCoverRaster();
  const dimension = lowPowerProfile ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = dimension;
  canvas.height = dimension;
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) {
    console.warn('Land-cover canvas is unavailable; continuing with the lidar terrain base.');
    return;
  }
  clearLandCoverRaster(context);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const geometry = terrainGeometry.clone();
  const positions = geometry.attributes.position;
  // The terrain base is 3.5 cm below the physical datum. Put land cover only
  // 2.5 cm above that base, leaving a measured clearance below roads and water.
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, positions.getY(index) + 0.025);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.98,
    metalness: 0,
    transparent: true,
    alphaTest: 0.015,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = !lowPowerProfile;
  mesh.renderOrder = -20;
  mesh.userData = { type: 'terrain-land-cover-raster', textureSize: dimension };
  terrainGroup.add(mesh);

  Object.assign(landCoverRaster, {
    canvas,
    context,
    texture,
    mesh,
    extent: {
      minX: terrain.renderGrid.minX,
      minZ: terrain.renderGrid.minZ,
      size: terrain.renderGrid.size,
    },
  });
  document.documentElement.dataset.landCoverRaster = `${dimension}x${dimension}`;
  state.objectCount += 1;
}

function flushLandCoverRaster() {
  if (!landCoverRaster.texture || !landCoverRaster.dirty) return;
  clearLandCoverRaster(landCoverRaster.context);
  landCoverRaster.polygons = 0;
  landCoverRaster.rings = 0;
  landCoverRaster.vertices = 0;

  const priority = {
    'residential-land': 10,
    'industrial-land': 20,
    'commercial-land': 30,
    grass: 40,
    wood: 45,
    park: 50,
    'official-city-park': 55,
    parking: 70,
    water: 100,
  };
  const entries = [...landCoverRaster.entries].sort((a, b) => {
    const priorityDifference = (priority[a.materialKey] ?? 35) - (priority[b.materialKey] ?? 35);
    if (priorityDifference) return priorityDifference;
    return a.sortKey.localeCompare(b.sortKey);
  });
  for (const entry of entries) {
    const result = paintLandCoverPolygon(landCoverRaster.context, entry.rings, {
      extent: landCoverRaster.extent,
      fillStyle: entry.fillStyle,
      opacity: entry.opacity,
    });
    if (!result.painted) continue;
    landCoverRaster.polygons += 1;
    landCoverRaster.rings += result.rings;
    landCoverRaster.vertices += result.vertices;
  }
  landCoverRaster.texture.needsUpdate = true;
  landCoverRaster.dirty = false;
  document.documentElement.dataset.landCoverPolygons = String(landCoverRaster.polygons);
  document.documentElement.dataset.landCoverVertices = String(landCoverRaster.vertices);
}

function createTerrainMesh(hydroSurfaceIndex = null) {
  const geometry = new THREE.PlaneGeometry(CITY.terrainSize, CITY.terrainSize, CITY.terrainSegments, CITY.terrainSegments);
  geometry.rotateX(-Math.PI / 2);
  // Keep the terrain square centered on the measured city extent rather than
  // assuming that the selected geographic bounding box is centered on origin.
  geometry.translate(CITY.terrainCenter.x, 0, CITY.terrainCenter.z);
  const positions = geometry.attributes.position;
  const renderHeights = new Float32Array(positions.count);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    // Keep every rendered system on the same physical datum. Roads and land
    // overlays use only centimetres of clearance, so the terrain must not be
    // artificially lowered by the former 1.2 m anti-z-fighting offset.
    let terrainY = terrainSourceHeightAtWorld(x, z);
    const waterY = hydroSurfaceIndex?.heightAt(x, z);
    if (Number.isFinite(waterY)) terrainY = Math.min(terrainY, waterY - WATER_TERRAIN_RECESS);
    const y = terrainY - 0.035;
    renderHeights[index] = terrainY;
    positions.setY(index, y);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  positions.needsUpdate = true;
  terrain.renderGrid = {
    heights: renderHeights,
    minX: CITY.terrainCenter.x - CITY.terrainSize / 2,
    minZ: CITY.terrainCenter.z - CITY.terrainSize / 2,
    segments: CITY.terrainSegments,
    size: CITY.terrainSize,
  };
  geometry.computeVertexNormals();
  terrain.minElevation = Number.isFinite(minY) ? minY : 0;
  terrain.maxElevation = Number.isFinite(maxY) ? maxY : 0;

  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color(0x183f2a);
  const high = new THREE.Color(0x5c6947);
  const range = Math.max(1, maxY - minY);
  for (let index = 0; index < positions.count; index += 1) {
    const t = THREE.MathUtils.clamp((positions.getY(index) - minY) / range, 0, 1);
    const color = low.clone().lerp(high, t * 0.65);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  mesh.receiveShadow = !lowPowerProfile;
  mesh.userData.type = 'terrain';
  terrainGroup.add(mesh);
  state.objectCount += 1;
  initializeLandCoverRaster(geometry);
}

function featureTags(feature) {
  const properties = feature?.properties || {};
  return properties.tags || properties;
}

function stableHash(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicNumber(seed, min, max) {
  const normalized = (stableHash(seed) % 10000) / 10000;
  return min + (max - min) * normalized;
}

function parseMeters(value) {
  if (value === undefined || value === null) return NaN;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const number = Number.parseFloat(match[0]);
  if (!Number.isFinite(number)) return NaN;
  if (/ft|feet|foot|'/i.test(String(value))) return number * 0.3048;
  return number;
}

function buildingDimensions(tags = {}, featureId = '') {
  const reviewedStyle = REVIEWED_BUILDING_STYLES[featureId];
  if (reviewedStyle) {
    return {
      height: reviewedStyle.wallHeight,
      minHeight: 0,
      roofHeight: reviewedStyle.roofHeight,
      roofShape: reviewedStyle.roofShape,
    };
  }
  const explicitHeight = parseMeters(tags.height);
  const landmarkBaseHeight = Number(LANDMARK_BUILDING_HEIGHT_OVERRIDES[featureId]);
  const levels = Number.parseFloat(tags['building:levels']);
  const roofHeightTag = parseMeters(tags['roof:height']);
  const minHeightTag = parseMeters(tags.min_height);
  const minLevels = Number.parseFloat(tags['building:min_level']);
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const use = `${type} ${tags.leisure || ''} ${tags.amenity || ''}`.toLowerCase();
  let height;
  if (Number.isFinite(landmarkBaseHeight)) height = landmarkBaseHeight;
  else if (Number.isFinite(explicitHeight)) height = explicitHeight;
  else if (Number.isFinite(levels)) height = levels * 3.15;
  else if (/church|cathedral|mosque|temple/.test(type)) height = 18 + deterministicNumber(featureId, 0, 8);
  else if (/apartments|hotel|office|commercial|hospital|school|university/.test(type)) height = deterministicNumber(featureId, 11, 23);
  else if (/industrial|warehouse|retail|supermarket/.test(type)) height = deterministicNumber(featureId, 7, 12);
  else if (/garage|shed|carport/.test(type)) height = deterministicNumber(featureId, 2.7, 4.2);
  // OSM carries height metadata for only a minority of local footprints. Keep
  // inferred detached-building massing deliberately conservative rather than
  // making an unsupported claim of precise height.
  else height = deterministicNumber(featureId, 6.4, 8.8);

  const minHeight = Number.isFinite(minHeightTag) ? minHeightTag : Number.isFinite(minLevels) ? minLevels * 3.15 : 0;
  const taggedRoofShape = String(tags['roof:shape'] || '').toLowerCase();
  const pitchedCandidate = !/industrial|warehouse|retail|supermarket|commercial|office|apartments|hospital|school|university|garage|shed|carport|ice_rink|sports_centre|stadium/.test(use)
    && !/flat|skillion|sawtooth/.test(taggedRoofShape);
  // Detached homes dominate Peterborough's residential fabric. OSM rarely
  // records roof height, so infer a conservative, stable pitch while keeping
  // every source footprint and all explicit tags authoritative.
  const inferredRoofHeight = pitchedCandidate ? deterministicNumber(`${featureId}:roof`, 1.25, 2.35) : 0;
  const roofHeight = Number.isFinite(roofHeightTag) ? roofHeightTag : inferredRoofHeight;
  const roofShape = taggedRoofShape || (pitchedCandidate
    ? (stableHash(`${featureId}:roof-shape`) % 5 === 0 ? 'hipped' : 'gabled')
    : 'flat');
  return {
    height: THREE.MathUtils.clamp(Math.max(2.6, height - roofHeight - minHeight), 2.6, 115),
    minHeight: THREE.MathUtils.clamp(minHeight, 0, 60),
    roofHeight: THREE.MathUtils.clamp(roofHeight, 0, 18),
    roofShape,
  };
}

function buildingMaterialKey(tags, totalHeight, featureId = '') {
  if (REVIEWED_BUILDING_STYLES[featureId]?.wallMaterial) return REVIEWED_BUILDING_STYLES[featureId].wallMaterial;
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const amenity = String(tags.amenity || '').toLowerCase();
  const leisure = String(tags.leisure || '').toLowerCase();
  const colour = String(tags['building:colour'] || tags.colour || tags.color || '').toLowerCase();
  if (totalHeight > 30) return 'tower';
  if (/industrial|warehouse|manufacture/.test(type) || tags.landuse === 'industrial') {
    return /metal|silver|grey|gray|white/.test(colour) ? 'industrialMetal' : 'industrial';
  }
  if (/retail|commercial|office|hotel|supermarket/.test(type)) {
    return /glass|blue|cyan/.test(colour) ? 'commercialGlass' : 'commercial';
  }
  if (/school|college|university|hospital|church|cathedral|civic|public/.test(type) || amenity || /ice_rink|sports_centre|stadium/.test(leisure)) {
    return /brick|red|brown/.test(colour) ? 'civicBrick' : 'civic';
  }
  if (/red|brown|brick|maroon/.test(colour)) return 'residentialBrick';
  if (/white|cream|beige|yellow/.test(colour)) return 'residentialPale';
  if (/grey|gray|blue|slate/.test(colour)) return 'residentialSlate';
  // Most Peterborough homes have no colour tag. Stable source-ID variation
  // creates block-to-block brick/siding variety without changing between runs.
  const variant = stableHash(featureId) % 10;
  if (variant < 4) return 'residentialBrick';
  if (variant < 7) return 'residentialPale';
  if (variant === 7) return 'residentialSlate';
  return 'residential';
}

function roofMaterialKey(tags, wallMaterialKey) {
  const colour = String(tags['roof:colour'] || tags['roof:color'] || '').toLowerCase();
  const material = String(tags['roof:material'] || '').toLowerCase();
  if (/red|brown|clay|tile/.test(colour) || /tile|clay/.test(material)) return 'roofClay';
  if (/metal|steel|aluminium|aluminum/.test(colour) || /metal|steel|aluminium|aluminum/.test(material)) return 'roofMetal';
  if (wallMaterialKey === 'industrialMetal' || wallMaterialKey === 'commercialGlass') return 'roofMetal';
  return 'roofDark';
}

function simplifyRing(points, tolerance = 0.75, maxPoints = 100) {
  if (points.length <= 4) return points;
  const simplified = [points[0]];
  let last = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    if (points[index].distanceTo(last) >= tolerance) {
      simplified.push(points[index]);
      last = points[index];
    }
  }
  simplified.push(points[points.length - 1]);
  if (simplified.length <= maxPoints) return simplified;
  const stride = Math.ceil(simplified.length / maxPoints);
  return simplified.filter((_, index) => index % stride === 0 || index === simplified.length - 1);
}

function coordinatesToRing(coordinates) {
  return simplifyRing(
    coordinates
      .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
      .map(([lon, lat]) => {
        const p = project(lat, lon);
        return new THREE.Vector2(p.x, p.y);
      }),
    0.72,
    110,
  );
}

function shapeFromRings(rings) {
  if (!rings.length || rings[0].length < 4) return null;
  const outer = rings[0];
  const shape = new THREE.Shape();
  shape.moveTo(outer[0].x, -outer[0].y);
  for (let index = 1; index < outer.length; index += 1) shape.lineTo(outer[index].x, -outer[index].y);
  shape.closePath();

  rings.slice(1).forEach((holeRing) => {
    if (holeRing.length < 4) return;
    const hole = new THREE.Path();
    hole.moveTo(holeRing[0].x, -holeRing[0].y);
    for (let index = 1; index < holeRing.length; index += 1) hole.lineTo(holeRing[index].x, -holeRing[index].y);
    hole.closePath();
    shape.holes.push(hole);
  });
  return shape;
}

function polygonCentroid(ring) {
  if (!ring.length) return new THREE.Vector2();
  let x = 0;
  let z = 0;
  for (const point of ring) {
    x += point.x;
    z += point.y;
  }
  return new THREE.Vector2(x / ring.length, z / ring.length);
}

function polygonArea(ring) {
  let sum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    sum += ring[index].x * ring[index + 1].y - ring[index + 1].x * ring[index].y;
  }
  return Math.abs(sum / 2);
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, rings) {
  if (!rings.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((hole) => pointInRing(point, hole));
}

function geometryPolygons(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function geometryLines(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function geometryPoints(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'MultiPoint') return geometry.coordinates;
  return [];
}

function createFootprintCentroidIndex(cellSize = 80) {
  const cells = new Map();
  const add = (rings) => {
    if (!rings?.[0]?.length) return;
    const outer = rings[0];
    const bounds = {
      minX: Math.min(...outer.map((point) => point.x)),
      maxX: Math.max(...outer.map((point) => point.x)),
      minZ: Math.min(...outer.map((point) => point.y)),
      maxZ: Math.max(...outer.map((point) => point.y)),
    };
    const entry = { bounds, rings };
    for (let cellX = Math.floor(bounds.minX / cellSize); cellX <= Math.floor(bounds.maxX / cellSize); cellX += 1) {
      for (let cellZ = Math.floor(bounds.minZ / cellSize); cellZ <= Math.floor(bounds.maxZ / cellSize); cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(entry);
      }
    }
  };
  return {
    add,
    contains(x, z, tolerance = 4.5) {
      const cellX = Math.floor(x / cellSize);
      const cellZ = Math.floor(z / cellSize);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
          for (const entry of cells.get(`${cellX + offsetX}:${cellZ + offsetZ}`) || []) {
            if (x < entry.bounds.minX - tolerance || x > entry.bounds.maxX + tolerance
              || z < entry.bounds.minZ - tolerance || z > entry.bounds.maxZ + tolerance) continue;
            const point = new THREE.Vector2(x, z);
            if (pointInPolygon(point, entry.rings)) return true;
            const toleranceSquared = tolerance * tolerance;
            for (const ring of entry.rings) {
              for (let index = 0; index < ring.length; index += 1) {
                const a = ring[index];
                const b = ring[(index + 1) % ring.length];
                const dx = b.x - a.x;
                const dz = b.y - a.y;
                const lengthSquared = dx * dx + dz * dz;
                const t = lengthSquared > 0.000001
                  ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.y) * dz) / lengthSquared, 0, 1)
                  : 0;
                const nearestX = a.x + dx * t;
                const nearestZ = a.y + dz * t;
                if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 <= toleranceSquared) return true;
              }
            }
          }
        }
      }
      return false;
    },
  };
}

async function loadOfficialHydrography() {
  const file = state.manifest?.hydrography?.file || 'peterborough-hydrography.geojson';
  const url = new URL(`data/${file}`, import.meta.url);
  if (state.manifest?.generated_at) url.searchParams.set('v', state.manifest.generated_at);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Official hydrography returned ${response.status}`);
  const collection = await response.json();
  if (!Array.isArray(collection?.features)) throw new Error('Official hydrography is not a GeoJSON FeatureCollection');
  state.officialHydroAvailable = collection.features.length > 0;
  return collection;
}

function prepareHydrography(collection) {
  const surfaceIndex = new HydroSurfaceIndex(120);
  const positions = [];
  const watercourses = [];
  let polygonCount = 0;

  for (const feature of collection?.features || []) {
    const properties = feature.properties || {};
    if (properties.source_kind === 'ohn_watercourse') {
      watercourses.push(feature);
      continue;
    }
    if (!['lidar_breakline', 'ohn_waterbody'].includes(properties.source_kind)) continue;

    for (const polygonCoordinates of geometryPolygons(feature)) {
      const terrainSamples = polygonCoordinates.flatMap((ring) => ring
        .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
        .map(([lon, lat]) => {
          const point = project(lat, lon);
          return terrainSourceHeightAtWorld(point.x, point.y);
        }));
      const fallbackHeight = robustFallbackWaterHeight(terrainSamples);
      const rings = polygonCoordinates.map((coordinates) => {
        const points = coordinates
          .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
          .map(([lon, lat, absoluteElevation]) => {
          const point = project(lat, lon);
          const officialHeight = relativeWaterElevation(absoluteElevation, terrain.available ? terrain.baseElevation : 200);
          return { x: point.x, z: point.y, y: Number.isFinite(officialHeight) ? officialHeight : fallbackHeight };
          });
        if (points.length > 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) < 0.01) points.pop();
        return points;
      });
      if (!rings[0] || rings[0].length < 3) continue;

      let contour = rings[0];
      let contour2d = contour.map((point) => new THREE.Vector2(point.x, point.z));
      if (!THREE.ShapeUtils.isClockWise(contour2d)) {
        contour = contour.slice().reverse();
        contour2d = contour2d.slice().reverse();
      }
      const holes = [];
      const holes2d = [];
      for (const sourceHole of rings.slice(1)) {
        if (sourceHole.length < 3) continue;
        let hole = sourceHole;
        let hole2d = hole.map((point) => new THREE.Vector2(point.x, point.z));
        if (THREE.ShapeUtils.isClockWise(hole2d)) {
          hole = hole.slice().reverse();
          hole2d = hole2d.slice().reverse();
        }
        holes.push(hole);
        holes2d.push(hole2d);
      }

      const faces = THREE.ShapeUtils.triangulateShape(contour2d, holes2d);
      const vertices = contour.concat(...holes);
      const authoritativeStages = vertices.map((vertex) => vertex.y).filter(Number.isFinite);
      const stageRange = authoritativeStages.length ? Math.max(...authoritativeStages) - Math.min(...authoritativeStages) : 0;
      const stageSampler = createWaterStageSampler([contour, ...holes], { fallbackHeight, sampleSpacing: 30, cellSize: 90 });
      for (const face of faces) {
        const a = vertices[face[0]];
        const b = vertices[face[1]];
        const c = vertices[face[2]];
        if (!a || !b || !c) continue;
        // Multi-stage lidar polygons around the lift locks contain valid but
        // very long triangulation chords. Split those faces and derive new
        // vertices from nearby stage samples so water does not become a
        // kilometre-long diagonal ramp. Flat ponds remain at original cost.
        const triangles = stageRange > 0.35
          ? subdivideWaterTriangle(a, b, c, stageSampler, { maximumEdge: 72, maximumTriangles: 4096 })
          : [[a, b, c]];
        for (const triangle of triangles) {
          const [first, second, third] = triangle;
          positions.push(first.x, first.y, first.z, second.x, second.y, second.z, third.x, third.y, third.z);
          surfaceIndex.addTriangle(first, second, third);
        }
      }
      polygonCount += 1;
    }
  }
  return { positions, surfaceIndex, watercourses, polygonCount };
}

function appendWatercourseRibbon(target, a, b, width, surfaceIndex) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.35) return;
  const halfWidth = width / 2;
  const nx = -dz / length * halfWidth;
  const nz = dx / length * halfWidth;
  const indexedA = surfaceIndex.heightAt(a.x, a.z);
  const indexedB = surfaceIndex.heightAt(b.x, b.z);
  const aY = Number.isFinite(indexedA) ? indexedA + 0.012 : terrainHeightAtWorld(a.x, a.z) + WATER_SURFACE_CLEARANCE;
  const bY = Number.isFinite(indexedB) ? indexedB + 0.012 : terrainHeightAtWorld(b.x, b.z) + WATER_SURFACE_CLEARANCE;
  target.push(
    a.x + nx, aY, a.z + nz, a.x - nx, aY, a.z - nz, b.x + nx, bY, b.z + nz,
    a.x - nx, aY, a.z - nz, b.x - nx, bY, b.z - nz, b.x + nx, bY, b.z + nz,
  );
}

function coordinatesToLandRing(coordinates) {
  const ring = [];
  for (const coordinate of coordinates || []) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
    const [lon, lat] = coordinate;
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) continue;
    const point = project(Number(lat), Number(lon));
    if (ring.length && point.distanceToSquared(ring.at(-1)) < 0.000001) continue;
    ring.push(point);
  }
  return ring;
}

function buildOfficialHydrography(prepared) {
  if (prepared.positions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(prepared.positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.water);
    mesh.userData = { type: 'official-staged-water', polygons: prepared.polygonCount, triangles: prepared.positions.length / 9 };
    terrainGroup.add(mesh);
  }

  const streamPositions = [];
  for (const feature of prepared.watercourses) {
    const width = watercourseWidth(feature.properties || {});
    for (const line of geometryLines(feature)) {
      const points = line
        .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
        .map(([lon, lat]) => {
          const point = project(lat, lon);
          return { x: point.x, z: point.y };
        });
      for (let index = 1; index < points.length; index += 1) {
        appendWatercourseRibbon(streamPositions, points[index - 1], points[index], width, prepared.surfaceIndex);
      }
    }
  }
  if (streamPositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(streamPositions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.water);
    mesh.userData = { type: 'official-watercourses', features: prepared.watercourses.length, triangles: streamPositions.length / 9 };
    terrainGroup.add(mesh);
  }
  state.officialHydroCount = prepared.polygonCount + prepared.watercourses.length;
  state.objectCount += state.officialHydroCount;
}

function createBuildingGeometry(rings, tags, featureId) {
  const shape = shapeFromRings(rings);
  if (!shape) return null;
  const dimensions = buildingDimensions(tags, featureId);
  const centroid = polygonCentroid(rings[0]);
  const baseY = terrainHeightAtWorld(centroid.x, centroid.y) + dimensions.minHeight;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: dimensions.height,
    bevelEnabled: false,
    curveSegments: 1,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, baseY, 0);
  geometry.computeVertexNormals();
  return {
    geometry,
    materialKey: buildingMaterialKey(tags, dimensions.height + dimensions.minHeight + dimensions.roofHeight, featureId),
  };
}

/*
  BUILDING BUFFER BATCHER

  The original prototype made one ExtrudeGeometry per footprint and stopped
  after 6,500 objects. Peterborough's prepared extract contains about 30,000
  building footprints, so v1.5.5 builds direct position buffers instead. This
  keeps every source footprint while reducing temporary geometry allocations
  and draw calls to a small, material-based set of meshes.
*/
function createBuildingBufferBatches() {
  return new Map();
}

function cleanRing(ring) {
  if (!ring?.length) return [];
  const cleaned = ring.slice();
  const first = cleaned[0];
  const last = cleaned[cleaned.length - 1];
  if (cleaned.length > 1 && first.distanceToSquared(last) < 0.0001) cleaned.pop();
  return cleaned.length >= 3 ? cleaned : [];
}

function renderTileCoordinates(x, z) {
  return {
    x: Math.floor((x - CITY.worldBounds.minX) / RENDER_TILE_SIZE),
    z: Math.floor((z - CITY.worldBounds.minZ) / RENDER_TILE_SIZE),
  };
}

function batchPositions(batches, materialKey, anchor) {
  const tile = renderTileCoordinates(anchor.x, anchor.y);
  const key = `${tile.x}:${tile.z}:${materialKey}`;
  if (!batches.has(key)) batches.set(key, { materialKey, tile, positions: [] });
  return batches.get(key).positions;
}

function appendTriangle(target, a, b, c) {
  target.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function appendQuad(target, a, b, c, d) {
  appendTriangle(target, a, b, c);
  appendTriangle(target, a, c, d);
}

function appendPitchedRoof(target, outer, wallTop, roofTop, roofShape) {
  if (outer.length !== 4) return false;
  const points = outer.map((point) => new THREE.Vector3(point.x, wallTop, point.y));
  if (/hip|pyramid/.test(roofShape)) {
    const peak = new THREE.Vector3(
      points.reduce((sum, point) => sum + point.x, 0) / 4,
      roofTop,
      points.reduce((sum, point) => sum + point.z, 0) / 4,
    );
    for (let index = 0; index < 4; index += 1) appendTriangle(target, points[index], points[(index + 1) % 4], peak);
    return true;
  }

  const edge01 = points[0].distanceTo(points[1]);
  const edge12 = points[1].distanceTo(points[2]);
  if (edge01 >= edge12) {
    const ridgeA = new THREE.Vector3().addVectors(points[0], points[3]).multiplyScalar(0.5); ridgeA.y = roofTop;
    const ridgeB = new THREE.Vector3().addVectors(points[1], points[2]).multiplyScalar(0.5); ridgeB.y = roofTop;
    appendQuad(target, points[0], points[1], ridgeB, ridgeA);
    appendQuad(target, points[2], points[3], ridgeA, ridgeB);
    appendTriangle(target, points[3], points[0], ridgeA);
    appendTriangle(target, points[1], points[2], ridgeB);
  } else {
    const ridgeA = new THREE.Vector3().addVectors(points[0], points[1]).multiplyScalar(0.5); ridgeA.y = roofTop;
    const ridgeB = new THREE.Vector3().addVectors(points[3], points[2]).multiplyScalar(0.5); ridgeB.y = roofTop;
    appendQuad(target, points[1], points[2], ridgeB, ridgeA);
    appendQuad(target, points[3], points[0], ridgeA, ridgeB);
    appendTriangle(target, points[0], points[1], ridgeA);
    appendTriangle(target, points[2], points[3], ridgeB);
  }
  return true;
}

function appendRingWalls(target, ring, bottomHeights, lowerHeight, upperHeight) {
  for (let index = 0; index < ring.length; index += 1) {
    const next = (index + 1) % ring.length;
    const a = ring[index];
    const b = ring[next];
    const aBottom = new THREE.Vector3(a.x, bottomHeights ? bottomHeights[index] : lowerHeight, a.y);
    const bBottom = new THREE.Vector3(b.x, bottomHeights ? bottomHeights[next] : lowerHeight, b.y);
    const aTop = new THREE.Vector3(a.x, upperHeight, a.y);
    const bTop = new THREE.Vector3(b.x, upperHeight, b.y);
    appendTriangle(target, aBottom, bBottom, bTop);
    appendTriangle(target, aBottom, bTop, aTop);
  }
}

const FACADE_DETAIL_QUAD_LIMIT = lowPowerProfile ? 32000 : 132000;
let facadeDetailQuads = 0;

function appendFacadePanel(target, a, b, center, t, width, lowerY, upperY) {
  if (facadeDetailQuads >= FACADE_DETAIL_QUAD_LIMIT || upperY - lowerY < 0.35) return false;
  const dx = b.x - a.x;
  const dz = b.y - a.y;
  const length = Math.hypot(dx, dz);
  if (length < 0.1) return false;
  const alongX = dx / length;
  const alongZ = dz / length;
  const middleX = THREE.MathUtils.lerp(a.x, b.x, t);
  const middleZ = THREE.MathUtils.lerp(a.y, b.y, t);
  let outwardX = middleX - center.x;
  let outwardZ = middleZ - center.y;
  const outwardLength = Math.hypot(outwardX, outwardZ) || 1;
  outwardX = outwardX / outwardLength * 0.035;
  outwardZ = outwardZ / outwardLength * 0.035;
  const half = width / 2;
  const left = new THREE.Vector3(middleX - alongX * half + outwardX, lowerY, middleZ - alongZ * half + outwardZ);
  const right = new THREE.Vector3(middleX + alongX * half + outwardX, lowerY, middleZ + alongZ * half + outwardZ);
  appendQuad(
    target,
    left,
    right,
    new THREE.Vector3(right.x, upperY, right.z),
    new THREE.Vector3(left.x, upperY, left.z),
  );
  facadeDetailQuads += 1;
  return true;
}

function appendBuildingFacadeDetails(outer, tags, featureId, foundationTop, wallTop, dimensions, batches, anchor) {
  if (facadeDetailQuads >= FACADE_DETAIL_QUAD_LIMIT || dimensions.height < 3.1) return;
  const detailClass = facadeDetailClass(tags);
  if (detailClass === 'none') return;
  const area = Math.abs(THREE.ShapeUtils.area(outer));
  if (area < 18) return;

  // Keep detail distributed across the entire city instead of exhausting the
  // GPU budget on the first neighbourhood in the OSM file. Commercial and
  // industrial fronts remain fully represented; homes use a stable sample.
  if (detailClass === 'windows') {
    const coverage = lowPowerProfile ? 14 : 42;
    if (stableHash(`${featureId}:facade-coverage`) % 100 >= coverage) return;
  }

  const floorCount = estimatedBuildingFloors(tags, dimensions.height);
  const visibleFloors = detailClass === 'storefront'
    ? Math.min(8, floorCount)
    : detailClass === 'industrial' ? 1 : Math.min(2, floorCount);
  const firstWindowFloor = detailClass === 'storefront' ? 1 : 0;

  for (let edge = 0; edge < outer.length && facadeDetailQuads < FACADE_DETAIL_QUAD_LIMIT; edge += 1) {
    const a = outer[edge];
    const b = outer[(edge + 1) % outer.length];
    const length = a.distanceTo(b);
    if (length < 3.1 || length > 135) continue;
    const sideMargin = Math.min(1.05, length * 0.18);
    const usable = length - sideMargin * 2;
    if (usable < 1.1) continue;
    const columnCount = detailClass === 'industrial'
      ? Math.max(1, Math.min(5, Math.floor(usable / 5.8)))
      : Math.max(1, Math.min(detailClass === 'storefront' ? 12 : 3, Math.floor(usable / 2.55)));
    const panelWidth = Math.min(detailClass === 'storefront' ? 2.45 : 1.28, usable / columnCount * 0.7);

    if (detailClass === 'storefront') {
      const storefrontPositions = batchPositions(batches, 'storefrontGlass', anchor);
      for (let column = 0; column < columnCount; column += 1) {
        const t = (sideMargin + usable * (column + 0.5) / columnCount) / length;
        appendFacadePanel(storefrontPositions, a, b, anchor, t, panelWidth, foundationTop + 0.38, Math.min(wallTop - 0.28, foundationTop + 2.72));
      }
      // A continuous lintel and roofline cornice give downtown blocks readable
      // floor depth at street level instead of leaving windows pasted onto a
      // single flat wall plane.
      const trimPositions = batchPositions(batches, 'facadeTrim', anchor);
      appendFacadePanel(
        trimPositions,
        a,
        b,
        anchor,
        0.5,
        usable * 0.96,
        Math.min(wallTop - 0.22, foundationTop + 2.82),
        Math.min(wallTop - 0.06, foundationTop + 3.08),
      );
      if (wallTop - foundationTop > 5.2) {
        appendFacadePanel(trimPositions, a, b, anchor, 0.5, usable * 0.98, wallTop - 0.42, wallTop - 0.14);
      }
    }

    for (let floor = firstWindowFloor; floor < visibleFloors && facadeDetailQuads < FACADE_DETAIL_QUAD_LIMIT; floor += 1) {
      const lowerY = foundationTop + 1.05 + floor * 3.15;
      const upperY = Math.min(wallTop - 0.34, lowerY + (detailClass === 'industrial' ? 1.55 : 1.28));
      if (upperY - lowerY < 0.45) continue;
      const materialKey = stableHash(`${featureId}:${edge}:${floor}`) % 7 === 0 ? 'windowWarm' : 'windowGlass';
      const windowPositions = batchPositions(batches, materialKey, anchor);
      for (let column = 0; column < columnCount; column += 1) {
        const t = (sideMargin + usable * (column + 0.5) / columnCount) / length;
        appendFacadePanel(windowPositions, a, b, anchor, t, panelWidth, lowerY, upperY);
      }
    }
  }
}

function appendBufferedBuilding(rings, tags, featureId, batches) {
  const outer = cleanRing(rings[0]);
  if (!outer.length) return false;
  const holes = rings.slice(1).map(cleanRing).filter((ring) => ring.length);
  const dimensions = buildingDimensions(tags, featureId);
  const allVertices = outer.concat(...holes);
  const groundHeights = allVertices.map((point) => terrainHeightAtWorld(point.x, point.y) + dimensions.minHeight);
  const foundationTop = Math.max(...groundHeights);
  const wallTop = foundationTop + dimensions.height;
  const roofTop = wallTop + dimensions.roofHeight;
  const anchor = polygonCentroid(outer);
  const wallKey = buildingMaterialKey(tags, dimensions.height + dimensions.minHeight + dimensions.roofHeight, featureId);
  const roofKey = roofMaterialKey(tags, wallKey);
  const wallPositions = batchPositions(batches, wallKey, anchor);
  const roofPositions = batchPositions(batches, roofKey, anchor);

  if (landmarkBuildingReferences.has(featureId)) {
    const placement = createBuildingFootprintPlacement(featureId, [outer, ...holes], foundationTop);
    if (placement) {
      const existing = state.landmarkBuildingPlacements.get(featureId) || [];
      existing.push(placement);
      state.landmarkBuildingPlacements.set(featureId, existing);
    }
  }

  let groundOffset = 0;
  appendRingWalls(wallPositions, outer, groundHeights.slice(groundOffset, groundOffset + outer.length), foundationTop, wallTop);
  groundOffset += outer.length;
  holes.forEach((hole) => {
    appendRingWalls(wallPositions, hole, groundHeights.slice(groundOffset, groundOffset + hole.length), foundationTop, wallTop);
    groundOffset += hole.length;
  });

  const outerArea = Math.abs(THREE.ShapeUtils.area(outer));
  const buildingUse = `${tags.building || ''} ${tags.amenity || ''} ${tags.shop || ''} ${tags.office || ''}`.toLowerCase();
  if (!lowPowerProfile
    && worldPointInVerticalSlice(anchor.x, anchor.y, verticalSliceBounds)
    && !landmarkBuildingReferences.has(featureId)
    && outerArea >= 240
    && dimensions.height >= 5.8
    && /commercial|retail|office|industrial|warehouse|supermarket|civic|school|hospital|yes/.test(buildingUse)
    && stableHash(`${featureId}:rooftop-unit`) % 100 < 68) {
    const unitCount = outerArea > 1900 ? 2 : 1;
    for (let index = 0; index < unitCount; index += 1) {
      const width = THREE.MathUtils.clamp(Math.sqrt(outerArea) * 0.105, 2.4, 6.8);
      const depth = width * deterministicNumber(`${featureId}:unit-depth:${index}`, 0.58, 0.88);
      const offset = index === 0 ? 0 : width * 0.82;
      const candidate = new THREE.Vector2(
        anchor.x + Math.cos(deterministicNumber(`${featureId}:unit-angle`, 0, Math.PI * 2)) * offset,
        anchor.y + Math.sin(deterministicNumber(`${featureId}:unit-angle`, 0, Math.PI * 2)) * offset,
      );
      const position = pointInPolygon(candidate, [outer, ...holes]) ? candidate : anchor;
      verticalSliceDetails.rooftopUnits.push({
        x: position.x,
        z: position.y,
        y: roofTop,
        width,
        depth,
        height: deterministicNumber(`${featureId}:unit-height:${index}`, 0.65, 1.45),
        yaw: deterministicNumber(`${featureId}:unit-yaw:${index}`, 0, Math.PI),
      });
    }
  }
  const pitchedRoof = dimensions.roofHeight > 0.3 && !holes.length && outerArea <= 1600
    && appendPitchedRoof(roofPositions, outer, wallTop, roofTop, dimensions.roofShape);

  // Complex tagged roofs retain a simplified roof volume. Simple four-corner
  // homes receive actual gabled or hipped planes instead of flat dark slabs.
  if (!pitchedRoof && dimensions.roofHeight > 0.05) {
    appendRingWalls(roofPositions, outer, null, wallTop, roofTop);
    holes.forEach((hole) => appendRingWalls(roofPositions, hole, null, wallTop, roofTop));
  }

  if (!pitchedRoof) try {
    const faces = THREE.ShapeUtils.triangulateShape(outer, holes);
    const vertices = allVertices;
    faces.forEach(([a, b, c]) => {
      const first = vertices[a];
      const second = vertices[b];
      const third = vertices[c];
      if (!first || !second || !third) return;
      appendTriangle(
        roofPositions,
        new THREE.Vector3(first.x, roofTop, first.y),
        new THREE.Vector3(third.x, roofTop, third.y),
        new THREE.Vector3(second.x, roofTop, second.y),
      );
    });
  } catch (error) {
    // A few invalid source rings cannot be triangulated. Their vertical mass is
    // still retained, and the rest of the city continues to load.
    console.debug('Skipped invalid building roof triangulation', featureId, error);
  }
  if (!REVIEWED_BUILDING_STYLES[featureId]?.customFacade) {
    appendBuildingFacadeDetails(outer, tags, featureId, foundationTop, wallTop, dimensions, batches, anchor);
  }
  return true;
}

function buildBufferedBuildingBatches(batches) {
  batches.forEach(({ positions, materialKey, tile }) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[materialKey] || materials.residential);
    mesh.userData = { type: 'building-batch', material: materialKey, tile, tileSize: RENDER_TILE_SIZE, vertices: positions.length / 3 };
    mesh.receiveShadow = !lowPowerProfile;
    mesh.castShadow = !lowPowerProfile && worldPointInVerticalSlice(
      geometry.boundingSphere.center.x,
      geometry.boundingSphere.center.z,
      verticalSliceShadowBounds,
    );
    buildingGroup.add(mesh);
  });
  document.documentElement.dataset.facadePanels = String(facadeDetailQuads);
}

function buildVerticalSliceRooftopEquipment() {
  if (verticalSliceDetails.built || !verticalSliceDetails.rooftopUnits.length || lowPowerProfile) return;
  verticalSliceDetails.built = true;
  const units = verticalSliceDetails.rooftopUnits;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.roofEquipment, units.length);
  const dummy = new THREE.Object3D();
  units.forEach((unit, index) => {
    dummy.position.set(unit.x, unit.y + unit.height / 2, unit.z);
    dummy.rotation.set(0, unit.yaw, 0);
    dummy.scale.set(unit.width, unit.height, unit.depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'vertical-slice-rooftop-equipment', count: units.length };
  buildingGroup.add(mesh);
  document.documentElement.dataset.verticalSliceRooftopUnits = String(units.length);
  state.objectCount += units.length;
}

function mergeBuildingBatches(batches) {
  const chunkSize = 240;
  Object.entries(batches).forEach(([materialKey, geometries]) => {
    for (let start = 0; start < geometries.length; start += chunkSize) {
      const chunk = geometries.slice(start, start + chunkSize);
      const merged = mergeGeometries(chunk, false);
      chunk.forEach((geometry) => geometry.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[materialKey] || materials.residential);
      mesh.userData = { type: 'building-batch', count: chunk.length };
      buildingGroup.add(mesh);
    }
  });
}

function createLandBufferBatches() {
  return [];
}

function addLandPolygon(rings, material, options = {}) {
  if (!landCoverRaster.context || !Array.isArray(rings) || !rings.some((ring) => ring.length >= 3)) return false;
  const materialKey = options.materialKey || options.type || material.uuid;
  const first = rings[0]?.[0] || { x: 0, y: 0 };
  const entry = {
    rings,
    materialKey,
    fillStyle: material?.color ? `#${material.color.getHexString()}` : '#4b654d',
    opacity: material?.transparent ? material.opacity : 1,
    sortKey: `${materialKey}:${first.x.toFixed(3)}:${first.y.toFixed(3)}:${rings[0]?.length || 0}`,
  };
  if (Array.isArray(options.batches)) options.batches.push(entry);
  else landCoverRaster.entries.push(entry);
  landCoverRaster.dirty = true;
  state.objectCount += 1;
  return true;
}

function buildBufferedLandBatches(batches) {
  if (!Array.isArray(batches) || !batches.length) return;
  landCoverRaster.entries.push(...batches);
  landCoverRaster.dirty = true;
}

function roadBucket(tags = {}) {
  if (tags.railway && /^(rail|light_rail|subway|tram)$/.test(tags.railway)) return 'railway';
  const highway = String(tags.highway || '').toLowerCase();
  if (['footway', 'cycleway', 'path', 'pedestrian', 'steps'].includes(highway)) return 'path';
  const profile = roadProfile(tags);
  if (!profile) return null;
  return ['highway', 'arterial'].includes(profile.renderClass) ? 'major' : 'minor';
}

function getRoadWidth(tags = {}) {
  if (tags.railway) return tags.railway === 'rail' ? 3.2 : 2.4;
  const profile = roadProfile(tags);
  if (profile) return profile.width;
  const highway = tags.highway || 'path';
  return ({ footway: 1.6, cycleway: 1.8, path: 1.3, pedestrian: 3, steps: 1.3 })[highway] || 1.5;
}

function roadRenderTileCoordinates(x, z) {
  return {
    x: Math.floor((x - CITY.worldBounds.minX) / ROAD_RENDER_TILE_SIZE),
    z: Math.floor((z - CITY.worldBounds.minZ) / ROAD_RENDER_TILE_SIZE),
  };
}

function roadBatchPositions(batches, materialKey, x, z, kind) {
  const tile = roadRenderTileCoordinates(x, z);
  const key = `${tile.x}:${tile.z}:${materialKey}:${kind}`;
  if (!batches.has(key)) batches.set(key, { materialKey, tile, kind, positions: [], segments: 0 });
  return batches.get(key);
}

function appendRoadTriangle(target, ax, ay, az, bx, by, bz, cx, cy, cz) {
  target.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}

function roadRibbonSides(samples, width) {
  return roadRibbonCrossSections(samples, width);
}

function roadEndpointKey(sample) {
  return `${Math.round(sample.x * 20)}:${Math.round(sample.y * 20)}`;
}

function smoothStep01(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function planarSegmentIntersection(a, b, c, d) {
  const roadX = b.x - a.x;
  const roadZ = b.y - a.y;
  const otherX = d.x - c.x;
  const otherZ = d.y - c.y;
  const denominator = roadX * otherZ - roadZ * otherX;
  if (Math.abs(denominator) < 0.000001) return null;
  const offsetX = c.x - a.x;
  const offsetZ = c.y - a.y;
  const roadT = (offsetX * otherZ - offsetZ * otherX) / denominator;
  const otherT = (offsetX * roadZ - offsetZ * roadX) / denominator;
  if (roadT < -0.0001 || roadT > 1.0001 || otherT < -0.0001 || otherT > 1.0001) return null;
  return {
    roadT: THREE.MathUtils.clamp(roadT, 0, 1),
    otherT: THREE.MathUtils.clamp(otherT, 0, 1),
  };
}

function buildRoadClearanceIndex(roadLines, cellSize = 120) {
  const cells = new Map();
  const cellCoordinate = (value) => Math.floor(value / cellSize);
  const addToCells = (segment) => {
    const minX = cellCoordinate(Math.min(segment.a.x, segment.b.x));
    const maxX = cellCoordinate(Math.max(segment.a.x, segment.b.x));
    const minZ = cellCoordinate(Math.min(segment.a.y, segment.b.y));
    const maxZ = cellCoordinate(Math.max(segment.a.y, segment.b.y));
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(segment);
      }
    }
  };
  roadLines.filter((line) => !line.profile.bridge && !line.profile.tunnel).forEach((line) => {
    for (let index = 1; index < line.samples.length; index += 1) {
      const a = line.samples[index - 1];
      const b = line.samples[index];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.05) continue;
      addToCells({ a, b, line });
    }
  });
  return {
    query(a, b) {
      const minX = cellCoordinate(Math.min(a.x, b.x));
      const maxX = cellCoordinate(Math.max(a.x, b.x));
      const minZ = cellCoordinate(Math.min(a.y, b.y));
      const maxZ = cellCoordinate(Math.max(a.y, b.y));
      const found = new Set();
      for (let cellX = minX; cellX <= maxX; cellX += 1) {
        for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
          for (const segment of cells.get(`${cellX}:${cellZ}`) || []) found.add(segment);
        }
      }
      return found;
    },
  };
}

function bridgeClearanceLift(line, clearanceIndex) {
  const totalLength = Math.max(0.001, line.samples.at(-1).distance);
  const endpointExclusion = Math.min(3, totalLength * 0.12);
  const bridgeLayer = Number.isFinite(Number.parseFloat(line.tags.layer)) ? Number.parseFloat(line.tags.layer) : 1;
  const clearance = ['highway', 'arterial'].includes(line.profile.renderClass) ? 4.8 : 4.2;
  let requiredLift = 0;
  let crossings = 0;
  for (let index = 1; index < line.samples.length; index += 1) {
    const a = line.samples[index - 1];
    const b = line.samples[index];
    for (const candidate of clearanceIndex.query(a, b)) {
      if (candidate.line === line) continue;
      const intersection = planarSegmentIntersection(a, b, candidate.a, candidate.b);
      if (!intersection) continue;
      const distance = a.distance + (b.distance - a.distance) * intersection.roadT;
      if (distance <= endpointExclusion || totalLength - distance <= endpointExclusion) continue;
      const otherLayer = Number.isFinite(Number.parseFloat(candidate.line.tags.layer)) ? Number.parseFloat(candidate.line.tags.layer) : 0;
      if (otherLayer > bridgeLayer) continue;
      const otherTotal = Math.max(0.001, candidate.line.samples.at(-1).distance);
      const otherDistance = candidate.a.distance + (candidate.b.distance - candidate.a.distance) * intersection.otherT;
      const candidateAtEndpoint = otherDistance < 0.75 || otherTotal - otherDistance < 0.75;
      if (candidateAtEndpoint && otherLayer === bridgeLayer) continue;
      const deckHeight = a.height + (b.height - a.height) * intersection.roadT;
      const lowerHeight = candidate.a.height + (candidate.b.height - candidate.a.height) * intersection.otherT;
      requiredLift = Math.max(requiredLift, lowerHeight + clearance - deckHeight);
      crossings += 1;
    }
  }
  line.clearanceCrossings = crossings;
  return Math.max(0, requiredLift);
}

function applyBridgeElevationProfiles(roadLines) {
  const endpointLines = new Map();
  const addEndpoint = (key, line, end) => {
    if (!endpointLines.has(key)) endpointLines.set(key, []);
    endpointLines.get(key).push({ line, end });
  };
  roadLines.forEach((line) => {
    addEndpoint(roadEndpointKey(line.samples[0]), line, 'start');
    addEndpoint(roadEndpointKey(line.samples.at(-1)), line, 'end');
  });

  const seeds = [];
  const clearanceIndex = buildRoadClearanceIndex(roadLines);
  const bridgeLines = roadLines.filter((line) => line.profile.bridge);
  const bridgeStats = { total: bridgeLines.length, raised: 0, crossings: 0, maximumLift: 0 };
  bridgeLines.forEach((line) => {
    // Only grade-separated road crossings need a full vehicle-clearance lift.
    // River, creek and short drainage bridges retain their DEM/bank profile.
    const deckLift = bridgeClearanceLift(line, clearanceIndex);
    line.clearanceLift = deckLift;
    bridgeStats.crossings += line.clearanceCrossings;
    if (deckLift <= 0.02) return;
    bridgeStats.raised += 1;
    bridgeStats.maximumLift = Math.max(bridgeStats.maximumLift, deckLift);
    line.samples.forEach((sample) => {
      sample.height += deckLift;
      sample.bridgeDeckLift = Math.max(sample.bridgeDeckLift || 0, deckLift);
    });
    const approachLength = Math.max(75, deckLift * 20);
    seeds.push({ key: roadEndpointKey(line.samples[0]), clearance: deckLift, approachLength });
    seeds.push({ key: roadEndpointKey(line.samples.at(-1)), clearance: deckLift, approachLength });
  });
  state.roadBridgeStats = bridgeStats;

  const bestRemaining = new Map();
  const queue = seeds.map((seed) => ({ ...seed, travelled: 0 }));
  while (queue.length) {
    const current = queue.shift();
    const remaining = current.approachLength - current.travelled;
    if (remaining <= 0) continue;
    for (const entry of endpointLines.get(current.key) || []) {
      const line = entry.line;
      if (line.profile.bridge) continue;
      const visitKey = `${line.id}:${entry.end}`;
      if ((bestRemaining.get(visitKey) || 0) >= remaining) continue;
      bestRemaining.set(visitKey, remaining);
      const totalLength = Math.max(0.001, line.samples.at(-1).distance);
      line.samples.forEach((sample) => {
        const localDistance = entry.end === 'start' ? sample.distance : totalLength - sample.distance;
        const distance = current.travelled + localDistance;
        if (distance >= current.approachLength) return;
        const lift = current.clearance * smoothStep01(1 - distance / current.approachLength);
        const approachHeight = sample.groundHeight + lift;
        if (approachHeight > sample.height) {
          sample.bridgeApproachLift = Math.max(sample.bridgeApproachLift || 0, approachHeight - sample.height);
          sample.height = approachHeight;
        }
      });
      const exitDistance = current.travelled + totalLength;
      if (exitDistance >= current.approachLength) continue;
      const exitSample = entry.end === 'start' ? line.samples.at(-1) : line.samples[0];
      queue.push({ ...current, key: roadEndpointKey(exitSample), travelled: exitDistance });
    }
  }
}

function reconcileRoadElevationProfiles(roadLines) {
  reconcileRoadNetworkElevations(roadLines);
}

function appendRoadRibbon(line, batches) {
  const { samples, profile } = line;
  const surfaceSides = roadRibbonSides(samples, profile.width);
  const edgeSides = roadRibbonSides(samples, profile.width + profile.edgeExtra);
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1];
    const b = samples[index];
    const surfaceA = surfaceSides[index - 1];
    const surfaceB = surfaceSides[index];
    const edgeA = edgeSides[index - 1];
    const edgeB = edgeSides[index];
    const x = (a.x + b.x) / 2;
    const z = (a.y + b.y) / 2;
    const surfaceBatch = roadBatchPositions(batches, profile.surfaceKey, x, z, 'surface');
    appendRoadTriangle(surfaceBatch.positions, surfaceA.leftX, a.height, surfaceA.leftZ, surfaceA.rightX, a.height, surfaceA.rightZ, surfaceB.rightX, b.height, surfaceB.rightZ);
    appendRoadTriangle(surfaceBatch.positions, surfaceA.leftX, a.height, surfaceA.leftZ, surfaceB.rightX, b.height, surfaceB.rightZ, surfaceB.leftX, b.height, surfaceB.leftZ);
    surfaceBatch.segments += 1;

    const edgeBatch = roadBatchPositions(batches, profile.edgeKey, x, z, 'foundation');
    const aEdgeY = a.height - 0.055;
    const bEdgeY = b.height - 0.055;
    appendRoadTriangle(edgeBatch.positions, edgeA.leftX, aEdgeY, edgeA.leftZ, edgeA.rightX, aEdgeY, edgeA.rightZ, edgeB.rightX, bEdgeY, edgeB.rightZ);
    appendRoadTriangle(edgeBatch.positions, edgeA.leftX, aEdgeY, edgeA.leftZ, edgeB.rightX, bEdgeY, edgeB.rightZ, edgeB.leftX, bEdgeY, edgeB.leftZ);

    // Elevated bridge and approach ribbons receive side skirts down to the
    // shared terrain datum. This conceals floating slabs while retaining one
    // smooth, queryable driving surface above them.
    const leftGroundA = terrainHeightAtWorld(edgeA.leftX, edgeA.leftZ) + 0.02;
    const leftGroundB = terrainHeightAtWorld(edgeB.leftX, edgeB.leftZ) + 0.02;
    const rightGroundA = terrainHeightAtWorld(edgeA.rightX, edgeA.rightZ) + 0.02;
    const rightGroundB = terrainHeightAtWorld(edgeB.rightX, edgeB.rightZ) + 0.02;
    if (Math.max(aEdgeY - leftGroundA, bEdgeY - leftGroundB) > 0.24) {
      appendRoadTriangle(edgeBatch.positions, edgeA.leftX, leftGroundA, edgeA.leftZ, edgeB.leftX, leftGroundB, edgeB.leftZ, edgeB.leftX, bEdgeY, edgeB.leftZ);
      appendRoadTriangle(edgeBatch.positions, edgeA.leftX, leftGroundA, edgeA.leftZ, edgeB.leftX, bEdgeY, edgeB.leftZ, edgeA.leftX, aEdgeY, edgeA.leftZ);
    }
    if (Math.max(aEdgeY - rightGroundA, bEdgeY - rightGroundB) > 0.24) {
      appendRoadTriangle(edgeBatch.positions, edgeA.rightX, rightGroundA, edgeA.rightZ, edgeB.rightX, bEdgeY, edgeB.rightZ, edgeB.rightX, rightGroundB, edgeB.rightZ);
      appendRoadTriangle(edgeBatch.positions, edgeA.rightX, rightGroundA, edgeA.rightZ, edgeA.rightX, aEdgeY, edgeA.rightZ, edgeB.rightX, bEdgeY, edgeB.rightZ);
    }
    edgeBatch.segments += 1;
  }
}

function buildBufferedRoadBatches(batches) {
  batches.forEach(({ positions, materialKey, tile, kind, segments }) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials[materialKey] || materials.roadLocal);
    mesh.userData = { type: `road-${kind}-batch`, material: materialKey, tile, tileSize: ROAD_RENDER_TILE_SIZE, segments, vertices: positions.length / 3 };
    mesh.renderOrder = kind.startsWith('official-') ? 4 : kind === 'surface' ? 3 : 2;
    mesh.receiveShadow = !lowPowerProfile;
    roadGroup.add(mesh);
  });
}

function finalizeRoadLines(roadLines, buckets, roadBatches) {
  applyBridgeElevationProfiles(roadLines);
  reconcileRoadElevationProfiles(roadLines);
  roadLines.forEach((line) => {
    appendRoadRibbon(line, roadBatches);
    for (let index = 1; index < line.samples.length; index += 1) {
      const a = line.samples[index - 1];
      const b = line.samples[index];
      buckets[line.bucket].push({
        a: new THREE.Vector2(a.x, a.y),
        b: new THREE.Vector2(b.x, b.y),
        aLineEndpoint: index === 1,
        aSourceVertex: a.sourceVertex,
        aY: a.height,
        bLineEndpoint: index === line.samples.length - 1,
        bSourceVertex: b.sourceVertex,
        bY: b.height,
        bridge: line.profile.bridge,
        chainStart: a.distance,
        lineId: line.id,
        lineLength: line.samples.at(-1).distance,
        name: line.tags.name || line.tags.ref || '',
        profile: line.profile,
        tags: line.tags,
        width: line.profile.width,
      });
    }
  });
  buildBufferedRoadBatches(roadBatches);
}

function queueProjectedLine(points, tags, buckets, roadLines, lineId) {
  if (points.length < 2) return 0;
  const bucket = roadBucket(tags);
  if (!bucket) return 0;
  const width = getRoadWidth(tags);
  if (bucket === 'major' || bucket === 'minor') {
    const profile = roadProfile(tags);
    const samples = resampleRoadLine(points, tags, terrainHeightAtWorld, lowPowerProfile);
    if (!profile || samples.length < 2) return 0;
    roadLines.push({ bucket, id: lineId, profile, samples, tags });
    return samples.length - 1;
  }
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].distanceTo(points[index]) < 0.8) continue;
    buckets[bucket].push({
      a: points[index - 1],
      b: points[index],
      width,
      tags,
      name: tags.name || tags.ref || '',
      bridge: false,
      aY: null,
      bY: null,
    });
    count += 1;
  }
  return count;
}

function addLineSegments(coordinates, tags, buckets, roadLines, lineId) {
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map(([lon, lat]) => project(lat, lon));
  return queueProjectedLine(points, tags, buckets, roadLines, lineId);
}

function isCrossingWay(tags = {}) {
  return tags.highway === 'crossing' || tags.footway === 'crossing' || Boolean(tags['crossing:markings']);
}

function crossingMarkingStyle(tags = {}) {
  const style = String(tags['crossing:markings'] || '').trim().toLowerCase();
  if (!style || ['no', 'none', 'unmarked'].includes(style)) return null;
  return style;
}

function addCrossingSegments(coordinates, tags, crossings) {
  const markingStyle = crossingMarkingStyle(tags);
  // A mapped crossing is not proof of pavement paint. Keep unmarked and
  // unspecified crossings out of the paint pass instead of inventing stripes.
  if (!markingStyle) return;
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map(([lon, lat]) => project(lat, lon));
  const width = THREE.MathUtils.clamp(parseMeters(tags.width) || parseMeters(tags.est_width) || 2.8, 1.8, 5.5);
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (a.distanceTo(b) < 1) continue;
    crossings.push({ a, b, width, tags, markingStyle });
  }
}

function groupSegmentsByTile(segments) {
  const groups = new Map();
  segments.forEach((segment) => {
    const tile = renderTileCoordinates((segment.a.x + segment.b.x) / 2, (segment.a.y + segment.b.y) / 2);
    const key = `${tile.x}:${tile.z}`;
    if (!groups.has(key)) groups.set(key, { tile, segments: [] });
    groups.get(key).segments.push(segment);
  });
  return groups;
}

function buildInstancedLines(segments, bucket) {
  if (!segments.length) return;
  const thickness = bucket === 'path' ? 0.16 : bucket === 'curb' ? 0.14 : bucket === 'railway' ? 0.28 : 0.34;
  const material = bucket === 'path'
      ? materials.path
      : bucket === 'curb'
        ? materials.curbConcrete
      : bucket === 'sidewalk'
        ? materials.sidewalk
        : bucket === 'trail'
          ? materials.officialTrail
      : bucket === 'railway'
        ? materials.railway
        : materials.roadLocal;
  const geometry = new THREE.BoxGeometry(1, thickness, 1);
  groupSegmentsByTile(segments).forEach(({ tile, segments: tileSegments }) => {
    const mesh = new THREE.InstancedMesh(geometry, material, tileSegments.length);
    const dummy = new THREE.Object3D();
    const direction = new THREE.Vector3();
    const midpoint = new THREE.Vector3();
    tileSegments.forEach((segment, index) => {
      const elevationOffset = bucket === 'path' || bucket === 'sidewalk' || bucket === 'trail' ? 0.2 : bucket === 'curb' ? 0.21 : 0.13;
      const aY = Number.isFinite(segment.aY) ? segment.aY : terrainHeightAtWorld(segment.a.x, segment.a.y) + elevationOffset;
      const bY = Number.isFinite(segment.bY) ? segment.bY : terrainHeightAtWorld(segment.b.x, segment.b.y) + elevationOffset;
      direction.set(segment.b.x - segment.a.x, bY - aY, segment.b.y - segment.a.y);
      const length = Math.max(0.1, direction.length());
      direction.normalize();
      midpoint.set((segment.a.x + segment.b.x) / 2, (aY + bY) / 2, (segment.a.y + segment.b.y) / 2);
      dummy.position.copy(midpoint);
      setRoadQuaternion(dummy, direction);
      dummy.scale.set(segment.width, 1, length + 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData = { type: bucket, tile, tileSize: RENDER_TILE_SIZE, count: tileSegments.length };
    mesh.renderOrder = bucket === 'curb' ? 5 : 0;
    roadGroup.add(mesh);
  });
  state.objectCount += segments.length;
}

function buildOfficialCurbRibbons(segments) {
  const batches = new Map();
  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.2) continue;
    const sideX = dz / length * segment.width / 2;
    const sideZ = -dx / length * segment.width / 2;
    const tile = roadRenderTileCoordinates((segment.a.x + segment.b.x) / 2, (segment.a.y + segment.b.y) / 2);
    const key = `${tile.x}:${tile.z}`;
    if (!batches.has(key)) batches.set(key, { tile, positions: [], segments: 0 });
    const batch = batches.get(key);
    const aTop = segment.aY;
    const bTop = segment.bY;
    const aBottom = aTop - 0.11;
    const bBottom = bTop - 0.11;
    const alx = segment.a.x + sideX;
    const alz = segment.a.y + sideZ;
    const arx = segment.a.x - sideX;
    const arz = segment.a.y - sideZ;
    const blx = segment.b.x + sideX;
    const blz = segment.b.y + sideZ;
    const brx = segment.b.x - sideX;
    const brz = segment.b.y - sideZ;
    appendRoadTriangle(batch.positions, alx, aTop, alz, arx, aTop, arz, brx, bTop, brz);
    appendRoadTriangle(batch.positions, alx, aTop, alz, brx, bTop, brz, blx, bTop, blz);
    if (!lowPowerProfile) {
      // The pavement-facing wall is concealed by asphalt. Retaining only the
      // visible outer curb face saves two triangles per surveyed segment while
      // preserving the exact top and roadside silhouette.
      appendRoadTriangle(batch.positions, alx, aBottom, alz, blx, bBottom, blz, blx, bTop, blz);
      appendRoadTriangle(batch.positions, alx, aBottom, alz, blx, bTop, blz, alx, aTop, alz);
    }
    batch.segments += 1;
  }
  batches.forEach(({ tile, positions, segments: count }) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.curbConcrete);
    mesh.renderOrder = 5;
    mesh.receiveShadow = !lowPowerProfile;
    mesh.userData = { type: 'official-curb-ribbons', tile, tileSize: ROAD_RENDER_TILE_SIZE, segments: count, triangles: positions.length / 9 };
    streetscapeGroup.add(mesh);
  });
  state.objectCount += segments.length;
}

function roadProfilePriority(profile) {
  return ({ highway: 6, arterial: 5, collector: 4, local: 3, service: 2, tunnel: 1, unpaved: 0 })[profile?.renderClass] ?? 2;
}

function buildRoadJunctions(segments) {
  const vertices = new Map();
  const addVertex = (segment, endpoint) => {
    const isA = endpoint === 'a';
    if (segment.profile?.parkingAisle) return;
    const sourceVertex = isA ? segment.aSourceVertex : segment.bSourceVertex;
    if (!sourceVertex) return;
    const point = isA ? segment.a : segment.b;
    const y = isA ? segment.aY : segment.bY;
    const lineEndpoint = isA ? segment.aLineEndpoint : segment.bLineEndpoint;
    const key = `${Math.round(point.x * 20)}:${Math.round(point.y * 20)}:${Math.round(y * 4)}`;
    if (!vertices.has(key)) {
      vertices.set(key, {
        edgeExtra: segment.profile.edgeExtra,
        edgeKey: segment.profile.edgeKey,
        lineEndpoint: false,
        lines: new Set(),
        materialKey: segment.profile.surfaceKey,
        priority: roadProfilePriority(segment.profile),
        width: segment.width,
        x: point.x,
        y,
        z: point.y,
      });
    }
    const vertex = vertices.get(key);
    vertex.lines.add(segment.lineId);
    vertex.lineEndpoint ||= lineEndpoint;
    const priority = roadProfilePriority(segment.profile);
    if (priority > vertex.priority || (priority === vertex.priority && segment.width > vertex.width)) {
      vertex.materialKey = segment.profile.surfaceKey;
      vertex.edgeKey = segment.profile.edgeKey;
      vertex.priority = priority;
    }
    vertex.width = Math.max(vertex.width, segment.width);
    vertex.edgeExtra = Math.max(vertex.edgeExtra, segment.profile.edgeExtra);
    vertex.y = Math.max(vertex.y, y);
  };
  segments.forEach((segment) => {
    addVertex(segment, 'a');
    addVertex(segment, 'b');
  });

  const junctions = [...vertices.values()].filter((vertex) => vertex.lineEndpoint || vertex.lines.size > 1);
  const surfaceGroups = new Map();
  const foundationGroups = new Map();
  const addGroup = (groups, vertex, materialKey) => {
    const tile = roadRenderTileCoordinates(vertex.x, vertex.z);
    const key = `${tile.x}:${tile.z}:${materialKey}`;
    if (!groups.has(key)) groups.set(key, { materialKey, tile, vertices: [] });
    groups.get(key).vertices.push(vertex);
  };
  junctions.forEach((vertex) => {
    addGroup(surfaceGroups, vertex, vertex.materialKey);
    addGroup(foundationGroups, vertex, vertex.edgeKey);
  });

  const dummy = new THREE.Object3D();
  const buildGroups = (groups, foundation) => {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, foundation ? 0.025 : 0.018, 14);
    groups.forEach(({ materialKey, tile, vertices: grouped }) => {
      const mesh = new THREE.InstancedMesh(geometry, materials[materialKey] || materials.roadLocal, grouped.length);
      grouped.forEach((vertex, index) => {
        dummy.position.set(vertex.x, foundation ? vertex.y - 0.052 : vertex.y + 0.009, vertex.z);
        dummy.rotation.set(0, 0, 0);
        const diameter = foundation ? vertex.width + vertex.edgeExtra : vertex.width;
        dummy.scale.set(diameter, 1, diameter);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.renderOrder = foundation ? 2 : 4;
      mesh.userData = { type: foundation ? 'road-junction-foundations' : 'road-junction-surfaces', material: materialKey, tile, tileSize: ROAD_RENDER_TILE_SIZE, count: grouped.length };
      roadGroup.add(mesh);
    });
  };
  buildGroups(foundationGroups, true);
  buildGroups(surfaceGroups, false);
  state.objectCount += junctions.length * 2;
}

function buildUrbanCurbs(segments) {
  const nodeLines = new Map();
  const nodeKey = (point, y) => `${Math.round(point.x * 10)}:${Math.round(point.y * 10)}:${Math.round(y * 2)}`;
  const recordNode = (point, y, lineId, sourceVertex) => {
    if (!sourceVertex) return;
    const key = nodeKey(point, y);
    if (!nodeLines.has(key)) nodeLines.set(key, new Set());
    nodeLines.get(key).add(lineId);
  };
  segments.forEach((segment) => {
    recordNode(segment.a, segment.aY, segment.lineId, segment.aSourceVertex);
    recordNode(segment.b, segment.bY, segment.lineId, segment.bSourceVertex);
  });

  const batches = new Map();
  let curbSegments = 0;
  const batchFor = (x, z) => {
    const tile = roadRenderTileCoordinates(x, z);
    const key = `${tile.x}:${tile.z}`;
    if (!batches.has(key)) batches.set(key, { positions: [], tile, segments: 0 });
    return batches.get(key);
  };

  for (const segment of segments) {
    const profile = segment.profile || roadProfile(segment.tags || {});
    if (!shouldRenderUrbanCurb(segment.tags, profile)) continue;
    // Keep low-memory devices smooth while preserving complete, continuous
    // curbs along every selected road rather than dropping random segments.
    if (lowPowerProfile && profile.renderClass === 'local' && stableHash(segment.lineId) % 3 !== 0) continue;
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.65) continue;
    const sideX = dz / length;
    const sideZ = -dx / length;
    const aJunction = (nodeLines.get(nodeKey(segment.a, segment.aY))?.size || 0) > 1;
    const bJunction = (nodeLines.get(nodeKey(segment.b, segment.bY))?.size || 0) > 1;
    const trimA = aJunction ? Math.min(1.4, length * 0.22) : 0;
    const trimB = bJunction ? Math.min(1.4, length * 0.22) : 0;
    if (trimA + trimB >= length * 0.78) continue;
    const tA = trimA / length;
    const tB = 1 - trimB / length;
    const ax = THREE.MathUtils.lerp(segment.a.x, segment.b.x, tA);
    const az = THREE.MathUtils.lerp(segment.a.y, segment.b.y, tA);
    const ay = THREE.MathUtils.lerp(segment.aY, segment.bY, tA);
    const bx = THREE.MathUtils.lerp(segment.a.x, segment.b.x, tB);
    const bz = THREE.MathUtils.lerp(segment.a.y, segment.b.y, tB);
    const by = THREE.MathUtils.lerp(segment.aY, segment.bY, tB);
    const batch = batchFor((ax + bx) / 2, (az + bz) / 2);
    const halfRoad = segment.width / 2;

    for (const side of [-1, 1]) {
      const inner = halfRoad + 0.025;
      const outer = halfRoad + 0.255;
      const aInnerX = ax + sideX * side * inner;
      const aInnerZ = az + sideZ * side * inner;
      const aOuterX = ax + sideX * side * outer;
      const aOuterZ = az + sideZ * side * outer;
      const bInnerX = bx + sideX * side * inner;
      const bInnerZ = bz + sideZ * side * inner;
      const bOuterX = bx + sideX * side * outer;
      const bOuterZ = bz + sideZ * side * outer;
      const aTop = ay + 0.14;
      const bTop = by + 0.14;
      const aBottom = ay + 0.012;
      const bBottom = by + 0.012;
      appendRoadTriangle(batch.positions, aInnerX, aTop, aInnerZ, aOuterX, aTop, aOuterZ, bOuterX, bTop, bOuterZ);
      appendRoadTriangle(batch.positions, aInnerX, aTop, aInnerZ, bOuterX, bTop, bOuterZ, bInnerX, bTop, bInnerZ);
      appendRoadTriangle(batch.positions, aOuterX, aBottom, aOuterZ, bOuterX, bBottom, bOuterZ, bOuterX, bTop, bOuterZ);
      appendRoadTriangle(batch.positions, aOuterX, aBottom, aOuterZ, bOuterX, bTop, bOuterZ, aOuterX, aTop, aOuterZ);
    }
    batch.segments += 1;
    curbSegments += 1;
  }

  batches.forEach(({ positions, tile, segments: tileSegments }) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.curbConcrete);
    mesh.renderOrder = 5;
    mesh.userData = { type: 'terrain-following-urban-curbs', tile, tileSize: ROAD_RENDER_TILE_SIZE, segments: tileSegments };
    streetscapeGroup.add(mesh);
  });
  document.documentElement.dataset.urbanCurbSegments = String(curbSegments);
  state.objectCount += curbSegments * 2;
}

function buildRoadSurfaceIndex(segments) {
  state.roadSurfaceIndex = new RoadSurfaceIndex();
  state.roadSurfaceIndex.addAll(segments);
  state.roadSurfaceCount = segments.length;
  document.documentElement.dataset.roadSegments = String(state.roadSurfaceCount);
  document.documentElement.dataset.raisedRoadBridges = String(state.roadBridgeStats.raised);
  globalThis.PeterboroughRoads = Object.freeze({
    sampleLatLon(lat, lon, tolerance = 0.75, referenceHeight = null) {
      const point = project(lat, lon);
      return state.roadSurfaceIndex.sample(point.x, point.y, tolerance, referenceHeight);
    },
    sampleWorld(x, z, tolerance = 0.75, referenceHeight = null) {
      return state.roadSurfaceIndex.sample(x, z, tolerance, referenceHeight);
    },
    sampleAllLatLon(lat, lon, tolerance = 0.75) {
      const point = project(lat, lon);
      return state.roadSurfaceIndex.sampleAll(point.x, point.y, tolerance);
    },
    sampleAllWorld(x, z, tolerance = 0.75) {
      return state.roadSurfaceIndex.sampleAll(x, z, tolerance);
    },
    get segmentCount() {
      return state.roadSurfaceCount;
    },
    get bridgeClearanceStats() {
      return { ...state.roadBridgeStats };
    },
    version: '1.5.5',
  });
  console.info(`Road surface network ready: ${state.roadSurfaceCount.toLocaleString()} segments; ${state.roadBridgeStats.raised} grade-separated bridge lifts.`);
}

function buildMapRoadLines(segments) {
  const majorPositions = [];
  const minorPositions = [];
  segments.forEach((segment) => {
    if (segment.profile?.parkingAisle) return;
    const target = ['highway', 'arterial'].includes(segment.profile?.renderClass) ? majorPositions : minorPositions;
    target.push(
      segment.a.x, segment.aY + 0.08, segment.a.y,
      segment.b.x, segment.bY + 0.08, segment.b.y,
    );
  });
  const addLines = (positions, material, type) => {
    if (!positions.length) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeBoundingSphere();
    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 20;
    lines.userData = { type, segments: positions.length / 6 };
    mapRoadGroup.add(lines);
  };
  addLines(minorPositions, materials.mapRoadMinor, 'map-road-minor');
  addLines(majorPositions, materials.mapRoadMajor, 'map-road-major');
}

function buildRoadMarkings(segments) {
  const groups = new Map();
  const roadNodes = new Map();
  const nodeKey = (point) => `${Math.round(point.x * 20)}:${Math.round(point.y * 20)}`;
  const recordPublicRoadNode = (segment, endpoint) => {
    const profile = segment.profile || roadProfile(segment.tags || {});
    const sourceVertex = endpoint === 'a' ? segment.aSourceVertex : segment.bSourceVertex;
    if (!sourceVertex || !profile || profile.renderClass === 'service') return;
    const point = endpoint === 'a' ? segment.a : segment.b;
    const key = nodeKey(point);
    if (!roadNodes.has(key)) roadNodes.set(key, { lines: new Set(), names: new Set() });
    const node = roadNodes.get(key);
    node.lines.add(segment.lineId);
    const name = String(segment.name || segment.tags?.name || '').trim().toLowerCase();
    if (name) node.names.add(name);
  };
  segments.forEach((segment) => {
    recordPublicRoadNode(segment, 'a');
    recordPublicRoadNode(segment, 'b');
  });
  const isTrueIntersection = (segment, endpoint) => {
    const sourceVertex = endpoint === 'a' ? segment.aSourceVertex : segment.bSourceVertex;
    if (!sourceVertex) return false;
    const point = endpoint === 'a' ? segment.a : segment.b;
    const node = roadNodes.get(nodeKey(point));
    return Boolean(node && (node.names.size > 1 || node.lines.size >= 3));
  };
  const addMarking = (marking, materialKey, kind) => {
    const tile = roadRenderTileCoordinates(marking.x, marking.z);
    const key = `${tile.x}:${tile.z}:${materialKey}:${kind}`;
    if (!groups.has(key)) groups.set(key, { kind, markings: [], materialKey, tile });
    groups.get(key).markings.push(marking);
  };

  for (const segment of segments) {
    const tags = segment.tags || {};
    const profile = segment.profile || roadProfile(tags);
    if (!profile || profile.unpaved || profile.tunnel || tags.junction === 'roundabout' || tags.lane_markings === 'no') continue;
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const planarLength = Math.hypot(dx, dz);
    if (planarLength < 0.5) continue;
    const sideX = dz / planarLength;
    const sideZ = -dx / planarLength;
    const dy = segment.bY - segment.aY;
    const direction = new THREE.Vector3(dx, dy, dz).normalize();

    // Only render cycle-lane separators where OSM explicitly maps a lane,
    // track, shoulder, or bus-shared lane. Untagged streets are never guessed.
    mappedCycleLaneSides(tags).forEach((mappedSide) => {
      const side = mappedSide === 'left' ? 1 : -1;
      const offset = side * Math.max(0.45, segment.width / 2 - 1.52);
      addMarking({
        direction,
        length: Math.hypot(dx, dy, dz) + 0.06,
        x: (segment.a.x + segment.b.x) / 2 + sideX * offset,
        y: (segment.aY + segment.bY) / 2 + 0.019,
        z: (segment.a.y + segment.b.y) / 2 + sideZ * offset,
      }, 'roadPaintWhite', 'cycle-edge');
    });

    const lanes = laneCountFor(tags);
    const boundaries = roadLaneMarkingBoundaries(tags, { ...profile, lanes });
    if (!boundaries.length) continue;
    const period = 10.5;
    const dashLength = 4.2;
    const chainStart = segment.chainStart || 0;
    const chainEnd = chainStart + planarLength;
    const firstDash = Math.floor(chainStart / period) * period;
    const junctionTrim = Math.max(2.8, segment.width * 0.62);
    const localMinimum = isTrueIntersection(segment, 'a') ? Math.min(planarLength / 2, junctionTrim) : 0;
    const localMaximum = planarLength - (isTrueIntersection(segment, 'b') ? Math.min(planarLength / 2, junctionTrim) : 0);
    if (localMaximum - localMinimum < 0.35) continue;

    for (const boundaryRule of boundaries) {
      const offset = -segment.width / 2 + segment.width * boundaryRule.boundary / lanes;
      if (boundaryRule.pattern === 'solid') {
        const localMiddle = (localMinimum + localMaximum) / 2;
        const t = localMiddle / planarLength;
        addMarking({
          direction,
          length: localMaximum - localMinimum,
          x: THREE.MathUtils.lerp(segment.a.x, segment.b.x, t) + sideX * offset,
          y: THREE.MathUtils.lerp(segment.aY, segment.bY, t) + 0.018,
          z: THREE.MathUtils.lerp(segment.a.y, segment.b.y, t) + sideZ * offset,
        }, boundaryRule.materialKey, 'solid');
        continue;
      }
      for (let dashStart = firstDash; dashStart < chainEnd; dashStart += period) {
        const localStart = Math.max(localMinimum, dashStart - chainStart);
        const localEnd = Math.min(localMaximum, dashStart + dashLength - chainStart);
        if (localEnd - localStart < 0.35) continue;
        const localMiddle = (localStart + localEnd) / 2;
        const t = localMiddle / planarLength;
        const centerX = THREE.MathUtils.lerp(segment.a.x, segment.b.x, t);
        const centerZ = THREE.MathUtils.lerp(segment.a.y, segment.b.y, t);
        addMarking({
          direction,
          length: localEnd - localStart,
          x: centerX + sideX * offset,
          y: THREE.MathUtils.lerp(segment.aY, segment.bY, t) + 0.018,
          z: centerZ + sideZ * offset,
        }, boundaryRule.materialKey, 'dash');
      }
    }

    if (/^(motorway|trunk)(?:_link)?$/.test(profile.highway)) {
      [-1, 1].forEach((side) => {
        const offset = side * Math.max(0.5, segment.width / 2 - 0.2);
        addMarking({
          direction,
          length: Math.hypot(dx, dy, dz) + 0.08,
          x: (segment.a.x + segment.b.x) / 2 + sideX * offset,
          y: (segment.aY + segment.bY) / 2 + 0.017,
          z: (segment.a.y + segment.b.y) / 2 + sideZ * offset,
        }, 'roadPaintWhite', 'edge');
      });
    }
  }

  const dashGeometry = new THREE.BoxGeometry(0.15, 0.025, 1);
  const edgeGeometry = new THREE.BoxGeometry(0.13, 0.024, 1);
  const dummy = new THREE.Object3D();
  let markingCount = 0;
  groups.forEach(({ kind, markings, materialKey, tile }) => {
    const mesh = new THREE.InstancedMesh(kind === 'dash' ? dashGeometry : edgeGeometry, materials[materialKey], markings.length);
    markings.forEach((marking, index) => {
      dummy.position.set(marking.x, marking.y, marking.z);
      setRoadQuaternion(dummy, marking.direction);
      dummy.scale.set(1, 1, marking.length);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 6;
    mesh.userData = {
      type: kind === 'dash'
        ? 'road-lane-dashes'
        : kind === 'solid'
          ? 'road-centre-lines'
          : kind === 'cycle-edge' ? 'mapped-cycle-lane-edges' : 'road-edge-lines',
      material: materialKey,
      tile,
      tileSize: ROAD_RENDER_TILE_SIZE,
      count: markings.length,
    };
    streetscapeGroup.add(mesh);
    markingCount += markings.length;
  });
  state.objectCount += markingCount;
}

function turnArrowGeometry(kind) {
  const positions = [];
  const addTriangle2d = (a, b, c) => positions.push(a[0], 0, a[1], b[0], 0, b[1], c[0], 0, c[1]);
  const addQuad2d = (a, b, c, d) => {
    addTriangle2d(a, b, c);
    addTriangle2d(a, c, d);
  };
  const turnLeft = /left|reverse/.test(kind);
  const turnRight = /right/.test(kind);
  if (!turnLeft && !turnRight) {
    addQuad2d([-0.14, -1.8], [0.14, -1.8], [0.14, 0.62], [-0.14, 0.62]);
    addTriangle2d([-0.68, 0.52], [0.68, 0.52], [0, 1.72]);
  } else {
    const side = turnLeft ? -1 : 1;
    addQuad2d([-0.14, -1.75], [0.14, -1.75], [0.14, 0.48], [-0.14, 0.48]);
    addQuad2d([0, 0.24], [side * 1.02, 0.24], [side * 1.02, 0.52], [0, 0.52]);
    addTriangle2d([side * 1.58, 0.38], [side * 0.82, -0.25], [side * 0.82, 1.01]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function buildMappedTurnArrows(segments) {
  const lines = new Map();
  segments.forEach((segment) => {
    if (!segment.lineId || !mappedTurnLaneGroups(segment.tags, segment.profile).length) return;
    if (!lines.has(segment.lineId)) lines.set(segment.lineId, []);
    lines.get(segment.lineId).push(segment);
  });
  const arrows = { left: [], right: [], through: [] };
  const normalizedKind = (symbol) => /left|reverse/.test(symbol) ? 'left' : /right/.test(symbol) ? 'right' : 'through';
  for (const lineSegments of lines.values()) {
    lineSegments.sort((a, b) => (a.chainStart || 0) - (b.chainStart || 0));
    const exemplar = lineSegments[0];
    const lineLength = exemplar.lineLength || lineSegments.reduce((sum, segment) => sum + segment.a.distanceTo(segment.b), 0);
    const groups = mappedTurnLaneGroups(exemplar.tags, exemplar.profile);
    groups.forEach((group) => {
      const targetDistance = group.direction === 'forward'
        ? Math.max(lineLength * 0.5, lineLength - 13)
        : Math.min(lineLength * 0.5, 13);
      const segment = lineSegments.find((candidate) => {
        const length = candidate.a.distanceTo(candidate.b);
        return targetDistance >= (candidate.chainStart || 0) - 0.01
          && targetDistance <= (candidate.chainStart || 0) + length + 0.01;
      }) || (group.direction === 'forward' ? lineSegments.at(-1) : lineSegments[0]);
      const segmentLength = Math.max(0.001, segment.a.distanceTo(segment.b));
      const t = THREE.MathUtils.clamp((targetDistance - (segment.chainStart || 0)) / segmentLength, 0.15, 0.85);
      const reverse = group.direction === 'backward';
      const dx = (segment.b.x - segment.a.x) * (reverse ? -1 : 1);
      const dz = (segment.b.y - segment.a.y) * (reverse ? -1 : 1);
      const dy = (segment.bY - segment.aY) * (reverse ? -1 : 1);
      const direction = new THREE.Vector3(dx, dy, dz).normalize();
      const sideX = dz / Math.max(0.001, Math.hypot(dx, dz));
      const sideZ = -dx / Math.max(0.001, Math.hypot(dx, dz));
      const totalLanes = Math.max(group.symbols.length * (group.oneWay ? 1 : 2), laneCountFor(segment.tags));
      const laneWidth = segment.width / totalLanes;
      group.symbols.forEach((symbol, laneIndex) => {
        if (!symbol) return;
        const offset = group.oneWay
          ? -segment.width / 2 + laneWidth * (laneIndex + 0.5)
          : laneWidth * (laneIndex + 0.5);
        arrows[normalizedKind(symbol)].push({
          direction,
          x: THREE.MathUtils.lerp(segment.a.x, segment.b.x, t) + sideX * offset,
          y: THREE.MathUtils.lerp(segment.aY, segment.bY, t) + 0.026,
          z: THREE.MathUtils.lerp(segment.a.y, segment.b.y, t) + sideZ * offset,
        });
      });
    });
  }
  const dummy = new THREE.Object3D();
  let count = 0;
  Object.entries(arrows).forEach(([kind, entries]) => {
    if (!entries.length) return;
    const mesh = new THREE.InstancedMesh(turnArrowGeometry(kind), materials.roadPaintWhite, entries.length);
    entries.forEach((entry, index) => {
      dummy.position.set(entry.x, entry.y, entry.z);
      setRoadQuaternion(dummy, entry.direction);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 7;
    mesh.userData = { type: 'mapped-turn-arrows', kind, count: entries.length };
    streetscapeGroup.add(mesh);
    count += entries.length;
  });
  document.documentElement.dataset.mappedTurnArrows = String(count);
  state.objectCount += count;
}

function buildCrossings(crossings) {
  const bars = [];
  const rails = [];
  const dots = [];
  for (const crossing of crossings) {
    const dx = crossing.b.x - crossing.a.x;
    const dz = crossing.b.y - crossing.a.y;
    const length = Math.hypot(dx, dz);
    if (length < 1) continue;
    const heading = Math.atan2(dx, dz);
    const sideX = Math.cos(heading);
    const sideZ = -Math.sin(heading);
    const style = crossing.markingStyle;
    const aRoad = state.roadSurfaceIndex.sample(crossing.a.x, crossing.a.y, 4);
    const bRoad = state.roadSurfaceIndex.sample(crossing.b.x, crossing.b.y, 4);
    const aY = (aRoad?.height ?? terrainHeightAtWorld(crossing.a.x, crossing.a.y) + ROAD_SURFACE_CLEARANCE) + 0.019;
    const bY = (bRoad?.height ?? terrainHeightAtWorld(crossing.b.x, crossing.b.y) + ROAD_SURFACE_CLEARANCE) + 0.019;
    const direction3 = new THREE.Vector3(dx, bY - aY, dz).normalize();

    if (style === 'lines' || style === 'ladder') {
      const x = (crossing.a.x + crossing.b.x) / 2;
      const z = (crossing.a.y + crossing.b.y) / 2;
      const y = (aY + bY) / 2;
      const offset = Math.max(0.45, crossing.width / 2 - 0.1);
      rails.push({ x: x + sideX * offset, z: z + sideZ * offset, y, direction: direction3, length });
      rails.push({ x: x - sideX * offset, z: z - sideZ * offset, y, direction: direction3, length });
    }

    if (style === 'dots') {
      const offset = Math.max(0.45, crossing.width / 2 - 0.12);
      for (let distance = 0.3; distance < length; distance += 0.72) {
        const t = distance / length;
        const x = THREE.MathUtils.lerp(crossing.a.x, crossing.b.x, t);
        const z = THREE.MathUtils.lerp(crossing.a.y, crossing.b.y, t);
        const y = THREE.MathUtils.lerp(aY, bY, t);
        dots.push({ x: x + sideX * offset, z: z + sideZ * offset, y, direction: direction3 });
        dots.push({ x: x - sideX * offset, z: z - sideZ * offset, y, direction: direction3 });
      }
    } else if (!['lines'].includes(style)) {
      for (let distance = 0.35; distance < length; distance += 0.92) {
        const t = distance / length;
        const x = THREE.MathUtils.lerp(crossing.a.x, crossing.b.x, t);
        const z = THREE.MathUtils.lerp(crossing.a.y, crossing.b.y, t);
        bars.push({ x, z, y: THREE.MathUtils.lerp(aY, bY, t), direction: direction3, width: crossing.width });
      }
    }
  }
  const dummy = new THREE.Object3D();
  const addPaintMesh = (geometry, instances, type, setScale) => {
    if (!instances.length) return;
    const groups = new Map();
    instances.forEach((mark) => {
      const tile = roadRenderTileCoordinates(mark.x, mark.z);
      const key = `${tile.x}:${tile.z}`;
      if (!groups.has(key)) groups.set(key, { tile, instances: [] });
      groups.get(key).instances.push(mark);
    });
    groups.forEach(({ tile, instances: tileInstances }) => {
      const mesh = new THREE.InstancedMesh(geometry, materials.crossingPaint, tileInstances.length);
      tileInstances.forEach((mark, index) => {
        dummy.position.set(mark.x, mark.y, mark.z);
        setRoadQuaternion(dummy, mark.direction);
        setScale(dummy.scale, mark);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.renderOrder = 7;
      mesh.userData = { type, tile, tileSize: ROAD_RENDER_TILE_SIZE, count: tileInstances.length };
      streetscapeGroup.add(mesh);
    });
  };
  if (bars.length) addPaintMesh(new THREE.BoxGeometry(1, 0.035, 0.5), bars, 'mapped-crossing-bars', (scale, mark) => scale.set(mark.width, 1, 1));
  if (rails.length) addPaintMesh(new THREE.BoxGeometry(0.16, 0.035, 1), rails, 'mapped-crossing-lines', (scale, mark) => scale.set(1, 1, mark.length));
  if (dots.length) addPaintMesh(new THREE.BoxGeometry(0.28, 0.035, 0.28), dots, 'mapped-crossing-dots', (scale) => scale.set(1, 1, 1));
  state.objectCount += bars.length + rails.length + dots.length;
}

function buildBridgeDetails(segments) {
  const bridgeSegments = segments.filter((segment) => segment.bridge && Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) > 4);
  if (!bridgeSegments.length) return;
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 1.18, 1), materials.bridgeRail, bridgeSegments.length * 2);
  const dummy = new THREE.Object3D();
  const side = new THREE.Vector2();
  const direction3 = new THREE.Vector3();
  let railIndex = 0;
  bridgeSegments.forEach((segment) => {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dz);
    const heading = Math.atan2(dx, dz);
    const x = (segment.a.x + segment.b.x) / 2;
    const z = (segment.a.y + segment.b.y) / 2;
    const aY = Number.isFinite(segment.aY) ? segment.aY : terrainHeightAtWorld(segment.a.x, segment.a.y) + 0.42;
    const bY = Number.isFinite(segment.bY) ? segment.bY : terrainHeightAtWorld(segment.b.x, segment.b.y) + 0.42;
    const deckY = (aY + bY) / 2;
    direction3.set(dx, bY - aY, dz).normalize();

    side.set(Math.cos(heading), -Math.sin(heading)).multiplyScalar((segment.width + 0.35) / 2);
    [-1, 1].forEach((direction) => {
      dummy.position.set(x + side.x * direction, deckY + 0.78, z + side.y * direction);
      setRoadQuaternion(dummy, direction3);
      dummy.scale.set(1, 1, length + 0.65);
      dummy.updateMatrix();
      rail.setMatrixAt(railIndex, dummy.matrix);
      railIndex += 1;
    });
  });
  rail.instanceMatrix.needsUpdate = true;
  rail.computeBoundingSphere();
  rail.userData = { type: 'bridge-rails', count: railIndex };
  streetscapeGroup.add(rail);
  state.objectCount += bridgeSegments.length * 2;
}

function buildTunnelStructures(segments) {
  const tunnelSegments = segments.filter((segment) => segment.profile?.tunnel && Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y) > 1.5);
  if (!tunnelSegments.length) return;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 4.65, 1), materials.tunnelWall, tunnelSegments.length * 2);
  const roofs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), materials.tunnelRoof, tunnelSegments.length);
  const dummy = new THREE.Object3D();
  const direction3 = new THREE.Vector3();
  let wallIndex = 0;
  tunnelSegments.forEach((segment, index) => {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const planarLength = Math.max(0.001, Math.hypot(dx, dz));
    const length = Math.hypot(dx, segment.bY - segment.aY, dz);
    const sideX = dz / planarLength;
    const sideZ = -dx / planarLength;
    const midpointX = (segment.a.x + segment.b.x) / 2;
    const midpointY = (segment.aY + segment.bY) / 2;
    const midpointZ = (segment.a.y + segment.b.y) / 2;
    direction3.set(dx, segment.bY - segment.aY, dz).normalize();
    [-1, 1].forEach((side) => {
      dummy.position.set(midpointX + sideX * side * (segment.width / 2 + 0.25), midpointY + 2.32, midpointZ + sideZ * side * (segment.width / 2 + 0.25));
      setRoadQuaternion(dummy, direction3);
      dummy.scale.set(1, 1, length + 0.35);
      dummy.updateMatrix();
      walls.setMatrixAt(wallIndex, dummy.matrix);
      wallIndex += 1;
    });
    dummy.position.set(midpointX, midpointY + 4.72, midpointZ);
    setRoadQuaternion(dummy, direction3);
    dummy.scale.set(segment.width + 0.85, 1, length + 0.35);
    dummy.updateMatrix();
    roofs.setMatrixAt(index, dummy.matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  walls.computeBoundingSphere();
  roofs.computeBoundingSphere();
  walls.userData = { type: 'tunnel-walls', count: wallIndex };
  roofs.userData = { type: 'tunnel-roofs', count: tunnelSegments.length };
  streetscapeGroup.add(walls, roofs);
  state.objectCount += wallIndex + tunnelSegments.length;
}

function createStreetLabelSprite(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.font = '700 32px system-ui, sans-serif';
  const width = Math.ceil(context.measureText(text).width + 34);
  canvas.width = width;
  canvas.height = 52;
  context.font = '700 32px system-ui, sans-serif';
  context.fillStyle = 'rgba(4, 15, 20, 0.72)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = 'rgba(226, 211, 155, 0.72)';
  context.lineWidth = 2;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.fillStyle = '#f3e7bd';
  context.fillText(text, 16, 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(canvas.width * 0.2, 10.4, 1);
  sprite.userData.labelAspect = canvas.width / canvas.height;
  return sprite;
}

function buildStreetLabels(segments) {
  const ranked = new Map();
  const priority = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1 };
  segments.forEach((segment) => {
    const text = String(segment.name || '').trim();
    const kind = String(segment.tags?.highway || '').replace(/_link$/, '');
    if (!text || !priority[kind]) return;
    const length = Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
    const lineLength = segment.lineLength || length;
    const centerError = Math.abs((segment.chainStart || 0) + length / 2 - lineLength / 2);
    const score = (priority[kind] * 1000000) + lineLength - centerError;
    const existing = ranked.get(text);
    if (!existing || score > existing.score) ranked.set(text, { ...segment, score });
  });
  [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, 92).forEach((segment) => {
    const sprite = createStreetLabelSprite(segment.name);
    if (!sprite) return;
    const x = (segment.a.x + segment.b.x) / 2;
    const z = (segment.a.y + segment.b.y) / 2;
    sprite.position.set(x, (segment.aY + segment.bY) / 2 + 2.6, z);
    sprite.userData = { ...sprite.userData, type: 'street-label', name: segment.name };
    streetLabelGroup.add(sprite);
  });
}

function buildStreetNameSigns(segments) {
  const intersections = selectStreetSignIntersections(segments, lowPowerProfile ? 55 : 150);
  if (!intersections.length) return;
  const signEntries = intersections.flatMap((intersection) => intersection.signs.map((sign) => ({ intersection, sign })));
  const cellWidth = 192;
  const cellHeight = 48;
  const columns = 8;
  const rows = Math.ceil(signEntries.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = cellWidth * columns;
  canvas.height = 2 ** Math.ceil(Math.log2(Math.max(cellHeight, rows * cellHeight)));
  const context = canvas.getContext('2d');
  if (!context) return;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  signEntries.forEach(({ sign }, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * cellHeight;
    context.fillStyle = '#174b3d';
    context.fillRect(x + 2, y + 3, cellWidth - 4, cellHeight - 6);
    context.strokeStyle = '#e9eee4';
    context.lineWidth = 2;
    context.strokeRect(x + 4, y + 5, cellWidth - 8, cellHeight - 10);
    let fontSize = 21;
    const label = sign.name.toUpperCase();
    do {
      context.font = `700 ${fontSize}px system-ui, sans-serif`;
      fontSize -= 1;
    } while (fontSize > 10 && context.measureText(label).width > cellWidth - 18);
    context.fillStyle = '#f5f7ee';
    context.fillText(label, x + cellWidth / 2, y + cellHeight / 2 + 1);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.64,
    metalness: 0.03,
    side: THREE.DoubleSide,
    transparent: true,
    alphaTest: 0.12,
  });
  const positions = [];
  const uvs = [];
  const indices = [];
  const postLocations = [];

  signEntries.forEach(({ intersection, sign }, index) => {
    const sideX = intersection.directionZ;
    const sideZ = -intersection.directionX;
    const offset = intersection.roadWidth / 2 + 1.05;
    const x = intersection.x + sideX * offset;
    const z = intersection.z + sideZ * offset;
    const baseY = intersection.y;
    const boardY = baseY + 2.7 + (index % 2) * 0.32;
    if (index % 2 === 0) postLocations.push({ x, y: baseY, z });
    const halfWidth = Math.min(2.35, Math.max(1.45, 0.105 * sign.name.length + 0.72));
    const halfHeight = 0.31;
    const axisX = sign.directionX;
    const axisZ = sign.directionZ;
    const vertexOffset = positions.length / 3;
    positions.push(
      x - axisX * halfWidth, boardY - halfHeight, z - axisZ * halfWidth,
      x + axisX * halfWidth, boardY - halfHeight, z + axisZ * halfWidth,
      x + axisX * halfWidth, boardY + halfHeight, z + axisZ * halfWidth,
      x - axisX * halfWidth, boardY + halfHeight, z - axisZ * halfWidth,
    );
    const column = index % columns;
    const row = Math.floor(index / columns);
    const u0 = (column * cellWidth) / canvas.width;
    const u1 = ((column + 1) * cellWidth) / canvas.width;
    const vTop = 1 - (row * cellHeight) / canvas.height;
    const vBottom = 1 - ((row + 1) * cellHeight) / canvas.height;
    uvs.push(u0, vBottom, u1, vBottom, u1, vTop, u0, vTop);
    indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2, vertexOffset, vertexOffset + 2, vertexOffset + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const boards = new THREE.Mesh(geometry, material);
  boards.renderOrder = 8;
  boards.userData = { type: 'mapped-street-name-signs', count: signEntries.length };

  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.075, 2.85, 6), materials.lightPole, postLocations.length);
  const dummy = new THREE.Object3D();
  postLocations.forEach((location, index) => {
    dummy.position.set(location.x, location.y + 1.425, location.z);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  poles.computeBoundingSphere();
  poles.userData = { type: 'street-sign-posts', count: postLocations.length };
  streetscapeGroup.add(poles, boards);
  document.documentElement.dataset.streetSignIntersections = String(intersections.length);
  state.objectCount += intersections.length + signEntries.length;
}

function buildLandmarkMapLabels() {
  LANDMARKS.forEach((landmark) => {
    const sprite = createStreetLabelSprite(landmark.name);
    if (!sprite) return;
    const point = project(landmark.lat, landmark.lon);
    sprite.position.set(point.x, terrainHeightAtWorld(point.x, point.y) + 28, point.y);
    sprite.userData = { ...sprite.userData, type: 'landmark-label', name: landmark.name };
    streetLabelGroup.add(sprite);
  });
}

function updateMapLabelScale() {
  if (state.mode !== 'map') return;
  const height = THREE.MathUtils.clamp(camera.position.y * 0.008, 10.4, 96);
  if (Math.abs(height - lastMapLabelHeight) < 0.5) return;
  lastMapLabelHeight = height;
  streetLabelGroup.children.forEach((sprite) => {
    const aspect = Number(sprite.userData?.labelAspect) || 4;
    sprite.scale.set(aspect * height, height, 1);
  });
}

function buildStreetFurniture(props) {
  const cap = innerWidth < 760 ? 500 : 1600;
  const lamps = props.lamps.slice(0, cap);
  if (lamps.length) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.12, 7.1, 6), materials.lightPole, lamps.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.82, 0.22, 0.38), materials.lampLens, lamps.length);
    const dummy = new THREE.Object3D();
    lamps.forEach((point, index) => {
      const ground = terrainHeightAtWorld(point.x, point.z);
      dummy.position.set(point.x, ground + 3.55, point.z);
      dummy.rotation.set(0, point.heading || 0, 0);
      dummy.scale.setScalar(point.scale || 1);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.y = ground + 7.02;
      dummy.updateMatrix();
      heads.setMatrixAt(index, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.userData = { type: 'street-lamp-poles', count: lamps.length };
    heads.userData = { type: 'street-lamp-heads', count: lamps.length };
    streetscapeGroup.add(poles, heads);
    state.objectCount += lamps.length * 2;
  }

  const signalPoints = props.signals.slice(0, 260);
  if (signalPoints.length) {
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 5.8, 6), materials.lightPole, signalPoints.length);
    const housings = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 1.58, 0.34), materials.signalHousing, signalPoints.length);
    const redLenses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 7, 5), materials.signalRed, signalPoints.length);
    const greenLenses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 7, 5), materials.signalGreen, signalPoints.length);
    const dummy = new THREE.Object3D();
    signalPoints.forEach((point, index) => {
      const ground = terrainHeightAtWorld(point.x, point.z);
      dummy.position.set(point.x, ground + 2.9, point.z);
      dummy.updateMatrix();
      poles.setMatrixAt(index, dummy.matrix);
      dummy.position.y = ground + 4.75;
      dummy.updateMatrix();
      housings.setMatrixAt(index, dummy.matrix);
      dummy.position.set(point.x, ground + 5.2, point.z + 0.2);
      dummy.updateMatrix();
      redLenses.setMatrixAt(index, dummy.matrix);
      dummy.position.y = ground + 4.3;
      dummy.updateMatrix();
      greenLenses.setMatrixAt(index, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    housings.instanceMatrix.needsUpdate = true;
    redLenses.instanceMatrix.needsUpdate = true;
    greenLenses.instanceMatrix.needsUpdate = true;
    poles.userData = { type: 'traffic-signal-poles', count: signalPoints.length };
    housings.userData = { type: 'traffic-signal-heads', count: signalPoints.length };
    redLenses.userData = { type: 'traffic-signal-backs', count: signalPoints.length };
    greenLenses.userData = { type: 'traffic-signal-arms', count: signalPoints.length };
    streetscapeGroup.add(poles, housings, redLenses, greenLenses);
    state.objectCount += signalPoints.length * 4;
  }
}

function propertyValue(properties, ...names) {
  const entries = Object.entries(properties || {});
  for (const name of names) {
    const direct = properties?.[name];
    if (direct !== undefined && direct !== null && String(direct).trim()) return direct;
    const match = entries.find(([key]) => key.toLowerCase() === String(name).toLowerCase());
    if (match && String(match[1] ?? '').trim()) return match[1];
  }
  return '';
}

function flattenedGeoCoordinates(geometry) {
  const points = [];
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      points.push([Number(value[0]), Number(value[1])]);
      return;
    }
    value.forEach(visit);
  };
  visit(geometry?.coordinates);
  return points;
}

function cityFeaturePlace(feature, layer) {
  const properties = feature.properties || {};
  const coordinates = flattenedGeoCoordinates(feature.geometry);
  if (!coordinates.length) return null;
  const lon = coordinates.reduce((total, point) => total + point[0], 0) / coordinates.length;
  const lat = coordinates.reduce((total, point) => total + point[1], 0) / coordinates.length;
  const name = String(propertyValue(properties, 'P_Name', 'NAME', 'LOCATION_N', 'STOPNAME', 'Label', 'STREET_NAME') || '').trim();
  if (!name) return null;
  const category = String(propertyValue(properties, 'CATEGORY', 'PARK_TYPE', 'Type', 'ROUTENAME') || layer.replaceAll('_', ' '));
  const address = String(propertyValue(properties, 'ADDRESS') || '').trim();
  return { name, category: address ? `${category} · ${address}` : category, address, lat, lon, altitude: layer === 'parks' ? 110 : 95, layer, source: 'City of Peterborough eMaps' };
}

function appendOfficialLine(coordinates, width, tags, target) {
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map(([lon, lat]) => project(lat, lon));
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].distanceTo(points[index]) < 0.7) continue;
    target.push({ a: points[index - 1], b: points[index], width, tags, name: tags.name || '', bridge: false, aY: null, bY: null });
  }
}

function buildTransitStops(stops) {
  if (!stops.length) return;
  const capped = stops.slice(0, innerWidth < 760 ? 320 : 900);
  const sheltered = capped.filter((stop) => /^(y|yes|true|1)$/i.test(String(stop.shelter || '').trim()));
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.06, 2.7, 6), materials.lightPole, capped.length);
  const signs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.075), materials.transitBlue, capped.length);
  const shelters = sheltered.length
    ? new THREE.InstancedMesh(new THREE.BoxGeometry(3.5, 2.45, 1.55), materials.shelterGlass, sheltered.length)
    : null;
  const dummy = new THREE.Object3D();
  capped.forEach((stop, index) => {
    const ground = terrainHeightAtWorld(stop.x, stop.z);
    dummy.position.set(stop.x, ground + 1.35, stop.z);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    dummy.position.y = ground + 2.35;
    dummy.updateMatrix();
    signs.setMatrixAt(index, dummy.matrix);
  });
  sheltered.forEach((stop, index) => {
    const ground = terrainHeightAtWorld(stop.x, stop.z);
    dummy.position.set(stop.x + 1.9, ground + 1.22, stop.z);
    dummy.updateMatrix();
    shelters.setMatrixAt(index, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  signs.instanceMatrix.needsUpdate = true;
  streetscapeGroup.add(poles, signs);
  if (shelters) {
    shelters.instanceMatrix.needsUpdate = true;
    streetscapeGroup.add(shelters);
  }
  state.objectCount += capped.length * 2 + sheltered.length;
}

async function loadCityOpenData() {
  const file = state.manifest?.city_open_data?.file || 'peterborough-city-open-data.geojson';
  const url = new URL(`data/${file}`, import.meta.url);
  if (state.manifest?.generated_at) url.searchParams.set('v', state.manifest.generated_at);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Peterborough eMaps data returned ${response.status}`);
  const collection = await response.json();
  if (!Array.isArray(collection?.features)) throw new Error('Peterborough eMaps data is not a GeoJSON FeatureCollection');
  return collection;
}

async function loadOfficialRoadSurfaces() {
  if (lowPowerProfile) {
    state.officialRoadSurfacesAvailable = false;
    document.documentElement.dataset.officialRoadDetail = 'osm-compatibility-fallback';
    return null;
  }
  const file = state.manifest?.city_road_surfaces?.file || 'peterborough-road-surfaces.geojson';
  const url = new URL(`data/${file}`, import.meta.url);
  if (state.manifest?.generated_at) url.searchParams.set('v', state.manifest.generated_at);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Official Peterborough road surfaces returned ${response.status}`);
  const collection = await response.json();
  if (!Array.isArray(collection?.features)) throw new Error('Official road surfaces are not a GeoJSON FeatureCollection');
  state.officialRoadSurfacesAvailable = collection.features.some((feature) => (
    String(feature?.properties?.ptbo_layer || '') === 'road_surfaces'
  ));
  return collection;
}

async function loadOfficialCityBuildings() {
  // The complete OSM building layer remains the mobile/default fallback.
  // Municipal footprints are a sizeable gap-fill layer, so only capable
  // desktop profiles download them.
  if (lowPowerProfile) {
    document.documentElement.dataset.officialBuildingDetail = 'osm-mobile-fallback';
    return null;
  }
  const file = state.manifest?.city_buildings?.file || 'peterborough-official-buildings.geojson';
  const url = new URL(`data/${file}`, import.meta.url);
  if (state.manifest?.generated_at) url.searchParams.set('v', state.manifest.generated_at);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`Official Peterborough buildings returned ${response.status}`);
  const collection = await response.json();
  if (!Array.isArray(collection?.features)) throw new Error('Official buildings are not a GeoJSON FeatureCollection');
  document.documentElement.dataset.officialBuildingDetail = 'municipal-gap-fill';
  return collection;
}

function officialRoadHeightAt(x, z, layer = 'road_surfaces') {
  const terrainY = terrainHeightAtWorld(x, z);
  const tolerance = layer === 'bridges' ? 20 : layer === 'parking_surfaces' ? 7 : 14;
  const candidates = state.roadSurfaceIndex.sampleAll(x, z, tolerance);
  let road = null;
  if (layer === 'bridges') road = candidates.find((candidate) => candidate.bridge) || candidates[0];
  else road = candidates[0];
  const surfaceOffset = layer === 'bridges' ? 0.012 : layer === 'road_surfaces' ? 0.008 : 0.004;
  return Math.max(road?.height ?? -Infinity, terrainY + ROAD_SURFACE_CLEARANCE) + surfaceOffset;
}

function cachedOfficialRoadHeightAt(cache, point, layer) {
  const key = `${layer}:${Math.round(point.x * 1000)}:${Math.round(point.y * 1000)}`;
  if (!cache.has(key)) cache.set(key, officialRoadHeightAt(point.x, point.y, layer));
  return cache.get(key);
}

function appendDrapedOfficialRoadTriangle(target, a, b, c, layer, heightCache, depth = 0) {
  const ab = a.distanceToSquared(b);
  const bc = b.distanceToSquared(c);
  const ca = c.distanceToSquared(a);
  const longest = Math.max(ab, bc, ca);
  // The underlying OSM ribbon is sampled more densely for vehicle elevation.
  // These surveyed polygons own the horizontal silhouette, so one subdivision
  // per terrain cell is sufficient and avoids spending mobile GPU time on
  // nearly coplanar triangles that add no visible plan accuracy.
  const maximumEdge = lowPowerProfile ? 48 : layer === 'parking_surfaces' ? 42 : 36;
  if (longest > maximumEdge * maximumEdge && depth < 9) {
    if (longest === ab) {
      const midpoint = a.clone().lerp(b, 0.5);
      appendDrapedOfficialRoadTriangle(target, a, midpoint, c, layer, heightCache, depth + 1);
      appendDrapedOfficialRoadTriangle(target, midpoint, b, c, layer, heightCache, depth + 1);
    } else if (longest === bc) {
      const midpoint = b.clone().lerp(c, 0.5);
      appendDrapedOfficialRoadTriangle(target, a, b, midpoint, layer, heightCache, depth + 1);
      appendDrapedOfficialRoadTriangle(target, a, midpoint, c, layer, heightCache, depth + 1);
    } else {
      const midpoint = c.clone().lerp(a, 0.5);
      appendDrapedOfficialRoadTriangle(target, a, b, midpoint, layer, heightCache, depth + 1);
      appendDrapedOfficialRoadTriangle(target, midpoint, b, c, layer, heightCache, depth + 1);
    }
    return;
  }
  appendRoadTriangle(
    target,
    a.x, cachedOfficialRoadHeightAt(heightCache, a, layer), a.y,
    c.x, cachedOfficialRoadHeightAt(heightCache, c, layer), c.y,
    b.x, cachedOfficialRoadHeightAt(heightCache, b, layer), b.y,
  );
}

function appendOfficialRoadPolygon(polygonCoordinates, layer, batches, heightCache) {
  const sourceRings = polygonCoordinates.map(coordinatesToLandRing).map(cleanRing).filter((ring) => ring.length >= 3);
  if (!sourceRings.length) return 0;
  let outer = sourceRings[0];
  let contour = outer.map((point) => new THREE.Vector2(point.x, point.y));
  if (!THREE.ShapeUtils.isClockWise(contour)) {
    outer = outer.slice().reverse();
    contour = contour.slice().reverse();
  }
  const holes = [];
  const holeContours = [];
  sourceRings.slice(1).forEach((sourceHole) => {
    let hole = sourceHole;
    let holeContour = hole.map((point) => new THREE.Vector2(point.x, point.y));
    if (THREE.ShapeUtils.isClockWise(holeContour)) {
      hole = hole.slice().reverse();
      holeContour = holeContour.slice().reverse();
    }
    holes.push(hole);
    holeContours.push(holeContour);
  });
  let faces;
  try {
    faces = THREE.ShapeUtils.triangulateShape(contour, holeContours);
  } catch (error) {
    console.debug('Skipped invalid official road polygon', error);
    return 0;
  }
  const vertices = outer.concat(...holes);
  const anchor = polygonCentroid(outer);
  const materialKey = layer === 'parking_surfaces' ? 'parking' : layer === 'bridges' ? 'bridge' : 'officialRoad';
  const batch = roadBatchPositions(batches, materialKey, anchor.x, anchor.y, `official-${layer}`);
  const before = batch.positions.length;
  faces.forEach(([first, second, third]) => {
    const a = vertices[first];
    const b = vertices[second];
    const c = vertices[third];
    if (!a || !b || !c) return;
    appendDrapedOfficialRoadTriangle(batch.positions, a, b, c, layer, heightCache);
  });
  batch.segments += 1;
  return (batch.positions.length - before) / 9;
}

async function buildOfficialRoadSurfaces(collection, osmBuildingIndex = null) {
  if (!collection?.features?.length || !state.officialRoadSurfacesAvailable) return null;
  const batches = new Map();
  const heightCache = new Map();
  const curbs = [];
  const counts = { road_surfaces: 0, parking_surfaces: 0, bridges: 0, curb_edges: 0 };
  const municipalBuildingBatches = createBuildingBufferBatches();
  let supplementalBuildings = 0;
  let triangles = 0;
  state.officialDrivableSurfaceIndex = new OfficialDrivableSurfaceIndex();

  for (let featureIndex = 0; featureIndex < collection.features.length; featureIndex += 1) {
    if (featureIndex > 0 && featureIndex % 900 === 0) {
      setProgress(90, `Fitting surveyed pavement and municipal building detail… ${featureIndex.toLocaleString()} / ${collection.features.length.toLocaleString()}`);
      await nextFrame();
    }
    const feature = collection.features[featureIndex];
    const properties = feature.properties || {};
    const layer = String(properties.ptbo_layer || '').toLowerCase();
    const status = String(propertyValue(properties, 'STATUS') || '').toLowerCase();
    if (!officialSurfaceStatusActive(status)) continue;
    if (layer === 'official_buildings') {
      geometryPolygons(feature).forEach((polygonCoordinates) => {
        const rings = polygonCoordinates.map(coordinatesToRing).filter((ring) => ring.length >= 4);
        if (!rings.length) return;
        const center = polygonCentroid(rings[0]);
        // OSM remains the first-choice semantic building layer. Municipal
        // footprints fill genuine coverage gaps only, preventing double walls
        // while restoring garages, outbuildings, and newer development blocks.
        if (properties.ptbo_gap_fill !== true && osmBuildingIndex?.contains(center.x, center.y, 4.5)) return;
        const area = polygonArea(rings[0]);
        const building = area < 28 ? 'shed' : area < 64 ? 'garage' : area < 260 ? 'house' : 'yes';
        const tags = {
          building,
          source: 'City of Peterborough Basedata',
          'source:geometry': 'City of Peterborough Basedata layer 6',
        };
        if (!appendBufferedBuilding(rings, tags, `city-building/${feature.id}`, municipalBuildingBatches)) return;
        supplementalBuildings += 1;
      });
      continue;
    }
    if (layer === 'curb_edges') {
      geometryLines(feature).forEach((line) => {
        const points = line
          .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
          .map(([lon, lat]) => project(Number(lat), Number(lon)));
        for (let index = 1; index < points.length; index += 1) {
          const a = points[index - 1];
          const b = points[index];
          if (a.distanceTo(b) < 0.25) continue;
          const aBase = cachedOfficialRoadHeightAt(heightCache, a, 'road_surfaces');
          const bBase = cachedOfficialRoadHeightAt(heightCache, b, 'road_surfaces');
          curbs.push({ a, b, width: 0.24, tags: { source: 'City of Peterborough Basedata' }, name: '', bridge: false, aY: aBase + 0.07, bY: bBase + 0.07 });
        }
      });
      counts.curb_edges += 1;
      continue;
    }
    if (!['road_surfaces', 'parking_surfaces', 'bridges'].includes(layer)) continue;
    geometryPolygons(feature).forEach((polygon) => {
      const rings = polygon.map(coordinatesToLandRing).map(cleanRing).filter((ring) => ring.length >= 3);
      if (!rings.length) return;
      triangles += appendOfficialRoadPolygon(polygon, layer, batches, heightCache);
      state.officialDrivableSurfaceIndex.add(rings, {
        id: feature.id,
        layer,
        properties,
      });
      counts[layer] += 1;
    });
  }

  buildBufferedRoadBatches(batches);
  buildOfficialCurbRibbons(curbs);
  buildBufferedBuildingBatches(municipalBuildingBatches);
  heightCache.clear();
  state.officialRoadSurfaceCount = counts.road_surfaces + counts.parking_surfaces + counts.bridges;
  state.officialCurbSegmentCount = curbs.length;
  state.objectCount += state.officialRoadSurfaceCount + supplementalBuildings;
  document.documentElement.dataset.officialRoadSurfaces = String(counts.road_surfaces);
  document.documentElement.dataset.officialParkingSurfaces = String(counts.parking_surfaces);
  document.documentElement.dataset.officialBridgeSurfaces = String(counts.bridges);
  document.documentElement.dataset.officialCurbSegments = String(curbs.length);
  document.documentElement.dataset.officialRoadTriangles = String(triangles);
  document.documentElement.dataset.supplementalCityBuildings = String(supplementalBuildings);
  globalThis.__PTBO_OFFICIAL_ROADS__ = Object.freeze({ ...counts, curbSegments: curbs.length, triangles });
  globalThis.PeterboroughDrivableSurfaces = Object.freeze({
    containsLatLon(lat, lon, options = {}) {
      const point = project(lat, lon);
      return state.officialDrivableSurfaceIndex.contains(point.x, point.y, options);
    },
    containsWorld(x, z, options = {}) {
      return state.officialDrivableSurfaceIndex.contains(x, z, options);
    },
    sampleLatLon(lat, lon, options = {}) {
      const point = project(lat, lon);
      const surface = state.officialDrivableSurfaceIndex.query(point.x, point.y, options);
      if (!surface) return null;
      const candidates = state.roadSurfaceIndex.sampleAll(point.x, point.y, surface.layer === 'bridges' ? 20 : 14);
      const road = surface.layer === 'bridges'
        ? candidates.find((candidate) => candidate.bridge) || candidates[0]
        : candidates[0];
      return { ...surface, height: road?.height ?? terrainHeightAtWorld(point.x, point.y) + ROAD_SURFACE_CLEARANCE };
    },
    sampleWorld(x, z, options = {}) {
      const surface = state.officialDrivableSurfaceIndex.query(x, z, options);
      if (!surface) return null;
      const candidates = state.roadSurfaceIndex.sampleAll(x, z, surface.layer === 'bridges' ? 20 : 14);
      const road = surface.layer === 'bridges'
        ? candidates.find((candidate) => candidate.bridge) || candidates[0]
        : candidates[0];
      return { ...surface, height: road?.height ?? terrainHeightAtWorld(x, z) + ROAD_SURFACE_CLEARANCE };
    },
    get polygonCount() { return state.officialDrivableSurfaceIndex.polygonCount; },
    version: '1.5.5-official-pavement',
  });
  return { ...counts, curbSegments: curbs.length, supplementalBuildings, triangles };
}

function buildCityOpenData(collection) {
  if (!collection?.features?.length) return { features: 0, parks: 0, stops: 0, paths: 0 };
  const sidewalks = [];
  const trails = [];
  const stops = [];
  const parkTrees = [];
  const parkBatches = createLandBufferBatches();
  let parks = 0;

  collection.features.forEach((feature) => {
    const properties = feature.properties || {};
    const layer = String(properties.ptbo_layer || '').toLowerCase();
    const status = String(propertyValue(properties, 'STATUS') || '').toLowerCase();
    if (/inactive|removed|closed/.test(status)) return;

    if (layer === 'sidewalks_pathways' || layer === 'major_trails') {
      const lineType = String(propertyValue(properties, 'LINE_TYPE', 'CLASS') || '').toLowerCase();
      const width = layer === 'major_trails' ? 2.35 : /pathway|multi.use|trail/.test(lineType) ? 1.9 : 1.45;
      const target = layer === 'major_trails' ? trails : sidewalks;
      const name = String(propertyValue(properties, 'STREET_NAME') || '');
      geometryLines(feature).forEach((line) => appendOfficialLine(line, width, { name, source: layer }, target));
    } else if (layer === 'parks') {
      geometryPolygons(feature).forEach((polygonCoordinates) => {
        const rings = polygonCoordinates.map(coordinatesToLandRing).filter((ring) => ring.length >= 4);
        if (!rings.length) return;
        addLandPolygon(rings, materials.park, {
          batches: parkBatches,
          materialKey: 'official-city-park',
          type: 'official-city-park',
          offset: 0.13,
        });
        scatterTreesInPolygon(rings, `municipal-park:${feature.id || parks}`, parkTrees, 20000);
        parks += 1;
      });
    } else if (layer === 'bus_stops') {
      geometryPoints(feature).forEach(([lon, lat]) => {
        const point = project(lat, lon);
        stops.push({ x: point.x, z: point.y, shelter: propertyValue(properties, 'SHELTER') });
      });
    }

    if (['points_of_interest', 'recreation', 'parks', 'bus_stops'].includes(layer)) {
      const place = cityFeaturePlace(feature, layer);
      if (place) {
        state.localPlaces.push(place);
        if (layer !== 'bus_stops') state.locationPlaces.push(place);
      }
    }
  });

  buildBufferedLandBatches(parkBatches);
  buildTrees(parkTrees, {
    append: true,
    limit: lowPowerProfile ? 320 : 1600,
    type: 'municipal-park-trees',
  });
  buildInstancedLines(sidewalks, 'sidewalk');
  buildInstancedLines(trails, 'trail');
  buildTransitStops(stops);
  state.cityOpenDataCount = collection.features.length;
  return { features: collection.features.length, parks, stops: stops.length, paths: sidewalks.length + trails.length };
}

function landMaterialFor(tags) {
  if (tags.natural === 'water' || tags.water || tags.waterway === 'riverbank') {
    if (state.officialHydroAvailable) return null;
    // Without the official staged asset, draping is safer than the former
    // single centroid elevation, which could bury one shore and float above the
    // other across a long river polygon.
    return { material: materials.water, materialKey: 'water', flat: false, type: 'water' };
  }
  // Surface parking follows the local grade. Flattening an entire mapped lot
  // at its centroid created floating slabs on sloped blocks and could cover
  // adjacent road ribbons.
  if (tags.amenity === 'parking' || tags.parking) return { material: materials.parking, materialKey: 'parking', flat: false, type: 'parking' };
  if (['park', 'recreation_ground', 'garden'].includes(tags.leisure)) return { material: materials.park, materialKey: 'park', type: 'park', trees: true };
  if (tags.natural === 'wood' || tags.landuse === 'forest') return { material: materials.grass, materialKey: 'wood', type: 'wood', trees: true };
  if (['grass', 'meadow'].includes(tags.landuse)) return { material: materials.grass, materialKey: 'grass', type: 'grass' };
  if (tags.landuse === 'industrial') return { material: materials.industrialLand, materialKey: 'industrial-land', type: 'industrial-land' };
  if (tags.landuse === 'residential') return { material: materials.residentialLand, materialKey: 'residential-land', type: 'residential-land' };
  if (['commercial', 'retail'].includes(tags.landuse)) return { material: materials.commercialLand, materialKey: 'commercial-land', type: 'commercial-land' };
  return null;
}

function scatterTreesInPolygon(rings, featureId, target, maxTotal) {
  if (!rings.length || maxTotal <= target.length) return;
  const outer = rings[0];
  const area = polygonArea(outer);
  if (area < 250) return;
  const minX = Math.min(...outer.map((point) => point.x));
  const maxX = Math.max(...outer.map((point) => point.x));
  const minZ = Math.min(...outer.map((point) => point.y));
  const maxZ = Math.max(...outer.map((point) => point.y));
  const heroDensity = worldPointInVerticalSlice((minX + maxX) / 2, (minZ + maxZ) / 2, verticalSliceBounds);
  const desired = Math.min(maxTotal - target.length, Math.max(1, Math.floor(area / (heroDensity ? 760 : 2600))));
  const startCount = target.length;
  let seed = stableHash(featureId || `${minX}:${minZ}`) || 1;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), 61 | seed);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  let attempts = 0;
  while (target.length < maxTotal && target.length - startCount < desired && attempts < desired * 18) {
    attempts += 1;
    const point = new THREE.Vector2(THREE.MathUtils.lerp(minX, maxX, random()), THREE.MathUtils.lerp(minZ, maxZ, random()));
    if (!pointInPolygon(point, rings)) continue;
    target.push({ x: point.x, z: point.y, scale: deterministicNumber(`${featureId}:${attempts}`, 0.75, 1.35) });
  }
}

function buildTrees(treePoints, { append = false, limit, type = 'trees' } = {}) {
  if (!treePoints.length) return;
  const treeLimit = limit ?? (lowPowerProfile ? 1400 : 6400);
  const capped = treePoints.slice().sort((a, b) => (
    Number(worldPointInVerticalSlice(b.x, b.z, verticalSliceBounds))
    - Number(worldPointInVerticalSlice(a.x, a.z, verticalSliceBounds))
  )).slice(0, treeLimit);
  const trunkGeometry = new THREE.CylinderGeometry(0.38, 0.5, 4.4, 6);
  const crownParts = [
    new THREE.IcosahedronGeometry(2.62, 0).translate(-1.05, -0.25, 0.15),
    new THREE.IcosahedronGeometry(2.78, 0).translate(1.02, -0.05, -0.18),
    new THREE.IcosahedronGeometry(2.72, 0).translate(0.08, 1.38, 0.1),
  ];
  const deciduousGeometry = mergeGeometries(crownParts, false);
  crownParts.forEach((geometry) => geometry.dispose());
  const coniferGeometry = new THREE.ConeGeometry(2.5, 7.2, 7);
  const farCrownGeometry = new THREE.IcosahedronGeometry(3.05, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.treeTrunk, capped.length);
  const deciduous = capped.filter((tree) => stableHash(`${tree.x}:${tree.z}:species`) % 5 !== 0);
  const conifers = capped.filter((tree) => stableHash(`${tree.x}:${tree.z}:species`) % 5 === 0);
  const crowns = new THREE.InstancedMesh(deciduousGeometry, materials.treeCrown, deciduous.length);
  const lightCrowns = new THREE.InstancedMesh(deciduousGeometry, materials.treeCrownLight, deciduous.length);
  const coniferCrowns = new THREE.InstancedMesh(coniferGeometry, materials.treeConifer, conifers.length);
  const farCrowns = new THREE.InstancedMesh(farCrownGeometry, materials.treeCrown, capped.length);
  const dummy = new THREE.Object3D();
  capped.forEach((tree, index) => {
    const terrainY = terrainHeightAtWorld(tree.x, tree.z);
    const scale = tree.scale || 1;
    dummy.position.set(tree.x, terrainY + 2.2 * scale, tree.z);
    dummy.rotation.set(0, deterministicNumber(`${tree.x}:${tree.z}`, 0, Math.PI * 2), 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
  });
  let deciduousIndex = 0;
  let lightIndex = 0;
  let coniferIndex = 0;
  capped.forEach((tree, farIndex) => {
    const terrainY = terrainHeightAtWorld(tree.x, tree.z);
    const scale = tree.scale || 1;
    const seed = stableHash(`${tree.x}:${tree.z}:species`);
    dummy.position.set(tree.x, terrainY + (seed % 5 === 0 ? 6.25 : 6.05) * scale, tree.z);
    dummy.rotation.set(0, deterministicNumber(`${tree.x}:${tree.z}`, 0, Math.PI * 2), 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    farCrowns.setMatrixAt(farIndex, dummy.matrix);
    if (seed % 5 === 0) coniferCrowns.setMatrixAt(coniferIndex++, dummy.matrix);
    else if (seed % 3 === 0) lightCrowns.setMatrixAt(lightIndex++, dummy.matrix);
    else crowns.setMatrixAt(deciduousIndex++, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  lightCrowns.count = lightIndex;
  lightCrowns.instanceMatrix.needsUpdate = true;
  crowns.count = deciduousIndex;
  coniferCrowns.instanceMatrix.needsUpdate = true;
  farCrowns.instanceMatrix.needsUpdate = true;
  trunks.userData = { type, count: capped.length };
  crowns.userData = { type: 'deciduous-tree-crowns', count: deciduousIndex };
  lightCrowns.userData = { type: 'light-deciduous-tree-crowns', count: lightIndex };
  coniferCrowns.userData = { type: 'conifer-tree-crowns', count: coniferIndex };
  farCrowns.userData = { type: 'far-tree-crowns', count: capped.length, lodRole: 'far' };
  [trunks, crowns, lightCrowns, coniferCrowns].forEach((mesh) => {
    mesh.castShadow = !lowPowerProfile;
    mesh.receiveShadow = !lowPowerProfile;
    mesh.userData.lodRole = 'near';
  });
  farCrowns.visible = false;
  farCrowns.castShadow = false;
  farCrowns.receiveShadow = false;
  vegetationGroup.add(trunks, crowns, lightCrowns, coniferCrowns, farCrowns);
  const priorCount = append ? Number(document.documentElement.dataset.treeInstances || 0) : 0;
  document.documentElement.dataset.treeInstances = String(priorCount + capped.length);
  if (append) document.documentElement.dataset.municipalParkTrees = String(capped.length);
  state.objectCount += capped.length;
}

async function parseOsmWithGeoJson(data) {
  if (typeof globalThis.osmtogeojson !== 'function') throw new Error('osmtogeojson browser library is unavailable');
  const geojson = globalThis.osmtogeojson(data, { flatProperties: true });
  state.multipolygonsAvailable = true;
  const buildingBatches = createBuildingBufferBatches();
  const buildingCentroidIndex = createFootprintCentroidIndex();
  const landBatches = createLandBufferBatches();
  const lineBuckets = { major: [], minor: [], path: [], railway: [] };
  const roadBatches = new Map();
  const roadLines = [];
  const crossings = [];
  const treePoints = [];
  const treeInstanceLimit = lowPowerProfile ? 1400 : 6400;
  const streetProps = { lamps: [], signals: [] };
  let buildings = 0;
  let roads = 0;
  let land = 0;

  const features = geojson.features || [];
  for (let featureIndex = 0; featureIndex < features.length; featureIndex += 1) {
    const feature = features[featureIndex];
    // The full city has tens of thousands of source features. Yielding at a
    // predictable interval keeps the loading screen responsive rather than
    // freezing the browser during one monolithic geometry pass.
    if (featureIndex > 0 && featureIndex % 900 === 0) {
      setProgress(52 + Math.round(28 * featureIndex / Math.max(1, features.length)), `Placing accurate building footprints… ${buildings.toLocaleString()} prepared`);
      await nextFrame();
    }
    const tags = featureTags(feature);
    const featureId = feature.id || tags.id || `${tags.name || ''}:${buildings}:${land}`;

    // These point features are requested explicitly by the v1.5.5 asset build.
    // Keeping them separate from highway lines preserves their real OSM positions.
    if (tags.highway === 'street_lamp' || tags.man_made === 'street_lamp') {
      geometryPoints(feature).forEach(([lon, lat]) => {
        const p = project(lat, lon);
        streetProps.lamps.push({ x: p.x, z: p.y, scale: deterministicNumber(featureId, 0.88, 1.14) });
      });
      continue;
    }
    if (tags.highway === 'traffic_signals') {
      geometryPoints(feature).forEach(([lon, lat]) => {
        const p = project(lat, lon);
        streetProps.signals.push({ x: p.x, z: p.y });
      });
      continue;
    }

    if (tags.building || tags['building:part']) {
      for (const polygonCoordinates of geometryPolygons(feature)) {
        const rings = polygonCoordinates.map(coordinatesToRing).filter((ring) => ring.length >= 4);
        if (!rings.length) continue;
        if (!appendBufferedBuilding(rings, tags, featureId, buildingBatches)) continue;
        buildingCentroidIndex.add(rings);
        buildings += 1;
        state.objectCount += 1;
      }
      continue;
    }

    if (isCrossingWay(tags)) {
      for (const line of geometryLines(feature)) addCrossingSegments(line, tags, crossings);
      continue;
    }

    if (tags.highway || tags.railway) {
      geometryLines(feature).forEach((line, lineIndex) => {
        roads += addLineSegments(line, tags, lineBuckets, roadLines, `${featureId}:${lineIndex}`);
      });
      continue;
    }

    if (tags.natural === 'tree') {
      for (const [lon, lat] of geometryPoints(feature)) {
        const p = project(lat, lon);
        treePoints.push({ x: p.x, z: p.y, scale: deterministicNumber(featureId, 0.8, 1.25) });
      }
      continue;
    }

    const landStyle = landMaterialFor(tags);
    if (!landStyle) continue;
    for (const polygonCoordinates of geometryPolygons(feature)) {
      const rings = polygonCoordinates.map(coordinatesToLandRing).filter((ring) => ring.length >= 4);
      if (!rings.length) continue;
      addLandPolygon(rings, landStyle.material, {
        batches: landBatches,
        materialKey: landStyle.materialKey,
        flat: landStyle.flat,
        type: landStyle.type,
        offset: landStyle.type === 'water' ? 0.24 : 0.08,
      });
      land += 1;
      if (landStyle.trees && treePoints.length < treeInstanceLimit) {
        const before = treePoints.length;
        const centroid = polygonCentroid(rings[0]);
        const squareMetresPerTree = worldPointInVerticalSlice(centroid.x, centroid.y, verticalSliceBounds) ? 620 : 2100;
        const maxToAdd = Math.min(treeInstanceLimit - before, Math.max(1, Math.floor(polygonArea(rings[0]) / squareMetresPerTree)));
        scatterTreesInPolygon(rings, featureId, treePoints, before + maxToAdd);
      }
    }

  }

  finalizeRoadLines(roadLines, lineBuckets, roadBatches);
  buildBufferedLandBatches(landBatches);
  buildBufferedBuildingBatches(buildingBatches);
  buildInstancedLines(lineBuckets.path, 'path');
  buildInstancedLines(lineBuckets.railway, 'railway');
  const roadSegments = lineBuckets.major.concat(lineBuckets.minor);
  buildRoadSurfaceIndex(roadSegments);
  buildMapRoadLines(roadSegments);
  if (!state.officialRoadSurfacesAvailable) {
    buildRoadJunctions(roadSegments);
    buildUrbanCurbs(roadSegments);
  }
  buildRoadMarkings(roadSegments);
  buildMappedTurnArrows(roadSegments);
  buildCrossings(crossings);
  buildBridgeDetails(roadSegments);
  buildTunnelStructures(roadSegments);
  buildStreetLabels(roadSegments);
  buildStreetNameSigns(roadSegments);
  buildStreetFurniture(streetProps);
  buildTrees(treePoints);
  return { buildingCentroidIndex, buildings, roads, land, trees: Math.min(treePoints.length, treeInstanceLimit) };
}

function parseOsmWayFallback(data) {
  const nodes = new Map();
  const ways = [];
  for (const element of data.elements || []) {
    if (element.type === 'node') nodes.set(element.id, project(element.lat, element.lon));
    else if (element.type === 'way') ways.push(element);
  }
  const buildingBatches = createBuildingBufferBatches();
  const buildingCentroidIndex = createFootprintCentroidIndex();
  const lineBuckets = { major: [], minor: [], path: [], railway: [] };
  const roadBatches = new Map();
  const roadLines = [];
  const crossings = [];
  let buildings = 0;
  let roads = 0;
  let land = 0;
  for (const way of ways) {
    const tags = way.tags || {};
    let points = (way.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
    // Prepared Overpass snapshots use `out geom`, so most ways carry inline
    // coordinates instead of a complete node table. Honour both representations
    // to keep the no-osmtogeojson recovery path capable of rebuilding the city.
    if (points.length < 2 && Array.isArray(way.geometry)) {
      points = way.geometry
        .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lon))
        .map((coordinate) => project(coordinate.lat, coordinate.lon));
    }
    if (points.length < 2) continue;
    if (tags.building && points.length >= 4) {
      if (appendBufferedBuilding([points], tags, `way/${way.id}`, buildingBatches)) {
        buildingCentroidIndex.add([points]);
        buildings += 1;
        state.objectCount += 1;
      }
      continue;
    }
    if (isCrossingWay(tags)) {
      const markingStyle = crossingMarkingStyle(tags);
      for (let index = 1; markingStyle && index < points.length; index += 1) {
        if (points[index - 1].distanceTo(points[index]) < 1) continue;
        crossings.push({
          a: points[index - 1],
          b: points[index],
          width: THREE.MathUtils.clamp(parseMeters(tags.width) || parseMeters(tags.est_width) || 2.8, 1.8, 5.5),
          tags,
          markingStyle,
        });
      }
      continue;
    }
    if (tags.highway || tags.railway) {
      roads += queueProjectedLine(points, tags, lineBuckets, roadLines, `way/${way.id}`);
      continue;
    }
    const closed = points[0].distanceToSquared(points.at(-1)) < 0.01;
    const landStyle = landMaterialFor(tags);
    if (closed && landStyle && points.length >= 4) {
      addLandPolygon([points], landStyle.material, { flat: landStyle.flat, type: landStyle.type });
      land += 1;
    }
  }
  finalizeRoadLines(roadLines, lineBuckets, roadBatches);
  buildBufferedBuildingBatches(buildingBatches);
  buildInstancedLines(lineBuckets.path, 'path');
  buildInstancedLines(lineBuckets.railway, 'railway');
  const roadSegments = lineBuckets.major.concat(lineBuckets.minor);
  buildRoadSurfaceIndex(roadSegments);
  buildMapRoadLines(roadSegments);
  if (!state.officialRoadSurfacesAvailable) {
    buildRoadJunctions(roadSegments);
    buildUrbanCurbs(roadSegments);
  }
  buildRoadMarkings(roadSegments);
  buildMappedTurnArrows(roadSegments);
  buildCrossings(crossings);
  buildBridgeDetails(roadSegments);
  buildTunnelStructures(roadSegments);
  buildStreetLabels(roadSegments);
  buildStreetNameSigns(roadSegments);
  return { buildingCentroidIndex, buildings, roads, land, trees: 0 };
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function buildFallbackCity() {
  state.loadedSource = 'fallback';
  const random = seededRandom(6132026);
  const lineBuckets = { major: [], minor: [], path: [], railway: [] };
  const roadBatches = new Map();
  const roadLines = [];
  const buildingBatches = { residential: [], commercial: [], industrial: [], civic: [], tower: [] };
  const spacing = 115;
  const half = 15;
  let buildings = 0;

  for (let index = -half; index <= half; index += 1) {
    const major = index % 5 === 0;
    const tags = major ? { highway: 'secondary', lanes: '4', name: `Fallback Arterial ${index}` } : { highway: 'residential', lanes: '2', name: `Fallback Street ${index}` };
    queueProjectedLine([new THREE.Vector2(index * spacing, -half * spacing), new THREE.Vector2(index * spacing, half * spacing)], tags, lineBuckets, roadLines, `fallback:v:${index}`);
    queueProjectedLine([new THREE.Vector2(-half * spacing, index * spacing), new THREE.Vector2(half * spacing, index * spacing)], tags, lineBuckets, roadLines, `fallback:h:${index}`);
  }

  for (let gridX = -half; gridX < half; gridX += 1) {
    for (let gridZ = -half; gridZ < half; gridZ += 1) {
      if ((gridX < -3 && gridZ < -5) || (gridX > 6 && Math.abs(gridZ) < 3)) continue;
      const blockX = gridX * spacing + 18;
      const blockZ = gridZ * spacing + 18;
      const columns = random() > 0.6 ? 3 : 2;
      const rows = random() > 0.65 ? 3 : 2;
      const cellWidth = 76 / columns;
      const cellDepth = 76 / rows;
      for (let x = 0; x < columns; x += 1) {
        for (let z = 0; z < rows; z += 1) {
          if (random() < 0.12) continue;
          const inset = 3 + random() * 5;
          const px = blockX + x * cellWidth + inset;
          const pz = blockZ + z * cellDepth + inset;
          const width = cellWidth - inset * 2;
          const depth = cellDepth - inset * 2;
          const points = [
            new THREE.Vector2(px, pz),
            new THREE.Vector2(px + width, pz),
            new THREE.Vector2(px + width, pz + depth),
            new THREE.Vector2(px, pz + depth),
            new THREE.Vector2(px, pz),
          ];
          const result = createBuildingGeometry(points.length ? [points] : [], { building: random() > 0.85 ? 'apartments' : 'house', 'building:levels': Math.floor(1 + random() * (Math.abs(gridX) < 4 && Math.abs(gridZ) < 4 ? 12 : 3)) }, `fallback:${gridX}:${gridZ}:${x}:${z}`);
          if (result) {
            buildingBatches[result.materialKey].push(result.geometry);
            buildings += 1;
            state.objectCount += 1;
          }
        }
      }
    }
  }

  mergeBuildingBatches(buildingBatches);
  finalizeRoadLines(roadLines, lineBuckets, roadBatches);
  const roadSegments = lineBuckets.major.concat(lineBuckets.minor);
  buildRoadSurfaceIndex(roadSegments);
  buildMapRoadLines(roadSegments);
  if (!state.officialRoadSurfacesAvailable) {
    buildRoadJunctions(roadSegments);
    buildUrbanCurbs(roadSegments);
  }
  buildRoadMarkings(roadSegments);
  buildMappedTurnArrows(roadSegments);
  buildStreetNameSigns(roadSegments);

  const river = [
    new THREE.Vector2(450, -2300), new THREE.Vector2(400, -900), new THREE.Vector2(490, 250),
    new THREE.Vector2(420, 2300), new THREE.Vector2(565, 2300), new THREE.Vector2(620, 300),
    new THREE.Vector2(550, -850), new THREE.Vector2(640, -2300), new THREE.Vector2(450, -2300),
  ];
  addLandPolygon([river], materials.water, { flat: true, type: 'water', offset: 0.24 });
  const parkShape = [];
  for (let index = 0; index <= 48; index += 1) {
    const angle = index / 48 * Math.PI * 2;
    parkShape.push(new THREE.Vector2(-980 + Math.cos(angle) * 580, -760 + Math.sin(angle) * 580));
  }
  addLandPolygon([parkShape], materials.park, { type: 'park' });
  return { buildings, roads: roadSegments.length, land: 2, trees: 0 };
}

async function fetchOsm() {
  const { south, west, north, east } = CITY.dataBounds;
  const bbox = `${south},${west},${north},${east}`;
  const query = `[out:json][timeout:60];(
    nwr["building"](${bbox});
    way["highway"](${bbox});
    way["railway"~"^(rail|light_rail|subway|tram)$"](${bbox});
    nwr["natural"="water"](${bbox});
    nwr["natural"="wood"](${bbox});
    node["natural"="tree"](${bbox});
    nwr["water"](${bbox});
    nwr["waterway"="riverbank"](${bbox});
    nwr["leisure"~"^(park|recreation_ground|garden)$"](${bbox});
    nwr["landuse"~"^(grass|meadow|industrial|forest|residential|commercial|retail)$"](${bbox});
    nwr["amenity"="parking"](${bbox});
    node["highway"="street_lamp"](${bbox});
    node["highway"="traffic_signals"](${bbox});
    nwr["amenity"~"^(theatre|cinema|fountain|place_of_worship|arts_centre|sports_centre)$"](${bbox});
    nwr["tourism"~"^(museum|zoo|hotel|attraction)$"](${bbox});
    nwr["leisure"~"^(marina|playground|stadium|sports_centre)$"](${bbox});
    nwr["historic"](${bbox});
  );out body geom;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
  ];
  let lastError;
  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 50000);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`Map server returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No OpenStreetMap endpoint responded');
}

function setReadyStatus(summary) {
  els.statusDot.classList.add('ready');
  if (state.loadedSource === 'fallback') {
    els.worldStatus.textContent = 'Offline demo geometry · map service unavailable';
  } else {
    const terrainLabel = terrain.source === 'ontario-lidar-2025'
      ? 'Ontario lidar terrain'
      : state.terrainAvailable ? 'elevation terrain' : 'flat terrain';
    const sourceLabel = state.dataGeneratedAt ? `map cache ${state.dataGeneratedAt.slice(0, 10)}` : 'map data';
    els.worldStatus.textContent = [
      `${(summary.totalBuildings ?? summary.buildings).toLocaleString()} buildings`,
      state.cityOpenDataCount ? `${state.cityOpenDataCount.toLocaleString()} municipal features` : 'municipal layer unavailable',
      terrainLabel,
      sourceLabel,
    ].join(' · ');
  }
  els.objectCount.textContent = `${state.objectCount.toLocaleString()} features`;
  document.documentElement.dataset.cityReadyMs = String(Math.round(performance.now() - explorerStartedAt));
}

async function buildCity() {
  setProgress(4, 'Reading the full Peterborough map extent…');
  await hydrateWorldBounds();
  setProgress(7, 'Loading official Peterborough lidar terrain and map geometry…');
  const terrainPromise = loadTerrain().catch((error) => {
    console.warn('Terrain data unavailable; continuing with flat terrain.', error);
    terrain.available = false;
    terrain.source = 'none';
    state.terrainAvailable = false;
    document.documentElement.dataset.terrainSource = terrain.source;
    configureTerrainMeshResolution();
    return null;
  });
  const osmPromise = fetchOsm();
  const cityOpenDataPromise = loadCityOpenData().catch((error) => {
    console.info('Official City eMaps detail layer is unavailable; the OSM city remains usable.', error);
    return null;
  });
  const officialRoadSurfacePromise = loadOfficialRoadSurfaces().catch((error) => {
    console.info('Official City pavement geometry is unavailable; using the complete OSM road fallback.', error);
    state.officialRoadSurfacesAvailable = false;
    return null;
  });
  const officialBuildingPromise = loadOfficialCityBuildings().catch((error) => {
    console.info('Official City building gap-fill is unavailable; the complete OSM building layer remains active.', error);
    document.documentElement.dataset.officialBuildingDetail = 'osm-fallback';
    return null;
  });
  const hydrographyPromise = loadOfficialHydrography().catch((error) => {
    console.info('Official Ontario hydrography is unavailable; using draped OSM water.', error);
    state.officialHydroAvailable = false;
    return null;
  });

  const [, hydrography, officialRoadSurfaces, officialBuildings] = await Promise.all([
    terrainPromise,
    hydrographyPromise,
    officialRoadSurfacePromise,
    officialBuildingPromise,
  ]);
  const preparedHydrography = hydrography ? prepareHydrography(hydrography) : null;
  setProgress(31, terrain.source === 'ontario-lidar-2025'
    ? 'Shaping the landscape from Ontario lidar and hydrographic breaklines…'
    : state.terrainAvailable ? 'Decoding elevation tiles and shaping the landscape…' : 'Terrain service unavailable — using a flat landscape…');
  createTerrainMesh(preparedHydrography?.surfaceIndex || null);
  if (preparedHydrography) buildOfficialHydrography(preparedHydrography);
  await nextFrame();

  let summary = { buildings: 0, roads: 0, land: 0, trees: 0 };
  try {
    const data = await osmPromise;
    setProgress(52, 'Resolving OSM multipolygons, roads, water, and land cover…');
    await nextFrame();
    try {
      summary = await parseOsmWithGeoJson(data);
    } catch (conversionError) {
      console.warn('Multipolygon conversion failed; using the internal way parser.', conversionError);
      state.multipolygonsAvailable = false;
      summary = parseOsmWayFallback(data);
    }
    setProgress(88, `Batching ${summary.buildings.toLocaleString()} buildings and ${summary.roads.toLocaleString()} road segments…`);
  } catch (error) {
    console.warn('Live map load failed; using fallback city.', error);
    setProgress(52, 'Live map server unavailable — generating the offline city…');
    await nextFrame();
    summary = buildFallbackCity();
    showToast('Live map unavailable. Loaded the offline city prototype.');
  }

  if (officialRoadSurfaces) {
    setProgress(90, 'Fitting surveyed Peterborough pavement, curbs, buildings, parking areas, and bridge decks...');
    await nextFrame();
    const combinedOfficialGeometry = officialBuildings
      ? { ...officialRoadSurfaces, features: officialRoadSurfaces.features.concat(officialBuildings.features) }
      : officialRoadSurfaces;
    summary.officialRoadSurfaces = await buildOfficialRoadSurfaces(combinedOfficialGeometry, summary.buildingCentroidIndex);
    summary.totalBuildings = summary.buildings + (summary.officialRoadSurfaces?.supplementalBuildings || 0);
  }

  const cityOpenData = await cityOpenDataPromise;
  if (cityOpenData) {
    setProgress(92, 'Adding official parks, trails, sidewalks, civic places, and transit stops...');
    await nextFrame();
    summary.cityOpenData = buildCityOpenData(cityOpenData);
  }
  // All OSM and municipal polygons are now available. Paint once in a fixed
  // class-priority order so overlaps do not depend on source feature order.
  flushLandCoverRaster();
  buildVerticalSliceRooftopEquipment();

  const landmarkSummary = createPeterboroughLandmarks({
    THREE,
    group: landmarkGroup,
    project,
    terrainHeightAtWorld,
    landmarkBuildingPlacements: state.landmarkBuildingPlacements,
  });
  landmarkGroup.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = !lowPowerProfile;
    object.receiveShadow = !lowPowerProfile;
  });
  state.objectCount += landmarkSummary.objects;
  animatedFountain = landmarkGroup.children.find((child) => child.userData?.animatedWater) || null;
  buildLandmarkMapLabels();
  await initializeSemanticSurvey();
  await initializeCapturedDetailLayer();
  initializeGameplay();
  cityVisualLod = '';
  updateCityVisualLod();
  freezeStaticCityTransforms();
  setProgress(100, 'Peterborough is ready');
  setReadyStatus(summary);
  globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.ready?.();
  const qaParams = new URLSearchParams(location.search);
  if (qaParams.has('qaLat') && qaParams.has('qaLon')) {
    window.__PTBO_CITY_QA__?.setView({
      lat: Number(qaParams.get('qaLat')),
      lon: Number(qaParams.get('qaLon')),
      altitude: Number(qaParams.get('qaAltitude') || 22),
      distance: Number(qaParams.get('qaDistance') || 58),
      bearing: Number(qaParams.get('qaBearing') || 145),
      pitch: Number(qaParams.get('qaPitch') || -0.14),
    });
  }
  if (qaParams.get('survey') === '1') activateSemanticSurveyMode(true);
  setTimeout(() => els.loading.classList.add('is-hidden'), 420);
}

function updateMapGuide() {
  if (!els.mapScaleLine || state.mode !== 'map') return;
  const visibleWidth = 2 * camera.position.y * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
  const target = visibleWidth * 0.15;
  const choices = [100, 250, 500, 1000, 2000, 5000];
  const metres = choices.reduce((best, choice) => (choice <= target ? choice : best), choices[0]);
  els.mapScaleLine.style.width = `${THREE.MathUtils.clamp(metres / visibleWidth * innerWidth, 48, 180)}px`;
  els.mapScaleLabel.textContent = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  updateMapLabelScale();
}

function stopFlyMotion(clearKeys = true) {
  velocity.set(0, 0, 0);
  if (clearKeys) state.keys.clear();
}

function updateFlyHint() {
  if (state.mode !== 'fly') return;
  const cruiseSpeed = Math.round(flySpeedFor(state.flySpeedScale));
  if (state.pointerLocked) {
    els.modeHint.innerHTML = `<strong>Mouse steering active.</strong> Arrows/WASD move · Q/E altitude · Shift boost · Alt precision · wheel speed ${cruiseSpeed} m/s · Esc releases.`;
  } else if (state.dragLooking) {
    els.modeHint.innerHTML = `<strong>Drag to look around.</strong> Arrows/WASD move · Q/E altitude · wheel speed ${cruiseSpeed} m/s.`;
  } else {
    els.modeHint.innerHTML = `<strong>Click the city for mouse steering.</strong> Arrows or WASD move · Q/E altitude · Shift boost · Alt precision · wheel speed ${cruiseSpeed} m/s.`;
  }
  document.documentElement.dataset.flySpeed = String(cruiseSpeed);
}

function updateMouseLookUi() {
  const active = state.pointerLocked || state.dragLooking;
  els.app.classList.toggle('is-looking', active);
  document.documentElement.dataset.mouseLook = state.pointerLocked ? 'locked' : state.dragLooking ? 'drag' : 'idle';
  if (state.mode === 'fly') updateFlyHint();
  else updateGameplayHint();
}

function keyboardInputIsBlocked(event) {
  if (event.defaultPrevented || document.querySelector('dialog[open]')) return true;
  const target = event.target;
  return target instanceof Element && Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function gameplaySurfaceAt(x, z, referenceHeight = null) {
  const terrainY = terrainHeightAtWorld(x, z);
  const official = state.officialDrivableSurfaceIndex.query(x, z, { includeParking: true });
  const tolerance = official?.layer === 'bridges' ? 20 : official ? 15 : 2.2;
  const road = state.roadSurfaceIndex.sample(x, z, tolerance, referenceHeight);
  const onRoad = Boolean(official || road?.onRoad);
  const roadHeight = onRoad && Number.isFinite(road?.height) ? road.height : -Infinity;
  return {
    height: Math.max(terrainY, roadHeight),
    name: road?.name || (official?.parking ? 'Station apron' : onRoad ? 'Peterborough road' : 'Off road'),
    onRoad,
    official,
    road,
  };
}

function syncGameplayRootClasses() {
  els.app.classList.toggle('is-map', state.mode === 'map');
  els.app.classList.toggle('is-fly', state.mode === 'fly');
  els.app.classList.toggle('is-on-foot', state.mode === 'onFoot');
  els.app.classList.toggle('is-driving', state.mode === 'driving');
  els.playMode?.classList.toggle('is-active', state.mode === 'onFoot' || state.mode === 'driving');
  els.flyMode.classList.toggle('is-active', state.mode === 'fly');
  els.mapMode.classList.toggle('is-active', state.mode === 'map');
  document.documentElement.dataset.gameplayMode = state.mode;
}

function updateGameplayHint() {
  if (state.mode === 'onFoot') {
    els.modeHint.innerHTML = '<strong>On foot at Fire Station 1.</strong> WASD or arrows move · Shift sprints · mouse looks · E enters the fire truck · F free camera.';
  } else if (state.mode === 'driving') {
    els.modeHint.innerHTML = '<strong>Driving Peterborough Engine 1.</strong> W/S throttle and brake · A/D steer · E exits when stopped · C camera · L emergency lights.';
  }
}

function snapGameplayCamera() {
  if (gameplayReady) updateGameplayCamera(1, true);
}

function initializeGameplay() {
  if (gameplayReady) return;
  const playerPoint = project(FIRE_STATION_ONE.playerLat, FIRE_STATION_ONE.playerLon);
  const truckPoint = project(FIRE_STATION_ONE.truckLat, FIRE_STATION_ONE.truckLon);
  const buildingPoint = project(FIRE_STATION_ONE.buildingLat, FIRE_STATION_ONE.buildingLon);
  fireStationWorld.set(buildingPoint.x, 0, buildingPoint.y);

  playerActor = createFirefighter(THREE);
  const playerSurface = gameplaySurfaceAt(playerPoint.x, playerPoint.y);
  playerActor.position.set(playerPoint.x, playerSurface.height + 0.025, playerPoint.y);
  playerActor.rotation.y = playerHeading;
  gameplayGroup.add(playerActor);

  fireTruckActor = createFireTruck(THREE);
  const truckSurface = gameplaySurfaceAt(truckPoint.x, truckPoint.y);
  Object.assign(truckState, {
    x: truckPoint.x, z: truckPoint.y, y: truckSurface.height + 0.035,
    heading: FIRE_STATION_ONE.truckHeading, speed: 0, steering: 0,
    pitch: 0, roll: 0, wheelRotation: 0,
  });
  fireTruckActor.position.set(truckState.x, truckState.y, truckState.z);
  fireTruckActor.rotation.y = truckState.heading;
  gameplayGroup.add(fireTruckActor);

  fireStationDetail = createFireStationFacade(THREE, {
    project,
    terrainHeightAtWorld,
    survey: semanticSurveyCollection,
  });
  gameplayGroup.add(fireStationDetail);

  gameplayReady = true;
  state.gameplayYaw = 0;
  state.gameplayPitch = -0.19;
  state.gameplayCameraDistanceScale = 1;
  gameplayCameraTarget.copy(playerActor.position).add(new THREE.Vector3(0, PLAYER_TUNING.cameraHeight, 0));
  playerActor.visible = state.mode !== 'driving';
  syncGameplayRootClasses();
  updateGameplayHint();
  snapGameplayCamera();
  document.documentElement.dataset.gameplayReady = 'true';
  globalThis.__PTBO_GAMEPLAY__ = Object.freeze({
    station: { ...FIRE_STATION_ONE },
    state() {
      return {
        mode: state.mode,
        player: playerActor ? { x: playerActor.position.x, y: playerActor.position.y, z: playerActor.position.z } : null,
        truck: { ...truckState },
        onRoad: gameplaySurfaceAt(truckState.x, truckState.z, truckState.y).onRoad,
      };
    },
    reset: resetGameplay,
  });
}

function resetGameplay() {
  if (!gameplayReady) return false;
  const playerPoint = project(FIRE_STATION_ONE.playerLat, FIRE_STATION_ONE.playerLon);
  const truckPoint = project(FIRE_STATION_ONE.truckLat, FIRE_STATION_ONE.truckLon);
  const playerSurface = gameplaySurfaceAt(playerPoint.x, playerPoint.y);
  const truckSurface = gameplaySurfaceAt(truckPoint.x, truckPoint.y);
  playerActor.position.set(playerPoint.x, playerSurface.height + 0.025, playerPoint.y);
  playerVelocity.set(0, 0, 0);
  playerSpeed = 0;
  playerHeading = Math.PI;
  playerActor.rotation.y = playerHeading;
  Object.assign(truckState, {
    x: truckPoint.x, z: truckPoint.y, y: truckSurface.height + 0.035,
    heading: FIRE_STATION_ONE.truckHeading, speed: 0, steering: 0,
    pitch: 0, roll: 0, wheelRotation: 0,
  });
  fireTruckActor.position.set(truckState.x, truckState.y, truckState.z);
  fireTruckActor.rotation.set(0, truckState.heading, 0, 'YXZ');
  fireTruckActor.userData.truck.visual.rotation.set(0, 0, 0);
  state.gameplayYaw = 0;
  state.gameplayPitch = -0.19;
  state.gameplayCameraDistanceScale = 1;
  setMode('onFoot', true);
  snapGameplayCamera();
  return true;
}

function setModeLegacy(mode) {
  if (mode === state.mode) {
    if (mode === 'fly') updateFlyHint();
    return;
  }
  stopFlyMotion();
  state.dragLooking = false;
  state.dragPointerId = null;
  state.previousPointer = null;
  if (mode === 'map') {
    state.lastFlyPosition.copy(camera.position);
    state.lastFlyYaw = state.yaw;
    state.lastFlyPitch = state.pitch;
    document.exitPointerLock?.();
    state.mode = 'map';
    els.app.classList.add('is-map');
    camera.near = 30;
    camera.updateProjectionMatrix();
    mapRoadGroup.visible = true;
    const mapAltitude = Math.max(5600, CITY.terrainSize * 0.95);
    camera.position.set(
      CITY.terrainCenter.x,
      mapAltitude,
      CITY.terrainCenter.z,
    );
    camera.up.set(0, 0, -1);
    camera.lookAt(CITY.terrainCenter.x, terrainHeightAtWorld(CITY.terrainCenter.x, CITY.terrainCenter.z), CITY.terrainCenter.z);
    streetLabelGroup.visible = innerWidth >= 760;
    updateMapGuide();
    els.flyMode.classList.remove('is-active');
    els.mapMode.classList.add('is-active');
    els.modeHint.innerHTML = '<strong>Map mode.</strong> Scroll to zoom · WASD or arrows to pan · select Fly mode to return.';
  } else {
    state.mode = 'fly';
    els.app.classList.remove('is-map');
    camera.near = 0.5;
    camera.updateProjectionMatrix();
    mapRoadGroup.visible = false;
    streetLabelGroup.visible = false;
    camera.up.set(0, 1, 0);
    camera.position.copy(state.lastFlyPosition);
    state.yaw = state.lastFlyYaw;
    state.pitch = state.lastFlyPitch;
    els.flyMode.classList.add('is-active');
    els.mapMode.classList.remove('is-active');
    updateFlyHint();
  }
  updateMouseLookUi();
}

function setMode(mode, force = false) {
  const resolvedMode = mode === 'play' ? (state.lastNonMapMode === 'driving' ? 'driving' : 'onFoot') : mode;
  if (resolvedMode === state.mode && !force) {
    if (resolvedMode === 'fly') updateFlyHint();
    else updateGameplayHint();
    return;
  }
  stopFlyMotion();
  state.dragLooking = false;
  state.dragPointerId = null;
  state.previousPointer = null;
  if (state.mode === 'fly') {
    state.lastFlyPosition.copy(camera.position);
    state.lastFlyYaw = state.yaw;
    state.lastFlyPitch = state.pitch;
  }
  if (resolvedMode === 'map') {
    if (state.mode !== 'map') state.lastNonMapMode = state.mode;
    document.exitPointerLock?.();
    state.mode = 'map';
    camera.near = 30;
    camera.updateProjectionMatrix();
    mapRoadGroup.visible = true;
    const mapAltitude = Math.max(5600, CITY.terrainSize * 0.95);
    camera.position.set(CITY.terrainCenter.x, mapAltitude, CITY.terrainCenter.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(CITY.terrainCenter.x, terrainHeightAtWorld(CITY.terrainCenter.x, CITY.terrainCenter.z), CITY.terrainCenter.z);
    streetLabelGroup.visible = innerWidth >= 760;
    updateMapGuide();
    els.modeHint.innerHTML = '<strong>Map mode.</strong> Scroll to zoom · WASD or arrows pan · M returns to play.';
  } else if (resolvedMode === 'fly') {
    state.mode = 'fly';
    state.lastNonMapMode = 'fly';
    camera.near = 0.5;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    mapRoadGroup.visible = false;
    streetLabelGroup.visible = false;
    camera.up.set(0, 1, 0);
    camera.position.copy(state.lastFlyPosition);
    state.yaw = state.lastFlyYaw;
    state.pitch = state.lastFlyPitch;
    updateFlyHint();
  } else if (resolvedMode === 'onFoot' || resolvedMode === 'driving') {
    state.mode = resolvedMode;
    state.lastNonMapMode = resolvedMode;
    camera.near = 0.16;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    mapRoadGroup.visible = false;
    streetLabelGroup.visible = false;
    camera.up.set(0, 1, 0);
    if (playerActor) playerActor.visible = resolvedMode === 'onFoot';
    updateGameplayHint();
    if (gameplayReady) snapGameplayCamera();
  }
  syncGameplayRootClasses();
  updateMouseLookUi();
}

function updateFlyControls(delta) {
  const safeDelta = Math.min(Math.max(0, delta), FLY_TUNING.maximumFrameDelta);
  const axes = flyAxesFromKeys(state.keys);
  const targetSpeed = flySpeedFor(state.flySpeedScale, axes);
  camera.rotation.set(state.pitch, state.yaw, 0);
  flyForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  flyRight.crossVectors(flyForward, worldUp);
  if (flyRight.lengthSq() < 0.0001) flyRight.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  else flyRight.normalize();
  flyDesired.set(0, 0, 0)
    .addScaledVector(flyForward, axes.forward)
    .addScaledVector(flyRight, axes.strafe);
  flyDesired.y += axes.vertical;
  if (flyDesired.lengthSq() > 0) flyDesired.normalize().multiplyScalar(targetSpeed);

  const response = axes.moving ? FLY_TUNING.accelerationResponse : FLY_TUNING.brakingResponse;
  const factors = dampingFactors(response, safeDelta);
  flyStep.copy(velocity).multiplyScalar(factors.velocityIntegral).addScaledVector(flyDesired, factors.targetIntegral);
  camera.position.add(flyStep);
  velocity.multiplyScalar(factors.decay).addScaledVector(flyDesired, 1 - factors.decay);
  if (!axes.moving && velocity.lengthSq() < 0.0025) velocity.set(0, 0, 0);

  const unclampedX = camera.position.x;
  const unclampedZ = camera.position.z;
  camera.position.x = THREE.MathUtils.clamp(unclampedX, CITY.worldBounds.minX, CITY.worldBounds.maxX);
  camera.position.z = THREE.MathUtils.clamp(unclampedZ, CITY.worldBounds.minZ, CITY.worldBounds.maxZ);
  if (camera.position.x !== unclampedX) velocity.x = 0;
  if (camera.position.z !== unclampedZ) velocity.z = 0;
  const minimumAltitude = terrainHeightAtWorld(camera.position.x, camera.position.z) + FLY_TUNING.minimumClearance;
  const maximumAltitude = Math.max(3200, CITY.terrainSize * 0.42);
  if (camera.position.y < minimumAltitude) {
    camera.position.y = minimumAltitude;
    if (velocity.y < 0) velocity.y = 0;
  } else if (camera.position.y > maximumAltitude) {
    camera.position.y = maximumAltitude;
    if (velocity.y > 0) velocity.y = 0;
  }
  state.lastFlyPosition.copy(camera.position);
  state.lastFlyYaw = state.yaw;
  state.lastFlyPitch = state.pitch;
}

function updateMapControls(delta) {
  moveVector.set(0, 0, 0);
  if (state.keys.has('KeyW') || state.keys.has('ArrowUp')) moveVector.z -= 1;
  if (state.keys.has('KeyS') || state.keys.has('ArrowDown')) moveVector.z += 1;
  if (state.keys.has('KeyA') || state.keys.has('ArrowLeft')) moveVector.x -= 1;
  if (state.keys.has('KeyD') || state.keys.has('ArrowRight')) moveVector.x += 1;
  if (moveVector.lengthSq() > 0) {
    moveVector.normalize().multiplyScalar(900 * delta * Math.max(0.55, camera.position.y / 4000));
    camera.position.x += moveVector.x;
    camera.position.z += moveVector.z;
  }
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, CITY.worldBounds.minX, CITY.worldBounds.maxX);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, CITY.worldBounds.minZ, CITY.worldBounds.maxZ);
  camera.lookAt(camera.position.x, 0, camera.position.z);
  updateMapGuide();
}

function ensureVehicleAudio() {
  if (vehicleAudio || !ambientAudio?.enabled) return;
  const context = ambientAudio.context;
  const oscillator = context.createOscillator();
  const secondary = context.createOscillator();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  oscillator.type = 'sawtooth';
  secondary.type = 'square';
  oscillator.frequency.value = 36;
  secondary.frequency.value = 18;
  filter.type = 'lowpass';
  filter.frequency.value = 150;
  filter.Q.value = 1.1;
  gain.gain.value = 0;
  oscillator.connect(filter);
  secondary.connect(filter);
  filter.connect(gain).connect(context.destination);
  oscillator.start();
  secondary.start();
  vehicleAudio = { context, oscillator, secondary, filter, gain };
}

function updateVehicleAudio() {
  if (!vehicleAudio) return;
  const active = state.mode === 'driving' && ambientAudio?.enabled;
  const rpm = Math.min(1, Math.abs(truckState.speed) / TRUCK_TUNING.maximumForwardSpeed);
  const now = vehicleAudio.context.currentTime;
  vehicleAudio.oscillator.frequency.setTargetAtTime(34 + rpm * 48, now, 0.08);
  vehicleAudio.secondary.frequency.setTargetAtTime(17 + rpm * 24, now, 0.08);
  vehicleAudio.filter.frequency.setTargetAtTime(125 + rpm * 230, now, 0.08);
  vehicleAudio.gain.gain.setTargetAtTime(active ? 0.018 + rpm * 0.026 : 0, now, 0.08);
}

function cycleGameplayCameraDistance() {
  const choices = [0.72, 1, 1.38];
  const closest = choices.reduce((best, value, index) => (
    Math.abs(value - state.gameplayCameraDistanceScale) < Math.abs(choices[best] - state.gameplayCameraDistanceScale) ? index : best
  ), 0);
  const next = (closest + 1) % choices.length;
  state.gameplayCameraDistanceScale = choices[next];
  showToast(`Camera distance ${next === 0 ? 'near' : next === 1 ? 'standard' : 'far'}`);
}

function currentGameplayAxes(delta) {
  const keyboard = gameplayAxesFromKeys(state.keys);
  const pads = navigator.getGamepads?.() || [];
  const gamepad = Array.from(pads).find((candidate) => candidate?.connected && candidate.mapping === 'standard')
    || Array.from(pads).find((candidate) => candidate?.connected);
  if (!gamepad) {
    gamepadActionDown = false;
    gamepadCameraDown = false;
    document.documentElement.dataset.gamepadConnected = 'false';
    return keyboard;
  }
  document.documentElement.dataset.gamepadConnected = 'true';
  const deadzone = (value, threshold = 0.16) => {
    const magnitude = Math.abs(Number(value) || 0);
    return magnitude <= threshold ? 0 : Math.sign(value) * (magnitude - threshold) / (1 - threshold);
  };
  const leftX = deadzone(gamepad.axes?.[0]);
  const leftY = deadzone(gamepad.axes?.[1]);
  const rightX = deadzone(gamepad.axes?.[2], 0.12);
  const rightY = deadzone(gamepad.axes?.[3], 0.12);
  if (rightX || rightY) {
    state.gameplayYaw = wrapFlyYaw(state.gameplayYaw - rightX * 2.25 * delta);
    state.gameplayPitch = THREE.MathUtils.clamp(state.gameplayPitch - rightY * 1.7 * delta, -0.68, 0.28);
    state.gameplayLastLookTime = performance.now();
  }
  const actionDown = Boolean(gamepad.buttons?.[0]?.pressed);
  if (actionDown && !gamepadActionDown) enterOrExitVehicle();
  gamepadActionDown = actionDown;
  const cameraDown = Boolean(gamepad.buttons?.[3]?.pressed);
  if (cameraDown && !gamepadCameraDown) cycleGameplayCameraDistance();
  gamepadCameraDown = cameraDown;

  if (state.mode === 'driving') {
    const rightTrigger = Number(gamepad.buttons?.[7]?.value) || 0;
    const leftTrigger = Number(gamepad.buttons?.[6]?.value) || 0;
    const triggerThrottle = rightTrigger - leftTrigger;
    return {
      forward: Math.abs(triggerThrottle) > 0.04 ? triggerThrottle : keyboard.forward || -leftY,
      strafe: 0,
      steering: keyboard.steering || -leftX,
      sprinting: false,
    };
  }
  return {
    forward: keyboard.forward || -leftY,
    strafe: keyboard.strafe || leftX,
    steering: keyboard.steering || -leftX,
    sprinting: keyboard.sprinting || Boolean(gamepad.buttons?.[10]?.pressed),
  };
}

function updatePlayerActor(delta) {
  if (!gameplayReady || state.mode !== 'onFoot') return;
  const axes = currentGameplayAxes(delta);
  const forward = directionFromHeading(state.gameplayYaw);
  gameplayForward.set(forward.x, 0, forward.z);
  gameplayRight.set(Math.cos(state.gameplayYaw), 0, -Math.sin(state.gameplayYaw));
  gameplayMove.set(0, 0, 0)
    .addScaledVector(gameplayForward, axes.forward)
    .addScaledVector(gameplayRight, axes.strafe);
  const moving = gameplayMove.lengthSq() > 0.001;
  if (moving) gameplayMove.normalize();
  const targetSpeed = moving ? (axes.sprinting ? PLAYER_TUNING.sprintSpeed : PLAYER_TUNING.walkSpeed) : 0;
  const targetX = gameplayMove.x * targetSpeed;
  const targetZ = gameplayMove.z * targetSpeed;
  const response = moving ? PLAYER_TUNING.accelerationResponse : PLAYER_TUNING.brakingResponse;
  playerVelocity.x = exponentialStep(playerVelocity.x, targetX, response, delta);
  playerVelocity.z = exponentialStep(playerVelocity.z, targetZ, response, delta);
  playerActor.position.x = THREE.MathUtils.clamp(
    playerActor.position.x + playerVelocity.x * delta,
    CITY.worldBounds.minX,
    CITY.worldBounds.maxX,
  );
  playerActor.position.z = THREE.MathUtils.clamp(
    playerActor.position.z + playerVelocity.z * delta,
    CITY.worldBounds.minZ,
    CITY.worldBounds.maxZ,
  );
  playerSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
  if (playerSpeed > 0.08) {
    playerHeading = dampAngle(
      playerHeading,
      headingFromDirection(playerVelocity.x, playerVelocity.z),
      PLAYER_TUNING.rotationResponse,
      delta,
    );
  }
  playerActor.rotation.y = playerHeading;
  const surface = gameplaySurfaceAt(playerActor.position.x, playerActor.position.z, playerActor.position.y);
  playerActor.position.y = exponentialStep(playerActor.position.y, surface.height + 0.025, 24, delta);

  const animation = playerActor.userData.animation;
  animation.phase += playerSpeed * delta * 2.35;
  const stride = Math.sin(animation.phase) * Math.min(0.72, playerSpeed * 0.11);
  animation.leftArm.rotation.x = stride;
  animation.rightArm.rotation.x = -stride;
  animation.leftLeg.rotation.x = -stride;
  animation.rightLeg.rotation.x = stride;
  animation.visual.position.y = playerSpeed > 0.2 ? Math.abs(Math.sin(animation.phase * 2)) * 0.035 : 0;
}

function updateFireTruck(delta) {
  if (!gameplayReady) return;
  if (state.mode === 'driving') {
    const axes = currentGameplayAxes(delta);
    const currentSurface = gameplaySurfaceAt(truckState.x, truckState.z, truckState.y);
    const next = stepFireTruckKinematics(truckState, {
      throttle: axes.forward,
      steering: axes.steering,
    }, delta, currentSurface.onRoad);
    next.x = THREE.MathUtils.clamp(next.x, CITY.worldBounds.minX, CITY.worldBounds.maxX);
    next.z = THREE.MathUtils.clamp(next.z, CITY.worldBounds.minZ, CITY.worldBounds.maxZ);
    Object.assign(truckState, next);

    if (performance.now() - state.gameplayLastLookTime > 2200 && Math.abs(truckState.speed) > 1.5) {
      state.gameplayYaw = dampAngle(state.gameplayYaw, truckState.heading, 1.65, delta);
    }
  }

  const direction = directionFromHeading(truckState.heading);
  gameplayForward.set(direction.x, 0, direction.z);
  gameplayRight.set(Math.cos(truckState.heading), 0, -Math.sin(truckState.heading));
  const frontX = truckState.x + gameplayForward.x * TRUCK_TUNING.wheelbase * 0.5;
  const frontZ = truckState.z + gameplayForward.z * TRUCK_TUNING.wheelbase * 0.5;
  const rearX = truckState.x - gameplayForward.x * TRUCK_TUNING.wheelbase * 0.5;
  const rearZ = truckState.z - gameplayForward.z * TRUCK_TUNING.wheelbase * 0.5;
  const leftX = truckState.x - gameplayRight.x * TRUCK_TUNING.trackWidth * 0.5;
  const leftZ = truckState.z - gameplayRight.z * TRUCK_TUNING.trackWidth * 0.5;
  const rightX = truckState.x + gameplayRight.x * TRUCK_TUNING.trackWidth * 0.5;
  const rightZ = truckState.z + gameplayRight.z * TRUCK_TUNING.trackWidth * 0.5;
  const center = gameplaySurfaceAt(truckState.x, truckState.z, truckState.y);
  const front = gameplaySurfaceAt(frontX, frontZ, truckState.y);
  const rear = gameplaySurfaceAt(rearX, rearZ, truckState.y);
  const left = gameplaySurfaceAt(leftX, leftZ, truckState.y);
  const right = gameplaySurfaceAt(rightX, rightZ, truckState.y);
  const targetPitch = THREE.MathUtils.clamp(Math.atan2(front.height - rear.height, TRUCK_TUNING.wheelbase), -0.22, 0.22);
  const targetRoll = THREE.MathUtils.clamp(Math.atan2(right.height - left.height, TRUCK_TUNING.trackWidth), -0.18, 0.18);
  truckState.pitch = exponentialStep(truckState.pitch, targetPitch, 9, delta);
  truckState.roll = exponentialStep(truckState.roll, targetRoll, 9, delta);
  truckState.y = exponentialStep(truckState.y, center.height + 0.035, 18, delta);
  fireTruckActor.position.set(truckState.x, truckState.y, truckState.z);
  fireTruckActor.rotation.set(truckState.pitch, truckState.heading, truckState.roll, 'YXZ');

  const truckVisual = fireTruckActor.userData.truck;
  const bodyPitch = state.mode === 'driving' ? THREE.MathUtils.clamp(truckState.acceleration * 0.007, -0.055, 0.04) : 0;
  const bodyRoll = state.mode === 'driving' ? THREE.MathUtils.clamp(truckState.steering * truckState.speed * 0.012, -0.085, 0.085) : 0;
  truckVisual.visual.rotation.x = exponentialStep(truckVisual.visual.rotation.x, bodyPitch, 5.5, delta);
  truckVisual.visual.rotation.z = exponentialStep(truckVisual.visual.rotation.z, bodyRoll, 5.5, delta);
  truckState.wheelRotation += truckState.speed * delta / 0.56;
  truckVisual.wheels.forEach(({ wheel, hub }) => {
    wheel.rotation.set(truckState.wheelRotation, 0, Math.PI / 2);
    hub.rotation.set(truckState.wheelRotation, 0, Math.PI / 2);
  });
  truckVisual.frontWheels.forEach((pivot) => { pivot.rotation.y = truckState.steering; });
  const flash = state.emergencyLights && Math.floor(performance.now() / 125) % 2 === 0;
  truckVisual.beacons.forEach((beacon, index) => {
    beacon.visible = !state.emergencyLights || flash === (index % 2 === 0);
    beacon.material.emissiveIntensity = state.emergencyLights ? 3.1 : 0.35;
  });
  updateVehicleAudio();
}

function updateGameplayCamera(delta, snap = false) {
  if (!gameplayReady || (state.mode !== 'onFoot' && state.mode !== 'driving')) return;
  const driving = state.mode === 'driving';
  const active = driving ? fireTruckActor.position : playerActor.position;
  const activeHeading = driving ? truckState.heading : playerHeading;
  const activeDirection = directionFromHeading(activeHeading);
  const speedRatio = driving ? Math.min(1, Math.abs(truckState.speed) / TRUCK_TUNING.maximumForwardSpeed) : 0;
  const lookAhead = driving ? 2.2 + speedRatio * 5.5 : 0.6;
  gameplayDesiredTarget.set(
    active.x + activeDirection.x * lookAhead,
    active.y + (driving ? 1.75 : PLAYER_TUNING.cameraHeight),
    active.z + activeDirection.z * lookAhead,
  );
  if (!driving) {
    const truckDistance = Math.hypot(active.x - truckState.x, active.z - truckState.z);
    if (truckDistance < 12) {
      gameplayDesiredTarget.x = THREE.MathUtils.lerp(gameplayDesiredTarget.x, truckState.x, 0.25);
      gameplayDesiredTarget.z = THREE.MathUtils.lerp(gameplayDesiredTarget.z, truckState.z, 0.25);
    }
  }
  const mobileCameraScale = !driving && innerWidth < 520 ? 1.45 : 1;
  const baseDistance = (driving ? TRUCK_TUNING.chaseDistance : PLAYER_TUNING.cameraDistance) * mobileCameraScale;
  const baseHeight = driving ? TRUCK_TUNING.chaseHeight : 0.7;
  const distance = baseDistance * state.gameplayCameraDistanceScale;
  const horizontalDistance = Math.cos(state.gameplayPitch) * distance;
  const cameraDirection = directionFromHeading(state.gameplayYaw);
  gameplayDesiredCamera.set(
    gameplayDesiredTarget.x - cameraDirection.x * horizontalDistance,
    gameplayDesiredTarget.y + baseHeight - Math.sin(state.gameplayPitch) * distance,
    gameplayDesiredTarget.z - cameraDirection.z * horizontalDistance,
  );
  const cameraGround = terrainHeightAtWorld(gameplayDesiredCamera.x, gameplayDesiredCamera.z) + 0.65;
  gameplayDesiredCamera.y = Math.max(gameplayDesiredCamera.y, cameraGround);
  const positionResponse = driving ? TRUCK_TUNING.cameraPositionResponse : PLAYER_TUNING.cameraPositionResponse;
  const targetResponse = driving ? TRUCK_TUNING.cameraTargetResponse : PLAYER_TUNING.cameraTargetResponse;
  const positionAlpha = snap ? 1 : 1 - Math.exp(-positionResponse * delta);
  const targetAlpha = snap ? 1 : 1 - Math.exp(-targetResponse * delta);
  camera.position.lerp(gameplayDesiredCamera, positionAlpha);
  gameplayCameraTarget.lerp(gameplayDesiredTarget, targetAlpha);
  camera.lookAt(gameplayCameraTarget);
  const targetFov = driving ? 58 + speedRatio * 7 : 58;
  const nextFov = exponentialStep(camera.fov, targetFov, 3.8, delta);
  if (Math.abs(nextFov - camera.fov) > 0.01) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }
}

function updateGameplayHud() {
  if (!gameplayReady) return;
  const driving = state.mode === 'driving';
  const focus = driving ? fireTruckActor.position : playerActor.position;
  const surface = gameplaySurfaceAt(focus.x, focus.z, driving ? truckState.y : playerActor.position.y);
  const nearStation = Math.hypot(focus.x - fireStationWorld.x, focus.z - fireStationWorld.z) < 80;
  const label = !surface.onRoad && nearStation
    ? 'Fire Station 1 apron'
    : surface.name || (surface.onRoad ? 'Peterborough street' : 'Off road');
  if (label !== lastRoadLabel) {
    lastRoadLabel = label;
    els.gameplayRoad.textContent = label;
  }
  els.gameplayRole.textContent = driving ? 'Peterborough Engine 1' : 'Firefighter · On foot';
  els.gameplaySpeed.textContent = String(Math.round(Math.abs(truckState.speed) * 3.6)).padStart(3, '0');
  els.gameplayGear.textContent = Math.abs(truckState.speed) < 0.18 ? 'N' : truckState.speed < 0 ? 'R' : 'D';
  let prompt = '';
  if (state.mode === 'onFoot') {
    const distance = Math.hypot(playerActor.position.x - truckState.x, playerActor.position.z - truckState.z);
    if (distance <= PLAYER_TUNING.enterDistance) prompt = '<kbd>E</kbd> Enter Peterborough Engine 1';
  } else if (driving && Math.abs(truckState.speed) <= TRUCK_TUNING.exitSpeed) {
    prompt = '<kbd>E</kbd> Exit fire truck';
  }
  els.interactionPrompt.innerHTML = prompt;
  els.interactionPrompt.classList.toggle('is-visible', Boolean(prompt));
  document.documentElement.dataset.gameplaySpeedKmh = String(Math.round(Math.abs(truckState.speed) * 3.6));
  document.documentElement.dataset.gameplayOnRoad = String(surface.onRoad);
}

function enterOrExitVehicle() {
  if (!gameplayReady) return;
  if (state.mode === 'onFoot') {
    const distance = Math.hypot(playerActor.position.x - truckState.x, playerActor.position.z - truckState.z);
    if (distance > PLAYER_TUNING.enterDistance) {
      showToast('Move closer to Peterborough Engine 1');
      return;
    }
    playerActor.visible = false;
    playerVelocity.set(0, 0, 0);
    state.gameplayYaw = 0;
    state.gameplayLastLookTime = performance.now();
    state.gameplayPitch = -0.17;
    setMode('driving', true);
    ensureVehicleAudio();
    showToast('Peterborough Engine 1 ready');
    return;
  }
  if (state.mode !== 'driving') return;
  if (Math.abs(truckState.speed) > TRUCK_TUNING.exitSpeed) {
    showToast('Stop the truck before exiting');
    return;
  }
  const right = { x: Math.cos(truckState.heading), z: -Math.sin(truckState.heading) };
  const exitX = truckState.x + right.x * 2.45;
  const exitZ = truckState.z + right.z * 2.45;
  const surface = gameplaySurfaceAt(exitX, exitZ, truckState.y);
  playerActor.position.set(exitX, surface.height + 0.025, exitZ);
  playerHeading = truckState.heading;
  playerActor.rotation.y = playerHeading;
  playerActor.visible = true;
  state.gameplayYaw = truckState.heading;
  state.gameplayPitch = -0.19;
  setMode('onFoot', true);
}

function updateLocation() {
  const now = performance.now();
  if (now - lastLocationUpdate < 250) return;
  lastLocationUpdate = now;
  const focus = gameplayReady && state.mode === 'onFoot'
    ? playerActor.position
    : gameplayReady && state.mode === 'driving'
      ? fireTruckActor.position
      : camera.position;
  const geo = unproject(focus.x, focus.z);
  els.coordinates.textContent = `${Math.abs(geo.lat).toFixed(4)}° ${geo.lat >= 0 ? 'N' : 'S'}, ${Math.abs(geo.lon).toFixed(4)}° ${geo.lon >= 0 ? 'E' : 'W'}`;
  updateReferencePanel(geo);
  const groundY = terrainHeightAtWorld(focus.x, focus.z);
  els.altitude.textContent = `${Math.max(0, Math.round(focus.y - groundY))} m AGL`;

  let nearest = LANDMARKS[0];
  let nearestDistance = Infinity;
  for (const landmark of state.locationPlaces) {
    const p = project(landmark.lat, landmark.lon);
    const distance = Math.hypot(focus.x - p.x, focus.z - p.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = landmark;
    }
  }
  els.locationName.textContent = nearestDistance < 750 ? nearest.name : 'Peterborough City Explorer';
}

function updateReferencePanel(geo = unproject(camera.position.x, camera.position.z)) {
  if (!els.referencePanel || els.referencePanel.hidden) return;
  const lat = Number(geo.lat).toFixed(6);
  const lon = Number(geo.lon).toFixed(6);
  const absoluteElevation = terrain.baseElevation + terrainHeightAtWorld(camera.position.x, camera.position.z) / CITY.terrainExaggeration;
  els.referencePosition.textContent = `${lat}, ${lon} · Ontario elevation ${Math.round(absoluteElevation)} m`;
  els.referenceMapillary.href = `https://www.mapillary.com/app/?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}&z=17`;
  const service = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_Imagery/Ontario_Imagery_Web_Map_Service_Source/MapServer';
  els.referenceOntario.href = `https://www.arcgis.com/apps/mapviewer/index.html?url=${encodeURIComponent(service)}&center=${encodeURIComponent(`${lon},${lat}`)}&level=17`;
}

function toggleReferencePanel(force) {
  if (!els.referencePanel) return;
  const visible = force ?? els.referencePanel.hidden;
  els.referencePanel.hidden = !visible;
  if (visible) updateReferencePanel();
  showToast(visible ? 'Lawful city reference links visible' : 'City reference links hidden');
}

function updateSurveyStatus(message = '') {
  if (!els.surveyStatus) return;
  const sourceSummary = semanticSurveyCollection ? semanticSurveySummary(semanticSurveyCollection) : { total: 0, reviewed: 0, sourceAligned: 0 };
  els.surveyStatus.textContent = message || `${sourceSummary.reviewed} reviewed details · ${sourceSummary.sourceAligned} authoritative inventory features · ${semanticSurveyDrafts.length} local drafts`;
  document.documentElement.dataset.semanticSurveyFeatures = String(sourceSummary.total);
  document.documentElement.dataset.semanticSurveyDrafts = String(semanticSurveyDrafts.length);
}

function createSurveyDraftMarker(feature) {
  if (feature?.geometry?.type !== 'Point') return null;
  const [lon, lat] = feature.geometry.coordinates.map(Number);
  const point = project(lat, lon);
  const ground = terrainHeightAtWorld(point.x, point.y);
  const marker = new THREE.Group();
  marker.position.set(point.x, ground, point.y);
  const verified = feature.properties?.review_status === 'verified';
  marker.userData = { type: verified ? 'semantic-survey-verified-marker' : 'semantic-survey-draft-marker', surveyFeatureId: feature.id };
  const material = new THREE.MeshBasicMaterial({ color: verified ? 0x60e7c5 : 0xffd65a, depthTest: false, transparent: true, opacity: 0.95 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2, 7), material);
  stem.position.y = 2.1;
  stem.renderOrder = 10002;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 10, 7), material);
  head.position.y = 4.45;
  head.renderOrder = 10002;
  marker.add(stem, head);
  surveyMarkerGroup.add(marker);
  return marker;
}

function persistSurveyDrafts() {
  try { localStorage.setItem('ptbo-semantic-survey-drafts-v1', JSON.stringify(semanticSurveyDrafts)); } catch { /* Private browsing may disable storage. */ }
  updateSurveyStatus();
}

function restoreSurveyDrafts() {
  try {
    const parsed = JSON.parse(localStorage.getItem('ptbo-semantic-survey-drafts-v1') || '[]');
    if (!Array.isArray(parsed)) return;
    parsed.forEach((feature) => {
      if (feature?.geometry?.type !== 'Point') return;
      semanticSurveyDrafts.push(feature);
      createSurveyDraftMarker(feature);
    });
  } catch { /* Invalid local drafts are ignored rather than blocking the city. */ }
}

async function initializeSemanticSurvey() {
  try {
    const [response, inventoryResponse] = await Promise.all([
      fetch(new URL('data/survey/station-one-survey.geojson', import.meta.url), { cache: 'no-store' }),
      fetch(new URL('data/survey/station-one-district-inventory.geojson', import.meta.url), { cache: 'no-store' }),
    ]);
    if (!response.ok) throw new Error(`Semantic survey returned ${response.status}`);
    const siteCollection = await response.json();
    const inventoryCollection = inventoryResponse.ok
      ? await inventoryResponse.json()
      : { metadata: { id: 'unavailable' }, features: [] };
    const collection = {
      ...siteCollection,
      metadata: {
        ...siteCollection.metadata,
        district_inventory: {
          id: inventoryCollection.metadata?.id,
          generated_at: inventoryCollection.metadata?.generated_at,
          coverage: inventoryCollection.metadata?.coverage,
        },
      },
      features: [...siteCollection.features, ...(inventoryCollection.features || [])],
    };
    const validation = validateSemanticSurvey(collection);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    semanticSurveyCollection = collection;
    const summary = createSemanticSurveyLayer({
      THREE,
      group: semanticSurveyGroup,
      collection,
      project,
      terrainHeightAtWorld,
      lowPower: lowPowerProfile,
    });
    semanticSurveyOverlay = createOrthophotoOverlay({
      THREE,
      definition: collection.metadata.reference_overlay,
      project,
      terrainHeightAtWorld,
    });
    if (semanticSurveyOverlay) world.add(semanticSurveyOverlay);
    state.objectCount += summary.rendered;
    collection.features.forEach((feature) => {
      if (feature.properties?.review_status === 'verified') createSurveyDraftMarker(feature);
    });
    restoreSurveyDrafts();
    updateSurveyStatus();
    document.documentElement.dataset.semanticSurveyStatus = 'ready';
    document.documentElement.dataset.accuracyDistrictFeatures = String(inventoryCollection.features?.length || 0);
    document.documentElement.dataset.accuracyDistrictAreaM2 = String(inventoryCollection.metadata?.coverage?.target_area_m2 || 0);
    globalThis.__PTBO_SEMANTIC_SURVEY__ = Object.freeze({
      validation,
      summary: () => ({ ...semanticSurveySummary(semanticSurveyCollection), drafts: semanticSurveyDrafts.length }),
      source: { ...collection.metadata.source },
    });
    return summary;
  } catch (error) {
    console.warn('Semantic accuracy layer unavailable; the authoritative base city remains active.', error);
    document.documentElement.dataset.semanticSurveyStatus = 'failed';
    updateSurveyStatus('Survey layer unavailable');
    return null;
  }
}

function activateSemanticSurveyMode(force = true) {
  if (!semanticSurveyCollection || !els.surveyPanel) return false;
  semanticSurveyActive = force;
  els.surveyPanel.hidden = !force;
  surveyMarkerGroup.visible = force;
  if (semanticSurveyOverlay) semanticSurveyOverlay.visible = force && Boolean(els.surveyOverlayVisible?.checked);
  if (!force) {
    semanticSurveyPlacing = false;
    els.surveyAddPoint?.classList.remove('is-active');
    showToast('Semantic survey mode closed');
    return true;
  }
  setMode('map');
  const station = project(FIRE_STATION_ONE.buildingLat, FIRE_STATION_ONE.buildingLon);
  const ground = terrainHeightAtWorld(station.x, station.y);
  const overlayBounds = semanticSurveyCollection.metadata.reference_overlay?.bounds;
  const southwest = overlayBounds ? project(overlayBounds.south, overlayBounds.west) : null;
  const northeast = overlayBounds ? project(overlayBounds.north, overlayBounds.east) : null;
  const surveySpan = southwest && northeast ? Math.max(Math.abs(northeast.x - southwest.x), Math.abs(northeast.y - southwest.y)) : 260;
  camera.position.set(station.x, ground + Math.max(265, surveySpan * 1.08), station.y);
  camera.up.set(0, 0, -1);
  camera.lookAt(station.x, ground, station.y);
  streetLabelGroup.visible = false;
  updateMapGuide();
  updateSurveyStatus();
  showToast('Semantic survey mode · Ontario orthophoto alignment');
  return true;
}

function addSemanticSurveyPoint(event) {
  if (!semanticSurveyActive || !semanticSurveyPlacing || state.mode !== 'map') return false;
  const bounds = els.canvas.getBoundingClientRect();
  surveyPointer.set(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
  );
  surveyRaycaster.setFromCamera(surveyPointer, camera);
  const hit = surveyRaycaster.intersectObjects(terrainGroup.children, true)[0];
  if (!hit) {
    showToast('No terrain found under this marker');
    return false;
  }
  const geo = unproject(hit.point.x, hit.point.z);
  const requestedType = els.surveyFeatureType?.value || 'tree';
  const semanticType = SEMANTIC_POINT_TYPES.includes(requestedType) ? requestedType : 'tree';
  const feature = createDraftPointFeature({
    id: `draft-${semanticType}-${Date.now()}`,
    semanticType,
    lon: geo.lon,
    lat: geo.lat,
  });
  semanticSurveyDrafts.push(feature);
  createSurveyDraftMarker(feature);
  persistSurveyDrafts();
  semanticSurveyPlacing = false;
  els.surveyAddPoint?.classList.remove('is-active');
  showToast(`${semanticType.replaceAll('_', ' ')} point recorded`);
  return true;
}

function undoSemanticSurveyPoint() {
  if (!semanticSurveyDrafts.length) return false;
  const removed = semanticSurveyDrafts.pop();
  const marker = surveyMarkerGroup.children.find((child) => child.userData?.surveyFeatureId === removed.id);
  if (marker) {
    const materials = new Set();
    marker.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
      else if (child.material) materials.add(child.material);
    });
    materials.forEach((material) => material.dispose?.());
    marker.removeFromParent();
  }
  persistSurveyDrafts();
  showToast('Last survey point removed');
  return true;
}

function exportSemanticSurveyDrafts() {
  if (!semanticSurveyCollection) return false;
  const output = {
    type: 'FeatureCollection',
    metadata: {
      ...semanticSurveyCollection.metadata,
      id: `${semanticSurveyCollection.metadata.id}-developer-draft`,
      exported_at: new Date().toISOString(),
      draft_only: true,
    },
    features: semanticSurveyDrafts,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/geo+json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'peterborough-semantic-survey-draft.geojson';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Survey draft exported as GeoJSON');
  return true;
}

function updateFps() {
  frameCounter += 1;
  const now = performance.now();
  const elapsed = now - frameWindowStarted;
  if (elapsed >= 700) {
    const measuredFps = Math.round(frameCounter * 1000 / elapsed);
    els.fps.textContent = `${measuredFps} FPS`;
    document.documentElement.dataset.measuredFps = String(measuredFps);
    document.documentElement.dataset.drawCalls = String(renderer.info.render.calls);
    document.documentElement.dataset.renderTriangles = String(renderer.info.render.triangles);
    document.documentElement.dataset.gpuGeometries = String(renderer.info.memory.geometries);
    document.documentElement.dataset.gpuTextures = String(renderer.info.memory.textures);
    frameCounter = 0;
    frameWindowStarted = now;
  }
}

const FAR_BUILDING_DETAIL_MATERIALS = new Set([
  'facadeTrim', 'storefrontGlass', 'windowGlass', 'windowWarm',
]);
const BUILDING_ROOF_MATERIALS = new Set(['roofDark', 'roofClay', 'roofMetal']);
const NEAR_STREETSCAPE_TYPES = new Set([
  'official-curb-ribbons', 'terrain-following-urban-curbs',
  'mapped-turn-arrows', 'mapped-crossing-bars', 'mapped-crossing-lines', 'mapped-crossing-dots',
  'mapped-street-name-signs', 'street-sign-posts', 'street-lamp-poles', 'street-lamp-heads',
  'traffic-signal-poles', 'traffic-signal-heads', 'traffic-signal-backs', 'traffic-signal-arms',
  'vertical-slice-rooftop-equipment',
]);
let cityVisualLod = '';

function distanceToRenderTile(object) {
  const tile = object.userData?.tile;
  const tileSize = Number(object.userData?.tileSize);
  if (!tile || !Number.isFinite(tileSize)) return 0;
  const centerX = CITY.worldBounds.minX + (tile.x + 0.5) * tileSize;
  const centerZ = CITY.worldBounds.minZ + (tile.z + 0.5) * tileSize;
  return Math.hypot(camera.position.x - centerX, camera.position.z - centerZ);
}

function updateCityVisualLod() {
  const ground = terrainHeightAtWorld(camera.position.x, camera.position.z);
  const altitude = Math.max(0, camera.position.y - ground);
  const nearDetail = altitude < 115 && state.mode !== 'map';
  const tier = state.mode === 'map' ? 'map' : nearDetail ? 'street' : 'overview';
  const lodKey = `${tier}:${Math.floor(camera.position.x / 600)}:${Math.floor(camera.position.z / 600)}`;
  if (lodKey === cityVisualLod) return;
  cityVisualLod = lodKey;

  buildingGroup.children.forEach((object) => {
    if (state.mode === 'map') {
      object.visible = false;
      return;
    }
    if (object.userData?.type === 'vertical-slice-rooftop-equipment') object.visible = nearDetail;
    else if (object.userData?.type === 'building-batch' && object.userData.tile) {
      const distance = distanceToRenderTile(object);
      if (FAR_BUILDING_DETAIL_MATERIALS.has(object.userData.material)) {
        object.visible = nearDetail && distance < 2200;
      } else if (BUILDING_ROOF_MATERIALS.has(object.userData.material)) {
        object.visible = distance < (state.mode === 'map' ? 14000 : 9400);
      } else {
        // Full wall volumes are retained around the player. Far districts keep
        // their exact roof footprint as a much cheaper aerial silhouette.
        object.visible = distance < (nearDetail ? 4200 : 3000);
      }
    }
  });

  // Authoritative road geometry remains loaded and queryable, but only tiles
  // that can contribute visible pixels are submitted. Map mode keeps the
  // complete network, while street and fly views use the atmospheric horizon.
  const roadRadius = nearDetail ? 5600 : 9000;
  roadGroup.children.forEach((object) => {
    if (state.mode === 'map') {
      object.visible = false;
      return;
    }
    if (object.userData?.tile && object.userData?.tileSize) {
      object.visible = distanceToRenderTile(object) < roadRadius;
    }
  });

  streetscapeGroup.children.forEach((object) => {
    if (!NEAR_STREETSCAPE_TYPES.has(object.userData?.type)) return;
    const tiled = object.userData?.tile && object.userData?.tileSize;
    object.visible = nearDetail && (!tiled || distanceToRenderTile(object) < 3500);
  });
  vegetationGroup.children.forEach((object) => {
    if (state.mode === 'map') object.visible = false;
    else if (object.userData?.lodRole === 'near') object.visible = nearDetail;
    else if (object.userData?.lodRole === 'far') object.visible = !nearDetail;
  });
  gameplayGroup.visible = state.mode !== 'map';
  landmarkGroup.visible = state.mode !== 'map';
  semanticSurveyGroup.visible = state.mode !== 'map' || semanticSurveyActive;
  if (!lowPowerProfile) sun.castShadow = nearDetail;
  document.documentElement.dataset.cityDetailLod = tier;
}

function freezeStaticCityTransforms() {
  [terrainGroup, roadGroup, mapRoadGroup, buildingGroup, vegetationGroup, streetscapeGroup, streetLabelGroup]
    .forEach((group) => {
      group.updateMatrixWorld(true);
      group.traverse((object) => {
        object.updateMatrix();
        object.matrixAutoUpdate = false;
      });
    });
  document.documentElement.dataset.staticTransformsFrozen = 'true';
}

function animate() {
  if (document.hidden) {
    animationFrameId = 0;
    return;
  }
  const delta = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'fly') updateFlyControls(delta);
  else if (state.mode === 'map') updateMapControls(delta);
  else {
    if (state.mode === 'onFoot') updatePlayerActor(delta);
    updateFireTruck(delta);
    updateGameplayCamera(delta);
    updateGameplayHud();
  }
  updateCityVisualLod();
  updateLocation();
  updateFps();
  atmosphere.mesh.position.copy(camera.position);
  if (sun.castShadow) {
    const ground = terrainHeightAtWorld(camera.position.x, camera.position.z);
    sunTarget.position.set(camera.position.x, ground, camera.position.z);
    sun.position.set(camera.position.x - 1200, ground + 2200, camera.position.z + 900);
    sunTarget.updateMatrixWorld();
  }
  citySplatLayer?.update(camera, performance.now());
  if (animatedFountain) animatedFountain.scale.y = 1 + Math.sin(performance.now() * 0.0018) * 0.018;
  renderer.render(scene, camera);
  animationFrameId = requestAnimationFrame(animate);
}

function jumpTo(lat, lon, altitude = 105, name = 'Selected location') {
  const p = project(lat, lon);
  const groundY = terrainHeightAtWorld(p.x, p.y);
  state.mode = 'fly';
  state.lastNonMapMode = 'fly';
  els.app.classList.remove('is-map');
  camera.near = 0.5;
  camera.updateProjectionMatrix();
  mapRoadGroup.visible = false;
  stopFlyMotion();
  state.dragLooking = false;
  state.dragPointerId = null;
  state.previousPointer = null;
  streetLabelGroup.visible = false;
  camera.up.set(0, 1, 0);
  camera.position.set(p.x + 110, groundY + altitude, p.y + 180);
  // Three.js fly-forward is local -Z. Aim back from the southeast camera
  // offset toward the selected landmark; the previous signs pointed exactly
  // away from every quick-travel destination.
  state.yaw = flyYawToward(camera.position.x, camera.position.z, p.x, p.y);
  state.pitch = -0.28;
  state.lastFlyPosition.copy(camera.position);
  state.lastFlyYaw = state.yaw;
  state.lastFlyPitch = state.pitch;
  els.flyMode.classList.add('is-active');
  els.mapMode.classList.remove('is-active');
  els.locationName.textContent = name;
  syncGameplayRootClasses();
  updateMouseLookUi();
  els.canvas.focus({ preventScroll: true });
  showToast(`Travelling to ${name}`);
}

function exposeCityQualityQa() {
  const qualityParams = new URLSearchParams(location.search);
  if (!qualityParams.has('qa') && !(qualityParams.has('qaLat') && qualityParams.has('qaLon'))) return;
  const setView = ({ lat, lon, altitude = 22, distance = 58, bearing = 145, pitch = -0.14 } = {}) => {
    if (![lat, lon, altitude, distance, bearing, pitch].every(Number.isFinite)) return false;
    const target = project(lat, lon);
    const radians = THREE.MathUtils.degToRad(bearing);
    const ground = terrainHeightAtWorld(target.x, target.y);
    state.mode = 'fly';
    els.app.classList.remove('is-map');
    mapRoadGroup.visible = false;
    streetLabelGroup.visible = false;
    stopFlyMotion();
    camera.up.set(0, 1, 0);
    camera.position.set(
      target.x + Math.sin(radians) * distance,
      ground + altitude,
      target.y - Math.cos(radians) * distance,
    );
    state.yaw = flyYawToward(camera.position.x, camera.position.z, target.x, target.y);
    state.pitch = THREE.MathUtils.clamp(pitch, FLY_TUNING.pitchMinimum, FLY_TUNING.pitchMaximum);
    state.lastFlyPosition.copy(camera.position);
    state.lastFlyYaw = state.yaw;
    state.lastFlyPitch = state.pitch;
    return true;
  };
  window.__PTBO_CITY_QA__ = Object.freeze({
    setView,
    metrics() {
      return {
        drawCalls: renderer.info.render.calls,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        triangles: renderer.info.render.triangles,
        verticalSliceBounds: { ...verticalSliceBounds },
      };
    },
  });
  // A DOM bridge keeps automated street-level visual QA available even when a
  // browser harness evaluates scripts in an isolated JavaScript world.
  const qaRoot = document.documentElement;
  const qaObserver = new MutationObserver((records) => {
    if (!records.some((record) => record.attributeName === 'data-city-quality-qa-view')) return;
    const data = document.documentElement.dataset;
    setView({
      lat: Number(data.cityQualityQaLat),
      lon: Number(data.cityQualityQaLon),
      altitude: Number(data.cityQualityQaAltitude || 22),
      distance: Number(data.cityQualityQaDistance || 58),
      bearing: Number(data.cityQualityQaBearing || 145),
      pitch: Number(data.cityQualityQaPitch || -0.14),
    });
  });
  if (qaRoot) {
    qaObserver.observe(qaRoot, { attributes: true });
    qaRoot.dataset.cityQualityQa = 'ready';
  }
}

function populateLandmarks() {
  els.landmarkList.innerHTML = '';
  LANDMARKS.forEach((landmark) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'result-button';
    button.innerHTML = `<strong>${escapeHtml(landmark.name)}</strong><span>${escapeHtml(landmark.category)}</span><em>→</em>`;
    button.addEventListener('click', () => {
      els.landmarksDialog.close();
      jumpTo(landmark.lat, landmark.lon, landmark.altitude, landmark.name);
    });
    els.landmarkList.append(button);
  });
}

async function searchLocations(query) {
  const normalized = query.trim().toLowerCase();
  els.searchResults.innerHTML = '';
  const localMatches = [...LANDMARKS, ...state.localPlaces]
    .filter((landmark, index, entries) => entries.findIndex((candidate) => candidate.name === landmark.name && candidate.lat === landmark.lat && candidate.lon === landmark.lon) === index)
    .filter((landmark) => `${landmark.name} ${landmark.category} ${landmark.address || ''}`.toLowerCase().includes(normalized))
    .slice(0, 12);
  localMatches.forEach(addSearchResult);
  if (localMatches.length >= 4) return;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '6');
  url.searchParams.set('countrycodes', 'ca');
  url.searchParams.set('viewbox', '-78.40,44.39,-78.24,44.24');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('q', `${query}, Peterborough, Ontario`);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Search returned ${response.status}`);
    const results = await response.json();
    const known = new Set(localMatches.map((item) => item.name.toLowerCase()));
    results.forEach((result) => {
      const name = result.display_name?.split(',').slice(0, 3).join(', ') || 'Search result';
      if (known.has(name.toLowerCase())) return;
      addSearchResult({
        name,
        category: result.type || result.class || 'OpenStreetMap result',
        lat: Number.parseFloat(result.lat),
        lon: Number.parseFloat(result.lon),
        altitude: 32,
      });
    });
    if (!els.searchResults.children.length) els.searchResults.innerHTML = '<p>No matching Peterborough locations were found.</p>';
  } catch (error) {
    console.warn(error);
    if (!els.searchResults.children.length) els.searchResults.innerHTML = '<p>Address search is temporarily unavailable. Try one of the built-in landmarks.</p>';
  }
}

function addSearchResult(result) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'result-button';
  button.innerHTML = `<strong>${escapeHtml(result.name)}</strong><span>${escapeHtml(result.category || 'Peterborough')}</span><em>→</em>`;
  button.addEventListener('click', () => {
    els.searchDialog.close();
    // Street/address searches arrive at neighbourhood-inspection height so
    // façades, curbs, and signs are readable. Authored landmarks retain their
    // own overview altitude, and the road-centred result keeps this safely
    // clear of ordinary buildings and tree canopies.
    jumpTo(result.lat, result.lon, result.altitude || 32, result.name);
  });
  els.searchResults.append(button);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function setTheme(theme) {
  state.theme = theme;
  citySplatLayer?.setEnvironmentTheme(theme);
  atmosphere.setTheme(theme);
  if (theme === 'night') {
    scene.background.set(0x030a10);
    scene.fog.color.set(0x030a10);
    scene.fog.density = 0.00014;
    ambient.color.set(0x617898);
    ambient.groundColor.set(0x0b120f);
    ambient.intensity = 0.62;
    sun.color.set(0x6782a4);
    sun.intensity = 0.45;
    materials.lampLens.emissiveIntensity = 2.5;
    materials.signalRed.emissiveIntensity = 1.9;
    materials.signalGreen.emissiveIntensity = 0.8;
    materials.roadPaintYellow.emissiveIntensity = 0.46;
    materials.roadPaintWhite.emissiveIntensity = 0.32;
    materials.windowGlass.emissiveIntensity = 0.2;
    materials.windowWarm.emissiveIntensity = 1.45;
    materials.storefrontGlass.emissiveIntensity = 0.42;
    els.timeButton.textContent = 'Daylight';
  } else if (theme === 'day') {
    scene.background.set(0x9bb6bd);
    scene.fog.color.set(0x9bb6bd);
    scene.fog.density = 0.000068;
    ambient.color.set(0xe3f2eb);
    ambient.groundColor.set(0x52644f);
    ambient.intensity = 1.5;
    sun.color.set(0xffefd1);
    sun.intensity = 2.8;
    materials.lampLens.emissiveIntensity = 0.12;
    materials.signalRed.emissiveIntensity = 0.6;
    materials.signalGreen.emissiveIntensity = 0.42;
    materials.roadPaintYellow.emissiveIntensity = 0.03;
    materials.roadPaintWhite.emissiveIntensity = 0.025;
    materials.windowGlass.emissiveIntensity = 0.05;
    materials.windowWarm.emissiveIntensity = 0.06;
    materials.storefrontGlass.emissiveIntensity = 0.06;
    els.timeButton.textContent = 'Dusk';
  } else {
    scene.background.set(0x07151d);
    scene.fog.color.set(0x07151d);
    scene.fog.density = 0.000105;
    ambient.color.set(0xbfd7cf);
    ambient.groundColor.set(0x162319);
    ambient.intensity = 1.22;
    sun.color.set(0xffddb2);
    sun.intensity = 2.1;
    materials.lampLens.emissiveIntensity = 1.1;
    materials.signalRed.emissiveIntensity = 1.15;
    materials.signalGreen.emissiveIntensity = 0.58;
    materials.roadPaintYellow.emissiveIntensity = 0.2;
    materials.roadPaintWhite.emissiveIntensity = 0.14;
    materials.windowGlass.emissiveIntensity = 0.12;
    materials.windowWarm.emissiveIntensity = 0.75;
    materials.storefrontGlass.emissiveIntensity = 0.2;
    els.timeButton.textContent = 'Night';
  }
}

function cycleTheme() {
  const next = state.theme === 'dusk' ? 'night' : state.theme === 'night' ? 'day' : 'dusk';
  setTheme(next);
}

function toggleSound() {
  if (!ambientAudio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      showToast('Web Audio is unavailable in this browser');
      return;
    }
    const context = new AudioContextClass();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    oscillator.type = 'sine';
    oscillator.frequency.value = 52;
    filter.type = 'lowpass';
    filter.frequency.value = 140;
    gain.gain.value = 0.018;
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start();
    ambientAudio = { context, gain, oscillator, enabled: true };
    els.soundButton.textContent = 'Sound on';
    ensureVehicleAudio();
    showToast('Ambient city sound enabled');
    return;
  }
  ambientAudio.enabled = !ambientAudio.enabled;
  ambientAudio.gain.gain.setTargetAtTime(ambientAudio.enabled ? 0.018 : 0, ambientAudio.context.currentTime, 0.08);
  if (ambientAudio.enabled) ensureVehicleAudio();
  updateVehicleAudio();
  els.soundButton.textContent = ambientAudio.enabled ? 'Sound on' : 'Sound off';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}

function onPointerMove(event) {
  if (!state.pointerLocked || state.mode === 'map') return;
  if (state.mode === 'fly') {
    const look = applyFlyLookDelta(state.yaw, state.pitch, event.movementX, event.movementY);
    state.yaw = look.yaw;
    state.pitch = look.pitch;
  } else {
    state.gameplayYaw = wrapFlyYaw(state.gameplayYaw - event.movementX * 0.0023);
    state.gameplayPitch = THREE.MathUtils.clamp(state.gameplayPitch - event.movementY * 0.0019, -0.68, 0.28);
    state.gameplayLastLookTime = performance.now();
  }
}

function requestMouseLook() {
  if (state.mode === 'map' || document.pointerLockElement === els.canvas || !els.canvas.requestPointerLock) return;
  const reportFailure = () => showToast('Mouse capture unavailable — hold and drag on the city to look around');
  const requestStandardLock = () => {
    try {
      const request = els.canvas.requestPointerLock();
      request?.catch?.(reportFailure);
    } catch {
      reportFailure();
    }
  };
  try {
    const request = els.canvas.requestPointerLock({ unadjustedMovement: true });
    request?.catch?.(requestStandardLock);
  } catch {
    requestStandardLock();
  }
}

function beginCanvasLook(event) {
  const mouseLikePointer = event.pointerType === 'mouse' || matchMedia('(any-pointer: fine)').matches;
  if (state.mode === 'map' || !mouseLikePointer || ![0, 2].includes(event.button)) return;
  els.canvas.focus({ preventScroll: true });
  state.dragLooking = true;
  state.dragPointerId = event.pointerId;
  state.previousPointer = { x: event.clientX, y: event.clientY };
  try { els.canvas.setPointerCapture(event.pointerId); } catch { /* Pointer lock can supersede capture. */ }
  if (event.button === 0) requestMouseLook();
  if (event.button === 2) event.preventDefault();
  updateMouseLookUi();
}

function updateCanvasDrag(event) {
  if (!state.dragLooking || state.pointerLocked || state.dragPointerId !== event.pointerId || !state.previousPointer) return;
  const dx = event.clientX - state.previousPointer.x;
  const dy = event.clientY - state.previousPointer.y;
  if (state.mode === 'fly') {
    const look = applyFlyLookDelta(state.yaw, state.pitch, dx, dy);
    state.yaw = look.yaw;
    state.pitch = look.pitch;
  } else {
    state.gameplayYaw = wrapFlyYaw(state.gameplayYaw - dx * 0.0042);
    state.gameplayPitch = THREE.MathUtils.clamp(state.gameplayPitch - dy * 0.0034, -0.68, 0.28);
    state.gameplayLastLookTime = performance.now();
  }
  state.previousPointer = { x: event.clientX, y: event.clientY };
}

function endCanvasLook(event) {
  if (state.dragPointerId !== event.pointerId) return;
  state.dragLooking = false;
  state.dragPointerId = null;
  state.previousPointer = null;
  updateMouseLookUi();
}

function onWheel(event) {
  if (state.mode === 'map') {
    event.preventDefault();
    camera.position.y = THREE.MathUtils.clamp(camera.position.y + event.deltaY * 2.2, 500, Math.max(9000, CITY.terrainSize * 1.05));
    updateMapGuide();
  } else if (state.mode === 'fly') {
    event.preventDefault();
    const pixelDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    state.flySpeedScale = adjustFlySpeedScale(state.flySpeedScale, pixelDelta);
    const cruiseSpeed = Math.round(flySpeedFor(state.flySpeedScale));
    updateFlyHint();
    showToast(`Flight speed ${cruiseSpeed} metres per second`);
  } else {
    event.preventDefault();
    state.gameplayCameraDistanceScale = THREE.MathUtils.clamp(
      state.gameplayCameraDistanceScale + Math.sign(event.deltaY) * 0.12,
      0.68,
      1.65,
    );
  }
}

function wireEvents() {
  els.playMode?.addEventListener('click', () => { setMode('play'); els.canvas.focus({ preventScroll: true }); });
  els.flyMode.addEventListener('click', () => { setMode('fly'); els.canvas.focus({ preventScroll: true }); });
  els.mapMode.addEventListener('click', () => { setMode('map'); els.canvas.focus({ preventScroll: true }); });
  els.searchButton.addEventListener('click', () => { stopFlyMotion(); document.exitPointerLock?.(); els.searchDialog.showModal(); setTimeout(() => els.searchInput.focus(), 50); });
  els.landmarksButton.addEventListener('click', () => { stopFlyMotion(); document.exitPointerLock?.(); els.landmarksDialog.showModal(); });
  els.timeButton.addEventListener('click', cycleTheme);
  els.soundButton.addEventListener('click', toggleSound);
  els.splatToggle?.addEventListener('click', () => {
    if (!citySplatLayer) return;
    citySplatLayer.setEnabled(!citySplatLayer.enabled);
    showToast(citySplatLayer.enabled ? 'Captured landmark detail enabled' : 'Mesh-only city enabled');
  });

  els.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (event.submitter?.value === 'cancel') {
      els.searchDialog.close();
      return;
    }
    const query = els.searchInput.value.trim();
    if (query) searchLocations(query);
  });

  [els.searchDialog, els.landmarksDialog].forEach((dialog) => {
    dialog.addEventListener('close', () => {
      stopFlyMotion();
      if (state.mode !== 'map') els.canvas.focus({ preventScroll: true });
    });
  });

  els.canvas.addEventListener('pointerdown', (event) => {
    if (!addSemanticSurveyPoint(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  els.canvas.addEventListener('pointerdown', beginCanvasLook);
  els.canvas.addEventListener('pointermove', updateCanvasDrag);
  els.canvas.addEventListener('pointerup', endCanvasLook);
  els.canvas.addEventListener('pointercancel', endCanvasLook);
  els.canvas.addEventListener('lostpointercapture', endCanvasLook);
  els.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    const wasLocked = state.pointerLocked;
    state.pointerLocked = document.pointerLockElement === els.canvas;
    if (state.pointerLocked) {
      state.dragLooking = false;
      state.dragPointerId = null;
      state.previousPointer = null;
    } else if (wasLocked) {
      stopFlyMotion();
    }
    updateMouseLookUi();
  });
  document.addEventListener('pointerlockerror', () => showToast('Mouse capture unavailable — hold and drag to look around'));
  document.addEventListener('mousemove', onPointerMove);
  els.canvas.addEventListener('wheel', onWheel, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (keyboardInputIsBlocked(event)) return;
    if (!event.repeat && event.code === 'KeyM') {
      setMode(state.mode === 'map' ? state.lastNonMapMode : 'map');
      els.canvas.focus({ preventScroll: true });
    }
    if (!event.repeat && event.code === 'KeyF') {
      setMode('fly');
      els.canvas.focus({ preventScroll: true });
    }
    if (!event.repeat && event.code === 'KeyE' && (state.mode === 'onFoot' || state.mode === 'driving')) {
      enterOrExitVehicle();
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyC' && (state.mode === 'onFoot' || state.mode === 'driving')) {
      cycleGameplayCameraDistance();
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyL' && state.mode === 'driving') {
      state.emergencyLights = !state.emergencyLights;
      showToast(state.emergencyLights ? 'Emergency lights on' : 'Emergency lights off');
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'Slash') els.searchButton.click();
    if (!event.repeat && event.code === 'KeyG' && event.ctrlKey && event.altKey) {
      citySplatLayer?.setDebug(!citySplatLayer.debug);
      showToast(citySplatLayer?.debug ? 'Landmark calibration visible' : 'Landmark calibration hidden');
    }
    if (!event.repeat && event.code === 'KeyR' && event.ctrlKey && event.altKey) {
      toggleReferencePanel();
      event.preventDefault();
    }
    if (!event.repeat && event.code === 'KeyS' && event.ctrlKey && event.altKey) {
      activateSemanticSurveyMode(!semanticSurveyActive);
      event.preventDefault();
    }
    if (isFlyControlCode(event.code)) state.keys.add(event.code);
    if (isFlyControlCode(event.code) || ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));
  window.addEventListener('blur', () => stopFlyMotion());
  window.addEventListener('pagehide', () => citySplatLayer?.dispose(), { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopFlyMotion();
      return;
    }
    clock.start();
    if (!animationFrameId) animate();
  });

  document.querySelectorAll('[data-touch-key]').forEach((button) => {
    const key = button.dataset.touchKey;
    const start = (event) => { event.preventDefault(); state.keys.add(key); };
    const end = (event) => { event.preventDefault(); state.keys.delete(key); };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
  });

  els.surveyAddPoint?.addEventListener('click', () => {
    semanticSurveyPlacing = !semanticSurveyPlacing;
    els.surveyAddPoint.classList.toggle('is-active', semanticSurveyPlacing);
    updateSurveyStatus(semanticSurveyPlacing ? 'Click the orthophoto to record this feature' : 'Point placement cancelled');
  });
  els.surveyUndo?.addEventListener('click', undoSemanticSurveyPoint);
  els.surveyExport?.addEventListener('click', exportSemanticSurveyDrafts);
  els.surveyClose?.addEventListener('click', () => activateSemanticSurveyMode(false));
  els.surveyOverlayVisible?.addEventListener('change', () => {
    if (semanticSurveyOverlay) semanticSurveyOverlay.visible = semanticSurveyActive && els.surveyOverlayVisible.checked;
  });
  els.surveyOverlayOpacity?.addEventListener('input', () => {
    if (semanticSurveyOverlay?.material) semanticSurveyOverlay.material.opacity = Number(els.surveyOverlayOpacity.value);
  });

  els.canvas.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || state.mode === 'map') return;
    state.previousTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  els.canvas.addEventListener('touchmove', (event) => {
    if (!state.previousTouch || event.touches.length !== 1 || state.mode === 'map') return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.previousTouch.x;
    const dy = touch.clientY - state.previousTouch.y;
    if (state.mode === 'fly') {
      state.yaw = wrapFlyYaw(state.yaw - dx * 0.004);
      state.pitch = THREE.MathUtils.clamp(state.pitch - dy * 0.0035, FLY_TUNING.pitchMinimum, FLY_TUNING.pitchMaximum);
    } else {
      state.gameplayYaw = wrapFlyYaw(state.gameplayYaw - dx * 0.004);
      state.gameplayPitch = THREE.MathUtils.clamp(state.gameplayPitch - dy * 0.0035, -0.68, 0.28);
      state.gameplayLastLookTime = performance.now();
    }
    state.previousTouch = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  els.canvas.addEventListener('touchend', () => { state.previousTouch = null; }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.25 : 1.65));
    renderer.setSize(innerWidth, innerHeight, false);
    streetLabelGroup.visible = state.mode === 'map' && innerWidth >= 760;
    updateMapGuide();
  });
  document.documentElement.dataset.flyControls = 'v2';
  syncGameplayRootClasses();
  updateMouseLookUi();
}

populateLandmarks();
wireEvents();
exposeCityQualityQa();
if (new URLSearchParams(location.search).get('referenceMode') === '1') toggleReferencePanel(true);
setTheme('day');
buildCity().catch((error) => {
  globalThis.showPeterboroughExplorerFatalError?.(error);
});
animate();
