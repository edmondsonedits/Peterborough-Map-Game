'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const [base = 'http://127.0.0.1:4174', label = 'mobile-controls'] = process.argv.slice(2);
const artifactRoot = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/mobile-qa', label);
const shouldCaptureArtifacts = process.env.PTBO_QA_NO_ARTIFACTS !== '1';
const appOrigin = new URL(base).origin;
const STATE_TIMEOUT_MS = 60000;
const criticalConsolePattern = /\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;

const overlapArea = (a, b) => {
  if (!a || !b) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const withinViewport = (box, viewport, tolerance = 1.5) => Boolean(box)
  && box.left >= -tolerance
  && box.top >= -tolerance
  && box.right <= viewport.width + tolerance
  && box.bottom <= viewport.height + tolerance;

const angleDelta = (a, b) => Math.abs(Math.atan2(
  Math.sin((Number(b) || 0) - (Number(a) || 0)),
  Math.cos((Number(b) || 0) - (Number(a) || 0)),
));

(async () => {
  if (shouldCaptureArtifacts) fs.mkdirSync(artifactRoot, { recursive: true });
  const chromiumArgs = process.platform === 'win32' ? ['--use-angle=d3d11'] : [];
  const browser = await chromium.launch({ headless: true, args: chromiumArgs });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    screen: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedRequests = [];

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

  const layoutSnapshot = async () => page.evaluate(() => {
    const read = selector => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity || 1),
        pointerEvents: style.pointerEvents,
        disabled: 'disabled' in element ? Boolean(element.disabled) : null,
      };
    };
    const visible = box => Boolean(box)
      && box.display !== 'none'
      && box.visibility !== 'hidden'
      && box.opacity > 0.01
      && box.width > 0
      && box.height > 0;
    const viewport = { width: innerWidth, height: innerHeight };
    const joystick = read('#movement-joystick');
    const action = read('#mobile-action-button');
    const menu = read('#mobile-menu-toggle');
    const gameplayHud = read('#gameplay-hud');
    const controlPanel = read('.control-panel');
    return {
      viewport,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      portrait: matchMedia('(orientation: portrait)').matches,
      landscape: matchMedia('(orientation: landscape)').matches,
      gameplayMode: document.documentElement.dataset.gameplayMode || null,
      gameplayReady: document.documentElement.dataset.gameplayReady || null,
      explorerBuild: window.PTBO_CITY_EXPLORER_BUILD?.version || null,
      mobileControlsVersion: document.documentElement.dataset.cityExplorerMobileControls || null,
      mobileAnalogDriving: document.documentElement.dataset.mobileAnalogDriving || null,
      mobileSteering: document.documentElement.dataset.mobileSteering || null,
      mobileThrottle: document.documentElement.dataset.mobileThrottle || null,
      appClasses: document.getElementById('app')?.className || '',
      touchClasses: document.getElementById('touch-controls')?.className || '',
      joystick,
      action,
      menu,
      gameplayHud,
      controlPanel,
      visible: {
        joystick: visible(joystick),
        action: visible(action),
        menu: visible(menu),
        gameplayHud: visible(gameplayHud),
        controlPanel: visible(controlPanel),
      },
      actionLabel: document.getElementById('mobile-action-label')?.textContent?.trim() || '',
      actionDetail: document.getElementById('mobile-action-detail')?.textContent?.trim() || '',
      actionAria: document.getElementById('mobile-action-button')?.getAttribute('aria-label') || '',
    };
  });

  try {
    const url = `${base.replace(/\/$/, '')}/city-explorer/?lite=1&pavementQA=1`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => document.documentElement.dataset.gameplayReady === 'true', null, { timeout: 180000 });
    await page.waitForFunction(() => Boolean(globalThis.__PTBO_GAMEPLAY__?.state), null, { timeout: 10000 });
    await page.waitForFunction(() => matchMedia('(pointer: coarse)').matches, null, { timeout: 5000 });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.cityExplorerMobileControls), null, { timeout: 5000 });

    await page.evaluate(() => {
      window.__PTBO_MOBILE_QA_KEYS__ = [];
      const record = type => event => {
        if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return;
        window.__PTBO_MOBILE_QA_KEYS__.push({ type, code: event.code, trusted: event.isTrusted });
      };
      addEventListener('keydown', record('down'), true);
      addEventListener('keyup', record('up'), true);
    });

    const portraitInitial = await layoutSnapshot();
    if (shouldCaptureArtifacts) {
      await page.screenshot({ path: path.join(artifactRoot, 'portrait-ready.png'), fullPage: false });
    }

    // Prove the joystick surface emits directional input while on foot without
    // moving far enough to lose the nearby truck interaction.
    const joystickBox = await page.locator('#movement-joystick').boundingBox();
    if (!joystickBox) throw new Error('Mobile joystick is not rendered');
    const centerX = joystickBox.x + joystickBox.width / 2;
    const centerY = joystickBox.y + joystickBox.height / 2;
    const radius = Math.min(joystickBox.width, joystickBox.height) * 0.28;
    await page.mouse.move(centerX - radius * 0.55, centerY - radius * 0.80);
    await page.mouse.down();
    await page.waitForTimeout(60);
    await page.mouse.up();
    await page.waitForFunction(() => {
      const events = window.__PTBO_MOBILE_QA_KEYS__ || [];
      const down = code => events.some(event => event.type === 'down' && event.code === code);
      const up = code => events.some(event => event.type === 'up' && event.code === code);
      return down('KeyW') && up('KeyW') && down('KeyA') && up('KeyA');
    }, null, { timeout: 5000 });

    // At the Station 1 spawn, the contextual mobile action should expose the
    // same enter-truck interaction as keyboard E.
    await page.waitForFunction(() => {
      const button = document.getElementById('mobile-action-button');
      const label = document.getElementById('mobile-action-label')?.textContent || '';
      return Boolean(button) && !button.disabled && /enter/i.test(label);
    }, null, { timeout: 15000 });
    const portraitReadyToEnter = await layoutSnapshot();
    await page.locator('#mobile-action-button').tap();
    await page.waitForFunction(() => document.documentElement.dataset.gameplayMode === 'driving', null, { timeout: 10000 });
    await page.waitForFunction(() => document.documentElement.dataset.mobileAnalogDriving, null, { timeout: 5000 });

    const driveStart = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    const drivingJoystick = await page.locator('#movement-joystick').boundingBox();
    if (!drivingJoystick) throw new Error('Driving joystick is not rendered');
    const driveCx = drivingJoystick.x + drivingJoystick.width / 2;
    const driveCy = drivingJoystick.y + drivingJoystick.height / 2;
    const driveRadius = Math.min(drivingJoystick.width, drivingJoystick.height) * 0.29;

    // Hold forward until the actual simulation proves acceleration, then blend
    // in a modest left input and require a resulting steering/heading change.
    await page.mouse.move(driveCx, driveCy - driveRadius);
    await page.mouse.down();
    await page.waitForFunction(({ x, z }) => {
      const truck = globalThis.__PTBO_GAMEPLAY__?.state?.().truck;
      return Boolean(truck)
        && Number(truck.speed) >= 0.35
        && Math.hypot(Number(truck.x) - x, Number(truck.z) - z) >= 0.10;
    }, { x: driveStart.truck.x, z: driveStart.truck.z }, { timeout: STATE_TIMEOUT_MS });
    const forwardState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());

    await page.mouse.move(driveCx - driveRadius * 0.45, driveCy - driveRadius * 0.86, { steps: 3 });
    await page.waitForFunction((startHeading) => {
      const truck = globalThis.__PTBO_GAMEPLAY__?.state?.().truck;
      if (!truck) return false;
      const delta = Math.abs(Math.atan2(
        Math.sin(Number(truck.heading) - startHeading),
        Math.cos(Number(truck.heading) - startHeading),
      ));
      return Math.abs(Number(truck.steering)) >= 0.025 && delta >= 0.001;
    }, forwardState.truck.heading, { timeout: STATE_TIMEOUT_MS });
    const steeredState = await page.evaluate(() => globalThis.__PTBO_GAMEPLAY__.state());
    await page.mouse.up();
    await page.waitForFunction(() => {
      const steering = Number(document.documentElement.dataset.mobileSteering || 0);
      const throttle = Number(document.documentElement.dataset.mobileThrottle || 0);
      return Math.abs(steering) < 0.001 && Math.abs(throttle) < 0.001;
    }, null, { timeout: 5000 });

    const portraitDriving = await layoutSnapshot();
    if (shouldCaptureArtifacts) {
      await page.screenshot({ path: path.join(artifactRoot, 'portrait-driving.png'), fullPage: false });
    }

    // Exercise the real mobile menu -> map transition. Map mode must hide drive
    // controls so map gestures are not interpreted as movement.
    await page.locator('#mobile-menu-toggle').tap();
    await page.waitForFunction(() => document.getElementById('app')?.classList.contains('mobile-menu-open'), null, { timeout: 5000 });
    await page.locator('#map-mode').tap();
    await page.waitForFunction(() => document.getElementById('touch-controls')?.classList.contains('is-map-mode'), null, { timeout: 5000 });
    const mapMode = await layoutSnapshot();

    // Return to play before testing landscape placement.
    await page.locator('#mobile-menu-toggle').tap();
    await page.waitForFunction(() => document.getElementById('app')?.classList.contains('mobile-menu-open'), null, { timeout: 5000 });
    await page.locator('#play-mode').tap();
    await page.waitForFunction(() => !document.getElementById('touch-controls')?.classList.contains('is-map-mode'), null, { timeout: 5000 });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => matchMedia('(orientation: landscape)').matches, null, { timeout: 5000 });
    await page.waitForTimeout(150);
    const landscape = await layoutSnapshot();
    if (shouldCaptureArtifacts) {
      await page.screenshot({ path: path.join(artifactRoot, 'landscape.png'), fullPage: false });
    }

    const keyEvents = await page.evaluate(() => window.__PTBO_MOBILE_QA_KEYS__ || []);
    const criticalFailedRequests = failedRequests.filter(entry => {
      try { return new URL(entry.url).origin === appOrigin; }
      catch (_) { return true; }
    });
    const criticalConsoleErrors = consoleErrors.filter(message => criticalConsolePattern.test(message));

    const report = {
      build: portraitInitial.explorerBuild,
      portraitInitial,
      portraitReadyToEnter,
      portraitDriving,
      mapMode,
      landscape,
      checkpoints: { driveStart, forwardState, steeredState },
      keyEvents,
      runtimeDiagnostics: {
        pageErrors,
        consoleErrors,
        criticalConsoleErrors,
        failedRequests,
        criticalFailedRequests,
      },
    };

    report.assertions = {
      buildIdentified: report.build === '1.6.73',
      coarsePointerEmulated: portraitInitial.coarsePointer === true,
      mobileControlsLoaded: Boolean(portraitInitial.mobileControlsVersion),
      portraitOrientationDetected: portraitInitial.portrait === true,
      portraitJoystickVisible: portraitInitial.visible.joystick === true,
      portraitActionVisible: portraitInitial.visible.action === true,
      portraitMenuVisible: portraitInitial.visible.menu === true,
      joystickLargeEnough: portraitInitial.joystick?.width >= 120 && portraitInitial.joystick?.height >= 120,
      actionTouchTargetLargeEnough: portraitInitial.action?.width >= 44 && portraitInitial.action?.height >= 44,
      menuTouchTargetLargeEnough: portraitInitial.menu?.width >= 44 && portraitInitial.menu?.height >= 44,
      portraitControlsInsideViewport:
        withinViewport(portraitInitial.joystick, portraitInitial.viewport)
        && withinViewport(portraitInitial.action, portraitInitial.viewport)
        && withinViewport(portraitInitial.menu, portraitInitial.viewport),
      portraitPrimaryControlsDoNotOverlap:
        overlapArea(portraitInitial.joystick, portraitInitial.action) === 0
        && overlapArea(portraitInitial.joystick, portraitInitial.menu) === 0
        && overlapArea(portraitInitial.action, portraitInitial.menu) === 0,
      portraitHudClearOfJoystick:
        !portraitInitial.visible.gameplayHud || overlapArea(portraitInitial.joystick, portraitInitial.gameplayHud) === 0,
      portraitHudClearOfAction:
        !portraitInitial.visible.gameplayHud || overlapArea(portraitInitial.action, portraitInitial.gameplayHud) === 0,
      onFootJoystickEmitsForward:
        keyEvents.some(event => event.type === 'down' && event.code === 'KeyW')
        && keyEvents.some(event => event.type === 'up' && event.code === 'KeyW'),
      onFootJoystickEmitsSteering:
        keyEvents.some(event => event.type === 'down' && event.code === 'KeyA')
        && keyEvents.some(event => event.type === 'up' && event.code === 'KeyA'),
      contextualEnterAvailable:
        portraitReadyToEnter.action?.disabled === false
        && /enter/i.test(portraitReadyToEnter.actionLabel),
      actionButtonEnteredTruck: portraitDriving.gameplayMode === 'driving',
      analogBridgeInstalled: Boolean(portraitDriving.mobileAnalogDriving) && portraitDriving.mobileAnalogDriving !== 'fallback',
      mobileForwardAcceleration: Number(forwardState?.truck?.speed) >= 0.35,
      mobileSteeringAccepted: Math.abs(Number(steeredState?.truck?.steering)) >= 0.025,
      mobileTurnOccurred: angleDelta(forwardState?.truck?.heading, steeredState?.truck?.heading) >= 0.001,
      analogReleasedCleanly:
        Math.abs(Number(portraitDriving.mobileSteering || 0)) < 0.001
        && Math.abs(Number(portraitDriving.mobileThrottle || 0)) < 0.001,
      mapModeHidesJoystick: mapMode.visible.joystick === false,
      mapModeHidesAction: mapMode.visible.action === false,
      mapModeKeepsMenuAvailable: mapMode.visible.menu === true,
      landscapeOrientationDetected: landscape.landscape === true,
      landscapeJoystickVisible: landscape.visible.joystick === true,
      landscapeActionVisible: landscape.visible.action === true,
      landscapeMenuVisible: landscape.visible.menu === true,
      landscapeControlsInsideViewport:
        withinViewport(landscape.joystick, landscape.viewport)
        && withinViewport(landscape.action, landscape.viewport)
        && withinViewport(landscape.menu, landscape.viewport),
      landscapePrimaryControlsDoNotOverlap:
        overlapArea(landscape.joystick, landscape.action) === 0
        && overlapArea(landscape.joystick, landscape.menu) === 0
        && overlapArea(landscape.action, landscape.menu) === 0,
      noPageErrors: pageErrors.length === 0,
      noCriticalConsoleErrors: criticalConsoleErrors.length === 0,
      noCriticalRequestFailures: criticalFailedRequests.length === 0,
    };

    if (shouldCaptureArtifacts) {
      fs.writeFileSync(path.join(artifactRoot, 'report.json'), JSON.stringify(report, null, 2));
    }
    console.log(JSON.stringify(report, null, 2));

    const failed = Object.entries(report.assertions).filter(([, passed]) => !passed);
    if (failed.length) {
      console.error(`Mobile QA failed: ${failed.map(([name]) => name).join(', ')}`);
      process.exitCode = 1;
    }
  } finally {
    await context.close();
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
