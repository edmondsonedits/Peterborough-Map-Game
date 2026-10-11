'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4188';
const output = path.resolve('test-artifacts/quality-audit/continuation');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const reports = [];
  for (const surface of ['canonical', 'mobile']) {
    const mobile = surface === 'mobile';
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    await context.route('https://firestore.googleapis.com/**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED' } }) }));
    await context.route('https://www.gstatic.com/firebasejs/**', route => route.abort());
    const page = await context.newPage(), errors = [], dialogs = [], missing = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.dismiss(); });
    page.on('response', response => { if (response.url().startsWith(base) && response.status() >= 400) missing.push(response.status() + ' ' + new URL(response.url()).pathname); });
    try {
      await page.goto(base + (mobile ? '/geo-guesser/mobile/' : '/geo-guesser/'));
      const game = mobile ? page.frames().find(frame => frame !== page.mainFrame()) : page;
      if (mobile) await page.frameLocator('#game-frame').locator('#menu').waitFor();
      const frame = mobile ? page.frames().find(frame => frame !== page.mainFrame()) : game;
      await frame.waitForFunction(() => window.PTBO_GEO_MAP_PROVIDER?.readiness().ready);
      async function start(mode) {
        await frame.getByRole('button', { name: 'Play', exact: true }).click();
        await frame.getByRole('button', { name: 'Choose Game Mode', exact: true }).click();
        await frame.locator('[onclick="selectMode(\'' + mode + '\')"]').click();
        await frame.locator('#stations button').first().click();
        await frame.locator('#game').waitFor({ state: 'visible' });
        assert.deepEqual(await frame.evaluate(() => ({ index, history: history.length, elapsed, processing, sessionEnded })), { index: 0, history: 0, elapsed: 0, processing: false, sessionEnded: false });
      }
      async function guess() {
        await frame.locator('[onclick="startDispatch()"]').click();
        await frame.waitForFunction(() => !map._animatingZoom);
        await frame.evaluate(() => { map.stop(); map.setView([target.lat, target.lng], 16, { animate: false, reset: true }); });
        await frame.waitForFunction(() => !map._animatingZoom && meters(map.getCenter().lat, map.getCenter().lng, target.lat, target.lng) < 2);
        await frame.locator('#confirm').click();
        assert.equal(await frame.evaluate(() => Number(history.at(-1).penalty)), 0);
      }
      await start('city-ten');
      const selected = await frame.evaluate(() => locations.filter(location => location.cityTen).length);
      assert.equal(selected, 10);
      for (let round = 0; round < 10; round++) { await guess(); await frame.locator('#next-call').click(); }
      assert.equal(await frame.evaluate(() => history.length), 10);
      assert.equal(await frame.locator('#results').isVisible(), true);
      assert.equal(await frame.locator('#score-row').isVisible(), true);
      await frame.locator('[onclick="returnToMenu()"]').click();
      await start('city-ten'); await guess();
      await frame.evaluate(() => returnToMenu());
      await start('open');
      for (let round = 0; round < 3; round++) { await guess(); if (round < 2) await frame.locator('#next-call').click(); }
      await frame.locator('#end-drill').click();
      assert.match(await frame.locator('#final').innerText(), /3 practice calls completed/);
      assert.equal(await frame.locator('#score-row').isVisible(), false);
      await frame.locator('[onclick="returnToMenu()"]').click();
      await start('open');
      await frame.locator('[onclick="startDispatch()"]').click(); await page.waitForTimeout(350);
      assert.equal(await frame.evaluate(() => elapsed), 0);
      assert.equal(await frame.evaluate(() => reviewLayers), null);
      assert.equal(await frame.evaluate(() => targets.length), 1);
      await frame.locator('#end-drill').click();
      assert.match(await frame.locator('#final').innerText(), /0 practice calls completed/);
      assert.equal(errors.length, 0); assert.equal(missing.length, 0); assert.equal(dialogs.length, 0);
      assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      reports.push({ surface, pass: true, cityTen: 10, openDrill: 3, restartReset: true, errors, dialogs, missing });
    } catch (error) { reports.push({ surface, pass: false, error: error.message, errors, dialogs, missing }); }
    await page.screenshot({ path: path.join(output, 'geo-extended-' + surface + '.png'), fullPage: true });
    await context.close();
  }
  fs.writeFileSync(path.join(output, 'geo-extended.json'), JSON.stringify({ reports, externalWritesIntercepted: true, remoteScoreboardFixture: 'Firebase SDK unavailable' }, null, 2));
  console.log(JSON.stringify(reports));
  await browser.close();
  assert.ok(reports.every(report => report.pass));
})().catch(error => { console.error(error); process.exitCode = 1; });
