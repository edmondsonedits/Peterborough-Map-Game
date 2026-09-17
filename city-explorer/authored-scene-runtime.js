export const AUTHORED_HANDOFF_FORMAT = 'peterborough-authored-scene-handoff';
export const AUTHORED_HANDOFF_VERSION = 1;
export const AUTHORED_SCENE_SCHEMA_VERSION = 1;
export const AUTHORED_COORDINATE_SYSTEM = 'WGS84+terrain-relative-meters';
export const AUTHORED_STATES = Object.freeze(['disabled', 'loading', 'ready', 'failed']);
export const PETERBOROUGH_AUTHORED_BOUNDS = Object.freeze({ minLat: 44.20, maxLat: 44.42, minLon: -78.50, maxLon: -78.18 });
export const AUTHORED_ASSET_IDS = Object.freeze([
  'tree-deciduous-fallback',
  'streetlight-standard-fallback',
  'hydrant-red-standard',
  'bench-standard-fallback',
  'traffic-sign-fallback',
  'fence-segment-fallback',
  'generic-prop-marker',
]);

const KNOWN_ASSET_IDS = new Set(AUTHORED_ASSET_IDS);
const SUPPORTED_SURFACE_MODES = new Set(['terrain', 'absolute']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

let worldBridge = null;
let authoredGroup = null;
let initializationPromise = null;
let currentState = Object.freeze({ status: 'disabled', enabled: false, count: 0, error: '', sceneId: '', source: '' });

function featureEnabled() {
  try { return new URLSearchParams(globalThis.location?.search || '').get('authored') === '1'; }
  catch { return false; }
}

function publish(next) {
  currentState = Object.freeze({ ...currentState, ...next });
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.authoredSceneStatus = currentState.status;
    root.dataset.authoredSceneEnabled = String(currentState.enabled);
    root.dataset.authoredSceneCount = String(currentState.count);
    root.dataset.authoredSceneSceneId = currentState.sceneId || '';
    if (currentState.error) root.dataset.authoredSceneError = currentState.error;
    else delete root.dataset.authoredSceneError;
  }
  return currentState;
}

function validationFailure(errors) {
  return { valid: false, errors };
}

function validateVector(value, path, errors, { positive = false } = {}) {
  if (!isObject(value)) {
    errors.push(`${path}: must be an object.`);
    return;
  }
  for (const axis of ['x', 'y', 'z']) {
    if (!finite(value[axis])) errors.push(`${path}.${axis}: must be finite.`);
    else if (positive && value[axis] <= 0) errors.push(`${path}.${axis}: must be greater than zero.`);
  }
}

export function validateAuthoredSourceScene(scene, { knownAssetIds = KNOWN_ASSET_IDS, bounds = PETERBOROUGH_AUTHORED_BOUNDS } = {}) {
  const errors = [];
  if (!isObject(scene)) return validationFailure(['sourceScene: must be an object.']);
  if (scene.schemaVersion !== AUTHORED_SCENE_SCHEMA_VERSION) errors.push(`sourceScene.schemaVersion: expected ${AUTHORED_SCENE_SCHEMA_VERSION}.`);
  if (typeof scene.sceneId !== 'string' || !scene.sceneId.trim()) errors.push('sourceScene.sceneId: must be a non-empty string.');
  if (scene.coordinateSystem !== AUTHORED_COORDINATE_SYSTEM) errors.push(`sourceScene.coordinateSystem: expected "${AUTHORED_COORDINATE_SYSTEM}".`);
  if (typeof scene.updatedAt !== 'string' || !Number.isFinite(Date.parse(scene.updatedAt))) errors.push('sourceScene.updatedAt: must be a valid date string.');
  if (!Array.isArray(scene.objects)) errors.push('sourceScene.objects: must be an array.');
  else {
    const ids = new Set();
    scene.objects.forEach((object, index) => {
      const path = `sourceScene.objects[${index}]`;
      if (!isObject(object)) {
        errors.push(`${path}: must be an object.`);
        return;
      }
      if (typeof object.id !== 'string' || !object.id.trim()) errors.push(`${path}.id: must be a non-empty string.`);
      else if (ids.has(object.id)) errors.push(`${path}.id: duplicate id "${object.id}".`);
      else ids.add(object.id);
      if (typeof object.assetId !== 'string' || !object.assetId.trim()) errors.push(`${path}.assetId: must be a non-empty string.`);
      else if (!knownAssetIds.has(object.assetId)) errors.push(`${path}.assetId: unknown asset "${object.assetId}".`);
      if (!isObject(object.position)) errors.push(`${path}.position: must be an object.`);
      else {
        const { lat, lon, heightOffsetM } = object.position;
        if (!finite(lat)) errors.push(`${path}.position.lat: must be finite.`);
        else if (lat < bounds.minLat || lat > bounds.maxLat) errors.push(`${path}.position.lat: outside Peterborough bounds.`);
        if (!finite(lon)) errors.push(`${path}.position.lon: must be finite.`);
        else if (lon < bounds.minLon || lon > bounds.maxLon) errors.push(`${path}.position.lon: outside Peterborough bounds.`);
        if (!finite(heightOffsetM)) errors.push(`${path}.position.heightOffsetM: must be finite.`);
      }
      validateVector(object.rotationDeg, `${path}.rotationDeg`, errors);
      validateVector(object.scale, `${path}.scale`, errors, { positive: true });
      if (!SUPPORTED_SURFACE_MODES.has(object.surfaceMode)) errors.push(`${path}.surfaceMode: unsupported value "${String(object.surfaceMode)}".`);
      if (!isObject(object.source)) errors.push(`${path}.source: must be an object.`);
      else for (const key of ['kind', 'reference', 'note']) if (typeof object.source[key] !== 'string') errors.push(`${path}.source.${key}: must be a string.`);
      if (!Array.isArray(object.tags) || object.tags.some(tag => typeof tag !== 'string')) errors.push(`${path}.tags: must be an array of strings.`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function validateAuthoredSceneHandoff(handoff, options = {}) {
  const errors = [];
  if (!isObject(handoff)) return validationFailure(['handoff: must be an object.']);
  if (handoff.format !== AUTHORED_HANDOFF_FORMAT) errors.push(`format: expected "${AUTHORED_HANDOFF_FORMAT}".`);
  if (handoff.formatVersion !== AUTHORED_HANDOFF_VERSION) errors.push(`formatVersion: expected ${AUTHORED_HANDOFF_VERSION}.`);
  const sceneValidation = validateAuthoredSourceScene(handoff.sourceScene, options);
  errors.push(...sceneValidation.errors);
  return { valid: errors.length === 0, errors };
}

export function prepareAuthoredRuntimeDescriptors(handoff, bridge = worldBridge) {
  const validation = validateAuthoredSceneHandoff(handoff);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  if (!bridge?.project || !bridge?.terrainHeightAtWorld) throw new Error('Simulator authored-scene world bridge is unavailable.');
  return handoff.sourceScene.objects.map(object => {
    const projected = bridge.project(object.position.lat, object.position.lon);
    const x = Number(projected?.x);
    const z = Number(projected?.z ?? projected?.y);
    if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error(`Projection failed for authored object "${object.id}".`);
    const terrainY = Number(bridge.terrainHeightAtWorld(x, z));
    if (!Number.isFinite(terrainY)) throw new Error(`Terrain sampling failed for authored object "${object.id}".`);
    const y = object.surfaceMode === 'terrain' ? terrainY + object.position.heightOffsetM : object.position.heightOffsetM;
    return {
      id: object.id,
      assetId: object.assetId,
      position: { x, y, z },
      rotationDeg: { ...object.rotationDeg },
      scale: { ...object.scale },
      source: { ...object.source },
      tags: [...object.tags],
    };
  });
}

function ensureGroup() {
  if (!worldBridge?.THREE || !worldBridge?.scene) throw new Error('Simulator authored-scene render bridge is unavailable.');
  if (authoredGroup) return authoredGroup;
  authoredGroup = new worldBridge.THREE.Group();
  authoredGroup.name = 'authoredDetailGroup';
  authoredGroup.userData = { type: 'editor-authored-detail-layer', proxyOnly: true };
  worldBridge.scene.add(authoredGroup);
  return authoredGroup;
}

function disposeMaterial(material) {
  if (Array.isArray(material)) material.forEach(item => item?.dispose?.());
  else material?.dispose?.();
}

function disposeObject(object) {
  object.traverse?.(child => {
    child.geometry?.dispose?.();
    disposeMaterial(child.material);
  });
}

export function clearAuthoredScene() {
  if (!authoredGroup) return 0;
  const children = [...authoredGroup.children];
  for (const child of children) {
    authoredGroup.remove(child);
    disposeObject(child);
  }
  return children.length;
}

function createProxy(descriptor) {
  const { THREE } = worldBridge;
  const root = new THREE.Group();
  root.name = `Authored proxy: ${descriptor.id}`;
  root.position.set(descriptor.position.x, descriptor.position.y, descriptor.position.z);
  root.rotation.set(
    THREE.MathUtils.degToRad(descriptor.rotationDeg.x),
    THREE.MathUtils.degToRad(descriptor.rotationDeg.y),
    THREE.MathUtils.degToRad(descriptor.rotationDeg.z),
    'XYZ',
  );
  root.scale.set(descriptor.scale.x, descriptor.scale.y, descriptor.scale.z);
  root.userData = {
    type: 'authored-scene-proxy',
    authoredObjectId: descriptor.id,
    assetId: descriptor.assetId,
    proxyOnly: true,
  };

  const material = new THREE.MeshStandardMaterial({ color: 0xf0a53a, roughness: 0.7, metalness: 0.05 });
  const geometry = descriptor.assetId === 'generic-prop-marker'
    ? new THREE.CylinderGeometry(0.28, 0.38, 1.2, 8)
    : new THREE.BoxGeometry(0.65, 1.1, 0.65);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = descriptor.assetId === 'generic-prop-marker' ? 0.6 : 0.55;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { proxyForAssetId: descriptor.assetId };
  root.add(mesh);
  return root;
}

export function registerAuthoredSceneWorldBridge({ THREE, scene, project, terrainHeightAtWorld } = {}) {
  if (!THREE || !scene || typeof project !== 'function' || typeof terrainHeightAtWorld !== 'function') return false;
  worldBridge = { THREE, scene, project, terrainHeightAtWorld };
  if (authoredGroup && authoredGroup.parent !== scene) scene.add(authoredGroup);
  return true;
}

export async function fetchAuthoredSceneHandoff(fetchImpl = globalThis.fetch, url = new URL('./data/authored/peterborough-details.handoff.json', import.meta.url)) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable for the authored scene.');
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response?.ok) throw new Error(`Authored scene handoff returned ${response?.status ?? 'no response'}.`);
  try { return await response.json(); }
  catch (error) { throw new Error(`Authored scene handoff is not valid JSON: ${error?.message || error}`); }
}

export async function initializeAuthoredScene({ force = false, fetchImpl = globalThis.fetch } = {}) {
  const enabled = featureEnabled();
  if (!enabled) {
    clearAuthoredScene();
    return publish({ status: 'disabled', enabled: false, count: 0, error: '', sceneId: '', source: '' });
  }
  if (initializationPromise && !force) return initializationPromise;
  initializationPromise = (async () => {
    publish({ status: 'loading', enabled: true, count: 0, error: '', source: 'data/authored/peterborough-details.handoff.json' });
    try {
      if (!worldBridge) throw new Error('Simulator authored-scene world bridge was not registered.');
      clearAuthoredScene();
      const handoff = await fetchAuthoredSceneHandoff(fetchImpl);
      const descriptors = prepareAuthoredRuntimeDescriptors(handoff, worldBridge);
      const group = ensureGroup();
      for (const descriptor of descriptors) group.add(createProxy(descriptor));
      return publish({
        status: 'ready', enabled: true, count: descriptors.length, error: '',
        sceneId: handoff.sourceScene.sceneId, source: 'data/authored/peterborough-details.handoff.json',
      });
    } catch (error) {
      clearAuthoredScene();
      console.warn('Optional editor-authored detail layer failed; base Peterborough simulator remains active.', error);
      return publish({ status: 'failed', enabled: true, count: 0, error: String(error?.message || error), sceneId: '' });
    } finally {
      initializationPromise = null;
    }
  })();
  return initializationPromise;
}

export async function reloadAuthoredScene() {
  return initializeAuthoredScene({ force: true });
}

export function disposeAuthoredScene() {
  clearAuthoredScene();
  if (authoredGroup?.parent) authoredGroup.parent.remove(authoredGroup);
  authoredGroup = null;
  return publish({ status: 'disabled', enabled: featureEnabled(), count: 0, error: '', sceneId: '' });
}

export function authoredSceneDiagnostics() {
  return Object.freeze({ ...currentState, groupChildren: authoredGroup?.children?.length || 0, bridgeReady: Boolean(worldBridge) });
}

publish({ status: 'disabled', enabled: featureEnabled(), count: 0, error: '' });

globalThis.__PTBO_AUTHORED_SCENE__ = Object.freeze({
  status: authoredSceneDiagnostics,
  reload: reloadAuthoredScene,
  dispose: disposeAuthoredScene,
});
