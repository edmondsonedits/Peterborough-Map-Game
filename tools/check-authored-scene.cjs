'use strict';

const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4174'] = process.argv.slice(2);
const rootUrl = `${base.replace(/\/$/, '')}/city-explorer/`;

async function waitForBaseGameplay(page) {
  await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
}

async function diagnostics(page) {
  return page.evaluate(() => ({
    status: document.documentElement.dataset.authoredSceneStatus || '',
    enabled: document.documentElement.dataset.authoredSceneEnabled || '',
    count: Number(document.documentElement.dataset.authoredSceneCount || 0),
    gameplayReady: document.documentElement.dataset.gameplayReady || '',
    api: globalThis.__PTBO_AUTHORED_SCENE__?.status?.() || null,
  }));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const disabledPage = await browser.newPage({ viewport: { width: 720, height: 720 } });
    await disabledPage.goto(`${rootUrl}?lite=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForBaseGameplay(disabledPage);
    await disabledPage.waitForFunction(() => Boolean(globalThis.__PTBO_AUTHORED_SCENE__?.status), null, { timeout: 10000 });
    const disabled = await diagnostics(disabledPage);
    if (disabled.status !== 'disabled' || disabled.enabled !== 'false' || disabled.count !== 0) {
      throw new Error(`Authored layer should be disabled by default: ${JSON.stringify(disabled)}`);
    }
    await disabledPage.close();

    const validPage = await browser.newPage({ viewport: { width: 720, height: 720 } });
    await validPage.goto(`${rootUrl}?lite=1&authored=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await waitForBaseGameplay(validPage);
    await validPage.waitForFunction(() => document.documentElement.dataset.authoredSceneStatus === 'ready', null, { timeout: 30000 });
    let valid = await diagnostics(validPage);
    if (valid.count !== 1 || valid.api?.groupChildren !== 1 || !valid.api?.bridgeReady) {
      throw new Error(`Authored scene did not create exactly one proxy: ${JSON.stringify(valid)}`);
    }
    await validPage.evaluate(() => globalThis.__PTBO_AUTHORED_SCENE__.reload());
    await validPage.waitForFunction(() => document.documentElement.dataset.authoredSceneStatus === 'ready', null, { timeout: 15000 });
    valid = await diagnostics(validPage);
    if (valid.count !== 1 || valid.api?.groupChildren !== 1) throw new Error(`Reload duplicated authored proxies: ${JSON.stringify(valid)}`);
    await validPage.evaluate(() => globalThis.__PTBO_AUTHORED_SCENE__.dispose());
    valid = await diagnostics(validPage);
    if (valid.api?.groupChildren !== 0) throw new Error(`Dispose did not clear authored proxies: ${JSON.stringify(valid)}`);
    await validPage.close();

    for (const mode of ['missing', 'corrupt', 'invalid']) {
      const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
      await page.route('**/data/authored/peterborough-details.handoff.json', async route => {
        if (mode === 'missing') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        if (mode === 'corrupt') return route.fulfill({ status: 200, contentType: 'application/json', body: '{broken' });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            format: 'peterborough-authored-scene-handoff',
            formatVersion: 1,
            sourceScene: {
              schemaVersion: 1,
              sceneId: 'invalid-test',
              coordinateSystem: 'WGS84+terrain-relative-meters',
              updatedAt: new Date().toISOString(),
              objects: [{
                id: 'bad', assetId: 'unknown-asset',
                position: { lat: 44.30, lon: -78.32, heightOffsetM: 0 },
                rotationDeg: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
                surfaceMode: 'terrain', source: { kind: '', reference: '', note: '' }, tags: [],
              }],
            },
          }),
        });
      });
      await page.goto(`${rootUrl}?lite=1&authored=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForBaseGameplay(page);
      await page.waitForFunction(() => document.documentElement.dataset.authoredSceneStatus === 'failed', null, { timeout: 30000 });
      const failed = await diagnostics(page);
      if (failed.gameplayReady !== 'true' || failed.count !== 0 || failed.api?.groupChildren !== 0) {
        throw new Error(`${mode} authored scene did not fail open: ${JSON.stringify(failed)}`);
      }
      await page.close();
    }

    console.log('Authored scene browser integration checks passed.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
