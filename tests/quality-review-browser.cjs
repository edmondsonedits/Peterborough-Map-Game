/* Optional integration QA: node tests/quality-review-browser.cjs http://127.0.0.1:4191
 * Uses isolated Chromium contexts and intercepts telemetry. Editor hosting is
 * emulated at its allowed preview origin by default. Set PTBO_EDITOR_LIVE=1
 * to exercise the live editor runtime; only the recovery mismatch JSON is then
 * intercepted as an explicitly reported fixture.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = (process.argv[2] || 'http://127.0.0.1:4191').replace(/\/$/, '');
const out = path.resolve(process.env.PTBO_QA_OUTPUT || process.env.PTBO_REVIEW_QA_OUTPUT || 'test-artifacts/quality-review');
const only = process.env.PTBO_REVIEW_QA_ONLY?.split(',');
const editorOrigin = 'https://peterborough-3d-map-editor-preview.dans-host.chatgpt.site';
const editorLive = process.env.PTBO_EDITOR_LIVE === '1';
const expectedVersion = process.env.PTBO_EXPECTED_VERSION;
const routeCity = process.env.PTBO_ROUTE_QA_CITY || 'peterborough';
fs.mkdirSync(out, { recursive: true });
const rect = locator => locator.evaluate(n => {
  const r = n.getBoundingClientRect();
  return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
});
function disjoint(a, b, label) {
  assert.ok(a.right <= b.x || a.x >= b.right || a.bottom <= b.y || a.y >= b.bottom, label);
}
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const reports = [];
  async function check(name, mobile, fn) {
    if (only && !only.includes(name)) return;
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, hasTouch: mobile });
    await context.route('https://firestore.googleapis.com/**', r => r.fulfill({ status: 403, contentType: 'application/json', body: '{}' }));
    const page = await context.newPage(), report = { name, errors: [], missing: [], failed: [], consoleErrors: [] };
    page.setDefaultTimeout(25000);
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') report.consoleErrors.push(e.text()); });
    page.on('response', r => { if ((r.url().startsWith(base) || r.url().startsWith(editorOrigin)) && r.status() >= 400) report.missing.push(r.status() + ' ' + r.url()); });
    page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') report.failed.push({ url: r.url(), error: r.failure()?.errorText }); });
    try {
      report.detail = await fn(page, context, report);
      const versions = [];
      for (const frame of page.frames()) {
        try {
          const version = await frame.evaluate(() => window.PTBO_BUILD?.version || null);
          if (version) versions.push({ url: frame.url(), version });
        } catch {}
      }
      report.buildVersions = versions;
      if (expectedVersion && versions.some(entry => entry.version !== expectedVersion)) {
        throw new Error(`Expected build ${expectedVersion}; observed ${JSON.stringify(versions)}`);
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'no horizontal overflow');
      assert.deepEqual(report.errors, [], 'no uncaught browser errors');
      assert.deepEqual(report.missing, [], 'no missing local assets');
      assert.deepEqual(report.failed.filter(r => !r.expected), [], 'no unexpected failed requests');
      report.pass = true;
    } catch (e) { report.pass = false; report.error = e.stack; }
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true }).catch(() => {});
    reports.push(report);
    fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify({ base, reports, telemetryIntercepted: true }, null, 2));
    console.log(JSON.stringify({ name, pass: report.pass, error: report.error?.split('\n')[0] }));
    await context.close();
  }
  try {
    for (const [service, mobile] of [['fire', false], ['ems', true]]) await check('route-' + service, mobile, async (page, context) => {
      await context.addInitScript(() => localStorage.setItem('ptboSelectedCity', 'toronto'));
      await page.goto(base + '/route-mapping/?city=' + routeCity);
      await page.waitForFunction(() => window.PTBO_ROUTE_MAPPING);
      assert.equal(await page.evaluate(() => PTBO_CITY_PACKAGE.id), routeCity);
      assert.equal(await page.evaluate(() => localStorage.getItem('ptboSelectedCity')), routeCity, 'explicit city takes precedence and updates the remembered city');
      await page.locator('#settings-button').click();
      await page.locator('#service-select').selectOption(service);
      await page.locator('#settings-form button[type=submit]').click();
      await page.locator('#settings-button').click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#settings-button').evaluate(n => document.activeElement === n), true);
      await page.waitForTimeout(900); // Complete the call's animated map fit before checking tile readiness.
      await page.waitForFunction(() => !Object.values(PTBO_ROUTE_MAPPING.state.map._layers).some(l => l._loading === true) && [...document.querySelectorAll('.leaflet-tile')].some(t => t.complete && t.naturalWidth));
      await page.waitForTimeout(350);
      const notice = await rect(page.locator('#ptbo-training-use-notice'));
      disjoint(notice, await rect(page.locator('.dispatch-card')), 'training notice leaves complete call card readable');
      assert.ok(notice.width >= 44 && notice.height >= 44, 'training notice has a usable touch target');
      assert.match(await page.locator('#ptbo-training-use-notice').getAttribute('aria-label'), /Not for live response/);
      await page.screenshot({ path: path.join(out, 'route-' + service + '-ready.png') });
      const before = await page.evaluate(() => {
        const s = PTBO_ROUTE_MAPPING.state, c = s.traceCore;
        const route = c.between(c.snap(s.startMarker.getLatLng(), 260), c.snap({ lat: s.call.lat, lng: s.call.lng }, 520));
        if (!route) throw Error('No reference route');
        const samples = [{ ...route.start, travel: 0 }];
        let travel = 0;
        for (const e of route.edges) {
          const count = Math.ceil(e.distance / 4);
          for (let i = 1; i <= count; i++) samples.push({ lat: e.start.lat + (e.end.lat - e.start.lat) * i / count, lng: e.start.lng + (e.end.lng - e.start.lng) * i / count, travel: travel + e.distance * i / count });
          travel += e.distance;
        }
        window.qaRoutePoints = samples;
        return { service: s.service, base: s.base.name, call: s.call.id, callCount: s.callCount, distance: route.distance, samples: samples.length };
      });
      const touch = mobile ? await context.newCDPSession(page) : null;
      const drawing = { chunks: 0, nativeEvents: 0, zooms: [] };
      // Long routes cannot encode street junctions in a city-wide integer pixel.
      // Practice at street scale, releasing and re-grabbing END between sections.
      // Only the viewport and intended pointer path are fixtures: route state is
      // produced entirely by native mouse/touch input, including pause/continue.
      let index = 0;
      while (index < before.samples - 1) {
        const chunk = await page.evaluate(({ index, metres }) => {
          const s = PTBO_ROUTE_MAPPING.state;
          let end = index + 1;
          while (end < qaRoutePoints.length - 1 && qaRoutePoints[end].travel - qaRoutePoints[index].travel < metres) end++;
          const points = qaRoutePoints.slice(index, end + 1);
          s.map.fitBounds(points.map(p => [p.lat, p.lng]), { paddingTopLeft: [60, 150], paddingBottomRight: [60, 190], maxZoom: 18, animate: false });
          const rect = s.map.getContainer().getBoundingClientRect();
          return {
            end, zoom: s.map.getZoom(),
            points: points.filter((p, i) => i % 2 === 0 || i === points.length - 1).map(p => {
              const q = s.map.latLngToContainerPoint(p);
              return { x: q.x + rect.left, y: q.y + rect.top };
            })
          };
        }, { index, metres: mobile ? 180 : 500 });
        await page.waitForTimeout(80);
        const box = await page.locator('#draw-surface').boundingBox();
        assert.ok(box, 'END remains available for continued drawing');
        const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        else { await page.mouse.move(start.x, start.y); await page.mouse.down(); }
        for (const p of chunk.points.slice(1)) {
          if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
          else await page.mouse.move(p.x, p.y);
          drawing.nativeEvents++;
        }
        if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
        drawing.chunks++; drawing.zooms.push(chunk.zoom); index = chunk.end;
        const status = await page.evaluate(end => {
          const s = PTBO_ROUTE_MAPPING.state;
          return { mode: s.mode, gap: s.playerRoute ? s.traceCore.distance(s.playerRoute.endpoint, qaRoutePoints[end]) : Infinity };
        }, index);
        if (status.mode === 'editing') break;
        assert.ok(status.gap <= 70, `Route stopped following native input in section ${drawing.chunks}: ${status.gap.toFixed(1)} m behind`);
      }
      await page.waitForFunction(() => PTBO_ROUTE_MAPPING.state.mode === 'editing');
      await page.locator('#submit-button').click();
      await page.locator('#results').waitFor({ state: 'visible' });
      const review = await page.locator('#results').innerText();
      assert.match(review, /100% efficient/, 'native tracing of the reference path preserves the route and score');
      for (const selector of ['#zoom-in', '#zoom-out']) {
        const zoom = await rect(page.locator(selector));
        disjoint(zoom, await rect(page.locator('#results')), 'zoom controls leave every route result readable');
        assert.ok(zoom.width >= 44 && zoom.height >= 44, 'zoom controls retain touch targets');
      }
      await page.waitForFunction(() => !Object.values(PTBO_ROUTE_MAPPING.state.map._layers).some(l => l._loading === true) && [...document.querySelectorAll('.leaflet-tile')].some(t => t.complete && t.naturalWidth));
      await page.screenshot({ path: path.join(out, 'route-' + service + '-review.png') });
      await page.locator('#next-button').click();
      assert.equal(await page.evaluate(() => PTBO_ROUTE_MAPPING.state.callCount), before.callCount + 1);
      await page.locator('#clear-button').click();
      assert.equal(await page.evaluate(() => PTBO_ROUTE_MAPPING.state.playerRoute), null);
      return { ...before, review, notice, drawing, pointer: mobile ? 'emulated touch' : 'mouse', rememberedCity: routeCity, loadedCity: routeCity };
    });
    await check('route-error-retry', false, async (page, context, report) => {
      await page.route('**/osm-public-roads.geojson*', r => r.abort());
      await page.goto(base + '/route-mapping/?city=peterborough&analytics=off');
      await page.locator('#loading-error').waitFor({ state: 'visible' });
      const message = await page.locator('#loading-error-message').innerText();
      report.failed.forEach(r => { if (r.url.includes('/osm-public-roads.geojson')) r.expected = true; });
      await page.screenshot({ path: path.join(out, 'route-loading-error.png') });
      await page.unroute('**/osm-public-roads.geojson*');
      await page.locator('#retry-button').click();
      await page.waitForFunction(() => window.PTBO_ROUTE_MAPPING);
      return { message, deliberateRoadRequestFailure: true, retryReady: true };
    });
    for (const service of ['fire', 'ems']) await check('history-' + service, service === 'ems', async page => {
      await page.addInitScript(() => localStorage.setItem('ptboResponseVisualTutorialSeenV1', '1'));
      let first;
      for (let pass = 0; pass < 2; pass++) {
        if (!pass) await page.goto(base + (service === 'ems' ? '/response-simulator/mobile/' : '/response-simulator/play/') + '?city=peterborough&analytics=off');
        else await page.reload();
        await page.locator('#service-choice [data-service="' + service + '"]').click({ timeout: 45000 });
        const frame = page.frames().find(f => f !== page.mainFrame());
        await frame.waitForFunction(() => window.PTBO_SERVICE?.state.selected && window.PTBO_TRAINING_HISTORY);
        await page.waitForTimeout(1200);
        const skip = page.getByRole('button', { name: 'Skip', exact: true });
        if (await skip.isVisible().catch(() => false)) await skip.click();
        await frame.locator('#hud-action-btn').click();
        await frame.waitForFunction(() => simulationState === STATES.ENROUTE);
        await frame.evaluate(() => { simLat = activeArrivalPoint.lat; simLng = activeArrivalPoint.lng; evaluateDistanceToTarget(); });
        await frame.waitForFunction(() => simulationState === STATES.ONSCENE);
        if (service === 'ems') {
          await frame.waitForFunction(() => simulationState === STATES.TRANSPORTING, null, { timeout: 12000 });
          await frame.evaluate(() => { simLat = activeArrivalPoint.lat; simLng = activeArrivalPoint.lng; evaluateDistanceToTarget(); });
        }
        await frame.waitForFunction(() => simulationState === STATES.INSERVICE, null, { timeout: 12000 });
        const entries = await frame.evaluate(() => PTBO_TRAINING_HISTORY.exportData().entries);
        assert.equal(entries.length, pass + 1);
        if (!pass) first = entries[0];
        else {
          assert.notEqual(entries[0].id, first.id);
          assert.deepEqual(entries.find(e => e.id === first.id), first, 'reload preserves prior completion exactly');
        }
      }
      return { service, completionsAfterReload: 2, previousCompletionUnchanged: true, arrivalCoordinatesSetByTest: true };
    });
    await check('city-editor-responsive', false, async (page, context) => {
      if (!editorLive) await context.route(editorOrigin + '/**', async r => {
        const u = new URL(r.request().url()), response = await r.fetch({ url: base + u.pathname + u.search });
        await r.fulfill({ response });
      });
      await page.goto(editorOrigin + '/city-explorer/?editor=1&analytics=off', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.classList.contains('is-editor') && document.getElementById('loading-screen').classList.contains('is-hidden'), null, { timeout: 180000 });
      await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      const assets = page.locator('#city-editor-left'), inspector = page.locator('#city-editor-inspector');
      assert.equal(await assets.isVisible(), true); assert.equal(await inspector.isVisible(), true);
      const notice = page.locator('#ptbo-training-use-notice');
      disjoint(await rect(notice), await rect(inspector), 'desktop notice leaves inspector readable');
      await page.locator('#city-editor-search').fill('tree');
      await page.screenshot({ path: path.join(out, 'city-editor-desktop.png') });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(250);
      assert.notEqual(await assets.isVisible(), await inspector.isVisible(), 'narrowing desktop leaves exactly one drawer open');
      await page.locator('[data-editor-panel-toggle="assets"]').click();
      if (!await assets.isVisible()) await page.locator('[data-editor-panel-toggle="assets"]').click();
      assert.equal(await inspector.isVisible(), false);
      await page.locator('[data-editor-panel-toggle="inspector"]').click();
      assert.equal(await inspector.isVisible(), true); assert.equal(await assets.isVisible(), false);
      disjoint(await rect(notice), await rect(inspector), 'narrow notice leaves inspector readable');
      disjoint(await rect(notice), await rect(page.locator('#city-editor-transform-toolbar')), 'notice leaves toolbar clear');
      disjoint(await rect(notice), await rect(page.locator('#city-editor-status')), 'notice leaves actions clear');
      disjoint(await rect(page.locator('.control-panel')), await rect(page.locator('#city-editor-status')), 'editor menu leaves actions clear');
      disjoint(await rect(page.locator('.control-panel')), await rect(inspector), 'editor menu leaves inspector clear');
      await page.screenshot({ path: path.join(out, 'city-editor-phone.png') });
      await page.setViewportSize({ width: 667, height: 375 });
      await page.waitForTimeout(200);
      disjoint(await rect(notice), await rect(inspector), 'landscape notice leaves inspector readable');
      disjoint(await rect(notice), await rect(page.locator('#city-editor-transform-toolbar')), 'landscape notice leaves toolbar clear');
      disjoint(await rect(page.locator('.control-panel')), await rect(inspector), 'landscape editor menu leaves inspector clear');
      disjoint(await rect(page.locator('.control-panel')), await rect(page.locator('#city-editor-status')), 'landscape editor menu leaves actions clear');
      await page.screenshot({ path: path.join(out, 'city-editor-landscape.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[data-editor-exit]').click();
      await page.locator('#play-mode').click();
      await page.locator('canvas').first().focus(); await page.keyboard.press('KeyE');
      await page.waitForFunction(() => __PTBO_GAMEPLAY__.state().mode === 'driving');
      disjoint(await rect(page.locator('.help-panel')), await rect(page.locator('.current-street-box')), 'driving instructions and street readout are separate');
      disjoint(await rect(page.locator('.help-panel')), await rect(page.locator('#interaction-prompt')), 'driving instructions and exit prompt are separate');
      await page.screenshot({ path: path.join(out, 'city-driving-desktop.png') });
      return { editorOriginEmulated: !editorLive, liveEditorRuntime: editorLive, panelsExclusiveAt390: true, helpAndStreetSeparated: true };
    });
    await check('city-phone-controls', true, async page => {
      await page.goto(base + '/city-explorer/?analytics=off&authored=1', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true' && document.getElementById('loading-screen').classList.contains('is-hidden'), null, { timeout: 180000 });
      await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      await page.waitForFunction(() => ['ready', 'failed'].includes(globalThis.__PTBO_AUTHORED_SCENE__?.status().status));
      const authoredScene = await page.evaluate(() => __PTBO_AUTHORED_SCENE__.status());
      assert.equal(authoredScene.bridgeReady, true, 'authored bridge patches the running CitySplatLayer class');
      assert.equal(authoredScene.status, 'ready', authoredScene.error || 'authored layer initializes');
      const notice = page.locator('#ptbo-training-use-notice');
      disjoint(await rect(notice), await rect(page.locator('#mobile-action-button')), 'notice leaves touch action clear');
      await page.locator('#mobile-action-button').tap();
      await page.waitForFunction(() => __PTBO_GAMEPLAY__.state().mode === 'driving');
      disjoint(await rect(notice), await rect(page.locator('.vehicle-instruments')), 'notice leaves speed and gear readable');
      disjoint(await rect(notice), await rect(page.locator('.current-street-box')), 'notice leaves current street readable');
      const toast = page.locator('#toast.is-visible');
      await toast.waitFor({ state: 'attached' });
      assert.match(await toast.innerText(), /Fire Rescue Engine 1 ready/i);
      const toastRect = await rect(toast), locationRect = await rect(page.locator('.location-panel'));
      assert.ok(toastRect.right <= locationRect.x || toastRect.x >= locationRect.right || toastRect.bottom <= locationRect.y || toastRect.y >= locationRect.bottom,
        `truck-entry toast stays clear of the phone location panel: toast=${JSON.stringify(toastRect)} location=${JSON.stringify(locationRect)}`);
      await page.screenshot({ path: path.join(out, 'city-driving-phone.png') });
      await page.locator('#mobile-action-button').tap();
      await page.waitForFunction(() => __PTBO_GAMEPLAY__.state().mode === 'onFoot');
      await page.locator('#mobile-menu-toggle').tap(); await page.locator('#fly-mode').tap();
      await page.locator('.mobile-flight-pad').waitFor({ state: 'visible' });
      disjoint(await rect(notice), await rect(page.locator('.mobile-flight-pad')), 'notice leaves flight touch controls clear');
      await page.setViewportSize({ width: 667, height: 375 });
      disjoint(await rect(notice), await rect(page.locator('.mobile-flight-pad')), 'landscape notice leaves flight touch controls clear');
      await page.screenshot({ path: path.join(out, 'city-flight-phone-landscape.png') });
      return { emulatedTouch: true, enterExitTruck: true, flyMode: true, controlsClear: true, authoredScene };
    });
    await check('city-draft-recovery', false, async (page, context) => {
      let changedPublication = false;
      if (editorLive) {
        await context.route(editorOrigin + '/**/data/editor/peterborough-details.json', async r => {
          const response = await r.fetch();
          if (changedPublication) {
            const published = await response.json();
            published.updatedAt = '2026-10-15T12:00:00.000Z';
            await r.fulfill({ response, json: published });
          } else await r.fulfill({ response });
        });
      } else {
        await context.route(editorOrigin + '/**', async r => {
          const u = new URL(r.request().url()), response = await r.fetch({ url: base + u.pathname + u.search });
          if (changedPublication && u.pathname.endsWith('/data/editor/peterborough-details.json')) {
          const published = await response.json();
          published.updatedAt = '2026-10-15T12:00:00.000Z';
          await r.fulfill({ response, json: published });
          } else await r.fulfill({ response });
        });
      }
      const editorEntry = editorOrigin + '/city-explorer/?editor=1&analytics=off';
      async function enter() {
        await page.goto(editorEntry, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.classList.contains('is-editor') && document.getElementById('loading-screen').classList.contains('is-hidden'), null, { timeout: 180000 });
        await page.locator('#loading-screen').waitFor({ state: 'hidden' });
      }
      await enter();
      await page.getByRole('button', { name: 'Place Tree', exact: true }).click();
      await page.mouse.click(900, 650);
      await page.waitForFunction(() => document.querySelector('[data-editor-label]').value === 'Tree');
      const label = page.locator('[data-editor-label]');
      await label.fill('QA immediate-navigation tree');
      // Blur commits the real inspector field; navigate in the same task, before
      // the250ms autosave debounce. This deliberately exercises pagehide.
      // Keep the editor origin (and its localStorage) while testing its root legal route.
      // In local-proxy mode, this same-origin request is served from the local preview.
      const legalUrl = new URL('/legal/', editorOrigin).href;
      await page.evaluate(url => { document.activeElement.blur(); location.assign(url); }, legalUrl);
      await page.waitForURL(url => url.pathname === '/legal/');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ptbo-city-editor-draft-v1')));
      assert.ok(saved.document.objects.some(o => o.label === 'QA immediate-navigation tree'));
      assert.equal(typeof saved.baseIdentity, 'string');
      changedPublication = true;
      await enter();
      const dialog = page.locator('#city-editor-recovery');
      await dialog.waitFor({ state: 'visible' });
      assert.match(await dialog.innerText(), /published city has changed/i);
      await page.screenshot({ path: path.join(out, 'city-draft-mismatch.png') });
      const downloadPending = page.waitForEvent('download');
      await page.locator('[data-recovery-action="export"]').click();
      const download = await downloadPending;
      const exportedPath = path.join(out, download.suggestedFilename());
      await download.saveAs(exportedPath);
      assert.ok(JSON.parse(fs.readFileSync(exportedPath, 'utf8')).document.objects.some(o => o.label === 'QA immediate-navigation tree'));
      assert.equal(await dialog.isVisible(), true, 'export leaves recovery decision open');
      assert.equal(await page.evaluate(() => localStorage.getItem('ptbo-city-editor-draft-v1') !== null), true);
      await page.locator('[data-recovery-action="recover"]').click();
      assert.equal(await dialog.isVisible(), false);
      await page.locator('[data-editor-undo]').click();
      await page.locator('[data-editor-redo]').click();
      await page.locator('[data-editor-exit]').click();
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('ptbo-city-editor-draft-v1')).document.objects.some(o => o.label === 'QA immediate-navigation tree')), true);
      return { actualPlacementAndLabelEdit: true, immediateNavigationPreservedEdit: true, changedPublicationFixture: true, changedPublicationFixtureScope: 'published-details JSON updatedAt only', editorRuntime: editorLive ? 'live' : 'local proxy', mismatchWarning: true, exportedOriginalDraft: true, recoveryUndoRedo: true, publicationAttempted: false };
    });
    await check('geo-small-landscape', true, async page => {
      await page.setViewportSize({ width: 667, height: 375 });
      await page.goto(base + '/geo-guesser/mobile/?city=peterborough&analytics=off');
      const frame = page.frames().find(f => f.url().includes('/geo-guesser/index.html'));
      await frame.waitForFunction(() => window.PTBO_GEO?.state.ready);
      await frame.locator('#service-ems').tap(); await frame.locator('#difficulty-hard').tap();
      // Choose the longest real eligible call as a deterministic layout fixture.
      const target = await frame.evaluate(() => {
        const s = PTBO_GEO.state, pool = PTBO_STATION_PRACTICE.serviceLocations(s.locations, s.service, s.difficulty);
        pool.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
        s.locations = [pool[0]];
        return { name: pool[0].name, address: pool[0].addr };
      });
      await frame.locator('.base-button').first().tap();
      await frame.locator('#practice-reveal').tap();
      await frame.locator('.leaflet-tile-loaded').first().waitFor(); await page.waitForTimeout(350);
      const header = frame.locator('#header');
      disjoint(await rect(header), await rect(frame.locator('#reticle')), 'long call panel leaves crosshair clear');
      await header.evaluate(n => { n.scrollTop = n.scrollHeight; });
      const h = await rect(header), end = await rect(frame.locator('#practice-review-detail'));
      assert.ok(end.bottom <= h.bottom && end.y >= h.y, 'final review text can be read fully');
      await page.screenshot({ path: path.join(out, 'geo-small-landscape-review.png') });
      await frame.locator('#practice-continue').tap();
      assert.equal(await frame.locator('#map').evaluate(n => document.activeElement === n), true);
      return { target, finalReviewReadable: true, crosshairClear: true, emulatedPhone: true };
    });
  } finally { await browser.close(); }
  if (reports.some(r => !r.pass)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
