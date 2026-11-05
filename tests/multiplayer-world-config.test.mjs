import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorerWorld } from '../city-explorer/multiplayer/server/src/world-config.mjs';

test('real server config has eight unique collision-free instances and eight finite player spawns', async () => {
  const { world, vehicles, spawn } = await createExplorerWorld();
  assert.equal(vehicles.length, 8);
  assert.equal(new Set(vehicles.map(vehicle => vehicle.id)).size, 8);
  assert.equal(vehicles.filter(vehicle => vehicle.templateId === 'pump-1').length, 4);
  for (const vehicle of vehicles) {
    assert.ok(world.readyAt(vehicle.pose.x, vehicle.pose.z, vehicle.tuning.length / 2));
    assert.equal(world.blocks(vehicle.pose, vehicle.pose, { kind: 'vehicle', dimensions: vehicle.dimensions }), false);
  }
  for (let seat = 1; seat <= 8; seat++) {
    const pose = spawn({ seat, playerId: `test-${seat}` });
    assert.ok([pose.x, pose.y, pose.z, pose.heading].every(Number.isFinite));
    assert.equal(world.blocks(pose, pose, { kind: 'onFoot', dimensions: { length: .7, width: .7, height: 1.8 } }), false);
  }
});

test('server cache retains eight separated road regions and warms a new region after a readiness miss', async () => {
  const { world } = await createExplorerWorld();
  const tiles = world.manifest.roadPack.tiles;
  const points = Array.from({ length: 8 }, (_, i) => tiles[Math.floor((i + .5) * tiles.length / 8)]).map(tile => ({ x: (tile.bounds.minX + tile.bounds.maxX) / 2, z: (tile.bounds.minZ + tile.bounds.maxZ) / 2 }));
  for (const point of points) await world.prefetch(point.x, point.z, 2);
  assert.ok(points.every(point => world.readyAt(point.x, point.z, 2)), 'all eight regions remain ready');
  const target = tiles.find(tile => {
    const x = (tile.bounds.minX + tile.bounds.maxX) / 2, z = (tile.bounds.minZ + tile.bounds.maxZ) / 2, b = world.manifest.bounds;
    return x > b.minX + 200 && x < b.maxX - 200 && z > b.minZ + 200 && z < b.maxZ - 200
      && !points.some(point => point.x >= tile.bounds.minX && point.x <= tile.bounds.maxX && point.z >= tile.bounds.minZ && point.z <= tile.bounds.maxZ);
  });
  const next = { x: (target.bounds.minX + target.bounds.maxX) / 2, z: (target.bounds.minZ + target.bounds.maxZ) / 2 };
  world.readyAt(next.x, next.z, 2);
  const deadline = Date.now() + 8000;
  while (!world.readyAt(next.x, next.z, 2) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.ok(world.readyAt(next.x, next.z, 2), 'readiness miss schedules background prefetch');
  assert.equal(world.lastError, null);
});
