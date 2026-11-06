import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
test('Pages excludes backend and dependencies and regenerates world after normalization', () => {
 const source=read('.github/workflows/deploy-pages.yml');
 for(const entry of ['node_modules/', '.superpowers/', '/city-explorer/multiplayer/server/']) assert.ok(source.includes("--exclude '"+entry+"'"));
 assert.ok(source.indexOf('node tools/export-multiplayer-world.mjs') > source.indexOf('node scripts/normalize-release.cjs'));
 assert.ok(source.includes('node --test tests/multiplayer-*.test.mjs'));
 assert.ok(source.indexOf('git diff --exit-code -- city-explorer/multiplayer/world-data') > source.indexOf('node tools/export-multiplayer-world.mjs'));
 assert.ok(source.indexOf('git diff --exit-code -- city-explorer/multiplayer/world-data') < source.indexOf('name: Stage production Pages artifact'));
});
test('geospatial refresh exports and commits matching multiplayer world', () => {
 const source=read('.github/workflows/build-peterborough-assets.yml');
 assert.ok(source.indexOf('node tools/export-multiplayer-world.mjs') > source.indexOf('node tools/build-road-pack.cjs'));
 assert.ok(source.includes('git add city-explorer/data city-explorer/road-pack-version.js city-explorer/ROAD-VALIDATION.md city-explorer/multiplayer/world-data'));
});
