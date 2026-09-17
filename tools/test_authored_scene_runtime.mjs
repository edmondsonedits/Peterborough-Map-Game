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
