import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSelectedStationOrFallback } from '../city-explorer/multiplayer/selected-station-startup.mjs';

test('failed road tile update at selected Station 1 or 2 takes the fallback spawn path once', async () => {
  for (const station of [1, 2]) {
    const calls = [];
    const result = await loadSelectedStationOrFallback(
      async () => { throw new Error(`Station ${station} roads are not ready`); },
      () => calls.push('ready'),
      error => calls.push(`fallback:${error.message}`),
    );
    assert.equal(result, false);
    assert.deepEqual(calls, [`fallback:Station ${station} roads are not ready`]);
  }
});

test('a resolved but unavailable model also takes fallback, while a ready model does not', async () => {
  const calls = [];
  assert.equal(await loadSelectedStationOrFallback(async () => false, () => calls.push('ready'), error => calls.push(error)), false);
  assert.deepEqual(calls, [null]);
  calls.length = 0;
  assert.equal(await loadSelectedStationOrFallback(async () => true, () => calls.push('ready'), () => calls.push('fallback')), true);
  assert.deepEqual(calls, ['ready']);
});
