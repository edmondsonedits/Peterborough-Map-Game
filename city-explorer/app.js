import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const CITY = {
  name: 'Peterborough, Ontario',
  center: { lat: 44.3091, lon: -78.3197 },
  osmRadius: 3800,
  buildingRadius: 3000,
  terrainSize: 10500,
  terrainSegments: 128,
  terrainZoom: 12,
  terrainExaggeration: 1.22,
};

const LANDMARKS = [
  { name: 'Downtown Peterborough', category: 'District', lat: 44.3091, lon: -78.3197, altitude: 175 },
  { name: 'Peterborough Lift Lock', category: 'National Historic Site', lat: 44.3072, lon: -78.3009, altitude: 150 },
  { name: 'Hunter Street Bridge', category: 'Bridge / East City', lat: 44.3075, lon: -78.3150, altitude: 120 },
  { name: 'Quaker Oats', category: 'Industrial landmark', lat: 44.3078, lon: -78.3120, altitude: 160 },
  { name: 'Millennium Park', category: 'Riverfront park', lat: 44.3046, lon: -78.3184, altitude: 130 },
  { name: 'Del Crary Park', category: 'Waterfront park', lat: 44.2989, lon: -78.3166, altitude: 140 },
  { name: 'Peterborough Memorial Centre', category: 'Arena', lat: 44.2997, lon: -78.3207, altitude: 140 },
  { name: 'Lansdowne Place', category: 'Shopping district', lat: 44.2838, lon: -78.3295, altitude: 170 },
  { name: 'Peterborough Regional Health Centre', category: 'Hospital', lat: 44.3017, lon: -78.3467, altitude: 170 },
  { name: 'Trent University', category: 'University', lat: 44.3572, lon: -78.2907, altitude: 175 },
  { name: 'Fleming College', category: 'College', lat: 44.2682, lon: -78.3717, altitude: 175 },
];

const ROAD_WIDTHS = {
  motorway: 16,
  trunk: 15,
  primary: 13,
  secondary: 11,
  tertiary: 9,
  residential: 6.2,
  unclassified: 6,
  service: 4.5,
  living_street: 5,
  pedestrian: 3,
  footway: 1.6,
  cycleway: 1.8,
  path: 1.3,
  steps: 1.3,
};

const els = {
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
  flyMode: document.querySelector('#fly-mode'),
  mapMode: document.querySelector('#map-mode'),
  searchButton: document.querySelector('#search-button'),
  landmarksButton: document.querySelector('#landmarks-button'),
  timeButton: document.querySelector('#time-button'),
  soundButton: document.querySelector('#sound-button'),
  searchDialog: document.querySelector('#search-dialog'),
  landmarksDialog: document.querySelector('#landmarks-dialog'),
  searchForm: document.querySelector('#search-form'),
  searchInput: document.querySelector('#search-input'),
  searchResults: document.querySelector('#search-results'),
  landmarkList: document.querySelector('#landmark-list'),
  toast: document.querySelector('#toast'),
};

const state = {
  mode: 'fly',
  keys: new Set(),
  yaw: Math.PI,
  pitch: -0.24,
  pointerLocked: false,
  previousTouch: null,
  loadedSource: 'live',
  objectCount: 0,
  lastFlyPosition: new THREE.Vector3(0, 180, 520),
  lastFlyYaw: Math.PI,
  lastFlyPitch: -0.24,
  theme: 'dusk',
  terrainAvailable: false,
  multipolygonsAvailable: false,
};

const terrain = {
  available: false,
  zoom: CITY.terrainZoom,
  minTileX: 0,
  minTileY: 0,
  tilesAcross: 0,
  pixelsAcross: 0,
  pixels: null,
  baseElevation: 0,
  minElevation: 0,
  maxElevation: 0,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07151d);
scene.fog = new THREE.FogExp2(0x07151d, 0.00018);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, 18000);
camera.position.copy(state.lastFlyPosition);
camera.rotation.order = 'YXZ';

const renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;

const ambient = new THREE.HemisphereLight(0xbfd7cf, 0x162319, 1.22);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffddb2, 2.1);
sun.position.set(-1200, 2200, 900);
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
const terrainGroup = new THREE.Group();
const roadGroup = new THREE.Group();
const buildingGroup = new THREE.Group();
const vegetationGroup = new THREE.Group();
const landmarkGroup = new THREE.Group();
world.add(terrainGroup, roadGroup, buildingGroup, vegetationGroup, landmarkGroup);

const clock = new THREE.Clock();
const velocity = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const zAxis = new THREE.Vector3(0, 0, 1);
let toastTimer = 0;
let ambientAudio = null;
let frameCounter = 0;
let frameWindowStarted = performance.now();
let lastLocationUpdate = 0;

const materials = {
  residential: new THREE.MeshLambertMaterial({ color: 0xa66d50 }),
  commercial: new THREE.MeshLambertMaterial({ color: 0x8a978f }),
  industrial: new THREE.MeshLambertMaterial({ color: 0x78887f }),
  civic: new THREE.MeshLambertMaterial({ color: 0x9a8f78 }),
  tower: new THREE.MeshLambertMaterial({ color: 0x8e9e96 }),
  roadMajor: new THREE.MeshLambertMaterial({ color: 0x182226 }),
  roadMinor: new THREE.MeshLambertMaterial({ color: 0x242c2d }),
  path: new THREE.MeshLambertMaterial({ color: 0x7f8a78 }),
  railway: new THREE.MeshLambertMaterial({ color: 0x514b45 }),
  water: new THREE.MeshLambertMaterial({ color: 0x245d68, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
  park: new THREE.MeshLambertMaterial({ color: 0x20593a, side: THREE.DoubleSide }),
  grass: new THREE.MeshLambertMaterial({ color: 0x2f6946, side: THREE.DoubleSide }),
  residentialLand: new THREE.MeshLambertMaterial({ color: 0x2d563b, side: THREE.DoubleSide }),
  commercialLand: new THREE.MeshLambertMaterial({ color: 0x3d4d46, side: THREE.DoubleSide }),
  industrialLand: new THREE.MeshLambertMaterial({ color: 0x394b43, side: THREE.DoubleSide }),
  landmark: new THREE.MeshLambertMaterial({ color: 0xc8ac66 }),
  treeTrunk: new THREE.MeshLambertMaterial({ color: 0x5c4730 }),
  treeCrown: new THREE.MeshLambertMaterial({ color: 0x2a633c }),
};

function setProgress(percent, message) {
  els.loadingProgress.style.width = `${Math.max(4, Math.min(percent, 100))}%`;
  if (message) els.loadingMessage.textContent = message;
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

function terrainHeightAtWorld(x, z) {
  if (!terrain.available) return 0;
  const geo = unproject(x, z);
  return (sampleTerrainElevation(geo.lat, geo.lon) - terrain.baseElevation) * CITY.terrainExaggeration;
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
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tileX}/${tileY}.png`;
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
  terrain.pixels = imageData.data;
  terrain.available = true;
  terrain.baseElevation = sampleTerrainElevation(CITY.center.lat, CITY.center.lon);
  state.terrainAvailable = true;
}

function createTerrainMesh() {
  const geometry = new THREE.PlaneGeometry(CITY.terrainSize, CITY.terrainSize, CITY.terrainSegments, CITY.terrainSegments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const y = terrainHeightAtWorld(x, z) - 1.2;
    positions.setY(index, y);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  positions.needsUpdate = true;
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
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.userData.type = 'terrain';
  terrainGroup.add(mesh);
  state.objectCount += 1;
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
  const explicitHeight = parseMeters(tags.height);
  const levels = Number.parseFloat(tags['building:levels']);
  const roofHeightTag = parseMeters(tags['roof:height']);
  const minHeightTag = parseMeters(tags.min_height);
  const minLevels = Number.parseFloat(tags['building:min_level']);
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  let height;
  if (Number.isFinite(explicitHeight)) height = explicitHeight;
  else if (Number.isFinite(levels)) height = levels * 3.15;
  else if (/church|cathedral|mosque|temple/.test(type)) height = 18 + deterministicNumber(featureId, 0, 8);
  else if (/apartments|hotel|office|commercial|hospital|school|university/.test(type)) height = deterministicNumber(featureId, 11, 23);
  else if (/industrial|warehouse|retail|supermarket/.test(type)) height = deterministicNumber(featureId, 7, 12);
  else if (/garage|shed|carport/.test(type)) height = deterministicNumber(featureId, 2.7, 4.2);
  else height = deterministicNumber(featureId, 6.2, 11.2);

  const minHeight = Number.isFinite(minHeightTag) ? minHeightTag : Number.isFinite(minLevels) ? minLevels * 3.15 : 0;
  const roofHeight = Number.isFinite(roofHeightTag) ? roofHeightTag : 0;
  return {
    height: THREE.MathUtils.clamp(Math.max(2.6, height - roofHeight - minHeight), 2.6, 115),
    minHeight: THREE.MathUtils.clamp(minHeight, 0, 60),
    roofHeight: THREE.MathUtils.clamp(roofHeight, 0, 18),
  };
}

function buildingMaterialKey(tags, totalHeight) {
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const amenity = String(tags.amenity || '').toLowerCase();
  if (totalHeight > 30) return 'tower';
  if (/industrial|warehouse|manufacture/.test(type) || tags.landuse === 'industrial') return 'industrial';
  if (/retail|commercial|office|hotel|supermarket/.test(type)) return 'commercial';
  if (/school|college|university|hospital|church|cathedral|civic|public/.test(type) || amenity) return 'civic';
  return 'residential';
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
    materialKey: buildingMaterialKey(tags, dimensions.height + dimensions.minHeight + dimensions.roofHeight),
  };
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

function drapeGeometry(geometry, elevationOffset = 0.08, flat = false) {
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  let flatHeight = 0;
  if (flat && positions.count) {
    let sumX = 0;
    let sumZ = 0;
    for (let index = 0; index < positions.count; index += 1) {
      sumX += positions.getX(index);
      sumZ += positions.getZ(index);
    }
    flatHeight = terrainHeightAtWorld(sumX / positions.count, sumZ / positions.count) + elevationOffset;
  }
  for (let index = 0; index < positions.count; index += 1) {
    const y = flat ? flatHeight : terrainHeightAtWorld(positions.getX(index), positions.getZ(index)) + elevationOffset;
    positions.setY(index, y);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

function addLandPolygon(rings, material, options = {}) {
  const shape = shapeFromRings(rings);
  if (!shape) return;
  const geometry = new THREE.ShapeGeometry(shape);
  drapeGeometry(geometry, options.offset ?? 0.08, options.flat === true);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.type = options.type || 'land';
  terrainGroup.add(mesh);
  state.objectCount += 1;
}

function roadBucket(tags = {}) {
  if (tags.railway && /^(rail|light_rail|subway|tram)$/.test(tags.railway)) return 'railway';
  const highway = tags.highway || 'residential';
  if (['motorway', 'trunk', 'primary', 'secondary'].includes(highway)) return 'major';
  if (['footway', 'cycleway', 'path', 'pedestrian', 'steps'].includes(highway)) return 'path';
  return 'minor';
}

function getRoadWidth(tags = {}) {
  if (tags.railway) return tags.railway === 'rail' ? 3.2 : 2.4;
  const highway = tags.highway || 'residential';
  let width = ROAD_WIDTHS[highway] || 5.5;
  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes)) width = Math.max(width, lanes * 3.1);
  return width;
}

function addLineSegments(coordinates, tags, buckets) {
  const points = coordinates
    .filter((coordinate) => Array.isArray(coordinate) && coordinate.length >= 2)
    .map(([lon, lat]) => project(lat, lon));
  if (points.length < 2) return 0;
  const bucket = roadBucket(tags);
  const width = getRoadWidth(tags);
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].distanceTo(points[index]) < 0.8) continue;
    buckets[bucket].push({ a: points[index - 1], b: points[index], width });
    count += 1;
  }
  return count;
}

function buildInstancedLines(segments, bucket) {
  if (!segments.length) return;
  const thickness = bucket === 'path' ? 0.16 : bucket === 'railway' ? 0.28 : 0.34;
  const material = bucket === 'major'
    ? materials.roadMajor
    : bucket === 'path'
      ? materials.path
      : bucket === 'railway'
        ? materials.railway
        : materials.roadMinor;
  const geometry = new THREE.BoxGeometry(1, thickness, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
  const dummy = new THREE.Object3D();
  const direction = new THREE.Vector3();
  const midpoint = new THREE.Vector3();
  segments.forEach((segment, index) => {
    const aY = terrainHeightAtWorld(segment.a.x, segment.a.y) + (bucket === 'path' ? 0.2 : 0.13);
    const bY = terrainHeightAtWorld(segment.b.x, segment.b.y) + (bucket === 'path' ? 0.2 : 0.13);
    direction.set(segment.b.x - segment.a.x, bY - aY, segment.b.y - segment.a.y);
    const length = Math.max(0.1, direction.length());
    direction.normalize();
    midpoint.set((segment.a.x + segment.b.x) / 2, (aY + bY) / 2, (segment.a.y + segment.b.y) / 2);
    dummy.position.copy(midpoint);
    dummy.quaternion.setFromUnitVectors(zAxis, direction);
    dummy.scale.set(segment.width, 1, length + 0.7);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.userData = { type: bucket, count: segments.length };
  roadGroup.add(mesh);
  state.objectCount += segments.length;
}

function landMaterialFor(tags) {
  if (tags.natural === 'water' || tags.water || tags.waterway === 'riverbank') return { material: materials.water, flat: true, type: 'water' };
  if (['park', 'recreation_ground', 'garden'].includes(tags.leisure)) return { material: materials.park, type: 'park', trees: true };
  if (tags.natural === 'wood' || tags.landuse === 'forest') return { material: materials.grass, type: 'wood', trees: true };
  if (['grass', 'meadow'].includes(tags.landuse)) return { material: materials.grass, type: 'grass' };
  if (tags.landuse === 'industrial') return { material: materials.industrialLand, type: 'industrial-land' };
  if (tags.landuse === 'residential') return { material: materials.residentialLand, type: 'residential-land' };
  if (['commercial', 'retail'].includes(tags.landuse)) return { material: materials.commercialLand, type: 'commercial-land' };
  return null;
}

function scatterTreesInPolygon(rings, featureId, target, maxTotal) {
  if (!rings.length || maxTotal <= target.length) return;
  const outer = rings[0];
  const area = polygonArea(outer);
  if (area < 250) return;
  const desired = Math.min(maxTotal - target.length, Math.max(1, Math.floor(area / 2600)));
  const startCount = target.length;
  const minX = Math.min(...outer.map((point) => point.x));
  const maxX = Math.max(...outer.map((point) => point.x));
  const minZ = Math.min(...outer.map((point) => point.y));
  const maxZ = Math.max(...outer.map((point) => point.y));
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
    if (target.length >= 1200) break;
  }
}

function buildTrees(treePoints) {
  if (!treePoints.length) return;
  const capped = treePoints.slice(0, 1200);
  const trunkGeometry = new THREE.CylinderGeometry(0.38, 0.5, 4.4, 6);
  const crownGeometry = new THREE.ConeGeometry(2.5, 6.8, 7);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.treeTrunk, capped.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.treeCrown, capped.length);
  const dummy = new THREE.Object3D();
  capped.forEach((tree, index) => {
    const terrainY = terrainHeightAtWorld(tree.x, tree.z);
    const scale = tree.scale || 1;
    dummy.position.set(tree.x, terrainY + 2.2 * scale, tree.z);
    dummy.rotation.set(0, deterministicNumber(`${tree.x}:${tree.z}`, 0, Math.PI * 2), 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    dummy.position.y = terrainY + 6.4 * scale;
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    crowns.setMatrixAt(index, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.userData = { type: 'trees', count: capped.length };
  crowns.userData = { type: 'tree-crowns', count: capped.length };
  vegetationGroup.add(trunks, crowns);
  state.objectCount += capped.length;
}

function parseOsmWithGeoJson(data) {
  if (typeof globalThis.osmtogeojson !== 'function') throw new Error('osmtogeojson browser library is unavailable');
  const geojson = globalThis.osmtogeojson(data, { flatProperties: true });
  state.multipolygonsAvailable = true;
  const buildingBatches = { residential: [], commercial: [], industrial: [], civic: [], tower: [] };
  const lineBuckets = { major: [], minor: [], path: [], railway: [] };
  const treePoints = [];
  let buildings = 0;
  let roads = 0;
  let land = 0;

  for (const feature of geojson.features || []) {
    const tags = featureTags(feature);
    const featureId = feature.id || tags.id || `${tags.name || ''}:${buildings}:${land}`;

    if ((tags.building || tags['building:part']) && buildings < 6500) {
      for (const polygonCoordinates of geometryPolygons(feature)) {
        const rings = polygonCoordinates.map(coordinatesToRing).filter((ring) => ring.length >= 4);
        if (!rings.length) continue;
        const result = createBuildingGeometry(rings, tags, featureId);
        if (!result) continue;
        buildingBatches[result.materialKey].push(result.geometry);
        buildings += 1;
        state.objectCount += 1;
      }
      continue;
    }

    if (tags.highway || tags.railway) {
      for (const line of geometryLines(feature)) roads += addLineSegments(line, tags, lineBuckets);
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
      const rings = polygonCoordinates.map(coordinatesToRing).filter((ring) => ring.length >= 4);
      if (!rings.length) continue;
      addLandPolygon(rings, landStyle.material, { flat: landStyle.flat, type: landStyle.type, offset: landStyle.type === 'water' ? 0.24 : 0.08 });
      land += 1;
      if (landStyle.trees && treePoints.length < 1200) {
        const before = treePoints.length;
        const maxToAdd = Math.min(1200 - before, Math.max(1, Math.floor(polygonArea(rings[0]) / 2600)));
        scatterTreesInPolygon(rings, featureId, treePoints, before + maxToAdd);
      }
    }
  }

  mergeBuildingBatches(buildingBatches);
  buildInstancedLines(lineBuckets.major, 'major');
  buildInstancedLines(lineBuckets.minor, 'minor');
  buildInstancedLines(lineBuckets.path, 'path');
  buildInstancedLines(lineBuckets.railway, 'railway');
  buildTrees(treePoints);
  return { buildings, roads, land, trees: Math.min(treePoints.length, 1200) };
}

function parseOsmWayFallback(data) {
  const nodes = new Map();
  const ways = [];
  for (const element of data.elements || []) {
    if (element.type === 'node') nodes.set(element.id, project(element.lat, element.lon));
    else if (element.type === 'way') ways.push(element);
  }
  const buildingBatches = { residential: [], commercial: [], industrial: [], civic: [], tower: [] };
  const lineBuckets = { major: [], minor: [], path: [], railway: [] };
  let buildings = 0;
  let roads = 0;
  let land = 0;
  for (const way of ways) {
    const tags = way.tags || {};
    const points = (way.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
    if (points.length < 2) continue;
    if (tags.building && points.length >= 4 && buildings < 5000) {
      const result = createBuildingGeometry([points], tags, `way/${way.id}`);
      if (result) {
        buildingBatches[result.materialKey].push(result.geometry);
        buildings += 1;
        state.objectCount += 1;
      }
      continue;
    }
    if (tags.highway || tags.railway) {
      const bucket = roadBucket(tags);
      const width = getRoadWidth(tags);
      for (let index = 1; index < points.length; index += 1) {
        lineBuckets[bucket].push({ a: points[index - 1], b: points[index], width });
        roads += 1;
      }
      continue;
    }
    const closed = way.nodes?.[0] === way.nodes?.[way.nodes.length - 1];
    const landStyle = landMaterialFor(tags);
    if (closed && landStyle && points.length >= 4) {
      addLandPolygon([points], landStyle.material, { flat: landStyle.flat, type: landStyle.type });
      land += 1;
    }
  }
  mergeBuildingBatches(buildingBatches);
  buildInstancedLines(lineBuckets.major, 'major');
  buildInstancedLines(lineBuckets.minor, 'minor');
  buildInstancedLines(lineBuckets.path, 'path');
  buildInstancedLines(lineBuckets.railway, 'railway');
  return { buildings, roads, land, trees: 0 };
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
  const buildingBatches = { residential: [], commercial: [], industrial: [], civic: [], tower: [] };
  const spacing = 115;
  const half = 15;
  let buildings = 0;

  for (let index = -half; index <= half; index += 1) {
    const major = index % 5 === 0;
    lineBuckets[major ? 'major' : 'minor'].push({ a: new THREE.Vector2(index * spacing, -half * spacing), b: new THREE.Vector2(index * spacing, half * spacing), width: major ? 12 : 6.2 });
    lineBuckets[major ? 'major' : 'minor'].push({ a: new THREE.Vector2(-half * spacing, index * spacing), b: new THREE.Vector2(half * spacing, index * spacing), width: major ? 12 : 6.2 });
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
  buildInstancedLines(lineBuckets.major, 'major');
  buildInstancedLines(lineBuckets.minor, 'minor');

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
  return { buildings, roads: lineBuckets.major.length + lineBuckets.minor.length, land: 2, trees: 0 };
}

async function fetchOsm() {
  const query = `[out:json][timeout:60];(
    nwr(around:${CITY.buildingRadius},${CITY.center.lat},${CITY.center.lon})["building"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["highway"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["railway"~"^(rail|light_rail|subway|tram)$"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["natural"="water"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["natural"="wood"];
    node(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["natural"="tree"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["water"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["waterway"="riverbank"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["leisure"~"^(park|recreation_ground|garden)$"];
    nwr(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["landuse"~"^(grass|meadow|industrial|forest|residential|commercial|retail)$"];
  );out body;>;out skel qt;`;

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

function addLandmarkBeacons() {
  const geometry = new THREE.CylinderGeometry(2.6, 2.6, 75, 10);
  LANDMARKS.forEach((landmark) => {
    const p = project(landmark.lat, landmark.lon);
    const baseY = terrainHeightAtWorld(p.x, p.y);
    const beacon = new THREE.Mesh(geometry, materials.landmark);
    beacon.position.set(p.x, baseY + 37.5, p.y);
    beacon.scale.set(0.7, 1, 0.7);
    beacon.userData = landmark;
    landmarkGroup.add(beacon);
  });
}

function setReadyStatus(summary) {
  els.statusDot.classList.add('ready');
  if (state.loadedSource === 'fallback') {
    els.worldStatus.textContent = 'Offline demo geometry · map service unavailable';
  } else {
    const terrainLabel = state.terrainAvailable ? 'elevation terrain' : 'flat terrain';
    const polygonLabel = state.multipolygonsAvailable ? 'multipolygons' : 'simple polygons';
    els.worldStatus.textContent = `${summary.buildings.toLocaleString()} buildings · ${terrainLabel} · ${polygonLabel}`;
  }
  els.objectCount.textContent = `${state.objectCount.toLocaleString()} features`;
}

async function buildCity() {
  setProgress(7, 'Loading Peterborough elevation and OpenStreetMap geometry…');
  const terrainPromise = loadTerrainTiles().catch((error) => {
    console.warn('Terrain tiles unavailable; continuing with flat terrain.', error);
    terrain.available = false;
    state.terrainAvailable = false;
    return null;
  });
  const osmPromise = fetchOsm();

  await terrainPromise;
  setProgress(31, state.terrainAvailable ? 'Decoding elevation tiles and shaping the landscape…' : 'Terrain service unavailable — using a flat landscape…');
  createTerrainMesh();
  await nextFrame();

  let summary = { buildings: 0, roads: 0, land: 0, trees: 0 };
  try {
    const data = await osmPromise;
    setProgress(52, 'Resolving OSM multipolygons, roads, water, and land cover…');
    await nextFrame();
    try {
      summary = parseOsmWithGeoJson(data);
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

  addLandmarkBeacons();
  setProgress(100, 'Peterborough is ready');
  setReadyStatus(summary);
  setTimeout(() => els.loading.classList.add('is-hidden'), 420);
}

function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === 'map') {
    state.lastFlyPosition.copy(camera.position);
    state.lastFlyYaw = state.yaw;
    state.lastFlyPitch = state.pitch;
    document.exitPointerLock?.();
    state.mode = 'map';
    camera.position.set(0, 4450, 2);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    els.flyMode.classList.remove('is-active');
    els.mapMode.classList.add('is-active');
    els.modeHint.innerHTML = '<strong>Map mode.</strong> Scroll to zoom · WASD or arrows to pan · select Fly mode to return.';
  } else {
    state.mode = 'fly';
    camera.up.set(0, 1, 0);
    camera.position.copy(state.lastFlyPosition);
    state.yaw = state.lastFlyYaw;
    state.pitch = state.lastFlyPitch;
    els.flyMode.classList.add('is-active');
    els.mapMode.classList.remove('is-active');
    els.modeHint.innerHTML = '<strong>Click the city to look around.</strong> WASD to move · Q/E down/up · Shift to boost.';
  }
}

function updateFlyControls(delta) {
  const targetSpeed = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? 520 : 150;
  moveVector.set(0, 0, 0);
  if (state.keys.has('KeyW')) moveVector.z -= 1;
  if (state.keys.has('KeyS')) moveVector.z += 1;
  if (state.keys.has('KeyA')) moveVector.x -= 1;
  if (state.keys.has('KeyD')) moveVector.x += 1;
  if (state.keys.has('KeyQ')) moveVector.y -= 1;
  if (state.keys.has('KeyE') || state.keys.has('Space')) moveVector.y += 1;
  if (moveVector.lengthSq() > 0) moveVector.normalize();

  const forward = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  const desired = new THREE.Vector3()
    .addScaledVector(forward, moveVector.z)
    .addScaledVector(right, moveVector.x);
  desired.y = moveVector.y;
  if (desired.lengthSq() > 0) desired.normalize().multiplyScalar(targetSpeed);

  velocity.lerp(desired, 1 - Math.exp(-delta * 8));
  camera.position.addScaledVector(velocity, delta);
  const minimumAltitude = terrainHeightAtWorld(camera.position.x, camera.position.z) + 5;
  camera.position.y = THREE.MathUtils.clamp(Math.max(camera.position.y, minimumAltitude), terrain.minElevation - 20, 2600);
  camera.position.x = THREE.MathUtils.clamp(camera.position.x, -7000, 7000);
  camera.position.z = THREE.MathUtils.clamp(camera.position.z, -7000, 7000);
  camera.rotation.set(state.pitch, state.yaw, 0);
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
  camera.lookAt(camera.position.x, 0, camera.position.z);
}

function updateLocation() {
  const now = performance.now();
  if (now - lastLocationUpdate < 250) return;
  lastLocationUpdate = now;
  const geo = unproject(camera.position.x, camera.position.z);
  els.coordinates.textContent = `${Math.abs(geo.lat).toFixed(4)}° ${geo.lat >= 0 ? 'N' : 'S'}, ${Math.abs(geo.lon).toFixed(4)}° ${geo.lon >= 0 ? 'E' : 'W'}`;
  const groundY = terrainHeightAtWorld(camera.position.x, camera.position.z);
  els.altitude.textContent = `${Math.max(0, Math.round(camera.position.y - groundY))} m AGL`;

  let nearest = LANDMARKS[0];
  let nearestDistance = Infinity;
  for (const landmark of LANDMARKS) {
    const p = project(landmark.lat, landmark.lon);
    const distance = Math.hypot(camera.position.x - p.x, camera.position.z - p.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = landmark;
    }
  }
  els.locationName.textContent = nearestDistance < 1100 ? nearest.name : 'Peterborough City Explorer';
}

function updateFps() {
  frameCounter += 1;
  const now = performance.now();
  const elapsed = now - frameWindowStarted;
  if (elapsed >= 700) {
    els.fps.textContent = `${Math.round(frameCounter * 1000 / elapsed)} FPS`;
    frameCounter = 0;
    frameWindowStarted = now;
  }
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'fly') updateFlyControls(delta);
  else updateMapControls(delta);
  updateLocation();
  updateFps();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function jumpTo(lat, lon, altitude = 160, name = 'Selected location') {
  const p = project(lat, lon);
  const groundY = terrainHeightAtWorld(p.x, p.y);
  state.mode = 'fly';
  camera.up.set(0, 1, 0);
  camera.position.set(p.x + 110, groundY + altitude, p.y + 180);
  state.yaw = Math.atan2(-110, -180);
  state.pitch = -0.28;
  state.lastFlyPosition.copy(camera.position);
  state.lastFlyYaw = state.yaw;
  state.lastFlyPitch = state.pitch;
  els.flyMode.classList.add('is-active');
  els.mapMode.classList.remove('is-active');
  els.locationName.textContent = name;
  showToast(`Travelling to ${name}`);
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
  const localMatches = LANDMARKS.filter((landmark) => `${landmark.name} ${landmark.category}`.toLowerCase().includes(normalized));
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
        altitude: 150,
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
    jumpTo(result.lat, result.lon, result.altitude || 150, result.name);
  });
  els.searchResults.append(button);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function setTheme(theme) {
  state.theme = theme;
  if (theme === 'night') {
    scene.background.set(0x030a10);
    scene.fog.color.set(0x030a10);
    ambient.color.set(0x617898);
    ambient.groundColor.set(0x0b120f);
    ambient.intensity = 0.62;
    sun.color.set(0x6782a4);
    sun.intensity = 0.45;
    els.timeButton.textContent = 'Daylight';
  } else if (theme === 'day') {
    scene.background.set(0x9bb6bd);
    scene.fog.color.set(0x9bb6bd);
    ambient.color.set(0xe3f2eb);
    ambient.groundColor.set(0x52644f);
    ambient.intensity = 1.5;
    sun.color.set(0xffefd1);
    sun.intensity = 2.8;
    els.timeButton.textContent = 'Dusk';
  } else {
    scene.background.set(0x07151d);
    scene.fog.color.set(0x07151d);
    ambient.color.set(0xbfd7cf);
    ambient.groundColor.set(0x162319);
    ambient.intensity = 1.22;
    sun.color.set(0xffddb2);
    sun.intensity = 2.1;
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
    showToast('Ambient city sound enabled');
    return;
  }
  ambientAudio.enabled = !ambientAudio.enabled;
  ambientAudio.gain.gain.setTargetAtTime(ambientAudio.enabled ? 0.018 : 0, ambientAudio.context.currentTime, 0.08);
  els.soundButton.textContent = ambientAudio.enabled ? 'Sound on' : 'Sound off';
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
}

function onPointerMove(event) {
  if (state.mode !== 'fly' || !state.pointerLocked) return;
  state.yaw -= event.movementX * 0.0021;
  state.pitch -= event.movementY * 0.0018;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.3);
}

function onWheel(event) {
  if (state.mode === 'map') {
    event.preventDefault();
    camera.position.y = THREE.MathUtils.clamp(camera.position.y + event.deltaY * 2.2, 500, 8500);
  } else {
    camera.fov = THREE.MathUtils.clamp(camera.fov + Math.sign(event.deltaY) * 2, 38, 76);
    camera.updateProjectionMatrix();
  }
}

function wireEvents() {
  els.flyMode.addEventListener('click', () => setMode('fly'));
  els.mapMode.addEventListener('click', () => setMode('map'));
  els.searchButton.addEventListener('click', () => { document.exitPointerLock?.(); els.searchDialog.showModal(); setTimeout(() => els.searchInput.focus(), 50); });
  els.landmarksButton.addEventListener('click', () => { document.exitPointerLock?.(); els.landmarksDialog.showModal(); });
  els.timeButton.addEventListener('click', cycleTheme);
  els.soundButton.addEventListener('click', toggleSound);

  els.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = els.searchInput.value.trim();
    if (query) searchLocations(query);
  });

  els.canvas.addEventListener('click', () => {
    if (state.mode === 'fly' && matchMedia('(pointer: fine)').matches) els.canvas.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => { state.pointerLocked = document.pointerLockElement === els.canvas; });
  document.addEventListener('mousemove', onPointerMove);
  window.addEventListener('wheel', onWheel, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement) return;
    state.keys.add(event.code);
    if (event.code === 'KeyM') setMode(state.mode === 'map' ? 'fly' : 'map');
    if (event.code === 'KeyF') setMode('fly');
    if (event.code === 'Slash') els.searchButton.click();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => state.keys.delete(event.code));
  window.addEventListener('blur', () => state.keys.clear());

  document.querySelectorAll('[data-touch-key]').forEach((button) => {
    const key = button.dataset.touchKey;
    const start = (event) => { event.preventDefault(); state.keys.add(key); };
    const end = (event) => { event.preventDefault(); state.keys.delete(key); };
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('pointerleave', end);
  });

  els.canvas.addEventListener('touchstart', (event) => {
    if (event.touches.length !== 1 || state.mode !== 'fly') return;
    state.previousTouch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  els.canvas.addEventListener('touchmove', (event) => {
    if (!state.previousTouch || event.touches.length !== 1 || state.mode !== 'fly') return;
    const touch = event.touches[0];
    const dx = touch.clientX - state.previousTouch.x;
    const dy = touch.clientY - state.previousTouch.y;
    state.yaw -= dx * 0.004;
    state.pitch -= dy * 0.0035;
    state.pitch = THREE.MathUtils.clamp(state.pitch, -1.48, 1.3);
    state.previousTouch = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  els.canvas.addEventListener('touchend', () => { state.previousTouch = null; }, { passive: true });

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.25 : 1.65));
    renderer.setSize(innerWidth, innerHeight, false);
  });
}

populateLandmarks();
wireEvents();
setTheme('dusk');
buildCity();
animate();
