import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIntersectionHolograms, chooseIntersectionStreet } from '../city-explorer/intersection-hologram-rules.js';

function segment(name, a, b, options = {}) {
  const { aSourceVertex = true, bSourceVertex = true, aLineEndpoint = false,
    bLineEndpoint = false, aY = 0, bY = 0, layer = '0', highway = 'residential',
    width = 8, bridge = false } = options;
  return { name, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, aY, bY,
    aSourceVertex, bSourceVertex, aLineEndpoint, bLineEndpoint, width, bridge,
    tags: { name, highway, layer }, profile: { width, highway, bridge } };
}

function fourWay() {
  return [segment('Main Street', [-20, 0], [0, 0]),
    segment('Main Street', [0, 0], [20, 0]),
    segment('North Road', [0, 0], [0, 20])];
}

test('builds source-endpoint T junction topology with every exact street name', () => {
  const [junction] = buildIntersectionHolograms(fourWay());
  assert.ok(junction.id);
  assert.deepEqual(junction.names, ['Main Street', 'North Road']);
  assert.equal(junction.roads.find(road => road.name === 'Main Street').directions.length, 1);
  assert.equal(junction.roads.find(road => road.name === 'Main Street').width, 8);
  assert.equal(junction.roadWidth, 8);
});

test('uses camera heading for right, left and U turns, then changes label near turn midpoint', () => {
  const [junction] = buildIntersectionHolograms(fourWay());
  const choose = (x, z, previous) => chooseIntersectionStreet(junction, { x, z }, previous);
  assert.equal(choose(1, 0).currentStreet, 'Main Street');
  assert.deepEqual(choose(1, 0).displayNames, ['North Road']);
  assert.equal(choose(0, 1, 'Main Street').currentStreet, 'North Road'); // right turn
  assert.equal(choose(0, -1, 'Main Street').currentStreet, 'North Road'); // left turn
  assert.equal(choose(-1, 0, 'Main Street').currentStreet, 'Main Street'); // U turn
  assert.equal(choose(0.74, 0.68, 'Main Street').currentStreet, 'Main Street');
  assert.equal(choose(0.65, 0.76, 'Main Street').currentStreet, 'North Road');
});

test('keeps the same street across a bend and supports multiway junction names', () => {
  const roads = [segment('Curving Avenue', [-10, 0], [0, 0]),
    segment('Curving Avenue', [0, 0], [10, 10]), segment('Cross Street', [0, 0], [0, 10]),
    segment('Third Street', [0, 0], [-10, 0])];
  const [junction] = buildIntersectionHolograms(roads);
  assert.deepEqual(junction.names, ['Cross Street', 'Curving Avenue', 'Third Street']);
  assert.equal(chooseIntersectionStreet(junction, { x: Math.SQRT1_2, z: Math.SQRT1_2 }, 'Curving Avenue').currentStreet,
    'Curving Avenue');
  assert.deepEqual(chooseIntersectionStreet(junction, { x: 0, z: 1 }).displayNames,
    ['Curving Avenue', 'Third Street']);
});

test('ignores interior samples and admits explicitly marked source line endpoints', () => {
  const base = [segment('Main Street', [-10, 0], [0, 0]),
    segment('Main Street', [0, 0], [10, 0]),
    segment('Cross Street', [0, 0], [0, 10], { aSourceVertex: false, bSourceVertex: false })];
  assert.equal(buildIntersectionHolograms(base).length, 0);
  base[2].aLineEndpoint = true;
  assert.equal(buildIntersectionHolograms(base).length, 1);
});

test('height, layer, and non-motor routes cannot create a false street junction', () => {
  const roads = [segment('Main Street', [-10, 0], [0, 0]),
    segment('Bridge Road', [0, 0], [10, 0], { aY: 5, bY: 5, layer: '1', bridge: true }),
    segment('Footpath', [0, 0], [0, 10], { highway: 'footway' }),
    segment('Walking Lane', [0, 0], [-10, 0], { highway: 'service' })];
  roads[3].tags.access = 'foot';
  assert.equal(buildIntersectionHolograms(roads).length, 0);
});

test('joins same-layer source endpoints across height-key buckets when their full span is within tolerance', () => {
  const roads = [segment('Main Street', [-10, 0], [0, 0], { aY: 0, bY: 0.12 }),
    segment('Main Street', [0, 0], [10, 0], { aY: 0.13, bY: 0.13 }),
    segment('Cross Road', [0, 0], [0, 10], { aY: 0.13, bY: 0.13 }),
    segment('Generated sample', [0, 0], [0, -10], { aSourceVertex: false, bSourceVertex: false, aY: 0.13 })];
  const [junction] = buildIntersectionHolograms(roads);
  assert.deepEqual(junction.names, ['Cross Road', 'Main Street']);
  assert.equal(junction.y, 0.13);
});

test('elevation clusters cannot chain source endpoints beyond the full height tolerance', () => {
  const roads = [segment('Level Road', [-10, 0], [0, 0], { bY: 0 }),
    segment('Rising Road', [0, 0], [0, 10], { aY: 0.2 }),
    segment('Upper Road', [0, 0], [10, 0], { aY: 0.4 })];
  const junctions = buildIntersectionHolograms(roads);
  assert.equal(junctions.length, 1);
  assert.deepEqual(junctions[0].names, ['Level Road', 'Rising Road']);
  assert.ok(!junctions.some(junction => junction.names.includes('Upper Road')));
});
