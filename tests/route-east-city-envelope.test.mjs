import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {ROUTE_EAST_CITY_APPEARANCES} from '../city-explorer/route-east-city-appearances.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {resolveReviewedBuildingEnvelope} from '../city-explorer/reviewed-building-envelope.js';
import {buildStation2NeighborhoodGableRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';

const data = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(data.elements.filter(row => row.type === 'way').map(row => ['way/' + row.id, row]));
const profiles = addRouteLandmarkAppearances({});
const project = (lat, lon) => new THREE.Vector2((lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), -(lat - 44.3091) * 110540);
// Reconstructed production DTM + Float32 triangulated grid. All three local
// stored v205 cab ground samples matched the reconstruction with zero delta.
const sources = {
  'way/755554019': {wall: 2.6, rise: .10, shape: 'flat', front: [0, 3], ground: [-6.512510622292492, -6.5978185046858915, -6.616135049843675, -6.558847643121222]},
  'way/1015118646': {wall: 5.12056, rise: .55, shape: 'hipped', front: [2, 1], ground: [-6.313303045173114, -6.3417766484733455, -6.351553952529924, -6.807331501503618]},
  'way/1015118648': {wall: 5.6, rise: .90, shape: 'hipped', front: [2, 1], ground: [-6.009675097656764, -6.131111258392184, -6.171876779083168, -6.0504406183541235]},
};
function input(id) {
  const way = ways.get(id);
  return {sourceId: id, profile: profiles[id], tags: way.tags,
    ring: way.geometry.slice(0, -1).map(p => project(p.lat, p.lon)), groundHeights: sources[id].ground.slice(),
    dimensions: mappedBuildingDimensions(way.tags, id), project};
}
function unchanged(result, args) {
  assert.equal(result.applied, false);
  assert.equal(result.dimensions, args.dimensions);
  assert.equal(result.foundationTop, Math.max(...args.groundHeights));
}

test('only three independently matched East City silhouettes opt into the reviewed envelope', () => {
  const selected = Object.keys(ROUTE_EAST_CITY_APPEARANCES).filter(id => profiles[id].reviewedEnvelope);
  assert.deepEqual(selected.sort(), Object.keys(sources).sort());
  for (const [id, expected] of Object.entries(sources)) {
    const args = input(id), snapshot = structuredClone({...args, project: undefined, ring: args.ring.map(p => p.toArray())});
    assert.deepEqual(args.profile.frontLatLon, expected.front.map(index => ways.get(id).geometry[index]));
    const actual = resolveReviewedBuildingEnvelope(args);
    assert.equal(actual.applied, true, `${id}: ${actual.reason}`);
    assert.equal(actual.foundationTop, Math.max(...args.groundHeights), `${id} keeps its source datum`);
    assert.equal(actual.dimensions.height, expected.wall);
    assert.equal(actual.dimensions.roofHeight, expected.rise);
    assert.equal(actual.dimensions.roofShape, expected.shape);
    assert.equal(actual.dimensions.minHeight, args.dimensions.minHeight);
    assert.ok(actual.roofTop < actual.foundationTop + args.dimensions.height + args.dimensions.roofHeight);
    assert.deepEqual({...args, project: undefined, ring: args.ring.map(p => p.toArray())}, snapshot, `${id} source/physics inputs are unchanged`);
    assert.match(ROUTE_EAST_CITY_APPEARANCES[id].estimated, /estimate/i);
  }
  for (const id of ['way/755554027', 'way/1015118634', 'way/1015118657', 'way/1015118660']) {
    assert.equal(profiles[id].reviewedEnvelope, undefined, `${id} stepped/recessed volumes stay outside the uniform envelope correction`);
  }
});

test('Circle K retains its explicit one-storey wall and replaces only its inferred roof', () => {
  const args = input('way/755554019'), actual = resolveReviewedBuildingEnvelope(args);
  assert.equal(args.tags['building:levels'], '1');
  assert.equal(actual.applied, true);
  assert.equal(actual.dimensions.height, args.dimensions.height);
  assert.equal(actual.wallTop, actual.foundationTop + 2.6);
  assert.ok(Math.abs(actual.roofTop - actual.wallTop - .10) < 1e-9);
  for (const reviewedEnvelope of [
    {...args.profile.reviewedEnvelope, wallHeightMetres: 2.5},
    {...args.profile.reviewedEnvelope, wallHeightMetres: 3.0},
    {...args.profile.reviewedEnvelope, datum: 'frontage'},
    {datum: 'frontage'},
  ]) unchanged(resolveReviewedBuildingEnvelope({...args, profile: {...args.profile, reviewedEnvelope}}), args);
  for (const [tag, value] of [['height', '2.6'], ['roof:height', '.1'], ['roof:shape', 'flat'], ['building:roof:shape', 'flat'], ['roof:levels', '0'], ['min_height', '0'], ['building:min_level', '0']]) {
    unchanged(resolveReviewedBuildingEnvelope({...args, tags: {...args.tags, [tag]: value}}), args);
  }
  const updatedTags = {...args.tags, 'building:levels': '2'};
  const updatedSource = {...args, tags: updatedTags, dimensions: mappedBuildingDimensions(updatedTags, args.sourceId)};
  unchanged(resolveReviewedBuildingEnvelope(updatedSource), updatedSource);
});

test('both Cricket roofs have shallow longitudinal hips without a brick gable or expanded footprint', () => {
  for (const id of ['way/1015118646', 'way/1015118648']) {
    const args = input(id), resolved = resolveReviewedBuildingEnvelope(args);
    assert.equal(resolved.applied, true);
    const result = buildStation2NeighborhoodGableRoof({ring: args.ring, boundaryRings: [args.ring],
      wallTop: resolved.wallTop, roofTop: resolved.roofTop, roofShape: resolved.dimensions.roofShape,
      triangles: THREE.ShapeUtils.triangulateShape(args.ring, []).map(face => face.map(index => args.ring[index]))});
    assert.equal(result.valid, true, result.reason);
    // Source quadrilaterals are slightly skewed rather than perfect rectangles.
    // The clipped hip may close sub-centimetre boundary slivers, never a gable.
    const closureHeights = result.gableTriangles.filter((_, i) => i % 3 === 1);
    assert.ok(closureHeights.every(y => y <= resolved.wallTop + .01), `${id} has no raised brick gable`);
    assert.ok(result.roofTriangles.every(Number.isFinite));
    const points = Array.from({length: result.roofTriangles.length / 3}, (_, i) => ({x: result.roofTriangles[i * 3], y: result.roofTriangles[i * 3 + 1], z: result.roofTriangles[i * 3 + 2]}));
    let roofArea = 0;
    for (let i = 0; i < points.length; i += 3) {
      const [a, b, c] = points.slice(i, i + 3);
      roofArea += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    }
    assert.ok(Math.abs(roofArea - Math.abs(THREE.ShapeUtils.area(args.ring))) < 1e-5, `${id} roof covers exactly the source footprint`);
    assert.ok(points.every(p => p.y >= resolved.wallTop - 1e-6 && p.y <= resolved.roofTop + 1e-6));
    const ridge = points.filter(p => Math.abs(p.y - resolved.roofTop) < 1e-6);
    let longestRidge = 0;
    for (const a of ridge) for (const b of ridge) longestRidge = Math.max(longestRidge, Math.hypot(a.x - b.x, a.z - b.z));
    assert.ok(longestRidge > 4, `${id} uses an elongated hip ridge, not the four-corner pyramid fallback`);
  }
});
