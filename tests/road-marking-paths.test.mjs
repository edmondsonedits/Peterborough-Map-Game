import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRoadMarkingPaths, sourceIntervalsToPathIntervals, strokeMarkingPath } from '../city-explorer/road-marking-paths.js';

const xy = (points) => points.map(({ x, z }) => [x, z]);

test('a right-angle road marking shares a joined cross section instead of leaving the old segment gap', () => {
  const [path] = buildRoadMarkingPaths([
    { x: 0, z: 0, lineId: 'way/1' },
    { x: 10, z: 0, lineId: 'way/1' },
    { x: 10, z: 10, lineId: 'way/1' },
  ], { offset: 2, width: 0.12 });

  assert.deepEqual(xy(path.points), [[0, -2], [12, -2], [12, 10]]);
  assert.deepEqual(path.sourceLineIds, ['way/1']);
  const stroke = strokeMarkingPath(path.points, 0.12);
  assert.equal(stroke.quads.length, 2);
  assert.deepEqual(stroke.crossSections[1], [stroke.quads[0][3], stroke.quads[0][2]]);
  assert.deepEqual(stroke.crossSections[1], stroke.quads[1].slice(0, 2));
});

test('subdividing a straight source chain does not change its offset geometry', () => {
  const options = { offset: 1.5, width: 0.1 };
  const single = buildRoadMarkingPaths([{ x: 0, z: 0 }, { x: 12, z: 0 }], options);
  const divided = buildRoadMarkingPaths([{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 12, z: 0 }], options);

  assert.equal(divided[0].startDistance, single[0].startDistance);
  assert.equal(divided[0].endDistance, single[0].endDistance);
  assert.deepEqual(xy(divided[0].points).filter((point, index, all) => index === 0 || (index === all.length - 1)), [[0, -1.5], [12, -1.5]]);
  assert.ok(xy(divided[0].points).every(([, z]) => z === -1.5));
});

test('dash placement follows offset-path distance through corners and is invariant to extra vertices', () => {
  const options = { offset: 1, dashPattern: { dash: 3, gap: 2 }, phase: 0 };
  const coarse = buildRoadMarkingPaths([{ x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }], options);
  const split = buildRoadMarkingPaths([
    { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 4 }, { x: 8, z: 8 },
  ], options);

  assert.deepEqual(coarse.map((path) => [path.startDistance, path.endDistance]), split.map((path) => [path.startDistance, path.endDistance]));
  assert.deepEqual(coarse.map((path) => path.startDistance), [0, 5, 10, 15]);
  assert.deepEqual(coarse.map((path) => path.endDistance), [3, 8, 13, 18]);
});

test('clipped intervals cut both solid paint and dash marks without bridging the junction gap', () => {
  const points = [{ x: 0, z: 0 }, { x: 10, z: 0 }];
  const solid = buildRoadMarkingPaths(points, { offset: 1, clipIntervals: [[2, 8]] });
  const dashed = buildRoadMarkingPaths(points, {
    offset: 1, dashPattern: { dash: 4, gap: 2 }, clipIntervals: [[2, 8]],
  });

  assert.deepEqual(solid.map((path) => [path.startDistance, path.endDistance]), [[2, 8]]);
  assert.deepEqual(dashed.map((path) => [path.startDistance, path.endDistance]), [[2, 4], [6, 8]]);
});

test('overlapping or touching allowed clip ranges produce one painted interval', () => {
  const paths = buildRoadMarkingPaths([{ x: 0, z: 0 }, { x: 10, z: 0 }], {
    clipIntervals: [[1, 4], [3, 6], [6, 7]],
  });

  assert.deepEqual(paths.map((path) => [path.startDistance, path.endDistance]), [[1, 7]]);
});

test('dash phase remains anchored to the full chain when a clipped interval starts inside a dash gap', () => {
  const paths = buildRoadMarkingPaths([{ x: 0, z: 0 }, { x: 10, z: 0 }], {
    dashPattern: { dash: 4, gap: 2 }, phase: 3, clipIntervals: [[2, 8]],
  });

  assert.deepEqual(paths.map((path) => [path.startDistance, path.endDistance]), [[6, 10]]);
});

test('near-reversal cusps split the path instead of painting a connector across the road', () => {
  const paths = buildRoadMarkingPaths([
    { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 4 },
  ], { offset: 2, width: 0.1, miterLimit: 2 });
  assert.ok(paths.length >= 2);
  for (const segment of paths) for (let i = 1; i < segment.points.length; i += 1) {
    assert.ok(Math.hypot(segment.points[i].x - segment.points[i - 1].x, segment.points[i].z - segment.points[i - 1].z) < 5);
  }
});

test('closed loops use cyclic offset and stroke joins at the shared first and last vertex', () => {
  const [path] = buildRoadMarkingPaths([
    { x: 0, z: 0 }, { x: 8, z: 0 }, { x: 8, z: 8 }, { x: 0, z: 8 }, { x: 0, z: 0 },
  ], { offset: 1, width: 0.2 });
  const stroke = strokeMarkingPath(path.points, 0.2);

  assert.deepEqual([path.points[0].x, path.points[0].z], [path.points.at(-1).x, path.points.at(-1).z]);
  assert.deepEqual(stroke.crossSections[0], stroke.crossSections.at(-1));
  assert.equal(stroke.quads.length, path.points.length - 1);
});

test('source-chain allowed intervals map to the corresponding offset-path distances', () => {
  const mapped = sourceIntervalsToPathIntervals([
    { sourceDistance: 0, distance: 0 },
    { sourceDistance: 5, distance: 6 },
    { sourceDistance: 10, distance: 11 },
  ], [[2.5, 7.5]]);

  assert.deepEqual(mapped, [[3, 8.5]]);
});

test('source ids survive attributions across a connected way boundary', () => {
  const [path] = buildRoadMarkingPaths([
    { x: 0, z: 0, lineId: 'way/1' },
    { x: 5, z: 0, lineId: 'way/1' },
    { x: 10, z: 0, lineId: 'way/2' },
  ], { offset: 1 });

  assert.deepEqual(path.sourceLineIds, ['way/1', 'way/2']);
});

test('a clipped dash retains conservative source ids for the complete connected source path', () => {
  const [path] = buildRoadMarkingPaths([
    { x: 0, z: 0, lineId: 'way/1' },
    { x: 5, z: 0, lineId: 'way/1' },
    { x: 10, z: 0, lineId: 'way/2' },
  ], { dashPattern: { dash: 2, gap: 2 }, clipIntervals: [[0, 2]] });

  assert.deepEqual(path.sourceLineIds, ['way/1', 'way/2']);
});
