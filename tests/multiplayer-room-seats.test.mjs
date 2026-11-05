import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatRegistry } from '../city-explorer/multiplayer/server/src/room-seats.mjs';

function clock(start = 1_000) {
  let time = start;
  return { now: () => time, set: (next) => { time = next; } };
}

test('reserves all eight seats in order and rejects a ninth participant', () => {
  const registry = createSeatRegistry();
  const seats = Array.from({ length: 8 }, (_, index) => registry.reserve(`p${index}`));
  assert.deepEqual(seats.map(({ seat }) => seat), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(seats.map(({ name }) => name), Array.from({ length: 8 }, (_, i) => `Player ${i + 1}`));
  assert.throws(() => registry.reserve('p8'), /full|capacity/i);
});

test('rejects duplicate active identities and invalid identities', () => {
  const registry = createSeatRegistry();
  registry.reserve('alpha');
  assert.throws(() => registry.reserve('alpha'), /duplicate|reserved|identity/i);
  for (const identity of ['', '  ', null, 7, {}, ['x']]) {
    assert.throws(() => registry.reserve(identity), /identity/i);
  }
});

test('accepts __proto__ as a safe identity and returns immutable snapshots', () => {
  const registry = createSeatRegistry();
  const snapshot = registry.reserve('__proto__');
  assert.equal(snapshot.identity, '__proto__');
  assert.equal(snapshot.seat, 1);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.throws(() => { snapshot.name = 'Owner'; }, TypeError);
  assert.deepEqual(registry.list(), [snapshot]);
});

test('rejects capacities other than eight and invalid reconnect durations', () => {
  for (const capacity of [0, 7, 9, Infinity, NaN, '8']) {
    assert.throws(() => createSeatRegistry({ capacity }), /capacity/i);
  }
  for (const reconnectMs of [-1, Infinity, NaN, '30']) {
    assert.throws(() => createSeatRegistry({ reconnectMs }), /reconnect/i);
  }
});

test('rejects reconnecting an identity that is already connected', () => {
  const registry = createSeatRegistry();
  registry.reserve('alpha');
  assert.throws(() => registry.reconnect('alpha'), /disconnected|already connected|not disconnected/i);
});
test('reconnects to the same seat before deadline and preserves its label', () => {
  const time = clock();
  const registry = createSeatRegistry({ now: time.now });
  const original = registry.reserve('alpha');
  registry.disconnect('alpha');
  time.set(30_999);
  const restored = registry.reconnect('alpha');
  assert.equal(restored.seat, original.seat);
  assert.equal(restored.name, original.name);
  assert.equal(restored.connected, true);
  assert.equal(restored.expiresAt, null);
});

test('rejects reconnect at or after the expiration deadline', () => {
  for (const offset of [30_000, 30_001]) {
    const time = clock();
    const registry = createSeatRegistry({ now: time.now });
    registry.reserve('alpha');
    registry.disconnect('alpha');
    time.set(1_000 + offset);
    assert.throws(() => registry.reconnect('alpha'), /expired|unknown/i);
  }
});

test('repeated disconnect does not extend the reservation deadline', () => {
  const time = clock();
  const registry = createSeatRegistry({ now: time.now, reconnectMs: 5_000 });
  registry.reserve('alpha');
  const first = registry.disconnect('alpha');
  time.set(2_000);
  const second = registry.disconnect('alpha');
  assert.equal(first.expiresAt, 6_000);
  assert.equal(second.expiresAt, 6_000);
});

test('restores a pending reconnect to its original absolute expiry', () => {
  const time = clock();
  const registry = createSeatRegistry({ now: time.now, reconnectMs: 5_000 });
  registry.reserve('alpha');
  const original = registry.disconnect('alpha');
  time.set(2_000);
  registry.reconnect('alpha');
  const restored = registry.restoreDisconnected('alpha', original.expiresAt);
  assert.equal(restored.connected, false);
  assert.equal(restored.expiresAt, 6_000);
  time.set(5_999);
  assert.deepEqual(registry.expire(), []);
  time.set(6_000);
  assert.deepEqual(registry.expire(), ['alpha']);
});

test('expiry frees only disconnected seats and the lowest freed slot is reused', () => {
  const time = clock();
  const registry = createSeatRegistry({ now: time.now, reconnectMs: 100 });
  const first = registry.reserve('first');
  registry.reserve('second');
  registry.disconnect('first');
  time.set(1_100);
  assert.deepEqual(registry.expire(), ['first']);
  assert.equal(registry.list()[0].identity, 'second');
  const next = registry.reserve('third');
  assert.equal(next.seat, first.seat);
  assert.deepEqual(registry.expire(), []);
});

test('rejects reconnecting removed or unknown identities', () => {
  const registry = createSeatRegistry();
  registry.reserve('kicked');
  assert.equal(registry.remove('kicked'), true);
  assert.throws(() => registry.reconnect('kicked'), /unknown|expired/i);
  assert.equal(registry.remove('missing'), false);
  assert.throws(() => registry.disconnect('missing'), /unknown/i);
});

test('nonfinite clock values are rejected before changing reservations', () => {
  let currentTime = 1;
  const registry = createSeatRegistry({ now: () => currentTime });
  registry.reserve('alpha');
  currentTime = Number.NaN;
  assert.throws(() => registry.disconnect('alpha'), /time|clock|finite/i);
  assert.equal(registry.list()[0].connected, true);
});

