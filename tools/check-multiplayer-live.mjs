#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch {
  ({ chromium } = createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules", 'package.json'))('playwright'));
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'artifacts', 'release-qa', 'multiplayer-live');
const reportDir = path.join(root, '.superpowers', 'sdd', 'multiplayer');
const serverUrl = 'https://city-explorer-multiplayer.onrender.com';
const mapUrl = 'https://edmondsonedits.github.io/Peterborough-Map-Game/city-explorer/';
const expectedWorldVersion = 'b8a4b66d364a519c978649b8';
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11'] });
const contexts = [], pages = [], pageErrors = [], requestFailures = [], report = { startedAt: new Date().toISOString(), serverUrl, mapUrl, expectedWorldVersion, stages: {} };
const progress = (stage, details = {}) => { report.stages[stage] = { at: new Date().toISOString(), ...details }; console.log(JSON.stringify({ progress: stage, ...details })); };

async function makePage({ mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { deviceScaleFactor: 1 }),
  });
  contexts.push(context);
  const page = await context.newPage(); pages.push(page);
  page.on('pageerror', error => pageErrors.push({ viewport: mobile ? 'mobile' : 'desktop', error: error.message }));
  page.on('requestfailed', request => {
    if (request.url().includes(new URL(serverUrl).host)) requestFailures.push({ viewport: mobile ? 'mobile' : 'desktop', url: request.url(), error: request.failure()?.errorText });
  });
  await page.goto(mapUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
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

async function joinByCode(page, code) {
  await openRoomUi(page);
  await page.locator('#ce-roomui-join-code').fill(code);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
}

async function waitActive(page, count) {
  await page.waitForFunction(expected => {
    const api = globalThis.__PTBO_MULTIPLAYER__;
    const snapshot = api?.state?.snapshot;
    return api?.active && snapshot?.player && 1 + (snapshot.players?.length || 0) === expected;
  }, count, { timeout: 90_000 });
}

async function getState(page) {
  return page.evaluate(() => {
    const api = globalThis.__PTBO_MULTIPLAYER__;
    const snapshot = api?.state?.snapshot;
    const players = snapshot?.player ? [snapshot.player, ...(snapshot.players || [])] : [];
    return {
      active: api?.active,
      session: api?.session,
      players: players.map(player => ({ id: player.id, name: player.name, seat: player.seat, mode: player.mode, pose: player.pose })),
      vehicleId: api?.state?.vehicleId,
      actors: api?.actors,
    };
  });
}

async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await page.waitForFunction(() => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0, null, { timeout: 3_000 });
  return cdp;
}

async function touchJoystick(page, cdp, dx, dy, durationMs) {
  const box = await page.locator('#movement-joystick').boundingBox();
  assert.ok(box && box.width >= 100 && box.height >= 100, 'mobile joystick hit target is visible');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx, y: y + dy, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    await page.waitForTimeout(durationMs);
    return {
      speed: await playerSpeed(page),
      gait: await page.locator('#movement-joystick').getAttribute('data-gait'),
      caption: await page.locator('.mobile-control-caption').textContent().catch(() => null),
    };
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {});
  }
}

async function playerSpeed(page) {
  return page.evaluate(() => {
    const pose = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.player?.pose;
    return Number.isFinite(pose?.speed) ? Math.abs(pose.speed) : pose ? Math.hypot(Number(pose.vx) || 0, Number(pose.vz) || 0) : NaN;
  });
}

async function waitSpeed(page, minimum, maximum, label, timeout = 10_000) {
  await page.waitForFunction(test => {
    const pose = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.player?.pose;
    const speed = Number.isFinite(pose?.speed) ? Math.abs(pose.speed) : pose ? Math.hypot(Number(pose.vx) || 0, Number(pose.vz) || 0) : NaN;
    return Number.isFinite(speed) && speed >= test.minimum && speed < test.maximum;
  }, { minimum, maximum }, { timeout, polling: 50 }).catch(error => { throw new Error(`${label}: ${error.message}`); });
  return playerSpeed(page);
}

async function waitRemoteSpeed(page, playerId, minimum, maximum, label) {
  await page.waitForFunction(({ id, min, max }) => {
    const players = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.players || [];
    const player = players.find(entry => entry.id === id);
    const pose = player?.pose;
    const speed = Number.isFinite(pose?.speed) ? Math.abs(pose.speed) : pose ? Math.hypot(Number(pose.vx) || 0, Number(pose.vz) || 0) : NaN;
    return Number.isFinite(speed) && speed >= min && speed < max;
  }, { id: playerId, min: minimum, max: maximum }, { timeout: 10_000, polling: 50 }).catch(error => { throw new Error(`${label}: ${error.message}`); });
}

async function cycleShiftGaits(page, observer, playerId) {
  await page.keyboard.down('w');
  try {
    const walk = await waitSpeed(page, 0.9, 3.0, 'walk gait reached');
    await waitRemoteSpeed(observer, playerId, 0.9, 3.0, 'remote walk snapshot reached');
    const tapShift = async () => { await page.keyboard.press('Shift'); await page.waitForTimeout(950); };
    await tapShift();
    const run = await waitSpeed(page, 2.8, 5.0, 'run gait reached');
    await waitRemoteSpeed(observer, playerId, 2.8, 5.0, 'remote run snapshot reached');
    await tapShift();
    const sprint = await waitSpeed(page, 4.8, 20, 'sprint gait reached');
    await waitRemoteSpeed(observer, playerId, 4.8, 20, 'remote sprint snapshot reached');
    await tapShift();
    const cycledWalk = await waitSpeed(page, 0.9, 2.9, 'gait cycle returned to walk');
    await waitRemoteSpeed(observer, playerId, 0.9, 2.9, 'remote walk-cycle snapshot reached');
    return { walk, run, sprint, cycledWalk };
  } finally { await page.keyboard.up('w'); }
}

async function walkMobileToVehicle(mobile, host, cdp) {
  for (let step = 0; step < 8; step++) {
    const state = await getState(mobile);
    const current = state.players.find(player => player.id === state.session?.playerId);
    assert.ok(current, 'mobile player remains in the authoritative snapshot');
    const nearby = await mobile.evaluate(() => {
      const snapshot = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot;
      const actor = snapshot?.player;
      if (!actor) return null;
      return snapshot.vehicles.map(vehicle => ({ id: vehicle.id, dx: vehicle.pose.x - actor.pose.x, dz: vehicle.pose.z - actor.pose.z, distance: Math.hypot(vehicle.pose.x - actor.pose.x, vehicle.pose.z - actor.pose.z) }))
        .sort((a, b) => a.distance - b.distance)[0] || null;
    });
    assert.ok(nearby, 'station vehicle snapshot exists');
    if (nearby.distance <= 6.2) return { vehicleId: nearby.id, distance: nearby.distance };
    const heading = current.pose.heading;
    const forward = nearby.dx * -Math.sin(heading) + nearby.dz * -Math.cos(heading);
    const right = nearby.dx * Math.cos(heading) - nearby.dz * Math.sin(heading);
    const length = Math.max(0.001, Math.hypot(forward, right));
    await touchJoystick(mobile, cdp, right / length * 30, -forward / length * 30, 650);
    await host.waitForTimeout(100);
  }
  throw new Error('mobile player could not reach an available station vehicle within eight joystick moves');
}

async function driveAndExit(mobile, host, cdp, vehicleId) {
  const action = mobile.locator('#mobile-action-button');
  await mobile.waitForFunction(() => {
    const button = document.querySelector('#mobile-action-button');
    return button && !button.disabled && /enter fire truck/i.test(button.getAttribute('aria-label') || '');
  }, null, { timeout: 15_000 });
  await touchTap(mobile, cdp, '#mobile-action-button');
  await mobile.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.state?.mode === 'driving', null, { timeout: 10_000 });
  await host.waitForFunction(id => globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.some(vehicle => vehicle.id === id && vehicle.driverPlayerId), vehicleId, { timeout: 10_000 });
  const before = await host.evaluate(id => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find(entry => entry.id === id);
    return vehicle ? { x: vehicle.pose.x, z: vehicle.pose.z, heading: vehicle.pose.heading } : null;
  }, vehicleId);
  assert.ok(before, 'desktop peer sees the mobile driver take a vehicle');
  await touchJoystick(mobile, cdp, 34, -40, 1_250);
  await host.waitForFunction(({ id, start }) => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find(entry => entry.id === id);
    if (!vehicle || Math.abs(vehicle.pose.speed) <= 0.1) return false;
    return Math.hypot(vehicle.pose.x - start.x, vehicle.pose.z - start.z) > 0.2
      && Math.abs(Math.atan2(Math.sin(vehicle.pose.heading - start.heading), Math.cos(vehicle.pose.heading - start.heading))) > 0.003;
  }, { id: vehicleId, start: before }, { timeout: 8_000, polling: 50 });
  const driven = await host.evaluate(id => {
    const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find(entry => entry.id === id);
    return vehicle ? { x: vehicle.pose.x, z: vehicle.pose.z, heading: vehicle.pose.heading, speed: vehicle.pose.speed } : null;
  }, vehicleId);
  await touchJoystickUntilVehicleStops(mobile, cdp, vehicleId);
  await mobile.waitForFunction(() => {
    const button = document.querySelector('#mobile-action-button');
    return button && !button.disabled && /exit fire truck/i.test(button.getAttribute('aria-label') || '');
  }, null, { timeout: 10_000 });
  await touchTap(mobile, cdp, '#mobile-action-button');
  await mobile.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.state?.mode === 'onFoot', null, { timeout: 10_000 });
  await host.waitForFunction(id => !globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find(vehicle => vehicle.id === id)?.driverPlayerId, vehicleId, { timeout: 10_000 });
  return { vehicleId, remoteSpeed: driven.speed, movedMetres: Math.hypot(driven.x - before.x, driven.z - before.z) };
}

async function touchJoystickUntilVehicleStops(page, cdp, vehicleId) {
  const box = await page.locator('#movement-joystick').boundingBox();
  assert.ok(box, 'mobile joystick hit target is visible for braking');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 42, id: 1, radiusX: 3, radiusY: 3, force: 1 }] });
    await page.waitForFunction(id => {
      const vehicle = globalThis.__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.find(entry => entry.id === id);
      return vehicle && Math.abs(vehicle.pose.speed) < 0.7;
    }, vehicleId, { timeout: 12_000, polling: 50 });
  } finally { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }).catch(() => {}); }
}

async function touchTap(page, cdp, selector) {
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `${selector} touch target is visible`);
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2, radiusX: 3, radiusY: 3, force: 1 }] });
  await page.waitForTimeout(60);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

try {
  await mkdir(outputDir, { recursive: true });
  await mkdir(reportDir, { recursive: true });
  progress('preflight-start');
  const health = await fetch(`${serverUrl}/healthz`, { cache: 'no-store' });
  assert.equal(health.status, 200, 'live multiplayer backend health check passes');
  const healthPayload = await health.json();
  assert.equal(healthPayload.worldVersion, expectedWorldVersion, 'live backend world matches the release gate');
  report.backend = healthPayload;
  progress('backend-ready', { worldVersion: healthPayload.worldVersion });

  const host = await makePage();
  const pageUrl = host.url();
  assert.equal(new URL(pageUrl).origin, new URL(mapUrl).origin, 'desktop page uses the production Pages origin');
  assert.equal(new URL(pageUrl).search, '', 'desktop page does not rely on a local multiplayer URL override');
  const frontendRelease = await host.evaluate(() => ({
    version: document.documentElement.dataset.cityExplorerBuild,
    multiplayerServerUrl: globalThis.PTBO_MULTIPLAYER_SERVER_URL,
  }));
  assert.equal(frontendRelease.version, '1.6.188', 'Pages has deployed the expected City Explorer version');
  assert.equal(frontendRelease.multiplayerServerUrl, serverUrl, 'Pages points at the live Render backend');
  report.frontendRelease = frontendRelease;
  progress('desktop-ready', { url: pageUrl, ...frontendRelease });
  await openRoomUi(host);
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForFunction(() => globalThis.__PTBO_MULTIPLAYER__?.active && globalThis.__PTBO_MULTIPLAYER__.session?.roomCode, null, { timeout: 90_000 });
  const hostState = await getState(host);
  assert.equal(hostState.session.seat, 1);
  const { roomCode, roomId } = hostState.session;
  progress('desktop-room-created', { roomId, hostSeat: hostState.session.seat });

  const mobile = await makePage({ mobile: true });
  await joinByCode(mobile, roomCode);
  await waitActive(mobile, 2);
  await closeRoomUi(mobile);
  const mobileState = await getState(mobile);
  const seatOf = player => Number(player.seat) || Number(player.name?.match(/^Player ([1-8])$/)?.[1]) || 0;
  const names = mobileState.players.slice().sort((a, b) => seatOf(a) - seatOf(b)).map(player => player.name);
  assert.deepEqual(names, ['Player 1', 'Player 2'], 'both pages show authoritative seat names');
  const hostId = hostState.session.playerId, mobileId = mobileState.session.playerId;
  await Promise.all([
    host.waitForFunction(id => globalThis.__PTBO_MULTIPLAYER__?.actors?.playerIds?.includes(id), mobileId, { timeout: 10_000 }),
    mobile.waitForFunction(id => globalThis.__PTBO_MULTIPLAYER__?.actors?.playerIds?.includes(id), hostId, { timeout: 10_000 }),
  ]);
  progress('two-client-roster-and-remote-actors', { names });

  await openRoomUi(host);
  report.screenshots = [path.join(outputDir, 'multiplayer-live-desktop.png'), path.join(outputDir, 'multiplayer-live-mobile.png')];
  await host.screenshot({ path: path.join(outputDir, 'multiplayer-live-desktop.png') });
  await openRoomUi(mobile);
  await mobile.screenshot({ path: path.join(outputDir, 'multiplayer-live-mobile.png') });
  await closeRoomUi(host); await closeRoomUi(mobile);

  const shiftGaits = await cycleShiftGaits(host, mobile, hostId);
  report.shiftGaits = shiftGaits;
  progress('desktop-shift-walk-run-sprint', shiftGaits);
  await host.waitForTimeout(1_000);

  const cdp = await touchSession(mobile);
  const touchBefore = await getState(mobile);
  const touchGait = await touchJoystick(mobile, cdp, 0, -70, 1_250);
  assert.equal(touchGait.gait, 'sprint', `touch joystick selects sprint (selected ${touchGait.gait})`);
  assert.ok(touchGait.speed > 4.5, `touch joystick reaches sprint speed (${touchGait.speed})`);
  const touchAfter = await getState(mobile);
  assert.ok(Math.hypot(touchAfter.players.find(player => player.id === mobileId).pose.x - touchBefore.players.find(player => player.id === mobileId).pose.x, touchAfter.players.find(player => player.id === mobileId).pose.z - touchBefore.players.find(player => player.id === mobileId).pose.z) > 0.2, 'touch joystick movement changes the mobile authoritative pose');
  report.touchGait = touchGait;
  progress('mobile-touch-joystick-gait', touchGait);

  const approached = await walkMobileToVehicle(mobile, host, cdp);
  const driving = await driveAndExit(mobile, host, cdp, approached.vehicleId);
  progress('mobile-enter-drive-exit', { ...approached, ...driving });

  await Promise.all([host.waitForTimeout(500), mobile.waitForTimeout(500)]);
  assert.deepEqual(pageErrors, [], 'Edge contexts have no page errors');
  report.result = 'pass';
  report.roster = names;
  report.shiftGaits = shiftGaits;
  report.driving = driving;
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures;
  report.screenshots = [path.join(outputDir, 'multiplayer-live-desktop.png'), path.join(outputDir, 'multiplayer-live-mobile.png')];
} catch (error) {
  report.result = 'fail';
  report.error = error?.stack || String(error);
  report.pageErrors = pageErrors;
  report.requestFailures = requestFailures;
  console.error(report.error);
  process.exitCode = 1;
} finally {
  for (const page of pages) await page.evaluate(() => globalThis.__PTBO_MULTIPLAYER__?.leave()).catch(() => {});
  await Promise.allSettled(contexts.map(context => context.close()));
  await browser.close();
  report.finishedAt = new Date().toISOString();
  const reportPath = path.join(reportDir, `live-edge-qa-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ report: reportPath, result: report.result, screenshots: report.screenshots ?? [] }));
}
