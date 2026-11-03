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
          await window.PTBO_ROUTE_REVEAL.ready;
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
            // A nearest-road point can still be inside the yard. Follow a real
            // call route until ten metres beyond the fitted area instead.
            const dispatch=parent.PTBO_DISPATCH_STORE,training=dispatch.getTrainingData();
            const local=(training?.routeCalls||[]).filter(call=>call.routeBaseId===base.id);
            const candidates=local.length?local:dispatch.getAll();
            const expanded={...base,yardWidth:base.yardWidth+20,yardLength:base.yardLength+20};
            let path=null;
            for(const call of candidates){
              const arrival=resolveIncidentArrival(call);if(!arrival)continue;
              const route=PTBO_ROUTE_REVEAL.calculateRoute(spawn.lat,spawn.lng,arrival.lat,arrival.lng);
              if(!route?.coordinates)continue;
              const outside=route.coordinates.findIndex(([lat,lng])=>!store.contains(expanded,lat,lng));
              if(outside>=0){path=route.coordinates.slice(0,outside+1);break;}
            }
            let point=spawn,blockedMoves=0,movementSteps=0;
            if(path) for(const [lat,lng] of path){
              const from={...point},distance=Math.hypot((lng-from.lng)*111320*Math.cos(roads.config.centerLat*Math.PI/180),(lat-from.lat)*110540);
              const steps=Math.max(1,Math.ceil(distance/1.5));
              for(let index=1;index<=steps;index++){
                const t=index/steps,candidate={lat:from.lat+(lat-from.lat)*t,lng:from.lng+(lng-from.lng)*t};
                const moved=roads.resolveMovement(point.lat,point.lng,candidate.lat,candidate.lng,0);
                movementSteps++;if(moved.blocked)blockedMoves++;
                point={lat:moved.lat,lng:moved.lng};
                if(blockedMoves||movementSteps>3000||!store.contains(expanded,point.lat,point.lng))break;
              }
              if(blockedMoves||movementSteps>3000||!store.contains(expanded,point.lat,point.lng))break;
            }
            const exitCompleted=Boolean(path&&!store.contains(expanded,point.lat,point.lng)&&roads.isPointDrivable(point.lat,point.lng)&&blockedMoves===0);
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
              outsideExpandedDrivingArea: !store.contains(expanded,point.lat,point.lng),
              exitPoint: point,
            };
          });
        });
        fs.mkdirSync('artifacts/release-qa/base-fit',{recursive:true});
        fs.writeFileSync('artifacts/release-qa/base-fit/'+city+'-driving-area-checks.json',JSON.stringify({city,roadStatus:'ready',activeBaseCount:rows.length,rows},null,2));
        assert.ok(rows.length, `${city}: no active bases were loaded`);
        for (const row of rows) {
          assert.ok(row.spawnInside, `${city}/${row.id}: spawn is outside its driving area`);
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
    console.log(JSON.stringify(reports.map(report=>({city:report.city,bases:report.activeBaseCount,continuousExits:report.rows.filter(row=>row.exitCompleted).length,blockedMoves:report.rows.reduce((sum,row)=>sum+row.blockedMoves,0)}))));
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
