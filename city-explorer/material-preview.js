import * as THREE from 'three';
import { CITY_MATERIALS, installCityMaterialDetail, cloneCityMaterial } from './city-material-library.js?v=1.6.153';
import { resolveBuildingAppearance } from './building-appearance.js?v=1.6.153';
import { facadeComponentPlan } from './facade-components.js?v=1.6.153';
import { visualSettings } from './city-visual-settings.js?v=1.6.153';

const canvas = document.querySelector('#preview');
const status = document.querySelector('#status');
const qualityControl = document.querySelector('#quality');
const archetypeControl = document.querySelector('#archetype');
const modeButton = document.querySelector('#mode');
const legend = document.querySelector('#legend');
const sceneTitle = document.querySelector('#scene-title');
const initialSettings = visualSettings(location.search, false);
let quality = initialSettings.quality;
let legacy = initialSettings.mode === 'legacy';
let renderer;

qualityControl.value = quality;
modeButton.setAttribute('aria-pressed', String(!legacy));
modeButton.textContent = legacy ? 'Legacy surfaces' : 'Procedural detail';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3e9e7);
scene.fog = new THREE.Fog(0xe3e9e7, 34, 65);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
const target = new THREE.Vector3(0, 2.2, 0);
let theta = 0.22;
let phi = 1.12;
let radius = 22;
const group = new THREE.Group();
scene.add(group);
scene.add(new THREE.HemisphereLight(0xe8f0f5, 0x786f63, 2.0));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
sun.position.set(-7, 13, 8);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc9e0e3, 1.1);
fill.position.set(7, 5, -5);
scene.add(fill);

const MATERIAL_COLORS = {
  asphalt: 0x44484a, brick: 0x936c59, concrete: 0xaaa99f, glass: 0x77999a,
  grass: 0x728366, 'metal-roof': 0x657572, render: 0xc1b6a2, roof: 0x514a48,
  stone: 0x89877e, water: 0x718c91,
};
const ARCHETYPES = {
  residential: { tags: { building: 'residential' }, wallKind: 'brick', color: 0x987461, label: 'Residential' },
  storefront: { tags: { building: 'retail', shop: 'yes' }, wallKind: 'render', color: 0xb9a88c, label: 'Storefront' },
  apartment: { tags: { building: 'apartments' }, wallKind: 'render', color: 0xa99e8c, label: 'Apartment' },
  industrial: { tags: { building: 'warehouse' }, wallKind: 'stone', color: 0x8d8d82, label: 'Industrial' },
  civic: { tags: { building: 'public', amenity: 'community_centre' }, wallKind: 'stone', color: 0x988c78, label: 'Civic' },
};

function materialFor(kind, id, color = MATERIAL_COLORS[kind]) {
  const profile = CITY_MATERIALS[kind];
  const base = new THREE.MeshStandardMaterial({
    color,
    roughness: profile.roughness,
    metalness: profile.metalness,
  });
  if (!legacy) installCityMaterialDetail(base, { kind, id, quality });
  return cloneCityMaterial(base) || base;
}

function addBox(width, height, depth, x, y, z, material, parent = group) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addSurfaceSamples() {
  const kinds = Object.keys(CITY_MATERIALS);
  const floorKinds = new Set(['asphalt', 'concrete', 'grass', 'water']);
  const wallKinds = kinds.filter((kind) => !floorKinds.has(kind));
  wallKinds.forEach((kind, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = -9.1 + col * 2.35;
    const y = 1.2 + row * 2.05;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.08, 1.48), materialFor(kind, `preview-wall-${kind}`));
    board.position.set(x, y, -2.8);
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);
  });
  floorKinds.forEach((kind, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.72, 1.72), materialFor(kind, `preview-floor-${kind}`));
    board.rotation.x = -Math.PI / 2;
    board.position.set(-8.65 + col * 1.9, 0.035, 1.05 + row * 1.9);
    board.receiveShadow = true;
    group.add(board);
  });
}

function addFacade() {
  const archetype = archetypeControl.value;
  const spec = ARCHETYPES[archetype] || ARCHETYPES.residential;
  const wallWidth = 8.4;
  const wallHeight = 9;
  const wallDepth = 1.2;
  const wallX = 3.65;
  const wallZ = -2.8;
  const appearance = resolveBuildingAppearance({
    tags: spec.tags,
    featureId: `material-preview-${archetype}`,
    wallHeight,
    footprintArea: 76,
    quality,
  });
  addBox(wallWidth, wallHeight, wallDepth, wallX, wallHeight / 2, wallZ,
    materialFor(spec.wallKind, `facade-wall-${archetype}`, spec.color));
  const foundation = new THREE.MeshStandardMaterial({ color: 0x716e67, roughness: 0.96 });
  addBox(wallWidth + 0.28, 0.28, wallDepth + 0.24, wallX, 0.14, wallZ, foundation);

  const plan = facadeComponentPlan({
    appearance,
    edgeLength: wallWidth,
    wallHeight,
    floorCount: 3,
    front: true,
    lite: quality === 'lite',
    featureId: `material-preview-${archetype}`,
  });
  for (const [index, part] of plan.entries()) {
    const width = part.width;
    const height = part.upperY - part.lowerY;
    const x = wallX - wallWidth / 2 + part.t * wallWidth;
    const y = (part.lowerY + part.upperY) / 2;
    const z = wallZ + wallDepth / 2 + part.offset + 0.012;
    const componentKind = /glass/i.test(part.materialKey) || part.kind === 'window' || part.kind === 'door' ? 'glass' : 'render';
    const trimColor = /glass/i.test(part.materialKey) || part.kind === 'window' || part.kind === 'door'
      ? 0x78999a
      : part.kind.includes('frame') || part.kind === 'cornice' || part.kind === 'lintel' ? 0xeee7d8 : 0x766b5d;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.max(0.04, height)), materialFor(componentKind, `facade-${part.kind}-${index}`, trimColor));
    panel.position.set(x, y, z);
    group.add(panel);
  }

  sceneTitle.textContent = `${spec.label} facade · ${plan.length} planned components`;
  legend.replaceChildren(...[
    ...Object.keys(CITY_MATERIALS).map((kind) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = `${kind} · ${CITY_MATERIALS[kind].scaleMeters ? Object.values(CITY_MATERIALS[kind].scaleMeters).slice(0, 2).join(' × ') + ' m' : ''}`;
      return chip;
    }),
    Object.assign(document.createElement('span'), { className: 'chip', textContent: `${plan.length} facade panels` }),
  ]);
}

function rebuild() {
  while (group.children.length) {
    const item = group.children[group.children.length - 1];
    group.remove(item);
    item.geometry?.dispose();
    const materials = Array.isArray(item.material) ? item.material : [item.material];
    materials.forEach((material) => material?.dispose?.());
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), materialFor('concrete', 'preview-ground', 0xc7cbc4));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(-1, -0.02, 0);
  floor.receiveShadow = true;
  group.add(floor);
  addSurfaceSamples();
  addFacade();
  status.textContent = `${quality} · ${legacy ? 'legacy' : 'detail on'}`;
}

function writeModeToUrl() {
  const params = new URLSearchParams(location.search);
  if (legacy) params.set('visuals', 'legacy');
  else if (quality === 'lite') params.set('visuals', 'lite');
  else params.delete('visuals');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function updateCamera() {
  const safePhi = THREE.MathUtils.clamp(phi, 0.25, Math.PI / 2.05);
  camera.position.set(
    target.x + radius * Math.sin(safePhi) * Math.sin(theta),
    target.y + radius * Math.cos(safePhi),
    target.z + radius * Math.sin(safePhi) * Math.cos(theta),
  );
  camera.lookAt(target);
}

try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'lite' ? 1.2 : 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = quality !== 'lite';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = renderer.shadowMap.enabled;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.bias = -0.00015;
  updateCamera();
  rebuild();

  function resize() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(() => renderer.render(scene, camera));

  let pointer = null;
  canvas.addEventListener('pointerdown', (event) => {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    theta -= (event.clientX - pointer.x) * 0.006;
    phi = THREE.MathUtils.clamp(phi + (event.clientY - pointer.y) * 0.005, 0.25, Math.PI / 2.05);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    updateCamera();
  });
  const endPointer = (event) => { if (pointer?.id === event.pointerId) pointer = null; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    radius = THREE.MathUtils.clamp(radius * Math.exp(event.deltaY * 0.001), 12, 38);
    updateCamera();
  }, { passive: false });

  qualityControl.addEventListener('change', () => {
    quality = qualityControl.value;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'lite' ? 1.2 : 1.7));
    renderer.shadowMap.enabled = quality !== 'lite';
    sun.castShadow = renderer.shadowMap.enabled;
    legacy = false;
    modeButton.setAttribute('aria-pressed', 'true');
    modeButton.textContent = 'Procedural detail';
    rebuild();
    writeModeToUrl();
  });
  archetypeControl.addEventListener('change', rebuild);
  modeButton.addEventListener('click', () => {
    legacy = !legacy;
    modeButton.setAttribute('aria-pressed', String(!legacy));
    modeButton.textContent = legacy ? 'Legacy surfaces' : 'Procedural detail';
    rebuild();
    writeModeToUrl();
  });
} catch (error) {
  status.textContent = 'WebGL unavailable';
  console.error('City visual preview could not start:', error);
}
