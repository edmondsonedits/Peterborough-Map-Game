import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionSaver } from '../city-explorer/editor/version-saver.js';

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

test('remote content changed since editor load causes conflict without publication', async () => {
  const f = fixture({ publishedDocument: { ...scene, updatedAt: '2026-09-25T13:00:00.000Z' } });
  assert.equal((await f.saver.save(scene)).state, 'conflict');
  assert.equal(f.requests.filter(([url]) => url.endsWith('/api/scene/versions')).length, 0);
});

test('a later edit can be published after an earlier successful save', async () => {
  const f = fixture();
  const first = { ...scene, updatedAt: '2026-09-25T13:00:00.000Z' };
  assert.equal((await f.saver.save(first)).state, 'live');
  f.setRemoteDocument(first);
  const later = { ...scene, updatedAt: '2026-09-25T14:00:00.000Z' };
  assert.equal((await f.saver.save(later)).state, 'live');
  assert.equal(f.requests.filter(([url]) => url.endsWith('/api/scene/versions')).length, 2);
});

test('deployment lookup exception keeps a successful commit marked saved', async () => {
  const f = fixture({ throwOnDeployment: true });
  const result = await f.saver.save(scene);
  assert.deepEqual(result, { state: 'saved', commitSha: commit, deploymentStatus: 'unavailable' });
  assert.deepEqual(f.events.at(-1), ['state', { name: 'saved', commitSha: commit, deploymentStatus: 'unavailable' }]);
  assert.equal(f.events.some(([type]) => type === 'flush'), true);
});
