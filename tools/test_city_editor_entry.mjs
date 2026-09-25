import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeEditorEntry } from '../city-explorer/editor/editor-entry.js';

const privateUrl = 'https://peterborough-3d-map-editor-preview.dans-host.chatgpt.site/city-explorer/?editor=1';
const pagesUrl = 'https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/';

test('public Pages without publisher redirects to private owner editor', async () => {
  let redirect = null;
  const allowed = await authorizeEditorEntry({ pageUrl: pagesUrl, publisherUrl: '', redirect: (url) => { redirect = url; }, fetchImpl: () => { throw new Error('no publisher'); } });
  assert.equal(allowed, false);
  assert.equal(redirect, privateUrl);
});

test('query flag and visible button alone cannot authorize public editor', async () => {
  let redirect = null;
  const allowed = await authorizeEditorEntry({ pageUrl: `${pagesUrl}?editor=1`, publisherUrl: '', redirect: (url) => { redirect = url; } });
  assert.equal(allowed, false);
  assert.equal(redirect, privateUrl);
});

test('exact private host with editor query may enter under hosting access policy', async () => {
  let fetched = false;
  const allowed = await authorizeEditorEntry({ pageUrl: privateUrl, publisherUrl: '', fetchImpl: () => { fetched = true; } });
  assert.equal(allowed, true);
  assert.equal(fetched, false);
  assert.equal(await authorizeEditorEntry({ pageUrl: privateUrl.replace('editor=1', 'editor=0'), publisherUrl: '' }), false);
  assert.equal(await authorizeEditorEntry({ pageUrl: privateUrl.replace('peterborough-3d-map-editor-preview.', 'lookalike-peterborough-3d-map-editor-preview.'), publisherUrl: '' }), false);
});

test('configured publisher requires successful authenticated owner status', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options]); return { ok: true, json: async () => ({ authenticated: true }) }; };
  assert.equal(await authorizeEditorEntry({ pageUrl: pagesUrl, publisherUrl: 'https://publisher.example/', fetchImpl }), true);
  assert.deepEqual(calls, [['https://publisher.example/auth/status', { credentials: 'include' }]]);
  assert.equal(await authorizeEditorEntry({ pageUrl: pagesUrl, publisherUrl: 'https://publisher.example', fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: false }) }) }), false);
  assert.equal(await authorizeEditorEntry({ pageUrl: pagesUrl, publisherUrl: 'https://publisher.example', fetchImpl: async () => ({ ok: false }) }), false);
});

test('missing owner session starts publisher sign-in and never enters editor', async () => {
  let redirect = null;
  const allowed = await authorizeEditorEntry({
    pageUrl: pagesUrl,
    publisherUrl: 'https://publisher.example/',
    fetchImpl: async () => ({ ok: true, json: async () => ({ authenticated: false }) }),
    redirect: (url) => { redirect = url; },
  });
  assert.equal(allowed, false);
  assert.equal(redirect, 'https://publisher.example/auth/github');
});
