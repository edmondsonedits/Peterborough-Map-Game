import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createCommandHistory } from '../city-explorer/editor/command-history.js';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';
import { createGeneratedReplacementDocument } from '../city-explorer/editor/city-editor-selection.js';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createFeatureBatchBinding } from '../city-explorer/editor/feature-batch-binding.js';
import { createAuthoredRuntime } from '../city-explorer/editor/authored-runtime.js';
import { createGeneratedRegistry } from '../city-explorer/editor/generated-registry.js';
import { applyOverrides } from '../city-explorer/editor/override-runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'city-explorer/index.html'), 'utf8');
const app = await readFile(path.join(root, 'city-explorer/app.js'), 'utf8');
const editor = await readFile(path.join(root, 'city-explorer/editor/city-editor.js'), 'utf8');
const transformControls = await readFile(path.join(root, 'city-explorer/vendor/three-r180/examples/jsm/controls/TransformControls.js'), 'utf8');
const threePackage = JSON.parse(await readFile(path.join(root, 'city-explorer/vendor/three-r180/package.json'), 'utf8'));
const threeLicense = await readFile(path.join(root, 'city-explorer/vendor/three-r180/LICENSE'), 'utf8');

assert.match(html, /id="editor-mode"/, 'the simulator should provide an Editor entry point');
assert.match(html, /id="city-editor-left"/, 'the editor should provide an asset and layer drawer');
assert.match(html, /id="city-editor-inspector"/, 'the editor should provide an inspector');
assert.match(html, /id="city-editor-transform-toolbar"/, 'the editor should provide transform controls');
assert.match(html, /id="city-editor-status"/, 'the editor should provide a status and action bar');
assert.match(html, /data-editor-save-version/, 'the editor should provide a Save Version action');
assert.match(html, /data-editor-export[^>]*>Download\/Export JSON<\/button>/, 'the editor should provide an explicit local JSON download/export action');
assert.match(html, /name="city-editor-publisher"/, 'the static page should expose a publisher URL configuration point');
assert.match(html, /id="city-editor-recovery"/, 'the editor should provide draft recovery UI');

assert.match(app, /createCityEditor\(/, 'the application should construct the editor adapter');
assert.match(app, /cityEditor\.update\(delta\)/, 'the single animation loop should update the editor');
assert.match(app, /cityEditor\?\.enter\(\)/, 'the Editor button should enter editor mode');
assert.match(app, /\.get\('editor'\) === '1'[\s\S]*?cityEditor\.enter\(\)/, 'private owner editor query should request entry through the same guard');
assert.match(app, /data\/editor\/peterborough-details\.json/, 'published authored content should load');
assert.match(app, /onChange:\s*\(documentValue\)\s*=>[\s\S]*?draftStore\.saveDraft\(documentValue/, 'every editor document change should schedule local recovery autosave');
assert.match(editor, /Publisher not configured; local draft is safe\./, 'an absent publisher must be reported honestly while preserving the local draft');
assert.match(editor, /data-editor-export/, 'the local JSON export action must remain wired while publishing is unavailable');
assert.match(app, /if\s*\(!result\.ok\)[\s\S]*?initializeCityEditor\(createEmptySceneDocument\(\)\);[\s\S]*?return;/, 'invalid published content should leave the editor available with an empty document');
assert.match(app, /if\s*\(cityEditor\?\.active\)/, 'global simulator shortcuts should be isolated in editor mode');
assert.match(html, /"three\/addons\/":\s*"\.\/vendor\/three-r180\/examples\/jsm\//, 'the addon import map should resolve to Three r180');
assert.match(editor, /three\/addons\/controls\/TransformControls\.js/, 'the editor should use the import-mapped transform controls');
assert.equal(threePackage.version, '0.180.0', 'the vendored controls should match the pinned Three package');
assert.match(transformControls, /class TransformControls extends Controls/, 'the vendored module should be the r180 TransformControls implementation');
assert.match(threeLicense, /The MIT License/, 'the upstream Three.js license must remain available');
assert.doesNotMatch(html + app, /AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/, 'committed sources must not contain API secrets');

const { pickEditorSelection, isProtectedEditorTarget } = await import('../city-explorer/editor/city-editor-selection.js');
const nearUnregistered = { distance: 1, object: { name: 'decoration' } };
const farRegistered = { distance: 2, object: { userData: { cityEditor: { id: 'authored-1', kind: 'authored' } } } };
assert.equal(
  pickEditorSelection([nearUnregistered, farRegistered], (id) => id === 'authored-1')?.id,
  'authored-1',
  'selection should skip unregistered geometry and choose the nearest registered editable record',
);

const protectedRoot = { name: 'protected world', parent: null };
const protectedChild = { name: 'world building', parent: protectedRoot };
assert.equal(
  isProtectedEditorTarget(protectedChild, new Set([protectedRoot])),
  true,
  'selection and transforms must reject targets inside protected simulator groups',
);

const generated = { id: '00000000-0000-4000-8000-000000000100', assetKey: 'building', label: 'Library', transform: { longitude: -78.32, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } };
const replacementId = '00000000-0000-4000-8000-000000000099';
const replacementTransform = { ...generated.transform, longitude: -78.31, rotation: { x: 0, y: 0.5, z: 0 } };
const replacementDocument = createGeneratedReplacementDocument(createEmptySceneDocument(), generated, replacementTransform, replacementId);
const history = createCommandHistory({ initialDocument: createEmptySceneDocument() });
assert.equal(history.execute('Transform generated feature', replacementDocument), true);
assert.equal(history.current.objects[0].id, replacementId);
assert.equal(history.current.objects[0].assetKey, 'generated-source-clone');
assert.deepEqual(history.current.objects[0].properties, { sourceTargetId: generated.id });
assert.deepEqual(history.current.overrides, [{ id: generated.id, operation: 'replace', assetKey: 'generated-source-clone' }]);
assert.equal(history.undo(), true, 'undo should restore the original generated-only document');
assert.deepEqual(history.current, createEmptySceneDocument());
assert.equal(history.redo(), true, 'redo should restore the generated source clone and replacement override');
assert.deepEqual(history.current, replacementDocument);

const sourceGeometry = new THREE.BufferGeometry();
sourceGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
  10, 1, 5, 12, 1, 5, 10, 3, 5,
  40, 2, 40, 42, 2, 40, 40, 4, 40,
], 3));
sourceGeometry.setAttribute('color', new THREE.Float32BufferAttribute([
  1, 0, 0, 1, 0, 0, 1, 0, 0,
  0, 1, 0, 0, 1, 0, 0, 1, 0,
], 3));
const sourceMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
const sourceMesh = new THREE.Mesh(sourceGeometry, sourceMaterial);
const binding = createFeatureBatchBinding([{ key: 'batch-a', startVertex: 0, vertexCount: 3 }], () => sourceMesh);
const geometryClone = binding.cloneGeometry(THREE, new THREE.Vector3(10, 1, 5));
assert.equal(geometryClone.children.length, 1, 'a generated source clone should include only its registered batch range');
assert.deepEqual([...geometryClone.children[0].geometry.getAttribute('position').array], [0, 0, 0, 2, 0, 0, 0, 2, 0]);
assert.notEqual(geometryClone.children[0].material, sourceMaterial, 'replacement material disposal must not dispose shared city materials');
assert.deepEqual([...geometryClone.children[0].geometry.getAttribute('color').array], [1, 0, 0, 1, 0, 0, 1, 0, 0]);

const runtimeGroup = new THREE.Group();
const registry = createGeneratedRegistry(THREE);
const proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
proxy.position.set(10, 1, 5);
registry.registerEditableObject(proxy, {
  id: generated.id,
  sourceType: 'building',
  assetKey: generated.assetKey,
  label: generated.label,
  transform: generated.transform,
  batchBinding: binding,
  canTransform: true,
});
const authoredRuntime = createAuthoredRuntime({
  THREE,
  project: (latitude, longitude) => new THREE.Vector2(longitude * 1000, latitude * 1000),
  terrainHeightAtWorld: () => 10,
  authoredDetailGroup: runtimeGroup,
  generatedRegistry: registry,
});
const generatedDocument = {
  ...createEmptySceneDocument(),
  objects: [{
    id: replacementId,
    assetKey: 'generated-source-clone',
    label: generated.label,
    visible: true,
    properties: { sourceTargetId: generated.id },
    transform: replacementTransform,
  }],
  overrides: [{ id: generated.id, operation: 'replace', assetKey: 'generated-source-clone' }],
};
authoredRuntime.load(generatedDocument);
applyOverrides(generatedDocument, { registry, authoredRuntime });
const generatedReplacement = authoredRuntime.getObject(replacementId);
assert.ok(generatedReplacement, 'the replacement override should materialize a cloned generated feature');
assert.equal(generatedReplacement.position.x, replacementTransform.longitude * 1000, 'the saved transform should be restored from the authored replacement record');
assert.equal(generatedReplacement.position.y, 10 + replacementTransform.elevation);
assert.equal(generatedReplacement.children[0].geometry.getAttribute('position').count, 3);
assert.equal(proxy.visible, false, 'the source generated feature should be hidden after replacement');

console.log('City editor integration contract passed.');
