import test from 'node:test';
import assert from 'node:assert/strict';
import { createExplorerSession } from '../city-explorer/multiplayer/server/src/explorer-room.mjs';

const pose = () => ({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 });
function sessionHarness(pendingAttachmentMs = 10_000) {
  let time = 1_000;
  let token = 0;
  const session = createExplorerSession({
    world: { version: 'pending-attach-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true }), blocks: () => false },
    spawn: pose,
    clock: () => time,
    pendingAttachmentMs,
    randomToken: ({ length, alphabet }) => alphabet[(token++ % alphabet.length)].repeat(length),
  });
  return { session, setTime: (next) => { time = next; } };
}

test('pending initial join is released on its deadline and cannot attach late', () => {
  const { session, setTime } = sessionHarness();
  const adminCredential = session.adminCredential;
  const player = session.join({ code: session.roomCode, ip: 'test', adminCredential });
  assert.equal(session.getDirectory().count, 1);
  assert.equal(session.canAttachConnection(player.playerId), true);

  setTime(10_999);
  session.tick();
  assert.equal(session.getDirectory().count, 1);
  setTime(11_000);
  assert.equal(session.canAttachConnection(player.playerId), false);
  session.tick();

  assert.equal(session.getDirectory().count, 0);
  assert.equal(session.authenticatePlayer(player.playerCredential), null);
  assert.equal(session.attachConnection(player.playerId, 'late-websocket'), false);
  assert.throws(() => session.command(adminCredential, { type: 'lock' }), /credential|unauthorized/i);
  setTime(41_001);
  session.tick();
  assert.equal(session.closed, true);
});

test('timed out reconnect restores the original reservation deadline for retry', () => {
  const { session, setTime } = sessionHarness();
  const joined = session.join({ code: session.roomCode, ip: 'test' });
  assert.equal(session.attachConnection(joined.playerId, 'first-websocket'), true);
  setTime(1_100);
  assert.equal(session.disconnect(joined.playerId), true);

  setTime(5_000);
  const reconnect = session.reconnect({ playerId: joined.playerId, reconnectCredential: joined.reconnectCredential });
  setTime(15_000);
  session.tick();
  assert.equal(session.getDirectory().count, 1);
  assert.equal(session.canAttachConnection(joined.playerId), false);

  setTime(30_999);
  const retried = session.reconnect({ playerId: joined.playerId, reconnectCredential: reconnect.reconnectCredential });
  assert.equal(retried.seat, joined.seat);
  assert.equal(session.getDirectory().count, 1);

  setTime(31_100);
  session.tick();
  assert.equal(session.getDirectory().count, 0);
  assert.throws(() => session.reconnect({ playerId: joined.playerId, reconnectCredential: retried.reconnectCredential }), /invalid|expired/i);
});

test('HTTP join without a Colyseus socket releases its seat after the attachment deadline', async () => {
  const { createExplorerServer } = await import('../city-explorer/multiplayer/server/src/index.mjs');
  const app = createExplorerServer({
    world: { version: 'http-pending-attach-v1', readyAt: () => true, sampleSurface: () => ({ height: 0, onRoad: true }), blocks: () => false },
    vehicles: [],
    spawn: pose,
    pendingAttachmentMs: 80,
    nodeEnv: 'development',
  });
  try {
    const address = await app.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const createdResponse = await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    const joinedResponse = await fetch(`${baseUrl}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: created.roomCode }) });
    assert.equal(joinedResponse.status, 201);
    const joined = await joinedResponse.json();
    assert.ok(joined.playerCredential);

    const deadline = Date.now() + 2_000;
    let directory;
    do {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const response = await fetch(`${baseUrl}/api/directory`);
      directory = await response.json();
    } while (directory.find((room) => room.id === created.roomId)?.count !== 0 && Date.now() < deadline);

    assert.equal(directory.find((room) => room.id === created.roomId)?.count, 0);
  } finally {
    await app.close();
  }
});
