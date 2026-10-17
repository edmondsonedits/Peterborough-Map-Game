/* Optional real-browser regression: node tests/geo-focus-browser.cjs http://127.0.0.1:4188 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

(async () => {
  const base = process.argv[2] || 'http://127.0.0.1:4188';
  const out = path.resolve(process.env.PTBO_FOCUS_QA_OUTPUT || 'test-artifacts/quality-batch-20261015');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PTBO_CHROMIUM_EXECUTABLE || undefined });
  const report = { base, scenarios: [], externalWritesIntercepted: true };
  try {
    for (const [surface, service, width, height] of [
      ['desktop', 'fire', 1365, 900], ['desktop', 'ems', 1365, 900],
      ['mobile', 'fire', 390, 844], ['mobile', 'ems', 390, 844],
      ['mobile', 'ems', 844, 390],
      ['online', 'fire', 1365, 900], ['online', 'ems', 1365, 900],
    ]) {
      const name = `${surface}-${service}-${width}x${height}`;
      const context = await browser.newContext({
        ...(surface === 'mobile' ? devices['Pixel 7'] : {}),
        viewport: { width, height }, deviceScaleFactor: 1,
      });
      await context.route('https://firestore.googleapis.com/**', route => route.fulfill({
        status: 403, contentType: 'application/json', body: '{"error":{"message":"Local QA; no telemetry written"}}',
      }));
      const page = await context.newPage();
      const result = { name, errors: [], missing: [], failedRequests: [], cancelledRequests: 0, checks: [] };
      report.scenarios.push(result);
      page.on('pageerror', error => result.errors.push(error.message));
      page.on('response', response => {
        if (response.url().startsWith(base) && response.status() >= 400) result.missing.push(response.url());
      });
      page.on('requestfailed', request => {
        const error = request.failure()?.errorText;
        // Leaflet cancels obsolete tile requests when the tested action changes the map view.
        if (error === 'net::ERR_ABORTED') result.cancelledRequests++;
        else result.failedRequests.push({ url: request.url(), error });
      });
      try {
        await page.goto(`${base}/geo-guesser/${surface}/?city=peterborough&analytics=off`, { waitUntil: 'load' });
        const frame = page.frames().find(item => item.url().includes('/geo-guesser/index.html'));
        assert.ok(frame, 'Geo Guesser wrapper has its game frame');
        await frame.waitForFunction(() => window.PTBO_GEO?.state.ready);
        result.buildVersion = await frame.evaluate(() => window.PTBO_BUILD?.version);
        if (process.env.PTBO_EXPECTED_VERSION) assert.equal(result.buildVersion, process.env.PTBO_EXPECTED_VERSION);
        const activate = locator => surface === 'mobile' ? locator.tap() : locator.click();
        const focused = locator => locator.evaluate(node => document.activeElement === node);
        async function verifyVisibleFocus(locator, label) {
          assert.equal(await focused(locator), true, `${label}: receives focus`);
          assert.equal(await locator.evaluate(node => {
            const rect = node.getBoundingClientRect();
            // Browser scroll offsets round to whole CSS pixels.
            return rect.top >= -1 && rect.bottom <= innerHeight + 1 && rect.left >= -1 && rect.right <= innerWidth + 1;
          }), true, `${label}: focused control is inside viewport`);
        }
        async function verifyMapKeyboard(label) {
          assert.equal(await focused(frame.locator('#map')), true, `${label}: map receives focus`);
          const before = await frame.evaluate(() => PTBO_GEO.state.map.getCenter().lng);
          await page.keyboard.press('ArrowRight');
          await frame.waitForFunction(lng => Math.abs(PTBO_GEO.state.map.getCenter().lng - lng) > 1e-7, before, { timeout: 2000 });
          result.checks.push(`${label}: ArrowRight pans map`);
        }
        async function verifyPracticeControlsLayout(label) {
          const layout = await frame.evaluate(() => {
            const box = selector => {
              const r = document.querySelector(selector).getBoundingClientRect();
              return { left:r.left, right:r.right, top:r.top, bottom:r.bottom };
            };
            return { controls:box('#practice-controls'), next:box('#practice-continue'), confirm:box('#confirm'), width:innerWidth, height:innerHeight };
          });
          assert.ok(layout.next.left >= -1 && layout.next.right <= layout.width + 1, `${label}: Next Call stays inside the viewport`);
          assert.ok(layout.controls.bottom <= layout.height + 1 && layout.controls.left >= -1 && layout.controls.right <= layout.width + 1,
            `${label}: practice controls stay inside the viewport`);
          const controlsOverlapConfirm = layout.controls.left < layout.confirm.right && layout.controls.right > layout.confirm.left
            && layout.controls.top < layout.confirm.bottom && layout.controls.bottom > layout.confirm.top;
          assert.equal(controlsOverlapConfirm, false, `${label}: Next Call controls do not overlap Check location`);
        }
        await activate(frame.locator(`#service-${service}`));
        await activate(frame.locator('#difficulty-medium'));
        const startingBase = frame.locator('#practice-stations button').last();
        const startingBaseText = await startingBase.innerText();
        await activate(startingBase);
        await frame.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 15000 });
        const nextCall = frame.locator('#practice-continue');
        assert.equal(await nextCall.isVisible(), true, 'Next Call is available before the first guess');
        await verifyPracticeControlsLayout(name + ' before attempt');
        const targetKey = () => frame.evaluate(() => {
          const t = PTBO_GEO.state.target;
          return JSON.stringify([t.id,t.name,t.addr,t.lat,t.lng]);
        });
        const beforeSkip = await targetKey();
        const completedBeforeSkip = await frame.evaluate(() => PTBO_GEO.state.session.stats.completed);
        await activate(nextCall);
        const afterSkip = await targetKey();
        assert.notEqual(afterSkip, beforeSkip, 'Next Call skips an unattempted address');
        assert.equal(await frame.evaluate(() => PTBO_GEO.state.session.stats.completed), completedBeforeSkip,
          'skipping does not count as a completed call');
        await Promise.all([activate(nextCall), activate(nextCall)]);
        assert.equal(await targetKey(), afterSkip, 'rapid duplicate activation cannot skip an additional call');
        await verifyMapKeyboard('skip before guess');
        await frame.waitForTimeout(320);
        await verifyMapKeyboard('start');
        await activate(frame.locator('#practice-reveal'));
        await activate(frame.locator('#practice-continue'));
        await verifyMapKeyboard('next after reveal');

        // Positioning is a deterministic precondition; all game actions use the UI.
        await frame.evaluate(() => {
          const g = PTBO_GEO;
          g.state.map.setView([g.state.target.lat + 0.02, g.state.target.lng + 0.02], 17, { animate: false });
        });
        await activate(frame.locator('#confirm'));
        assert.equal(await frame.locator('#practice-review-title').innerText(), 'Try again');
        assert.equal(await frame.locator('#confirm').innerText(), 'Try again');
        assert.equal(await frame.locator('#confirm').isVisible(), true, 'Try again remains available after a miss');
        assert.equal(await nextCall.isVisible(), true, 'Next Call coexists with Try again after a miss');
        await verifyPracticeControlsLayout(name + ' after miss');
        await page.waitForTimeout(900);
        await frame.waitForFunction(() => !Object.values(PTBO_GEO.state.map._layers).some(layer => layer._loading === true) && document.querySelector('.leaflet-tile-loaded'));
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(out, `${name}-miss-next-retry.png`) });
        const missedTarget = await targetKey();
        const completedBeforeMissSkip = await frame.evaluate(() => PTBO_GEO.state.session.stats.completed);
        await frame.waitForTimeout(320);
        await activate(nextCall);
        assert.notEqual(await targetKey(), missedTarget, 'Next Call skips the missed address');
        assert.equal(await frame.evaluate(() => PTBO_GEO.state.session.stats.completed), completedBeforeMissSkip,
          'skipping a missed address does not create a completion');
        await verifyMapKeyboard('Next after miss');

        // A fresh miss keeps the same target when the trainee chooses Try again.
        await frame.evaluate(() => {
          const t = PTBO_GEO.state.target;
          PTBO_GEO.state.map.setView([t.lat + 0.02, t.lng + 0.02], 17, { animate: false });
        });
        await activate(frame.locator('#confirm'));
        const retryTarget = await targetKey();
        assert.equal(await frame.locator('#practice-continue').isVisible(), true);
        await activate(frame.locator('#confirm'));
        assert.equal(await targetKey(), retryTarget, 'Try again retains the current address');
        await verifyMapKeyboard('retry');
        await activate(frame.locator('#practice-bases-toggle'));
        await activate(frame.locator('#practice-base-options [aria-pressed="true"]'));
        await verifyMapKeyboard('return to base');

        await frame.evaluate(() => {
          const g = PTBO_GEO;
          g.state.map.setView([g.state.target.lat, g.state.target.lng], 18, { animate: false });
        });
        await page.keyboard.press('Enter');
        assert.equal(await frame.locator('#practice-review-title').innerText(), 'Location found');
        await frame.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(350); // Let Leaflet's tile fade finish before visual evidence.
        const labelsOverlap = await frame.locator('.leaflet-tooltip').evaluateAll(nodes => {
          const a = nodes.find(node => node.textContent === 'Address location')?.getBoundingClientRect();
          const b = nodes.find(node => node.textContent === 'Your guess')?.getBoundingClientRect();
          return !a || !b || (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);
        });
        assert.equal(labelsOverlap, false, 'correct-answer labels are both readable without overlap');
        result.checks.push('correct-answer map labels do not overlap');
        await page.screenshot({ path: path.join(out, `${name}-review.png`) });
        await activate(frame.locator('#practice-continue'));
        await verifyMapKeyboard('next after correct answer');
        await frame.locator('.leaflet-tile-loaded').first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(out, `${name}-practice.png`) });

        const layout = await frame.evaluate(() => {
          const header = document.getElementById('header').getBoundingClientRect();
          const reticle = document.getElementById('reticle').getBoundingClientRect();
          return {
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            headerOverlapsReticle: header.left < reticle.right && header.right > reticle.left && header.top < reticle.bottom && header.bottom > reticle.top,
          };
        });
        assert.equal(layout.overflow, false, 'no horizontal overflow');
        assert.equal(layout.headerOverlapsReticle, false, 'address leaves crosshair visible');
        result.layout = layout;
        await activate(frame.locator('#practice-finish'));
        await verifyVisibleFocus(startingBase, 'Finish restores chosen base');
        assert.equal(await startingBase.innerText(), startingBaseText);
        assert.equal(await startingBase.isVisible(), true);
        result.checks.push('Finish restores visible selected base');
        await activate(frame.locator('.settings-link'));
        await verifyVisibleFocus(frame.locator('#show-cross-streets'), 'Settings checkbox');
        await activate(frame.locator('#settings .primary'));
        await verifyVisibleFocus(frame.locator('.settings-link'), 'Settings launcher after Back');
        result.checks.push('Settings open and back restore useful focus');
        await page.screenshot({ path: path.join(out, `${name}-setup.png`) });
        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.missing, []);
        assert.equal(result.failedRequests.length, 0, JSON.stringify(result.failedRequests.slice(0, 3)));
        result.pass = true;
        console.log(JSON.stringify({ name, pass: true, checks: result.checks.length }));
      } catch (error) {
        result.error = error.message;
        await page.screenshot({ path: path.join(out, `${name}-failure.png`) });
        throw error;
      } finally {
        await context.close();
      }
    }
    report.pass = true;
  } finally {
    fs.writeFileSync(path.join(out, 'focus-browser-report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
