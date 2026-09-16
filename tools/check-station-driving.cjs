'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4174', label = 'station-1-driving'] = process.argv.slice(2);
const artifactRoot = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/driving-qa', label);
const shouldCaptureArtifacts = process.env.PTBO_QA_NO_ARTIFACTS !== '1';
const appOrigin = new URL(base).origin;

const angleDelta = (a, b) => Math.abs(Math.atan2(
  Math.sin((Number(b) || 0) - (Number(a) || 0)),
  Math.cos((Number(b) || 0) - (Number(a) || 0)),
));
const criticalConsolePattern = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;

(async () => {
  if (shouldCaptureArtifacts) fs.mkdirSync(artifactRoot, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11'] });
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        errorText: request.failure()?.errorText || 'request failed',
      });
    });

    const url = `${base.replace(/\/$/, '')}/city-explorer/?pavementQA=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
    await page.waitForFunction(() => Boolean(globalThis.__PTBO_GAMEPLAY__?.state), null, { timeout: 10000 });

    await page.locator('#play-mode').click();
    await page.locator('canvas').first().focus();

    const spawn = await page.evaluate(() => ({
      build: {
        shared: window.PTBO_BUILD?.version || null,
        explorer: window.PTBO_CITY_EXPLORER_BUILD?.version || null,
      },
      gameplay: globalThis.__PTBO_GAMEPLAY__.state(),
      pavement: JSON.parse(document.documentElement.dataset.pavementQa || 'null'),
      continuity: JSON.parse(document.documentElement.dataset.pavementContinuity || 'null'),
    }));

    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.documentElement.dataset.gameplayMode === 'driving', null, { timeout: 10000 });

    await page.evaluate(() => {
      window.driveSamples = [];
      window.driveTimer = setInterval(() => {
        const data = document.documentElement.dataset;
        const gameplay = globalThis.__PTBO_GAMEPLAY__?.state?.();
        if (!gameplay?.truck || !data.gameplayContact) return;
        window.driveSamples.push({
          ...JSON.parse(data.gameplayContact),
          speedKmh: Number(data.gameplaySpeedKmh),
          signedSpeedMps: Number(gameplay.truck.speed),
          heading: Number(gameplay.truck.heading),
          steering: Number(gameplay.truck.steering),
          onRoad: data.gameplayOnRoad === 'true',
        });
      }, 50);
    });

    // Forward acceleration, followed by a small steering input while moving.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800);
    const forwardState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.keyboard.down('KeyA');
    await page.waitForTimeout(450);
    await page.keyboard.up('KeyA');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyW');
    const steeredState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());

    // Brake through zero, then continue long enough to prove reverse engages.
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => globalThis.__PTBO_GAMEPLAY__.state().truck.speed <= 0.25, null, { timeout: 4000 });
    const brakedState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.waitForTimeout(900);
    const reverseState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.keyboard.up('KeyS');
    await page.waitForTimeout(500);

    const report = await page.evaluate(() => {
      clearInterval(window.driveTimer);
      const samples = window.driveSamples;
      const first = samples[0];
      const last = samples.at(-1);
      const contacts = samples.filter(sample => Number.isFinite(sample.y) && Number.isFinite(sample.ground));
      const groundSteps = contacts.slice(1).map((sample, index) => Math.abs(sample.ground - contacts[index].ground));
      return {
        sampleCount: samples.length,
        first,
        last,
        distanceMetres: first && last ? Math.hypot(last.x - first.x, last.z - first.z) : 0,
        peakSpeedKmh: samples.length ? Math.max(...samples.map(sample => sample.speedKmh)) : 0,
        maximumContactOffsetMetres: contacts.length ? Math.max(...contacts.map(sample => Math.abs(sample.y - sample.ground))) : Infinity,
        maximumGroundStepMetres: groundSteps.length ? Math.max(...groundSteps) : 0,
        offRoadSamples: samples.filter(sample => !sample.onRoad).length,
        finalGameplay: globalThis.__PTBO_GAMEPLAY__.state(),
        pavement: JSON.parse(document.documentElement.dataset.pavementQa || 'null'),
        continuity: JSON.parse(document.documentElement.dataset.pavementContinuity || 'null'),
      };
    });

    const criticalFailedRequests = failedRequests.filter(entry => {
      try { return new URL(entry.url).origin === appOrigin; }
      catch (_) { return true; }
    });
    const criticalConsoleErrors = consoleErrors.filter(message => criticalConsolePattern.test(message));

    report.checkpoints = {
      spawn: spawn.gameplay,
      forward: forwardState,
      steered: steeredState,
      braked: brakedState,
      reverse: reverseState,
    };
    report.build = spawn.build;
    report.runtimeDiagnostics = {
      pageErrors,
      consoleErrors,
      criticalConsoleErrors,
      failedRequests,
      criticalFailedRequests,
    };
    report.assertions = {
      buildIdentified: Boolean(spawn.build.explorer),
      enteredTruck: report.finalGameplay?.mode === 'driving',
      moved: report.distanceMetres >= 5,
      accelerated: Number(forwardState?.truck?.speed) > 1,
      steered: angleDelta(forwardState?.truck?.heading, steeredState?.truck?.heading) >= 0.02,
      braked: Number(brakedState?.truck?.speed) <= 0.25,
      reversed: Number(reverseState?.truck?.speed) < -0.5,
      roadContactStable: report.maximumContactOffsetMetres <= 0.05,
      noPageErrors: pageErrors.length === 0,
      noCriticalConsoleErrors: criticalConsoleErrors.length === 0,
      noCriticalRequestFailures: criticalFailedRequests.length === 0,
    };

    if (shouldCaptureArtifacts) {
      await page.screenshot({ path: path.join(artifactRoot, 'final.png'), fullPage: false });
      fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));

    const failed = Object.entries(report.assertions).filter(([, passed]) => !passed);
    if (failed.length) {
      console.error(`Driving QA failed: ${failed.map(([name]) => name).join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
