import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../../city-explorer/data/peterborough-official-buildings.geojson', import.meta.url);
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(collection.type, 'FeatureCollection');
assert.ok(collection.features.length > 4000, 'genuine municipal building gaps must be packaged');
assert.ok(collection.features.length < 10000, 'OSM-overlapping footprints must be removed during the asset build');
assert.ok(collection.metadata?.source_feature_count > 37000, 'the complete municipal source count must remain auditable');

let coordinateCount = 0;
let invalidCoordinates = 0;
let active = 0;
for (const feature of collection.features) {
  assert.equal(feature?.properties?.ptbo_layer, 'official_buildings');
  assert.equal(feature?.properties?.ptbo_gap_fill, true);
  const visit = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number') {
      coordinateCount += 1;
      if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) invalidCoordinates += 1;
      return;
    }
    value.forEach(visit);
  };
  visit(feature?.geometry?.coordinates);
  if (!/removed|inactive|closed|abandoned/i.test(String(feature?.properties?.STATUS || ''))) active += 1;
}

assert.equal(invalidCoordinates, 0);
assert.ok(active > 4000);
assert.ok(coordinateCount < 100000, 'building gap-fill must remain browser-safe');

console.log(JSON.stringify({
  status: 'pass',
  features: collection.features.length,
  municipalSourceFeatures: collection.metadata.source_feature_count,
  active,
  coordinateCount,
  invalidCoordinates,
}, null, 2));
