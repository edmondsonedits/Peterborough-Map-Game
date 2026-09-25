import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { ASSET_CATALOG, createCatalogObject } from '../city-explorer/editor/asset-catalog.js';
import { createAuthoredRuntime } from '../city-explorer/editor/authored-runtime.js';

const requiredCatalogFields = [
  'key',
  'label',
  'category',
  'defaultScale',
  'placementOffset',
  'supportedProperties',
  'factory',
];
const catalogueKeys = Object.keys(ASSET_CATALOG);
assert.ok(catalogueKeys.length >= 9, 'catalogue includes the initial safe asset set');
assert.equal(new Set(catalogueKeys).size, catalogueKeys.length, 'catalogue keys are unique');
for (const [key, entry] of Object.entries(ASSET_CATALOG)) {
  for (const field of requiredCatalogFields) assert.ok(field in entry, `${key} has ${field}`);
  assert.equal(entry.key, key, `${key} has a stable matching key`);
  assert.equal(typeof entry.label, 'string');
  assert.ok(entry.label.length > 0);
  assert.equal(typeof entry.category, 'string');
  assert.deepEqual(Object.keys(entry.defaultScale).sort(), ['x', 'y', 'z']);
  assert.deepEqual(Object.keys(entry.placementOffset).sort(), ['x', 'y', 'z']);
  assert.ok(Array.isArray(entry.supportedProperties));
  assert.equal(typeof entry.factory, 'function');
  const first = entry.factory(THREE);
  const second = entry.factory(THREE);
  assert.ok(first instanceof THREE.Group, `${key} factory returns a group`);
  assert.notEqual(first, second, `${key} factory returns a fresh group`);
}

const assetKey = catalogueKeys[0];
assert.ok(createCatalogObject(assetKey) instanceof THREE.Group);
assert.throws(() => createCatalogObject('unknown.asset'), /unknown|catalogue|asset/i);

const authoredDetailGroup = new THREE.Group();
const adapter = {
  THREE,
  project(latitude, longitude) {
    return { x: (longitude + 80) * 1000, y: (44.5 - latitude) * 1000 };
  },
  unproject(x, z) {
    return { longitude: x / 1000 - 80, latitude: 44.5 - z / 1000 };
  },
  terrainHeightAtWorld(x, z) {
    return 15 + x * 0.01 - z * 0.02;
  },
  authoredDetailGroup,
};
const runtime = createAuthoredRuntime(adapter);
const id = '00000000-0000-4000-8000-000000000001';
const record = {
  id,
  assetKey,
  label: 'Library tree',
  visible: true,
  properties: {},
  transform: {
    longitude: -78.32,
    latitude: 44.30,
    elevation: 2.5,
    rotation: { x: 0.1, y: 1.25, z: -0.2 },
    scale: { x: 1.1, y: 0.9, z: 1.2 },
  },
};
const document = {
  schemaVersion: 1,
  city: 'peterborough-on',
  revision: null,
  updatedAt: null,
  objects: [record],
  overrides: [],
};

runtime.load(document);
const object = runtime.getObject(id);
assert.ok(object instanceof THREE.Group);
assert.equal(object.parent, authoredDetailGroup, 'authored content stays in its dedicated group');
assert.deepEqual(object.userData.cityEditor, { kind: 'authored', id, assetKey });
const expectedPoint = adapter.project(record.transform.latitude, record.transform.longitude);
assert.ok(Math.abs(object.position.x - expectedPoint.x) < 1e-9);
assert.ok(Math.abs(object.position.z - expectedPoint.y) < 1e-9);
assert.ok(Math.abs(object.position.y - adapter.terrainHeightAtWorld(expectedPoint.x, expectedPoint.y) - record.transform.elevation) < 1e-9);
const geographicPosition = adapter.unproject(object.position.x, object.position.z);
assert.ok(Math.abs(geographicPosition.longitude - record.transform.longitude) < 1e-9);
assert.ok(Math.abs(geographicPosition.latitude - record.transform.latitude) < 1e-9);
assert.deepEqual(object.rotation.toArray().slice(0, 3), [0.1, 1.25, -0.2]);
assert.deepEqual(object.scale.toArray(), [1.1, 0.9, 1.2]);

runtime.remove(id);
assert.equal(runtime.getObject(id), null);
assert.equal(authoredDetailGroup.children.length, 0);
const hiddenRecord = { ...record, label: 'Hidden tree', visible: false };
runtime.upsert(record);
const replaced = runtime.upsert(hiddenRecord);
assert.equal(runtime.getObject(id), replaced);
assert.equal(replaced.name, 'Hidden tree');
assert.equal(replaced.visible, false);
assert.equal(authoredDetailGroup.children.length, 1, 'upsert replaces the prior rendered object');
runtime.dispose();
assert.equal(authoredDetailGroup.children.length, 0);

console.log(JSON.stringify({ status: 'pass', catalogueEntries: catalogueKeys.length, geographicRoundTrip: true }));
