import assert from 'node:assert/strict';
import fs from 'node:fs';

const file = new URL('../../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url);
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));
assert.equal(collection.type, 'FeatureCollection');
assert.ok(Array.isArray(collection.features) && collection.features.length > 15000);

const counts = {};
const officialStreetNames = new Set();
let coordinateCount = 0;
let invalidCoordinates = 0;
const visitCoordinates = (value) => {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number') {
    coordinateCount += 1;
    if (!Number.isFinite(value[0]) || !Number.isFinite(value[1])) invalidCoordinates += 1;
    return;
  }
  value.forEach(visitCoordinates);
};

for (const feature of collection.features) {
  const layer = String(feature?.properties?.ptbo_layer || '');
  counts[layer] = (counts[layer] || 0) + 1;
  if (layer === 'official_streets' && feature?.properties?.STREET_NAME) {
    officialStreetNames.add(String(feature.properties.STREET_NAME));
  }
  visitCoordinates(feature?.geometry?.coordinates);
}

assert.ok(counts.road_surfaces > 4500, 'surveyed road-surface polygons must be packaged');
assert.ok(counts.curb_edges > 9500, 'surveyed curb and edge lines must be packaged');
assert.ok(counts.parking_surfaces > 1900, 'surveyed parking surfaces must be packaged');
assert.ok(counts.bridges >= 100, 'surveyed bridge footprints must be packaged');
assert.ok(counts.official_streets > 2600, 'official named street references must be packaged');
assert.equal(counts.official_buildings || 0, 0, 'desktop building detail must not bloat the road asset');
for (const streetName of [
  'Lansdowne St E', 'Lansdowne St W', 'George St N', 'George St S',
  'Water St', 'Parkhill Rd E', 'Parkhill Rd W', 'Chemong Rd',
  'The Parkway', 'Ashburnham Dr',
]) {
  assert.ok(officialStreetNames.has(streetName), `${streetName} must remain in the municipal street reference layer`);
}
assert.equal(invalidCoordinates, 0);
assert.ok(coordinateCount < 600000, 'ArcGIS curve densification must remain browser-safe');

const pointInRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    if (((a[1] > y) !== (b[1] > y)) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const pointInPolygon = (point, polygon) => pointInRing(point, polygon[0])
  && !polygon.slice(1).some((hole) => pointInRing(point, hole));
const contains = (feature, point) => {
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') return pointInPolygon(point, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  return false;
};

// King Street's real termination beside Millennium Park is the downtown QA
// location that exposed the former inferred oval/parking-road artefact.
const kingStreetTerminus = [-78.3183, 44.3021];
assert.ok(collection.features.some((feature) => (
  feature.properties?.ptbo_layer === 'road_surfaces' && contains(feature, kingStreetTerminus)
)), 'official pavement must cover the King Street / Millennium Park QA location');

console.log(JSON.stringify({
  status: 'pass',
  features: collection.features.length,
  counts,
  coordinateCount,
  invalidCoordinates,
  officialStreetNames: officialStreetNames.size,
  kingStreetTerminusCovered: true,
}, null, 2));
