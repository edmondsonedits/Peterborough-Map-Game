import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { preserveManifestIdentity } from '../tools/preserve-asset-manifest-identity.mjs';
const original = readFileSync(new URL('../city-explorer/data/manifest.json', import.meta.url), 'utf8');
test('completed generation and validation preserve exact manifest bytes for timestamp-only changes', () => {
  const rebuilt = JSON.parse(original);
  rebuilt.generated_at = '2099-01-01T00:00:00+00:00';
  assert.equal(preserveManifestIdentity(original, JSON.stringify(rebuilt)), original);
});
test('real metadata or validation changes keep the new manifest', () => {
  for (const change of [m => m.terrain = { changed: true }, m => m.road_validation = { status: 'changed' }]) {
    const rebuilt = JSON.parse(original); change(rebuilt);
    const text = JSON.stringify(rebuilt);
    assert.equal(preserveManifestIdentity(original, text), text);
  }
});
test('generator intermediate validation schema is restored before identity comparison', () => {
  const rebuilt = JSON.parse(original), finalValidation = rebuilt.road_validation;
  rebuilt.generated_at = '2099-01-01T00:00:00+00:00';
  rebuilt.road_validation = { osm_to_orn: null, orn_to_osm: null };
  const intermediate = JSON.stringify(rebuilt);
  assert.equal(preserveManifestIdentity(original, intermediate), intermediate);
  rebuilt.road_validation = finalValidation;
  assert.equal(preserveManifestIdentity(original, JSON.stringify(rebuilt)), original);
});
test('identity preservation runs after full validation, before road compilation', () => {
  const workflow = readFileSync(new URL('../.github/workflows/build-peterborough-assets.yml', import.meta.url), 'utf8');
  const preserve = workflow.indexOf('node tools/preserve-asset-manifest-identity.mjs');
  assert.ok(preserve > workflow.indexOf('- name: Validate generated JSON and JavaScript'));
  assert.ok(preserve < workflow.indexOf('node tools/build-road-pack.cjs'));
});
