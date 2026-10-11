'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:4188';
const output = path.resolve('test-artifacts/quality-audit/continuation');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  let analyticsAttempts = 0;
  const cityModules = new Set();
  const errors = [], remoteFailures = new Set(), pending = new Map(), checks = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === new URL(base).origin && /\/(?:app|road-orientation-fix)\.js$/.test(url.pathname)) cityModules.add(url.href);
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.status() >= 400 && url.origin !== new URL(base).origin)
      remoteFailures.add(response.status() + ' ' + url.origin + url.pathname);
  });
  await page.route('https://firestore.googleapis.com/**', route => { analyticsAttempts++; return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Local denied-analytics fixture' } }) }); });
  await page.route('https://nominatim.openstreetmap.org/search**', route => {
    const query = new URL(route.request().url()).searchParams.get('q');
    if (query.startsWith('QA_')) pending.set(query.split(',')[0], route);
    else return route.continue();
  });
  async function submit(query) {
    const requested = page.waitForRequest(request => request.url().includes('nominatim') && new URL(request.url()).searchParams.get('q')?.startsWith(query));
    await page.locator('#search-input').fill(query);
    await page.locator('#search-submit').click();
    await requested;
    for (let i = 0; i < 50 && !pending.has(query); i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(pending.has(query), 'fixture request intercepted');
  }
  async function answer(query, name) {
    await pending.get(query).fulfill({ contentType: 'application/json', body: JSON.stringify([{ display_name: name, lat: '44.303', lon: '-78.32', type: 'street' }]) }).catch(() => {});
  }
  try {
    await page.goto(base + '/city-explorer/?qa=1&lite=1', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
    await page.locator('#search-button').click();
    await submit('QA_OLD');
    await submit('QA_NEW');
    await answer('QA_NEW', 'QA New result');
    await page.locator('#search-results').getByRole('button', { name: /QA New result/ }).waitFor();
    await answer('QA_OLD', 'QA Old result');
    await page.waitForTimeout(150);
    checks.push({ name: 'latest-query-owns-results', pass: !(await page.locator('#search-results').innerText()).includes('QA Old result') });
    await submit('QA_CLOSED');
    await page.keyboard.press('Escape');
    await answer('QA_CLOSED', 'QA Closed result');
    await page.waitForTimeout(150);
    checks.push({ name: 'closed-dialog-discards-results', pass: !(await page.locator('#search-results').innerText()).includes('QA Closed result') });
    checks.push({ name: 'search-results-live-region', pass: await page.locator('#search-results').getAttribute('aria-live') === 'polite' });
    if (!process.env.PTBO_SEARCH_ONLY) for (const number of [2, 3]) {
      await page.goto(base + '/city-explorer/?station=' + number + '&lite=1', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
      assert.equal(await page.locator('#station-select').inputValue(), String(number));
      assert.equal(await page.evaluate(() => __PTBO_GAMEPLAY__.station.number), number);
      await page.locator('#play-mode').click();
      await page.locator('canvas').first().focus();
      await page.keyboard.press('KeyE');
      await page.waitForFunction(() => __PTBO_GAMEPLAY__.state().mode === 'driving', null, { timeout: 5000 });
      const before = await page.evaluate(() => __PTBO_GAMEPLAY__.state().truck);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW');
      const after = await page.evaluate(() => __PTBO_GAMEPLAY__.state().truck);
      checks.push({ name: 'station-' + number + '-departure', pass: Math.hypot(after.x - before.x, after.z - before.z) > 1 && [after.x, after.y, after.z].every(Number.isFinite), displacement: Math.hypot(after.x - before.x, after.z - before.z) });
      await page.screenshot({ path: path.join(output, 'station-' + number + '.png') });
    }
    const build = await page.evaluate(() => PTBO_BUILD.version);
    checks.push({ name: 'city-entry-and-app-use-active-cache-token', pass: cityModules.size === 2 && [...cityModules].every(url => new URL(url).searchParams.get('v') === build), modules: [...cityModules] });
    checks.push({ name: 'denied-analytics-bounded-per-page', pass: analyticsAttempts === (process.env.PTBO_SEARCH_ONLY ? 1 : 3), attempts: analyticsAttempts });
    const report = { checks, errors, remoteFailures: [...remoteFailures], remoteResponsesFixtures: true, analyticsTransportFixture: 'HTTP 403; external analytics writes intercepted' };
    fs.writeFileSync(path.join(output, 'search-stations.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    assert.ok(checks.every(check => check.pass), 'all extended runtime checks passed');
    assert.equal(errors.length, 0);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
