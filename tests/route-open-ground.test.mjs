import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { PackedRoadSurfaceIndex, decodeRoadTile } from '../city-explorer/road-tile-pack.js';
import {
  createWalmartGroundPlan,
  buildRouteParkingPaint,
  createWalmartTreeIsland,
} from '../city-explorer/route-open-ground.js';

// The app's actual local-metre projection; independent of the module under test.
const project = (lat, lon) => ({
  x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180),
  y: -(lat - 44.3091) * 110540,
});
const parking = { id: '10/1429', layer: 'parking_surfaces' };
function addPlane(index, { x0 = -1600, x1 = -800, z0 = -2000, z1 = -1300,
  height = 300, slopeX = 0, slopeZ = 0, metadata = parking } = {}) {
  const y = (x, z) => height + slopeX * x + slopeZ * z;
  index.addTriangle(x0, y(x0, z0), z0, x1, y(x1, z0), z0, x1, y(x1, z1), z1, metadata);
  index.addTriangle(x0, y(x0, z0), z0, x1, y(x1, z1), z1, x0, y(x0, z1), z1, metadata);
}
const sample = index => (x, z, height, options) => index.sample(x, z, height, options);
const oneRow = plan => ({ ...plan, rows: [{ ...plan.rows[0], count: 1 }] });
const finiteBatch = result => {
  assert.ok(result.positions instanceof Float32Array);
  assert.ok(result.positions.length > 0 && result.positions.length % 9 === 0);
  assert.ok([...result.positions].every(Number.isFinite));
};

test('paint is bounded by the audited lot and every source hole despite overly broad pavement support', () => {
  const plan = createWalmartGroundPlan(project);
  const index = new RenderedPavementIndex();
  addPlane(index);
  for (const row of plan.rows) assert.equal(plan.containsParking(row.origin.x, row.origin.z), true);
  const tree = project(44.323523678239724, -78.33443303595162);
  assert.equal(plan.containsParking(tree.x, tree.y), false, 'R012 tree cap remains a pavement hole');
  // Independent interior points inspected from all ten municipal holes. These
  // protect thin infrastructure cutouts as well as the larger planted caps.
  for (const [lat, lon] of [
    [44.3231680002, -78.33408921], [44.3246238644, -78.3342258826],
    [44.3240624271, -78.3349739985], [44.3242269262, -78.3350507027],
    [44.324029207, -78.3322881898], [44.3231359625, -78.3338772824],
    [44.3239205519, -78.3324758797], [44.3241946884, -78.3337265962],
    [44.3247493064, -78.3342553543], [44.3243820965, -78.3339051813],
  ]) {
    const point = project(lat, lon);
    assert.equal(plan.containsParking(point.x, point.y), false, `source hole at ${lat}, ${lon}`);
  }
  const outside = project(44.3243, -78.3328); // Walmart building interior.
  assert.equal(plan.containsParking(outside.x, outside.y), false);
  for (const origin of [{ x: tree.x, z: tree.y }, { x: outside.x, z: outside.y }]) {
    const moved = { ...oneRow(plan), rows: [{ ...plan.rows[0], count: 1, origin }] };
    const result = buildRouteParkingPaint({ plan: moved, samplePavement: sample(index) });
    assert.equal(result.positions.length, 0);
    assert.equal(result.rows[0].status, 'blocked');
    assert.ok(result.rows[0].diagnostics['outside-lot'] > 0);
  }
});

test('a stroke crossing an island is refused even when all four corners are on parking', () => {
  const plan = createWalmartGroundPlan(project), tree = plan.treeIsland.tree;
  const angle = 55.7 * Math.PI / 180, ux = Math.sin(angle), uz = -Math.cos(angle);
  const row = { ...plan.rows[0], count: 1, length: 8, bearing: 145.7, facing: -1,
    origin: { x: tree.x - ux * 4.2, z: tree.z - uz * 4.2 } };
  for (const along of [0, 8]) for (const across of [0, .12]) {
    assert.equal(plan.containsParking(row.origin.x + ux * along - uz * across,
      row.origin.z + uz * along + ux * across), true);
  }
  const index = new RenderedPavementIndex(); addPlane(index);
  const result = buildRouteParkingPaint({ plan: { ...plan, rows: [row] }, samplePavement: sample(index) });
  assert.equal(result.positions.length, 0);
  assert.ok(result.rows[0].diagnostics['outside-lot'] > 0);
});

test('audited partial rows emit finite upward paint on actual sampled parking grade', () => {
  const plan = createWalmartGroundPlan(project);
  const index = new RenderedPavementIndex();
  addPlane(index, { slopeX: .045, slopeZ: -.025 });
  const result = buildRouteParkingPaint({ plan, samplePavement: sample(index) });
  finiteBatch(result);
  assert.equal(result.ready, true);
  assert.equal(result.retryable, false);
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.status === 'ready' && row.emittedLines === 15));
  assert.ok(result.positions.length < 50000, 'two partial rows remain a bounded batch');
  // Observed row spines, independently georeferenced in the audit. The old 68°
  // axis or aisle origins would escape these narrow rectangular row envelopes.
  const origins = [[44.323644404, -78.334540418, -1], [44.323782225, -78.334671834, 1]];
  const angle = 55.7 * Math.PI / 180, vx = Math.cos(angle), vz = Math.sin(angle);
  result.rows.forEach((row, i) => {
    const origin = project(origins[i][0], origins[i][1]), facing = origins[i][2];
    for (let j = 0; j < row.positions.length; j += 3) {
      const across = ((row.positions[j] - origin.x) * vx + (row.positions[j + 2] - origin.y) * vz) * facing;
      assert.ok(across >= -.05 && across <= 5.35, 'paint occupies a stall band rather than the aisle');
    }
  });
  for (let i = 0; i < result.positions.length; i += 3) {
    const [x, y, z] = result.positions.slice(i, i + 3);
    assert.equal(plan.containsParking(x, z), true);
    const support = index.sample(x, z);
    assert.ok(Math.abs(y - support.height - .018) < .0001, 'paint follows final rendered triangles, not terrain');
  }
  for (let i = 0; i < result.positions.length; i += 9) {
    const [ax,,az,bx,,bz,cx,,cz] = result.positions.slice(i, i + 9);
    assert.ok((bx - ax) * (cz - az) - (bz - az) * (cx - ax) < 0);
  }
});

test('explicitly identified different lots are rejected even inside the audited polygon', () => {
  const index = new RenderedPavementIndex();
  addPlane(index, { metadata: { id: '10/999', layer: 'parking_surfaces' } });
  const result = buildRouteParkingPaint({ plan: createWalmartGroundPlan(project), samplePavement: sample(index) });
  assert.equal(result.positions.length, 0);
  assert.ok(result.rows.every(row => row.diagnostics['wrong-lot'] > 0));
});

test('a public road below the selected parking face still suppresses overlapping lot paint', () => {
  const index = new RenderedPavementIndex();
  addPlane(index);
  addPlane(index, { height: 299, metadata: { id: '11/road', layer: 'road_surfaces' } });
  const result = buildRouteParkingPaint({ plan: createWalmartGroundPlan(project), samplePavement: sample(index) });
  assert.equal(result.positions.length, 0);
  assert.ok(result.rows.every(row => row.diagnostics['public-road-overlap'] > 0));
});

test('partially streamed support stays retryable and the same plan succeeds after tile arrival', () => {
  const plan = oneRow(createWalmartGroundPlan(project));
  const index = new RenderedPavementIndex();
  const origin = plan.rows[0].origin;
  addPlane(index, { x0: origin.x - 1 });
  const pending = buildRouteParkingPaint({ plan, samplePavement: sample(index) });
  assert.equal(pending.positions.length, 0, 'incomplete strokes are not committed');
  assert.equal(pending.rows[0].status, 'pending');
  assert.equal(pending.retryable, true);
  addPlane(index);
  const ready = buildRouteParkingPaint({ plan, samplePavement: sample(index) });
  finiteBatch(ready);
  assert.equal(ready.rows[0].status, 'ready');
  assert.equal(ready.retryable, false);
});

test('a two-metre discontinuity rejects the whole stroke instead of painting separated decks', () => {
  const plan = oneRow(createWalmartGroundPlan(project));
  const index = new RenderedPavementIndex();
  const cut = plan.rows[0].origin.x - 1.4;
  addPlane(index, { x1: cut, height: 302 });
  addPlane(index, { x0: cut, height: 300 });
  const result = buildRouteParkingPaint({ plan, samplePavement: sample(index) });
  assert.equal(result.positions.length, 0);
  assert.equal(result.rows[0].status, 'blocked');
  assert.ok(result.rows[0].diagnostics['discontinuous-height'] > 0);
});

test('unavailable, nonfinite and throwing samplers never produce nonfinite geometry', () => {
  const plan = createWalmartGroundPlan(project);
  for (const samplePavement of [() => null, () => ({ ...parking, height: NaN, heightSource: 'rendered-pavement-triangle' }), () => { throw new Error('tile unavailable'); }]) {
    const result = buildRouteParkingPaint({ plan, samplePavement });
    assert.equal(result.positions.length, 0);
    assert.equal(result.retryable, true);
  }
  assert.throws(() => createWalmartGroundPlan(() => ({ x: NaN, y: 0 })), /finite/i);
});

test('actual shipped Walmart packed parking can use exact lot ownership without per-lot source ranges', async () => {
  const base = new URL('../city-explorer/data/road-pack/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
  const record = manifest.tiles.find(tile => tile.id === '-3:-4');
  assert.ok(record);
  const decoded = decodeRoadTile(gunzipSync(await readFile(new URL(record.url, base))));
  const index = new PackedRoadSurfaceIndex();
  index.addTile(decoded.id, decoded.groups);
  const plan = createWalmartGroundPlan(project);
  const result = buildRouteParkingPaint({ plan, samplePavement: sample(index) });
  finiteBatch(result);
  assert.equal(result.ready, true, JSON.stringify(result.rows.map(row => row.diagnostics)));
  for (let i = 0; i < result.positions.length; i += 3) {
    const x = result.positions[i], z = result.positions[i + 2];
    assert.equal(plan.containsParking(x, z), true);
    assert.equal(index.sample(x, z)?.layer, 'parking_surfaces');
    assert.equal(index.sample(x, z, null, { includeParking: false }), null);
  }
});

test('the single leafless tree stays on the H1 head and uses a small finite mesh batch', () => {
  const plan = createWalmartGroundPlan(project);
  const { group, status } = createWalmartTreeIsland({ THREE, plan, groundHeight: () => 20 });
  assert.equal(status, 'ready');
  assert.equal(plan.treeIsland.sourceRingIndex, 1);
  assert.equal(plan.containsParking(plan.treeIsland.tree.x, plan.treeIsland.tree.z), false);
  assert.equal(group.children.length, 2, 'one cap surface and one branch instance batch');
  assert.equal(group.userData.collision, false);
  const branches = group.children.find(child => child.isInstancedMesh);
  assert.ok(branches && branches.count > 10 && branches.count < 45);
  assert.ok([...branches.instanceMatrix.array].every(Number.isFinite));
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(branches);
  assert.ok(bounds.min.y >= 19.99 && bounds.max.y <= 28.1);
  assert.ok(bounds.max.x - bounds.min.x < 6);
  assert.equal(group.children.some(child => /crown|foliage|leaves/i.test(child.name)), false);
  const pending = createWalmartTreeIsland({ THREE, plan, groundHeight: () => NaN });
  assert.equal(pending.status, 'pending');
  assert.equal(pending.group, null);
  const lowPower = createWalmartTreeIsland({ THREE, plan, groundHeight: () => 20, lowPower: true });
  assert.equal(lowPower.group.children.length, 2);
  assert.equal(lowPower.group.children.find(child => child.isInstancedMesh).castShadow, false);
});

test('the planted cap is withheld when ground support splits into disconnected grades', () => {
  const plan = createWalmartGroundPlan(project);
  const cut = plan.treeIsland.tree.x;
  const result = createWalmartTreeIsland({ THREE, plan, groundHeight: x => x < cut ? 20 : 23 });
  assert.ok(result.group === null, 'discontinuous cap must not create a group');
  assert.equal(result.status, 'blocked');
  assert.ok(result.diagnostics['discontinuous-ground']);
});
