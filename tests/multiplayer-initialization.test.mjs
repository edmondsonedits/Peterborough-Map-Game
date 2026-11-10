import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayerIntegration } from '../city-explorer/multiplayer/integration.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ prefetch = async () => {}, createRoom, createRuntime } = {}) {
  const loads = [], transports = [], runtimes = [], updates = [];
  let callbacks, panel, enters = 0;
  const world = { manifest: { roadPack: { buildId: 'road' } }, worldVersion: 'world', stations: [{ anchor: { x: 0, z: 0 } }], prefetch };
  const integration = createMultiplayerIntegration({ parent: {}, pageUrl: 'https://game.example/', configuredUrl: 'https://server.example/', roadPackId: () => 'road',
    onEnter: () => { enters++; }, factories: {
      createRoomUi({ callbacks: handlers, onOpenChange }) { callbacks = handlers; panel = onOpenChange; return { update: value => updates.push(value), dispose() {} }; },
      loadWorldCollision() { const load = deferred(); loads.push(load); return load.promise; },
      createTransport() {
        let session = null;
        const item = { disposed: 0, creates: 0, directories: 0, leaves: 0,
          async directory() { item.directories++; return []; },
          async createRoom() { item.creates++; session = createRoom ? await createRoom() : { playerId: `player-${transports.indexOf(item)}`, roomId: 'room' }; return session; },
          getSession: () => session,
          async leave() { item.leaves++; session = null; },
          cancelWarmup() {}, dispose() { item.disposed++; },
        };
        transports.push(item); return item;
      },
      createRuntime(args) {
        const item = createRuntime ? createRuntime(args) : { latestSnapshot: { tick: 1 }, dispose: () => args.transport.dispose() };
        runtimes.push(item); return item;
      },
    },
  });
  return { integration, callbacks, world, loads, transports, runtimes, updates, open: () => panel(true), close: () => panel(false), get enters() { return enters; } };
}

test('lobby listing and immediate create share one world, transport and runtime', async t => {
  const h = harness(); t.after(() => h.integration.dispose());
  h.open(); const joining = h.callbacks.createRoom();
  await tick();
  assert.equal(h.loads.length, 1, 'concurrent consumers must share pending initialization');
  h.loads[0].resolve(h.world); await joining; await tick();
  assert.equal(h.transports.length, 1); assert.equal(h.runtimes.length, 1);
  assert.equal(h.integration.runtime, h.runtimes[0]);
  assert.equal(h.integration.active, true); assert.equal(h.enters, 1);
  assert.equal(h.transports[0].creates, 1);
});

for (const action of ['leave', 'dispose']) {
  test(`${action} during world loading prevents late transport creation and joining`, async t => {
    const h = harness(); t.after(() => h.integration.dispose());
    const joining = h.callbacks.createRoom(); await tick();
    if (action === 'leave') await h.integration.leaveRoom(); else h.integration.dispose();
    h.loads[0].resolve(h.world);
    assert.equal((await joining).cancelled, true);
    assert.equal(h.transports.length, 0); assert.equal(h.integration.runtime, null);
    assert.equal(h.integration.session, null); assert.equal(h.integration.active, false);
  });
}

test('leave during station prefetch cancels the join before any room is created', async t => {
  const gate = deferred(), h = harness({ prefetch: () => gate.promise }); t.after(() => h.integration.dispose());
  const joining = h.callbacks.createRoom(); await tick(); h.loads[0].resolve(h.world); await tick();
  await h.integration.leaveRoom(); gate.resolve();
  assert.equal((await joining).cancelled, true);
  assert.equal(h.transports[0].creates, 0); assert.equal(h.transports[0].disposed, 1);
  assert.equal(h.integration.session, null);
});

test('late initialization cannot replace a newer joined session after leave', async t => {
  const h = harness(); t.after(() => h.integration.dispose());
  const oldJoin = h.callbacks.createRoom(); await tick(); await h.integration.leaveRoom();
  const newJoin = h.callbacks.createRoom(); await tick();
  assert.equal(h.loads.length, 2);
  h.loads[1].resolve(h.world); await newJoin;
  const activeRuntime = h.integration.runtime, activeSession = h.integration.session;
  h.loads[0].resolve(h.world);
  assert.equal((await oldJoin).cancelled, true);
  assert.equal(h.integration.runtime, activeRuntime); assert.equal(h.integration.session, activeSession);
  assert.equal(h.transports.length, 1); assert.equal(h.integration.active, true);
});

test('failed world initialization can retry without a poisoned pending request', async t => {
  const h = harness(); t.after(() => h.integration.dispose());
  const first = h.callbacks.createRoom(), failed = assert.rejects(first, /load failed/);
  await tick(); h.loads[0].reject(new Error('load failed')); await failed;
  const next = h.callbacks.createRoom(); await tick(); assert.equal(h.loads.length, 2);
  h.loads[1].resolve(h.world); await next;
  assert.equal(h.integration.active, true); assert.equal(h.transports.length, 1);
});

test('a runtime-construction failure disposes its transport and remains retryable', async t => {
  let fail = true;
  const h = harness({ createRuntime: ({ transport }) => {
    if (fail) throw new Error('runtime failed');
    return { latestSnapshot: { tick: 1 }, dispose: () => transport.dispose() };
  } }); t.after(() => h.integration.dispose());
  const first = h.callbacks.createRoom(), failed = assert.rejects(first, /runtime failed/);
  await tick(); h.loads[0].resolve(h.world); await failed;
  assert.equal(h.transports[0].disposed, 1); assert.equal(h.integration.runtime, null);
  fail = false; await h.callbacks.createRoom();
  assert.equal(h.integration.active, true); assert.equal(h.transports.length, 2);
});

test('late room response after leave cannot reactivate a retired session', async t => {
  const gate = deferred(), h = harness({ createRoom: () => gate.promise }); t.after(() => h.integration.dispose());
  const joining = h.callbacks.createRoom(); await tick(); h.loads[0].resolve(h.world); await tick();
  await h.integration.leaveRoom(); gate.resolve({ playerId: 'old-player', roomId: 'old-room' });
  assert.equal((await joining).cancelled, true);
  assert.equal(h.integration.session, null); assert.equal(h.integration.active, false); assert.equal(h.enters, 0);
});

test('closing the lobby during loading cancels its requests but permits reopening', async t => {
  const h = harness(); t.after(() => h.integration.dispose());
  h.open(); const joining = h.callbacks.createRoom(); await tick(); h.close(); h.loads.forEach(load => load.resolve(h.world));
  assert.equal((await joining).cancelled, true); await tick();
  assert.equal(h.transports[0].creates, 0); assert.equal(h.transports[0].directories, 0);
  h.open(); await h.callbacks.createRoom(); assert.equal(h.integration.active, true);
});

test('a retired load failure cannot clear a replacement initialization', async t => {
  const h = harness(); t.after(() => h.integration.dispose());
  const old = h.callbacks.createRoom(); await tick(); await h.integration.leaveRoom();
  const next = h.callbacks.createRoom(); await tick();
  h.loads[0].reject(new Error('retired load failed')); assert.equal((await old).cancelled, true);
  const listing = h.callbacks.listRooms(); await tick();
  assert.equal(h.loads.length, 2, 'old cleanup must not clear the current pending initialization');
  h.loads[1].resolve(h.world); await next; await listing;
  assert.equal(h.transports.length, 1); assert.equal(h.integration.active, true);
});

test('late room failure cannot clear a newer joined session', async t => {
  const gate = deferred(); let calls = 0;
  const h = harness({ createRoom: () => ++calls === 1 ? gate.promise : Promise.resolve({ playerId: 'new-player', roomId: 'new-room' }) });
  t.after(() => h.integration.dispose());
  const old = h.callbacks.createRoom(); await tick(); h.loads[0].resolve(h.world); await tick();
  await h.integration.leaveRoom(); await h.callbacks.createRoom();
  gate.reject(new Error('retired room failed')); assert.equal((await old).cancelled, true);
  assert.equal(h.integration.session.playerId, 'new-player'); assert.equal(h.integration.active, true);
  assert.ok(h.updates.every(update => update.message !== 'retired room failed'));
});

test('disposal is terminal and idempotent for later lobby and join calls', async () => {
  const h = harness(); h.integration.dispose(); h.integration.dispose();
  assert.equal((await h.callbacks.createRoom()).cancelled, true);
  assert.deepEqual(await h.callbacks.listRooms(), []);
  assert.equal(h.loads.length, 0); assert.equal(h.transports.length, 0);
});
