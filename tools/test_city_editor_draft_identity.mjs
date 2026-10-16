import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';
import { createDraftStore } from '../city-explorer/editor/draft-store.js';

const key = 'ptbo-city-editor-draft-v1';
const object = (label = 'Published tree') => ({
  id: '00000000-0000-4000-8000-000000000001', assetKey: 'tree.oak', label,
  properties: { a: 1, b: 2 },
  transform: { longitude: -78.32, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
});
const base = () => ({ ...createEmptySceneDocument(), objects: [object()] });
function storageFixture() {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
function save(store, document) {
  assert.equal(store.saveDraft(document).status, 'scheduled');
  assert.equal(store.flush().status, 'saved');
}

test('null revision drafts match unchanged published content and reject changed published objects', () => {
  const storage = storageFixture(), published = base(), draft = { ...published, objects: [object('My local edit')] };
  const store = createDraftStore({ storage, baseDocument: published });
  save(store, draft);
  assert.equal(createDraftStore({ storage, baseDocument: base() }).loadDraft().status, 'recovered');
  const changed = { ...published, objects: [object('New published tree')] };
  const recovered = createDraftStore({ storage, baseDocument: changed }).loadDraft();
  assert.equal(recovered.status, 'base-content-mismatch');
  assert.equal(recovered.document.objects[0].label, 'My local edit');
  assert.equal(store.exportDraft().status, 'exported');
});

test('published override changes are detected even when revisions and authored objects match', () => {
  const storage = storageFixture(), published = base();
  const store = createDraftStore({ storage, baseDocument: published });
  save(store, { ...published, updatedAt: 'local-edit' });
  const changed = { ...published, overrides: [{ id: object().id, operation: 'hide' }] };
  assert.equal(store.loadDraft({ baseDocument: changed }).status, 'base-content-mismatch');
});

test('canonical content identity ignores property key order and normalized defaults', () => {
  const storage = storageFixture(), published = base();
  const store = createDraftStore({ storage, baseDocument: published });
  save(store, { ...published, objects: [object('Draft tree')] });
  const equivalent = base();
  equivalent.objects[0].properties = { b: 2, a: 1 };
  equivalent.objects[0].visible = true;
  assert.equal(store.loadDraft({ baseDocument: equivalent }).status, 'recovered');
});

test('a bound null published revision is retained even if an imported draft has a different revision', () => {
  const storage = storageFixture(), store = createDraftStore({ storage, baseDocument: base() });
  save(store, { ...base(), revision: 12 });
  assert.equal(store.loadDraft().status, 'recovered');
  assert.equal(JSON.parse(store.exportDraft().data).baseRevision, null);
});

test('legacy null-revision envelopes remain recoverable and exportable with an unverified-base warning', () => {
  const storage = storageFixture();
  storage.setItem(key, JSON.stringify({ formatVersion: 1, baseRevision: null, timestamp: '2026-10-15', document: base() }));
  const store = createDraftStore({ storage, baseDocument: { ...base(), objects: [object('Changed publication')] } });
  const loaded = store.loadDraft();
  assert.equal(loaded.status, 'base-content-unverified');
  assert.equal(loaded.document.objects[0].label, 'Published tree');
  assert.equal(store.exportDraft().status, 'exported');
  assert.equal(store.discardDraft().status, 'discarded');
  assert.equal(store.loadDraft().status, 'missing');
});

test('invalid content identity is quarantined without losing the original stored bytes', () => {
  const storage = storageFixture();
  const raw = JSON.stringify({ formatVersion: 1, baseRevision: null, baseIdentity: 'broken content identity', timestamp: '2026-10-15', document: base() });
  storage.setItem(key, raw);
  const loaded = createDraftStore({ storage, baseDocument: base() }).loadDraft();
  assert.equal(loaded.status, 'corrupt');
  assert.ok([...storage.values.entries()].some(([k, value]) => k.startsWith(`${key}:corrupt:`) && value === raw));
});

test('rebasing after a successful save preserves newer pending local edits and updates future autosaves', () => {
  const storage = storageFixture(), store = createDraftStore({ storage, baseDocument: base() });
  const published = { ...base(), objects: [object('Just published')] };
  save(store, published);
  const newer = { ...base(), objects: [object('Newer local work')] };
  store.saveDraft(newer);
  assert.equal(store.setBaseDocument(published, { rebaseDraft: true }).status, 'saved');
  const reloaded = createDraftStore({ storage, baseDocument: published }).loadDraft();
  assert.equal(reloaded.status, 'recovered');
  assert.equal(reloaded.document.objects[0].label, 'Newer local work');
  assert.equal(createDraftStore({ storage, baseDocument: base() }).loadDraft().status, 'base-content-mismatch');
  save(store, { ...newer, updatedAt: 'another edit' });
  assert.equal(createDraftStore({ storage, baseDocument: published }).loadDraft().status, 'recovered');
});
