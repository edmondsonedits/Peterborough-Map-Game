import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoadMarkingContext, roadCurbIntervals, roadMarkingIntervals } from '../city-explorer/road-appearance-rules.js';

const profile = { renderClass: 'local', tunnel: false, unpaved: false };
function segment(lineId, a, b, { chainStart = 0, width = 8, name = lineId,
  aSourceVertex = true, bSourceVertex = true, aY = 0, bY = 0,
  layer = '0', bridge = false, tunnel = false, renderClass = 'local' } = {}) {
  return { lineId, a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
    aY, bY, aSourceVertex, bSourceVertex, chainStart, width, name,
    tags: { name, layer, ...(tunnel ? { tunnel: 'yes' } : {}) },
    bridge, profile: { ...profile, renderClass, tunnel, bridge } };
}
function allowedRanges(context, segments) {
  return segments.flatMap(item => roadMarkingIntervals(context, item).map(([a, b]) =>
    [item.chainStart + a, item.chainStart + b]));
}

test('branch trim propagates through many short densified segments and matches a coarse line', () => {
  const short = [];
  for (let i = 0; i < 10; i += 1) short.push(segment('main', [i, 0], [i + 1, 0], {
    chainStart: i, aSourceVertex: i === 0 || i === 5, bSourceVertex: i === 4 || i === 9,
  }));
  const side = segment('side', [5, 0], [5, 12], { name: 'side', chainStart: 0 });
  const coarse = [segment('main', [0, 0], [5, 0], { chainStart: 0 }),
    segment('main', [5, 0], [10, 0], { chainStart: 5 }), side];
  const shortContext = createRoadMarkingContext([...short, side]);
  const coarseContext = createRoadMarkingContext(coarse);
  assert.equal(shortContext.junctions.length, 1);
  assert.equal(shortContext.junctions[0].armCount, 3);
  assert.deepEqual(allowedRanges(shortContext, short).filter(([a, b]) => b <= 5.001 || a >= 4.999),
    allowedRanges(coarseContext, coarse.slice(0, 2)));
  assert.ok(roadMarkingIntervals(shortContext, short[3]).length === 0,
    'the line segment several samples before the node is clipped when its chain distance falls inside the mouth trim');
});

test('same-grade three-arm branch trims paint even when the main and side way share a name', () => {
  const roads = [segment('street', [-10, 0], [0, 0], { name: 'Main Street', chainStart: 0 }),
    segment('street', [0, 0], [10, 0], { name: 'Main Street', chainStart: 10 }),
    segment('street-side', [0, 0], [0, 10], { name: 'Main Street' })];
  const context = createRoadMarkingContext(roads);
  assert.equal(context.junctions.length, 1);
  assert.ok(context.cutsByLine.has('street'));
  assert.ok(roadMarkingIntervals(context, roads[0])[0][1] < 10);
});

test('two-arm name changes and ordinary dead ends do not create junction openings', () => {
  const continuation = [segment('west', [-10, 0], [0, 0], { name: 'Old Road' }),
    segment('east', [0, 0], [10, 0], { name: 'New Road' })];
  const deadEnd = [segment('dead', [0, 0], [10, 0], { aSourceVertex: false, bSourceVertex: true })];
  assert.equal(createRoadMarkingContext(continuation).junctions.length, 0);
  assert.equal(createRoadMarkingContext(deadEnd).junctions.length, 0);
});

test('height, layer, and tunnel differences prevent phantom overpass joins', () => {
  const base = segment('base', [-10, 0], [0, 0], { name: 'Base', aY: 0, bY: 0 });
  const over = segment('over', [0, 0], [10, 0], { name: 'Over', aY: 4, bY: 4, layer: '1', bridge: true });
  const tunnel = segment('tunnel', [0, 0], [0, 10], { name: 'Tunnel', tunnel: true });
  const context = createRoadMarkingContext([base, over, tunnel]);
  assert.equal(context.junctions.length, 0);
  assert.deepEqual(roadMarkingIntervals(context, base), [[0, 10]]);
});

test('acute and four-way branches produce bounded openings', () => {
  const tJunction = [segment('a', [-20, 0], [0, 0]), segment('b', [0, 0], [20, 0]),
    segment('c', [0, 0], [15, 5])];
  const fourWay = [segment('n', [0, 0], [0, 20]), segment('s', [0, 0], [0, -20]),
    segment('e', [0, 0], [20, 0]), segment('w', [0, 0], [-20, 0])];
  for (const roads of [tJunction, fourWay]) {
    const context = createRoadMarkingContext(roads);
    assert.equal(context.junctions.length, 1);
    assert.ok(context.junctions[0].trimDistances.every(item => item.distance >= 2.4 && item.distance <= 9));
  }
});

test('nearby junction cuts stay separate on a short block', () => {
  const main = [segment('main', [-10, 0], [0, 0], { chainStart: 0 }),
    segment('main', [0, 0], [4, 0], { chainStart: 10 }),
    segment('main', [4, 0], [14, 0], { chainStart: 14 }),
    segment('side-a', [0, 0], [0, 10]), segment('side-b', [4, 0], [4, 10])];
  const context = createRoadMarkingContext(main);
  assert.equal(context.junctions.length, 2);
  const intervals = allowedRanges(context, main.slice(1, 3));
  assert.ok(intervals.every(([a, b]) => b <= a || Number.isFinite(a + b)));
  assert.ok(intervals.every(([a, b]) => b - a < 4), 'the block center is clipped when adjacent junction mouths overlap');
});

test('invalid trim configuration fails clearly', () => {
  assert.throws(() => createRoadMarkingContext([], { maximumTrimMetres: 2 }), /Invalid road marking context options/);
});

test('T junction trims only the branch-facing curb on the main road and both curbs on the side road', () => {
  const mainWest = segment('main', [-20, 0], [0, 0], { chainStart: 0 });
  const mainEast = segment('main', [0, 0], [20, 0], { chainStart: 20 });
  const side = segment('side', [0, 0], [0, 20]);
  const context = createRoadMarkingContext([mainWest, mainEast, side]);
  const westOpen = roadCurbIntervals(context, mainWest, -1);
  const westFar = roadCurbIntervals(context, mainWest, 1);
  const sideRight = roadCurbIntervals(context, side, 1);
  const sideLeft = roadCurbIntervals(context, side, -1);
  assert.ok(westOpen[0][1] < 20, 'curb facing the side street opens before the node');
  assert.deepEqual(westFar, [[0, 20]], 'opposite main-road curb remains continuous');
  assert.ok(sideRight[0][0] > 0 && sideLeft[0][0] > 0, 'both side-road curbs open at the junction');
  assert.ok(roadMarkingIntervals(context, mainWest)[0][1] < 20,
    'paint keeps its shared, both-sides junction trim');
});

test('four-way junction trims both curb sides on every connected arm', () => {
  const roads = [segment('north', [0, 0], [0, 20]), segment('south', [0, 0], [0, -20]),
    segment('east', [0, 0], [20, 0]), segment('west', [0, 0], [-20, 0])];
  const context = createRoadMarkingContext(roads);
  for (const arm of roads) {
    for (const side of [-1, 1]) {
      const intervals = roadCurbIntervals(context, arm, side);
      assert.ok(intervals.length === 1 && intervals[0][0] > 0,
        `${arm.lineId} curb side ${side} should stop before the junction`);
    }
  }
});

test('collinear continuation does not trim either curb side', () => {
  const roads = [segment('west', [-10, 0], [0, 0]), segment('east', [0, 0], [10, 0])];
  const context = createRoadMarkingContext(roads);
  for (const arm of roads) for (const side of [-1, 1]) {
    assert.deepEqual(roadCurbIntervals(context, arm, side), [[0, 10]]);
  }
});

test('service driveway opens the facing curb without cutting public-road paint', () => {
  const mainWest = segment('main', [-20, 0], [0, 0], { chainStart: 0 });
  const mainEast = segment('main', [0, 0], [20, 0], { chainStart: 20 });
  const driveway = segment('driveway', [0, 0], [0, 12], { name: 'Access',
    renderClass: 'service', width: 3.5 });
  const context = createRoadMarkingContext([mainWest, mainEast, driveway]);
  assert.deepEqual(roadMarkingIntervals(context, mainWest), [[0, 20]],
    'two public continuation arms remain uncut when the third arm is service access');
  assert.ok(roadCurbIntervals(context, mainWest, -1)[0][1] < 20,
    'the curb facing the driveway opens');
  assert.deepEqual(roadCurbIntervals(context, mainWest, 1), [[0, 20]],
    'the opposite curb remains continuous');
});
