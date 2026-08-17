import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const survey = JSON.parse(await readFile(new URL('../city-explorer/data/survey/station-one-survey.geojson', import.meta.url), 'utf8'));
const roads = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-road-surfaces.geojson', import.meta.url), 'utf8'));

const feature = (id) => survey.features.find((entry) => entry.id === id);
const building = feature('station1-building-footprint');
const apparatus = feature('station1-apparatus-facade');
const entry = feature('station1-entry-facade');
const office = feature('station1-office-facade');
const planting = feature('station1-front-planting-bed');
assert.ok(building && apparatus && entry && office && planting, 'Station 1 must include its surveyed footprint, facade lines, and planting bed');

const metres = ([lon, lat], referenceLat = 44.301) => [
  lon * 111320 * Math.cos(referenceLat * Math.PI / 180),
  lat * 111132,
];

function pointSegmentDistance(point, start, end) {
  const [px, py] = metres(point);
  const [ax, ay] = metres(start);
  const [bx, by] = metres(end);
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function distanceToRing(point, ring) {
  let closest = Infinity;
  for (let index = 1; index < ring.length; index += 1) closest = Math.min(closest, pointSegmentDistance(point, ring[index - 1], ring[index]));
  return closest;
}

const buildingRing = building.geometry.coordinates[0];
for (const facade of [apparatus, entry, office]) {
  facade.geometry.coordinates.forEach((point) => {
    assert.ok(distanceToRing(point, buildingRing) < 0.08, `${facade.id} must be attached to the authoritative footprint`);
  });
}

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}

const activeRoadPolygons = roads.features.filter((entry) => entry.properties?.ptbo_layer === 'road_surfaces' && entry.geometry?.type === 'Polygon');
for (const point of planting.geometry.coordinates[0]) {
  const conflicts = activeRoadPolygons.filter((road) => road.geometry.coordinates.some((ring) => pointInRing(point, ring)));
  assert.equal(conflicts.length, 0, `Station 1 planting bed must not overlap a driveable road (${conflicts.map((entry) => entry.id).join(', ')})`);
}

const apparatusLength = Math.hypot(
  ...metres([
    apparatus.geometry.coordinates[1][0] - apparatus.geometry.coordinates[0][0],
    apparatus.geometry.coordinates[1][1] - apparatus.geometry.coordinates[0][1],
  ]),
);
assert.ok(apparatusLength > 23 && apparatusLength < 25.5, `Station 1 apparatus facade should be footprint-sized, received ${apparatusLength.toFixed(2)} m`);

console.log(JSON.stringify({
  status: 'pass',
  apparatusFacadeMetres: Number(apparatusLength.toFixed(2)),
  plantingRoadConflicts: 0,
  footprintAttachmentToleranceMetres: 0.08,
}));
