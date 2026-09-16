'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4174', label = 'station-1-driving'] = process.argv.slice(2);
const artifactRoot = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/driving-qa', label);
const shouldCaptureArtifacts = process.env.PTBO_QA_NO_ARTIFACTS !== '1';
const appOrigin = new URL(base).origin;
const DRIVE_STATE_TIMEOUT_MS = 60000;

const angleDelta = (a, b) => Math.abs(Math.atan2(
  Math.sin((Number(b) || 0) - (Number(a) || 0)),
  Math.cos((Number(b) || 0) - (Number(a) || 0)),
));
const criticalConsolePattern = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;

(async () => {
  if (shouldCaptureArtifacts) fs.mkdirSync(artifactRoot, { recursive: true });
  const chromiumArgs = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
  const browser = await chromium.launch({ headless: true, args: chromiumArgs });
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

  try {
    // The lightweight render profile keeps this functional driving test from
    // accidentally becoming a software-WebGL performance benchmark in CI.
    const page = await browser.newPage({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
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

    const url = `${base.replace(/\/$/, '')}/city-explorer/?lite=1&pavementQA=1`;
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
      compatibilityMode: document.documentElement.dataset.cityCompatibilityMode || null,
      gameplay: globalThis.__PTBO_GAMEPLAY__.state(),
      pavement: JSON.parse(document.documentElement.dataset.pavementQa || 'null'),
      continuity: JSON.parse(document.documentElement.dataset.pavementContinuity || 'null'),
    }));

    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => document.documentElement.dataset.gameplayMode === 'driving', null, { timeout: 10000 });

    // Sample once per rendered frame instead of on a wall-clock interval. This
    // remains deterministic even when a headless software renderer is slow.
    await page.evaluate(() => {
      window.driveSamples = [];
      window.driveSampleActive = true;
      const sampleFrame = () => {
        if (!window.driveSampleActive) return;
        const data = document.documentElement.dataset;
        const gameplay = globalThis.__PTBO_GAMEPLAY__?.state?.();
        if (gameplay?.truck && data.gameplayContact) {
          window.driveSamples.push({
            ...JSON.parse(data.gameplayContact),
            speedKmh: Number(data.gameplaySpeedKmh),
            signedSpeedMps: Number(gameplay.truck.speed),
            heading: Number(gameplay.truck.heading),
            steering: Number(gameplay.truck.steering),
            onRoad: data.gameplayOnRoad === 'true',
          });
          if (window.driveSamples.length > 5000) window.driveSamples.shift();
        }
        requestAnimationFrame(sampleFrame);
      };
      requestAnimationFrame(sampleFrame);
    });

    const driveStart = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());

    // Functional QA is state-driven, not wall-clock-driven: keep the input held
    // until the simulation itself proves that forward acceleration occurred.
    await page.keyboard.down('KeyW');
    await page.waitForFunction(({ x, z }) => {
      const truck = globalThis.__PTBO_GAMEPLAY__?.state?.().truck;
      return Boolean(truck)
        && Number(truck.speed) >= 0.55
        && Math.hypot(Number(truck.x) - x, Number(truck.z) - z) >= 0.15;
    }, { x: driveStart.truck.x, z: driveStart.truck.z }, { timeout: DRIVE_STATE_TIMEOUT_MS });
    const forwardState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());

    // Keep moving while steering so the test proves both steering input and a
    // resulting heading change, independent of renderer frame rate.
    await page.keyboard.down('KeyA');
    await page.waitForFunction((startHeading) => {
      const truck = globalThis.__PTBO_GAMEPLAY__?.state?.().truck;
      if (!truck) return false;
      const delta = Math.abs(Math.atan2(
        Math.sin(Number(truck.heading) - startHeading),
        Math.cos(Number(truck.heading) - startHeading),
      ));
      return Math.abs(Number(truck.steering)) >= 0.04 && delta >= 0.0015;
    }, forwardState.truck.heading, { timeout: DRIVE_STATE_TIMEOUT_MS });
    const steeredState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.keyboard.up('KeyA');
    await page.keyboard.up('KeyW');

    // Brake through zero, then keep the same input held until reverse is proven.
    await page.keyboard.down('KeyS');
    await page.waitForFunction(() => {
      const speed = Number(globalThis.__PTBO_GAMEPLAY__?.state?.().truck?.speed);
      return Number.isFinite(speed) && speed <= 0.05;
    }, null, { timeout: DRIVE_STATE_TIMEOUT_MS });
    const brakedState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.waitForFunction(() => {
      const speed = Number(globalThis.__PTBO_GAMEPLAY__?.state?.().truck?.speed);
      return Number.isFinite(speed) && speed <= -0.25;
    }, null, { timeout: DRIVE_STATE_TIMEOUT_MS });
    const reverseState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.keyboard.up('KeyS');

    const report = await page.evaluate(() => {
      window.driveSampleActive = false;
      const samples = window.driveSamples;
      const first = samples[0];
      const last = samples.at(-1);
      const contacts = samples.filter(sample => Number.isFinite(sample.y) && Number.isFinite(sample.ground));
      const groundSteps = contacts.slice(1).map((sample, index) => Math.abs(sample.ground - contacts[index].ground));
      const pathDistanceMetres = samples.slice(1).reduce((distance, sample, index) => {
        const previous = samples[index];
        return distance + Math.hypot(sample.x - previous.x, sample.z - previous.z);
      }, 0);
      return {
        sampleCount: samples.length,
        first,
        last,
        netDistanceMetres: first && last ? Math.hypot(last.x - first.x, last.z - first.z) : 0,
        pathDistanceMetres,
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
      driveStart,
      forward: forwardState,
      steered: steeredState,
      braked: brakedState,
      reverse: reverseState,
    };
    report.build = spawn.build;
    report.compatibilityMode = spawn.compatibilityMode;
    report.runtimeDiagnostics = {
      pageErrors,
      consoleErrors,
      criticalConsoleErrors,
      failedRequests,
      criticalFailedRequests,
    };
    report.assertions = {
      buildIdentified: Boolean(spawn.build.explorer),
      lightweightProfileForced: spawn.compatibilityMode === 'forced',
      enteredTruck: report.finalGameplay?.mode === 'driving',
      sampledSimulationFrames: report.sampleCount >= 6,
      moved: report.pathDistanceMetres >= 0.25,
      accelerated: Number(forwardState?.truck?.speed) >= 0.55,
      steeringInputAccepted: Math.abs(Number(steeredState?.truck?.steering)) >= 0.04,
      turned: angleDelta(forwardState?.truck?.heading, steeredState?.truck?.heading) >= 0.0015,
      braked: Number(brakedState?.truck?.speed) <= 0.05,
      reversed: Number(reverseState?.truck?.speed) <= -0.25,
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
