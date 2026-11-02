import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromiseCache } from '../city-explorer/asset-request-cache.js';

test('preload and runtime share one in-flight and completed asset request', async () => {
  const cache = createPromiseCache();
  let requests = 0;
  const load = () => { requests += 1; return Promise.resolve(new ArrayBuffer(4)); };
  const warmed = cache('station-1', load);
  const runtime = cache('station-1', load);
  assert.equal(warmed, runtime);
  assert.equal((await runtime).byteLength, 4);
  assert.equal(cache('station-1', load), warmed);
  assert.equal(requests, 1);
});

test('a failed warm request is evicted so runtime gets one natural retry', async () => {
  const cache = createPromiseCache();
  let requests = 0;
  const load = () => { requests += 1; return requests === 1 ? Promise.reject(new Error('temporary 503')) : Promise.resolve('recovered'); };
  const warmed = cache('pumper', load);
  await assert.rejects(warmed, /temporary 503/);
  assert.equal(await cache('pumper', load), 'recovered');
  assert.equal(requests, 2);
});
