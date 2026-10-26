import assert from 'node:assert/strict';
import test from 'node:test';
import { applySherbrookePolePlacement } from '../city-explorer/sherbrooke-pole-placement.js';

const makePlan = () => {
  const keep = { kind: 'pole', id: 'road:keep', x: 1, z: 2, size: 9.3, yaw: 0.4 };
  const move = { kind: 'pole', id: 'road:move', x: 3, z: 4, size: 9.3, yaw: 0.8 };
  const drop = { kind: 'pole', id: 'road:drop', x: 5, z: 6, size: 9.3, yaw: 1.2 };
  const other = { kind: 'tree', id: 'road:tree', x: 7, z: 8 };
  const wires = [
    { a: keep, b: move, nx: 0, nz: 1 },
    { a: move, b: drop, nx: 1, nz: 0 },
    { a: keep, b: other, nx: 0, nz: -1 },
  ];
  return { plan: { features: [keep, move, drop, other], wires }, keep, move, drop, other, wires };
};

test('moves existing pole objects so attached wire endpoints follow and removes wires incident to suppressed poles', () => {
  const { plan, keep, move, drop, other, wires } = makePlan();
  const calls = [];
  const unrelatedWire = wires[2];
  const stats = applySherbrookePolePlacement(plan, (pole) => {
    calls.push(pole.id);
    if (pole === move) return { x: 30, z: 40 };
    if (pole === drop) return null;
    return pole;
  });

  assert.deepEqual(calls, ['road:keep', 'road:move', 'road:drop']);
  assert.deepEqual(stats, { checked: true, requested: 3, kept: 2, moved: 1, suppressed: 1 });
  assert.deepEqual([move.x, move.z, move.size, move.yaw], [30, 40, 9.3, 0.8]);
  assert.deepEqual(plan.features, [keep, move, other]);
  assert.equal(plan.wires.length, 2);
  assert.equal(plan.wires[0], wires[0]);
  assert.equal(plan.wires[0].b, move);
  assert.equal(plan.wires[0].b.x, 30);
  assert.equal(plan.wires[1], unrelatedWire, 'unrelated wire remains intact');
});

test('copies valid lamp aiming metadata onto the existing pole without changing its mast yaw or wire endpoint', () => {
  const { plan, move, wires } = makePlan();
  const stats = applySherbrookePolePlacement(plan, (pole) => pole === move
    ? { x: 30, z: 40, armDirection: { x: 0.6, z: 0.8 }, armLength: 5.5 }
    : pole);

  assert.equal(stats.moved, 1);
  assert.deepEqual([move.x, move.z, move.yaw], [30, 40, 0.8]);
  assert.equal(wires[0].b, move, 'the wire still references the mutated pole object');
  assert.deepEqual([wires[0].b.x, wires[0].b.z], [30, 40]);
  assert.equal(move.lampYaw, Math.atan2(0.6, 0.8));
  assert.equal(move.lampReach, 5.5);
});

test('omitting the resolver preserves all plan positions and wires', () => {
  const { plan, keep, move, drop, wires } = makePlan();
  const stats = applySherbrookePolePlacement(plan);
  assert.deepEqual(stats, { checked: false, requested: 3, kept: 3, moved: 0, suppressed: 0 });
  assert.deepEqual(plan.features.slice(0, 3), [keep, move, drop]);
  assert.deepEqual(plan.wires, wires);
  assert.deepEqual([move.x, move.z], [3, 4]);
  assert.equal('lampYaw' in move, false);
  assert.equal('lampReach' in move, false);
});

test('suppresses invalid resolver coordinates instead of keeping an unsafe anchor', () => {
  const { plan, keep, move, drop, other } = makePlan();
  const stats = applySherbrookePolePlacement(plan, (pole) => pole === move ? { x: Number.NaN, z: 3 } : pole);
  assert.deepEqual(stats, { checked: true, requested: 3, kept: 2, moved: 0, suppressed: 1 });
  assert.deepEqual(plan.features, [keep, drop, other]);
  assert.ok(plan.wires.every((wire) => wire.a !== move && wire.b !== move));
});
