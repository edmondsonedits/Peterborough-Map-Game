import * as THREE from 'three';

const CITY = {
  name: 'Peterborough, Ontario',
  center: { lat: 44.3091, lon: -78.3197 },
  osmRadius: 3300,
  buildingRadius: 2550,
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
  dragging: false,
  previousTouch: null,
  loadedSource: 'live',
  objectCount: 0,
  lastFlyPosition: new THREE.Vector3(0, 180, 520),
  lastFlyYaw: Math.PI,
  lastFlyPitch: -0.24,
  theme: 'dusk',
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
const landmarkGroup = new THREE.Group();
world.add(terrainGroup, roadGroup, buildingGroup, landmarkGroup);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(16000, 16000),
  new THREE.MeshLambertMaterial({ color: 0x173c28 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -1.2;
terrainGroup.add(ground);

const clock = new THREE.Clock();
const velocity = new THREE.Vector3();
const moveVector = new THREE.Vector3();
let toastTimer = 0;
let ambientAudio = null;
let frameCounter = 0;
let frameWindowStarted = performance.now();
let lastLocationUpdate = 0;

function setProgress(percent, message) {
  els.loadingProgress.style.width = `${Math.max(4, Math.min(percent, 100))}%`;
  if (message) els.loadingMessage.textContent = message;
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

function clampHeight(tags = {}) {
  const rawHeight = Number.parseFloat(tags.height);
  const levels = Number.parseFloat(tags['building:levels']);
  if (Number.isFinite(rawHeight)) return THREE.MathUtils.clamp(rawHeight, 2.8, 110);
  if (Number.isFinite(levels)) return THREE.MathUtils.clamp(levels * 3.15, 3, 100);
  const type = tags.building || '';
  if (/church|cathedral/.test(type)) return 22;
  if (/apartments|hotel|office|commercial/.test(type)) return 13 + Math.random() * 10;
  if (/industrial|warehouse/.test(type)) return 8 + Math.random() * 5;
  if (/garage|shed/.test(type)) return 3.2;
  return 6.5 + Math.random() * 5.5;
}

function buildingMaterial(tags, height) {
  if (height > 30) return materials.tower;
  if (/industrial|warehouse/.test(tags.building || '') || tags.landuse === 'industrial') return materials.industrial;
  if (/retail|commercial|office/.test(tags.building || '')) return materials.commercial;
  return materials.residential;
}

const materials = {
  residential: new THREE.MeshLambertMaterial({ color: 0xa66d50 }),
  commercial: new THREE.MeshLambertMaterial({ color: 0x8a978f }),
  industrial: new THREE.MeshLambertMaterial({ color: 0x78887f }),
  tower: new THREE.MeshLambertMaterial({ color: 0x8e9e96 }),
  roadMajor: new THREE.MeshLambertMaterial({ color: 0x182226 }),
  roadMinor: new THREE.MeshLambertMaterial({ color: 0x242c2d }),
  path: new THREE.MeshLambertMaterial({ color: 0x7f8a78 }),
  water: new THREE.MeshLambertMaterial({ color: 0x245d68, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
  park: new THREE.MeshLambertMaterial({ color: 0x20593a, side: THREE.DoubleSide }),
  grass: new THREE.MeshLambertMaterial({ color: 0x2f6946, side: THREE.DoubleSide }),
  industrialLand: new THREE.MeshLambertMaterial({ color: 0x394b43, side: THREE.DoubleSide }),
  landmark: new THREE.MeshLambertMaterial({ color: 0xc8ac66 }),
};

function polygonShape(points) {
  if (points.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, -points[0].y);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i].x, -points[i].y);
  shape.closePath();
  return shape;
}

function simplifyPoints(points, tolerance = 0.75, maxPoints = 70) {
  if (points.length <= 4) return points;
  const simplified = [points[0]];
  let last = points[0];
  for (let i = 1; i < points.length - 1; i += 1) {
    if (points[i].distanceTo(last) >= tolerance) {
      simplified.push(points[i]);
      last = points[i];
    }
  }
  simplified.push(points[points.length - 1]);
  if (simplified.length <= maxPoints) return simplified;
  const stride = Math.ceil(simplified.length / maxPoints);
  return simplified.filter((_, index) => index % stride === 0 || index === simplified.length - 1);
}

function addBuilding(points, tags = {}) {
  const clean = simplifyPoints(points, 0.85, 60);
  const shape = polygonShape(clean);
  if (!shape) return;
  const height = clampHeight(tags);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, buildingMaterial(tags, height));
  mesh.position.y = 0;
  mesh.userData = { type: 'building', name: tags.name || tags['addr:housenumber'] || '' };
  buildingGroup.add(mesh);
  state.objectCount += 1;
}

function addFlatPolygon(points, material, y = 0.04) {
  const clean = simplifyPoints(points, 1.3, 90);
  const shape = polygonShape(clean);
  if (!shape) return;
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  terrainGroup.add(mesh);
  state.objectCount += 1;
}

function getRoadWidth(tags = {}) {
  const highway = tags.highway || 'residential';
  let width = ROAD_WIDTHS[highway] || 5.5;
  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes)) width = Math.max(width, lanes * 3.1);
  return width;
}

function roadBucket(tags = {}) {
  const highway = tags.highway || 'residential';
  if (['motorway', 'trunk', 'primary', 'secondary'].includes(highway)) return 'major';
  if (['footway', 'cycleway', 'path', 'pedestrian', 'steps'].includes(highway)) return 'path';
  return 'minor';
}

function buildInstancedRoads(segments, bucket) {
  if (!segments.length) return;
  const geometry = new THREE.BoxGeometry(1, bucket === 'path' ? 0.18 : 0.34, 1);
  const material = bucket === 'major' ? materials.roadMajor : bucket === 'path' ? materials.path : materials.roadMinor;
  const mesh = new THREE.InstancedMesh(geometry, material, segments.length);
  const dummy = new THREE.Object3D();
  segments.forEach((segment, index) => {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.y - segment.a.y;
    const length = Math.hypot(dx, dz);
    dummy.position.set((segment.a.x + segment.b.x) / 2, bucket === 'path' ? 0.16 : 0.1, (segment.a.y + segment.b.y) / 2);
    dummy.rotation.set(0, -Math.atan2(dz, dx) + Math.PI / 2, 0);
    dummy.scale.set(segment.width, 1, length + 0.8);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  roadGroup.add(mesh);
  state.objectCount += segments.length;
}

function parseOsm(data) {
  const nodes = new Map();
  const ways = [];
  for (const element of data.elements || []) {
    if (element.type === 'node') nodes.set(element.id, project(element.lat, element.lon));
    else if (element.type === 'way') ways.push(element);
  }

  const roadSegments = { major: [], minor: [], path: [] };
  let buildings = 0;
  let roads = 0;

  ways.forEach((way) => {
    const tags = way.tags || {};
    const points = (way.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
    if (points.length < 2) return;

    if (tags.building && points.length >= 4 && buildings < 4800) {
      addBuilding(points, tags);
      buildings += 1;
      return;
    }

    if (tags.highway) {
      const bucket = roadBucket(tags);
      const width = getRoadWidth(tags);
      for (let i = 1; i < points.length; i += 1) {
        roadSegments[bucket].push({ a: points[i - 1], b: points[i], width });
        roads += 1;
      }
      return;
    }

    const closed = way.nodes?.[0] === way.nodes?.[way.nodes.length - 1];
    if (!closed || points.length < 4) return;
    if (tags.natural === 'water' || tags.water || tags.waterway === 'riverbank') addFlatPolygon(points, materials.water, 0.1);
    else if (tags.leisure === 'park' || tags.leisure === 'recreation_ground') addFlatPolygon(points, materials.park, 0.06);
    else if (tags.landuse === 'grass' || tags.landuse === 'meadow' || tags.natural === 'wood') addFlatPolygon(points, materials.grass, 0.05);
    else if (tags.landuse === 'industrial') addFlatPolygon(points, materials.industrialLand, 0.03);
  });

  buildInstancedRoads(roadSegments.major, 'major');
  buildInstancedRoads(roadSegments.minor, 'minor');
  buildInstancedRoads(roadSegments.path, 'path');
  return { buildings, roads };
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function buildFallbackCity() {
  state.loadedSource = 'fallback';
  const random = seededRandom(6132026);
  const roadSegments = { major: [], minor: [], path: [] };
  const spacing = 115;
  const half = 15;

  for (let i = -half; i <= half; i += 1) {
    const major = i % 5 === 0;
    roadSegments[major ? 'major' : 'minor'].push({ a: new THREE.Vector2(i * spacing, -half * spacing), b: new THREE.Vector2(i * spacing, half * spacing), width: major ? 12 : 6.2 });
    roadSegments[major ? 'major' : 'minor'].push({ a: new THREE.Vector2(-half * spacing, i * spacing), b: new THREE.Vector2(half * spacing, i * spacing), width: major ? 12 : 6.2 });
  }
  buildInstancedRoads(roadSegments.major, 'major');
  buildInstancedRoads(roadSegments.minor, 'minor');

  for (let gx = -half; gx < half; gx += 1) {
    for (let gz = -half; gz < half; gz += 1) {
      if ((gx < -3 && gz < -5) || (gx > 6 && Math.abs(gz) < 3)) continue;
      const blockX = gx * spacing + 18;
      const blockZ = gz * spacing + 18;
      const cols = random() > .6 ? 3 : 2;
      const rows = random() > .65 ? 3 : 2;
      const cellW = 76 / cols;
      const cellD = 76 / rows;
      for (let x = 0; x < cols; x += 1) {
        for (let z = 0; z < rows; z += 1) {
          if (random() < .12) continue;
          const inset = 3 + random() * 5;
          const px = blockX + x * cellW + inset;
          const pz = blockZ + z * cellD + inset;
          const width = cellW - inset * 2;
          const depth = cellD - inset * 2;
          const points = [
            new THREE.Vector2(px, pz),
            new THREE.Vector2(px + width, pz),
            new THREE.Vector2(px + width, pz + depth),
            new THREE.Vector2(px, pz + depth),
            new THREE.Vector2(px, pz),
          ];
          addBuilding(points, { building: random() > .85 ? 'apartments' : 'house', 'building:levels': Math.floor(1 + random() * (Math.abs(gx) < 4 && Math.abs(gz) < 4 ? 12 : 3)) });
        }
      }
    }
  }

  const riverShape = new THREE.Shape();
  riverShape.moveTo(450, -2300);
  riverShape.bezierCurveTo(360, -800, 520, 300, 410, 2300);
  riverShape.lineTo(560, 2300);
  riverShape.bezierCurveTo(690, 400, 540, -900, 640, -2300);
  riverShape.closePath();
  const river = new THREE.Mesh(new THREE.ShapeGeometry(riverShape), materials.water);
  river.rotation.x = -Math.PI / 2;
  river.position.y = .1;
  terrainGroup.add(river);

  const park = new THREE.Mesh(new THREE.CircleGeometry(580, 64), materials.park);
  park.rotation.x = -Math.PI / 2;
  park.position.set(-980, .06, -760);
  terrainGroup.add(park);
  state.objectCount += 2;
}

async function fetchOsm() {
  const query = `[out:json][timeout:40];(
    way(around:${CITY.buildingRadius},${CITY.center.lat},${CITY.center.lon})["building"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["highway"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["natural"="water"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["water"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["waterway"="riverbank"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["leisure"="park"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["leisure"="recreation_ground"];
    way(around:${CITY.osmRadius},${CITY.center.lat},${CITY.center.lon})["landuse"~"grass|meadow|industrial"];
  );out body;>;out skel qt;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];

  let lastError;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      });
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
    const beacon = new THREE.Mesh(geometry, materials.landmark);
    beacon.position.set(p.x, 37.5, p.y);
    beacon.scale.set(.7, 1, .7);
    beacon.userData = landmark;
    landmarkGroup.add(beacon);
  });
}

function setReadyStatus(summary) {
  els.statusDot.classList.add('ready');
  els.worldStatus.textContent = state.loadedSource === 'live'
    ? `${summary.buildings.toLocaleString()} buildings · live OSM geometry`
    : 'Demo geometry active · live map unavailable';
  els.objectCount.textContent = `${state.objectCount.toLocaleString()} objects`;
}

async function buildCity() {
  setProgress(12, 'Requesting roads and building footprints…');
  let summary = { buildings: 0, roads: 0 };
  try {
    const data = await fetchOsm();
    setProgress(48, 'Converting OpenStreetMap coordinates…');
    await nextFrame();
    summary = parseOsm(data);
    setProgress(84, `Extruding ${summary.buildings.toLocaleString()} buildings…`);
  } catch (error) {
    console.warn('Live map load failed; using fallback city.', error);
    setProgress(45, 'Live map server unavailable — generating offline city…');
    await nextFrame();
    buildFallbackCity();
    summary = { buildings: buildingGroup.children.length, roads: roadGroup.children.length };
    showToast('Live map unavailable. Loaded the offline city prototype.');
  }

  addLandmarkBeacons();
  setProgress(100, 'Peterborough is ready');
  setReadyStatus(summary);
  setTimeout(() => els.loading.classList.add('is-hidden'), 420);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
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
    els.modeHint.innerHTML = '<strong>Map mode.</strong> Scroll to zoom · drag to pan · select Fly mode to return.';
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
  camera.position.y = THREE.MathUtils.clamp(camera.position.y, 7, 2600);
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
    moveVector.normalize().multiplyScalar(900 * delta * Math.max(.55, camera.position.y / 4000));
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
  els.altitude.textContent = `${Math.round(camera.position.y)} m`;

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
  const delta = Math.min(clock.getDelta(), .05);
  if (state.mode === 'fly') updateFlyControls(delta);
  else updateMapControls(delta);
  updateLocation();
  updateFps();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function jumpTo(lat, lon, altitude = 160, name = 'Selected location') {
  const p = project(lat, lon);
  state.mode = 'fly';
  camera.up.set(0, 1, 0);
  camera.position.set(p.x + 110, altitude, p.y + 180);
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
  url.searchParams.set('viewbox', '-78.39,44.38,-78.25,44.25');
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
    ambient.intensity = .62;
    sun.color.set(0x6782a4);
    sun.intensity = .45;
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
    const context = new AudioContext();
    const gain = context.createGain();
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    oscillator.type = 'sine';
    oscillator.frequency.value = 52;
    filter.type = 'lowpass';
    filter.frequency.value = 140;
    gain.gain.value = .018;
    oscillator.connect(filter).connect(gain).connect(context.destination);
    oscillator.start();
    ambientAudio = { context, gain, oscillator, enabled: true };
    els.soundButton.textContent = 'Sound on';
    showToast('Ambient city sound enabled');
    return;
  }
  ambientAudio.enabled = !ambientAudio.enabled;
  ambientAudio.gain.gain.setTargetAtTime(ambientAudio.enabled ? .018 : 0, ambientAudio.context.currentTime, .08);
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
  state.yaw -= event.movementX * .0021;
  state.pitch -= event.movementY * .0018;
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
    state.yaw -= dx * .004;
    state.pitch -= dy * .0035;
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
