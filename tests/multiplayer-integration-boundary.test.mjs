import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayerIntegration, resolveMultiplayerServerUrl } from '../city-explorer/multiplayer/integration.mjs';
import { createColyseusTransport, resolveColyseusSdk } from '../city-explorer/multiplayer/transport-colyseus.mjs';
import { createExplorerServer } from '../city-explorer/multiplayer/server/src/index.mjs';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function integrationHarness(onEnter = () => {}, transportLeave = async () => true) {
  let callbacks, disconnect, disposed = 0, leaves = 0;
  const uiState = {};
  const stateHandlers = [];
  const parent = { ownerDocument: { createElement: () => ({ textContent: '', remove() {} }) }, append() {} };
  const integration = createMultiplayerIntegration({ parent, pageUrl: 'http://127.0.0.1:4188/?multiplayerServer=http://127.0.0.1:2567',
    roadPackId: () => 'road-build', onEnter, onLeave: () => { leaves++; },
    factories: {
      createRoomUi: ({ callbacks: handlers }) => { callbacks = handlers; return { update(next) { Object.assign(uiState, next); }, dispose() {} }; },
      loadWorldCollision: async () => ({ manifest: { roadPack: { buildId: 'road-build' } }, worldVersion: 'world', stations: [{ anchor: { x: 0, z: 0 } }], prefetch: async () => {} }),
      createTransport: ({ onDisconnect }) => { disconnect = onDisconnect; const room = { playerId: 'player', roomId: 'room' }; return {
        createRoom: async () => room, getSession: () => room, admin: async command => { if (command.type === 'close') disconnect({ reconnecting: false, code: 4002 }); return { ok: true, locked: command.type === 'lock' }; }, leave: transportLeave, dispose() { disposed++; },
      }; },
      createRuntime: ({ transport, onState }) => { stateHandlers.push(onState); return { latestSnapshot: { tick: 1 }, dispose() { transport.dispose(); } }; },
    },
  });
  return { integration, uiState, emitState: (index, state) => stateHandlers[index](state), get callbacks() { return callbacks; }, disconnect: detail => disconnect(detail), get disposed() { return disposed; }, get leaves() { return leaves; } };
}

test('host lock and unlock results update the room control state', async () => {
  const h = integrationHarness();
  await h.callbacks.createRoom();
  assert.equal(h.uiState.locked, false);
  await h.callbacks.admin({ type: 'lock' });
  assert.equal(h.uiState.locked, true);
  await h.callbacks.admin({ type: 'unlock' });
  assert.equal(h.uiState.locked, false);
  await h.callbacks.leaveRoom();
});

test('host close response remains successful after its terminal socket event', async () => {
  const h = integrationHarness();
  await h.callbacks.createRoom();
  assert.deepEqual(await h.callbacks.admin({ type: 'close' }), { ok: true, locked: false });
  assert.equal(h.integration.active, false);
  assert.equal(h.integration.session, null);
});

test('explicit leave keeps the transport socket until HTTP leave confirms', async () => {
  let confirmLeave;
  const h = integrationHarness(() => {}, () => new Promise(resolve => { confirmLeave = resolve; }));
  await h.callbacks.createRoom();
  const pending = h.callbacks.leaveRoom();
  assert.equal(h.integration.active, false);
  assert.equal(h.disposed, 0);
  await h.callbacks.createRoom();
  const newerRoom = h.integration.session;
  h.emitState(0, { snapshot: { player: { id: 'old-player', name: 'Player 1' }, players: [], vehicles: [] }, mode: 'onFoot', vehicleId: null });
  assert.deepEqual(h.uiState.players, []);
  assert.equal(h.integration.session, newerRoom);
  confirmLeave(true);
  assert.deepEqual(await pending, { ok: true });
  assert.equal(h.disposed, 1);
  assert.equal(h.integration.session, newerRoom);
});

test('landmark teleport handler refuses to change mode during multiplayer', async () => {
  const source = await readFile(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
  const start = source.indexOf('function jumpTo(');
  assert.ok(start >= 0);
  let depth = 0, end = -1;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) { end = index + 1; break; }
  }
  const scope = { multiplayer: { active: true }, showToast: () => {}, deferCityNavigation: () => { throw new Error('teleport reached'); } };
  runInNewContext(`${source.slice(start, end)}; jumpTo(44, -78);`, scope);
});

test('terminal disconnect clears multiplayer while recoverable disconnect preserves it', async () => {
  const h = integrationHarness();
  await h.callbacks.createRoom();
  assert.equal(h.integration.active, true);
  h.disconnect({ reconnecting: true });
  assert.equal(h.integration.active, true);
  h.disconnect({ reconnecting: false, reason: 'reservation-window-ended' });
  assert.equal(h.integration.active, false);
  assert.equal(h.integration.session, null);
  assert.equal(h.disposed, 1);
  assert.equal(h.leaves, 1);
});

test('leaving during asynchronous activation invalidates its visual commit', async () => {
  let finish, visualCommitted = false;
  const gate = new Promise(resolve => { finish = resolve; });
  const h = integrationHarness(async ({ isCurrent }) => { await gate; if (isCurrent()) visualCommitted = true; });
  const joining = h.callbacks.createRoom();
  await new Promise(resolve => setImmediate(resolve));
  await h.callbacks.leaveRoom();
  finish();
  await joining;
  assert.equal(visualCommitted, false);
  assert.equal(h.integration.active, false);
  assert.equal(h.integration.session, null);
  assert.equal(h.leaves, 1);
});

test('local override stays on loopback and public endpoint requires HTTPS', () => {
  assert.equal(resolveMultiplayerServerUrl('http://127.0.0.1:4188/city-explorer/', null, 'http://localhost:2567'), 'http://localhost:2567/');
  assert.equal(resolveMultiplayerServerUrl('https://game.example/city-explorer/', null, 'http://localhost:2567'), null);
  assert.throws(() => resolveMultiplayerServerUrl('http://127.0.0.1:4188/', null, 'http://evil.example'), /loopback/);
  assert.throws(() => resolveMultiplayerServerUrl('https://game.example/', 'http://server.example', null), /HTTPS/);
});

test('browser UMD namespace resolves Client before nested ColyseusSDK class', () => {
  class Client {}
  class Nested {}
  assert.equal(resolveColyseusSdk({ Colyseus: { Client, ColyseusSDK: Nested } }).Client, Client);
  assert.equal(resolveColyseusSdk({ Colyseus: { ColyseusSDK: Nested } }).Client, Nested);
});

test('the vendored UMD bundle exposes the namespace used by the browser loader', async () => {
  const source = await readFile(new URL('../city-explorer/multiplayer/vendor/colyseus-sdk-0.18.9.js', import.meta.url), 'utf8');
  const context = {};
  runInNewContext(source, context);
  const sdk = resolveColyseusSdk(context);
  assert.equal(typeof sdk.Client, 'function');
  assert.equal(sdk.Client, context.Colyseus.Client);
});

test('selected room ID is carried with code and mismatched seat is never client-selected', async () => {
  const bodies = [];
  const fetchImpl = async (url, init = {}) => {
    const body = JSON.parse(init.body || '{}'); bodies.push({ path: new URL(url).pathname, body });
    if (new URL(url).pathname === '/api/join') return { ok: false, status: 404, json: async () => ({ error: 'room not found' }) };
    throw new Error('unexpected path');
  };
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client: class {} } });
  await assert.rejects(transport.joinRoom('ABCDEFGH', 'wrong-room'), /room not found/);
  assert.deepEqual(bodies[0].body, { code: 'ABCDEFGH', roomId: 'wrong-room' });
  assert.equal(transport.getSession(), null);
  transport.dispose();
});

test('late transfer result cannot clear a different room admin role', async () => {
  let resolveTransfer;
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname, body = JSON.parse(init.body || '{}');
    const ok = payload => ({ ok: true, status: 200, json: async () => payload });
    if (path === '/api/rooms') return ok({ roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'admin-a' });
    if (path === '/api/join' && body.code === 'ABCDEFGH') return ok({ roomId: 'room-a', playerId: 'a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'a-token', reconnectCredential: 'a-reconnect' });
    if (path === '/api/join' && body.code === 'BCDEFGHJ') return ok({ roomId: 'room-b', playerId: 'b', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'b-token', reconnectCredential: 'b-reconnect', adminCredential: 'admin-b', isAdmin: true });
    if (path === '/api/rooms/room-a/admin') return new Promise(resolve => { resolveTransfer = () => resolve(ok({ ok: true })); });
    if (path === '/api/rooms/room-a/leave') return ok({ ok: true });
    throw new Error(`unexpected path ${path}`);
  };
  class Client { async joinById(id) { const handlers = new Map(); return { connection: {}, onMessage(type, handler) { handlers.set(type, handler); }, onLeave() {}, send(type) { if (type === 'subscribe' && id === 'room-b') handlers.get('admin-credential')?.({ credential: 'admin-b' }); }, async leave() {} }; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  await transport.createRoom();
  const pending = transport.admin({ type: 'transfer', playerId: 'other' });
  await transport.leave();
  await transport.joinRoom('BCDEFGHJ');
  resolveTransfer();await pending;
  assert.equal(transport.getSession().roomId, 'room-b');
  assert.equal(transport.getSession().isAdmin, true);
  transport.dispose();
});

test('successful explicit transfer clears the prior local host role', async () => {
  const ok = payload => ({ ok: true, status: 200, json: async () => payload });
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname;
    if (path === '/api/rooms') return ok({ roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'admin-a' });
    if (path === '/api/join') return ok({ roomId: 'room-a', playerId: 'a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'a-token', reconnectCredential: 'a-reconnect' });
    if (path === '/api/rooms/room-a/admin') return ok({ ok: true });
    throw new Error(`unexpected path ${path}`);
  };
  class Client { async joinById() { return { connection: {}, onMessage() {}, onLeave() {}, send() {}, async leave() {} }; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  await transport.createRoom(); assert.equal(transport.getSession().isAdmin, true);
  await transport.admin({ type: 'transfer', playerId: 'other' });
  assert.equal(transport.getSession().isAdmin, false);
  await assert.rejects(transport.admin({ type: 'lock' }), /admin credential/);
  transport.dispose();
});

test('failed SDK join releases its already allocated HTTP seat', async () => {
  const paths = [], ok = payload => ({ ok: true, status: 200, json: async () => payload });
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname; paths.push(path);
    if (path === '/api/rooms') return ok({ roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'admin-a' });
    if (path === '/api/join') return ok({ roomId: 'room-a', playerId: 'a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'a-token', reconnectCredential: 'a-reconnect' });
    if (path === '/api/rooms/room-a/leave') return ok({ ok: true });
    throw new Error(`unexpected path ${path}`);
  };
  class Client { async joinById() { throw new Error('socket unavailable'); } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  await assert.rejects(transport.createRoom(), /socket unavailable/);
  assert.deepEqual(paths, ['/api/rooms', '/api/join', '/api/rooms/room-a/leave']);
  assert.equal(transport.getSession(), null);
  transport.dispose();
});

for (const [code, reason] of [[4001, 'removed-from-room'], [4002, 'room-closed']]) {
  test(`server close ${code} ends transport immediately without reconnecting`, async () => {
    let leaveHandler; const paths = [], statuses = [], disconnects = [];
    const fetchImpl = async url => {
      const path = new URL(url).pathname; paths.push(path);
      if (path === '/api/join') return { ok: true, status: 201, json: async () => ({ roomId: 'room-a', playerId: 'a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'a-token', reconnectCredential: 'a-reconnect' }) };
      throw new Error(`unexpected request ${path}`);
    };
    class Client { async joinById() { return { connection: {}, onMessage() {}, onLeave(fn) { leaveHandler = fn; }, send() {}, async leave() {} }; } }
    const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client }, onStatus: detail => statuses.push(detail), onDisconnect: detail => disconnects.push(detail) });
    await transport.joinRoom('ABCDEFGH');
    leaveHandler(code);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(statuses.at(-1).status, 'disconnected');
    assert.equal(disconnects.at(-1).reason, reason);
    assert.equal(disconnects.at(-1).reconnecting, false);
    assert.deepEqual(paths, ['/api/join']);
    transport.dispose();
  });
}

test('server rejects a room ID and code mismatch before allocating any seat', async () => {
  const world = { worldVersion: 'fixture', readyAt: () => true, sampleSurface: () => ({ height: 0, ready: true, onRoad: true }), blocks: () => false };
  const app = createExplorerServer({ world, vehicles: [], spawn: () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 }), nodeEnv: 'development' });
  try {
    const address = await app.listen(0, '127.0.0.1'), base = `http://127.0.0.1:${address.port}`;
    const create = async () => (await fetch(`${base}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    const a = await create(), b = await create();
    const response = await fetch(`${base}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: a.roomCode, roomId: b.roomId }) });
    assert.equal(response.status, 404);
    const directory = await (await fetch(`${base}/api/directory`)).json();
    assert.equal(directory.find(room => room.id === a.roomId).count, 0);
    assert.equal(directory.find(room => room.id === b.roomId).count, 0);
  } finally { await app.close(); }
});
