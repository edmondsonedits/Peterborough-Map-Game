// Real browser touch routing: CDP sends simultaneous fingers, not mouse drags.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const [base = 'http://127.0.0.1:8870', label = 'multitouch'] = process.argv.slice(2);
const output = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'test-artifacts/multitouch', label);
const reports = [];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await context.addInitScript(() => localStorage.setItem('ptbo-emergency-stats-mode', 'enabled'));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base.replace(/\/$/, '')}/city-explorer/?qa=1&lite=1&analytics=off`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true'
      && window.__PTBO_CITY_QA__?.input, null, { timeout: 180000 });
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#loading-screen')).opacity) < .01);
    const cdp = await context.newCDPSession(page);
    const points = new Map();
    const touch = async (type, id, x, y) => {
      const released = points.get(id);
      if (type === 'touchEnd') points.delete(id);
      else if (type === 'touchCancel') points.clear();
      else points.set(id, { id, x, y, radiusX: 5, radiusY: 5, force: 1 });
      // CDP touchEnd lists the released contacts, not the remaining contacts.
      await cdp.send('Input.dispatchTouchEvent', { type,
        touchPoints: type === 'touchEnd' ? [released] : [...points.values()] });
      // Pointer moves are coalesced until the browser's next animation frame.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const snapshot = () => page.evaluate(() => ({
      ...window.__PTBO_CITY_QA__.input(),
      player: window.__PTBO_GAMEPLAY__.state().player,
      direction: document.querySelector('#movement-joystick').dataset.direction || '',
      knob: document.querySelector('.joystick-knob').style.transform,
      steering: Number(document.documentElement.dataset.mobileSteering || 0),
      throttle: Number(document.documentElement.dataset.mobileThrottle || 0),
    }));
    const changedYaw = (a, b) => Math.abs(Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))) > .02;
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      for (const mode of ['onFoot', 'driving', 'fly']) {
        for (const lookFirst of [false, true]) {
          await page.evaluate(() => window.__PTBO_GAMEPLAY__.reset());
          await page.locator('#city-canvas').focus();
          if (mode === 'driving') await page.keyboard.press('KeyE');
          if (mode === 'fly') await page.keyboard.press('KeyF');
          await page.waitForFunction(mode => document.documentElement.dataset.gameplayMode === mode, mode);
          const box = await page.locator('#movement-joystick').boundingBox();
          const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
          const r = Math.min(box.width, box.height) * .30;
          const lx = viewport.width * .72, ly = viewport.height * .45;
          assert.equal(await page.evaluate(({x,y}) => document.elementFromPoint(x,y)?.id, {x:lx,y:ly}), 'city-canvas');
          const initial = await snapshot();
          if (lookFirst) await touch('touchStart', 2, lx, ly);
          await touch('touchStart', 1, cx, cy-r);
          if (!lookFirst) await touch('touchStart', 2, lx, ly);
          await touch('touchMove', 2, lx+24, ly-12);
          const both = await snapshot();
          assert.ok(changedYaw(initial, both), `${mode}: look must work while stick is held (${lookFirst ? 'look' : 'move'} first)`);
          assert.equal(both.direction, 'forward');
          // Move left and backwards while the looking finger remains down.
          await touch('touchMove', 1, cx-r, cy);
          assert.equal((await snapshot()).direction, 'left');
          await touch('touchMove', 1, cx, cy+r);
          const backwards = await snapshot();
          assert.equal(backwards.direction, 'back');
          if (mode === 'driving') assert.ok(backwards.throttle < 0, 'reverse throttle is independent of look');
          else { assert.ok(backwards.keys.includes('KeyS')); assert.ok(!backwards.keys.includes('KeyW')); }
          // A third finger touching the stick must not steal the first one.
          await touch('touchStart', 3, cx+r, cy);
          assert.equal((await snapshot()).direction, 'back', 'extra finger stole the stick');
          await touch('touchEnd', 3);
          assert.equal((await snapshot()).direction, 'back', 'extra finger release stopped movement');
          await touch('touchMove', 1, cx, cy-r);
          const beforeMove = await snapshot();
          await page.waitForFunction(({mode, before}) => {
            const input = window.__PTBO_CITY_QA__.input();
            const current = mode === 'onFoot' ? Object.values(window.__PTBO_GAMEPLAY__.state().player) : input.position;
            const original = mode === 'onFoot' ? Object.values(before.player) : before.position;
            return Math.hypot(...current.map((v,i) => v-original[i])) > .08;
          }, { mode, before: beforeMove }, { timeout: 15000 });
          // Releasing either control must leave the other working.
          if (lookFirst) {
            await touch('touchEnd', 1);
            const beforeLook = await snapshot();
            await touch('touchMove', 2, lx-24, ly);
            assert.ok(changedYaw(beforeLook, await snapshot()), 'releasing stick stopped look');
            assert.equal((await snapshot()).direction, '');
            await touch('touchEnd', 2);
          } else {
            await touch('touchEnd', 2);
            await touch('touchMove', 1, cx+r, cy);
            assert.equal((await snapshot()).direction, 'right', 'releasing look stopped stick');
            await touch('touchEnd', 1);
          }
          const released = await snapshot();
          assert.equal(released.direction, '');
          assert.equal(released.lookPointerId, null);
          assert.ok(!released.keys.some(k => ['KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(k)));
          assert.equal(released.throttle, 0);
          // Browser gesture cancellation must clear both owners and keys.
          await touch('touchStart', 1, cx, cy-r);
          await touch('touchStart', 2, lx, ly);
          await touch('touchCancel');
          const cancelled = await snapshot();
          assert.equal(cancelled.direction, '');
          assert.equal(cancelled.lookPointerId, null);
          assert.equal(cancelled.throttle, 0);
          assert.ok(!cancelled.keys.some(k => ['KeyW','KeyA','KeyS','KeyD','ShiftLeft'].includes(k)));
          reports.push({ mode, viewport, lookFirst, yawDelta: both.yaw-initial.yaw, status: 'passed' });
          console.log(`PASS ${viewport.width} ${mode} ${lookFirst ? 'look' : 'move'} first`);
        }
      }
      await page.screenshot({ path: path.join(output, `${viewport.width}-controls.png`) });
    }
    // Focus loss clears both controls, and the next gesture can acquire them.
    const stick = await page.locator('#movement-joystick').boundingBox();
    await touch('touchStart', 1, stick.x+stick.width/2, stick.y+stick.height*.2);
    await touch('touchStart', 2, 600, 180);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const blurred = await snapshot();
    assert.equal(blurred.direction, '');
    assert.equal(blurred.lookPointerId, null);
    assert.deepEqual(blurred.keys, []);
    await touch('touchCancel');
    // Mouse drag and keyboard flight must survive the unified pointer path.
    const beforeMouse = await snapshot();
    await page.mouse.move(600, 180);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(650, 170, { steps: 4 });
    await page.mouse.up({ button: 'right' });
    assert.ok(changedYaw(beforeMouse, await snapshot()), 'mouse drag regression');
    const beforeKey = await snapshot();
    await page.keyboard.down('KeyW');
    await page.waitForFunction(before => {
      const p = window.__PTBO_CITY_QA__.input().position;
      return Math.hypot(...p.map((v,i) => v-before[i])) > .08;
    }, beforeKey.position);
    await page.keyboard.up('KeyW');
    assert.deepEqual((await snapshot()).keys, []);
    reports.push({ mode: 'mouse-keyboard-and-focus-loss', status: 'passed' });
    assert.deepEqual(errors, []);
    const version = await page.evaluate(() => window.PTBO_CITY_EXPLORER_BUILD?.version);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ version, reports, errors }, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ reports, error: error.stack }, null, 2));
    throw error;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
