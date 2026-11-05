const ROOM_CAPACITY = 8;
const MAX_IDENTITY_LENGTH = 128;

function validateIdentity(identity) {
  if (typeof identity !== 'string' || identity.trim().length === 0 || identity.length > MAX_IDENTITY_LENGTH) {
    throw new TypeError('identity must be a non-empty string of at most 128 characters');
  }
}

function snapshot(record) {
  return Object.freeze({
    identity: record.identity,
    seat: record.seat,
    name: record.name,
    connected: record.connected,
    expiresAt: record.expiresAt,
  });
}

export function createSeatRegistry({ capacity = ROOM_CAPACITY, reconnectMs = 30_000, now = Date.now } = {}) {
  if (capacity !== ROOM_CAPACITY) throw new RangeError('room capacity must be exactly 8');
  if (typeof reconnectMs !== 'number' || !Number.isFinite(reconnectMs) || reconnectMs < 0) {
    throw new RangeError('reconnectMs must be a finite non-negative number');
  }
  if (typeof now !== 'function') throw new TypeError('now must be a function');

  const byIdentity = new Map();
  const bySeat = new Map();

  function currentTime() {
    const value = now();
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new RangeError('clock time must be finite');
    }
    return value;
  }

  function release(record) {
    byIdentity.delete(record.identity);
    bySeat.delete(record.seat);
  }

  function expireAt(time) {
    const expired = [];
    for (const record of byIdentity.values()) {
      if (!record.connected && record.expiresAt <= time) {
        expired.push(record.identity);
        release(record);
      }
    }
    return expired;
  }

  function expire() {
    return Object.freeze(expireAt(currentTime()));
  }

  function reserve(identity) {
    validateIdentity(identity);
    expireAt(currentTime());
    if (byIdentity.has(identity)) throw new Error('identity already has a reservation');
    let seat = 1;
    while (bySeat.has(seat) && seat <= ROOM_CAPACITY) seat += 1;
    if (seat > ROOM_CAPACITY) throw new Error('room is at capacity');
    const record = { identity, seat, name: `Player ${seat}`, connected: true, expiresAt: null };
    byIdentity.set(identity, record);
    bySeat.set(seat, identity);
    return snapshot(record);
  }

  function disconnect(identity) {
    validateIdentity(identity);
    const record = byIdentity.get(identity);
    if (!record) throw new Error('unknown identity');
    if (record.connected) {
      const time = currentTime();
      const expiresAt = time + reconnectMs;
      if (!Number.isFinite(expiresAt)) throw new RangeError('expiration time must be finite');
      record.connected = false;
      record.expiresAt = expiresAt;
    }
    return snapshot(record);
  }

  function reconnect(identity) {
    validateIdentity(identity);
    const time = currentTime();
    const record = byIdentity.get(identity);
    if (!record) throw new Error('unknown or expired identity');
    if (record.connected) throw new Error('identity is already connected');
    if (record.expiresAt <= time) {
      release(record);
      throw new Error('reservation expired');
    }
    record.connected = true;
    record.expiresAt = null;
    return snapshot(record);
  }

  function remove(identity) {
    validateIdentity(identity);
    const record = byIdentity.get(identity);
    if (!record) return false;
    release(record);
    return true;
  }

  function list() {
    return Object.freeze([...byIdentity.values()]
      .sort((a, b) => a.seat - b.seat)
      .map(snapshot));
  }

  return Object.freeze({ reserve, disconnect, reconnect, expire, remove, list });
}



