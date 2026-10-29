/* Focused real-Leaflet regression. Run with Playwright on NODE_PATH and its
 * default browser, or set PTBO_CHROMIUM_EXECUTABLE (same as scene browser QA). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
// Reuse the static-server pattern from feedback-editor-browser.cjs; external
// tiles are blocked, while the simulator and Leaflet run without substitutes.
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.setHeader('Content-Type', ({'.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.html':'text/html'})[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
const fixture = {
  name: `O'Brien & <img src="/missing-popup-image" onerror="window.popupExecution++">`,
  sub: `Fire <svg onload="window.popupExecution++"></svg> & Rescue`,
  addr: `12 <a href="javascript:window.popupExecution++">King's</a> Street & \"Annex\"`,
};
async function inspectPopup(page, label) {
  const popup = page.locator('.leaflet-popup-content');
  await popup.waitFor({state:'visible'});
  // Allow injected image-error/SVG-load events to run before observing effects.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const actual = await popup.evaluate(element => ({
    text:element.innerText, bold:element.querySelector('b')?.textContent,
    elements:[...element.querySelectorAll('*')].map(node => node.tagName),
    executed:window.popupExecution,
  }));
  assert.equal(actual.executed, 0, `${label}: source text must not execute events`);
  assert.deepEqual(actual.elements, ['B', 'BR', 'BR'], `${label}: only the intended popup formatting is created`);
  assert.equal(actual.bold, fixture.name, `${label}: literal name retains bold formatting`);
  assert.equal(actual.text, `${fixture.name}\n${fixture.sub}\n${fixture.addr}`, `${label}: all three fields remain literal visible text`);
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({headless:true, executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE || undefined, args:['--no-sandbox','--disable-dev-shm-usage']});
    const page = await browser.newPage({viewport:{width:1365,height:900}});
    await page.route('https://**/*', route => route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/response-simulator/index.html?analytics=off`);
    await page.locator('#service-choice button[data-service=fire]').click();
    await page.waitForFunction(() => Boolean(mapInstance));
    await page.evaluate(fields => {
      window.popupExecution = 0;
      dispatchDatabase.splice(0, dispatchDatabase.length, {...dispatchDatabase[0], ...fields, lat:simLat, lng:simLng});
    }, fixture);
    if (await page.locator('#control-panel').evaluate(element => element.classList.contains('minimized'))) await page.locator('#menu-toggle').click();
    await page.locator('#btn-toggle-locations').click();
    await page.evaluate(() => allLocationsLayerGroup.getLayers()[0].openPopup());
    const failures = [];
    try { await inspectPopup(page, 'seed/show-all'); console.log('PASS seed/show-all literal popup'); }
    catch (error) { failures.push(error.message); }
    await page.evaluate(() => { mapInstance.closePopup(); window.popupExecution = 0; });
    await page.locator('.leaflet-popup-content').waitFor({state:'detached'});
    const answers = ['Fire', fixture.sub, fixture.name, fixture.addr];
    const dialogs = [];
    page.on('dialog', async dialog => {
      dialogs.push(dialog.type());
      await dialog.accept(dialog.type() === 'prompt' ? answers.shift() : undefined);
    });
    await page.locator('button[onclick="recordCurrentLocation()"]').click();
    await page.waitForFunction(() => allLocationsLayerGroup.getLayers().length === 2);
    await page.evaluate(() => allLocationsLayerGroup.getLayers()[1].openPopup());
    try { await inspectPopup(page, 'custom-add'); console.log('PASS custom-add literal popup'); }
    catch (error) { failures.push(error.message); }
    assert.deepEqual(dialogs, ['prompt','prompt','prompt','prompt','alert'], 'custom-add uses the actual prompt/save path');
    assert.deepEqual(answers, [], 'all custom input fields were consumed');
    assert.deepEqual(failures, [], 'both dispatch popup paths safely render source text');
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
