const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:4174/city-explorer/?pavementQA=1');
    await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
    await page.locator('#play-mode').click();
    await page.locator('canvas').first().focus();
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.documentElement.dataset.gameplayMode === 'driving', null, { timeout: 10000 });
    await page.evaluate(() => {
      window.driveSamples = [];
      window.driveTimer = setInterval(() => {
        const data = document.documentElement.dataset;
        window.driveSamples.push({ ...JSON.parse(data.gameplayContact), speed: Number(data.gameplaySpeedKmh) });
      }, 50);
    });
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2200); await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS'); await page.waitForTimeout(1050); await page.keyboard.up('KeyS');
    await page.waitForTimeout(1200);
    const report = await page.evaluate(() => {
      clearInterval(window.driveTimer);
      const samples = window.driveSamples, first = samples[0], last = samples.at(-1);
      return {
        distanceMetres: Math.hypot(last.x-first.x,last.z-first.z),
        peakSpeedKmh: Math.max(...samples.map(s=>s.speed)), samples: samples.length,
        maximumContactOffsetMetres: Math.max(...samples.map(s=>Math.abs(s.y-s.ground))),
        maximumGroundStepMetres: Math.max(...samples.slice(1).map((s,i)=>Math.abs(s.ground-samples[i].ground))),
        pavement: JSON.parse(document.documentElement.dataset.pavementQa),
        continuity: JSON.parse(document.documentElement.dataset.pavementContinuity),
      };
    });
    console.log(JSON.stringify({ ...report, errors }, null, 2));
    if (errors.length || report.distanceMetres < 5 || report.maximumContactOffsetMetres > 0.05) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
