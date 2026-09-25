import { ASSET_CATALOG, createCatalogObject } from './asset-catalog.js';

export function startOptionalTask(task, onError = () => {}) {
  if (typeof task !== 'function') throw new TypeError('Optional task must be a function.');
  void Promise.resolve().then(task).catch((error) => {
    try {
      onError(error);
    } catch {
      // A reporting callback must not turn an optional startup task into a failure.
    }
  });
}

function disposeObject(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
  root.removeFromParent();
}

export function createAuthoredRuntime(adapter) {
  const { THREE, project, terrainHeightAtWorld, authoredDetailGroup } = adapter;
  if (!THREE || typeof project !== 'function' || typeof terrainHeightAtWorld !== 'function' || !authoredDetailGroup?.add) {
    throw new TypeError('Authored runtime requires THREE, project, terrainHeightAtWorld, and authoredDetailGroup.');
  }
  const objects = new Map();

  function remove(id) {
    const object = objects.get(id);
    if (!object) return false;
    disposeObject(object);
    objects.delete(id);
    return true;
  }

  function upsert(record) {
    if (!record || typeof record.id !== 'string' || typeof record.assetKey !== 'string' || !record.transform) {
      throw new TypeError('Authored record requires id, assetKey, and transform.');
    }
    const asset = ASSET_CATALOG[record.assetKey];
    if (!asset) throw new RangeError(`Unknown authored asset: ${record.assetKey}`);
    const transform = record.transform;
    const point = project(transform.latitude, transform.longitude);
    const object = createCatalogObject(record.assetKey);
    const offset = asset.placementOffset;
    const baseScale = asset.defaultScale;
    const scale = transform.scale || { x: 1, y: 1, z: 1 };
    object.name = typeof record.label === 'string' ? record.label : asset.label;
    object.visible = record.visible !== false;
    object.position.set(
      point.x + offset.x,
      terrainHeightAtWorld(point.x, point.y) + transform.elevation + offset.y,
      point.y + offset.z,
    );
    const rotation = transform.rotation || { x: 0, y: 0, z: 0 };
    object.rotation.set(rotation.x, rotation.y, rotation.z);
    object.scale.set(scale.x * baseScale.x, scale.y * baseScale.y, scale.z * baseScale.z);
    object.userData.cityEditor = { kind: 'authored', id: record.id, assetKey: record.assetKey };

    remove(record.id);
    authoredDetailGroup.add(object);
    objects.set(record.id, object);
    return object;
  }

  function load(document) {
    if (!document || !Array.isArray(document.objects)) throw new TypeError('A normalized scene document is required.');
    for (const record of document.objects) {
      if (!ASSET_CATALOG[record?.assetKey]) throw new RangeError(`Unknown authored asset: ${record?.assetKey}`);
    }
    for (const id of objects.keys()) remove(id);
    for (const record of document.objects) upsert(record);
    return objects.size;
  }

  function getObject(id) {
    return objects.get(id) ?? null;
  }

  function dispose() {
    for (const id of objects.keys()) remove(id);
  }

  return { load, upsert, remove, getObject, dispose };
}
