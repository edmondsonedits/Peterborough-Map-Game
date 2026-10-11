import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const runtimeUrl = pathToFileURL(path.resolve(here, '../city-explorer/authored-scene-runtime.js')).href;
const runtime = await import(runtimeUrl);
const fixturePath = path.resolve(here, '../city-explorer/data/authored/peterborough-details.handoff.json');
const fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8'));

assert.equal(runtime.validateAuthoredSceneHandoff(fixture).valid, true, 'reviewed handoff should validate');

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
assert.match(browserQaSource, /did not recover after fail-open checks/);

// Query strings are part of ES module identity: the bootstrap must patch the
// same CitySplatLayer constructor that the app actually instantiates.
const appSource = await fs.readFile(path.resolve(here, '../city-explorer/app.js'), 'utf8');
const bootstrapSource = await fs.readFile(path.resolve(here, '../city-explorer/authored-scene-bootstrap.js'), 'utf8');
const citySplatImport = source => source.match(/import\s*\{\s*CitySplatLayer\s*\}\s*from\s*['"]([^'"]+)['"]/)[1];
assert.equal(citySplatImport(bootstrapSource), citySplatImport(appSource),
  'bootstrap and app must share the exact CitySplatLayer module URL, including cache key');
const orientationSource = await fs.readFile(path.resolve(here, '../city-explorer/road-orientation-fix.js'), 'utf8');
const entrySource = await fs.readFile(path.resolve(here, '../city-explorer/index.html'), 'utf8');
assert.match(orientationSource, /authored-scene-bootstrap\.js\?v=1\.6\.101/, 'invalidate the pre-fix bootstrap cache');
assert.match(entrySource, /road-orientation-fix\.js\?v=[^"']*&authoredBridge=1/, 'invalidate the cached loader that imported the broken bootstrap');
