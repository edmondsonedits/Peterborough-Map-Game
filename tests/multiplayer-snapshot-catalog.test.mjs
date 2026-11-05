import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorerSession } from '../city-explorer/multiplayer/server/src/explorer-room.mjs';
import { createClientRuntime } from '../city-explorer/multiplayer/client-runtime.mjs';
import { PROTOCOL_VERSION } from '../city-explorer/multiplayer/protocol.mjs';

const pose = (overrides = {}) => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0, ...overrides });
const fullVehicle = (overrides = {}) => ({
  id: 'truck_1', templateId: 'pump-v1', entityGeneration: 0, pose: pose({ x: 2, z: 2 }),
  tuning: { length: 10.4, width: 2.55, height: 3.25, wheelbase: 5.65, maximumForwardSpeed: 27.5 },
  dimensions: { length: 10.4, width: 2.55, height: 3.25 }, lights: false, driverPlayerId: null,
  ...overrides,
});
const compactVehicle = (overrides = {}) => {
  const { id, entityGeneration, pose: currentPose, lights, driverPlayerId } = fullVehicle(overrides);
  return { id, entityGeneration, pose: currentPose, lights, driverPlayerId };
};
const snapshot = (overrides = {}) => ({
  protocolVersion: PROTOCOL_VERSION, worldVersion: 'catalog-world-v1', tick: 1, serverTime: 1_000, epoch: 1, ackInputSequence: 0,
  player: { id: 'self', name: 'Player 1', entityGeneration: 0, mode: 'onFoot', vehicleId: null, pose: pose() },
  players: [], vehicles: [fullVehicle()], ...overrides,
});
function makeSession() {
  let now = 1_000;
  const world = { worldVersion: 'catalog-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const room = createExplorerSession({ world, vehicles: [{ ...fullVehicle() }], spawn: () => pose(), clock: () => now });
  const player = room.join({ code: room.roomCode, ip: 'catalog-test' });
  room.attachConnection(player.playerId, 'socket-1');
  return { room, player, world, advance: (ms = 34) => { now += ms; } };
}

test('explicit and reconnect baselines remain full while periodic session ticks omit immutable vehicle metadata', () => {
  const h = makeSession();
  const initial = h.room.snapshotFor(h.player.playerId);
  const baselineVehicle = initial.vehicles[0];
  assert.equal(baselineVehicle.templateId, 'pump-v1');
  assert.ok(baselineVehicle.tuning && baselineVehicle.dimensions);

  const runtime = createClientRuntime({ transport: { sendInput: () => true }, world: h.world, worldVersion: 'catalog-world-v1', playerId: h.player.playerId, clock: () => 1_000 });
  assert.equal(runtime.applySnapshot(initial), true);
  const enterAction = { protocolVersion: PROTOCOL_VERSION, epoch: h.player.epoch, sequence: 1, type: 'enterVehicle', vehicleId: 'truck_1', requestId: 'enter-1' };
  assert.equal(h.room.receive(h.player.playerId, { type: 'action', action: enterAction }).ok, true);
  h.advance();
  let compact = h.room.tick().snapshots[0].snapshot;
  assert.equal(compact.player.mode, 'driving');
  assert.equal('templateId' in compact.vehicles[0], false);
  assert.equal('tuning' in compact.vehicles[0], false);
  assert.equal('dimensions' in compact.vehicles[0], false);
  for (const key of ['id', 'pose', 'entityGeneration', 'driverPlayerId', 'lights']) assert.ok(key in compact.vehicles[0]);
  assert.equal(runtime.applySnapshot(compact), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].templateId, 'pump-v1');
  assert.deepEqual(runtime.latestSnapshot.vehicles[0].tuning, baselineVehicle.tuning);
  assert.deepEqual(runtime.latestSnapshot.vehicles[0].dimensions, baselineVehicle.dimensions);

  const lightAction = { protocolVersion: PROTOCOL_VERSION, epoch: compact.epoch, sequence: 1, type: 'toggleLights', vehicleId: 'truck_1', requestId: 'lights-1' };
  assert.equal(h.room.receive(h.player.playerId, { type: 'action', action: lightAction }).ok, true);
  h.advance(); compact = h.room.tick().snapshots[0].snapshot;
  assert.equal(compact.vehicles[0].lights, true);
  assert.equal(runtime.applySnapshot(compact), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].lights, true);

  const input = { protocolVersion: PROTOCOL_VERSION, epoch: compact.epoch, sequence: 2, mode: 'driving', controls: { forward: 0, strafe: 0, sprint: false, throttle: 1, steering: 0.1, viewYaw: 0 } };
  assert.equal(h.room.receive(h.player.playerId, { type: 'input', input }).ok, true);
  h.advance(); compact = h.room.tick().snapshots[0].snapshot;
  assert.equal(runtime.applySnapshot(compact), true);
  assert.equal(compact.ackInputSequence, 2);
  assert.equal(runtime.latestSnapshot.vehicles[0].entityGeneration, 1);
  assert.equal(runtime.latestSnapshot.vehicles[0].driverPlayerId, h.player.playerId);
  assert.ok(runtime.latestSnapshot.vehicles[0].tuning.maximumForwardSpeed > 0);

  h.room.disconnect(h.player.playerId);
  const resumed = h.room.reconnect({ playerId: h.player.playerId, reconnectCredential: h.player.reconnectCredential });
  h.room.attachConnection(h.player.playerId, 'socket-2');
  const reconnectBaseline = h.room.snapshotFor(h.player.playerId);
  assert.equal(reconnectBaseline.epoch, resumed.epoch);
  assert.ok(reconnectBaseline.vehicles[0].tuning && reconnectBaseline.vehicles[0].dimensions);
  assert.equal(runtime.applySnapshot(reconnectBaseline), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].templateId, 'pump-v1');
  assert.deepEqual(runtime.latestSnapshot.vehicles[0].dimensions, reconnectBaseline.vehicles[0].dimensions);
  runtime.dispose(); h.room.leave(h.player.playerId);
});

test('catalog hydration accepts newer full metadata, rejects stale generations, and prunes absent vehicles', () => {
  const world = { ...makeSession().world };
  const runtime = createClientRuntime({ transport: { sendInput: () => true }, world, worldVersion: 'catalog-world-v1', playerId: 'self', clock: () => 1_000 });
  const initial = snapshot();
  assert.equal(runtime.applySnapshot(initial), true);
  const transitioned = snapshot({ tick: 0, epoch: 2, serverTime: 1_033,
    player: { id: 'self', name: 'Player 1', entityGeneration: 1, mode: 'driving', vehicleId: 'truck_1', pose: pose({ x: 2, z: 2 }) },
    vehicles: [compactVehicle({ entityGeneration: 1, driverPlayerId: 'self', lights: true })],
  });
  assert.equal(runtime.applySnapshot(transitioned), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].templateId, 'pump-v1');
  assert.equal(runtime.latestSnapshot.vehicles[0].tuning.maximumForwardSpeed, 27.5);
  assert.equal(runtime.latestSnapshot.vehicles[0].entityGeneration, 1);
  assert.equal(runtime.latestSnapshot.vehicles[0].lights, true);

  const staleFull = snapshot({ tick: 99, epoch: 1, serverTime: 1_034, vehicles: [fullVehicle({ templateId: 'old-template', tuning: { ...initial.vehicles[0].tuning, maximumForwardSpeed: 9 } })] });
  assert.equal(runtime.applySnapshot(staleFull), false);
  assert.equal(runtime.latestSnapshot.vehicles[0].templateId, 'pump-v1');
  assert.equal(runtime.latestSnapshot.vehicles[0].entityGeneration, 1);

  const newerFull = snapshot({ tick: 1, epoch: 2, serverTime: 1_066,
    player: transitioned.player,
    vehicles: [fullVehicle({ entityGeneration: 2, driverPlayerId: 'self', templateId: 'pump-v2', tuning: { ...initial.vehicles[0].tuning, maximumForwardSpeed: 31 } })],
  });
  assert.equal(runtime.applySnapshot(newerFull), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].templateId, 'pump-v2');
  assert.equal(runtime.latestSnapshot.vehicles[0].tuning.maximumForwardSpeed, 31);

  const absent = snapshot({ tick: 2, epoch: 2, serverTime: 1_099, player: transitioned.player, vehicles: [] });
  assert.equal(runtime.applySnapshot(absent), true);
  assert.deepEqual(runtime.latestSnapshot.vehicles, []);
  const reappearedCompact = snapshot({ tick: 3, epoch: 2, serverTime: 1_132, player: transitioned.player,
    vehicles: [compactVehicle({ entityGeneration: 3, driverPlayerId: 'self' })],
  });
  assert.equal(runtime.applySnapshot(reappearedCompact), true);
  assert.equal('templateId' in runtime.latestSnapshot.vehicles[0], false);
  assert.equal('tuning' in runtime.latestSnapshot.vehicles[0], false);
  assert.equal('dimensions' in runtime.latestSnapshot.vehicles[0], false);
  runtime.dispose();
});

test('rejected catalog metadata does not mutate hydration state', () => {
  const world = { worldVersion: 'catalog-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true }), blocks: () => false };
  const runtime = createClientRuntime({ transport: { sendInput: () => true }, world, worldVersion: world.worldVersion, playerId: 'self', clock: () => 1_000 });
  assert.equal(runtime.applySnapshot(snapshot()), true);
  const malformed = snapshot({ tick: 2, serverTime: 1_033, vehicles: [fullVehicle({ tuning: { maximumForwardSpeed: Infinity } })] });
  assert.equal(runtime.applySnapshot(malformed), false);
  const compact = snapshot({ tick: 3, serverTime: 1_066, vehicles: [compactVehicle()] });
  assert.equal(runtime.applySnapshot(compact), true);
  assert.equal(runtime.latestSnapshot.vehicles[0].tuning.maximumForwardSpeed, 27.5);
  runtime.dispose();
});
