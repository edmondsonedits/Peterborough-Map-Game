import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoadSurfaceIndex } from '../city-explorer/road-network.js';

function road(name, a, b, { width = 8, aY = 0, bY = 0, bridge = false,
  tunnel = false, layer = '0', lineId = name } = {}) {
  return { a: { x: a[0], y: a[1] }, b: { x: b[0], y: b[1] }, aY, bY,
    width, bridge, lineId, name,
    tags: { highway: 'residential', name, layer, ...(tunnel ? { tunnel: 'yes' } : {}) },
    profile: { tunnel, bridge } };
}

function indexOf(...segments) {
  const index = new RoadSurfaceIndex();
  index.addAll(segments);
  return index;
}

const narrowEdge = () => road('near-narrow-road', [-10, 1.5], [10, 1.5], { width: 2 });
const broadPavement = () => road('wide-road', [-10, 2.5], [10, 2.5], { width: 8 });

test('same-grade on-road candidate wins over a nearer narrow-road edge, with or without a height hint', () => {
  const index = indexOf(narrowEdge(), broadPavement());
  const candidates = index.sampleAll(0, 0, 2.2);
  assert.deepEqual(candidates.map(candidate => [candidate.name, candidate.onRoad]), [
    ['near-narrow-road', false], ['wide-road', true],
  ]);
  for (const referenceHeight of [null, 2]) {
    const hit = index.sample(0, 0, 2.2, referenceHeight);
    assert.equal(hit.name, 'wide-road');
    assert.equal(hit.onRoad, true);
  }
});

test('same-grade sloping ribbon follows the closest centerline instead of stale vehicle height', () => {
  const previous = road('same-way', [0, 0], [10, 0], { aY: 0, bY: 4, lineId: 'same-way' });
  const next = road('same-way', [10, 0], [20, 0], { aY: 4, bY: 8, lineId: 'same-way' });
  const index = indexOf(previous, next);
  const candidates = index.sampleAll(11.1, 0, 1);
  assert.equal(candidates[0].distance, 0);
  assert.ok(candidates.some(candidate => candidate.distance > 1));
  const hit = index.sample(11.1, 0, 1, 3.1);
  assert.equal(hit.name, 'same-way');
  assert.ok(hit.height > 4.4 && hit.height < 4.5, 'interior segment interpolation should win');
});

test('reference height selects a stacked bridge deck while planar selection preserves on-road status', () => {
  const street = road('lower-street', [-10, 0], [10, 0], { aY: 0, bY: 0, layer: '0' });
  const bridge = road('upper-bridge', [0, -10], [0, 10], { aY: 4, bY: 4, bridge: true, layer: '1' });
  const index = indexOf(street, bridge);
  const lower = index.sample(0, 0, 0.5, 0.05);
  const upper = index.sample(0, 0, 0.5, 3.95);
  assert.equal(lower.name, 'lower-street');
  assert.equal(lower.height, 0);
  assert.equal(upper.name, 'upper-bridge');
  assert.equal(upper.height, 4);
  assert.equal(index.sample(0, 0, 0.5, null).onRoad, true);
});

test('tunnel and explicit layer differences preserve vertical selection', () => {
  const surface = road('surface', [-10, 0], [10, 0], { aY: 0, bY: 0, layer: '0' });
  const tunnel = road('tunnel', [0, -10], [0, 10], { aY: -3, bY: -3, tunnel: true, layer: '-1' });
  const index = indexOf(surface, tunnel);
  assert.equal(index.sample(0, 0, 0.5, 0).name, 'surface');
  assert.equal(index.sample(0, 0, 0.5, -3).name, 'tunnel');
});

test('tolerance-only hits remain available when no candidate contains the query', () => {
  const index = indexOf(road('near-but-off-road', [-10, 1.5], [10, 1.5], { width: 2 }));
  const hit = index.sample(0, 0, 1.25, 0);
  assert.equal(hit.name, 'near-but-off-road');
  assert.equal(hit.onRoad, false);
  assert.equal(hit.distance, 1.5);
});

test('road contacts expose the actual projected centerline point for ownership masks',()=>{
 const hit=indexOf(road('projection',[0,0],[20,0],{aY:1,bY:3})).sample(7,2,3,1);
 assert.equal(hit.nearestX,7);assert.equal(hit.nearestZ,0);assert.equal(hit.directionX,1);assert.equal(hit.directionZ,0);
});
