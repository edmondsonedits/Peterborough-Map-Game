import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import express from 'express';
import { Room, Server, matchMaker } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createExplorerSession } from './explorer-room.mjs';

const MAX_HTTP_BODY = 16 * 1024;
const MAX_OUTBOUND_BUFFER = 256 * 1024;
const MAX_ACTIVE_ROOMS = 500;
const JOIN_LIMIT = 12;
const JOIN_WINDOW_MS = 60_000;
const JOIN_RATE_KEYS = 2_048;
const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60_000;
const CREATE_RATE_KEYS = 2_048;

function loopback(address = '') {
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address;
  return normalized === '::1' || normalized === '127.0.0.1' || normalized.startsWith('127.');
}

function normalizeOrigin(value) {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== value) return null;
    return parsed.origin;
  } catch { return null; }
}

function originPolicy({ allowedOrigins = [], nodeEnv = process.env.NODE_ENV ?? 'development' } = {}) {
  const configured = new Set(allowedOrigins.map(normalizeOrigin).filter(Boolean));
  const production = nodeEnv === 'production';
  return (origin, address) => {
    if (typeof origin !== 'string' || !origin) return !production && loopback(address);
    const normalized = normalizeOrigin(origin);
    if (!normalized) return false;
    if (configured.has(normalized)) return true;
    if (production) return false;
    const url = new URL(normalized);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  };
}

function safeError(error) {
  const message = error instanceof Error ? error.message : 'request failed';
  if (/credential|admin|unauthorized|invalid room code/i.test(message)) return 'unauthorized or invalid room credentials';
  if (/full|capacity/i.test(message)) return 'room is full';
  if (/locked/i.test(message)) return 'room is locked';
  if (/rate limit/i.test(message)) return 'rate limit exceeded';
  if (/unknown player/i.test(message)) return 'unknown player';
  if (/closed/i.test(message)) return 'room is closed';
  return 'request rejected';
}

function sendAdminEvents(session, room, playerIds) {
  for (const playerId of playerIds) {
    const client = room?.clients.find((entry) => entry.userData?.playerId === playerId);
    if (!client || !room.subscribed?.has(playerId)) continue;
    const events = session.takePrivateEvents(playerId);
    for (const event of events) client.send('admin-credential', { credential: event.credential });
  }
}

export async function loadWorldConfig(modulePath = process.env.EXPLORER_WORLD_CONFIG) {
  if (!modulePath) throw new Error('EXPLORER_WORLD_CONFIG must name an explicit world config module');
  const loaded = await import(pathToFileURL(resolve(modulePath)).href);
  if (typeof loaded.createExplorerWorld !== 'function') throw new Error('world config must export createExplorerWorld()');
  const config = await loaded.createExplorerWorld();
  if (!config || !config.world || !Array.isArray(config.vehicles) || typeof config.spawn !== 'function') {
    throw new Error('world config must return { world, vehicles, spawn }');
  }
  if (config.world.ready && typeof config.world.ready.then === 'function') await config.world.ready;
  return config;
}

export function createExplorerServer({
  world,
  vehicles,
  spawn,
  clock = Date.now,
  randomToken,
  pendingAttachmentMs = 10_000,
  allowedOrigins = (process.env.EXPLORER_ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  nodeEnv = process.env.NODE_ENV ?? 'development',
} = {}) {
  if (!world || !Array.isArray(vehicles) || typeof spawn !== 'function') {
    throw new TypeError('createExplorerServer requires explicit world, vehicles, and spawn configuration');
  }
  const isOriginAllowed = originPolicy({ allowedOrigins, nodeEnv });
  const sessionsByKey = new Map();
  const roomSessions = new Map();
  const createAttempts = new Map();
  const joinAttempts = new Map();
  const sessions = new Set();

  function roomRecord(roomId) { return roomSessions.get(roomId) ?? null; }
  function sessionByRoomId(roomId) { return roomRecord(roomId)?.session ?? null; }
  function requestIp(req) { return req.socket?.remoteAddress ?? ''; }

  function ensureJoinRate(ip) {
    const time = clock();
    const key = ip || 'unknown';
    let record = joinAttempts.get(key);
    if (record && time - record.startedAt >= JOIN_WINDOW_MS) {
      joinAttempts.delete(key);
      record = null;
    }
    if (!record) {
      if (joinAttempts.size >= JOIN_RATE_KEYS) {
        for (const [knownIp, knownRecord] of joinAttempts) {
          if (time - knownRecord.startedAt >= JOIN_WINDOW_MS) joinAttempts.delete(knownIp);
        }
        if (joinAttempts.size >= JOIN_RATE_KEYS) throw new Error('join rate limit table is full');
      }
      record = { startedAt: time, count: 0 };
      joinAttempts.set(key, record);
    }
    record.count += 1;
    if (record.count > JOIN_LIMIT) throw new Error('join attempt rate limit exceeded');
  }
  function ensureCreateRate(ip) {
    const time = clock();
    const key = ip || 'unknown';
    let record = createAttempts.get(key);
    if (!record || time - record.startedAt >= CREATE_WINDOW_MS) {
      if (!record && createAttempts.size >= CREATE_RATE_KEYS) createAttempts.delete(createAttempts.keys().next().value);
      record = { startedAt: time, count: 0 };
      createAttempts.set(key, record);
    }
    record.count += 1;
    if (record.count > CREATE_LIMIT) throw new Error('room creation rate limit exceeded');
  }

  function worldReadyAtSpawn() {
    try {
      const pose = spawn({ seat: 1, playerId: 'readiness_probe' });
      if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z)) return false;
      if (world.readyAt(pose.x, pose.z, 2) !== true) return false;
      const sample = world.sampleSurface(pose.x, pose.z, pose.y);
      return !!sample && sample.ready !== false && Number.isFinite(sample.height);
    } catch { return false; }
  }

  class ExplorerRoom extends Room {
    messages = {
      input: (client, payload) => this.processMessage(client, { type: 'input', input: payload?.input ?? payload }),
      action: (client, payload) => this.processMessage(client, { type: 'action', action: payload?.action ?? payload }),
      subscribe: (client) => this.subscribeClient(client),
    };

    onCreate({ sessionKey } = {}) {
      this.sessionKey = sessionKey;
      this.session = sessionsByKey.get(sessionKey);
      if (!this.session) throw new Error('room session unavailable');
      this.maxClients = 8;
      this.autoDispose = false;
      this.maxMessagesPerSecond = 60;
      this.connections = new Map();
      this.subscribed = new Set();
      this.metadata = this.session.getDirectory();
      roomSessions.set(this.roomId, { roomId: this.roomId, session: this.session });
      this.setSimulationInterval(() => this.stepAndPublish(), 1000 / 30);
    }

    async onAuth(_client, options = {}) {
      const playerId = this.session.authenticatePlayer(options.playerCredential);
      if (!playerId || !this.session.canAttachConnection(playerId)) throw new Error('invalid player credential');
      return { playerId };
    }

    onJoin(client, _options, auth = {}) {
      if (!this.session.attachConnection(auth.playerId, client.sessionId)) {
        client.leave(4001);
        return;
      }
      client.userData = { playerId: auth.playerId };
      this.connections.set(auth.playerId, client);


      this.setMetadata(this.session.getDirectory());
    }

    subscribeClient(client) {
      const playerId = client.userData?.playerId;
      if (!playerId) return;
      this.subscribed.add(playerId);
      client.send('snapshot', this.session.snapshotFor(playerId));
      sendAdminEvents(this.session, this, [playerId]);
    }
    processMessage(client, message) {
      const playerId = client.userData?.playerId;
      if (!playerId) return;
      client.send('ack', this.session.receive(playerId, message));
    }

    stepAndPublish() {
      const output = this.session.tick();
      if (output.disposed) {
        void this.disconnect(4002);
        return;
      }
      for (const { playerId, snapshot } of output.snapshots) {
        const client = this.connections.get(playerId);
        if (!client || !this.subscribed.has(playerId)) continue;
        if ((client.ref?.bufferedAmount ?? 0) > MAX_OUTBOUND_BUFFER) {
          client.leave(4008);
          continue;
        }
        client.send('snapshot', snapshot);
      }
      sendAdminEvents(this.session, this, this.session.connectedPlayerIds());
      this.setMetadata(this.session.getDirectory());
    }

    onLeave(client) {
      const playerId = client.userData?.playerId;
      if (!playerId) return;
      this.connections.delete(playerId);
      this.subscribed.delete(playerId);
      this.session.disconnect(playerId);
      this.setMetadata(this.session.getDirectory());
    }

    onDispose() {
      roomSessions.delete(this.roomId);
      sessionsByKey.delete(this.sessionKey);
      sessions.delete(this.session);
    }
  }

  const transport = new WebSocketTransport({
    maxPayload: MAX_HTTP_BODY,
    verifyClient: (info, next) => {
      const address = info.req?.socket?.remoteAddress ?? '';
      const allowed = isOriginAllowed(info.origin, address);
      next(allowed, allowed ? undefined : 403, allowed ? undefined : 'Origin not allowed');
    },
  });

  const gameServer = new Server({
    transport,
    logger: console,
    express: (app) => {
      app.disable('x-powered-by');
      app.use(express.json({ limit: MAX_HTTP_BODY, strict: true }));
      app.use((req, res, next) => {
        const origin = req.get('origin');
        if (origin && !isOriginAllowed(origin, requestIp(req))) return res.status(403).json({ error: 'origin not allowed' });
        if (origin) {
          res.set('Access-Control-Allow-Origin', origin);
          res.set('Vary', 'Origin');
          res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
          res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
        }
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
      });

      app.get('/healthz', (_req, res) => {
        const ready = worldReadyAtSpawn();
        res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', worldVersion: world.worldVersion ?? world.version });
      });
      app.get('/api/directory', (_req, res) => {
        res.json([...sessions].filter((session) => !session.closed).map((session) => session.getDirectory()));
      });

      app.post('/api/rooms', async (req, res) => {
        try {
          ensureCreateRate(requestIp(req));
          if (sessions.size >= MAX_ACTIVE_ROOMS) return res.status(503).json({ error: 'room capacity reached' });
          if (!worldReadyAtSpawn()) return res.status(503).json({ error: 'world is not ready' });
          const session = createExplorerSession({ world, vehicles, spawn, clock, randomToken, pendingAttachmentMs });
          const collision = [...sessions].some((entry) => entry.roomCode === session.roomCode || entry.roomId === session.roomId);
          if (collision) return res.status(503).json({ error: 'room creation unavailable' });
          const sessionKey = randomUUID();
          sessionsByKey.set(sessionKey, session);
          sessions.add(session);
          try {
            const created = await matchMaker.createRoom('explorer', { sessionKey });
            session.setRoomId(created.roomId);
            const localRoom = await matchMaker.getLocalRoomById(created.roomId);
            localRoom?.setMetadata(session.getDirectory());
            res.status(201).json({ roomCode: session.roomCode, adminCredential: session.adminCredential, roomId: created.roomId });
          } catch (error) {
            sessionsByKey.delete(sessionKey);
            sessions.delete(session);
            throw error;
          }
        } catch (error) { res.status(400).json({ error: safeError(error) }); }
      });

      app.post('/api/join', (req, res) => {
        try {
          ensureJoinRate(requestIp(req));
          const session = [...sessions].find((entry) => entry.roomCode === req.body?.code && !entry.closed);
          if (!session) return res.status(404).json({ error: 'room not found' });
          if (req.body?.roomId !== undefined && req.body.roomId !== session.roomId) return res.status(404).json({ error: 'room not found' });
          const player = session.join({ code: req.body?.code, ip: requestIp(req), adminCredential: req.body?.adminCredential });
          res.status(201).json({ ...player, roomId: session.roomId });
        } catch (error) { res.status(/rate limit/i.test(error?.message ?? '') ? 429 : 400).json({ error: safeError(error) }); }
      });

      app.post('/api/rooms/:roomId/reconnect', (req, res) => {
        try {
          const session = sessionByRoomId(req.params.roomId);
          if (!session) return res.status(404).json({ error: 'room not found' });
          const player = session.reconnect({ playerId: req.body?.playerId, reconnectCredential: req.body?.reconnectCredential });
          res.json({ ...player, roomId: session.roomId });
        } catch (error) { res.status(400).json({ error: safeError(error) }); }
      });

      app.post('/api/rooms/:roomId/admin', async (req, res) => {
        try {
          const session = sessionByRoomId(req.params.roomId);
          if (!session) return res.status(404).json({ error: 'room not found' });
          const action = req.body?.command;
          const result = session.command(req.body?.credential, action);
          const localRoom = await matchMaker.getLocalRoomById(session.roomId);
          if (localRoom) {
            localRoom.setMetadata(session.getDirectory());
            if (action?.type === 'lock') localRoom.lock();
            if (action?.type === 'unlock') localRoom.unlock();
            if (action?.type === 'kick') {
              const client = localRoom.clients.find((entry) => entry.userData?.playerId === action.playerId);
              if (client) client.leave(4001);
            }
            if (action?.type === 'close') await localRoom.disconnect(4002);
            sendAdminEvents(session, localRoom, session.connectedPlayerIds());
          }
          res.json(result);
        } catch (error) { res.status(400).json({ error: safeError(error) }); }
      });

      app.post('/api/rooms/:roomId/leave', async (req, res) => {
        try {
          const session = sessionByRoomId(req.params.roomId);
          if (!session) return res.status(404).json({ error: 'room not found' });
          const playerId = session.authenticatePlayer(req.body?.playerCredential);
          if (!playerId) throw new Error('invalid player credential');
          const removed = session.leave(playerId);
          const localRoom = await matchMaker.getLocalRoomById(session.roomId);
          const client = localRoom?.clients.find((entry) => entry.userData?.playerId === playerId);
          if (client) client.leave(4000);
          if (localRoom) sendAdminEvents(session, localRoom, session.connectedPlayerIds());
          res.json({ ok: removed });
        } catch (error) { res.status(400).json({ error: safeError(error) }); }
      });

      app.use((error, _req, res, _next) => {
        const tooLarge = error?.type === 'entity.too.large';
        res.status(tooLarge ? 413 : 400).json({ error: tooLarge ? 'request too large' : 'invalid request' });
      });
    },
  });
  gameServer.define('explorer', ExplorerRoom);

  return Object.freeze({
    async listen(port = Number(process.env.PORT ?? 2567), hostname = process.env.HOST ?? '127.0.0.1') {
      await gameServer.listen(port, hostname);
      return gameServer.transport.server?.address();
    },
    address: () => gameServer.transport.server?.address() ?? null,
    async close() {
      await gameServer.gracefullyShutdown(false);
      sessionsByKey.clear();
      roomSessions.clear();
      sessions.clear();
    },
    server: gameServer,
  });
}

async function main() {
  const config = await loadWorldConfig();
  const app = createExplorerServer(config);
  const address = await app.listen();
  process.stdout.write(`City Explorer multiplayer listening on ${typeof address === 'object' ? `${address.address}:${address.port}` : address}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
