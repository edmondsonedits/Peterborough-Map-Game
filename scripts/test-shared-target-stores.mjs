import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function environment() {
  const window = { dispatchEvent() {}, addEventListener() {}, location: { href: 'https://example.test/shared/' } };
  window.window = window;
  const document = { currentScript: { src: 'https://example.test/shared/test.js' }, scripts: [], getElementById: () => null, querySelector: () => null };
  return { window, document, localStorage: storage(), URL, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } }, console };
}

const dataSource = await readFile(resolve(root, 'shared/dispatch-data-1.4.4.js'), 'utf8');
const targetSource = await readFile(resolve(root, 'shared/simulator-targets.js'), 'utf8');
const payload = dataSource.match(/const PAYLOAD = '([^']+)'/)?.[1];
const calls = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));

const dispatchContext = environment();
vm.runInNewContext(targetSource, dispatchContext, { filename: 'simulator-targets.js' });
dispatchContext.window.PTBO_DISPATCH_DATA_READY = Promise.resolve(calls);
vm.runInNewContext(await readFile(resolve(root, 'shared/dispatch-locations.js'), 'utf8'), dispatchContext, { filename: 'dispatch-locations.js' });
const normalizedCalls = await dispatchContext.window.PTBO_DISPATCH_STORE.ready();
assert.equal(normalizedCalls.length, calls.length);
assert.ok(normalizedCalls.every(call => Number.isFinite(call.geoTarget.lat) && Number.isFinite(call.simulatorTarget.lat) && call.simulatorTarget.radius >= 10));
assert.notStrictEqual(normalizedCalls[0].geoTarget, normalizedCalls[0].simulatorTarget);

const stationContext = environment();
vm.runInNewContext(await readFile(resolve(root, 'shared/stations.js'), 'utf8'), stationContext, { filename: 'stations.js' });
assert.equal(stationContext.window.PTBO_STATION_STORE.getAll().length, 3);
stationContext.window.PTBO_STATION_STORE.upsert({ id: 'station-1', number: 1, name: 'Station 1', address: 'Test', lat: 44.3, lng: -78.32 });
assert.equal(stationContext.window.getPtboStation(1).address, 'Test');
console.log(`Verified ${normalizedCalls.length} call target pairs and three editable station spawns.`);
