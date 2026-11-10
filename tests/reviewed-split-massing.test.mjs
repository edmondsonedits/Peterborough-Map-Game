import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {buildReviewedSplitMassing, DRISCOLL_SPLIT_MASSING} from '../city-explorer/reviewed-split-massing.js';

const source = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const way = source.elements.find(value => value.type === 'way' && value.id === 755554027);
const project = (lat, lon) => ({x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540});
const ring = way.geometry.slice(0, -1).map(p => project(p.lat, p.lon));
// Production DTM/Float32-grid reconstruction; the stored v205 low-wing cab
// ground value was independently reproduced with exactly zero difference.
const groundHeights = [-6.266605192476892, -6.397712609495392, -6.38436109231664, -6.219371595932111,
  -6.189311138668956, -6.188738242329796, -6.212840216853217, -6.212246467795829];
function input(overrides = {}) {
  return {sourceId: 'way/755554027', ring: structuredClone(ring), groundHeights: groundHeights.slice(),
    dimensions: mappedBuildingDimensions(way.tags, 'way/755554027'), tags: {...way.tags}, project, ...overrides};
}
function triangles(positions) {
  return Array.from({length: positions.length / 9}, (_, index) => Array.from({length: 3}, (_, j) => {
    const i = index * 9 + j * 3; return {x: positions[i], y: positions[i + 1], z: positions[i + 2]};
  }));
}
const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
const projectedArea = list => list.reduce((sum, [a, b, c]) => sum + Math.abs(cross(a, b, c)) / 2, 0);
const area = polygon => Math.abs(THREE.ShapeUtils.area(polygon.map(p => new THREE.Vector2(p.x, p.z))));
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < 1e-6 && p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7 && p.z >= Math.min(a.z, b.z) - 1e-7 && p.z <= Math.max(a.z, b.z) + 1e-7;
function inside(p, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(p, a, b)) return true;
    if ((a.z > p.z) !== (b.z > p.z) && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) hit = !hit;
  }
  return hit;
}
function unchangedRejected(args) {
  const snapshot = structuredClone({...args, project: undefined});
  const result = buildReviewedSplitMassing(args);
  assert.equal(result.valid, false);
  assert.ok(result.reason);
  assert.deepEqual(result.wallTriangles, []);
  assert.deepEqual(result.roofTriangles, []);
  assert.deepEqual({...args, project: undefined}, snapshot);
}

test('the exact Driscoll source receives two bounded display eaves without changing its base, tags or physics dimensions', () => {
  const args = input(), snapshot = structuredClone({...args, project: undefined}), result = buildReviewedSplitMassing(args);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.sourceId, args.sourceId);
  assert.equal(result.correctionId, DRISCOLL_SPLIT_MASSING.id);
  assert.equal(result.foundationTop, Math.max(...groundHeights));
  assert.equal(result.zones.low.wallHeightMetres, 3.2);
  assert.equal(result.zones.high.wallHeightMetres, args.dimensions.height);
  assert.equal(result.zones.high.wallHeightMetres, 5.16891);
  for (const zone of Object.values(result.zones)) {
    assert.equal(zone.roofCapMetres, .12, 'cap thickness is explicit, never silently added to the eave');
    assert.ok(Math.abs(zone.wallTop - result.foundationTop - zone.wallHeightMetres) < 1e-9);
    assert.ok(Math.abs(zone.roofTop - zone.wallTop - zone.roofCapMetres) < 1e-9);
  }
  assert.ok(result.maxRoofTop < result.foundationTop + args.dimensions.height + args.dimensions.roofHeight);
  assert.deepEqual({...args, project: undefined}, snapshot);
});

test('the two clipped flat roofs exactly partition the source area and stay inside the original footprint', () => {
  const result = buildReviewedSplitMassing(input());
  assert.equal(result.valid, true);
  const roofs = triangles(result.roofTriangles), flat = roofs.filter(t => t.every(p => Math.abs(p.y - t[0].y) < 1e-8));
  assert.equal(flat.length, 6, 'three triangles cover each audited convex pentagon');
  assert.ok(Math.abs(projectedArea(flat) - area(ring)) < 1e-6);
  assert.ok(Math.abs(result.footprintArea - area(ring)) < 1e-6);
  for (const [name, indices] of [['low', [0, 1, 2, 3, 7]], ['high', [3, 4, 5, 6, 7]]]) {
    const polygon = indices.map(i => ring[i]), zoneTriangles = flat.filter(t => Math.abs(t[0].y - result.zones[name].roofTop) < 1e-8);
    assert.ok(Math.abs(projectedArea(zoneTriangles) - area(polygon)) < 1e-6, `${name}: no overlap or missing roof area`);
    for (const [a, b, c] of zoneTriangles) {
      assert.ok(cross(a, b, c) < 0, 'roof triangle normals face upward');
      for (const p of [a, b, c, {x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3},
        {x: (a.x + b.x) / 2, z: (a.z + b.z) / 2}, {x: (b.x + c.x) / 2, z: (b.z + c.z) / 2}, {x: (c.x + a.x) / 2, z: (c.z + a.z) / 2}]) {
        assert.ok(inside(p, polygon) && inside(p, ring), `${name}: emitted triangle stays within exact source area`);
      }
    }
  }
  assert.ok([...result.wallTriangles, ...result.roofTriangles].every(Number.isFinite));
});

test('all eight exterior source edges use their own zone eave and original sampled ground', () => {
  const result = buildReviewedSplitMassing(input()), walls = triangles(result.wallTriangles);
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length, a = ring[i], b = ring[j], name = i >= 3 && i <= 6 ? 'high' : 'low';
    const edgeTriangles = walls.filter(t => t.every(p => onSegment(p, a, b)));
    assert.equal(edgeTriangles.length, 2, `exterior edge ${i}→${j} is emitted once`);
    assert.ok(Math.abs(Math.max(...edgeTriangles.flat().map(p => p.y)) - result.zones[name].wallTop) < 1e-8);
    for (const [p, q, r] of edgeTriangles) {
      const nx = (q.y - p.y) * (r.z - p.z) - (q.z - p.z) * (r.y - p.y);
      const nz = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      assert.ok(nx * (b.z - a.z) - nz * (b.x - a.x) > 0, 'exterior wall winding faces out of the source ring');
    }
    for (const [index, point] of [[i, a], [j, b]]) {
      const endpoint = edgeTriangles.flat().filter(p => Math.hypot(p.x - point.x, p.z - point.z) < 1e-8);
      assert.ok(endpoint.some(p => p.y === groundHeights[index]), 'wall reaches the unchanged source ground at each endpoint');
    }
  }
});

test('the internal 3→7 closure starts above the low roof cap and contains no full-height dividing wall', () => {
  const result = buildReviewedSplitMassing(input()), a = ring[3], b = ring[7];
  const shared = triangles(result.wallTriangles).filter(t => t.every(p => onSegment(p, a, b)));
  assert.equal(shared.length, 2, 'one visible high-to-low step face');
  const heights = shared.flat().map(p => p.y);
  assert.equal(Math.min(...heights), result.zones.low.roofTop);
  assert.equal(Math.max(...heights), result.zones.high.wallTop);
  assert.ok(heights.every(y => y > result.zones.low.wallTop));
  const lowCentre = [0, 1, 2, 3, 7].map(i => ring[i]).reduce((p, q) => ({x: p.x + q.x / 5, z: p.z + q.z / 5}), {x: 0, z: 0});
  for (const [p, q, r] of shared) {
    const nx = (q.y - p.y) * (r.z - p.z) - (q.z - p.z) * (r.y - p.y);
    const nz = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    assert.ok(nx * (lowCentre.x - p.x) + nz * (lowCentre.z - p.z) > 0, 'step closure faces the low roof');
  }
  const fascia = triangles(result.roofTriangles).filter(t => t.every(p => onSegment(p, a, b)));
  assert.equal(fascia.length, 2);
  assert.equal(Math.min(...fascia.flat().map(p => p.y)), result.zones.high.wallTop);
  assert.equal(Math.max(...fascia.flat().map(p => p.y)), result.zones.high.roofTop);
  assert.deepEqual(result.split.sourceIndices, [3, 7]);
});

test('reversing or rotating the same ring keeps the split, ground samples and emitted geometry identical', () => {
  const expected = buildReviewedSplitMassing(input());
  for (const indices of [[7, 6, 5, 4, 3, 2, 1, 0], [3, 4, 5, 6, 7, 0, 1, 2], [3, 2, 1, 0, 7, 6, 5, 4]]) {
    const args = input({ring: indices.map(i => ({...ring[i]})), groundHeights: indices.map(i => groundHeights[i])});
    const actual = buildReviewedSplitMassing(args);
    assert.equal(actual.valid, true, actual.reason);
    assert.deepEqual(actual.wallTriangles, expected.wallTriangles);
    assert.deepEqual(actual.roofTriangles, expected.roofTriangles);
    assert.deepEqual(actual.zones, expected.zones);
  }
  const closed = buildReviewedSplitMassing(input({ring: [...ring, ring[0]], groundHeights: [...groundHeights, groundHeights[0]]}));
  assert.equal(closed.valid, true);
  assert.deepEqual(closed.wallTriangles, expected.wallTriangles);
});

test('changed source identity, geometry, holes or source dimensions reject without emitting a partial replacement', () => {
  const moved = structuredClone(ring); moved[3].x += .01;
  const crossed = structuredClone(ring); [crossed[1], crossed[2]] = [crossed[2], crossed[1]];
  for (const patch of [{sourceId: 'way/elsewhere'}, {ring: moved}, {ring: crossed}, {ring: ring.slice(0, -1)},
    {holes: [[ring[0], ring[1], ring[2]]]}, {ring: ring.map((p, i) => i ? p : {...p, x: NaN})},
    {dimensions: {...input().dimensions, height: 5.2}}, {dimensions: {...input().dimensions, minHeight: .1}},
    {project: () => { throw new Error('projection unavailable'); }}]) unchangedRejected(input(patch));
});

test('new measured tags and unreviewed tag changes preserve the original source shell', () => {
  for (const [key, value] of [['height', '6'], ['building:levels', '2'], ['roof:height', '.3'], ['roof:shape', 'flat'],
    ['min_height', '0'], ['building:min_level', '0'], ['name', 'new source metadata'], ['building', 'commercial']]) {
    unchangedRejected(input({tags: {...way.tags, [key]: value}}));
  }
});

test('missing, nonfinite, extreme or steep terrain never produces invalid geometry', () => {
  const steep = groundHeights.slice(); steep[4] += 3;
  for (const heights of [[], groundHeights.slice(1), groundHeights.map((h, i) => i ? h : NaN),
    groundHeights.map(() => Infinity), groundHeights.map(() => 1e20), steep]) unchangedRejected(input({groundHeights: heights}));
});
