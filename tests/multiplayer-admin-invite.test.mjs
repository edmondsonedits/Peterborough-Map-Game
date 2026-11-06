import test from 'node:test';
import assert from 'node:assert/strict';
import { createColyseusTransport } from '../city-explorer/multiplayer/transport-colyseus.mjs';
import { createExplorerServer } from '../city-explorer/multiplayer/server/src/index.mjs';

const fixtureWorld = {
  version: 'admin-invite-fixture-v1',
  readyAt: () => true,
  sampleSurface: () => ({ height: 0, onRoad: true, ready: true }),
  blocks: () => false,
};
const spawn = () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 });

test('admin transfer privately grants the current invite and locked state to the new owner', async () => {
  const { Client } = await import('../city-explorer/multiplayer/server/node_modules/@colyseus/sdk/build/index.mjs');
  const app = createExplorerServer({ world: fixtureWorld, vehicles: [], spawn, nodeEnv: 'development' });
  const transports = [];
  let address;
  try {
    address = await app.listen(0, '127.0.0.1');
    const serverUrl = `http://127.0.0.1:${address.port}`;
    const statusesA = [], statusesB = [], grantsA = [], grantsB = [];
    const makeTransport = (statuses, grants) => {
      const transport = createColyseusTransport({ serverUrl, sdk: { Client }, onStatus: statuses.push.bind(statuses) });
      transport.onAdminCredential((credential, grant) => grants.push({ credential, grant }));
      transports.push(transport);
      return transport;
    };
    const ownerA = makeTransport(statusesA, grantsA);
    const ownerB = makeTransport(statusesB, grantsB);
    const original = await ownerA.createRoom();
    const formerCode = original.roomCode;
    const guestB = await ownerB.joinRoom(formerCode, original.roomId);
    assert.equal(ownerA.getSession().isAdmin, true);
    assert.equal(guestB.isAdmin, false);

    await ownerA.admin({ type: 'lock' });
    const rotated = await ownerA.admin({ type: 'rotate' });
    assert.notEqual(rotated.roomCode, formerCode);
    assert.equal(ownerA.getSession().roomCode, rotated.roomCode);

    const grantB = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for private admin grant')), 3_000);
      ownerB.onAdminCredential((credential, grant) => { clearTimeout(timer); resolve({ credential, grant }); });
    });
    await ownerA.admin({ type: 'transfer', playerId: guestB.playerId });
    const grant = await grantB;
    assert.equal(grant.grant.roomCode, rotated.roomCode);
    assert.equal(grant.grant.locked, true);
    assert.equal(ownerB.getSession().roomCode, rotated.roomCode);
    assert.equal(ownerB.getSession().isAdmin, true);
    assert.equal(ownerA.getSession().isAdmin, false);
    assert.equal(grantsA.length, 0);
    assert.equal(statusesB.at(-1).locked, true);

    await ownerB.admin({ type: 'unlock' });
    const oldCodeResponse = await fetch(`${serverUrl}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: formerCode }) });
    assert.equal(oldCodeResponse.status, 404);
    assert.match((await oldCodeResponse.json()).error, /room not found/i);

    const currentJoin = await fetch(`${serverUrl}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: rotated.roomCode, roomId: original.roomId }) });
    assert.equal(currentJoin.status, 201);
    const newGuest = await currentJoin.json();
    await fetch(`${serverUrl}/api/rooms/${encodeURIComponent(original.roomId)}/leave`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerCredential: newGuest.playerCredential }) });
  } finally {
    await Promise.allSettled(transports.map((transport) => transport.dispose()));
    if (address) await app.close();
  }
});

test('a late admin response cannot overwrite a different transport session', async () => {
  let resolveAdmin;
  const ok = payload => ({ ok: true, status: 200, json: async () => payload });
  const fetchImpl = async (url, init = {}) => {
    const path = new URL(url).pathname, body = JSON.parse(init.body || '{}');
    if (path === '/api/rooms') return ok({ roomCode: 'ABCDEFGH', roomId: 'room-a', adminCredential: 'admin-a' });
    if (path === '/api/join' && body.code === 'ABCDEFGH') return ok({ roomId: 'room-a', playerId: 'a', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'a-token', reconnectCredential: 'a-reconnect' });
    if (path === '/api/rooms/room-a/admin') return new Promise(resolve => { resolveAdmin = () => resolve(ok({ ok: true, roomCode: 'ZZZZZZZZ', locked: false })); });
    if (path === '/api/rooms/room-a/leave') return ok({ ok: true });
    if (path === '/api/join' && body.code === 'BCDEFGHJ') return ok({ roomId: 'room-b', playerId: 'b', seat: 1, name: 'Player 1', epoch: 1, playerCredential: 'b-token', reconnectCredential: 'b-reconnect', roomCode: 'BCDEFGHJ', isAdmin: true, adminCredential: 'admin-b' });
    throw new Error(`unexpected path ${path}`);
  };
  class Client { async joinById(id) { const handlers = new Map(); return { connection: {}, onMessage(type, handler) { handlers.set(type, handler); }, onLeave() {}, send(type) { if (type === 'subscribe' && id === 'room-b') handlers.get('admin-credential')?.({ credential: 'admin-b', roomCode: 'BCDEFGHJ', locked: true }); }, async leave() {} }; } }
  const transport = createColyseusTransport({ serverUrl: 'https://game.example', fetchImpl, sdk: { Client } });
  try {
    await transport.createRoom();
    const pending = transport.admin({ type: 'rotate' });
    await transport.leave();
    await transport.joinRoom('BCDEFGHJ');
    resolveAdmin();
    await pending;
    assert.equal(transport.getSession().roomId, 'room-b');
    assert.equal(transport.getSession().roomCode, 'BCDEFGHJ');
    assert.equal(transport.getSession().isAdmin, true);
  } finally { transport.dispose(); }
});
