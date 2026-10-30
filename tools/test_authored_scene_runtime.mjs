import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeUrl = pathToFileURL(path.resolve(here, '../city-explorer/authored-scene-runtime.js')).href;
const runtime = await import(runtimeUrl);
const fixturePath = path.resolve(here, '../city-explorer/data/authored/peterborough-details.handoff.json');
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));

assert.equal(runtime.validateAuthoredSceneHandoff(fixture).valid, true, 'reviewed handoff should validate');
const bootstrapSource = await fs.readFile(path.resolve(here, '../city-explorer/authored-scene-bootstrap.js'), 'utf8');
const readinessGate = bootstrapSource.match(/function authoredSceneStartupReady\(\{ gameplayReady, bridgeReady \}\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(readinessGate, 'bootstrap exposes a concrete startup readiness predicate');
const canStartAuthoredScene = runInNewContext(`(${readinessGate})`);
assert.equal(canStartAuthoredScene({ gameplayReady: true, bridgeReady: true }), true,
  'authored details may start once gameplay and their world bridge are ready, even before actor appearance assets');
assert.equal(canStartAuthoredScene({ gameplayReady: true, bridgeReady: false }), false,
  'authored details must wait for the simulator world bridge');
assert.equal(canStartAuthoredScene({ gameplayReady: false, bridgeReady: true }), false,
  'authored details must wait for gameplay readiness');
assert.match(bootstrapSource, /authoredSceneStartupReady\(\{ gameplayReady: root\.dataset\.gameplayReady === 'true', bridgeReady \}\)/,
  'the bootstrap must gate on gameplay and authored-world bridge readiness');
assert.match(bootstrapSource, /__PTBO_AUTHORED_SCENE__\?\.status\?\.\(\)\.bridgeReady === true/,
  'bridge readiness must come from the active authored runtime API');
assert.doesNotMatch(bootstrapSource, /dataset\.(?:firefighterAsset|pumperAsset)/,
  'optional authored details must not wait on asynchronous actor appearance assets');

const duplicate = structuredClone(fixture);
duplicate.sourceScene.objects.push(structuredClone(duplicate.sourceScene.objects[0]));
assert.match(runtime.validateAuthoredSceneHandoff(duplicate).errors.join(' '), /duplicate id/i);

const unknown = structuredClone(fixture);
unknown.sourceScene.objects[0].assetId = 'not-approved-or-known';
assert.match(runtime.validateAuthoredSceneHandoff(unknown).errors.join(' '), /unknown asset/i);

const invalidScale = structuredClone(fixture);
invalidScale.sourceScene.objects[0].scale.x = 0;
assert.match(runtime.validateAuthoredSceneHandoff(invalidScale).errors.join(' '), /greater than zero/i);

const outside = structuredClone(fixture);
outside.sourceScene.objects[0].position.lat = 50;
assert.match(runtime.validateAuthoredSceneHandoff(outside).errors.join(' '), /outside Peterborough bounds/i);

const wrongFormat = structuredClone(fixture);
wrongFormat.formatVersion = 99;
assert.match(runtime.validateAuthoredSceneHandoff(wrongFormat).errors.join(' '), /formatVersion/i);

const descriptors = runtime.prepareAuthoredRuntimeDescriptors(fixture, {
  project: (lat, lon) => ({ x: lon * 10, y: lat * -10 }),
  terrainHeightAtWorld: () => 12.5,
});
assert.equal(descriptors.length, 1);
assert.equal(descriptors[0].position.y, 12.55);
assert.equal(descriptors[0].assetId, 'generic-prop-marker');

await assert.rejects(
  () => runtime.fetchAuthoredSceneHandoff(async () => ({ ok: false, status: 404 })),
  /returned 404/i,
);
await assert.rejects(
  () => runtime.fetchAuthoredSceneHandoff(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad json'); } })),
  /not valid JSON/i,
);

console.log('Authored scene runtime validation tests passed.');


const browserQaPath = path.resolve(here, './check-authored-scene.cjs');
const browserQaSource = await fs.readFile(browserQaPath, 'utf8');
assert.equal((browserQaSource.match(/browser\.newPage\(/g) || []).length, 2, 'browser QA should use only disabled + enabled simulator startups');
assert.match(browserQaSource, /for \(const mode of \['missing', 'corrupt', 'invalid'\]\)/);
assert.match(browserQaSource, /await validPage\.unroute\(handoffRoute\)/);
assert.match(browserQaSource, /routeEvidence\.hits !== 1 \|\| reloadResult\?\.status !== 'failed' \|\| failed\.status !== 'failed'/,
  'each fail-open fixture must report the intercepted response, reload status, and page status');
assert.match(browserQaSource, /did not recover after fail-open checks/);
