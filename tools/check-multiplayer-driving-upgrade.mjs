#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (error) { if (process.platform !== 'win32') throw error; ({ chromium } = createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules", 'package.json'))('playwright')); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts', 'multiplayer-driving-upgrade');
await mkdir(output, { recursive: true });
const reportPath = path.join(output, 'report.json');
const base = process.env.MAP_QA_URL || 'http://127.0.0.1:4199';
const backend = process.env.MULTIPLAYER_QA_SERVER || 'http://127.0.0.1:2569';
const url = `${base}/city-explorer/?station=1&quality=balanced&qa=1&qaMultiplayerWorld=1&multiplayerServer=${encodeURIComponent(backend)}`;
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32'
  ? { channel: 'msedge', args: ['--use-angle=d3d11'] }
  : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] }) });
const errors = [], consoleErrors = [], failedRequests = [];
const motion = {};
const criticalConsolePattern = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;
const safeUrl = value => { try { const parsed = new URL(value); parsed.search = ''; return parsed.href; } catch { return '[invalid-url]'; } };
async function pageFor(viewport, mobile = false) {
  // Retain balanced scene coverage and CSS layout while reducing software raster cost.
  const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: process.platform === 'win32' ? 1 : .5 });
  const page = await context.newPage();
  const entry = { context, page };
  // Preserve a partially initialized page for diagnostics when startup itself fails.
  if (mobile) phone = entry; else desktop = entry;
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && criticalConsolePattern.test(message.text())) consoleErrors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push({ url: safeUrl(request.url()), error: request.failure()?.errorText }));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations && globalThis.__PTBO_MULTIPLAYER__, null, { timeout: 180000 });
  return entry;
}
const runtimeState = page => page.evaluate(() => __PTBO_MULTIPLAYER__.state);
let report = { result: 'incomplete', errors: [], failedRequests: [], screenshots: [] };
async function openMap(page, mobile = false) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForFunction(() => !document.pointerLockElement, null, { timeout: 5000 });
  if (mobile) await page.locator('#mobile-menu-toggle').tap();
  await page.locator('#map-mode').click();
  await page.waitForTimeout(300);
  const mapClickState = await page.evaluate(() => ({
    gameplay: __PTBO_GAMEPLAY__.state(), map: __PTBO_MAP_VIEW__?.state(), pointerLock: document.pointerLockElement?.id ?? null,
    button: (() => { const button = document.querySelector('#map-mode'), rect = button.getBoundingClientRect(), style = getComputedStyle(button); return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, display: style.display, visibility: style.visibility, pointerEvents: style.pointerEvents, zIndex: style.zIndex, disabled: button.disabled, className: button.className }; })(),
    rootClass: document.querySelector('#app')?.className,
  }));
  if (mapClickState.gameplay.mode !== 'map') console.error('Map button diagnostics', JSON.stringify(mapClickState));
  await page.waitForFunction(() => globalThis.__PTBO_GAMEPLAY__?.state().mode === 'map', null, { timeout: 10000 });
  if (mobile && await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#mobile-menu-toggle').tap();
}

let desktop, phone;
try {
  desktop = await pageFor({ width: 1280, height: 800 });
  const host = desktop.page;
  const preJoinMode = await host.evaluate(() => __PTBO_GAMEPLAY__.state().mode);
  await host.locator('.ce-roomui-toggle').click();
  await host.getByRole('button', { name: 'Create room' }).click();
  await host.waitForFunction(() => __PTBO_MULTIPLAYER__?.active && __PTBO_MULTIPLAYER__.session?.roomCode, null, { timeout: 30000 });
  const hostSession = await host.evaluate(() => __PTBO_MULTIPLAYER__.session);

  phone = await pageFor({ width: 390, height: 844 }, true);
  const mobile = phone.page;
  await mobile.locator('.ce-roomui-toggle').tap();
  await mobile.locator('#ce-roomui-join-code').fill(hostSession.roomCode);
  await mobile.getByRole('button', { name: 'Join', exact: true }).tap();
  await mobile.waitForFunction(() => __PTBO_MULTIPLAYER__?.active && __PTBO_MULTIPLAYER__.state?.snapshot?.players?.length === 1, null, { timeout: 90000 });
  await host.waitForFunction(() => __PTBO_MULTIPLAYER__.state.snapshot.players.length === 1, null, { timeout: 30000 });
  await host.locator('.ce-roomui-close').click();
  await mobile.locator('.ce-roomui-close').tap();

  // Enter the desktop truck, then verify the map shows the phone player and vehicles.
  await host.locator('#city-canvas').click({ position: { x: 640, y: 400 } });
  const beforeWalk = await runtimeState(host);
  motion.desktopWalk = { input: 'KeyW', before: beforeWalk.renderedPose };
  await host.keyboard.down('w');
  try {
    await host.waitForFunction(({ x, z }) => {
      const pose = __PTBO_MULTIPLAYER__.state.renderedPose;
      return pose && Math.hypot(pose.x - x, pose.z - z) > .2 && /Enter/i.test(document.querySelector('#interaction-prompt')?.textContent || '');
    }, beforeWalk.renderedPose, { timeout: 60000 });
  } finally { await host.keyboard.up('w'); }
  const afterWalk = await runtimeState(host);
  motion.desktopWalk.after = afterWalk.renderedPose;
  assert.ok(Math.hypot(afterWalk.renderedPose.x - beforeWalk.renderedPose.x, afterWalk.renderedPose.z - beforeWalk.renderedPose.z) > 0.2, 'desktop player reached the nearby vehicle');
  await host.keyboard.press('e');
  await host.waitForFunction(() => __PTBO_MULTIPLAYER__.state.mode === 'driving', null, { timeout: 15000 });
  const drivingState = await runtimeState(host), vehicleId = drivingState.vehicleId;
  assert.ok(vehicleId, 'desktop player owns a vehicle');
  await openMap(host);

  // Use the phone joystick to reach and enter its truck.
  const cdp = await phone.context.newCDPSession(mobile);
  const touch = (type, point) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y, id: 1 }] : [] });
  let box = await mobile.locator('#movement-joystick').boundingBox();
  assert.ok(box && box.width > 0, 'phone movement joystick is visible');
  let x = box.x + box.width / 2, y = box.y + box.height / 2;
  const beforeTouchWalk = await runtimeState(mobile);
  motion.phoneWalk = { input: 'touch forward', before: beforeTouchWalk.renderedPose };
  await touch('touchStart', { x, y }); await touch('touchMove', { x, y: y - 55 });
  try {
    await mobile.waitForFunction(({ x, z }) => {
      const pose = __PTBO_MULTIPLAYER__.state.renderedPose;
      return pose && Math.hypot(pose.x - x, pose.z - z) > .2 && document.querySelector('#mobile-action-button')?.disabled === false;
    }, beforeTouchWalk.renderedPose, { timeout: 60000 });
  } finally { await touch('touchEnd'); }
  motion.phoneWalk.after = (await runtimeState(mobile)).renderedPose;
  await host.waitForFunction(() => document.querySelectorAll('#tactical-map-markers [data-kind="truck"]').length > 0 && document.querySelectorAll('#tactical-map-markers [data-kind="player"]').length > 0, null, { timeout: 15000 });
  const markerCounts = await host.evaluate(() => ({
    trucks: document.querySelectorAll('#tactical-map-markers [data-kind="truck"]').length,
    players: document.querySelectorAll('#tactical-map-markers [data-kind="player"]').length,
  }));
  assert.ok(markerCounts.trucks >= 1 && markerCounts.players >= 1, `map markers missing: ${JSON.stringify(markerCounts)}`);
  await mobile.waitForFunction(() => document.querySelector('#mobile-action-button')?.disabled === false, null, { timeout: 15000 });
  await mobile.locator('#mobile-action-button').tap();
  await mobile.waitForFunction(() => __PTBO_MULTIPLAYER__.state.mode === 'driving', null, { timeout: 15000 });
  await openMap(mobile, true);
  const mapState = await host.evaluate(() => ({ gameplay: __PTBO_GAMEPLAY__.state(), map: __PTBO_MAP_VIEW__.state() }));
  assert.equal(mapState.gameplay.mode, 'map');
  assert.equal(mapState.gameplay.mapDriving, false);
  await host.locator('#map-drive-toggle').click();
  await host.waitForFunction(() => document.documentElement.dataset.mapDriving === 'true');
  const beforeDrive = await runtimeState(host);
  motion.desktopDrive = { input: 'KeyW', before: beforeDrive.renderedPose };
  let afterDrive, phoneObserved;
  await host.keyboard.down('w');
  try {
    await host.waitForFunction(({ x, z }) => {
      const pose = __PTBO_MULTIPLAYER__.state.renderedPose;
      return pose && Math.abs(pose.speed) > .1 && Math.hypot(pose.x - x, pose.z - z) > .5;
    }, beforeDrive.renderedPose, { timeout: 60000 });
    afterDrive = await runtimeState(host);
    motion.desktopDrive.after = afterDrive.renderedPose;
    // Observe the peer while the input remains held; do not race deceleration.
    await mobile.waitForFunction(id => {
      const peer = __PTBO_MULTIPLAYER__.state.snapshot.players.find(player => player.id === id);
      return peer?.mode === 'driving' && peer.vehicleId && Math.abs(peer.pose.speed) > .1;
    }, hostSession.playerId, { timeout: 15000 });
    phoneObserved = await mobile.evaluate(id => __PTBO_MULTIPLAYER__.state.snapshot.players.find(player => player.id === id), hostSession.playerId);
  } finally { await host.keyboard.up('w'); }
  assert.equal((await host.evaluate(() => __PTBO_GAMEPLAY__.state().mode)), 'map', 'map mode is preserved while driving');
  assert.equal(await host.evaluate(() => document.documentElement.dataset.mapDriving), 'true');
  assert.ok(Math.abs(afterDrive.renderedPose.speed) > 0.1, 'desktop vehicle drove in map mode');
  assert.ok(Math.hypot(afterDrive.renderedPose.x - beforeDrive.renderedPose.x, afterDrive.renderedPose.z - beforeDrive.renderedPose.z) > 0.5, 'desktop vehicle position changed in map mode');
  assert.equal(phoneObserved.vehicleId, vehicleId);
  await host.screenshot({ path: path.join(output, 'desktop-map-driving.png') });
  await mobile.screenshot({ path: path.join(output, 'phone-observing-drive.png') });

  // Exercise touch input on the phone in map mode; mode stays on the map.
  await mobile.locator('#map-drive-toggle').tap();
  await mobile.waitForFunction(() => document.documentElement.dataset.mapDriving === 'true');
  box = await mobile.locator('#movement-joystick').boundingBox();
  assert.ok(box && box.width > 0, 'touch driving joystick is visible while map driving');
  x = box.x + box.width / 2; y = box.y + box.height / 2;
  const beforeTouchDrive = await runtimeState(mobile);
  motion.phoneDrive = { input: 'touch forward', before: beforeTouchDrive.renderedPose };
  await touch('touchStart', { x, y }); await touch('touchMove', { x, y: y - 50 });
  try {
    await mobile.waitForFunction(({ x, z }) => {
      const pose = __PTBO_MULTIPLAYER__.state.renderedPose;
      return pose && Math.hypot(pose.x - x, pose.z - z) > .25;
    }, beforeTouchDrive.renderedPose, { timeout: 60000 });
  } finally { await touch('touchEnd'); }
  await mobile.waitForFunction(() => __PTBO_GAMEPLAY__.state().mode === 'map' && document.documentElement.dataset.mapDriving === 'true');
  const mobileDriveState = await runtimeState(mobile);
  motion.phoneDrive.after = mobileDriveState.renderedPose;
  assert.ok(Math.hypot(mobileDriveState.renderedPose.x - beforeTouchDrive.renderedPose.x, mobileDriveState.renderedPose.z - beforeTouchDrive.renderedPose.z) > 0.25, 'phone joystick moved the vehicle in map mode');

  await host.evaluate(() => __PTBO_MULTIPLAYER__.leave());
  await host.waitForFunction(() => !__PTBO_MULTIPLAYER__.active, null, { timeout: 15000 });
  const restoredMode = await host.evaluate(() => __PTBO_GAMEPLAY__.state().mode);
  assert.equal(restoredMode, preJoinMode, 'leaving multiplayer restores pre-join mode');
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  report = { result: 'pass', protocolVersion: drivingState.snapshot.protocolVersion, preJoinMode, restoredMode, seats: [hostSession.seat, (await mobile.evaluate(() => __PTBO_MULTIPLAYER__.session)).seat], vehicleId, markerCounts, desktopMapDriveMetres: Math.hypot(afterDrive.renderedPose.x - beforeDrive.renderedPose.x, afterDrive.renderedPose.z - beforeDrive.renderedPose.z), phoneObservedHostSpeed: phoneObserved.pose.speed, mobileMapMode: await mobile.evaluate(() => __PTBO_GAMEPLAY__.state().mode), mobileMapDriving: await mobile.evaluate(() => document.documentElement.dataset.mapDriving), errors, consoleErrors, failedRequests, screenshots: [path.join(output, 'desktop-map-driving.png'), path.join(output, 'phone-observing-drive.png')] };
} catch (error) {
  const failureStates = {};
  for (const [name, entry] of [['desktop', desktop], ['phone', phone]]) {
    if (!entry?.page) continue;
    failureStates[name] = await entry.page.evaluate(() => {
      const multiplayer = globalThis.__PTBO_MULTIPLAYER__?.state;
      return { gameplay: globalThis.__PTBO_GAMEPLAY__?.state(), input: globalThis.__PTBO_CITY_QA__?.input(), dataset: { ...document.documentElement.dataset }, focused: document.activeElement?.id, loading: document.querySelector('#loading-screen')?.innerText,
        multiplayer: multiplayer && { mode: multiplayer.mode, renderedPose: multiplayer.renderedPose, authoritativePose: multiplayer.authoritativePose, compatible: multiplayer.compatible, pausedForWorld: multiplayer.pausedForWorld, pendingInputs: multiplayer.pendingInputs, tick: multiplayer.tick } };
    }).catch(() => null);
    await entry.page.screenshot({ path: path.join(output, `${name}-failure.png`), timeout: 10000 }).catch(() => {});
  }
  console.error(error.stack || error);
  console.error(JSON.stringify({ errors, consoleErrors, failedRequests, failureStates }));
  report = { result: 'fail', error: error.stack || String(error), errors, consoleErrors, failedRequests, failureStates, screenshots: [path.join(output, 'desktop-failure.png'), path.join(output, 'phone-failure.png')] };
  process.exitCode = 1;
} finally {
  await desktop?.context.close(); await phone?.context.close(); await browser.close();
  report.browsersClosed = true;
  report.motion = motion;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
