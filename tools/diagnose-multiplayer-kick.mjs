#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  ({ chromium } = createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules", 'package.json'))('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mapUrl = process.env.MAP_QA_URL || 'http://127.0.0.1:4188';
const serverUrl = process.env.MAP_QA_MULTIPLAYER_SERVER_URL || 'http://127.0.0.1:2567';
const appUrl = `${mapUrl}/city-explorer/?station=1&quality=balanced&qaMultiplayerWorld=1&multiplayerServer=${encodeURIComponent(serverUrl)}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const contexts = [], socketEvents = new WeakMap(), pageErrors = [];

async function makePage() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  const network = await context.newCDPSession(page);
  const events = [];
  socketEvents.set(page, events);
  network.on('Network.webSocketCreated', () => events.push({ event: 'created' }));
  network.on('Network.webSocketClosed', event => events.push({
    event: 'closed',
  }));
  await network.send('Network.enable');
  await page.addInitScript(() => {
    globalThis.__PTBO_QA_WS_CLOSURES__ = [];
    const NativeWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args);
        socket.addEventListener('close', event => globalThis.__PTBO_QA_WS_CLOSURES__.push({
          code: event.code, reason: String(event.reason || '').slice(0, 100).replace(/https?:\/\/\S+/g, '[url]').replace(/[A-Za-z0-9_-]{40,}/g, '[redacted]'),
          wasClean: event.wasClean,
        }));
        return socket;
      },
    });
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations && globalThis.__PTBO_MULTIPLAYER__, null, { timeout: 180_000 });
  return page;
}

async function openRoomUi(page) {
  await page.evaluate(() => globalThis.__PTBO_MULTIPLAYER__.open());
  await page.locator('.ce-roomui-panel').waitFor({ state: 'visible', timeout: 5_000 });
}

async function directoryRoom(roomId) {
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/directory`, { cache: 'no-store' });
  assert.equal(response.status, 200);
  return (await response.json()).find(room => room.id === roomId) ?? null;
}

async function waitDirectoryCount(roomId, expected, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let room;
  while (Date.now() < deadline) {
    room = await directoryRoom(roomId);
    if (room?.count === expected) return room;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(room?.count, expected, `directory reports ${expected} connected seat(s)`);
}

async function capture(page) {
  return page.evaluate(() => {
    const api = globalThis.__PTBO_MULTIPLAYER__;
    const session = api?.session;
    const state = api?.state;
    const actors = api?.actors;
    return {
      active: api?.active ?? null,
      sessionPresent: session !== null && session !== undefined,
      sessionConnectionStatus: session?.connectionStatus ?? null,
      statePresent: state !== null && state !== undefined,
      stateMode: state?.mode ?? null,
      rendererActorIds: actors ? { vehicles: actors.vehicleIds, players: actors.playerIds } : null,
      singleplayerFleetVisible: actors?.singleplayerFleetVisible ?? null,
      roomStatusText: document.querySelector('.ce-roomui-status')?.textContent?.trim().slice(0, 180) ?? null,
      roomStatusIsError: document.querySelector('.ce-roomui-status')?.dataset.error === 'true',
      // The public QA surface does not expose transport.onStatus directly.
      transportStatusExposed: false,
      websocketCloseEvents: globalThis.__PTBO_QA_WS_CLOSURES__ || [],
    };
  });
}

try {
  assert.equal((await fetch(`${serverUrl.replace(/\/$/, '')}/healthz`, { cache: 'no-store' })).status, 200, 'backend is ready');
  const host = await makePage();
  await openRoomUi(host);
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.active && globalThis.__PTBO_MULTIPLAYER__.session?.roomCode);
  const hostSession = await host.evaluate(() => globalThis.__PTBO_MULTIPLAYER__.session);
  const { roomId, roomCode } = hostSession;

  const guest = await makePage();
  await openRoomUi(guest);
  await guest.locator('#ce-roomui-join-code').fill(roomCode);
  await guest.getByRole('button', { name: 'Join', exact: true }).click();
  await guest.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.active && globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.players?.length === 1, null, { timeout: 90_000 });
  await host.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.players?.length === 1, null, { timeout: 15_000 });
  await waitDirectoryCount(roomId, 2);

  const before = await capture(guest);
  await openRoomUi(host);
  await host.locator('[data-action="admin-kick"][data-seat="2"]').click();
  await waitDirectoryCount(roomId, 1);
  const transitions = [];
  let prior = Symbol('unset');
  const diagnosticDeadline = Date.now() + 5_000;
  while (Date.now() < diagnosticDeadline) {
    const view = await guest.evaluate(() => {
      const api = globalThis.__PTBO_MULTIPLAYER__;
      return {
        active: api?.active ?? null,
        sessionConnectionStatus: api?.session?.connectionStatus ?? null,
        statePresent: api?.state != null,
        roomStatusText: document.querySelector('.ce-roomui-status')?.textContent?.trim().slice(0, 180) ?? null,
        roomStatusIsError: document.querySelector('.ce-roomui-status')?.dataset.error === 'true',
      };
    });
    const key = JSON.stringify(view);
    if (key !== prior) { transitions.push(view); prior = key; }
    await guest.waitForTimeout(100);
  }
  const after = await capture(guest);
  console.log(JSON.stringify({
    result: 'captured',
    occupancyAfterKick: (await directoryRoom(roomId))?.count ?? null,
    kickedClientBefore: before,
    kickedClientAfter: after,
    transportStatusTransitions: transitions,
    transportStatusSurface: 'not exposed on __PTBO_MULTIPLAYER__; sampled safe session.connectionStatus and room UI status',
    kickedClientWebSocketEvents: socketEvents.get(guest),
    kickedClientPageErrors: pageErrors,
  }));
} finally {
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser.close();
}
