import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import {
  drapePaintPolygon,
  paintArrowTriangles,
  paintCrossingTriangles,
  paintDashTriangles,
  paintStopBarTriangles,
} from '../city-explorer/road-paint-geometry.js';

function addPlane(index, x0, x1, z0, z1, height, slopeX = 0, slopeZ = 0, metadata = {}) {
  const y = (x, z) => Math.fround(height + slopeX * x + slopeZ * z);
  index.addTriangle(x0, y(x0, z0), z0, x1, y(x1, z0), z0, x1, y(x1, z1), z1, metadata);
  index.addTriangle(x0, y(x0, z0), z0, x1, y(x1, z1), z1, x0, y(x0, z1), z1, metadata);
}

function planeIndex() {
  const index = new RenderedPavementIndex(4);
  addPlane(index, -20, 20, -20, 20, 3, 0.08, -0.035, { id: 'road-17', layer: 'road_surfaces' });
  return index;
}

function expectBatch(batch, sourceId) {
  assert.equal(batch.sourceId, sourceId);
  assert.ok(batch.positions instanceof Float32Array);
  assert.ok(batch.positions.length > 0 && batch.positions.length % 9 === 0);
  assert.ok([...batch.positions].every(Number.isFinite));
  for (let i = 0; i < batch.positions.length; i += 9) {
    const [ax, , az, bx, , bz, cx, , cz] = batch.positions.slice(i, i + 9);
    const signedArea = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    assert.ok(signedArea < 0, 'paint triangles have upward-facing winding');
  }
}

test('arrow and combined through/left symbols drape as bounded triangles on sloped rendered pavement', () => {
  const index = planeIndex();
  const sampler = (x, z, referenceHeight) => index.sample(x, z, referenceHeight);
  const arrow = paintArrowTriangles({ x: 0, z: 0, heading: 0, symbol: 'left', length: 4, width: 1.7 }, sampler,
    { sourceId: 'way/17', referenceHeight: 3, lift: 0.02, spacing: 0.75 });
  const combined = paintArrowTriangles({ x: 4, z: 0, heading: 0, symbol: 'through;left', length: 4, width: 1.7 }, sampler,
    { sourceId: 'way/17', referenceHeight: 3, lift: 0.02, spacing: 0.75 });
  expectBatch(arrow, 'way/17');
  expectBatch(combined, 'way/17');
  assert.ok([...arrow.positions].some((_, i) => i % 3 === 0 && arrow.positions[i] < -0.5), 'left arm extends to the left');
  assert.ok([...combined.positions].some((_, i) => i % 3 === 2 && combined.positions[i] > 1), 'combined symbol retains through arm');
  assert.ok([...combined.positions].some((_, i) => i % 3 === 0 && combined.positions[i] < 3.5), 'combined symbol retains left arm');
  for (let i = 0; i < arrow.positions.length; i += 3) {
    const support = sampler(arrow.positions[i], arrow.positions[i + 2], 3);
    assert.ok(support);
    assert.ok(Math.abs(arrow.positions[i + 1] - (support.height + 0.02)) < 1e-5);
  }
});

test('crossing bars, ladder rails and dots are pavement triangles and preserve source identity', () => {
  const index = planeIndex();
  const sampler = (x, z, referenceHeight) => index.sample(x, z, referenceHeight);
  for (const style of ['zebra', 'ladder', 'lines', 'dots']) {
    const batch = paintCrossingTriangles({ a: { x: -4, z: 0 }, b: { x: 4, z: 0 }, width: 3, style }, sampler,
      { sourceId: 'crossing/4', referenceHeight: 3, lift: 0.018, spacing: 0.6 });
    expectBatch(batch, 'crossing/4');
    assert.ok(batch.positions.length >= 54, `${style} creates visible supported marks`);
  }
});

test('stop bars and dashed centre marks follow the sampled slope', () => {
  const index = planeIndex();
  const sampler = (x, z, referenceHeight) => index.sample(x, z, referenceHeight);
  const bar = paintStopBarTriangles({ x: 0, z: 0, heading: Math.PI / 2, width: 5, depth: 0.34 }, sampler,
    { sourceId: 'way/stop-8', referenceHeight: 3, lift: 0.016, spacing: 0.5 });
  const dashes = paintDashTriangles({ a: { x: -8, z: 0 }, b: { x: 8, z: 0 }, width: 0.15,
    dashLength: 2, gapLength: 2 }, sampler, { sourceId: 'way/dash-8', referenceHeight: 3, spacing: 0.5 });
  expectBatch(bar, 'way/stop-8');
  expectBatch(dashes, 'way/dash-8');
  assert.ok(dashes.positions.length >= 36, 'multiple mapped dash segments are emitted');
});

test('unsupported pavement gaps suppress triangles instead of bridging islands', () => {
  const index = new RenderedPavementIndex(2);
  addPlane(index, -6, -1, -6, 6, 0, 0.03, 0, { id: 'west', layer: 'road_surfaces' });
  addPlane(index, 1, 6, -6, 6, 0, 0.03, 0, { id: 'east', layer: 'road_surfaces' });
  const batch = paintStopBarTriangles({ x: 0, z: 0, heading: 0, width: 10, depth: 1 },
    (x, z, referenceHeight) => index.sample(x, z, referenceHeight),
    { sourceId: 'bar/island', referenceHeight: 0, spacing: 0.5 });
  expectBatch(batch, 'bar/island');
  for (let i = 0; i < batch.positions.length; i += 9) {
    const xs = [batch.positions[i], batch.positions[i + 3], batch.positions[i + 6]];
    assert.ok(Math.max(...xs) <= -1 || Math.min(...xs) >= 1, 'no triangle spans the unsurfaced gap');
  }
});

test('reference-height sampling keeps paint on the intended bridge deck', () => {
  const index = new RenderedPavementIndex(5);
  addPlane(index, -5, 5, -5, 5, 0, 0, 0, { id: 'street', layer: 'road_surfaces' });
  addPlane(index, -5, 5, -5, 5, 12, 0.02, 0.01, { id: 'bridge', layer: 'bridges' });
  const batch = drapePaintPolygon([
    { x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 },
  ], (x, z, referenceHeight) => index.sample(x, z, referenceHeight),
  { sourceId: 'way/bridge', referenceHeight: 12, spacing: 0.4, lift: 0.01 });
  expectBatch(batch, 'way/bridge');
  for (let i = 1; i < batch.positions.length; i += 3) assert.ok(batch.positions[i] > 11);
});

test('subdivision respects configured spacing work bounds and maximum triangle count', () => {
  const index = planeIndex();
  const batch = drapePaintPolygon([
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 },
  ], (x, z) => index.sample(x, z),
  { sourceId: 'bounded', spacing: 0.01, maxTriangles: 7 });
  expectBatch(batch, 'bounded');
  assert.ok(batch.positions.length <= 7 * 9, 'recursive subdivision stops at the triangle budget');
});
