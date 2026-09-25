import assert from 'node:assert/strict';
import { createEmptySceneDocument } from '../city-explorer/editor/scene-document.js';
import { createCommandHistory } from '../city-explorer/editor/command-history.js';
import { createDraftStore } from '../city-explorer/editor/draft-store.js';

const documentAt = (revision) => ({ ...createEmptySceneDocument(), revision });
const empty = documentAt(1);
const one = { ...empty, updatedAt: 'one' };
const two = { ...empty, updatedAt: 'two' };

{
  const history = createCommandHistory({ initialDocument: empty });
  history.execute('first', one);
  history.execute('second', two);
  for (let i = 0; i < 99; i += 1) history.execute(`edit ${i}`, { ...two, updatedAt: `edit ${i}` });
  assert.equal(history.canUndo, true);
  for (let i = 0; i < 100; i += 1) assert.equal(history.undo(), true);
  assert.equal(history.canUndo, false);
  assert.equal(history.current.updatedAt, 'one');
  assert.equal(history.undo(), false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo(), true);
  assert.equal(history.current.updatedAt, 'two');
}

{
  const history = createCommandHistory({ initialDocument: empty });
  history.execute('first', one);
  history.undo();
  history.execute('replacement', two);
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(), false);
  assert.equal(history.current.updatedAt, 'two');
}

{
  let changes = 0;
  const history = createCommandHistory({ initialDocument: empty, onChange: () => { changes += 1; } });
  const equivalent = { ...empty };
  delete equivalent.updatedAt;
  assert.equal(history.execute('same normalized document', equivalent), false);
  assert.equal(history.canUndo, false);
  assert.equal(changes, 0);
  const input = { ...one };
  history.execute('edit', input);
  input.updatedAt = 'mutated by caller';
  assert.equal(history.current.updatedAt, 'one');
  const exposed = history.current;
  exposed.updatedAt = 'mutated by consumer';
  assert.equal(history.current.updatedAt, 'one');
  assert.equal(changes, 1);
}

{
  const id = '00000000-0000-4000-8000-000000000001';
  const baseObject = {
    id,
    assetKey: 'tree.oak',
    transform: {
      longitude: -78.32, latitude: 44.30, elevation: 0,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
  const history = createCommandHistory({ initialDocument: empty });
  history.execute('properties', { ...empty, objects: [{ ...baseObject, properties: { first: 1, second: 2 } }] });
  assert.equal(history.execute('same properties, different key order', {
    ...empty,
    objects: [{ ...baseObject, properties: { second: 2, first: 1 } }],
  }), false);
  assert.equal(history.canUndo, true);
}

{
  const memory = new Map([['ptbo-city-editor-draft-v1', '{broken json']]);
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const store = createDraftStore({ storage });
  const result = store.loadDraft({ baseRevision: 1 });
  assert.equal(result.status, 'corrupt');
  assert.equal(result.document, null);
  assert.equal(memory.has('ptbo-city-editor-draft-v1'), false);
  assert.ok([...memory.keys()].some((key) => key.startsWith('ptbo-city-editor-draft-v1:corrupt:')));
}

{
  const memory = new Map();
  const store = createDraftStore({
    storage: {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    },
    debounceMs: 0,
    now: () => '2026-09-25T12:00:00.000Z',
  });
  store.saveDraft(documentAt(2), { baseRevision: 1 });
  const saved = store.flush();
  assert.equal(saved.status, 'saved');
  const loaded = store.loadDraft({ baseRevision: 3 });
  assert.equal(loaded.status, 'base-revision-mismatch');
  assert.equal(loaded.document.revision, 2);
  assert.equal(loaded.error.code, 'BASE_REVISION_MISMATCH');
}

{
  const error = new Error('quota exceeded');
  error.name = 'QuotaExceededError';
  const store = createDraftStore({ storage: { setItem: () => { throw error; }, getItem: () => null, removeItem() {} }, debounceMs: 0 });
  store.saveDraft(one, { baseRevision: 1 });
  const result = store.flush();
  assert.equal(result.status, 'unavailable');
  assert.equal(result.document, null);
  assert.equal(result.error, error);
}

{
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const store = createDraftStore({ storage, debounceMs: 0, now: () => '2026-09-25T12:00:00.000Z' });
  store.saveDraft(one, { baseRevision: 1 });
  store.flush();
  const exported = store.exportDraft();
  assert.equal(exported.status, 'exported');
  assert.equal(exported.document.updatedAt, 'one');
  assert.equal(JSON.parse(exported.data).baseRevision, 1);
  assert.equal(store.discardDraft().status, 'discarded');
  assert.equal(store.loadDraft({ baseRevision: 1 }).status, 'missing');
}

{
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const store = createDraftStore({ storage, debounceMs: 60_000 });
  const saved = store.saveDraft({ ...documentAt(2), updatedAt: 'original' }, { baseRevision: 1 });
  saved.document.updatedAt = 'mutated through save result';
  store.flush();
  assert.equal(JSON.parse(memory.get('ptbo-city-editor-draft-v1')).document.updatedAt, 'original');
}

{
  const memory = new Map();
  const storage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  const store = createDraftStore({ storage, debounceMs: 60_000 });
  store.saveDraft({ ...documentAt(2), updatedAt: 'original' }, { baseRevision: 1 });
  const exported = store.exportDraft();
  exported.document.updatedAt = 'mutated through export result';
  assert.equal(JSON.parse(exported.data).document.updatedAt, 'original');
  store.flush();
  assert.equal(JSON.parse(memory.get('ptbo-city-editor-draft-v1')).document.updatedAt, 'original');
}

console.log('City editor history and recovery draft state passed.');
