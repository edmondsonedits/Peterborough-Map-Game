import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWaterStreetPaint } from '../city-explorer/water-street-paint.js';
import { buildRoadMarkingLayout } from '../city-explorer/road-marking-layout.js';

const tags = {
  highway: 'secondary', lanes: '2', maxspeed: '40', name: 'Water Street',
  oneway: 'yes', 'cycleway:right': 'lane', id: 'way/33966726',
};
const profile = { highway: 'secondary', oneWay: true, lanes: 2, width: 7.15, renderClass: 'arterial' };
const surface = (halfWidth = 6.5) => ({
  id: '11/5738',
  rings: [[
    { x: -halfWidth, z: 5 }, { x: halfWidth, z: 5 },
    { x: halfWidth, z: -45 }, { x: -halfWidth, z: -45 }, { x: -halfWidth, z: 5 },
  ]],
});
function segment(a, b, chainStart, lineId = 'way/33966726:0', sourceTags = tags) {
  return {
    a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] },
    aY: 10, bY: 10, chainStart, lineId, width: profile.width,
    profile, tags: sourceTags,
  };
}
function frameAt(frames, sourceDistance) {
  let hi = frames.findIndex(frame => frame.sourceDistance >= sourceDistance);
  if (hi < 0) return frames.at(-1);
  if (hi === 0) return frames[0];
  const a = frames[hi - 1], b = frames[hi], t = (sourceDistance - a.sourceDistance) / (b.sourceDistance - a.sourceDistance);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

test('audited Water interval emits three curb-frame solids and a source-phased 3/6 dash', () => {
  const segments = [segment([0, 0], [0, -20], 0), segment([0, -20], [0, -40], 20)];
  const result = buildWaterStreetPaint(segments, surface(), { worldZ: { minZ: -30, maxZ: -10 } });

  assert.equal(result.markings.filter(m => m.kind === 'solid').length, 3);
  assert.ok(result.markings.filter(m => m.kind === 'dash').length > 0);
  assert.deepEqual(result.markings.filter(m => m.kind === 'solid').map(m => m.curbOffset), [2.2, 3, 4.5]);
  const frame = result.frames.find(p => Math.abs(p.sourceDistance - 20) < 1e-6);
  assert.ok(frame);
  for (const marking of result.markings.filter(m => m.kind === 'solid')) {
    assert.ok(marking.path.points.every(p => {
      const anchor = frameAt(result.frames, p.sourceDistance);
      return Math.abs(Math.hypot(p.x - anchor.x, p.z - anchor.z) - marking.curbOffset) < 1e-6;
    }));
  }
  const dash = result.markings.find(m => m.kind === 'dash');
  assert.deepEqual(dash.dashPattern, { dash: 3, gap: 6 });
  assert.ok(dash.path.startDistance >= 10);
  assert.deepEqual(result.suppressedRanges, [{ lineId: 'way/33966726:0', start: 10, end: 30 }]);
});

test('reviewed curb-frame paint follows an audited bend with stable offsets', () => {
  const center = [[0, 0], [0, -10], [2, -20], [6, -30]];
  let chainStart = 0;
  const segments = center.slice(1).map((p, i) => {
    const current = segment(center[i], p, chainStart);
    chainStart += Math.hypot(p[0] - center[i][0], p[1] - center[i][1]);
    return current;
  });
  const normals = center.map((p, i) => {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(center.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    return { x: dz / len, z: -dx / len };
  });
  const east = center.map((p, i) => ({ x: p[0] - normals[i].x * 6.5, z: p[1] - normals[i].z * 6.5 }));
  const west = center.map((p, i) => ({ x: p[0] + normals[i].x * 6.5, z: p[1] + normals[i].z * 6.5 }));
  const polygon = [...east, ...west.reverse(), east[0]];
  const result = buildWaterStreetPaint(segments, { id: '11/5738', rings: [polygon] }, { worldZ: { minZ: -28, maxZ: -2 } });

  assert.equal(result.markings.filter(m => m.kind === 'solid').length, 3);
  assert.ok(result.markings.filter(m => m.kind === 'dash').length > 0);
  for (const marking of result.markings.filter(m => m.kind === 'solid')) {
    const offset = marking.curbOffset;
    for (const frame of result.frames) {
      const point = marking.path.points.reduce((best, p) => Math.abs(p.sourceDistance - frame.sourceDistance) < Math.abs(best.sourceDistance - frame.sourceDistance) ? p : best);
      if (Math.abs(point.sourceDistance - frame.sourceDistance) > 2.01) continue;
      const anchor = frameAt(result.frames, point.sourceDistance);
      assert.ok(Math.abs(Math.hypot(point.x - anchor.x, point.z - anchor.z) - offset) < 0.08);
    }
  }
});

test('junction cuts remain empty in reviewed paint and in generic suppression ranges', () => {
  const segments = [segment([0, 0], [0, -20], 0), segment([0, -20], [0, -40], 20)];
  const paintContext = { cutsByLine: new Map([['way/33966726:0', [{ start: 15, end: 17 }]]]) };
  const result = buildWaterStreetPaint(segments, surface(), { worldZ: { minZ: -30, maxZ: -10 }, paintContext });

  assert.deepEqual(result.suppressedRanges, [
    { lineId: 'way/33966726:0', start: 10, end: 15 },
    { lineId: 'way/33966726:0', start: 17, end: 30 },
  ]);
  assert.ok(result.markings.every(m => m.path.points.every(p => p.sourceDistance <= 15 + 1e-6 || p.sourceDistance >= 17 - 1e-6)));
});

test('generic lane/cycle paint is clipped only inside the reviewed interval', () => {
  const original = segment([0, 0], [0, -40], 0);
  const reviewed = buildWaterStreetPaint([original], surface(), { worldZ: { minZ: -30, maxZ: -10 } });
  const generic = buildRoadMarkingLayout([original], { suppressedRanges: reviewed.suppressedRanges });
  assert.ok(generic.markings.length > 0);
  for (const marking of generic.markings) {
    assert.ok(marking.path.points.every(p => p.sourceDistance <= 10 + 1e-6 || p.sourceDistance >= 30 - 1e-6));
  }
});

test('optional node-to-node suppression clears generic paint outside the calibrated core only after full acceptance', () => {
  const original = segment([0, 0], [0, -40], 0);
  const reviewed = buildWaterStreetPaint([original], surface(), {
    worldZ: { minZ: -30, maxZ: -10 },
    suppressionWorldZ: { minZ: -38, maxZ: -2 },
  });
  assert.equal(reviewed.stats.coreAccepted, true);
  assert.deepEqual(reviewed.suppressedRanges, [{ lineId: 'way/33966726:0', start: 2, end: 38 }]);
  assert.equal(reviewed.stats.coverageComplete, true);
  assert.deepEqual(reviewed.stats.approachExtensionMetres, { start: 8, end: 8 });
  for (const marking of reviewed.markings.filter(m => m.kind === 'solid')) {
    assert.equal(Math.min(...marking.path.points.map(p => p.sourceDistance)), 2);
    assert.equal(Math.max(...marking.path.points.map(p => p.sourceDistance)), 38);
  }

  const rejected = buildWaterStreetPaint([original], surface(9), {
    worldZ: { minZ: -30, maxZ: -10 },
    suppressionWorldZ: { minZ: -38, maxZ: -2 },
  });
  assert.equal(rejected.stats.coreAccepted, false);
  assert.equal(rejected.stats.coverageComplete, false);
  assert.equal(rejected.suppressedRanges.length, 0);
});

test('an approach extension over 20 m fails coverage and keeps suppression at the validated core', () => {
  const original = segment([0, 0], [0, -80], 0);
  const reviewed = buildWaterStreetPaint([original], surface(), {
    worldZ: { minZ: -30, maxZ: -10 },
    suppressionWorldZ: { minZ: -60, maxZ: -2 },
  });
  assert.equal(reviewed.stats.coreAccepted, true);
  assert.equal(reviewed.stats.coverageComplete, false);
  assert.deepEqual(reviewed.stats.approachExtensionMetres, { start: 8, end: 30 });
  assert.deepEqual(reviewed.suppressedRanges, [{ lineId: 'way/33966726:0', start: 10, end: 30 }]);
  assert.ok(reviewed.markings.every(m => m.path.points.every(p => p.sourceDistance >= 10 - 1e-6 && p.sourceDistance <= 30 + 1e-6)));
});

test('a partially invalid core emits no suppression while core-wide acceptance fails', () => {
  const original = segment([0, 0], [0, -40], 0);
  const varyingWidthSurface = {
    id: '11/5738',
    rings: [[
      { x: -6.5, z: 5 }, { x: 6.5, z: 5 }, { x: 6.5, z: -45 },
      { x: -6.5, z: -45 }, { x: -6.5, z: -22 }, { x: -9, z: -22 },
      { x: -9, z: -18 }, { x: -6.5, z: -18 }, { x: -6.5, z: 5 },
    ]],
  };
  const reviewed = buildWaterStreetPaint([original], varyingWidthSurface, {
    worldZ: { minZ: -30, maxZ: -10 },
    suppressionWorldZ: { minZ: -38, maxZ: -2 },
  });
  assert.equal(reviewed.stats.coreAccepted, false);
  assert.equal(reviewed.stats.coverageComplete, false);
  assert.ok(reviewed.stats.validSamples > 0);
  assert.ok(reviewed.stats.rejectedWidthSamples > 0);
  assert.deepEqual(reviewed.suppressedRanges, []);
});

test('tangent approaches cover each junction-allowed range without crossing an existing cut', () => {
  const original = segment([0, 0], [0, -40], 0);
  const paintContext = { cutsByLine: new Map([['way/33966726:0', [{ start: 15, end: 17 }]]]) };
  const reviewed = buildWaterStreetPaint([original], surface(), {
    worldZ: { minZ: -30, maxZ: -10 },
    suppressionWorldZ: { minZ: -38, maxZ: -2 },
    paintContext,
  });
  assert.equal(reviewed.stats.coverageComplete, true);
  assert.deepEqual(reviewed.suppressedRanges, [
    { lineId: 'way/33966726:0', start: 2, end: 15 },
    { lineId: 'way/33966726:0', start: 17, end: 38 },
  ]);
  for (const marking of reviewed.markings) {
    assert.ok(marking.path.points.every(p => p.sourceDistance <= 15 + 1e-6 || p.sourceDistance >= 17 - 1e-6));
  }
});

test('the reviewed recipe refuses unrelated ways, missing surface and ambiguous widths', () => {
  const segmentToReview = segment([0, 0], [0, -20], 0);
  assert.equal(buildWaterStreetPaint([segmentToReview], { ...surface(), id: '11/999' }, { worldZ: { minZ: -20, maxZ: 0 } }).markings.length, 0);
  assert.equal(buildWaterStreetPaint([segmentToReview], null, { worldZ: { minZ: -20, maxZ: 0 } }).markings.length, 0);
  const otherWay = segment([0, 0], [0, -20], 0, 'way/454960676:0');
  assert.equal(buildWaterStreetPaint([otherWay], surface(), { worldZ: { minZ: -20, maxZ: 0 } }).markings.length, 0);
  const missingTags = segment([0, 0], [0, -20], 0, 'way/33966726:0', { ...tags, oneway: 'no' });
  assert.equal(buildWaterStreetPaint([missingTags], surface(), { worldZ: { minZ: -20, maxZ: 0 } }).markings.length, 0);
  const wide = buildWaterStreetPaint([segmentToReview], surface(9), { worldZ: { minZ: -20, maxZ: 0 } });
  assert.equal(wide.markings.length, 0);
  assert.equal(wide.suppressedRanges.length, 0);
});
