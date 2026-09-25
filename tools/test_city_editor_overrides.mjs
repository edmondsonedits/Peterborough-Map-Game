import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {
  makeGeneratedId,
  createGeneratedRegistry,
} from '../city-explorer/editor/generated-registry.js';
import { applyOverrides } from '../city-explorer/editor/override-runtime.js';
import { captureBatchLengths, collectBatchRanges, createFeatureBatchBinding } from '../city-explorer/editor/feature-batch-binding.js';

const polygon = { type: 'Polygon', coordinates: [[[-78.32, 44.30], [-78.31, 44.30], [-78.31, 44.31], [-78.32, 44.30]]] };
const samePolygonAtNoise = { type: 'Polygon', coordinates: [[[-78.320000001, 44.300000001], [-78.310000001, 44.300000001], [-78.310000001, 44.310000001], [-78.320000001, 44.300000001]]] };
assert.match(makeGeneratedId({ sourceType: 'building', sourceId: 'way/42' }), /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i, 'generated identities are valid UUIDs');

assert.equal(
  makeGeneratedId({ sourceType: 'building', sourceId: 'way/42' }),
  makeGeneratedId({ sourceType: 'building', sourceId: 'way/42' }),
  'source feature identity is independent of creation order',
);
assert.notEqual(
  makeGeneratedId({ sourceType: 'building', sourceId: 'way/42' }),
  makeGeneratedId({ sourceType: 'building', sourceId: 'way/43' }),
);
assert.notEqual(
  makeGeneratedId({ sourceType: 'tree', sourceId: 'way/park', sourceSubId: 'polygon-a:1' }),
  makeGeneratedId({ sourceType: 'tree', sourceId: 'way/park', sourceSubId: 'polygon-b:1' }),
  'multipart generated children include a stable polygon discriminator',
);
const polygonAId = makeGeneratedId({ sourceType: 'tree-scatter-polygon', geometry: polygon });
const polygonBId = makeGeneratedId({ sourceType: 'tree-scatter-polygon', geometry: { type: 'Polygon', coordinates: [[[-78.30, 44.30], [-78.29, 44.30], [-78.29, 44.31], [-78.30, 44.30]]] } });
assert.notEqual(
  makeGeneratedId({ sourceType: 'tree', sourceId: 'way/park', sourceSubId: `${polygonAId}:1` }),
  makeGeneratedId({ sourceType: 'tree', sourceId: 'way/park', sourceSubId: `${polygonBId}:1` }),
  'same scatter attempt in distinct MultiPolygon members has distinct generated identity',
);
const creationOrder = (sources) => {
  const orderedRegistry = createGeneratedRegistry();
  const result = new Map();
  sources.forEach((sourceId) => {
    const id = orderedRegistry.registerEditableObject({ visible: true, userData: {} }, { sourceType: 'building', sourceId });
    result.set(sourceId, id);
  });
  return result;
};
assert.deepEqual(creationOrder(['way/42', 'way/43']), creationOrder(['way/43', 'way/42']));
assert.equal(
  makeGeneratedId({ sourceType: 'building', geometry: polygon }),
  makeGeneratedId({ sourceType: 'building', geometry: samePolygonAtNoise }),
  'fallback geometry identity rounds canonical WGS84 coordinates',
);

const registry = createGeneratedRegistry();
const root = { visible: true, material: { color: { value: '#ffffff' }, opacity: 1, clone() { return { ...this, color: { ...this.color } }; } }, userData: {} };
const targetId = registry.registerEditableObject(root, {
  sourceType: 'building', sourceId: 'way/42', label: 'Test Hall',
  transform: { longitude: -78.32, latitude: 44.30, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
});
assert.equal(registry.getEditableRecord(targetId).id, targetId);

applyOverrides({ overrides: [{ id: targetId, operation: 'hide' }] }, { registry });
assert.equal(root.visible, false, 'hide affects the target root');
applyOverrides({ overrides: [] }, { registry });
assert.equal(root.visible, true, 'removing the override restores the generated root');

const originalMaterial = root.material;
applyOverrides({ overrides: [{ id: targetId, operation: 'appearance', appearance: { color: '#ff0000', opacity: 0.5 } }] }, { registry });
assert.notEqual(root.material, originalMaterial, 'appearance clones shared source material');
assert.equal(root.material.color.value, '#ff0000');
assert.equal(root.material.opacity, 0.5);

const authoredRecords = new Map();
const adapter = {
  registry,
  authoredRuntime: {
    upsert(record) { authoredRecords.set(record.id, { ...record, userData: { cityEditor: { kind: 'authored', sourceTargetId: record.sourceTargetId } } }); },
    remove(id) { authoredRecords.delete(id); },
    getObject(id) { return authoredRecords.get(id) || null; },
  },
};
applyOverrides({ overrides: [{ id: targetId, operation: 'replace', assetKey: 'tree' }] }, adapter);
assert.equal(root.visible, false, 'replacement hides its generated source');
assert.equal([...authoredRecords.values()][0]?.userData.cityEditor.sourceTargetId, targetId);
applyOverrides({ overrides: [] }, adapter);
assert.equal(root.visible, true, 'removing replacement restores its generated source');
assert.equal(authoredRecords.size, 0, 'removing replacement disposes its authored replacement');

const matrices = [
  { position: [1, 2, 3], scale: [1, 1, 1] },
  { position: [4, 5, 6], scale: [1, 1, 1] },
];
const instanceRoot = {
  visible: true, userData: {},
  getMatrixAt(index, target) { target.value = structuredClone(matrices[index]); },
  setMatrixAt(index, matrix) { matrices[index] = structuredClone(matrix.value); },
  instanceMatrix: { needsUpdate: false },
};
const instanceRegistry = createGeneratedRegistry();
const firstInstanceId = instanceRegistry.registerEditableObject(instanceRoot, { sourceType: 'tree', sourceId: 'node/1', instanceIndex: 0 });
instanceRegistry.registerEditableObject(instanceRoot, { sourceType: 'tree', sourceId: 'node/2', instanceIndex: 1 });
applyOverrides({ overrides: [{ id: firstInstanceId, operation: 'hide' }] }, { registry: instanceRegistry });
assert.deepEqual(matrices[0].scale, [0, 0, 0], 'hide masks only the selected instance');
assert.deepEqual(matrices[1], { position: [4, 5, 6], scale: [1, 1, 1] }, 'adjacent instance remains unchanged');
applyOverrides({ overrides: [] }, { registry: instanceRegistry });
assert.deepEqual(matrices[0], { position: [1, 2, 3], scale: [1, 1, 1] }, 'removing the override restores the masked instance');

const batches = new Map([['wall', { positions: [1, 2, 3, 4, 5, 6] }], ['roof', { positions: [7, 8, 9] }]]);
const starts = captureBatchLengths(batches);
batches.get('wall').positions.push(10, 11, 12);
batches.get('roof').positions.push(13, 14, 15);
const ranges = collectBatchRanges(batches, starts);
const makeAttribute = (array) => ({ array: Float32Array.from(array), needsUpdate: false });
const batchMeshes = new Map([
  ['wall', { geometry: { attributes: { position: makeAttribute(batches.get('wall').positions), color: makeAttribute(Array(batches.get('wall').positions.length).fill(1)) }, getAttribute(name) { return this.attributes[name]; }, computeBoundingSphere() {} } }],
  ['roof', { geometry: { attributes: { position: makeAttribute(batches.get('roof').positions), color: makeAttribute(Array(batches.get('roof').positions.length).fill(1)) }, getAttribute(name) { return this.attributes[name]; }, computeBoundingSphere() {} } }],
]);
const binding = createFeatureBatchBinding(ranges, (key) => batchMeshes.get(key));
const adjacentWall = [...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(0, 6)];
binding.setVisible(false);
assert.deepEqual([...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(0, 6)], adjacentWall, 'hiding a batched feature leaves adjacent geometry unchanged');
assert.deepEqual([...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(6)], [0, 0, 0]);
assert.equal(binding.setAppearance({ color: '#ff0000' }), true);
assert.deepEqual([...batchMeshes.get('roof').geometry.getAttribute('color').array.slice(3)], [1, 0, 0]);
binding.restore();
assert.deepEqual([...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(6)], [10, 11, 12]);
assert.deepEqual([...batchMeshes.get('roof').geometry.getAttribute('color').array.slice(3)], [1, 1, 1]);
const realInstances = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 2);
realInstances.userData.cityEditorMatrixFactory = () => new THREE.Matrix4();
realInstances.userData.cityEditorColorFactory = () => new THREE.Color();
const realInstanceRegistry = createGeneratedRegistry();
const realInstanceId = realInstanceRegistry.registerEditableObject(realInstances, { sourceType: 'tree', sourceId: 'node/real', instanceIndex: 0 });
assert.equal(realInstances.instanceColor, null, 'Three.js lazily allocates instance colors');
const initializedColorSlots = [];
const setRealInstanceColorAt = realInstances.setColorAt.bind(realInstances);
realInstances.setColorAt = (index, color) => {
  initializedColorSlots.push(index);
  setRealInstanceColorAt(index, color);
};
applyOverrides({ overrides: [{ id: realInstanceId, operation: 'appearance', appearance: { color: '#ff0000' } }] }, { registry: realInstanceRegistry, THREE });
assert.deepEqual(initializedColorSlots, [0, 1, 0, 0], 'new instance-color buffers initialize every instance to white before applying the target color');
const neighborColor = new THREE.Color();
realInstances.getColorAt(1, neighborColor);
assert.equal(neighborColor.getHex(), 0xffffff, 'first per-instance appearance preserves untouched white neighbors');
applyOverrides({ overrides: [] }, { registry: realInstanceRegistry, THREE });
realInstances.getColorAt(1, neighborColor);
assert.equal(neighborColor.getHex(), 0xffffff, 'restoring the target does not blacken adjacent instances');
const repeatedKeyMesh = { geometry: { position: makeAttribute([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), getAttribute(name) { return name === 'position' ? this.position : null; }, computeBoundingSphere() {} } };
const repeatedKeyBinding = createFeatureBatchBinding([
  { key: 'shared', startVertex: 1, vertexCount: 1 },
  { key: 'shared', startVertex: 4, vertexCount: 1 },
], () => repeatedKeyMesh);
const repeatedKeyOriginal = [...repeatedKeyMesh.geometry.position.array];
repeatedKeyBinding.setVisible(false);
repeatedKeyBinding.restore();
assert.deepEqual([...repeatedKeyMesh.geometry.position.array], repeatedKeyOriginal, 'two disjoint ranges sharing a batch key restore their own source slices');

const featureRegistry = createGeneratedRegistry();
const featureProxy = { visible: true, userData: {} };
const featureId = featureRegistry.registerEditableObject(featureProxy, {
  sourceType: 'building', sourceId: 'way/99', label: 'Batch-bound building',
  transform: { longitude: -78.32, latitude: 44.30, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
  batchBinding: binding,
});
applyOverrides({ overrides: [{ id: featureId, operation: 'hide' }] }, { registry: featureRegistry });
assert.deepEqual([...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(6)], [0, 0, 0], 'generated overrides route through the exact feature batch binding');
applyOverrides({ overrides: [] }, { registry: featureRegistry });
assert.deepEqual([...batchMeshes.get('wall').geometry.getAttribute('position').array.slice(6)], [10, 11, 12]);
applyOverrides({ overrides: [{ id: featureId, operation: 'appearance', appearance: { color: '#00ff00' } }] }, { registry: featureRegistry });
assert.deepEqual([...batchMeshes.get('roof').geometry.getAttribute('color').array.slice(3)], [0, 1, 0], 'appearance changes only the target feature color across its batches');
applyOverrides({ overrides: [] }, { registry: featureRegistry });
assert.deepEqual([...batchMeshes.get('roof').geometry.getAttribute('color').array.slice(3)], [1, 1, 1]);
featureRegistry.attachEditablePart(featureId, instanceRoot, 1);
applyOverrides({ overrides: [{ id: featureId, operation: 'hide' }] }, { registry: featureRegistry });
assert.deepEqual(matrices[1].scale, [0, 0, 0], 'building overrides also mask individually instanced rooftop equipment');
applyOverrides({ overrides: [] }, { registry: featureRegistry });
assert.deepEqual(matrices[1], { position: [4, 5, 6], scale: [1, 1, 1] });
const sharedRoadDetail = { ...instanceRoot };
const lanePaintMatrices = [{ position: [7, 8, 9], scale: [1, 1, 1] }];
const bridgeDetailMatrices = [{ position: [10, 11, 12], scale: [1, 1, 1] }];
const makeDetailInstances = (matricesForDetail) => ({
  visible: true,
  userData: {},
  getMatrixAt(index, target) { target.value = structuredClone(matricesForDetail[index]); },
  setMatrixAt(index, matrix) { matricesForDetail[index] = structuredClone(matrix.value); },
  instanceMatrix: { needsUpdate: false },
});
const lanePaint = makeDetailInstances(lanePaintMatrices);
const bridgeDetails = makeDetailInstances(bridgeDetailMatrices);
const roadRegistry = createGeneratedRegistry();
const roadA = roadRegistry.registerEditableObject({ visible: true, userData: {} }, { sourceType: 'road', sourceId: 'way/a' });
const roadB = roadRegistry.registerEditableObject({ visible: true, userData: {} }, { sourceType: 'road', sourceId: 'way/b' });
roadRegistry.attachEditablePart(roadA, sharedRoadDetail, 0);
roadRegistry.attachEditablePart(roadB, sharedRoadDetail, 0);
roadRegistry.attachEditablePart(roadA, lanePaint, 0);
roadRegistry.attachEditablePart(roadA, bridgeDetails, 0);
applyOverrides({ overrides: [{ id: roadA, operation: 'hide' }] }, { registry: roadRegistry });
assert.deepEqual(matrices[0], { position: [1, 2, 3], scale: [1, 1, 1] }, 'shared junction detail remains while a connected road is visible');
assert.deepEqual(lanePaintMatrices[0].scale, [0, 0, 0], 'lane paint instances are bound to their road target');
assert.deepEqual(bridgeDetailMatrices[0].scale, [0, 0, 0], 'bridge detail instances are bound to their road target');
applyOverrides({ overrides: [{ id: roadA, operation: 'hide' }, { id: roadB, operation: 'hide' }] }, { registry: roadRegistry });
assert.deepEqual(matrices[0].scale, [0, 0, 0], 'junction detail hides after all connected road owners are hidden');
applyOverrides({ overrides: [{ id: roadB, operation: 'hide' }] }, { registry: roadRegistry });
assert.deepEqual(matrices[0], { position: [1, 2, 3], scale: [1, 1, 1] }, 'junction detail remains when at least one connected road is visible');
applyOverrides({ overrides: [] }, { registry: roadRegistry });
assert.deepEqual(matrices[0], { position: [1, 2, 3], scale: [1, 1, 1] });
assert.deepEqual(lanePaintMatrices[0], { position: [7, 8, 9], scale: [1, 1, 1] }, 'lane paint restores with its road ribbon');
assert.deepEqual(bridgeDetailMatrices[0], { position: [10, 11, 12], scale: [1, 1, 1] }, 'bridge details restore with their road ribbon');

const unpreparedRoadDetail = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
const realRoadRegistry = createGeneratedRegistry(THREE);
const realRoadId = realRoadRegistry.registerEditableObject({ visible: true, userData: {} }, { sourceType: 'road', sourceId: 'way/real-road' });
realRoadRegistry.attachEditablePart(realRoadId, unpreparedRoadDetail, 0);
assert.ok(unpreparedRoadDetail.userData.cityEditorColorFactory() instanceof THREE.Color, 'registry adapter prepares real Three.js color factories before attachment');
assert.ok(unpreparedRoadDetail.userData.cityEditorMatrixFactory() instanceof THREE.Matrix4, 'registry adapter prepares real Three.js matrix factories before attachment');
assert.doesNotThrow(
  () => applyOverrides({ overrides: [] }, { registry: realRoadRegistry }),
  'restoring an empty document must support real road-detail InstancedMesh objects',
);

console.log('Generated city asset IDs, overrides, and instance masking passed.');
