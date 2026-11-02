import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeatureBatchBinding } from '../city-explorer/editor/feature-batch-binding.js';
import { applyOverrides } from '../city-explorer/editor/override-runtime.js';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';

function mesh() {
  let bounds = 0;
  const attributes = {
    position: { array: new Float32Array([1, 2, 3, 4, 5, 6]), needsUpdate: false },
    color: { array: new Float32Array([1, 1, 1, 1, 1, 1]), needsUpdate: false },
  };
  return { geometry: { getAttribute: name => attributes[name], computeBoundingSphere() { bounds += 1; } }, attributes, get bounds() { return bounds; } };
}

test('empty first editor application does not restore untouched registry records', () => {
  let restores = 0;
  const registry = { records: new Map([['one', {}], ['two', {}]]), appliedReplacementIds: new Set(), resetOverrides() {}, restore() { restores += 1; } };
  assert.equal(applyOverrides(createEmptySceneDocument(), { registry }), true);
  assert.equal(restores, 0);
});

test('batch binding skips initial no-op restore and updates bounds once per changed mesh', () => {
  const a = mesh(); const b = mesh();
  const binding = createFeatureBatchBinding([{ key: 'a', startVertex: 0, vertexCount: 2 }, { key: 'a', startVertex: 0, vertexCount: 2 }, { key: 'b', startVertex: 0, vertexCount: 2 }], key => key === 'a' ? a : b);
  binding.restore();
  assert.equal(a.bounds + b.bounds, 0);
  binding.setVisible(false);
  assert.equal(a.bounds, 1); assert.equal(b.bounds, 1);
  binding.restore();
  assert.equal(a.bounds, 2); assert.equal(b.bounds, 2);
  assert.deepEqual([...a.attributes.position.array], [1, 2, 3, 4, 5, 6]);
  binding.setAppearance({ color: '#ff0000' });
  assert.deepEqual([...a.attributes.color.array], [1, 0, 0, 1, 0, 0]);
  binding.restore();
  assert.deepEqual([...a.attributes.color.array], [1, 1, 1, 1, 1, 1]);
});

test('reapplication restores and reapplies only override targets, and removal restores them', () => {
  const counts = { restore: 0, hide: 0, appearance: 0, upsert: 0, remove: 0 };
  const ids = ['hide-target', 'appearance-target', 'replace-target'];
  const registry = {
    records: new Map(ids.map(id => [id, {}])), appliedReplacementIds: new Set(),
    getEditableRecord: id => registry.records.has(id) ? { label: id, transform: null } : null,
    restore() { counts.restore += 1; },
    hide() { counts.hide += 1; },
    setAppearance() { counts.appearance += 1; },
  };
  const replacementId = 'replacement-object';
  const authoredRuntime = {
    upsert() { counts.upsert += 1; },
    remove() { counts.remove += 1; },
    getObject() { return null; },
  };
  const document = { overrides: [
    { id: ids[0], operation: 'hide' },
    { id: ids[1], operation: 'appearance', appearance: { color: '#123456' } },
    { id: ids[2], operation: 'replace', assetKey: 'building' },
  ], objects: [] };
  applyOverrides(document, { registry, authoredRuntime });
  applyOverrides(document, { registry, authoredRuntime });
  assert.deepEqual(counts, { restore: 3, hide: 4, appearance: 2, upsert: 2, remove: 1 });
  assert.ok(registry.appliedReplacementIds.size === 1);
  applyOverrides({ overrides: [], objects: [] }, { registry, authoredRuntime });
  assert.deepEqual(counts, { restore: 6, hide: 4, appearance: 2, upsert: 2, remove: 2 });
  assert.equal(registry.appliedReplacementIds.size, 0);
});

test('replacement objects are rebuilt after authored runtime reload and regain their source tag', () => {
  const target = 'replace-after-load';
  const registry = {
    appliedReplacementIds: new Set(), getEditableRecord: () => ({ id: target, label: 'Source', transform: null }),
    restore() {}, hide() {},
  };
  let object = null;
  const runtime = {
    load() { object = { userData: { cityEditor: { kind: 'authored' } } }; },
    remove() { object = null; },
    upsert() { object ||= { userData: {} }; },
    getObject() { return object; },
  };
  const document = { overrides: [{ id: target, operation: 'replace', assetKey: 'building' }], objects: [] };
  applyOverrides(document, { registry, authoredRuntime: runtime });
  runtime.load();
  applyOverrides(document, { registry, authoredRuntime: runtime });
  assert.equal(object.userData.cityEditor.sourceTargetId, target);
});

test('shared instance is visible when one shared owner no longer has a hide override', async () => {
  const THREE = await import('../city-explorer/vendor/three-r180/build/three.module.min.js');
  const { createGeneratedRegistry } = await import('../city-explorer/editor/generated-registry.js');
  const registry = createGeneratedRegistry(THREE);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(4, 0, 0));
  const first = registry.registerEditableObject(new THREE.Group(), { sourceType: 'building', sourceId: 'shared-a' });
  const second = registry.registerEditableObject(new THREE.Group(), { sourceType: 'building', sourceId: 'shared-b' });
  registry.attachEditablePart(first, mesh, 0);
  registry.attachEditablePart(second, mesh, 0);
  const hidden = new Map([first, second].map(id => [id, { id, operation: 'hide' }]));
  const document = overrides => ({ overrides, objects: [] });
  applyOverrides(document([...hidden.values()]), { registry });
  applyOverrides(document([hidden.get(second)]), { registry });
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  assert.deepEqual([matrix.elements[0], matrix.elements[5], matrix.elements[10]], [1, 1, 1]);
  assert.equal(matrix.elements[12], 4);
  applyOverrides(document([]), { registry });
  mesh.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 4);
});

test('a batch binding observes ranges appended by a later streamed road refresh', () => {
  const source = mesh();
  const ranges = [];
  const binding = createFeatureBatchBinding(ranges, () => source);
  binding.setVisible(false);
  ranges.push({ key: 'streamed', startVertex: 0, vertexCount: 2 });
  binding.refresh();
  assert.deepEqual([...source.attributes.position.array], [0, 0, 0, 0, 0, 0]);
  binding.restore();
  assert.deepEqual([...source.attributes.position.array], [1, 2, 3, 4, 5, 6]);
});

test('removing one shared appearance override reapplies the remaining owner color', async () => {
  const THREE = await import('../city-explorer/vendor/three-r180/build/three.module.min.js');
  const { createGeneratedRegistry } = await import('../city-explorer/editor/generated-registry.js');
  const registry = createGeneratedRegistry(THREE);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new THREE.Matrix4());
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  const first = registry.registerEditableObject(mesh, { sourceType: 'building', sourceId: 'color-a', instanceIndex: 0 });
  const second = registry.registerEditableObject(mesh, { sourceType: 'building', sourceId: 'color-b', instanceIndex: 0 });
  const firstOverride = { id: first, operation: 'appearance', appearance: { color: '#ff0000' } };
  const secondOverride = { id: second, operation: 'appearance', appearance: { color: '#0000ff' } };
  const document = overrides => ({ overrides, objects: [] });
  applyOverrides(document([firstOverride, secondOverride]), { registry, THREE });
  applyOverrides(document([secondOverride]), { registry, THREE });
  const color = new THREE.Color();
  mesh.getColorAt(0, color);
  assert.equal(color.getHex(), 0x0000ff);
});
