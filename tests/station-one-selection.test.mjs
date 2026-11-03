import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stationOneRequested } from '../city-explorer/station-one-core.mjs';

test('Station 1 selection follows the canonical default station parser', () => {
  for (const search of ['', '?accuracy=district1', '?station=1', '?station=', '?station=invalid']) {
    assert.equal(stationOneRequested(search), true, `${search || '(empty search)'} defaults to Station 1`);
  }
  assert.equal(stationOneRequested('?station=2'), false);
  assert.equal(stationOneRequested('?station=3'), false);
});

test('station runtime requests the current core export even when the prior core URL is cached', async () => {
  const [runtime, build] = await Promise.all([
    readFile(new URL('../city-explorer/station-one-runtime.js', import.meta.url), 'utf8'),
    readFile(new URL('../shared/build-version.js', import.meta.url), 'utf8'),
  ]);
  const version = build.match(/const VERSION = '([^']+)'/)[1];
  assert.ok(runtime.includes(`from './station-one-core.mjs?v=${version}'`));
});

test('cold-start selects Station 1 runtime spawns after constructing its runtime', async () => {
  const source = await readFile(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
  const initStart = source.indexOf('function initializeGameplay()');
  const initEnd = source.indexOf('\nfunction ', initStart + 1);
  const initialize = source.slice(initStart, initEnd);
  assert.ok(initialize.indexOf('ensureStationRuntime(1, true)') >= 0);
  assert.ok(initialize.indexOf('ensureStationRuntime(1, true)') < initialize.indexOf('const spawn = gameplaySpawnPoints()'));

  const spawnStart = source.indexOf('function gameplaySpawnPoints()');
  const spawnEnd = source.indexOf('\nfunction ', spawnStart + 1);
  const spawnPoints = source.slice(spawnStart, spawnEnd);
  assert.match(spawnPoints, /STATION_ONE_SELECTED\s*&&\s*stationOneRuntime/);
  assert.match(spawnPoints, /stationOneRuntime\.playerSpawn/);
  assert.match(spawnPoints, /stationOneRuntime\.spawn/);
});
