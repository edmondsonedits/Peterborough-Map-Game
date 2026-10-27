import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createGeneratedRegistry } from '../city-explorer/editor/generated-registry.js';
import { applyOverrides } from '../city-explorer/editor/override-runtime.js';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';
import { createCommandHistory } from '../city-explorer/editor/command-history.js';
import { createDraftStore } from '../city-explorer/editor/draft-store.js';
import { hideStationOneReplacementRecords } from '../city-explorer/station-one-core.mjs';

const editorPath = path.resolve('city-explorer/editor/city-editor.js');
const editorSource = await readFile(editorPath, 'utf8');
const transformSource = (await readFile('city-explorer/vendor/three-r180/examples/jsm/controls/TransformControls.js', 'utf8'))
  .replace("from 'three'", `from ${JSON.stringify(pathToFileURL(path.resolve('city-explorer/vendor/three-r180/build/three.module.min.js')).href)}`);
const transformUrl = `data:text/javascript;base64,${Buffer.from(transformSource).toString('base64')}`;
const resolved = editorSource.replace(/from '([^']+)'/g, (_, specifier) => {
  const url = specifier === 'three/addons/controls/TransformControls.js'
    ? transformUrl : new URL(specifier, pathToFileURL(editorPath)).href;
  return `from ${JSON.stringify(url)}`;
});
const { createCityEditor } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);

async function restoreFixture({ ready }) {
  const originalGlobals = { document: globalThis.document, location: globalThis.location, addEventListener: globalThis.addEventListener, removeEventListener: globalThis.removeEventListener };
  const restoreButton = { listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener() {}, click() { this.listeners.get('click')?.({}); } };
  const status = { querySelector(selector) { return selector.includes('data-editor-restore') ? restoreButton : null; } };
  const document = {
    querySelector: () => null,
    documentElement: { classList: { add() {}, remove() {}, toggle() {} } },
  };
  globalThis.document = document;
  globalThis.location = { href: 'https://peterborough-3d-map-editor-preview.dans-host.chatgpt.site/city-explorer/?editor=1' };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};

  try {
    const registry = createGeneratedRegistry(THREE);
    const ids = [];
    for (const [sourceId, label] of [['way/1009651229', 'Station 1 facade'], ['city-building/6/3300', 'Station 1 tower'], ['way/1009651228', 'Neighbor']]) {
      const id = registry.registerEditableObject(new THREE.Group(), { sourceType: 'building', sourceId, label, canTransform: false });
      ids.push(id);
    }
    const initial = {
      ...createEmptySceneDocument(),
      overrides: ids.slice(0, 2).map(id => ({ id, operation: 'hide' })),
    };
    const apply = documentValue => applyOverrides(documentValue, { registry, authoredRuntime: { load() {} }, THREE });
    apply(initial);
    const history = createCommandHistory({ initialDocument: initial, onChange: apply });
    const sourceApp = await readFile('city-explorer/app.js', 'utf8');
    assert.match(sourceApp, /onGeneratedRestore:\s*\(\)\s*=>\s*hideSelectedStationReplacement\(\)/, 'app reconnects editor restore to selected-station suppression');
    let restoreCallbackCount = 0;
    const editor = createCityEditor({
      THREE,
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
      canvas: { style: {}, ownerDocument: document, getRootNode: () => document, addEventListener() {}, removeEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
      authoredRuntime: { load() {}, getObject: () => null },
      generatedRegistry: registry,
      documentHistory: history,
      draftStore: createDraftStore({ storage: null, baseDocument: initial }),
      raycaster: new THREE.Raycaster(),
      elements: { status },
      onGeneratedRestore() {
        restoreCallbackCount += 1;
        if (ready) hideStationOneReplacementRecords(registry.records.values(), id => registry.hide(id));
      },
    });
    editor.initialize();
    assert.equal(editor.selectById(ids[0]), true);
    restoreButton.click();
    editor.dispose();
    return { registry, ids, history, restoreCallbackCount };
  } finally {
    globalThis.document = originalGlobals.document;
    globalThis.location = originalGlobals.location;
    globalThis.addEventListener = originalGlobals.addEventListener;
    globalThis.removeEventListener = originalGlobals.removeEventListener;
  }
}

test('direct editor restore re-hides exact Station 1 sources after the GLB is ready', async () => {
  const { registry, ids, history, restoreCallbackCount } = await restoreFixture({ ready: true });
  assert.equal(restoreCallbackCount, 1);
  assert.equal(history.current.overrides.some(item => item.id === ids[0]), false, 'restore removes the selected authored hide override');
  assert.equal(registry.records.get(ids[0]).object.visible, false, 'restored facade stays suppressed by the loaded replacement');
  assert.equal(registry.records.get(ids[1]).object.visible, false, 'tower stays suppressed by the loaded replacement');
  assert.equal(registry.records.get(ids[2]).object.visible, true, 'nearby building remains visible');
});

test('direct editor restore follows normal registry behavior before the Station 1 GLB is ready', async () => {
  const { registry, ids, restoreCallbackCount } = await restoreFixture({ ready: false });
  assert.equal(restoreCallbackCount, 1);
  assert.equal(registry.records.get(ids[0]).object.visible, true, 'without a loaded model, restoring the source shows it normally');
  assert.equal(registry.records.get(ids[1]).object.visible, false, 'an unrelated explicit tower hide remains in effect');
  assert.equal(registry.records.get(ids[2]).object.visible, true, 'neighbor visibility is preserved');
});
