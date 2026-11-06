import { PROTOCOL_VERSION, validateSnapshot } from './protocol.mjs?v=1.6.191';
import { DEFAULT_PLAYER_TUNING, DEFAULT_VEHICLE_TUNING, stepVehicle, stepWalking } from './movement-core.mjs?v=1.6.191';

const STEP_MS = 1000 / 30;
const SUBSTEP_SECONDS = 1 / 60;
const MAX_CATCHUP_TICKS = 5;
const MAX_PENDING = 8;
const MAX_VEHICLES = 12;
const MAX_EXTRAPOLATION_MS = 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrapAngle = (angle) => ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
const clonePose = (pose) => ({ ...pose });
const copyControls = (value = {}) => ({
  forward: clamp(Number(value.forward) || 0, -1, 1), strafe: clamp(Number(value.strafe) || 0, -1, 1),
  run: value.run === true, sprint: value.sprint === true, throttle: clamp(Number(value.throttle) || 0, -1, 1),
  steering: clamp(Number(value.steering) || 0, -1, 1),
  viewYaw: clamp(Number.isFinite(value.viewYaw) ? value.viewYaw : 0, -Math.PI, Math.PI),
});
const actorSignature = (actor) => `${actor.entityGeneration}:${actor.mode}:${actor.vehicleId ?? ''}`;
const vehicleSignature = (vehicle) => `${vehicle.entityGeneration}:${vehicle.driverPlayerId ?? ''}`;
const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function vehicleMetadata(vehicle) {
  const hasTemplate = owns(vehicle, 'templateId'), hasTuning = owns(vehicle, 'tuning'), hasDimensions = owns(vehicle, 'dimensions');
  if (hasTemplate && (typeof vehicle.templateId !== 'string' || vehicle.templateId.length > 80)) return false;
  if (hasTuning && (!record(vehicle.tuning) || !Object.values(vehicle.tuning).length || !Object.values(vehicle.tuning).every(Number.isFinite))) return false;
  if (hasDimensions && (!record(vehicle.dimensions) || !['length', 'width', 'height'].every((key) => Number.isFinite(vehicle.dimensions[key]) && vehicle.dimensions[key] > 0))) return false;
  return { hasTemplate, hasTuning, hasDimensions, complete: hasTuning && hasDimensions };
}

function interpolatePose(a, b, t) {
  const pose = {};
  for (const key of ['x', 'y', 'z', 'vx', 'vz', 'speed', 'steering']) pose[key] = a[key] + (b[key] - a[key]) * t;
  pose.heading = wrapAngle(a.heading + wrapAngle(b.heading - a.heading) * t);
  return pose;
}

function extrapolatePose(pose, seconds) {
  const out = { ...pose, x: pose.x + pose.vx * seconds, z: pose.z + pose.vz * seconds };
  if (Math.abs(pose.speed) > 0.05 && Number.isFinite(pose.steering)) {
    // The server's angular rate is speed / wheelbase * tan(steering); use the default wheelbase
    // only as a short visual extrapolation when entity-specific tuning is unavailable.
    out.heading = wrapAngle(pose.heading + pose.speed / DEFAULT_VEHICLE_TUNING.wheelbase * Math.tan(pose.steering) * seconds);
  }
  return out;
}

function sampleBuffer(buffer, targetTime, delayMs) {
  if (!buffer?.length) return null;
  const first = buffer[0];
  if (targetTime <= first.time) return { ...first.entity, pose: clonePose(first.entity.pose), stale: false };
  for (let i = 1; i < buffer.length; i += 1) {
    const before = buffer[i - 1], after = buffer[i];
    if (targetTime <= after.time) {
      const span = Math.max(1, after.time - before.time);
      const t = clamp((targetTime - before.time) / span, 0, 1);
      return { ...after.entity, pose: interpolatePose(before.entity.pose, after.entity.pose, t), stale: false };
    }
  }
  const latest = buffer.at(-1), age = Math.max(0, targetTime - latest.time);
  if (age <= MAX_EXTRAPOLATION_MS) return { ...latest.entity, pose: extrapolatePose(latest.entity.pose, age / 1000), stale: false };
  return { ...latest.entity, pose: extrapolatePose(latest.entity.pose, MAX_EXTRAPOLATION_MS / 1000), stale: true, staleForMs: age - MAX_EXTRAPOLATION_MS };
}

/** Fixed-step local predictor and remote interpolation buffer. Clock and world are injected for deterministic tests. */
export function createClientRuntime({
  transport, world, clock = () => performance.now(), playerId = null, worldVersion = world?.worldVersion,
  interpolationDelayMs = 80, maxPendingInputs = MAX_PENDING, maxCatchupTicks = MAX_CATCHUP_TICKS,
  playerTuning = DEFAULT_PLAYER_TUNING, onState = () => {}, onEvent = () => {},
} = {}) {
  if (!transport || typeof transport.sendInput !== 'function') throw new TypeError('transport.sendInput is required');
  if (!world || typeof world.sampleSurface !== 'function' || typeof world.blocks !== 'function' || typeof world.readyAt !== 'function') throw new TypeError('world must provide sampleSurface, blocks, and readyAt');
  const emit = (type, data = {}) => { try { onEvent({ type, ...data }); } catch {} };
  const listeners = new Set();
  const vehicleCatalog = new Map();
  let disposed = false, compatible = true, pausedForWorld = false, epoch = null, tick = -1, sequence = 0, lastAckInputSequence = 0;
  let accumulator = 0, pending = [], authoritative = null, simulation = null, rendered = null, lastRenderAt = clock();
  let latestControls = copyControls(), renderCorrection = { x: 0, y: 0, z: 0, heading: 0 };
  let lastServerTime = -Infinity, clockOffset = null, nextWarmupAt = 0;
  const buffers = { players: new Map(), vehicles: new Map() };
  let latestSnapshot = null;
  const state = () => ({
    disposed, compatible, pausedForWorld, epoch, tick, nextSequence: sequence + 1,
    pendingInputs: pending.length, playerId, authoritativePose: authoritative ? clonePose(authoritative.pose) : null,
    simulationPose: simulation ? clonePose(simulation.pose) : null, renderedPose: rendered ? clonePose(rendered.pose) : null,
    mode: authoritative?.mode ?? null, vehicleId: authoritative?.vehicleId ?? null,
    snapshot: latestSnapshot,
  });
  const publish = () => { const value = state(); try { onState(value); } catch {} for (const fn of listeners) { try { fn(value); } catch {} } };
  const entityRadius = (actor) => actor?.mode === 'driving' ? (actor.tuning?.length ?? DEFAULT_VEHICLE_TUNING.length) / 2 : 1;
  function ready(pose, radius) {
    try { return world.readyAt(pose.x, pose.z, radius) === true; } catch { return false; }
  }
  function warm(pose, radius) {
    if (typeof world.prefetch !== 'function' || clock() < nextWarmupAt) return;
    nextWarmupAt = clock() + 500;
    Promise.resolve(world.prefetch(pose.x, pose.z, radius)).catch((error) => emit('world-prefetch-error', { error }));
  }
  function modeState(source) {
    const vehicle = source.mode === 'driving' ? latestSnapshot?.vehicles?.find((item) => item.id === source.vehicleId) : null;
    return vehicle ? { pose: clonePose(source.pose), tuning: { ...DEFAULT_VEHICLE_TUNING, ...(vehicle.tuning ?? {}) } } : { pose: clonePose(source.pose), tuning: playerTuning };
  }
  function simulateOne(source, controls, dt = SUBSTEP_SECONDS) {
    const vehicle = latestSnapshot?.vehicles.find(item => item.id === source.vehicleId);
    if (vehicle && (vehicle.driverPlayerId !== source.id || (vehicle.aerial && vehicle.aerial.phase !== 'travel'))) {
      pausedForWorld = false;
      return clonePose(vehicle.pose);
    }
    const result = modeState(source), radius = entityRadius(source);
    if (!ready(result.pose, radius)) { pausedForWorld = true; warm(result.pose, radius); return null; }
    pausedForWorld = false;
    const next = source.mode === 'driving'
      ? stepVehicle(result.pose, controls, dt, world, result.tuning)
      : stepWalking(result.pose, controls, dt, world, playerTuning);
    if (!ready(next, radius)) { pausedForWorld = true; warm(next, radius); return null; }
    return next;
  }
  function predictTick(source, controls) {
    let pose = clonePose(source.pose);
    for (let i = 0; i < 2; i += 1) {
      const next = simulateOne({ ...source, pose }, controls);
      if (!next) return pose;
      pose = next;
    }
    return pose;
  }
  function previewPose(source, alpha) {
    let pose = clonePose(source.pose);
    if (alpha <= 0) return pose;
    const substep = SUBSTEP_SECONDS * clamp(alpha, 0, 1);
    for (let i = 0; i < 2; i += 1) {
      const next = simulateOne({ ...source, pose }, latestControls, substep);
      if (!next) break;
      pose = next;
    }
    return pose;
  }
  function advancePrediction(controls) {
    if (!compatible || !authoritative || !simulation) return false;
    const vehicle = latestSnapshot?.vehicles.find(item => item.id === authoritative.vehicleId);
    if (vehicle && (vehicle.driverPlayerId !== authoritative.id || (vehicle.aerial && vehicle.aerial.phase !== 'travel'))) return false;
    if (!ready(simulation.pose, entityRadius(authoritative))) { pausedForWorld = true; warm(simulation.pose, entityRadius(authoritative)); return false; }
    if (pending.length >= Math.min(MAX_PENDING, maxPendingInputs)) { emit('input-backpressure', { pending: pending.length }); return false; }
    if (transport.canSendInput?.() === false) { emit('transport-backpressure', {}); return false; }
    const inputControls = copyControls(controls);
    const predictedPose = predictTick({ ...authoritative, pose: simulation.pose }, inputControls);
    if (pausedForWorld) return false;
    const seq = sequence + 1;
    const input = { protocolVersion: PROTOCOL_VERSION, epoch, sequence: seq, mode: authoritative.mode, controls: inputControls };
    let result;
    try { result = transport.sendInput(input); } catch (error) { emit('input-send-error', { error }); return false; }
    if (result === false) { emit('input-backpressure', { pending: pending.length }); return false; }
    sequence = seq;
    latestControls = inputControls;
    pending.push({ sequence: seq, mode: authoritative.mode, vehicleId: authoritative.vehicleId, controls: input.controls });
    simulation = { ...authoritative, pose: predictedPose };
    rendered ??= { ...simulation, pose: clonePose(predictedPose) };
    return true;
  }
  function sendInput(controls = {}) {
    if (disposed) return false;
    const accepted = advancePrediction(controls);
    publish();
    return accepted;
  }
  function sendAction(action, vehicleId) {
    if (disposed || !compatible || epoch === null || typeof transport.sendAction !== 'function') return false;
    const value = typeof action === 'string' ? { type: action, vehicleId } : action;
    if (!value || typeof value.type !== 'string') return false;
    const message = { protocolVersion: PROTOCOL_VERSION, epoch, sequence: sequence + 1, type: value.type, requestId: value.requestId ?? globalThis.crypto?.randomUUID?.() ?? `r${Math.random().toString(36).slice(2)}` };
    if (value.vehicleId !== undefined) message.vehicleId = value.vehicleId;
    try {
      const sent = transport.sendAction(message);
      if (sent === false) return false;
      sequence = message.sequence;
      emit('action-sent', { type: message.type, requestId: message.requestId });
      publish();
      return message;
    } catch (error) { emit('action-send-error', { error }); return false; }
  }
  function resetBaseline(snapshot, { reason = 'baseline' } = {}) {
    if (!snapshot?.player) throw new TypeError('snapshot.player is required');
    epoch = snapshot.epoch; tick = snapshot.tick; sequence = snapshot.ackInputSequence ?? 0; lastAckInputSequence = snapshot.ackInputSequence ?? 0;
    clearBuffers();
    authoritative = { ...snapshot.player, pose: clonePose(snapshot.player.pose) };
    simulation = { ...authoritative, pose: clonePose(authoritative.pose) };
    rendered = { ...simulation, pose: clonePose(simulation.pose) };
    renderCorrection = { x: 0, y: 0, z: 0, heading: 0 };
    latestControls = copyControls();
    pending = [];
    accumulator = 0; pausedForWorld = false; lastRenderAt = clock();
    if (!ready(authoritative.pose, entityRadius(authoritative))) { pausedForWorld = true; warm(authoritative.pose, entityRadius(authoritative)); }
    emit('prediction-reset', { reason, epoch, tick });
    publish();
    return true;
  }
  function clearBuffers() { buffers.players.clear(); buffers.vehicles.clear(); }
  function appendEntity(map, entity, time, signature) {
    let record = map.get(entity.id);
    if (!record || record.signature !== signature) record = { signature, samples: [] };
    if (record.samples.length && time <= record.samples.at(-1).time) time = record.samples.at(-1).time + 0.01;
    record.samples.push({ time, entity: { ...entity, pose: clonePose(entity.pose) } });
    if (record.samples.length > 12) record.samples.splice(0, record.samples.length - 12);
    map.set(entity.id, record);
  }
  function hydrateVehicleCatalog(snapshot) {
    const metadata = snapshot.vehicles.map((vehicle) => ({ vehicle, fields: vehicleMetadata(vehicle) }));
    if (metadata.some((entry) => entry.fields === false)) return null;
    const currentIds = new Set(snapshot.vehicles.map((vehicle) => vehicle.id));
    for (const id of vehicleCatalog.keys()) if (!currentIds.has(id)) vehicleCatalog.delete(id);
    for (const { vehicle, fields } of metadata) {
      if (!fields.hasTemplate && !fields.hasTuning && !fields.hasDimensions) continue;
      const previous = vehicleCatalog.get(vehicle.id) ?? {};
      const next = fields.complete ? {} : { ...previous };
      if (fields.hasTemplate) next.templateId = vehicle.templateId;
      else if (fields.complete) delete next.templateId;
      if (fields.hasTuning) next.tuning = { ...vehicle.tuning };
      if (fields.hasDimensions) next.dimensions = { ...vehicle.dimensions };
      vehicleCatalog.delete(vehicle.id);
      vehicleCatalog.set(vehicle.id, next);
    }
    while (vehicleCatalog.size > MAX_VEHICLES) vehicleCatalog.delete(vehicleCatalog.keys().next().value);
    return { ...snapshot, vehicles: snapshot.vehicles.map((vehicle) => {
      const hydrated = { ...vehicle }, cached = vehicleCatalog.get(vehicle.id);
      if (!cached) return hydrated;
      if (owns(cached, 'templateId')) hydrated.templateId = cached.templateId;
      if (cached.tuning) hydrated.tuning = { ...cached.tuning };
      if (cached.dimensions) hydrated.dimensions = { ...cached.dimensions };
      return hydrated;
    }) };
  }
  function applySnapshot(snapshot) {
    if (disposed || !validateSnapshot(snapshot)) { emit('snapshot-rejected', { reason: 'invalid' }); return false; }
    if (snapshot.worldVersion !== worldVersion || (world.worldVersion && snapshot.worldVersion !== world.worldVersion)) {
      compatible = false; pending = []; emit('world-version-mismatch', { expected: worldVersion ?? world.worldVersion, received: snapshot.worldVersion }); publish(); return false;
    }
    if (epoch !== null && snapshot.epoch < epoch) { emit('snapshot-ignored', { reason: 'older-epoch', epoch: snapshot.epoch }); return false; }
    if (epoch === snapshot.epoch && snapshot.tick <= tick) { emit('snapshot-ignored', { reason: 'older-tick', tick: snapshot.tick }); return false; }
    if (epoch === snapshot.epoch && snapshot.ackInputSequence < lastAckInputSequence) { emit('snapshot-ignored', { reason: 'older-input-ack', ackInputSequence: snapshot.ackInputSequence }); return false; }
    snapshot = hydrateVehicleCatalog(snapshot);
    if (!snapshot) { emit('snapshot-rejected', { reason: 'invalid-vehicle-catalog' }); return false; }
    const receiveAt = clock();
    const priorRenderedPose = rendered ? clonePose(rendered.pose) : null;
    if (clockOffset === null) clockOffset = snapshot.serverTime - receiveAt;
    else {
      const measured = snapshot.serverTime - receiveAt;
      clockOffset += clamp(measured - clockOffset, -100, 100) * 0.05;
    }
    const serverTime = Math.max(lastServerTime, snapshot.serverTime); lastServerTime = serverTime;
    const remoteTime = serverTime - clockOffset;
    latestSnapshot = snapshot;
    if (epoch !== snapshot.epoch) resetBaseline(snapshot, { reason: 'epoch-change' });
    else {
      tick = snapshot.tick;
      lastAckInputSequence = snapshot.ackInputSequence;
      const own = snapshot.player;
      if (authoritative && (own.entityGeneration !== authoritative.entityGeneration || own.mode !== authoritative.mode || own.vehicleId !== authoritative.vehicleId)) {
        clearBuffers(); resetBaseline(snapshot, { reason: 'entity-transition' });
      } else {
        authoritative = { ...own, pose: clonePose(own.pose) };
        pending = pending.filter((entry) => entry.sequence > snapshot.ackInputSequence);
        if (simulation) {
          let pose = clonePose(authoritative.pose);
          const replay = [];
          for (const entry of pending) {
            if (entry.mode !== own.mode || entry.vehicleId !== own.vehicleId) continue;
            pose = predictTick({ ...own, pose }, entry.controls);
            replay.push(entry);
          }
          pending = replay;
          simulation = { ...own, pose };
        } else simulation = { ...own, pose: clonePose(own.pose) };
        if (priorRenderedPose) {
          const equivalentPreview = previewPose(simulation, accumulator / STEP_MS);
          renderCorrection = {
          x: priorRenderedPose.x - equivalentPreview.x,
          y: priorRenderedPose.y - equivalentPreview.y,
          z: priorRenderedPose.z - equivalentPreview.z,
          heading: wrapAngle(priorRenderedPose.heading - equivalentPreview.heading),
        };
        }
      }
    }
    sequence = Math.max(sequence, snapshot.ackInputSequence);
    const currentPlayers = new Set();
    for (const actor of snapshot.players) {
      if (actor.id === playerId || actor.id === snapshot.player.id) continue;
      currentPlayers.add(actor.id); appendEntity(buffers.players, actor, remoteTime, actorSignature(actor));
    }
    for (const id of buffers.players.keys()) if (!currentPlayers.has(id)) buffers.players.delete(id);
    const currentVehicles = new Set();
    for (const vehicle of snapshot.vehicles) { currentVehicles.add(vehicle.id); appendEntity(buffers.vehicles, vehicle, remoteTime, vehicleSignature(vehicle)); }
    for (const id of buffers.vehicles.keys()) if (!currentVehicles.has(id)) buffers.vehicles.delete(id);
    publish();
    return true;
  }
  function sampleRemote(renderTime = clock()) {
    const target = renderTime - Math.max(0, interpolationDelayMs);
    const output = { players: [], vehicles: [] };
    for (const [id, record] of buffers.players) { const sample = sampleBuffer(record.samples, target, interpolationDelayMs); if (sample) output.players.push({ ...sample, id }); }
    for (const [id, record] of buffers.vehicles) { const sample = sampleBuffer(record.samples, target, interpolationDelayMs); if (sample) output.vehicles.push({ ...sample, id }); }
    return output;
  }
  function sampleRemoteActor(id, renderTime = clock()) {
    const target = renderTime - Math.max(0, interpolationDelayMs);
    const player = buffers.players.get(id); if (player) return sampleBuffer(player.samples, target, interpolationDelayMs);
    const vehicle = buffers.vehicles.get(id); if (vehicle) return sampleBuffer(vehicle.samples, target, interpolationDelayMs);
    return null;
  }
  function advanceFrame(deltaMs, controls = null) {
    if (disposed) return state();
    const dt = clamp(Number(deltaMs) || 0, 0, 1000);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP_MS && steps < maxCatchupTicks) {
      accumulator -= STEP_MS; steps += 1;
      if (controls) advancePrediction(controls);
    }
    if (accumulator >= STEP_MS) {
      accumulator %= STEP_MS;
      pending = []; simulation = authoritative ? { ...authoritative, pose: clonePose(authoritative.pose) } : null;
      renderCorrection = { x: 0, y: 0, z: 0, heading: 0 };
      emit('prediction-resync-required', { reason: 'frame-catchup-cap' });
    }
    if (authoritative && simulation) {
      const time = clock(), delta = clamp((time - lastRenderAt) / 1000, 0, 0.1); lastRenderAt = time;
      const alpha = clamp(accumulator / STEP_MS, 0, 1);
      const vehicle = latestSnapshot?.vehicles.find(item => item.id === authoritative.vehicleId);
      const riding = vehicle && vehicle.driverPlayerId !== authoritative.id;
      const preview = riding ? sampleRemoteActor(vehicle.id)?.pose ?? vehicle.pose : previewPose(simulation, alpha);
      if (riding) renderCorrection = { x: 0, y: 0, z: 0, heading: 0 };
      const response = authoritative.mode === 'driving' ? 10 : 12;
      const decay = Math.exp(-response * delta);
      renderCorrection = { x: renderCorrection.x * decay, y: renderCorrection.y * decay, z: renderCorrection.z * decay, heading: wrapAngle(renderCorrection.heading * decay) };
      rendered = { ...simulation, pose: { ...preview,
        x: preview.x + renderCorrection.x,
        y: preview.y + renderCorrection.y,
        z: preview.z + renderCorrection.z,
        heading: wrapAngle(preview.heading + renderCorrection.heading),
      } };
    }
    publish();
    return state();
  }
  function subscribe(fn) { if (typeof fn !== 'function') throw new TypeError('listener must be a function'); listeners.add(fn); return () => listeners.delete(fn); }
  let removeDisconnectListener = () => {};
  function dispose() { if (disposed) return; disposed = true; removeDisconnectListener(); pending = []; clearBuffers(); vehicleCatalog.clear(); listeners.clear(); try { transport.dispose?.(); } catch {} publish(); }
  if (transport.onSnapshot) transport.onSnapshot(applySnapshot);
  if (transport.onQueueAck) transport.onQueueAck((ack) => emit('queue-acceptance', { ...ack, simulated: false }));
  if (transport.onActionResult) transport.onActionResult((result) => emit('action-result', result));
  if (transport.onAdminCredential) transport.onAdminCredential((credential) => emit('admin-credential', { credential }));
  const handleDisconnect = (info) => {
    if (disposed) return;
    pending = [];
    if (authoritative) simulation = { ...authoritative, pose: clonePose(authoritative.pose) };
    emit('disconnected', info ?? {}); publish();
  };
  if (transport.addDisconnectListener) removeDisconnectListener = transport.addDisconnectListener(handleDisconnect);
  else if (transport.onDisconnect) transport.onDisconnect(handleDisconnect);
  return Object.freeze({ sendInput, sendAction, applySnapshot, sampleRemote, sampleRemoteActor, resetBaseline, advanceFrame, subscribe, dispose, getState: state,
    get authoritativePose() { return authoritative ? clonePose(authoritative.pose) : null; },
    get simulationPose() { return simulation ? clonePose(simulation.pose) : null; },
    get renderedPose() { return rendered ? clonePose(rendered.pose) : null; },
    get latestSnapshot() { return latestSnapshot; },
    getBufferSizes() { return { players: Object.fromEntries([...buffers.players].map(([id, value]) => [id, value.samples.length])), vehicles: Object.fromEntries([...buffers.vehicles].map(([id, value]) => [id, value.samples.length])) }; },
  });
}
