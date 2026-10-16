import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionSaver } from '../city-explorer/editor/version-saver.js';
import { createDraftStore } from '../city-explorer/editor/draft-store.js';

const scene = { schemaVersion: 1, city: 'peterborough-on', revision: null, updatedAt: '2026-09-25T12:00:00.000Z', objects: [], overrides: [] };
const sha = 'a'.repeat(40);
const commit = 'b'.repeat(40);

function response(status, value) { return { ok: status >= 200 && status < 300, status, json: async () => value }; }
function fixture({ authenticated = true, statusStatus = 200, postStatus = 201, deployment = ['deploying', 'live'], draftStatus = 'saved', publishedDocument = scene, throwOnDeployment = false } = {}) {
  const events = [];
  const requests = [];
  let remoteDocument = publishedDocument;
  let deploymentIndex = 0;
  const draftStore = {
    saveDraft(document, options) { events.push(['draft', document, options]); return { status: 'scheduled' }; },
    flush() { events.push(['flush']); return { status: draftStatus }; },
    setBaseDocument(document, options) { events.push(['rebase', document, options]); return { status: 'saved' }; },
  };
  const fetchImpl = async (url, options) => {
    requests.push([url, options]);
    if (url.endsWith('/auth/status')) return response(statusStatus, authenticated ? { authenticated: true, csrfToken: 'csrf', baseRevision: sha, publishedDocument: remoteDocument } : { authenticated: false });
    if (url.endsWith('/api/scene/versions')) return response(postStatus, postStatus === 201 ? { commitSha: commit } : { error: postStatus === 409 ? 'stale_revision' : 'failure' });
    if (url.endsWith(`/api/scene/versions/${commit}/status`)) {
      if (throwOnDeployment) throw new Error('Deployment lookup unavailable');
      return response(200, { state: deployment[Math.min(deploymentIndex++, deployment.length - 1)] });
    }
    throw new Error(`unexpected ${url}`);
  };
  const saver = createVersionSaver({ serviceUrl: 'https://publisher.example', publishedDocument: scene, draftStore, fetchImpl, onState: (state) => events.push(['state', state]), wait: async () => {}, maxPolls: 2 });
  return { saver, events, requests, setRemoteDocument(value) { remoteDocument = value; } };
}

test('draft is flushed before network publication and live state is shown', async () => {
  const f = fixture();
  const result = await f.saver.save(scene);
  assert.equal(result.state, 'live');
  assert.equal(f.events[0][0], 'draft');
  assert.equal(f.events[1][0], 'flush');
  assert.equal(f.events.findIndex(([type, state]) => type === 'state' && state.name === 'saved') > 1, true);
  assert.equal(f.requests[0][1].credentials, 'include');
  assert.equal(f.requests[1][1].headers['x-csrf-token'], 'csrf');
  assert.deepEqual(JSON.parse(f.requests[1][1].body), { baseRevision: sha, document: scene });
});

test('conflict, expired auth, failed publish and pending deployment retain local draft', async () => {
  for (const [options, expected] of [
    [{ postStatus: 409 }, 'conflict'],
    [{ authenticated: false }, 'auth-expired'],
    [{ statusStatus: 401 }, 'auth-expired'],
    [{ postStatus: 502 }, 'failed'],
    [{ deployment: ['deploying'] }, 'deploying'],
  ]) {
    const f = fixture(options);
    assert.equal((await f.saver.save(scene)).state, expected);
    assert.equal(f.events.some(([type]) => type === 'flush'), true);
    assert.equal(f.events.some(([type]) => type === 'discard'), false);
  }
});

test('unavailable local storage prevents a network write', async () => {
  const f = fixture({ draftStatus: 'unavailable' });
  assert.equal((await f.saver.save(scene)).state, 'failed');
  assert.equal(f.requests.length, 0);
});

test('unconfigured publisher keeps the local draft and reports no published success', async () => {
  const events = [];
  const requests = [];
  const draftStore = {
    saveDraft(document, options) { events.push(['draft', document, options]); return { status: 'scheduled' }; },
    flush() { events.push(['flush']); return { status: 'saved' }; },
  };
  const saver = createVersionSaver({
    serviceUrl: '',
    publishedDocument: scene,
    draftStore,
    fetchImpl: async (...args) => { requests.push(args); throw new Error('network should not be used'); },
    onState: (value) => events.push(['state', value]),
  });
  const result = await saver.save(scene);
  assert.deepEqual(result, { state: 'failed', reason: 'unconfigured' });
  assert.deepEqual(events.slice(0, 2).map(([type]) => type), ['draft', 'flush']);
  assert.deepEqual(events.at(-1), ['state', { name: 'failed', reason: 'unconfigured' }]);
  assert.equal(requests.length, 0);
});

test('invalid asset keys stay in the local draft but never reach publisher', async () => {
  const f = fixture();
  const invalid = { ...scene, objects: [{ id: '00000000-0000-4000-8000-000000000001', assetKey: 'unknown', transform: { longitude: -78.3, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } }] };
  const result = await f.saver.save(invalid);
  assert.deepEqual(result, { state: 'failed', reason: 'invalid-document' });
  assert.equal(f.events.some(([kind]) => kind === 'flush'), true);
  assert.equal(f.requests.length, 0);
});

test('remote content changed since editor load causes conflict without publication', async () => {
  const f = fixture({ publishedDocument: { ...scene, updatedAt: '2026-09-25T13:00:00.000Z' } });
  assert.equal((await f.saver.save(scene)).state, 'conflict');
  assert.equal(f.requests.filter(([url]) => url.endsWith('/api/scene/versions')).length, 0);
});

test('a later edit can be published after an earlier successful save', async () => {
  const f = fixture();
  const first = { ...scene, updatedAt: '2026-09-25T13:00:00.000Z' };
  assert.equal((await f.saver.save(first)).state, 'live');
  assert.deepEqual(f.events.find(([type]) => type === 'draft')[2].baseDocument, scene, 'local draft records the published baseline, not the edited content');
  assert.deepEqual(f.events.find(([type]) => type === 'rebase'), ['rebase', first, { rebaseDraft: true }]);
  f.setRemoteDocument(first);
  const later = { ...scene, updatedAt: '2026-09-25T14:00:00.000Z' };
  assert.equal((await f.saver.save(later)).state, 'live');
  assert.equal(f.requests.filter(([url]) => url.endsWith('/api/scene/versions')).length, 2);
  assert.deepEqual(f.events.filter(([type]) => type === 'draft').at(-1)[2].baseDocument, first);
});

test('deployment lookup exception keeps a successful commit marked saved', async () => {
  const f = fixture({ throwOnDeployment: true });
  const result = await f.saver.save(scene);
  assert.deepEqual(result, { state: 'saved', commitSha: commit, deploymentStatus: 'unavailable' });
  assert.deepEqual(f.events.at(-1), ['state', { name: 'saved', commitSha: commit, deploymentStatus: 'unavailable' }]);
  assert.equal(f.events.some(([type]) => type === 'flush'), true);
});

test('successful publication rebases real recovery storage without overwriting edits made during the request', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const draftStore = createDraftStore({ storage, baseDocument: scene });
  const published = { ...scene, updatedAt: '2026-10-15T12:00:00Z' };
  const newer = { ...scene, updatedAt: '2026-10-15T12:01:00Z' };
  let completePost, signalPost;
  const postStarted = new Promise(resolve => { signalPost = resolve; });
  const saver = createVersionSaver({
    serviceUrl: 'https://publisher.example', publishedDocument: scene, draftStore, maxPolls: 1,
    fetchImpl: async url => {
      if (url.endsWith('/auth/status')) return response(200, { authenticated: true, publishedDocument: scene, baseRevision: sha, csrfToken: 'csrf' });
      if (url.endsWith('/api/scene/versions')) return new Promise(resolve => { completePost = () => resolve(response(201, { commitSha: commit })); signalPost(); });
      return response(200, { state: 'live' });
    },
  });
  const saving = saver.save(published);
  await postStarted;
  draftStore.saveDraft(newer);
  completePost();
  assert.equal((await saving).state, 'live');
  const recovered = createDraftStore({ storage, baseDocument: published }).loadDraft();
  assert.equal(recovered.status, 'recovered');
  assert.equal(recovered.document.updatedAt, newer.updatedAt);
  assert.equal(createDraftStore({ storage, baseDocument: scene }).loadDraft().status, 'base-content-mismatch');
});

test('failed recovery persistence after an accepted publish preserves commit success and warns about newer local edits', async () => {
  const values = new Map(), events = [];
  let blocked = false;
  const storage = { getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (blocked) throw new Error('Quota exceeded'); values.set(key, value); }, removeItem: key => values.delete(key) };
  const draftStore = createDraftStore({ storage, baseDocument: scene });
  const published = { ...scene, updatedAt: 'published candidate' }, newer = { ...scene, updatedAt: 'newer local work' };
  const saver = createVersionSaver({
    serviceUrl: 'https://publisher.example', publishedDocument: scene, draftStore, maxPolls: 1,
    onState: state => events.push(state),
    fetchImpl: async url => {
      if (url.endsWith('/auth/status')) return response(200, { authenticated: true, publishedDocument: scene, baseRevision: sha, csrfToken: 'csrf' });
      if (url.endsWith('/api/scene/versions')) {
        draftStore.saveDraft(newer);
        blocked = true;
        return response(201, { commitSha: commit });
      }
      return response(200, { state: 'live' });
    },
  });
  const result = await saver.save(published);
  assert.equal(result.state, 'live');
  assert.equal(result.commitSha, commit);
  assert.equal(result.localDraftRecoveryUnavailable, true);
  assert.equal(events.find(event => event.name === 'saved').localDraftRecoveryUnavailable, true);
  assert.equal(events.at(-1).localDraftRecoveryUnavailable, true);
  assert.equal(draftStore.exportDraft().document.updatedAt, newer.updatedAt);
});
