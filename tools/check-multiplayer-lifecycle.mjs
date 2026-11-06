#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  ({ chromium } = createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules", 'package.json'))('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = path.join(root, '.superpowers', 'sdd', 'multiplayer', 'screenshots');
await mkdir(screenshots, { recursive: true });
const outputProbe = path.join(screenshots, `.write-probe-${process.pid}`);
await writeFile(outputProbe, 'ok', { flag: 'wx' });
await rm(outputProbe);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const mapUrl = process.env.MAP_QA_URL || 'http://127.0.0.1:4188';
const serverUrl = process.env.MAP_QA_MULTIPLAYER_SERVER_URL || 'http://127.0.0.1:2567';
const appUrl = `${mapUrl}/city-explorer/?station=1&quality=balanced&qaMultiplayerWorld=1&multiplayerServer=${encodeURIComponent(serverUrl)}`;
const failures = [], pageErrors = [], contexts = [];
const touchSessions = new WeakMap();
const progress = (stage, details = {}) => console.log(JSON.stringify({ progress: stage, ...details }));

function poseDistance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
async function makePage({ mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { deviceScaleFactor: 1 }),
  });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes(new URL(serverUrl).host)) failures.push({ url: request.url(), error: request.failure()?.errorText });
  });
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations && globalThis.__PTBO_MULTIPLAYER__, null, { timeout: 180_000 });
  return page;
}

async function openRoomUi(page) {
  await page.evaluate(() => globalThis.__PTBO_MULTIPLAYER__.open());
  await page.locator('.ce-roomui-panel').waitFor({ state: 'visible', timeout: 5_000 });
}

async function closeRoomUi(page) {
  const panel = page.locator('.ce-roomui-panel');
  if (await panel.isVisible()) await page.locator('.ce-roomui-close').click();
}

async function roomState(page) {
  return page.evaluate(() => {
    const multiplayer = globalThis.__PTBO_MULTIPLAYER__;
    const snapshot = multiplayer?.state?.snapshot;
    return {
      active: multiplayer?.active,
      session: multiplayer?.session,
      state: multiplayer?.state,
      players: snapshot?.player
      ? [snapshot.player, ...(snapshot.players || [])].map(({ id, name, seat, vehicleId, mode }) => ({ id, name, seat, vehicleId, mode }))
        : [],
      visualActors: multiplayer?.actors ?? null,
    };
  });
}

async function directoryRoom(roomId) {
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/directory`, { cache: 'no-store' });
  assert.equal(response.status, 200, 'directory responds successfully');
  return (await response.json()).find((room) => room.id === roomId) ?? null;
}

async function waitDirectoryCount(roomId, count, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let room;
  do {
    room = await directoryRoom(roomId);
    if (room?.count === count) return room;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(room?.count, count, `room directory count is ${count}`);
  return room;
}

async function waitUiError(page, expected) {
  await page.waitForFunction((pattern) => {
    const status = document.querySelector('.ce-roomui-status[data-error="true"]')?.textContent || '';
    return new RegExp(pattern, 'i').test(status);
  }, expected, { timeout: 15_000 });
}

async function submitCode(page, code) {
  await openRoomUi(page);
  await page.locator('#ce-roomui-join-code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

async function toggleRoomLock(page, toLocked) {
  const before = toLocked ? 'lock' : 'unlock';
  const after = toLocked ? 'unlock' : 'lock';
  await openRoomUi(page);
  const button = page.locator('[data-action="admin-lock"]');
  await page.waitForFunction((expected) => document.querySelector('[data-action="admin-lock"]')?.dataset.lockType === expected, before, { timeout: 15_000 });
  await button.click();
  await page.waitForFunction((expected) => document.querySelector('[data-action="admin-lock"]')?.dataset.lockType === expected, after, { timeout: 15_000 });
}

async function waitJoined(page, count) {
  await page.waitForFunction((expected) => {
    const snapshot = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot;
    return globalThis.__PTBO_MULTIPLAYER__?.active && snapshot?.player && 1 + (snapshot.players?.length || 0) === expected;
  }, count, { timeout: 90_000 });
}

async function touchJoystick(page, dx, dy, { durationMs = 350, stopWhenStopped = false } = {}) {
  const box = await page.locator('#movement-joystick').boundingBox();
  assert.ok(box, 'touch joystick has a rendered hit target');
  const cdp = await touchSessionFor(page);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  try {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    if (stopWhenStopped) {
      await page.waitForFunction(() => {
        const speed = globalThis.__PTBO_MULTIPLAYER__?.state?.authoritativePose?.speed;
        return Number.isFinite(speed) && Math.abs(speed) < 0.7;
      }, null, { timeout: 8_000, polling: 50 });
    } else {
      await page.waitForTimeout(durationMs);
    }
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
  }
}

async function touchSessionFor(page) {
  let cdp = touchSessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    touchSessions.set(page, cdp);
  }
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.waitForFunction(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0, null, { timeout: 2_000 });
  return cdp;
}

async function touchTap(page, selector) {
  const cdp = await touchSessionFor(page);
  const box = await page.locator(selector).boundingBox();
  if (!box) {
    const diagnostics = await page.evaluate((query) => {
      const element = document.querySelector(query);
      const actionWrap = element?.closest('.mobile-action-wrap');
      const root = document.querySelector('#touch-controls');
      const inspect = (node) => node ? {
        display: getComputedStyle(node).display,
        visibility: getComputedStyle(node).visibility,
        rect: (() => { const value = node.getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height }; })(),
      } : null;
      return {
        gameplayMode: document.documentElement.dataset.gameplayMode,
        touchClasses: root?.className,
        appClasses: document.querySelector('#app')?.className,
        coarse: matchMedia('(pointer: coarse)').matches,
        action: element ? { disabled: element.disabled, label: element.getAttribute('aria-label') } : null,
        actionStyle: inspect(element),
        actionWrapStyle: inspect(actionWrap),
        rootStyle: inspect(root),
        prompt: document.querySelector('#interaction-prompt')?.textContent,
      };
    }, selector);
    throw new Error(`${selector} has no rendered touch hit target: ${JSON.stringify(diagnostics)}`);
  }
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2, radiusX: 3, radiusY: 3, force: 1 }] });
  await page.waitForTimeout(70);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function assertRoomConsensus(pages, expectedCount, roomId) {
  const expectedNames = Array.from({ length: expectedCount }, (_, index) => `Player ${index + 1}`);
  await Promise.all(pages.map(async (page) => {
    await waitJoined(page, expectedCount);
    await page.waitForFunction((count) => {
      const api = globalThis.__PTBO_MULTIPLAYER__;
      const snapshot = api?.state?.snapshot;
      if (!api?.actors || !snapshot?.player) return false;
      const remoteOnFootIds = [snapshot.player, ...(snapshot.players || [])]
        .filter((player) => player.id !== api.session?.playerId && player.mode === 'onFoot')
        .map((player) => player.id).sort();
      return JSON.stringify(api.actors.playerIds.slice().sort()) === JSON.stringify(remoteOnFootIds);
    }, expectedCount, { timeout: 10_000 });
    const current = await roomState(page);
    const seatOf = (actor) => Number(actor.seat) || Number(actor.name?.match(/^Player ([1-8])$/)?.[1]) || 0;
    const names = current.players.slice().sort((a, b) => seatOf(a) - seatOf(b)).map((actor) => actor.name);
    assert.deepEqual(names, expectedNames, 'every client sees the fixed seat names in order');
    const vehicleIds = current.state.snapshot.vehicles.map((vehicle) => vehicle.id);
    assert.equal(new Set(vehicleIds).size, vehicleIds.length, 'snapshot vehicle IDs are unique');
    assert.ok(current.visualActors, 'renderer diagnostics are available');
    assert.equal(new Set(current.visualActors.vehicleIds).size, current.visualActors.vehicleIds.length, 'rendered vehicle catalog IDs are unique');
    assert.equal(new Set(current.visualActors.visibleVehicleIds).size, current.visualActors.visibleVehicleIds.length, 'each rendered vehicle ID appears once');
    assert.deepEqual(current.visualActors.visibleVehicleIds.slice().sort(), vehicleIds.slice().sort(), 'all snapshot vehicles have one visible rendered actor');
    const expectedRemoteOnFootIds = current.players
      .filter((actor) => actor.id !== current.session.playerId && actor.mode === 'onFoot')
      .map((actor) => actor.id).sort();
    assert.deepEqual(current.visualActors.playerIds.slice().sort(), expectedRemoteOnFootIds, 'renderer has exactly one remote on-foot actor per eligible player');
    assert.deepEqual(current.visualActors.singleplayerFleetVisible, [], 'single-player fleet actors stay hidden in the room');
  }));
  const directory = await waitDirectoryCount(roomId, expectedCount);
  assert.equal(directory.capacity, 8);
  return expectedNames;
}

async function attemptTouchMove(page) {
  const joystick = page.locator('#movement-joystick');
  const box = await joystick.boundingBox();
  assert.ok(box && box.width >= 100 && box.height >= 100, 'mobile movement joystick is visible at the touch viewport');
  const capability = await page.evaluate(() => ({
    coarse: matchMedia('(pointer: coarse)').matches,
    touchPoints: navigator.maxTouchPoints,
  }));
  assert.equal(capability.coarse, true, 'mobile context presents a coarse pointer');
  assert.ok(capability.touchPoints > 0, 'mobile context has touch input');
  await closeRoomUi(page);
  const before = (await roomState(page)).state.renderedPose;
  const direction = await page.evaluate(() => {
    const snapshot = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot;
    const actor = snapshot?.player;
    if (!actor) return { dx: 0, dy: -40, target: null };
    const nearest = snapshot.vehicles.map((vehicle) => ({
      vehicle,
      dx: vehicle.pose.x - actor.pose.x,
      dz: vehicle.pose.z - actor.pose.z,
    })).sort((a, b) => Math.hypot(a.dx, a.dz) - Math.hypot(b.dx, b.dz))[0];
    if (!nearest) return { dx: 0, dy: -40, target: null };
    const heading = actor.pose.heading;
    const forward = nearest.dx * -Math.sin(heading) + nearest.dz * -Math.cos(heading);
    const right = nearest.dx * Math.cos(heading) - nearest.dz * Math.sin(heading);
    const length = Math.max(0.001, Math.hypot(forward, right));
    return { dx: right / length * 32, dy: -forward / length * 32, target: nearest.vehicle.id };
  });
  await touchJoystick(page, direction.dx, direction.dy, { durationMs: 350 });
  const after = (await roomState(page)).state.renderedPose;
  assert.ok(poseDistance(before, after) > 0.1, 'touch joystick moves the multiplayer player');
  return { capability, movedMetres: poseDistance(before, after), headedToward: direction.target };
}

async function driveWithTouch(mobile, observer) {
  const button = mobile.locator('#mobile-action-button');
  await mobile.waitForFunction(() => {
    const action = document.querySelector('#mobile-action-button');
    return action && !action.disabled && /enter fire truck/i.test(action.getAttribute('aria-label') || '');
  }, null, { timeout: 15_000 });
  const nearby = await mobile.evaluate(() => {
    const snapshot = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot;
    const actor = snapshot?.player;
    if (!actor) return null;
    return snapshot.vehicles.map((vehicle) => ({ id: vehicle.id, distance: Math.hypot(actor.pose.x - vehicle.pose.x, actor.pose.z - vehicle.pose.z) }))
      .sort((a, b) => a.distance - b.distance)[0] || null;
  });
  assert.ok(nearby && nearby.distance <= 6.5, 'touch action starts within vehicle entry range');
  await touchTap(mobile, '#mobile-action-button');
  await mobile.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.state?.mode === 'driving', null, { timeout: 10_000 });
  const vehicleId = (await roomState(mobile)).state.vehicleId;
  await observer.waitForFunction((id) => globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.some((vehicle) => vehicle.id === id && vehicle.driverPlayerId), vehicleId, { timeout: 10_000 });
  const before = await observer.evaluate((id) => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find((entry) => entry.id === id);
    return vehicle ? { x: vehicle.pose.x, z: vehicle.pose.z, heading: vehicle.pose.heading } : null;
  }, vehicleId);
  assert.ok(before, 'another client sees the newly occupied vehicle');

  await touchJoystick(mobile, 34, -40, { durationMs: 1_350 });
  await observer.waitForFunction(({ id, start }) => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find((entry) => entry.id === id);
    if (!vehicle || Math.abs(vehicle.pose.speed) <= 0.1) return false;
    const moved = Math.hypot(vehicle.pose.x - start.x, vehicle.pose.z - start.z) > 0.2;
    const turn = Math.abs(Math.atan2(Math.sin(vehicle.pose.heading - start.heading), Math.cos(vehicle.pose.heading - start.heading))) > 0.003;
    return moved && turn;
  }, { id: vehicleId, start: before }, { timeout: 8_000, polling: 50 });
  const moving = await observer.evaluate((id) => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find((entry) => entry.id === id);
    return vehicle ? { x: vehicle.pose.x, z: vehicle.pose.z, heading: vehicle.pose.heading, speed: vehicle.pose.speed } : null;
  }, vehicleId);
  assert.ok(Math.abs(moving.speed) > 0.1 && poseDistance(before, moving) > 0.2, 'remote authoritative snapshot shows touch throttle and steering movement');

  await touchJoystick(mobile, 0, 42, { stopWhenStopped: true });
  await mobile.waitForFunction(() => {
    const action = document.querySelector('#mobile-action-button');
    return action && !action.disabled && /exit fire truck/i.test(action.getAttribute('aria-label') || '');
  }, null, { timeout: 10_000 });
  await touchTap(mobile, '#mobile-action-button');
  await mobile.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.state?.mode === 'onFoot', null, { timeout: 10_000 });
  await observer.waitForFunction((id) => !globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find((vehicle) => vehicle.id === id)?.driverPlayerId, vehicleId, { timeout: 10_000 });
  return { vehicleId, remoteSpeed: moving.speed, movedMetres: poseDistance(before, moving) };
}

try {
  progress('preflight-start');
  const health = await fetch(`${serverUrl.replace(/\/$/, '')}/healthz`, { cache: 'no-store' });
  assert.equal(health.status, 200, 'multiplayer server is ready');
  progress('preflight-ready');

  const host = await makePage();
  await openRoomUi(host);
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.active && globalThis.__PTBO_MULTIPLAYER__.session?.roomCode, null, { timeout: 90_000 });
  const hostSession = (await roomState(host)).session;
  assert.equal(hostSession.seat, 1);
  const { roomCode, roomId } = hostSession;
  progress('room-created');

  const mobile = await makePage({ mobile: true });
  await submitCode(mobile, 'WRONG-CODE');
  await waitUiError(mobile, 'room not found|invalid room');
  assert.equal((await directoryRoom(roomId)).count, 1, 'wrong-code join does not reserve a seat');

  await submitCode(mobile, roomCode);
  await waitJoined(mobile, 2);
  await closeRoomUi(mobile);
  const touch = await attemptTouchMove(mobile);
  progress('joined-two-touch-walk', { movedMetres: touch.movedMetres });
  const touchDriving = await driveWithTouch(mobile, host);
  progress('mobile-touch-drive', touchDriving);
  await assertRoomConsensus([host, mobile], 2, roomId);
  progress('roster-two-confirmed');

  await toggleRoomLock(host, true);
  await waitDirectoryCount(roomId, 2);
  assert.equal((await directoryRoom(roomId)).locked, true, 'host lock reaches the public directory');

  const page3 = await makePage();
  await submitCode(page3, roomCode);
  await waitUiError(page3, 'locked');
  assert.equal((await directoryRoom(roomId)).count, 2, 'locked join does not reserve a seat');
  await closeRoomUi(page3);

  await toggleRoomLock(host, false);
  assert.equal((await directoryRoom(roomId)).locked, false, 'host unlock reaches the public directory');
  await submitCode(page3, roomCode);
  await waitJoined(page3, 3);
  await closeRoomUi(page3);

  const page4 = await makePage();
  await submitCode(page4, roomCode);
  await waitJoined(page4, 4);
  await closeRoomUi(page4);
  const atFour = await assertRoomConsensus([host, mobile, page3, page4], 4, roomId);
  progress('roster-four-confirmed');

  const latePages = [];
  for (let expected = 5; expected <= 8; expected += 1) {
    const page = await makePage();
    latePages.push(page);
    await submitCode(page, roomCode);
    await waitJoined(page, expected);
    await closeRoomUi(page);
  }
  const allJoined = [host, mobile, page3, page4, ...latePages];
  const atEight = await assertRoomConsensus(allJoined, 8, roomId);
  assert.deepEqual(atEight, Array.from({ length: 8 }, (_, index) => `Player ${index + 1}`));
  progress('roster-eight-confirmed');

  await openRoomUi(host);
  await host.screenshot({ path: path.join(screenshots, 'multiplayer-lifecycle-eight-desktop.png') });
  await mobile.screenshot({ path: path.join(screenshots, 'multiplayer-lifecycle-eight-touch.png') });

  await host.getByLabel('New host').selectOption({ label: 'Player 2' });
  await host.locator('[data-action="admin-transfer"]').click();
  await host.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.session?.isAdmin === false, null, { timeout: 15_000 });
  await mobile.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.session?.isAdmin === true, null, { timeout: 15_000 });
  progress('admin-transferred');
  await host.evaluate(() => globalThis.__PTBO_MULTIPLAYER__.leave());
  await waitDirectoryCount(roomId, 7);
  progress('old-host-left');
  await host.context().close();

  await mobile.evaluate(() => globalThis.__PTBO_MULTIPLAYER__.open());
  await mobile.locator('[data-action="admin-kick"][data-seat="4"]').click();
  await waitDirectoryCount(roomId, 6);
  progress('player-kicked');
  await page4.waitForFunction(() => {
    const api = globalThis.__PTBO_MULTIPLAYER__;
    return api && api.active === false && api.session === null && api.state === null;
  }, null, { timeout: 15_000 });
  const kickedState = await roomState(page4);
  assert.equal(kickedState.active, false, 'kicked client leaves multiplayer');
  assert.equal(kickedState.session, null, 'kicked client clears its session');
  assert.deepEqual(kickedState.visualActors?.vehicleIds, [], 'kicked client disposes remote vehicle actors');
  assert.deepEqual(kickedState.visualActors?.playerIds, [], 'kicked client disposes remote player actors');
  assert.ok(kickedState.visualActors, 'kicked client renderer diagnostics are available');
  assert.ok(kickedState.visualActors.singleplayerFleetVisible.length > 0, 'kicked client restores single-player fleet actors');
  const expectedFinalNames = ['Player 2', 'Player 3', 'Player 5', 'Player 6', 'Player 7', 'Player 8'];
  await Promise.all([mobile, page3, ...latePages].map((page) => page.waitForFunction((expected) => {
    const snapshot = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot;
    if (!snapshot) return false;
    const names = [snapshot.player, ...(snapshot.players || [])].map((player) => player.name).sort((a, b) => Number(a.slice(7)) - Number(b.slice(7)));
    return JSON.stringify(names) === JSON.stringify(expected);
  }, expectedFinalNames, { timeout: 15_000 })));
  await page4.context().close();

  const survivors = [mobile, page3, ...latePages];
  const finalStates = await Promise.all(survivors.map(roomState));
  assert.ok(finalStates.every((state) => state.players.map((actor) => actor.name).sort().join('|') === expectedFinalNames.slice().sort().join('|')), 'all remaining clients converge after kick and host leave');
  for (const state of finalStates) {
    assert.ok(state.visualActors, 'survivor renderer diagnostics are available after kick');
    const expectedRemoteOnFootIds = state.players
      .filter((actor) => actor.id !== state.session.playerId && actor.mode === 'onFoot')
      .map((actor) => actor.id).sort();
    assert.deepEqual(state.visualActors.playerIds.slice().sort(), expectedRemoteOnFootIds, 'survivor player renderers match remaining remote on-foot players after kick');
    assert.deepEqual(state.visualActors.singleplayerFleetVisible, [], 'single-player fleet remains hidden for surviving clients');
  }
  assert.equal((await directoryRoom(roomId)).count, 6);
  assert.deepEqual(pageErrors, [], 'no browser page errors occurred');

  console.log(JSON.stringify({
    result: 'pass',
    stages: { two: 2, four: atFour.length, eight: atEight.length },
    finalOccupancy: 6,
    touch,
    touchDriving,
    mobileViewport: { width: 390, height: 844, hasTouch: true, isMobile: true },
    vehicleSnapshotIdsUnique: true,
    renderedVehicleInstanceCount: 'checked by __PTBO_MULTIPLAYER__.actors.visibleVehicleIds',
    screenshots: [
      path.join(screenshots, 'multiplayer-lifecycle-eight-desktop.png'),
      path.join(screenshots, 'multiplayer-lifecycle-eight-touch.png'),
    ],
    pageErrors,
    requestFailures: failures,
  }));
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser.close();
}
