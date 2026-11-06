import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorerSession } from '../city-explorer/multiplayer/server/src/explorer-room.mjs';

function harness({ ready = true, vehicleSpeed = 0, spawnSpeed = 0 } = {}) {
  let now = 1_000;
  let tokenCall = 0;
  const world = {
    version: 'fixture-world-v1',
    readyAt: () => ready,
    sampleSurface: () => ({ height: 0, onRoad: true, ready }),
    blocks: () => false,
  };
  const vehicles = [
    { id: 'truck_1', entityGeneration: 0, pose: { x: 2, y: 0, z: 2, heading: 0, vx: 0, vz: vehicleSpeed, speed: vehicleSpeed, steering: 0 } },
    { id: 'truck_2', entityGeneration: 0, pose: { x: 30, y: 0, z: 30, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 } },
  ];
  const room = createExplorerSession({
    world,
    vehicles,
    spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: spawnSpeed, speed: spawnSpeed, steering: 0 }),
    clock: () => now,
    randomToken: ({ length, alphabet }) => {
      const char = alphabet[(tokenCall++ % alphabet.length)];
      return char.repeat(length);
    },
  });
  return { room, world, vehicles, setTime: (next) => { now = next; } };
}

function input(epoch, sequence, overrides = {}) {
  return {
    type: 'input',
    input: {
      protocolVersion: 1, epoch, sequence, mode: 'onFoot',
      controls: { forward: 0, strafe: 0, sprint: false, throttle: 0, steering: 0, viewYaw: 0, ...overrides },
    },
  };
}

function action(player, sequence, type, vehicleId, requestId) {
  return { type: 'action', action: { protocolVersion: 1, epoch: player.epoch, sequence, type, vehicleId, requestId } };
}

test('creates scoped credentials and public metadata without exposing the join code or secrets', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.match(room.roomCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.equal(new Set([room.adminCredential, player.playerCredential, player.reconnectCredential]).size, 3);
  const directory = room.getDirectory();
  assert.deepEqual(Object.keys(directory).sort(), ['capacity', 'count', 'id', 'locked', 'name']);
  assert.equal(directory.id, room.roomId);
  assert.notEqual(directory.id, room.roomCode);
  assert.equal(JSON.stringify(directory).includes(room.roomCode), false);
  assert.equal(JSON.stringify(directory).includes(room.adminCredential), false);
  assert.equal(JSON.stringify(directory).includes(player.playerCredential), false);
  const snapshot = JSON.stringify(room.snapshotFor(player.playerId));
  assert.equal(snapshot.includes(room.roomCode), false);
  assert.equal(snapshot.includes(room.adminCredential), false);
  assert.equal(snapshot.includes(player.reconnectCredential), false);
});

test('rejects invalid room codes and blocks joins after administrative lock', () => {
  const { room } = harness();
  assert.throws(() => room.join({ code: 'BADCODE0', ip: '198.51.100.2' }), /code|room/i);
  assert.throws(() => room.command('wrong-admin-token', { type: 'lock' }), /admin|credential|unauthorized/i);
  room.command(room.adminCredential, { type: 'lock' });
  assert.throws(() => room.join({ code: room.roomCode, ip: '198.51.100.3' }), /locked/i);
});

test('assigns eight server names and rejects a ninth participant', () => {
  const { room } = harness();
  const players = Array.from({ length: 8 }, () => room.join({ code: room.roomCode, ip: '127.0.0.1' }));
  assert.deepEqual(players.map((player) => player.name), Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`));
  assert.throws(() => room.join({ code: room.roomCode, ip: '127.0.0.1' }), /full|capacity/i);
});

test('reconnect requires its secret, rotates credentials, increments epoch, and rejects duplicate live admission', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.throws(() => room.reconnect({ playerId: player.playerId, reconnectCredential: player.playerId }), /credential|reconnect|unauthorized/i);
  assert.throws(() => room.reconnect({ playerId: player.playerId, reconnectCredential: player.reconnectCredential }), /connected|already/i);
  room.disconnect(player.playerId);
  const returned = room.reconnect({ playerId: player.playerId, reconnectCredential: player.reconnectCredential });
  assert.equal(returned.seat, player.seat);
  assert.equal(returned.name, player.name);
  assert.equal(returned.epoch, player.epoch + 1);
  assert.notEqual(returned.playerCredential, player.playerCredential);
  assert.notEqual(returned.reconnectCredential, player.reconnectCredential);
  assert.equal(room.authenticatePlayer(player.playerCredential), null);
});

test('kick revokes player credentials before releasing the seat', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  room.command(room.adminCredential, { type: 'kick', playerId: player.playerId });
  assert.equal(room.authenticatePlayer(player.playerCredential), null);
  const next = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(next.seat, player.seat);
  assert.throws(() => room.reconnect({ playerId: player.playerId, reconnectCredential: player.reconnectCredential }), /unknown|expired|credential/i);
});

test('30 Hz ticks consume queued inputs in order and acknowledge only simulated sequences', () => {
  const { room, setTime } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, input(player.epoch, 1, { forward: 0 })).ok, true);
  assert.equal(room.receive(player.playerId, input(player.epoch, 2, { forward: 1 })).ok, true);
  assert.equal(room.receive(player.playerId, input(player.epoch, 3, { forward: 0 })).ok, true);
  setTime(1_034);
  room.tick();
  assert.equal(room.snapshotFor(player.playerId).ackInputSequence, 1);
  setTime(1_067);
  room.tick();
  assert.equal(room.snapshotFor(player.playerId).ackInputSequence, 2);
  const movedZ = room.snapshotFor(player.playerId).player.pose.z;
  assert.ok(movedZ < 0);
  setTime(1_100);
  room.tick();
  const snapshot = room.snapshotFor(player.playerId);
  assert.equal(snapshot.ackInputSequence, 3);
  assert.ok(snapshot.player.pose.z < movedZ);
  assert.equal(snapshot.protocolVersion, 1);
  assert.equal(snapshot.worldVersion, 'fixture-world-v1');
  assert.equal(snapshot.tick, 3);
});

test('bounds the per-player input queue and rejects overflow without consuming the sequence', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  for (let seq = 1; seq <= 8; seq += 1) assert.equal(room.receive(player.playerId, input(player.epoch, seq)).ok, true);
  assert.equal(room.receive(player.playerId, input(player.epoch, 9)).ok, false);
});

test('rejects stale epochs, repeated sequences, invalid protocol messages, and message spam', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, input(player.epoch + 1, 1)).ok, false);
  assert.equal(room.receive(player.playerId, input(player.epoch, 1)).ok, true);
  assert.equal(room.receive(player.playerId, input(player.epoch, 1)).ok, false);
  assert.equal(room.receive(player.playerId, input(player.epoch, 2, { viewYaw: 3.5 })).ok, false);
  const payload = { type: 'input', input: { ...input(player.epoch, 2).input, junk: 'x'.repeat(20_000) } };
  assert.equal(room.receive(player.playerId, payload).ok, false);
  for (let seq = 2; seq <= 80; seq += 1) room.receive(player.playerId, input(player.epoch, seq));
  assert.equal(room.receive(player.playerId, input(player.epoch, 81)).ok, false);
});

test('not-ready world data forces an explicit stopped state', () => {
  const { room, setTime } = harness({ ready: false, vehicleSpeed: 3, spawnSpeed: 2 });
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const peer = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  setTime(1_034);
  room.tick();
  const snapshot = room.snapshotFor(peer.playerId);
  assert.equal(snapshot.player.pose.vx, 0);
  assert.equal(snapshot.player.pose.vz, 0);
  assert.equal(snapshot.vehicles[0].pose.speed, 0);
  assert.equal(snapshot.vehicles[0].pose.vx, 0);
  assert.equal(room.isReady(), false);
  assert.ok(player.playerId);
});

test('vehicle command replay is rejected and remote vehicle entry cannot teleport', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, action(player, 1, 'enterVehicle', 'truck_2', 'enter-remote')).ok, false);
  assert.equal(room.snapshotFor(player.playerId).player.vehicleId, null);
  const enter = action(player, 2, 'enterVehicle', 'truck_1', 'enter-near');
  assert.equal(room.receive(player.playerId, enter).ok, true);
  assert.equal(room.receive(player.playerId, enter).ok, false);
});

test('vehicle transitions clear old inputs and reset epoch and entity generation', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, input(player.epoch, 1, { forward: 1 })).ok, true);
  const entered = room.receive(player.playerId, action(player, 2, 'enterVehicle', 'truck_1', 'transition-enter'));
  assert.equal(entered.ok, true);
  assert.equal(entered.epoch, player.epoch + 1);
  assert.equal(entered.entityGeneration, 1);
  const snapshot = room.snapshotFor(player.playerId);
  assert.equal(snapshot.epoch, entered.epoch);
  assert.equal(snapshot.ackInputSequence, 0);
  assert.equal(snapshot.player.mode, 'driving');
  assert.equal(snapshot.player.entityGeneration, 1);
  assert.equal(room.receive(player.playerId, input(player.epoch, 3, { forward: 1 })).ok, false);
});

test('admin transfer rotates credentials and code rotation preserves independent room id', () => {
  const { room } = harness();
  const first = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const second = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const oldAdmin = room.adminCredential;
  const roomId = room.roomId;
  room.command(oldAdmin, { type: 'transfer', playerId: second.playerId });
  assert.notEqual(room.adminCredential, oldAdmin);
  assert.throws(() => room.command(oldAdmin, { type: 'lock' }), /admin|credential|unauthorized/i);
  const grant = room.takePrivateEvents(second.playerId).find((event) => event.type === 'admin-credential');
  assert.ok(grant?.credential);
  room.command(grant.credential, { type: 'lock' });
  assert.throws(() => room.command(oldAdmin, { type: 'kick', playerId: second.playerId }), /admin|credential|unauthorized/i);
  const oldCode = room.roomCode;
  const rotated = room.command(grant.credential, { type: 'rotate' });
  assert.notEqual(rotated.roomCode, oldCode);
  assert.equal(room.roomId, roomId);
  assert.equal(room.getDirectory().id, roomId);
  assert.throws(() => room.join({ code: oldCode, ip: '127.0.0.1' }), /code|room/i);
  room.command(grant.credential, { type: 'kick', playerId: second.playerId });
  assert.throws(() => room.command(grant.credential, { type: 'unlock' }), /admin|credential|unauthorized/i);
  const nextGrant = room.takePrivateEvents(first.playerId).find((event) => event.type === 'admin-credential');
  assert.ok(nextGrant?.credential);
  room.command(nextGrant.credential, { type: 'unlock' });
});

test('admin reservation expiry transfers and grants only to an eligible connected player', () => {
  const { room, setTime } = harness();
  const host = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const admin = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const oldAdmin = room.adminCredential;
  room.command(oldAdmin, { type: 'transfer', playerId: admin.playerId });
  const adminCredential = room.takePrivateEvents(admin.playerId).find((event) => event.type === 'admin-credential').credential;
  room.disconnect(admin.playerId);
  setTime(31_001);
  room.tick();
  assert.throws(() => room.command(adminCredential, { type: 'lock' }), /admin|credential|unauthorized/i);
  const grant = room.takePrivateEvents(host.playerId).find((event) => event.type === 'admin-credential');
  assert.ok(grant?.credential);
  room.command(grant.credential, { type: 'lock' });
});

test('disconnect safely parks a moving vehicle and empty sessions expire', () => {
  const { room, setTime } = harness({ vehicleSpeed: 4 });
  const first = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const second = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(first.playerId, action(first, 1, 'enterVehicle', 'truck_1', 'drive-before-disconnect')).ok, true);
  room.disconnect(first.playerId);
  const vehicle = room.snapshotFor(second.playerId).vehicles.find((entry) => entry.id === 'truck_1');
  assert.equal(vehicle.pose.speed, 0);
  assert.equal(vehicle.pose.vx, 0);
  assert.equal(vehicle.pose.vz, 0);
  room.leave(second.playerId);
  setTime(40_000);
  assert.equal(room.tick().disposed, true);
});

test('stale braking cannot cross through zero into reverse', () => {
  const { room, setTime } = harness({ vehicleSpeed: 0.1 });
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, action(player, 1, 'enterVehicle', 'truck_1', 'enter-stop')).ok, true);
  setTime(1_300);
  room.tick();
  const pose = room.snapshotFor(player.playerId).player.pose;
  assert.equal(pose.speed, 0);
  assert.equal(pose.vx, 0);
  assert.equal(pose.vz, 0);
});



test('Colyseus SDK connects two clients and receives authoritative snapshots over WebSocket', async () => {
  const { createExplorerServer } = await import('../city-explorer/multiplayer/server/src/index.mjs');
  const { Client } = await import('../city-explorer/multiplayer/server/node_modules/@colyseus/sdk/build/index.mjs');
  const fixtureWorld = {
    version: 'fixture-world-v1',
    readyAt: () => true,
    sampleSurface: () => ({ height: 0, onRoad: true, ready: true }),
    blocks: () => false,
  };
  const app = createExplorerServer({
    world: fixtureWorld,
    vehicles: [{ id: 'fixture_truck', templateId: 'pump', entityGeneration: 0, pose: { x: 2, y: 0, z: 2, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 } }],
    spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 }),
    nodeEnv: 'development',
  });
  let firstRoom;
  let secondRoom;
  try {
    const address = await app.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createResponse = await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json();
    const listingResponse = await fetch(`${baseUrl}/api/directory`);
    const listing = await listingResponse.json();
    assert.deepEqual(Object.keys(listing[0]).sort(), ['capacity', 'count', 'id', 'locked', 'name']);
    assert.equal(listing[0].id, created.roomId);
    assert.equal(JSON.stringify(listing).includes(created.roomCode), false);
    assert.equal(JSON.stringify(listing).includes(created.adminCredential), false);
    const join = async () => {
      const response = await fetch(`${baseUrl}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: created.roomCode }) });
      assert.equal(response.status, 201);
      return response.json();
    };
    const first = await join();
    const second = await join();
    assert.equal(first.roomId, created.roomId);
    assert.equal(second.roomId, created.roomId);
    assert.equal(listing[0].id, first.roomId);
    const clientA = new Client(baseUrl);
    const clientB = new Client(baseUrl);
    firstRoom = await clientA.joinById(first.roomId, { playerCredential: first.playerCredential });
    secondRoom = await clientB.joinById(second.roomId, { playerCredential: second.playerCredential });

    const peerSnapshot = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for authoritative peer snapshot')), 3_000);
      secondRoom.onMessage('snapshot', (snapshot) => {
        if (snapshot.players.some((player) => player.id === first.playerId)) {
          clearTimeout(timeout);
          resolve(snapshot);
        }
      });
    secondRoom.send('subscribe', {});
    });
    firstRoom.send('input', { input: {
      protocolVersion: 1, epoch: first.epoch, sequence: 1, mode: 'onFoot',
      controls: { forward: 1, strafe: 0, sprint: false, throttle: 0, steering: 0, viewYaw: 0 },
    } });
    const snapshot = await peerSnapshot;
    assert.equal(snapshot.protocolVersion, 1);
    assert.equal(snapshot.player.id, second.playerId);
    assert.equal(snapshot.players.length, 1);
    assert.equal(snapshot.vehicles[0].id, 'fixture_truck');
    assert.equal(snapshot.vehicles[0].templateId, 'pump');
    assert.equal(snapshot.vehicles[0].tuning.length, 10.4);
    assert.equal(snapshot.vehicles[0].lights, false);
    firstRoom.onMessage('ack', () => {});
    firstRoom.onMessage('snapshot', () => {});
    firstRoom.send('subscribe', {});
    const ackSnapshot = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for exact input ACK')), 3_000);
      firstRoom.onMessage('snapshot', (value) => {
        if (value.ackInputSequence === 1) {
          clearTimeout(timeout);
          resolve(value);
        }
      });
    });
    const acked = await ackSnapshot;
    assert.equal(acked.ackInputSequence, 1);
    assert.ok(acked.player.pose.z < 0);
  } finally {
    await Promise.allSettled([firstRoom?.leave(), secondRoom?.leave()]);
    await app.close();
  }
});



test('accepts twelve vehicle instances with repeated visual template ids', () => {
  const { world } = harness();
  const vehicles = Array.from({ length: 12 }, (_, index) => ({
    id: `truck_${index + 1}`, templateId: 'pump-template', entityGeneration: 0,
    pose: { x: index * 4, y: 0, z: 20, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 },
  }));
  const room = createExplorerSession({ world, vehicles, spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 }) });
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.snapshotFor(player.playerId).vehicles.length, 12);
  assert.ok(room.snapshotFor(player.playerId).vehicles.every((vehicle) => vehicle.templateId === 'pump-template' && vehicle.tuning.length > 0 && vehicle.lights === false));
  assert.equal(new Set(room.snapshotFor(player.playerId).vehicles.map((vehicle) => vehicle.id)).size, 12);
});
test('initial administrator credential binds only the creator seat and transfers on reservation expiry', () => {
  const { room, setTime } = harness();
  const stranger = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const creatorCredential = room.adminCredential;
  const creator = room.join({ code: room.roomCode, ip: '127.0.0.1', adminCredential: creatorCredential });
  room.disconnect(creator.playerId);
  setTime(31_001);
  room.tick();
  assert.throws(() => room.command(creatorCredential, { type: 'lock' }), /admin|credential|unauthorized/i);
  const grant = room.takePrivateEvents(stranger.playerId).find((event) => event.type === 'admin-credential');
  assert.ok(grant?.credential);
  room.command(grant.credential, { type: 'lock' });
});
test('admin credential remains pending for an HTTP-joined successor until SDK socket subscribes', async () => {
  const { createExplorerServer } = await import('../city-explorer/multiplayer/server/src/index.mjs');
  const { Client } = await import('../city-explorer/multiplayer/server/node_modules/@colyseus/sdk/build/index.mjs');
  const fixtureWorld = { version: 'fixture-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const app = createExplorerServer({
    world: fixtureWorld,
    vehicles: [],
    spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 }),
    nodeEnv: 'development',
  });
  let room;
  try {
    const address = await app.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createdResponse = await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const created = await createdResponse.json();
    const join = async (extra = {}) => {
      const response = await fetch(`${baseUrl}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: created.roomCode, ...extra }) });
      assert.equal(response.status, 201);
      return response.json();
    };
    const creator = await join({ adminCredential: created.adminCredential });
    const successor = await join();
    const transferResponse = await fetch(`${baseUrl}/api/rooms/${created.roomId}/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: created.adminCredential, command: { type: 'transfer', playerId: successor.playerId } }) });
    assert.equal(transferResponse.status, 200);

    const client = new Client(baseUrl);
    room = await client.joinById(created.roomId, { playerCredential: successor.playerCredential });
    const credentialEvent = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('timed out waiting for pending private admin credential')), 2_000);
      room.onMessage('admin-credential', ({ credential }) => {
        clearTimeout(timeout);
        resolve(credential);
      });
    });
    room.onMessage('snapshot', () => {});
    room.send('subscribe', {});
    const successorCredential = await credentialEvent;
    assert.ok(successorCredential);
    const oldAdminResponse = await fetch(`${baseUrl}/api/rooms/${created.roomId}/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: created.adminCredential, command: { type: 'lock' } }) });
    assert.equal(oldAdminResponse.status, 400);
    const newAdminResponse = await fetch(`${baseUrl}/api/rooms/${created.roomId}/admin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: successorCredential, command: { type: 'lock' } }) });
    assert.equal(newAdminResponse.status, 200);
    assert.ok(creator.playerId);
  } finally {
    await room?.leave();
    await app.close();
  }
});
test('HTTP join endpoint rate-limits invalid code attempts before room lookup', async () => {
  const { createExplorerServer } = await import('../city-explorer/multiplayer/server/src/index.mjs');
  const fixtureWorld = { version: 'fixture-world-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true, ready: true }), blocks: () => false };
  const app = createExplorerServer({ world: fixtureWorld, vehicles: [], spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 }), nodeEnv: 'development' });
  try {
    const address = await app.listen(0, '127.0.0.1');
    const url = `http://127.0.0.1:${address.port}/api/join`;
    const statuses = [];
    for (let index = 0; index < 13; index += 1) {
      const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: `INVALID${index}` }) });
      statuses.push(response.status);
    }
    assert.deepEqual(statuses.slice(0, 12), Array(12).fill(404));
    assert.equal(statuses[12], 429);
  } finally {
    await app.close();
  }
});
test('vehicle snapshots expose template tuning dimensions and live lights state', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const entered = room.receive(player.playerId, action(player, 1, 'enterVehicle', 'truck_1', 'enter-lights'));
  const driver = { ...player, epoch: entered.epoch };
  assert.equal(room.receive(player.playerId, action(driver, 1, 'toggleLights', 'truck_1', 'toggle-lights')).ok, true);
  const truck = room.snapshotFor(player.playerId).vehicles.find((vehicle) => vehicle.id === 'truck_1');
  assert.equal(truck.tuning.length, 10.4);
  assert.deepEqual(truck.dimensions, { length: 10.4, width: 2.55, height: 3.25 });
  assert.equal(truck.lights, true);
});
test('reconnecting creator rotates and privately reissues admin credential only to that owner', () => {
  const { room } = harness();
  const adminCredential = room.adminCredential;
  const creator = room.join({ code: room.roomCode, ip: '127.0.0.1', adminCredential });
  const other = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  room.disconnect(creator.playerId);
  const reconnected = room.reconnect({ playerId: creator.playerId, reconnectCredential: creator.reconnectCredential });
  assert.throws(() => room.command(adminCredential, { type: 'lock' }), /admin|credential|unauthorized/i);
  const grant = room.takePrivateEvents(creator.playerId).find((event) => event.type === 'admin-credential');
  assert.ok(grant?.credential);
  assert.deepEqual(room.takePrivateEvents(other.playerId), []);
  room.command(grant.credential, { type: 'lock' });
  assert.equal(reconnected.playerId, creator.playerId);
});

test('vehicle-list selection boards a distant parked vehicle while E-key entry remains proximity bound', () => {
  const { room } = harness();
  const player = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(player.playerId, action(player, 1, 'enterVehicle', 'truck_2', 'remote-e')).ok, false);
  const result = room.receive(player.playerId, action(player, 2, 'selectVehicle', 'truck_2', 'remote-list'));
  assert.equal(result.ok, true);
  const snapshot = room.snapshotFor(player.playerId);
  assert.equal(snapshot.player.vehicleId, 'truck_2');
  assert.equal(snapshot.player.mode, 'driving');
  assert.equal(snapshot.player.pose.x, 30);
  assert.equal(snapshot.player.pose.z, 30);
  assert.equal(snapshot.epoch, player.epoch + 1);
  assert.equal(snapshot.ackInputSequence, 0);
  assert.equal(snapshot.vehicles.find(v => v.id === 'truck_2').driverPlayerId, player.playerId);
  assert.equal(room.receive(player.playerId, action(player, 3, 'selectVehicle', 'truck_1', 'stale-list')).ok, false);
});

test('vehicle-list transfer is atomic at any distance and stops the abandoned vehicle', () => {
  const { room } = harness({ vehicleSpeed: 4 });
  const first = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  const second = room.join({ code: room.roomCode, ip: '127.0.0.1' });
  assert.equal(room.receive(first.playerId, action(first, 1, 'enterVehicle', 'truck_1', 'board')).ok, true);
  const epoch = room.snapshotFor(first.playerId).epoch;
  assert.equal(room.receive(first.playerId, action({ ...first, epoch }, 1, 'selectVehicle', 'truck_2', 'remote-transfer')).ok, true);
  const snapshot = room.snapshotFor(first.playerId);
  assert.equal(snapshot.player.vehicleId, 'truck_2');
  const old = snapshot.vehicles.find(v => v.id === 'truck_1');
  assert.equal(old.driverPlayerId, null);
  assert.equal(old.pose.speed, 0);
  assert.equal(old.pose.vx, 0);
  assert.equal(old.pose.vz, 0);
  assert.equal(snapshot.vehicles.find(v => v.id === 'truck_2').driverPlayerId, first.playerId);
  assert.equal(room.receive(second.playerId, action(second, 1, 'selectVehicle', 'truck_2', 'occupied')).ok, false);
  assert.equal(room.snapshotFor(second.playerId).player.vehicleId, null);
  assert.equal(room.receive(second.playerId, action(second, 2, 'enterVehicle', 'truck_1', 'nearby-e')).ok, true);
});
