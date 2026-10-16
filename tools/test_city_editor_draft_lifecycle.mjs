import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';
import { createDraftStore } from '../city-explorer/editor/draft-store.js';
import { createCommandHistory } from '../city-explorer/editor/command-history.js';

const editorPath = path.resolve('city-explorer/editor/city-editor.js');
const source = await readFile(editorPath, 'utf8');
const transformSource = (await readFile(path.resolve('city-explorer/vendor/three-r180/examples/jsm/controls/TransformControls.js'), 'utf8'))
  .replace("from 'three'", `from ${JSON.stringify(pathToFileURL(path.resolve('city-explorer/vendor/three-r180/build/three.module.min.js')).href)}`);
const transformUrl = `data:text/javascript;base64,${Buffer.from(transformSource).toString('base64')}`;
// Node has no browser import map. Resolve the real editor's imports to its same
// local modules, without replacing its factory or lifecycle implementations.
const resolved = source.replace(/from '([^']+)'/g, (_, specifier) => {
  if (specifier === 'three/addons/controls/TransformControls.js') return `from ${JSON.stringify(transformUrl)}`;
  const resolvedUrl = new URL(specifier, pathToFileURL(editorPath));
  return `from ${JSON.stringify(resolvedUrl.href)}`;
});
const { createCityEditor } = await import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`);
const base = createEmptySceneDocument();
function fixture(storage) {
  const draftStore = createDraftStore({ storage, baseDocument: base });
  const history = createCommandHistory({ initialDocument: base, onChange: document => draftStore.saveDraft(document) });
  const originalDocument = globalThis.document;
  globalThis.document = { querySelector() { return null; } };
  let editor;
  try {
    editor = createCityEditor({
      THREE: {}, scene: {}, authoredRuntime: {}, generatedRegistry: {}, documentHistory: history,
      draftStore, raycaster: {}, camera: {}, canvas: { style: {} },
    });
  } finally {
    globalThis.document = originalDocument;
  }
  return { editor, history, draftStore };
}
function memoryStorage() {
  const values = new Map();
  let writes = 0;
  return { values, get writes() { return writes; }, getItem: key => values.get(key) ?? null,
    setItem(key, value) { writes++; values.set(key, value); }, removeItem: key => values.delete(key) };
}

for (const action of ['dispose', 'exit']) {
  test(`immediate edit then ${action} flushes the pending recovery draft before reload`, () => {
    const storage = memoryStorage(), f = fixture(storage);
    f.history.execute('Immediate edit', { ...base, updatedAt: 'latest committed edit' });
    assert.equal(storage.writes, 0, 'autosave debounce has not fired');
    f.editor[action]();
    const reloaded = createDraftStore({ storage, baseDocument: base }).loadDraft();
    assert.equal(reloaded.status, 'recovered');
    assert.equal(reloaded.document.updatedAt, 'latest committed edit');
    assert.equal(storage.writes, 1);
    f.editor.dispose();
    assert.equal(storage.writes, 1, 'repeated dispose must not save a clean document');
  });
}

test('disposing a clean editor performs no draft storage writes', () => {
  const storage = memoryStorage();
  fixture(storage).editor.dispose();
  assert.equal(storage.writes, 0);
});

test('unavailable storage does not throw or discard the pending export on dispose', () => {
  const f = fixture(null);
  f.history.execute('Immediate edit', { ...base, updatedAt: 'exportable work' });
  assert.doesNotThrow(() => f.editor.dispose());
  const exported = f.draftStore.exportDraft();
  assert.equal(exported.status, 'exported');
  assert.equal(exported.document.updatedAt, 'exportable work');
});

test('quota failure preserves previous storage and pending export, cancelling the debounce timer', async () => {
  const storage = memoryStorage();
  const prior = createDraftStore({ storage, baseDocument: base });
  prior.saveDraft({ ...base, updatedAt: 'older saved work' });
  prior.flush();
  const before = storage.getItem('ptbo-city-editor-draft-v1');
  let attempts = 0;
  const blocked = { ...storage, setItem() { attempts++; throw new Error('Quota exceeded'); } };
  const f = fixture(blocked);
  f.history.execute('Immediate edit', { ...base, updatedAt: 'new unsaved work' });
  assert.doesNotThrow(() => f.editor.dispose());
  assert.equal(attempts, 1, 'dispose attempts a synchronous flush');
  await new Promise(resolve => setTimeout(resolve, 280));
  assert.equal(attempts, 1, 'disposed debounce must not attempt another write');
  assert.equal(storage.getItem('ptbo-city-editor-draft-v1'), before);
  assert.equal(f.draftStore.exportDraft().document.updatedAt, 'new unsaved work');
});

test('application pagehide dispatches through the editor dispose lifecycle', async () => {
  const app = await readFile(path.resolve('city-explorer/app.js'), 'utf8');
  assert.match(app, /addEventListener\('pagehide',[^\n]*cityEditor\?\.dispose\(\)/);
});

test('recovery export downloads pending work without discarding it or closing recovery', () => {
  const storage = memoryStorage(), f = fixture(storage);
  f.history.execute('Immediate edit', { ...base, updatedAt: 'work to export' });
  const originalDocument = globalThis.document;
  let clicked = 0, link;
  globalThis.document = { createElement() { link = { click() { clicked++; } }; return link; } };
  try {
    const exported = f.editor.exportDraft();
    assert.equal(exported.status, 'exported');
    assert.equal(exported.document.updatedAt, 'work to export');
    assert.equal(clicked, 1);
    assert.equal(link.download, 'peterborough-city-editor-draft.json');
    assert.equal(f.draftStore.exportDraft().document.updatedAt, 'work to export');
    assert.equal(storage.writes, 0, 'export does not consume pending work');
  } finally {
    globalThis.document = originalDocument;
    f.editor.dispose();
  }
});

test('the recovery dialog provides its own export button wired to the shared download action', async () => {
  const html = await readFile(path.resolve('city-explorer/index.html'), 'utf8');
  const dialog = html.match(/<dialog id="city-editor-recovery"[\s\S]*?<\/dialog>/)[0];
  assert.match(dialog, /data-recovery-action="export"/);
  assert.match(source, /addListener\(ui\.recovery\?\.querySelector\('\[data-recovery-action="export"\]'\), 'click', exportDraft\)/);
});
