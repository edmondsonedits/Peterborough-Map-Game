const SDK_URL = new URL('./vendor/colyseus-sdk-0.18.9.js', import.meta.url);
const MAX_SOCKET_BUFFERED_BYTES = 256 * 1024;
const MAX_ACK_TRACKING = 80;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function resolveColyseusSdk(globals = globalThis) {
  const sdk = globals.ColyseusSDK?.Client ? globals.ColyseusSDK
    : globals.Colyseus?.Client ? globals.Colyseus
    : typeof globals.Colyseus?.ColyseusSDK === 'function' ? { Client: globals.Colyseus.ColyseusSDK }
    : null;
  if (!sdk?.Client) throw new Error('Local Colyseus SDK 0.18.9 failed to initialize');
  return sdk;
}

async function loadSdk(injected) {
  if (injected) return injected;
  if (!globalThis.ColyseusSDK?.Client && !globalThis.Colyseus?.Client) await import(SDK_URL.href);
  return resolveColyseusSdk();
}

/** HTTP lifecycle and reliable WebSocket transport. Credentials stay in this instance's memory and POST bodies. */
export function createColyseusTransport({
  serverUrl, fetchImpl = globalThis.fetch?.bind(globalThis), sdk = null, reconnect = true,
  now = () => Date.now(), maxReconnectMs = 24_000, joinTimeoutMs = 5_000,
  warmupTimeoutMs = null, warmupProbeTimeoutMs = 3_000, warmupRetryMs = 250,
  onStatus = () => {}, onSnapshot = () => {},
  onQueueAck = () => {}, onActionResult = () => {}, onAdminCredential = () => {}, onDisconnect = () => {},
} = {}) {
  if (!serverUrl) throw new TypeError('serverUrl is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');
  const base = new URL(serverUrl, globalThis.location?.href ?? 'http://localhost/');
  const readinessBudgetMs = warmupTimeoutMs ?? (/\.onrender\.com$/i.test(base.hostname) ? 75_000 : 0);
  const warmupNow = () => globalThis.performance?.now?.() ?? Date.now();
  const callbacks = { onStatus, onSnapshot, onQueueAck, onActionResult, onAdminCredential, onDisconnect };
  const disconnectListeners = new Set();
  let currentRoom = null, client = null, session = null, reconnecting = false, disposed = false, intentionalClose = false, generation = 0, warmupController = null, warmupPromise = null;
  const pendingRoomOperations = new Set();
  let queuedAcks = [], sentMessageTimes = [];
  const pendingJoinCancels = new Set();
  function cancelPendingJoins() { for (const cancel of [...pendingJoinCancels]) cancel(); pendingJoinCancels.clear(); }
  function advanceGeneration() { generation += 1; warmupPromise = null; warmupController?.abort(); cancelPendingJoins(); return generation; }

  const status = (value, detail = {}) => { try { callbacks.onStatus({ status: value, ...detail }); } catch {} };
  const emitDisconnect = (detail = {}) => { try { callbacks.onDisconnect(detail); } catch {} for (const listener of disconnectListeners) try { listener(detail); } catch {} };
  async function request(path, method = 'GET', body, timeoutMs = 8_000) {
    const controller = new AbortController();
    let timer;
    try {
      const fetchPromise = fetchImpl(new URL(path, base), {
        method, headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: controller.signal,
      });
      const response = await Promise.race([fetchPromise, new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('HTTP request timed out')); }, Math.max(1, timeoutMs)); })]);
      let payload;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
      return payload;
    } finally { clearTimeout(timer); }
  }
  async function ensureServerReady() {
    if (!readinessBudgetMs || currentRoom) return;
    if (warmupPromise) return warmupPromise;
    const expectedGeneration = generation;
    const pending = (async () => {
      const deadline = warmupNow() + Math.max(1, readinessBudgetMs);
      let delayMs = Math.max(1, warmupRetryMs);
      let lastError = null;
      status('waking', { retryInMs: delayMs });
      while (!disposed && expectedGeneration === generation && warmupNow() < deadline) {
        const controller = new AbortController();
        warmupController = controller;
        let timer;
        const aborted = new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('connection superseded')), { once: true }));
        try {
          const remaining = Math.max(1, deadline - warmupNow());
          const probe = (async () => {
            const response = await fetchImpl(new URL('/healthz', base), { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
            let payload = null;
            try { payload = await response.json(); } catch {}
            return response.ok && payload?.status === 'ready' && typeof payload.worldVersion === 'string';
          })();
          const ready = await Promise.race([probe, aborted, new Promise((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error('readiness probe timed out')); }, Math.max(1, Math.min(warmupProbeTimeoutMs, remaining)));
          })]);
          if (disposed || expectedGeneration !== generation) throw new Error('connection superseded');
          if (ready) { status('server-ready'); return; }
          lastError = new Error('health check did not confirm a ready world');
        } catch (error) {
          if (disposed || expectedGeneration !== generation) throw new Error('connection superseded');
          lastError = error;
        } finally {
          clearTimeout(timer);
          if (warmupController === controller) warmupController = null;
        }
        const remaining = deadline - warmupNow();
        if (remaining <= 0) break;
        const retryInMs = Math.min(delayMs, remaining);
        status('waking', { retryInMs, error: String(lastError?.message ?? 'server is starting').slice(0, 160) });
        await sleep(retryInMs);
        if (disposed || expectedGeneration !== generation) throw new Error('connection superseded');
        delayMs = Math.min(2_000, Math.round(delayMs * 1.7));
      }
      throw new Error('Multiplayer server is still waking up. Try again shortly.');
    })();
    warmupPromise = pending;
    try { await pending; }
    finally { if (warmupPromise === pending) warmupPromise = null; }
  }
  function safeSession() {
    if (!session) return null;
    const { roomCode, roomId, playerId, seat, name, epoch, isAdmin } = session;
    return { roomCode: roomCode ?? null, roomId, playerId, seat, name, epoch, isAdmin: Boolean(isAdmin) };
  }
  async function directory() {
    const expectedGeneration = generation;
    await ensureServerReady();
    if (disposed || expectedGeneration !== generation) throw new Error('connection superseded');
    return request('/api/directory');
  }
  function cancelWarmup() {
    if (!warmupPromise && !pendingRoomOperations.size) return false;
    for (const operation of pendingRoomOperations) operation.cancelled = true;
    advanceGeneration(); status('cancelled'); return true;
  }
  async function closeCancelledRoom(created) {
    if (created?.roomId && created?.adminCredential) {
      await request(`/api/rooms/${encodeURIComponent(created.roomId)}/admin`, 'POST', { credential: created.adminCredential, command: { type: 'close' } }).catch(() => {});
    }
  }
  async function createRoom() {
    if (session) throw new Error('Leave the current room before creating another');
    const expectedGeneration = generation;
    const operation = { cancelled: false };
    pendingRoomOperations.add(operation);
    let created;
    try {
      await ensureServerReady();
      if (operation.cancelled || disposed || expectedGeneration !== generation) throw new Error('connection superseded');
      created = await request('/api/rooms', 'POST', {});
      if (operation.cancelled || disposed || expectedGeneration !== generation) {
        await closeCancelledRoom(created);
        throw new Error('connection superseded');
      }
      session = { roomCode: created.roomCode, roomId: created.roomId, adminCredential: created.adminCredential, isAdmin: true };
      try {
        const joined = await request('/api/join', 'POST', { code: created.roomCode, adminCredential: created.adminCredential });
        if (operation.cancelled || disposed) {
          if (joined?.playerCredential) await request(`/api/rooms/${encodeURIComponent(created.roomId)}/leave`, 'POST', { playerCredential: joined.playerCredential }).catch(() => {});
          session = null; await closeCancelledRoom(created);
          throw new Error('connection superseded');
        }
        Object.assign(session, joined, { roomId: created.roomId });
        await connect();
        return safeSession();
      } catch (error) {
        if (session?.playerCredential) await leave().catch(() => {});
        session = null;
        if (operation.cancelled || disposed) await closeCancelledRoom(created);
        throw error;
      }
    } finally { pendingRoomOperations.delete(operation); }
  }
  async function joinRoom(code, roomId = null) {
    if (session) throw new Error('Leave the current room before joining another');
    if (typeof code !== 'string' || !code.trim()) throw new TypeError('room code is required');
    const expectedGeneration = generation;
    const operation = { cancelled: false };
    pendingRoomOperations.add(operation);
    try {
      await ensureServerReady();
      if (operation.cancelled || disposed || expectedGeneration !== generation) throw new Error('connection superseded');
      const joined = await request('/api/join', 'POST', { code: code.trim().toUpperCase(), ...(roomId ? { roomId } : {}) });
      if (operation.cancelled || disposed || expectedGeneration !== generation) {
        if (joined?.playerCredential && joined?.roomId) await request(`/api/rooms/${encodeURIComponent(joined.roomId)}/leave`, 'POST', { playerCredential: joined.playerCredential }).catch(() => {});
        throw new Error('connection superseded');
      }
      session = { ...joined, isAdmin: false };
      try { await connect(); return safeSession(); }
      catch (error) { if (session?.playerCredential) await leave().catch(() => {}); session = null; throw error; }
    } finally { pendingRoomOperations.delete(operation); }
  }
  async function joinSocket(playerCredential, expectedGeneration = generation, ownerSession = session, timeoutMs = joinTimeoutMs) {
    status('loading-sdk', { session: safeSession() });
    const api = await loadSdk(sdk);
    status('joining-socket', { session: safeSession() });
    const nextClient = new api.Client(base.origin);
    let cancelled = false, cancel;
    let timer;
    const cancelPromise = new Promise((_, reject) => {
      cancel = () => { cancelled = true; reject(new Error('connection superseded')); };
      pendingJoinCancels.add(cancel);
    });
    const joinPromise = nextClient.joinById(ownerSession.roomId, { playerCredential }).then(async (room) => {
      if (cancelled || disposed || session !== ownerSession || expectedGeneration !== generation) {
        try { await room.leave(); } catch {}
        throw new Error('connection superseded');
      }
      return room;
    });
    let room;
    try {
      room = await Promise.race([joinPromise, cancelPromise, new Promise((_, reject) => { timer = setTimeout(() => { cancelled = true; reject(new Error('Colyseus join timed out')); }, Math.max(1, timeoutMs)); })]);
    } finally { clearTimeout(timer); pendingJoinCancels.delete(cancel); }
    client = nextClient; currentRoom = room; intentionalClose = false;
    // 0.18.9 auto-retries abnormal drops by default, which bypasses HTTP credential rotation and epoch reset.
    if (room.reconnection) room.reconnection.enabled = false;
    // Register all listeners before subscribe; the first snapshot/admin grant may arrive immediately afterwards.
    room.onMessage('snapshot', (value) => { try { callbacks.onSnapshot(value); } catch {} });
    room.onMessage('ack', (value) => {
      const sent = queuedAcks.shift();
      try {
        if (sent?.kind === 'action') callbacks.onActionResult({ ...value, requestId: sent.requestId, completed: true });
        else callbacks.onQueueAck({ ...value, sequence: value.sequence ?? sent?.sequence, simulated: false });
      } catch {}
    });
    room.onMessage('admin-credential', (value) => {
      if (typeof value?.credential !== 'string' || disposed || currentRoom !== room || session !== ownerSession || expectedGeneration !== generation) return;
      session.adminCredential = value.credential; session.isAdmin = true;
      if (typeof value.roomCode === 'string') session.roomCode = value.roomCode;
      try { callbacks.onAdminCredential(value.credential, value); } catch {}
      status('connected', { session: safeSession(), ...(typeof value.locked === 'boolean' ? { locked: value.locked } : {}) });
    });
    room.onLeave((code) => { if (currentRoom !== room) return; currentRoom = null; client = null; queuedAcks = []; sentMessageTimes = []; handleUnexpectedLeave(code, expectedGeneration); });
    room.onError?.((code, message) => status('error', { code, message: String(message ?? 'WebSocket error').slice(0, 200) }));
    room.send('subscribe', {});
    return room;
  }
  async function connect() {
    const expectedGeneration = advanceGeneration();
    const ownerSession = session;
    status('connecting', { session: safeSession() });
    await joinSocket(ownerSession.playerCredential, expectedGeneration, ownerSession);
    status('connected', { session: safeSession() });
  }
  async function handleUnexpectedLeave(code, expectedGeneration) {
    if (!disposed && !intentionalClose && expectedGeneration === generation && (code === 4001 || code === 4002)) {
      reconnecting = false;
      status('disconnected', { code, reason: code === 4001 ? 'removed-from-room' : 'room-closed' });
      emitDisconnect({ code, reconnecting: false, reason: code === 4001 ? 'removed-from-room' : 'room-closed' });
      return;
    }
    if (disposed || intentionalClose || !reconnect || !session || expectedGeneration !== generation) {
      if (!intentionalClose) emitDisconnect({ code });
      return;
    }
    if (reconnecting) return;
    reconnecting = true;
    const ownerSession = session;
    const deadline = now() + maxReconnectMs;
    status('reconnecting', { code }); emitDisconnect({ code, reconnecting: true });
    let delayMs = 250, refreshed = false;
    while (!disposed && session === ownerSession && now() < deadline && expectedGeneration === generation) {
      try {
        if (!refreshed) {
          const remaining = Math.max(1, deadline - now());
          const auth = await request(`/api/rooms/${encodeURIComponent(ownerSession.roomId)}/reconnect`, 'POST', {
            playerId: ownerSession.playerId, reconnectCredential: ownerSession.reconnectCredential,
          }, Math.min(8_000, remaining));
          if (disposed || session !== ownerSession || expectedGeneration !== generation) break;
          Object.assign(ownerSession, auth); refreshed = true;
        }
        // Retry the same newly rotated player credential if the socket handshake itself fails.
        const remaining = Math.max(1, deadline - now());
        await joinSocket(ownerSession.playerCredential, expectedGeneration, ownerSession, Math.min(joinTimeoutMs, remaining));
        reconnecting = false; status('connected', { session: safeSession(), resumed: true }); return;
      } catch (error) {
        if (disposed || session !== ownerSession || expectedGeneration !== generation) break;
        status('reconnecting', { retryInMs: delayMs, error: String(error?.message ?? 'connection failed').slice(0, 200) });
        await sleep(Math.min(delayMs, Math.max(1, deadline - now()))); delayMs = Math.min(2_000, Math.round(delayMs * 1.7));
      }
    }
    reconnecting = false;
    if (!disposed && expectedGeneration === generation) { status('disconnected', { reason: 'reservation-window-ended' }); emitDisconnect({ code, reconnecting: false, reason: 'reservation-window-ended' }); }
  }
  function canSendInput() {
    if (!currentRoom) return false;
    const connection = currentRoom.connection;
    const socket = connection?.transport?.ws ?? connection?.connection ?? connection?.ws ?? connection?._ws;
    const time = now(); sentMessageTimes = sentMessageTimes.filter((sentAt) => time - sentAt < 1_000);
    return (socket?.bufferedAmount === undefined || socket.bufferedAmount < MAX_SOCKET_BUFFERED_BYTES)
      && sentMessageTimes.length < 60 && queuedAcks.length < MAX_ACK_TRACKING;
  }
  function sendInput(input) {
    if (!currentRoom || !canSendInput()) return false;
    sentMessageTimes.push(now());
    queuedAcks.push({ kind: 'input', sequence: input.sequence });
    try { currentRoom.send('input', { input }); }
    catch (error) { queuedAcks.pop(); sentMessageTimes.pop(); throw error; }
    return true; // Local socket enqueue only; simulation is confirmed by snapshot.ackInputSequence.
  }
  function sendAction(action) {
    if (!currentRoom || !canSendInput()) return false;
    sentMessageTimes.push(now());
    queuedAcks.push({ kind: 'action', requestId: action.requestId });
    try { currentRoom.send('action', { action }); }
    catch (error) { queuedAcks.pop(); sentMessageTimes.pop(); throw error; }
    return true;
  }
  async function admin(command) {
    if (!session?.adminCredential) throw new Error('This player does not hold the admin credential');
    const owner = session;
    const ownerGeneration = generation;
    const result = await request(`/api/rooms/${encodeURIComponent(session.roomId)}/admin`, 'POST', { credential: session.adminCredential, command });
    if (session === owner && generation === ownerGeneration) {
      if (typeof result.roomCode === 'string') session.roomCode = result.roomCode;
      if (command?.type === 'transfer') {
        session.adminCredential = null;
        session.isAdmin = false;
      }
      status('connected', { session: safeSession(), ...(typeof result.locked === 'boolean' ? { locked: result.locked } : {}) });
    }
    return result;
  }
  async function leave() {
    if (!session) return false;
    const current = session; intentionalClose = true; advanceGeneration(); reconnecting = false;
    let outcome;
    try { outcome = await request(`/api/rooms/${encodeURIComponent(current.roomId)}/leave`, 'POST', { playerCredential: current.playerCredential }); }
    finally {
      const room = currentRoom; currentRoom = null; client = null; session = null;
      queuedAcks = []; sentMessageTimes = [];
      try { await room?.leave(); } catch {}
      intentionalClose = false; status('left');
    }
    return outcome?.ok === true;
  }
  function dispose() {
    disposed = true; intentionalClose = true; advanceGeneration(); reconnecting = false;
    disconnectListeners.clear();
    const room = currentRoom; currentRoom = null; client = null;
    queuedAcks = []; sentMessageTimes = [];
    try { room?.leave(); } catch {}
    session = null; status('disposed');
  }
  return Object.freeze({ directory, createRoom, joinRoom, admin, leave, dispose, cancelWarmup, sendInput, sendAction,
    onSnapshot(fn) { callbacks.onSnapshot = fn; }, onQueueAck(fn) { callbacks.onQueueAck = fn; }, onActionResult(fn) { callbacks.onActionResult = fn; },
    onAdminCredential(fn) { callbacks.onAdminCredential = fn; }, onDisconnect(fn) { callbacks.onDisconnect = fn; },
    addDisconnectListener(fn) { if (typeof fn !== 'function') throw new TypeError('disconnect listener must be a function'); disconnectListeners.add(fn); return () => disconnectListeners.delete(fn); },
    onStatus(fn) { callbacks.onStatus = fn; }, getSession: safeSession,
    canSendInput, get connected() { return Boolean(currentRoom); },
  });
}
