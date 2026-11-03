/* Browser QA for station spawn-to-road transitions.
 * Usage: PTBO_QA_CITIES=ajax node tools/check-base-driving-areas.cjs [base-url]
 * The default city list retains the earlier Peterborough / Richmond Hill pair.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const base = (process.argv[2] || 'http://127.0.0.1:4227').replace(/\/$/, '');
const cities = (process.env.PTBO_QA_CITIES || 'peterborough,richmond-hill')
  .split(',').map((city) => city.trim()).filter(Boolean);

(async () => {
  let server;
  let browser;
  const reports = [];
  try {
    if (new URL(base).hostname === '127.0.0.1') {
      server = spawn(process.execPath, ['tools/serve-preview.cjs', new URL(base).port], { stdio: 'ignore', windowsHide: true });
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    for (const city of cities) {
      const page = await browser.newPage();
      try {
        await page.goto(`${base}/response-simulator/play/?city=${encodeURIComponent(city)}`, { waitUntil: 'domcontentloaded' });
        await page.locator('#service-choice [data-service=fire]').click({ timeout: 45000 });
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
        assert.ok(frame, `${city}: simulator frame was not created`);
        await frame.waitForFunction(() => Boolean(window.PTBO_BASE_STORE && window.PTBO_ROAD_COLLISION), null, { timeout: 45000 });
        await frame.evaluate(async () => {
          await window.PTBO_ROAD_COLLISION.ready;
          return window.PTBO_ROAD_COLLISION.state?.status === 'ready';
        });
        const rows = await frame.evaluate(() => {
          const store = window.PTBO_BASE_STORE;
          const roads = window.PTBO_ROAD_COLLISION;
          if (roads.state?.status !== 'ready' || !roads.state.geojson?.features?.length) throw new Error('Road geometry did not finish loading');
          return [...store.getBases('fire'), ...store.getBases('ems')].map((base) => {
            const dimensionsValid = Number(base.yardWidth) >= 10 && Number(base.yardWidth) <= 600
              && Number(base.yardLength) >= 10 && Number(base.yardLength) <= 600;
            const rotationValid = Number(base.yardRotation) >= 0 && Number(base.yardRotation) <= 359;
            if (!dimensionsValid || !rotationValid) throw new Error(`${base.id}: invalid driving-area dimensions or rotation`);
            const spawn = { lat: Number(base.spawnLat ?? base.lat), lng: Number(base.spawnLng ?? base.lng) };
            const spawnInside = store.contains(base, spawn.lat, spawn.lng);
            const nearest = roads.nearestRoad(spawn.lat, spawn.lng, 120);
            const areaRoadAccess = store.roadAccess(base, roads.state.geojson);
            const exitStarted = roads.beginStationExit(spawn.lat, spawn.lng);
            let point = spawn;
            let blockedMoves = 0;
            let movementSteps = 0;
            const distance = Number(nearest?.distance || 0);
            const steps = Math.max(1, Math.ceil(distance / 1.5));
            if (nearest) for (let index = 1; index <= steps; index += 1) {
              const t = index / steps;
              const candidate = {
                lat: spawn.lat + (nearest.lat - spawn.lat) * t,
                lng: spawn.lng + (nearest.lng - spawn.lng) * t,
              };
              const moved = roads.resolveMovement(point.lat, point.lng, candidate.lat, candidate.lng, 0);
              movementSteps += 1;
              if (moved.blocked) blockedMoves += 1;
              point = { lat: moved.lat, lng: moved.lng };
            }
            const endDistance = nearest && Math.hypot(
              (point.lng - nearest.lng) * 111320 * Math.cos(roads.config.centerLat * Math.PI / 180),
              (point.lat - nearest.lat) * 110540,
            );
            const exitCompleted = Boolean(nearest && endDistance <= 2.5 && roads.isPointDrivable(point.lat, point.lng) && blockedMoves === 0);
            return {
              id: base.id,
              service: base.service,
              drivingArea: { center: { lat: base.lat, lng: base.lng }, width: base.yardWidth, length: base.yardLength, rotation: base.yardRotation },
              spawn,
              spawnInside,
              spawnInitiallyDrivable: roads.isPointDrivable(spawn.lat, spawn.lng),
              nearestRoad: nearest && { name: nearest.road || null, highway: nearest.highway || null, distanceMetres: Number(nearest.distance.toFixed(2)) },
              areaRoadAccess,
              exitStarted,
              exitCompleted,
              blockedMoves,
              movementSteps,
              endDistanceToNearestRoadMetres: nearest && Number(endDistance.toFixed(2)),
              exitPoint: point,
            };
          });
        });
        assert.ok(rows.length, `${city}: no active bases were loaded`);
        for (const row of rows) {
          assert.ok(row.spawnInside, `${city}/${row.id}: spawn is outside its driving area`);
          assert.ok(row.areaRoadAccess, `${city}/${row.id}: driving area has no intersecting road segment`);
          assert.ok(row.exitStarted, `${city}/${row.id}: station exit could not initialize`);
          assert.ok(row.exitCompleted, `${city}/${row.id}: spawn-to-road collision transition did not complete`);
          assert.equal(row.blockedMoves, 0, `${city}/${row.id}: station exit movement was blocked`);
        }
        reports.push({ city, roadStatus: 'ready', activeBaseCount: rows.length, rows });
      } finally {
        await page.close();
      }
    }
    const output = 'artifacts/release-qa/base-fit';
    fs.mkdirSync(output, { recursive: true });
    for (const report of reports) fs.writeFileSync(`${output}/${report.city}-driving-area-checks.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(reports));
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
