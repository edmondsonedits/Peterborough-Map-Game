const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

(async () => {
  const [base = 'http://127.0.0.1:4174', label = 'a', profile = 'full'] = process.argv.slice(2);
  const out = path.resolve('artifacts/visual-qa', label, profile);
  fs.mkdirSync(out, { recursive: true });
  const revision = execFileSync('git', ['-c', `safe.directory=${process.cwd().replaceAll('\\', '/')}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const hash = createHash('sha256');
  for (const name of fs.readdirSync('city-explorer').filter(name => /\.(js|html|css)$/.test(name)).sort()) {
    hash.update(name); hash.update(fs.readFileSync(path.join('city-explorer', name)));
  }
  hash.update(fs.readFileSync('city-explorer/data/manifest.json'));
  const sourceHash = hash.digest('hex');
  fs.writeFileSync(path.join(out, 'source.json'), JSON.stringify({ revision, sourceHash, capturedAt: new Date().toISOString(), scope: 'city-explorer top-level JS/HTML/CSS and data manifest' }, null, 2));
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()); } });
  for (const view of (process.env.CITY_CAPTURE_VIEWS || '05,01,02,03,04').split(',')) {
    await page.goto(`${base}/city-explorer/?capture=${view}&revision=${revision}.${sourceHash}${profile === 'lite' ? '&lite=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    console.log('Loading', view);
    await page.waitForFunction((duration) => {
      const report = document.querySelector('#quality-capture-report');
      if (!report?.textContent) return false;
      return JSON.parse(report.textContent).durationMs >= duration;
    }, view === '05' ? 30000 : 2000, { timeout: 180000 });
    await page.screenshot({ path: path.join(out, `${view}.png`) });
    const report = await page.locator('#quality-capture-report').textContent();
    fs.writeFileSync(path.join(out, `${view}.json`), report);
    console.log(view, report);
  }
  fs.writeFileSync(path.join(out, 'errors.json'), JSON.stringify(errors, null, 2));
  await browser.close();
  if (errors.some(error => /shader|WebGL|Uncaught|SyntaxError/i.test(error))) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
