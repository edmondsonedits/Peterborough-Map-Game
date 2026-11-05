import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createSeatRegistry } from './room-seats.mjs';
import { createVehicleOwnership } from './vehicle-ownership.mjs';
import { PROTOCOL_VERSION, validateAction, validateInput, validateSnapshot } from '../../protocol.mjs';
import { DEFAULT_PLAYER_TUNING, DEFAULT_VEHICLE_TUNING, stepVehicle, stepWalking } from '../../movement-core.mjs';

const CAPACITY = 8;
const MAX_VEHICLES = 12;
const STEP_MS = 1000 / 30;
const SUBSTEP_SECONDS = 1 / 60;
const MAX_ELAPSED_MS = 250;
const STALE_INPUT_MS = 250;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_SECOND = 60;
const MAX_INPUT_QUEUE = 8;
const MAX_ACTION_CACHE = 100;
const EMPTY_TTL_MS = 30_000;
const JOIN_WINDOW_MS = 60_000;
const JOIN_ATTEMPT_LIMIT = 12;
const JOIN_RATE_KEYS = 2_048;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TOKEN_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
const ZERO_POSE = Object.freeze({ x: 0, y: 0, z: 0, heading: 0, vx: 0, vz: 0, speed: 0, steering: 0 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function secureRandomToken({ length, alphabet }) {
  let output = '';
  const ceiling = Math.floor(256 / alphabet.length) * alphabet.length;
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(16, length - output.length))) {
      if (byte >= ceiling) continue;
      output += alphabet[byte % alphabet.length];
      if (output.length === length) break;
    }
  }
  return output;
}

function clonePose(pose) {
  if (!pose || !['x', 'y', 'z', 'heading', 'vx', 'vz', 'speed', 'steering'].every((key) => Number.isFinite(pose[key]))) {
    throw new TypeError('world poses must contain finite position and velocity fields');
  }
  return { x: pose.x, y: pose.y, z: pose.z, heading: pose.heading, vx: pose.vx, vz: pose.vz, speed: pose.speed, steering: pose.steering };
}

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : '').digest();
}

function constantTimeTextEqual(left, right) {
  return timingSafeEqual(digest(left), digest(right));
}

function messageSize(message) {
  try { return Buffer.byteLength(JSON.stringify(message)); } catch { return Infinity; }
}

function freezeResult(ok, error, extra = {}) {
  return Object.freeze(ok ? { ok: true, ...extra } : { ok: false, error, ...extra });
}

function stopped(pose) {
  return { ...pose, vx: 0, vz: 0, speed: 0, steering: 0 };
}

export function createExplorerSession({ world, vehicles = [], spawn, clock = Date.now, randomToken = secureRandomToken } = {}) {
  if (!world || typeof world.sampleSurface !== 'function' || typeof world.blocks !== 'function' || typeof world.readyAt !== 'function') {
    throw new TypeError('world must provide sampleSurface(), blocks(), and fail-closed readyAt()');
  }
  if (typeof spawn !== 'function') throw new TypeError('spawn must be an injected function');
  if (typeof clock !== 'function') throw new TypeError('clock must be an injected clock function');
  if (typeof randomToken !== 'function') throw new TypeError('randomToken must be a function');
  if (!Array.isArray(vehicles) || vehicles.length > MAX_VEHICLES) throw new RangeError('vehicles must contain at most 12 instances');

  const worldVersion = world.worldVersion ?? world.version;
  if (typeof worldVersion !== 'string' || worldVersion.length < 1 || worldVersion.length > 128) {
    throw new TypeError('world must provide a stable worldVersion');
  }
  const now = () => {
    const value = clock();
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('server clock must be finite');
    return value;
  };
  const createToken = (purpose, length, alphabet = TOKEN_ALPHABET) => {
    const token = randomToken({ purpose, length, alphabet });
    if (typeof token !== 'string' || token.length !== length || [...token].some((char) => !alphabet.includes(char))) {
      throw new TypeError('randomToken returned a token outside the requested alphabet/length');
    }
    return token;
  };

  let roomId = createToken('room-id', 22);
  let roomCode = createToken('room-code', 8, ROOM_CODE_ALPHABET);
  let adminCredential = createToken('admin-credential', 43);
  let adminCredentialHash = digest(adminCredential);
  let adminPlayerId = null;
  const privateEvents = [];
  let locked = false;
  let closed = false;
  let tickNumber = 0;
  let accumulator = 0;
  let lastTickAt = now();
  let emptyUntil = lastTickAt + EMPTY_TTL_MS;
  const seatRegistry = createSeatRegistry({ capacity: CAPACITY, now });
  const players = new Map();
  const joinAttempts = new Map();

  const vehicleRecords = vehicles.map((vehicle) => {
    if (!vehicle || typeof vehicle.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(vehicle.id)) throw new TypeError('vehicle id must be a safe unique instance id');
    const generation = Number.isSafeInteger(vehicle.entityGeneration) && vehicle.entityGeneration >= 0 ? vehicle.entityGeneration : 0;
    return {
      id: vehicle.id,
      templateId: typeof vehicle.templateId === 'string' ? vehicle.templateId : undefined,
      entityGeneration: generation,
      pose: clonePose(vehicle.pose ?? vehicle),
      tuning: Object.freeze({ ...DEFAULT_VEHICLE_TUNING, ...(vehicle.tuning ?? {}) }),
      dimensions: Object.freeze({ ...DEFAULT_VEHICLE_TUNING, ...(vehicle.dimensions ?? {}) }),
      lights: false,
    };
  });
  const vehiclesById = new Map(vehicleRecords.map((vehicle) => [vehicle.id, vehicle]));
  const ownership = createVehicleOwnership(vehicleRecords);

  function tokenEquals(secretHash, candidate) {
    return !!secretHash && timingSafeEqual(secretHash, digest(candidate));
  }

  function findPlayerByCredential(candidate) {
    const candidateHash = digest(candidate);
    let found = null;
    for (const player of players.values()) {
      const stored = player.playerCredentialHash;
      const matches = timingSafeEqual(stored ?? Buffer.alloc(32), candidateHash) && stored !== null;
      if (matches) found = player;
    }
    return found;
  }

  function issueCredentials(player) {
    let playerCredential;
    let reconnectCredential;
    do { playerCredential = createToken('player-credential', 43); }
    while ([...players.values()].some((other) => other !== player && other.playerCredentialHash && timingSafeEqual(other.playerCredentialHash, digest(playerCredential))));
    do { reconnectCredential = createToken('reconnect-credential', 43); }
    while (tokenEquals(player.playerCredentialHash, reconnectCredential));
    player.playerCredentialHash = digest(playerCredential);
    player.reconnectCredentialHash = digest(reconnectCredential);
    return { playerCredential, reconnectCredential };
  }

  function rotateAdminCredential(targetPlayerId) {
    let next;
    do { next = createToken('admin-credential-transfer', 43); }
    while (constantTimeTextEqual(next, adminCredential));
    privateEvents.length = 0;
    adminCredential = next;
    adminCredentialHash = digest(next);
    adminPlayerId = targetPlayerId;
    if (targetPlayerId) privateEvents.push({ type: 'admin-credential', playerId: targetPlayerId, credential: next });
    return next;
  }

  function grantAdminToEligiblePlayer() {
    privateEvents.length = 0;
    const target = [...players.values()].find((player) => player.connected);
    if (!target) {
      adminCredential = null;
      adminCredentialHash = null;
      adminPlayerId = null;
      return;
    }
    rotateAdminCredential(target.playerId);
  }

  function publicActor(player) {
    const vehicleId = ownership.vehicleOf(player.playerId);
    const vehicle = vehicleId ? vehiclesById.get(vehicleId) : null;
    const pose = vehicle ? vehicle.pose : player.pose;
    return {
      id: player.playerId,
      name: player.name,
      entityGeneration: player.entityGeneration,
      mode: vehicle ? 'driving' : 'onFoot',
      vehicleId: vehicleId ?? null,
      pose: { ...pose },
    };
  }

  function currentVehicleSnapshots() {
    return vehicleRecords.map((vehicle) => ({
      id: vehicle.id,
      ...(vehicle.templateId ? { templateId: vehicle.templateId } : {}),
      entityGeneration: vehicle.entityGeneration,
      pose: { ...vehicle.pose },
      tuning: { ...vehicle.tuning },
      dimensions: { length: vehicle.dimensions.length, width: vehicle.dimensions.width, height: vehicle.dimensions.height },
      lights: vehicle.lights,
      driverPlayerId: ownership.driverOf(vehicle.id),
    }));
  }

  function snapshotFor(playerId) {
    const recipient = players.get(playerId);
    if (!recipient || !recipient.connected) throw new Error('unknown or disconnected player');
    const others = [...players.values()].filter((player) => player.connected && player !== recipient).map(publicActor);
    const snapshot = {
      protocolVersion: PROTOCOL_VERSION,
      worldVersion,
      tick: tickNumber,
      serverTime: now(),
      epoch: recipient.epoch,
      ackInputSequence: recipient.ackInputSequence,
      player: publicActor(recipient),
      players: others,
      vehicles: currentVehicleSnapshots(),
    };
    if (!validateSnapshot(snapshot)) throw new Error('server constructed an invalid protocol snapshot');
    return Object.freeze(snapshot);
  }

  function isWorldReady(pose, radius = 2) {
    let ready;
    try { ready = world.readyAt(pose.x, pose.z, radius); } catch { return false; }
    if (ready !== true) return false;
    let sample;
    try { sample = world.sampleSurface(pose.x, pose.z, pose.y); } catch { return false; }
    return !!sample && sample.ready !== false && Number.isFinite(sample.height);
  }

  function readinessProbe() {
    try {
      const pose = clonePose(spawn({ seat: 1, playerId: 'readiness_probe' }));
      return isWorldReady(pose);
    } catch { return false; }
  }

  function playerOccupied(candidate, excludedPlayerId) {
    for (const player of players.values()) {
      if (!player.connected || player.playerId === excludedPlayerId || ownership.vehicleOf(player.playerId)) continue;
      if (distance(candidate, player.pose) < 1.2) return true;
    }
    return false;
  }

  function chooseExitPose(player, vehicle) {
    const heading = vehicle.pose.heading;
    const right = { x: -Math.cos(heading), z: Math.sin(heading) };
    const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
    const halfWidth = vehicle.dimensions.width / 2 + 0.85;
    const halfLength = vehicle.dimensions.length / 2 + 0.85;
    const candidates = [
      { x: vehicle.pose.x + right.x * halfWidth, z: vehicle.pose.z + right.z * halfWidth },
      { x: vehicle.pose.x - right.x * halfWidth, z: vehicle.pose.z - right.z * halfWidth },
      { x: vehicle.pose.x - forward.x * halfLength, z: vehicle.pose.z - forward.z * halfLength },
      { x: vehicle.pose.x + forward.x * halfLength, z: vehicle.pose.z + forward.z * halfLength },
    ];
    for (const candidate of candidates) {
      let sample;
      try { sample = world.sampleSurface(candidate.x, candidate.z, vehicle.pose.y); } catch { continue; }
      const pose = { ...ZERO_POSE, ...candidate, y: sample?.height ?? vehicle.pose.y, heading };
      if (!isWorldReady(pose, 1.2) || playerOccupied(pose, player.playerId)) continue;
      if (world.blocks(pose, pose, { kind: 'onFoot', dimensions: { length: 0.7, width: 0.7, height: 1.8 } })) continue;
      return pose;
    }
    return null;
  }

  function consumeJoinAttempt(ip) {
    const key = typeof ip === 'string' && ip.length <= 128 ? ip : 'unknown';
    const time = now();
    let attempt = joinAttempts.get(key);
    if (!attempt || time - attempt.startedAt >= JOIN_WINDOW_MS) {
      if (!attempt && joinAttempts.size >= JOIN_RATE_KEYS) {
        for (const [knownIp, knownAttempt] of joinAttempts) {
          if (time - knownAttempt.startedAt >= JOIN_WINDOW_MS) joinAttempts.delete(knownIp);
        }
        if (joinAttempts.size >= JOIN_RATE_KEYS) throw new Error('join attempt rate limit table is full');
      }
      attempt = { startedAt: time, count: 0 };
      joinAttempts.set(key, attempt);
    }
    attempt.count += 1;
    if (attempt.count > JOIN_ATTEMPT_LIMIT) throw new Error('join attempt rate limit exceeded');
  }

  function join({ code, ip, adminCredential: joiningAdminCredential } = {}) {
    if (closed) throw new Error('room is closed');
    consumeJoinAttempt(ip);
    if (!constantTimeTextEqual(roomCode, code)) throw new Error('invalid room code');
    if (locked) throw new Error('room is locked');
    const playerId = createToken('player-id', 22);
    const seat = seatRegistry.reserve(playerId);
    try {
      const player = {
        playerId,
        name: seat.name,
        seat: seat.seat,
        connected: true,
        connectionId: null,
        epoch: 1,
        entityGeneration: 0,
        pose: clonePose(spawn({ seat: seat.seat, playerId })),
        inputQueue: [],
        activeControls: null,
        lastInputAt: now(),
        lastSequence: 0,
        ackInputSequence: 0,
        messageWindowStartedAt: now(),
        messageCount: 0,
        actionResults: new Map(),
        playerCredentialHash: null,
        reconnectCredentialHash: null,
      };
      players.set(playerId, player);
      const credentials = issueCredentials(player);
      if (adminPlayerId === null && tokenEquals(adminCredentialHash, joiningAdminCredential)) adminPlayerId = playerId;
      emptyUntil = null;
      return Object.freeze({ ...credentials, playerId, seat: seat.seat, name: seat.name, epoch: player.epoch });
    } catch (error) {
      players.delete(playerId);
      seatRegistry.remove(playerId);
      throw error;
    }
  }

  function authenticatePlayer(playerCredential) {
    return findPlayerByCredential(playerCredential)?.playerId ?? null;
  }

  function canAttachConnection(playerId) {
    const player = players.get(playerId);
    return !!player?.connected && player.connectionId === null;
  }

  function attachConnection(playerId, connectionId) {
    const player = players.get(playerId);
    if (!player?.connected || player.connectionId !== null || typeof connectionId !== 'string' || !connectionId) return false;
    player.connectionId = connectionId;
    return true;
  }

  function resetPrediction(player) {
    player.epoch += 1;
    player.entityGeneration += 1;
    player.lastSequence = 0;
    player.ackInputSequence = 0;
    player.inputQueue.length = 0;
    player.activeControls = null;
    player.lastInputAt = now();
    player.actionResults.clear();
    return { epoch: player.epoch, entityGeneration: player.entityGeneration, ackInputSequence: 0, resetPrediction: true };
  }

  function stopVehicle(vehicle) {
    vehicle.pose = stopped(vehicle.pose);
  }

  function disconnect(playerId) {
    const player = players.get(playerId);
    if (!player || !player.connected) return false;
    seatRegistry.disconnect(playerId);
    player.connected = false;
    player.connectionId = null;
    player.playerCredentialHash = null;
    player.inputQueue.length = 0;
    player.activeControls = null;
    const vehicleId = ownership.vehicleOf(playerId);
    if (vehicleId) stopVehicle(vehiclesById.get(vehicleId));
    return true;
  }

  function leave(playerId) {
    const player = players.get(playerId);
    if (!player) return false;
    player.playerCredentialHash = null;
    player.reconnectCredentialHash = null;
    const vehicleId = ownership.vehicleOf(playerId);
    if (vehicleId) {
      ownership.release(playerId, vehicleId);
      const vehicle = vehiclesById.get(vehicleId);
      stopVehicle(vehicle);
      vehicle.entityGeneration += 1;
    }
    seatRegistry.remove(playerId);
    players.delete(playerId);
    if (adminPlayerId === playerId) grantAdminToEligiblePlayer();
    if (![...players.values()].some((entry) => entry.connected)) emptyUntil = now() + EMPTY_TTL_MS;
    return true;
  }

  function reconnect({ playerId, reconnectCredential } = {}) {
    const player = players.get(playerId);
    if (!player || !tokenEquals(player.reconnectCredentialHash, reconnectCredential)) throw new Error('invalid reconnect credential');
    if (player.connected) throw new Error('player is already connected');
    const reservation = seatRegistry.reconnect(playerId);
    const time = now();
    player.connected = true;
    player.connectionId = null;
    player.epoch += 1;
    player.entityGeneration += 1;
    player.lastSequence = 0;
    player.ackInputSequence = 0;
    player.inputQueue.length = 0;
    player.activeControls = null;
    player.lastInputAt = time;
    player.messageWindowStartedAt = time;
    player.messageCount = 0;
    player.actionResults.clear();
    emptyUntil = null;
    const credentials = issueCredentials(player);
    if (adminPlayerId === playerId) rotateAdminCredential(playerId);
    return Object.freeze({ ...credentials, playerId, seat: reservation.seat, name: reservation.name, epoch: player.epoch });
  }

  function receive(playerId, message) {
    const player = players.get(playerId);
    if (closed || !player?.connected) return freezeResult(false, 'unknown-or-disconnected-player');
    if (messageSize(message) > MAX_MESSAGE_BYTES) return freezeResult(false, 'message-too-large');
    const time = now();
    if (time - player.messageWindowStartedAt >= 1000) {
      player.messageWindowStartedAt = time;
      player.messageCount = 0;
    }
    player.messageCount += 1;
    if (player.messageCount > MAX_MESSAGES_PER_SECOND) return freezeResult(false, 'message-rate-limit');

    if (message?.type === 'input' && validateInput(message.input)) {
      const input = message.input;
      if (input.epoch !== player.epoch || input.sequence <= player.lastSequence) return freezeResult(false, 'stale-epoch-or-sequence');
      if (player.inputQueue.length >= MAX_INPUT_QUEUE) return freezeResult(false, 'input-queue-full');
      player.lastSequence = input.sequence;
      player.inputQueue.push({ controls: { ...input.controls }, sequence: input.sequence, receivedAt: time });
      player.lastInputAt = time;
      return freezeResult(true, null, { sequence: input.sequence });
    }
    if (message?.type !== 'action' || !validateAction(message.action)) return freezeResult(false, 'invalid-message');
    const action = message.action;
    if (action.epoch !== player.epoch || action.sequence <= player.lastSequence) return freezeResult(false, 'stale-epoch-or-sequence');
    if (typeof action.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(action.requestId)) return freezeResult(false, 'invalid-request-id');
    if (player.actionResults.has(action.requestId)) return freezeResult(false, 'duplicate-request-id', { result: player.actionResults.get(action.requestId) });
    player.lastSequence = action.sequence;
    const result = runAction(player, action);
    player.actionResults.set(action.requestId, result);
    while (player.actionResults.size > MAX_ACTION_CACHE) player.actionResults.delete(player.actionResults.keys().next().value);
    return result;
  }

  function runAction(player, action) {
    const currentVehicleId = ownership.vehicleOf(player.playerId);
    const target = vehiclesById.get(action.vehicleId);
    if (action.type === 'enterVehicle') {
      if (currentVehicleId) return freezeResult(false, 'already-driving');
      if (!target) return freezeResult(false, 'unknown-vehicle');
      if (!isWorldReady(player.pose) || !isWorldReady(target.pose) || distance(player.pose, target.pose) > 6.5) return freezeResult(false, 'vehicle-out-of-range-or-world-unready');
      const claim = ownership.claim(player.playerId, target.id);
      if (!claim.ok) return freezeResult(false, claim.reason);
      target.entityGeneration += 1;
      return freezeResult(true, null, { vehicleId: target.id, ...resetPrediction(player) });
    }
    if (action.type === 'exitVehicle') {
      if (!currentVehicleId || currentVehicleId !== action.vehicleId) return freezeResult(false, 'not-current-driver');
      const vehicle = vehiclesById.get(currentVehicleId);
      if (Math.abs(vehicle.pose.speed) > 0.75) return freezeResult(false, 'vehicle-moving-too-fast');
      const exitPose = chooseExitPose(player, vehicle);
      if (!exitPose) return freezeResult(false, 'no-safe-exit');
      ownership.release(player.playerId, currentVehicleId);
      vehicle.entityGeneration += 1;
      player.pose = exitPose;
      return freezeResult(true, null, { vehicleId: currentVehicleId, ...resetPrediction(player) });
    }
    if (action.type === 'switchVehicle') {
      if (!currentVehicleId || !target || currentVehicleId === target.id) return freezeResult(false, 'invalid-switch-target');
      const current = vehiclesById.get(currentVehicleId);
      if (Math.abs(current.pose.speed) > 0.75 || !isWorldReady(current.pose) || !isWorldReady(target.pose)
          || distance(current.pose, target.pose) > 6.5) return freezeResult(false, 'switch-target-out-of-range');
      const switched = ownership.switch(player.playerId, currentVehicleId, target.id);
      if (!switched.ok) return freezeResult(false, switched.reason);
      current.entityGeneration += 1;
      target.entityGeneration += 1;
      return freezeResult(true, null, { vehicleId: target.id, ...resetPrediction(player) });
    }
    if (action.type === 'toggleLights') {
      if (!currentVehicleId || (action.vehicleId && action.vehicleId !== currentVehicleId)) return freezeResult(false, 'not-current-driver');
      const vehicle = vehiclesById.get(currentVehicleId);
      vehicle.lights = !vehicle.lights;
      return freezeResult(true, null, { lights: vehicle.lights });
    }
    return freezeResult(false, 'unsupported-action');
  }

  function neutralVehicleStep(vehicle) {
    const current = vehicle.pose;
    if (Math.abs(current.speed) < 0.05) {
      vehicle.pose = stopped(current);
      return;
    }
    const controls = { throttle: -Math.sign(current.speed), steering: 0 };
    const next = stepVehicle(current, controls, SUBSTEP_SECONDS, world, vehicle.tuning);
    if (Math.sign(next.speed) !== Math.sign(current.speed) || Math.abs(next.speed) < 0.05) vehicle.pose = stopped(current);
    else vehicle.pose = next;
  }

  function simulateFixedTick(time) {
    tickNumber += 1;
    const activeVehicles = new Set();
    for (const player of players.values()) {
      if (!player.connected) continue;
      const vehicleId = ownership.vehicleOf(player.playerId);
      const vehicle = vehicleId ? vehiclesById.get(vehicleId) : null;
      const state = vehicle ?? player;
      if (!isWorldReady(state.pose)) {
        if (vehicle) stopVehicle(vehicle);
        else player.pose = stopped(player.pose);
        player.inputQueue.length = 0;
        player.activeControls = null;
        continue;
      }
      if (vehicle) activeVehicles.add(vehicle.id);
      while (player.inputQueue.length && time - player.inputQueue[0].receivedAt > STALE_INPUT_MS) player.inputQueue.shift();
      const queued = player.inputQueue.shift();
      if (queued) {
        player.activeControls = queued.controls;
        player.ackInputSequence = queued.sequence;
      }
      const stale = time - player.lastInputAt > STALE_INPUT_MS;
      for (let substep = 0; substep < 2; substep += 1) {
        if (vehicle) {
          const current = vehicle.pose;
          const requested = stale ? { throttle: Math.abs(current.speed) < 0.05 ? 0 : -Math.sign(current.speed), steering: 0 }
            : player.activeControls ?? { throttle: 0, steering: 0 };
          const next = stepVehicle(current, requested, SUBSTEP_SECONDS, world, vehicle.tuning);
          if (stale && (Math.sign(next.speed) !== Math.sign(current.speed) || Math.abs(next.speed) < 0.05)) vehicle.pose = stopped(current);
          else vehicle.pose = next;
        } else {
          const controls = stale ? { forward: 0, strafe: 0, sprint: false, viewYaw: player.pose.heading }
            : player.activeControls ?? { forward: 0, strafe: 0, sprint: false, viewYaw: player.pose.heading };
          player.pose = stepWalking(player.pose, controls, SUBSTEP_SECONDS, world);
        }
      }
    }
    for (const vehicle of vehicleRecords) {
      if (activeVehicles.has(vehicle.id)) continue;
      if (!isWorldReady(vehicle.pose)) stopVehicle(vehicle);
      else neutralVehicleStep(vehicle);
    }
    return tickNumber;
  }

  function expirePlayers(time) {
    const expired = seatRegistry.expire();
    for (const playerId of expired) {
      const player = players.get(playerId);
      if (!player) continue;
      player.playerCredentialHash = null;
      player.reconnectCredentialHash = null;
      const vehicleId = ownership.vehicleOf(playerId);
      if (vehicleId) {
        ownership.release(playerId, vehicleId);
        const vehicle = vehiclesById.get(vehicleId);
        stopVehicle(vehicle);
        vehicle.entityGeneration += 1;
      }
      players.delete(playerId);
      if (adminPlayerId === playerId) grantAdminToEligiblePlayer();
    }
    if (!players.size && emptyUntil === null) emptyUntil = time;
  }

  function tick() {
    if (closed) return Object.freeze({ tick: tickNumber, disposed: true, snapshots: Object.freeze([]) });
    const time = now();
    expirePlayers(time);
    if (emptyUntil !== null && time >= emptyUntil && players.size === 0) {
      closed = true;
      return Object.freeze({ tick: tickNumber, disposed: true, snapshots: Object.freeze([]) });
    }
    const elapsed = clamp(time - lastTickAt, 0, MAX_ELAPSED_MS);
    lastTickAt = time;
    accumulator = Math.min(accumulator + elapsed, MAX_ELAPSED_MS);
    let steps = 0;
    while (accumulator + 1e-7 >= STEP_MS && steps < 7) {
      simulateFixedTick(time);
      accumulator -= STEP_MS;
      steps += 1;
    }
    if (steps === 7 && accumulator >= STEP_MS) accumulator %= STEP_MS;
    const snapshots = [];
    for (const player of players.values()) if (player.connected) snapshots.push({ playerId: player.playerId, snapshot: snapshotFor(player.playerId) });
    return Object.freeze({ tick: tickNumber, disposed: false, snapshots: Object.freeze(snapshots) });
  }

  function command(credential, action = {}) {
    if (!tokenEquals(adminCredentialHash, credential) || closed) throw new Error('unauthorized admin credential');
    if (action.type === 'lock') locked = true;
    else if (action.type === 'unlock') locked = false;
    else if (action.type === 'rotate') {
      let next = roomCode;
      for (let attempt = 0; attempt < 8 && constantTimeTextEqual(next, roomCode); attempt += 1) next = createToken('room-code-rotation', 8, ROOM_CODE_ALPHABET);
      if (constantTimeTextEqual(next, roomCode)) throw new Error('could not rotate room code');
      roomCode = next;
    } else if (action.type === 'kick') {
      const player = players.get(action.playerId);
      if (!player) throw new Error('unknown player');
      player.playerCredentialHash = null;
      player.reconnectCredentialHash = null;
      const vehicleId = ownership.vehicleOf(player.playerId);
      if (vehicleId) {
        ownership.release(player.playerId, vehicleId);
        const vehicle = vehiclesById.get(vehicleId);
        stopVehicle(vehicle);
        vehicle.entityGeneration += 1;
      }
      seatRegistry.remove(player.playerId);
      players.delete(player.playerId);
      if (adminPlayerId === player.playerId) grantAdminToEligiblePlayer();
      if (!players.size) emptyUntil = now() + EMPTY_TTL_MS;
    } else if (action.type === 'transfer') {
      const target = players.get(action.playerId);
      if (!target?.connected) throw new Error('administrator must be a connected player');
      rotateAdminCredential(target.playerId);
    } else if (action.type === 'close') {
      closed = true;
      adminCredential = null;
      adminCredentialHash = null;
      adminPlayerId = null;
      for (const player of players.values()) {
        player.playerCredentialHash = null;
        player.reconnectCredentialHash = null;
      }
    } else throw new Error('unsupported admin command');
    return Object.freeze({ ok: true, locked, roomCode: action.type === 'rotate' ? roomCode : undefined });
  }

  function takePrivateEvents(playerId) {
    const selected = [];
    for (let index = privateEvents.length - 1; index >= 0; index -= 1) {
      if (privateEvents[index].playerId === playerId) selected.unshift(privateEvents.splice(index, 1)[0]);
    }
    return Object.freeze(selected.map((event) => Object.freeze({ ...event })));
  }

  return Object.freeze({
    roomId,
    get roomCode() { return roomCode; },
    get adminCredential() { return adminCredential; },
    join,
    reconnect,
    disconnect,
    leave,
    receive,
    tick,
    snapshotFor,
    authenticatePlayer,
    canAttachConnection,
    attachConnection,
    takePrivateEvents,
    connectedPlayerIds: () => Object.freeze([...players.values()].filter((player) => player.connected).map((player) => player.playerId)),
    setRoomId: (nextRoomId) => { if (typeof nextRoomId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(nextRoomId)) throw new TypeError('invalid room id'); roomId = nextRoomId; },
    command,
    isReady: () => readinessProbe() && [...players.values()].every((player) => isWorldReady(player.pose)),
    getDirectory: () => Object.freeze({ id: roomId, name: 'Peterborough City Explorer', count: seatRegistry.list().length, capacity: CAPACITY, locked }),
    get closed() { return closed; },
  });
}
