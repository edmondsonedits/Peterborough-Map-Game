import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSplatPlacement,
  CitySplatLayer,
  chooseSplatBudget,
  geographicToCityLocal,
  rankSplatCandidates,
  splatDistanceOpacity,
  validateSplatManifest,
} from '../city-explorer/city-splat-layer.js';

const manifest = JSON.parse(await readFile(new URL('../city-explorer/data/splats/manifest.json', import.meta.url), 'utf8'));
const validation = validateSplatManifest(manifest);
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.equal(manifest.pilots.length, 5);
assert.equal(new Set(manifest.pilots.map((pilot) => pilot.id)).size, 5);
assert.ok(manifest.pilots.every((pilot) => pilot.asset === null));
assert.ok(manifest.pilots.every((pilot) => pilot.licence.status === 'missing'));

const origin = geographicToCityLocal(44.3091, -78.3197);
assert.ok(Math.abs(origin.x) < 1e-9 && Math.abs(origin.z) < 1e-9);
const east = geographicToCityLocal(44.3091, -78.3097);
assert.ok(east.x > 790 && east.x < 810);
const north = geographicToCityLocal(44.3191, -78.3197);
assert.ok(north.z < -1100 && north.z > -1110);

const placement = buildSplatPlacement({
  anchor: { latitude: 44.3091, longitude: -78.3197, elevationMetresCGVD2013: 210, verticalOffset: 1.5 },
  transform: { headingDeg: 90, pitchDeg: 2, rollDeg: -1, scale: 1.02 },
}, (lat, lon) => geographicToCityLocal(lat, lon), () => 8, 200);
assert.equal(placement.position.y, 11.5);
assert.ok(Math.abs(placement.rotation.y + Math.PI / 2) < 1e-9);
assert.equal(placement.scale, 1.02);

assert.equal(splatDistanceOpacity(400, 600, 1000), 1);
assert.equal(splatDistanceOpacity(800, 600, 1000), 0.5);
assert.equal(splatDistanceOpacity(1200, 600, 1000), 0);
assert.equal(chooseSplatBudget({ mobile: true }, manifest), 750000);
assert.equal(chooseSplatBudget({ mediumPower: true }, manifest), 1400000);
assert.equal(chooseSplatBudget({}, manifest), 2200000);

const pilots = manifest.pilots.map((pilot, index) => ({
  ...pilot,
  asset: `pilot-${index}.spz`,
  licence: { status: 'approved' },
  loadingPriority: 100 - index,
}));
const positions = new Map(pilots.map((pilot, index) => [pilot.id, {
  cameraX: 0, cameraZ: 0, anchorX: 300 + index * 80, anchorZ: 0,
}]));
const selected = rankSplatCandidates(pilots, positions, new Set(), 2);
assert.equal(selected.length, 2);
assert.equal(selected[0].pilot.id, pilots[0].id);
// Hysteresis keeps an active capture eligible beyond its activation boundary.
positions.get(pilots[0].id).anchorX = pilots[0].streaming.activationRadius + 50;
assert.ok(rankSplatCandidates([pilots[0]], positions, new Set([pilots[0].id]), 1).length === 1);
assert.ok(rankSplatCandidates([pilots[0]], positions, new Set(), 1).length === 0);
for (const pilot of pilots) {
  const nearMap = new Map([[pilot.id, { cameraX: 0, cameraZ: 0, anchorX: pilot.streaming.activationRadius - 1, anchorZ: 0 }]]);
  const betweenMap = new Map([[pilot.id, { cameraX: 0, cameraZ: 0, anchorX: pilot.streaming.activationRadius + 1, anchorZ: 0 }]]);
  const outsideMap = new Map([[pilot.id, { cameraX: 0, cameraZ: 0, anchorX: pilot.streaming.unloadRadius + 1, anchorZ: 0 }]]);
  assert.equal(rankSplatCandidates([pilot], nearMap, new Set(), 1).length, 1);
  assert.equal(rankSplatCandidates([pilot], betweenMap, new Set(), 1).length, 0);
  assert.equal(rankSplatCandidates([pilot], betweenMap, new Set([pilot.id]), 1).length, 1);
  assert.equal(rankSplatCandidates([pilot], outsideMap, new Set([pilot.id]), 1).length, 0);
}

// A broken capture must transition only that optional record to failed; the
// shared scene, camera and mesh city remain untouched.
const fakeScene = { added: [], removed: [], add(object) { this.added.push(object); }, remove(object) { this.removed.push(object); } };
const failureLayer = new CitySplatLayer({
  THREE: { REVISION: '180' },
  scene: fakeScene,
  renderer: { capabilities: { isWebGL2: true } },
  camera: { position: { x: 0, z: 0 } },
  project: () => ({ x: 0, y: 0 }),
  terrainHeightAtWorld: () => 0,
});
failureLayer.manifest = {
  ...manifest,
  pilots: [{ ...pilots[0], asset: './definitely-missing.spz', licence: { status: 'approved' } }],
};
failureLayer.stats.budget = 1000;
failureLayer.createRecords();
failureLayer.ensureRuntime = async () => ({ SplatMesh: class {}, SparkRenderer: class {} });
failureLayer.ensureSparkRenderer = () => ({});
const originalFetch = globalThis.fetch;
const originalWarn = console.warn;
globalThis.fetch = async () => ({ ok: false, status: 404 });
console.warn = () => {};
const failedRecord = failureLayer.records.values().next().value;
await failureLayer.loadRecord(failedRecord);
globalThis.fetch = originalFetch;
console.warn = originalWarn;
assert.equal(failedRecord.state, 'failed');
assert.equal(failedRecord.mesh, null);
assert.equal(fakeScene.added.length, 0);

const unsupportedLayer = new CitySplatLayer({
  THREE: { REVISION: '179' }, scene: fakeScene, renderer: { capabilities: { isWebGL2: true } },
  camera: { position: { x: 0, z: 0 } }, project: () => ({ x: 0, y: 0 }), terrainHeightAtWorld: () => 0,
});
unsupportedLayer.manifest = manifest;
unsupportedLayer.createRecords();
assert.ok([...unsupportedLayer.records.values()].every((record) => record.state === 'disabled'));

console.log(JSON.stringify({
  status: 'pass',
  pilots: manifest.pilots.length,
  desktopBudget: chooseSplatBudget({}, manifest),
  licensedAssets: manifest.pilots.filter((pilot) => pilot.asset && pilot.licence.status === 'approved').length,
  failureFallback: failedRecord.state,
}));
