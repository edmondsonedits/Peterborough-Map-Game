import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientRuntime } from '../city-explorer/multiplayer/client-runtime.mjs';
import { createColyseusTransport } from '../city-explorer/multiplayer/transport-colyseus.mjs';
import { PROTOCOL_VERSION } from '../city-explorer/multiplayer/protocol.mjs';
import { stepWalking, stepVehicle, DEFAULT_VEHICLE_TUNING } from '../city-explorer/multiplayer/movement-core.mjs';
import { createExplorerSession } from '../city-explorer/multiplayer/server/src/explorer-room.mjs';

const world = {
  worldVersion: 'fixture-world-v1', readyAt: () => true,
  sampleSurface: () => ({ height: 0, onRoad: true }), blocks: () => false,
};
const pose = (overrides = {}) => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0, ...overrides });
const actor = (overrides = {}) => ({ id: 'self', name: 'Player 1', entityGeneration: 0, mode: 'onFoot', vehicleId: null, pose: pose(), ...overrides });
const snapshot = (overrides = {}) => ({ protocolVersion: PROTOCOL_VERSION, worldVersion: 'fixture-world-v1', tick: 1, serverTime: 1_000, epoch: 1, ackInputSequence: 0, player: actor(), players: [], vehicles: [], ...overrides });
function harness(options = {}) {
  let time = options.time ?? 1_000;
  const sent = [], events = [], transport = {
    sendInput: (input) => { sent.push(input); return true; }, sendAction: (action) => { sent.push(action); return true; },
    canSendInput: () => true, onEvent: null, dispose() { this.disposed = true; },
  };
  const runtime = createClientRuntime({ transport, world: options.world ?? world, playerId: 'self', worldVersion: options.worldVersion ?? 'fixture-world-v1', clock: () => time,
    interpolationDelayMs: options.interpolationDelayMs ?? 0, onEvent: (event) => events.push(event) });
  return { runtime, transport, sent, events, setTime: (value) => { time = value; }, tickTime: (delta = 33.333) => { time += delta; return time; } };
}
function move(state, controls, onFoot = true) {
  let value = { ...state };
  for (let n = 0; n < 2; n += 1) value = onFoot ? stepWalking(value, controls, 1 / 60, world) : stepVehicle(value, controls, 1 / 60, world, DEFAULT_VEHICLE_TUNING);
  return value;
}

test('prediction sends monotonic inputs and advances two shared 60 Hz steps immediately', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot());
  const controls = { forward: 1, strafe: 0, sprint: false, throttle: 0, steering: 0, viewYaw: 0 };
  assert.equal(h.runtime.sendInput(controls), true);
  assert.equal(h.sent[0].sequence, 1);
  assert.equal(h.sent[0].epoch, 1);
  assert.deepEqual(h.runtime.simulationPose, move(pose(), controls));
  assert.equal(h.runtime.getState().pendingInputs, 1);
});

test('snapshot simulation ACK prunes confirmed controls while unconfirmed inputs replay from authority', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot());
  const first = { forward: 1, viewYaw: 0 }, second = { forward: 0, strafe: 1, viewYaw: Math.PI / 2 };
  h.runtime.sendInput(first);
  const predicted = move(pose(), first);
  h.tickTime();
  assert.equal(h.runtime.applySnapshot(snapshot({ tick: 2, serverTime: 1_033, ackInputSequence: 0, player: actor({ pose: pose({ x: 0.005 }) }) })), true);
  assert.deepEqual(h.runtime.simulationPose, move(pose({ x: 0.005 }), first));
  h.runtime.sendInput(second);
  assert.deepEqual(h.runtime.simulationPose, move(move(pose({ x: 0.005 }), first), second));
  h.tickTime();
  assert.equal(h.runtime.applySnapshot(snapshot({ tick: 3, serverTime: 1_066, ackInputSequence: 1, player: actor({ pose: predicted }) })), true);
  assert.equal(h.runtime.getState().pendingInputs, 1);
  assert.deepEqual(h.runtime.simulationPose, move(predicted, second));
  assert.equal(h.events.some((event) => event.type === 'queue-acceptance' && event.simulated === false), false);
});

test('client prediction matches actual server snapshots and simulated input ACKs', () => {
  let now = 2_000, random = 0;
  const serverWorld = { version: 'fixture-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const room = createExplorerSession({ world: serverWorld, spawn: () => pose(), clock: () => now,
    randomToken: ({ length, alphabet }) => alphabet[random++ % alphabet.length].repeat(length) });
  const player = room.join({ code: room.roomCode, ip: 'client-runtime-test' });
  assert.equal(room.attachConnection(player.playerId, 'test-socket'), true);
  const clientTransport = { sendInput(input) { return room.receive(player.playerId, { type: 'input', input }).ok; } };
  const client = createClientRuntime({ transport: clientTransport, world: serverWorld, worldVersion: serverWorld.version, playerId: player.playerId, clock: () => now });
  client.applySnapshot(room.snapshotFor(player.playerId));
  for (const controls of [{ forward: 1, viewYaw: 0 }, { forward: 0.5, strafe: 0.5, sprint: true, viewYaw: 0.8 }, { forward: -1, viewYaw: -1 }]) {
    assert.equal(client.sendInput(controls), true);
    now += 34; room.tick();
    const authoritative = room.snapshotFor(player.playerId);
    assert.equal(authoritative.ackInputSequence, client.getState().pendingInputs ? authoritative.ackInputSequence : client.getState().nextSequence - 1);
    assert.equal(client.applySnapshot(authoritative), true);
    assert.ok(Math.abs(client.simulationPose.x - authoritative.player.pose.x) < 1e-9);
    assert.ok(Math.abs(client.simulationPose.z - authoritative.player.pose.z) < 1e-9);
  }
  client.dispose(); room.leave(player.playerId);
});

test('driving prediction uses snapshot tuning and matches server vehicle movement', () => {
  let now = 3_000, token = 0;
  const serverWorld = { version: 'fixture-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const room = createExplorerSession({ world: serverWorld, vehicles: [{ id: 'truck_1', templateId: 'pump', pose: pose({ x: 2, z: 2 }) }], spawn: () => pose(), clock: () => now,
    randomToken: ({ length, alphabet }) => alphabet[token++ % alphabet.length].repeat(length) });
  const player = room.join({ code: room.roomCode, ip: 'vehicle-prediction-test' }); room.attachConnection(player.playerId, 'test-socket');
  const entered = room.receive(player.playerId, { type: 'action', action: { protocolVersion: PROTOCOL_VERSION, epoch: player.epoch, sequence: 1, type: 'enterVehicle', vehicleId: 'truck_1', requestId: 'enter-1' } });
  assert.equal(entered.ok, true);
  const clientTransport = { sendInput(input) { return room.receive(player.playerId, { type: 'input', input }).ok; } };
  const client = createClientRuntime({ transport: clientTransport, world: serverWorld, worldVersion: serverWorld.version, playerId: player.playerId, clock: () => now });
  client.applySnapshot(room.snapshotFor(player.playerId));
  assert.equal(client.getState().mode, 'driving');
  const controls = { throttle: 1, steering: 0.2, forward: 0, strafe: 0, viewYaw: 0 };
  assert.equal(client.sendInput(controls), true);
  now += 34; room.tick();
  const authoritative = room.snapshotFor(player.playerId);
  assert.equal(authoritative.ackInputSequence, 1);
  assert.equal(client.applySnapshot(authoritative), true);
  assert.ok(Math.abs(client.simulationPose.x - authoritative.player.pose.x) < 1e-9);
  assert.ok(Math.abs(client.simulationPose.z - authoritative.player.pose.z) < 1e-9);
  assert.equal(authoritative.vehicles[0].templateId, 'pump');
  client.dispose(); room.leave(player.playerId);
});

test('duplicate and older ticks are ignored; a new epoch resets sequence and baseline', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot()); h.runtime.sendInput({ forward: 1 });
  assert.equal(h.runtime.applySnapshot(snapshot({ tick: 1 })), false);
  assert.equal(h.runtime.applySnapshot(snapshot({ tick: 0 })), false);
  assert.equal(h.runtime.applySnapshot(snapshot({ epoch: 0, tick: 99, serverTime: 1_001 })), false);
  assert.equal(h.runtime.applySnapshot(snapshot({ epoch: 2, tick: 0, serverTime: 1_001, ackInputSequence: 0, player: actor({ pose: pose({ x: 12 }) }) })), true);
  assert.equal(h.runtime.getState().nextSequence, 1);
  assert.equal(h.runtime.getState().pendingInputs, 0);
  assert.equal(h.runtime.authoritativePose.x, 12);
});

test('world version mismatch closes prediction and emits a mismatch event', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot({ worldVersion: 'other-world-v2' }));
  assert.equal(h.runtime.getState().compatible, false);
  assert.equal(h.runtime.sendInput({ forward: 1 }), false);
  assert.ok(h.events.some((event) => event.type === 'world-version-mismatch'));
});

test('render preview never mutates authoritative or simulation pose', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot()); h.runtime.sendInput({ forward: 1 });
  const simulation = h.runtime.simulationPose;
  h.setTime(1_016); h.runtime.advanceFrame(16);
  assert.deepEqual(h.runtime.simulationPose, simulation);
  assert.ok(h.runtime.renderedPose.z < simulation.z);
  assert.deepEqual(h.runtime.authoritativePose, pose());
});

test('remote actors interpolate through the shortest heading and generation changes reset their buffers', () => {
  const h = harness({ interpolationDelayMs: 0 });
  const remote = (x, heading, generation = 0) => ({ id: 'peer', name: 'Player 2', entityGeneration: generation, mode: 'onFoot', vehicleId: null, pose: pose({ x, heading }) });
  h.runtime.applySnapshot(snapshot({ players: [remote(0, 3.1)] }));
  h.setTime(1_033); h.runtime.applySnapshot(snapshot({ tick: 2, serverTime: 1_033, players: [remote(10, -3.1)] }));
  const mid = h.runtime.sampleRemoteActor('peer', 1_020);
  assert.ok(mid.pose.x > 5 && mid.pose.x < 7);
  assert.ok(Math.abs(mid.pose.heading) > 3);
  h.setTime(1_066); h.runtime.applySnapshot(snapshot({ tick: 3, serverTime: 1_066, players: [remote(20, 0, 1)] }));
  assert.equal(h.runtime.getBufferSizes().players.peer, 1);
  assert.equal(h.runtime.sampleRemote().players.some((entry) => entry.id === 'self'), false);
});

test('remote buffers remain bounded and extrapolate for at most 100 ms before freezing stale', () => {
  const h = harness({ interpolationDelayMs: 0 });
  for (let i = 0; i < 20; i += 1) {
    h.setTime(1_000 + i * 34);
    h.runtime.applySnapshot(snapshot({ tick: i + 1, serverTime: 1_000 + i * 34, players: [{ id: 'peer', name: 'Player 2', entityGeneration: 0, mode: 'onFoot', vehicleId: null, pose: pose({ x: i, vx: 1 }) }] }));
  }
  assert.equal(h.runtime.getBufferSizes().players.peer, 12);
  const latestTime = 1_000 + 19 * 34;
  const extrapolated = h.runtime.sampleRemoteActor('peer', latestTime + 100);
  const frozen = h.runtime.sampleRemoteActor('peer', latestTime + 101);
  assert.equal(extrapolated.stale, false);
  assert.ok(extrapolated.pose.x > 19);
  assert.equal(frozen.stale, true);
  assert.equal(frozen.pose.x, extrapolated.pose.x);
});

test('frame catch-up is capped and requests resync instead of replaying indefinitely', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot());
  h.runtime.advanceFrame(500, { forward: 1 });
  assert.equal(h.sent.length, 5);
  assert.equal(h.runtime.getState().pendingInputs, 0);
  assert.ok(h.events.some((event) => event.type === 'prediction-resync-required'));
});

test('on-foot world streaming pauses motion and requests prefetch outside the simulation tick', async () => {
  let loads = 0;
  const cold = { ...world, readyAt: () => false, prefetch: async () => { loads += 1; } };
  const h = harness({ world: cold }); h.runtime.applySnapshot(snapshot());
  assert.equal(h.runtime.sendInput({ forward: 1 }), false);
  await Promise.resolve();
  assert.equal(h.runtime.getState().pausedForWorld, true);
  assert.equal(h.runtime.simulationPose.z, 0);
  assert.equal(loads, 1);
});

test('dispose clears buffers, blocks further input and closes its transport', () => {
  const h = harness(); h.runtime.applySnapshot(snapshot()); h.runtime.dispose();
  assert.equal(h.runtime.sendInput({ forward: 1 }), false);
  assert.equal(h.runtime.getBufferSizes().players.peer, undefined);
  assert.equal(h.transport.disposed, true);
});

test('transport keeps application credentials in POST bodies, binds creator seat, and subscribes after listeners', async () => {
  const calls = [], messages = [], events = [], sent = [];
  const responses = [
    { roomCode: 'ABCDEFGH', roomId: 'opaque-room', adminCredential: 'admin-secret' },
    { roomCode: 'ABCDEFGH', roomId: 'opaque-room', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'player-secret', reconnectCredential: 'reconnect-secret' },
  ];
  const fetchImpl = async (url, init = {}) => { calls.push({ url: String(url), init }); const value = responses.shift(); return { ok: true, status: 200, json: async () => value }; };
  class Client { constructor(url) { this.url = url; } async joinById(id, options) {
    assert.equal(id, 'opaque-room'); assert.equal(options.playerCredential, 'player-secret');
    const room = { connection: {}, onMessage(type, fn) { messages.push(type); this[`on_${type}`] = fn; }, onLeave(fn) { this.leaveHandler = fn; }, send(type, data) { sent.push(type); assert.ok(messages.includes('snapshot')); assert.ok(messages.includes('admin-credential')); }, leave() {} };
    return room;
  } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  transport.onSnapshot(() => {}); transport.onAdminCredential((credential) => events.push(credential));
  const result = await transport.createRoom();
  assert.deepEqual(result, { roomCode: 'ABCDEFGH', roomId: 'opaque-room', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, isAdmin: true });
  assert.equal(sent[0], 'subscribe');
  assert.equal(JSON.parse(calls[0].init.body).adminCredential, undefined);
  assert.equal(JSON.parse(calls[1].init.body).adminCredential, 'admin-secret');
  assert.ok(calls.every((call) => !call.url.includes('secret')));
  assert.equal(transport.sendInput({ sequence: 1 }), true);
  const grantHandler = events;
  // Listener was installed before subscribe; the application can receive private rotation in memory.
  assert.ok(messages.includes('admin-credential'));
  assert.equal(transport.getSession().isAdmin, true);
  transport.dispose();
});

test('transport labels immediate ACK as queue acceptance rather than simulation confirmation', async () => {
  let queueAck, actionResult, activeRoom;
  const fetchImpl = async (_url, init = {}) => ({ ok: true, status: 200, json: async () => JSON.parse(init.body ?? '{}').code
    ? { roomCode: 'ABCDEFGH', roomId: 'r', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'p', reconnectCredential: 'r' }
    : { roomCode: 'ABCDEFGH', roomId: 'r', adminCredential: 'a' } });
  class Client { async joinById() { activeRoom = { connection: {}, onMessage(type, fn) { if (type === 'ack') this.ack = fn; }, onLeave() {}, send() {}, leave() {} }; return activeRoom; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  transport.onQueueAck((ack) => { queueAck = ack; }); transport.onActionResult((result) => { actionResult = result; }); await transport.createRoom();
  assert.equal(transport.sendInput({ sequence: 1 }), true);
  activeRoom.ack({ ok: true, sequence: 1 });
  assert.deepEqual(queueAck, { ok: true, sequence: 1, simulated: false });
  assert.equal(transport.sendAction({ requestId: 'action-1', sequence: 2 }), true);
  activeRoom.ack({ ok: true, epoch: 2 });
  assert.deepEqual(actionResult, { ok: true, epoch: 2, requestId: 'action-1', completed: true });
  transport.dispose();
});

test('transport enforces the server 60-message window and permits sending after the window expires', async () => {
  let time = 10_000;
  const fetchImpl = async (_url, init = {}) => ({ ok: true, status: 200, json: async () => JSON.parse(init.body ?? '{}').code
    ? { roomCode: 'ABCDEFGH', roomId: 'r', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'p', reconnectCredential: 'r' }
    : { roomCode: 'ABCDEFGH', roomId: 'r', adminCredential: 'a' } });
  class Client { async joinById() { return { connection: {}, onMessage() {}, onLeave() {}, send() {}, leave() {} }; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client }, now: () => time });
  await transport.createRoom();
  for (let sequence = 1; sequence <= 60; sequence += 1) assert.equal(transport.sendInput({ sequence }), true);
  assert.equal(transport.sendInput({ sequence: 61 }), false);
  time += 1_000;
  assert.equal(transport.sendInput({ sequence: 61 }), true);
  transport.dispose();
});

test('unexpected WebSocket leave reconnects once with rotated credentials inside the seat reservation', async () => {
  const requests = [], statuses = []; let leaveHandler, joins = 0, resumed;
  const responses = [
    { roomCode: 'ABCDEFGH', roomId: 'opaque-room', adminCredential: 'admin-secret' },
    { roomCode: 'ABCDEFGH', roomId: 'opaque-room', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'player-1', reconnectCredential: 'reconnect-1' },
    { roomId: 'opaque-room', playerId: 'self', seat: 1, name: 'Player 1', epoch: 2, playerCredential: 'player-2', reconnectCredential: 'reconnect-2' },
  ];
  const fetchImpl = async (url, init = {}) => { requests.push({ url: String(url), init }); return { ok: true, status: 200, json: async () => responses.shift() }; };
  class Client { async joinById(_id, options) {
    joins += 1; assert.equal(options.playerCredential, joins === 1 ? 'player-1' : 'player-2');
    return { connection: {}, onMessage() {}, onLeave(fn) { if (joins === 1) leaveHandler = fn; }, send() {}, leave() {} };
  } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  transport.onStatus((value) => { statuses.push(value); if (value.status === 'connected' && value.resumed) resumed?.(); });
  await transport.createRoom();
  const finished = new Promise((resolve) => { resumed = resolve; });
  leaveHandler(1006);
  await Promise.race([finished, new Promise((_, reject) => setTimeout(() => reject(new Error('reconnect timed out')), 1_000))]);
  assert.equal(joins, 2);
  assert.equal(JSON.parse(requests[2].init.body).reconnectCredential, 'reconnect-1');
  assert.equal(transport.getSession().epoch, 2);
  assert.ok(statuses.some((value) => value.status === 'reconnecting'));
  transport.dispose();
});

test('uses the actual pinned SDK transport socket for the WebSocket backlog guard', async () => {
  let room;
  const fetchImpl = async (_url, init = {}) => ({ ok: true, status: 200, json: async () => JSON.parse(init.body ?? '{}').code
    ? { roomCode: 'ABCDEFGH', roomId: 'r', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'p', reconnectCredential: 'r' }
    : { roomCode: 'ABCDEFGH', roomId: 'r', adminCredential: 'a' } });
  class Client { async joinById() { room = { connection: { transport: { ws: { bufferedAmount: 256 * 1024 + 1 } } }, onMessage() {}, onLeave() {}, send() {}, leave() {} }; return room; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  await transport.createRoom();
  assert.equal(transport.canSendInput(), false);
  room.connection.transport.ws.bufferedAmount = 256 * 1024 - 1;
  assert.equal(transport.canSendInput(), true);
  transport.dispose();
});

test('stale reconnect response cannot overwrite a newly joined room session', async () => {
  let leaveHandler, oldReconnectResolve;
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname, body = init.body ? JSON.parse(init.body) : {};
    requests.push({ path, body });
    if (path === '/api/rooms') return { ok: true, status: 201, json: async () => ({ roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'admin-a' }) };
    if (path === '/api/join' && body.code === 'ABCDEFGH') return { ok: true, status: 201, json: async () => ({ roomCode: 'ABCDEFGH', roomId: 'room-a', playerId: 'player-a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'player-a-token', reconnectCredential: 'player-a-reconnect' }) };
    if (path === '/api/rooms/room-a/reconnect') return new Promise((resolve) => { oldReconnectResolve = () => resolve({ ok: true, status: 200, json: async () => ({ roomId: 'room-a', playerId: 'player-a', seat: 1, name: 'Player 1', epoch: 2, playerCredential: 'player-a-new', reconnectCredential: 'player-a-reconnect-new' }) }); });
    if (path === '/api/rooms/room-a/leave') return { ok: true, status: 200, json: async () => ({ ok: true }) };
    if (path === '/api/join' && body.code === 'BCDEFGHJ') return { ok: true, status: 201, json: async () => ({ roomCode: 'BCDEFGHJ', roomId: 'room-b', playerId: 'player-b', seat: 2, name: 'Player 2', epoch: 4, playerCredential: 'player-b-token', reconnectCredential: 'player-b-reconnect' }) };
    throw new Error(`unexpected request ${path}`);
  };
  class Client { async joinById() { return { connection: {}, onMessage() {}, onLeave(fn) { if (!leaveHandler) leaveHandler = fn; }, send() {}, leave() {} }; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  await transport.createRoom();
  leaveHandler(1006);
  while (!oldReconnectResolve) await new Promise((resolve) => setTimeout(resolve, 0));
  await transport.leave();
  await transport.joinRoom('BCDEFGHJ');
  assert.equal(transport.getSession().roomId, 'room-b');
  oldReconnectResolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(transport.getSession().roomId, 'room-b');
  assert.equal(transport.getSession().epoch, 4);
  assert.ok(requests.some((request) => request.path === '/api/rooms/room-a/reconnect'));
  transport.dispose();
});

test('remote extrapolated pose stays at its final prediction after the 100 ms limit', () => {
  const h = harness({ interpolationDelayMs: 0 });
  const peer = { id: 'peer', name: 'Player 2', entityGeneration: 0, mode: 'onFoot', vehicleId: null, pose: pose({ x: 0, vx: 1 }) };
  h.runtime.applySnapshot(snapshot({ players: [peer] }));
  const before = h.runtime.sampleRemoteActor('peer', 1_090).pose.x;
  const atLimit = h.runtime.sampleRemoteActor('peer', 1_100).pose.x;
  const after = h.runtime.sampleRemoteActor('peer', 1_120).pose.x;
  assert.ok(before <= atLimit && atLimit <= after);
  assert.equal(after, atLimit);
});

test('constant-speed prediction renders without response-time trail and reconciliation eases only its correction', () => {
  const h = harness();
  const driving = actor({ mode: 'driving', vehicleId: 'truck_1', pose: pose({ z: 0, speed: 27, vz: -27 }) });
  h.runtime.applySnapshot(snapshot({ player: driving, vehicles: [{ id: 'truck_1', entityGeneration: 0, driverPlayerId: 'self', pose: driving.pose, tuning: DEFAULT_VEHICLE_TUNING }] }));
  const controls = { throttle: 0, steering: 0, forward: 0, strafe: 0, viewYaw: 0 };
  for (let i = 0; i < 90; i += 1) {
    h.tickTime(1000 / 30); h.runtime.advanceFrame(1000 / 30, controls);
    const authoritativePose = h.runtime.simulationPose;
    h.runtime.applySnapshot(snapshot({ tick: i + 2, serverTime: h.runtime.getState().snapshot.serverTime + 34,
      ackInputSequence: i + 1, player: actor({ mode: 'driving', vehicleId: 'truck_1', pose: authoritativePose }),
      vehicles: [{ id: 'truck_1', entityGeneration: 0, driverPlayerId: 'self', pose: authoritativePose, tuning: DEFAULT_VEHICLE_TUNING }],
    }));
  }
  const uncorrectedTrail = Math.abs(h.runtime.simulationPose.z - h.runtime.renderedPose.z);
  assert.ok(uncorrectedTrail < 0.05, `render trail was ${uncorrectedTrail}m`);

  const preCorrectionRender = h.runtime.renderedPose.z;
  h.tickTime(1000 / 30);
  h.runtime.applySnapshot(snapshot({ tick: 2, serverTime: h.runtime.getState().snapshot.serverTime + 33,
    epoch: 1, ackInputSequence: h.runtime.getState().nextSequence - 1,
    player: actor({ mode: 'driving', vehicleId: 'truck_1', entityGeneration: 0, pose: pose({ x: 0, z: preCorrectionRender - 0.6, speed: 0, vz: 0 }) }),
    vehicles: [{ id: 'truck_1', entityGeneration: 0, driverPlayerId: 'self', pose: pose({ z: preCorrectionRender - 0.6 }), tuning: DEFAULT_VEHICLE_TUNING }],
  }));
  const correctedTarget = h.runtime.simulationPose.z;
  h.tickTime(16); h.runtime.advanceFrame(16);
  const correctionOffset = Math.abs(h.runtime.renderedPose.z - correctedTarget);
  assert.ok(correctionOffset < 0.6 && correctionOffset > 0, `correction offset did not decay: ${correctionOffset}`);
});

test('perfect snapshots arriving mid-render phase do not duplicate the fractional movement preview', () => {
  const stepMs = 1000 / 30, controls = { throttle: 0, steering: 0, forward: 1, strafe: 0, viewYaw: 0 };
  for (const phase of [0.2, 0.5, 0.8]) {
    const h = harness(); h.runtime.applySnapshot(snapshot()); h.runtime.sendInput(controls);
    h.tickTime(stepMs * phase); h.runtime.advanceFrame(stepMs * phase, controls);
    const perfectAuthoritativePose = h.runtime.simulationPose;
    h.tickTime(0.1);
    assert.equal(h.runtime.applySnapshot(snapshot({ tick: 2, serverTime: 1_033, ackInputSequence: 1, player: actor({ pose: perfectAuthoritativePose }) })), true);
    h.tickTime(stepMs * (1 - phase)); h.runtime.advanceFrame(stepMs * (1 - phase), controls);
    const phaseError = Math.hypot(h.runtime.renderedPose.x - h.runtime.simulationPose.x, h.runtime.renderedPose.z - h.runtime.simulationPose.z);
    assert.ok(phaseError < 1e-4, `phase ${phase} introduced ${phaseError}m of false correction`);
  }
});

test('real pinned Colyseus SDK WebSocket drop triggers the credential-rotation reconnect path', async () => {
  const { createExplorerServer } = await import('../city-explorer/multiplayer/server/src/index.mjs');
  const { Client } = await import('../city-explorer/multiplayer/server/node_modules/@colyseus/sdk/build/index.mjs');
  const fixtureWorld = { version: 'fixture-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const app = createExplorerServer({ world: fixtureWorld, vehicles: [], spawn: () => pose(), nodeEnv: 'development' });
  let room, reconnectRequests = 0, connectionStatus;
  const fetchImpl = async (url, init) => { if (new URL(url).pathname.endsWith('/reconnect')) reconnectRequests += 1; return fetch(url, init); };
  class CapturingClient extends Client { async joinById(...args) { room = await super.joinById(...args); return room; } }
  let boundTransport, serverStarted = false;
  try {
    const address = await app.listen(0, '127.0.0.1');
    serverStarted = true;
    // Update the base URL after ephemeral bind; reconnect and room credentials remain inside transport memory.
    boundTransport = createColyseusTransport({ serverUrl: `http://127.0.0.1:${address.port}`, fetchImpl, sdk: { Client: CapturingClient }, maxReconnectMs: 5_000 });
    boundTransport.onStatus((value) => { if (value.status === 'connected' && value.resumed) connectionStatus?.(); });
    await boundTransport.createRoom();
    Object.defineProperty(room.connection.transport.ws, 'bufferedAmount', { configurable: true, value: 256 * 1024 + 1 });
    assert.equal(boundTransport.canSendInput(), false);
    Object.defineProperty(room.connection.transport.ws, 'bufferedAmount', { configurable: true, value: 0 });
    assert.equal(boundTransport.canSendInput(), true);
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    assert.equal(room.reconnection.enabled, false);
    const reconnected = new Promise((resolve) => { connectionStatus = resolve; });
    const dropped = new Promise((resolve) => room.onDrop(() => resolve()));
    const [serverSocket] = app.server.transport.wss.clients;
    assert.ok(serverSocket);
    serverSocket.terminate();
    await Promise.race([dropped, new Promise((_, reject) => setTimeout(() => reject(new Error('SDK did not report WebSocket drop')), 2_000))]);
    await Promise.race([reconnected, new Promise((_, reject) => setTimeout(() => reject(new Error('manual credential reconnect did not complete')), 3_000))]);
    assert.equal(reconnectRequests, 1);
    boundTransport.dispose();
  } finally { boundTransport?.dispose(); if (serverStarted) await app.close(); }
});

test('timed-out Colyseus join cannot hang the reconnect window and a late room is closed', async () => {
  let finishJoin, lateLeaveCalled = false;
  const fetchImpl = async (_url, init = {}) => ({ ok: true, status: 201, json: async () => JSON.parse(init.body ?? '{}').code
    ? { roomCode: 'ABCDEFGH', roomId: 'room-a', playerId: 'self', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'p', reconnectCredential: 'r' }
    : { roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'a' } });
  class Client { joinById() { return new Promise((resolve) => { finishJoin = () => resolve({ connection: {}, onMessage() {}, onLeave() {}, send() {}, leave() { lateLeaveCalled = true; } }); }); } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client }, joinTimeoutMs: 20 });
  await assert.rejects(transport.joinRoom('ABCDEFGH'), /Colyseus join timed out/);
  assert.equal(transport.connected, false);
  finishJoin(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(lateLeaveCalled, true);
  transport.dispose();
});
