/* Optional scene-response browser QA. Owns its HTTP server and uses sequential
 * contexts so large city road surfaces are released between cases.
 *
 * Requires Playwright, plus its default browser or PTBO_CHROMIUM_EXECUTABLE.
 * PTBO_QA_OUTPUT sets the artifact directory; PTBO_QA_CITIES, PTBO_QA_SERVICES
 * and PTBO_QA_MODES accept comma-separated subsets. See the report limitations:
 * base departures use native controls; scene/hospital positions are injected.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.PTBO_QA_OUTPUT || path.join(root, 'test-artifacts/scene-response-browser'));
const allCities = ['belleville', 'scarborough', 'oshawa', 'pickering', 'markham', 'toronto'];
const allModes = ['missions', 'bases', 'mobile', 'island', 'crossmode', 'legacy', 'support'];
const selected = (name, fallback) => process.env[name] ? process.env[name].split(',').map(x => x.trim()).filter(Boolean) : fallback;
const cities = selected('PTBO_QA_CITIES', allCities);
const services = selected('PTBO_QA_SERVICES', ['fire', 'ems']);
const modes = selected('PTBO_QA_MODES', allModes);
for (const [name, values, allowed] of [['city', cities, allCities], ['service', services, ['fire', 'ems']], ['mode', modes, allModes]]) {
  for (const value of values) if (!allowed.includes(value)) throw Error(`Unknown ${name}: ${value}`);
}
fs.mkdirSync(output, {recursive:true});
const report = {startedAt:new Date().toISOString(), cities, services, modes, results:[], limitations:[
  'Native keyboard or touch controls move the vehicle from the selected base; scene arrival is triggered by setting the simulated position to the target.',
  'These are state and control fixtures, not full driven routes, field entrance surveys, operational run cards, or traffic-rule validation.',
  'External requests, including telemetry and map tiles, are blocked; screenshots do not validate a live basemap.',
  'Island fallback may use a temporary in-memory training-data fixture to suppress civic calls for that base; published intersection records and source identities are unchanged.',
]};
function checkpoint() { fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n'); }
function url(base, file, city) { const u = new URL(file, base + '/'); u.searchParams.set('city', city); u.searchParams.set('analytics', 'off'); return u.href; }
function data(city, filename) { return JSON.parse(fs.readFileSync(path.join(root, 'cities', city, filename), 'utf8')); }
async function ownServer() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', resolve); });
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const log = fs.openSync(path.join(output, 'http-server.log'), 'a');
  const child = spawn(process.env.PYTHON || 'python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', root], {cwd:root, stdio:['ignore', log, log]});
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(`HTTP server exited: ${child.exitCode}`);
    try { if ((await fetch(base + '/cities/city-registry.js', {signal:AbortSignal.timeout(1000)})).ok) return {base, close(){ child.kill('SIGTERM'); fs.closeSync(log); }}; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill('SIGTERM'); fs.closeSync(log); throw Error('HTTP server did not become ready');
}
async function frameFor(page, fragment) {
  for (let i = 0; i < 200; i++) { const frame = page.frames().find(f => f.url().includes(fragment)); if (frame) return frame; await page.waitForTimeout(100); }
  throw Error(`Frame did not load: ${fragment}`);
}
async function contextFor(browser, mobile, init) {
  const context = await browser.newContext({viewport:mobile ? {width:390,height:844} : {width:1365,height:900}, isMobile:mobile, hasTouch:mobile, reducedMotion:'reduce'});
  await context.route('https://**/*', route => route.abort());
  await context.addInitScript(() => localStorage.setItem('ptboResponseVisualTutorialSeenV1', '1'));
  if (init) await context.addInitScript(init.fn, init.arg);
  return context;
}
async function runCase(browser, name, mobile, action, init) {
  const started = Date.now(), context = await contextFor(browser, mobile, init), page = await context.newPage();
  const result = {name, mobile, errors:[], dialogs:[]};
  page.on('pageerror', error => result.errors.push(error.message));
  page.on('dialog', dialog => { result.dialogs.push(dialog.message()); void dialog.dismiss(); });
  page.setDefaultTimeout(45000);
  try {
    result.detail = await action(page, context);
    assert.deepEqual(result.errors, [], 'uncaught browser errors');
    assert.deepEqual(result.dialogs, [], 'unexpected alert');
    result.pass = true;
  } catch (error) { result.pass = false; result.error = error.stack || String(error); }
  if (!result.pass || name === 'mission-belleville-fire-desktop' || name === 'mission-belleville-ems-mobile') {
    result.screenshot = `${name}.png`;
    await page.screenshot({path:path.join(output, result.screenshot), fullPage:true}).catch(() => {});
  }
  result.durationMs = Date.now() - started; report.results.push(result); checkpoint();
  console.log(JSON.stringify({name, pass:result.pass, ms:result.durationMs, error:result.error?.split('\n')[0]}));
  await context.close();
}
async function openSimulator(page, base, city, service, mobile = false) {
  await page.goto(url(base, `response-simulator/${mobile ? 'mobile' : 'play'}/`, city), {waitUntil:'domcontentloaded'});
  await page.locator(`#service-choice button[data-service=${service}]`).click({timeout:120000});
  const frame = await frameFor(page, '/response-simulator/index.html');
  await frame.waitForFunction(() => window.PTBO_ROAD_COLLISION?.state.status === 'ready' && parent.PTBO_DISPATCH_STORE?.getTrainingData(), null, {timeout:120000});
  return frame;
}
async function depart(page, context, frame, mobile) {
  await frame.locator('#ptbo-tablet-close').waitFor({state:'visible',timeout:10000});
  await frame.locator('#ptbo-tablet-close').click();
  const start = await frame.evaluate(() => [simLat, simLng]);
  let touch;
  if (mobile) {
    const box = await page.locator('#steering').boundingBox(); assert.ok(box, 'touch steering is visible');
    touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+12,id:1}]});
  } else await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  const end = await frame.evaluate(() => [simLat, simLng]);
  if (touch) await touch.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]}); else await page.keyboard.up('ArrowUp');
  assert.ok(Math.hypot(end[0]-start[0], end[1]-start[1]) > 1e-6, 'native input moves the vehicle from base');
  return {start, end, input:mobile ? 'touch' : 'keyboard'};
}
async function mission(page, context, base, city, service, mobile) {
  const frame = await openSimulator(page, base, city, service, mobile);
  await frame.locator('#hud-action-btn').click();
  const start = await frame.evaluate(() => ({phase:mission?.phase,service:mission?.service,base:PTBO_SERVICE.getBase().id,incident:activeIncident?.id,
    routeBase:activeIncident?.routeBaseId,kind:activeIncident?.locationKind,hospital:mission?.hospital,arrival:activeArrivalPoint,
    voice:window.buildCityDispatchPhrase?.(activeIncident)}));
  assert.equal(start.phase, 'response'); assert.equal(start.service, service); assert.equal(start.base, start.routeBase);
  assert.ok(['sourced-address', 'mapped-intersection'].includes(start.kind)); assert.equal(start.hospital, null);
  const movement = await depart(page, context, frame, mobile);
  let enrouteScreenshot=null;
  if (city==='belleville' && ((!mobile && service==='fire') || (mobile && service==='ems'))) {
    enrouteScreenshot=`enroute-${city}-${service}-${mobile ? 'mobile' : 'desktop'}.png`;
    await page.screenshot({path:path.join(output,enrouteScreenshot),fullPage:true});
  }
  // Position injection intentionally isolates the arrival state machine from a full road drive.
  await frame.evaluate(() => { simLat=activeArrivalPoint.lat; simLng=activeArrivalPoint.lng; evaluateDistanceToTarget(); });
  await page.waitForTimeout(4300);
  const done = await frame.evaluate(() => ({phase:mission?.phase,total:totalTrackedCalls,history:PTBO_TRAINING_HISTORY?.summary(),
    transport:mission?.transportRequired,hud:document.getElementById('hud-content').innerText}));
  assert.equal(done.phase, 'complete'); assert.equal(done.total, 1); assert.equal(done.transport, false);
  assert.equal(done.history?.calls, 1); assert.equal(done.history?.emsTransports, 0);
  if (service === 'ems') assert.match(done.hud, /Response exercise completed/i);
  await frame.evaluate(() => { completeAssignment(); executeIncidentArrivalProcedures(); });
  assert.equal(await frame.evaluate(() => totalTrackedCalls), 1, 'completion recorded exactly once');
  await frame.locator('#hud-action-btn').click();
  const next = await frame.evaluate(() => ({phase:mission?.phase,base:PTBO_SERVICE.getBase(),routeBase:activeIncident?.routeBaseId,pos:[simLat,simLng]}));
  assert.equal(next.phase, 'response'); assert.equal(next.routeBase, next.base.id);
  assert.ok(Math.abs(next.pos[0]-next.base.spawnLat)<1e-6 && Math.abs(next.pos[1]-next.base.spawnLng)<1e-6, 'next call restarts at selected base');
  return {start,movement,enrouteScreenshot,arrivalFixture:'position injection',completion:done,nextBase:next.base.id};
}
async function bases(page, base, city) {
  const frame = await openSimulator(page, base, city, 'fire');
  const rows = await frame.evaluate(() => {
    const store=parent.PTBO_DISPATCH_STORE, training=store.getTrainingData(), canonical=store.getAll(), result=[];
    for (const service of ['fire','ems']) {
      PTBO_SERVICE.select(service);
      for (const hall of PTBO_SERVICE.getBases()) {
        const calls=PTBO_LOCAL_RESPONSE_POOL.localPool(training,canonical,{cityId:store.cityId,id:hall.id,service});
        const accessible=calls.filter(call=>resolveIncidentArrival(call));
        const roads=PTBO_ROAD_COLLISION, nearest=roads.nearestRoad(hall.spawnLat,hall.spawnLng,120);
        // Check actual road-surface coverage independently of yard coverage.
        const x=(hall.spawnLng-roads.config.centerLng)*111320*Math.cos(roads.config.centerLat*Math.PI/180);
        const y=(hall.spawnLat-roads.config.centerLat)*110540;
        const onMappedRoad=roads.state.segments.some(segment=>{
          const t=Math.max(0,Math.min(1,((x-segment.ax)*segment.dx+(y-segment.ay)*segment.dy)/segment.lengthSq));
          return Math.hypot(x-segment.ax-segment.dx*t,y-segment.ay-segment.dy*t)<=segment.allowed;
        });
        const gap=Boolean(nearest && !onMappedRoad && !PTBO_BASE_STORE.contains(hall,nearest.lat,nearest.lng));
        let egress=null;
        if(gap){
          roads.beginStationExit(hall.spawnLat,hall.spawnLng);
          const created=Boolean(roads.state.stationExit);
          const inside=roads.resolveMovement(hall.spawnLat,hall.spawnLng,hall.spawnLat,hall.spawnLng,0);
          const retained=Boolean(roads.state.stationExit);
          const onRoad=roads.resolveMovement(hall.spawnLat,hall.spawnLng,nearest.lat,nearest.lng,0);
          egress={created,retained,insideBlocked:inside.blocked,roadBlocked:onRoad.blocked,completed:!roads.state.stationExit};
          roads.state.stationExit=null;
        }
        result.push({id:hall.id,service,calls:calls.length,accessible:accessible.length,minimum:training.routeResponses.minCallsPerBase,baseRoadMetres:nearest?.distance??null,egress});
      }
    }
    return result;
  });
  const geo = data(city, 'geo-data.json');
  const expected = geo.bases.filter(x => x.status === 'active' && x.selectionEligible === true && Number.isFinite(x.lat) && Number.isFinite(x.lng));
  assert.equal(rows.length, expected.length, 'all canonical selectable bases are represented');
  for (const row of rows) {
    assert.ok(row.baseRoadMetres !== null && row.baseRoadMetres <= 120, `${row.id} departure road`);
    assert.equal(row.accessible, row.calls, `${row.id} collision-surface approaches`);
    assert.ok(row.accessible >= row.minimum, `${row.id} sufficient accessible exercises`);
    if(row.egress){assert.equal(row.egress.created,true,`${row.id} connector created`);assert.equal(row.egress.retained,true,`${row.id} connector survives yard`);assert.equal(row.egress.insideBlocked,false);assert.equal(row.egress.roadBlocked,false);assert.equal(row.egress.completed,true,`${row.id} actual road completes connector`);}
  }
  return {count:rows.length, connectorGapCases:rows.filter(row=>row.egress).length, rows};
}
async function crossmode(page, base, city) {
  await page.goto(url(base, 'geo-guesser/desktop/', city), {waitUntil:'domcontentloaded'});
  const geo = await frameFor(page, '/geo-guesser/index.html');
  await geo.waitForFunction(() => window.PTBO_DISPATCH_STORE?.getAll().length >= 2, null, {timeout:120000});
  const saved = await geo.evaluate(() => {
    const store=PTBO_DISPATCH_STORE, [first,second]=store.getAll();
    store.upsert({...first,name:'Cross-mode saved name',crossStreets:['Saved test street'],recognitionDifficulty:'hard'});
    store.remove(second.id); return {edited:first.id,deleted:second.id,version:store.dataVersion};
  });
  await page.goto(url(base, 'response-simulator/play/', city), {waitUntil:'domcontentloaded'});
  await page.locator('#service-choice button[data-service=fire]').waitFor({timeout:120000});
  const dispatch = await page.evaluate(() => ({version:PTBO_DISPATCH_STORE.dataVersion,rows:PTBO_DISPATCH_STORE.getAll()}));
  function verify(snapshot) {
    assert.equal(snapshot.version, saved.version); const row=snapshot.rows.find(x=>x.id===saved.edited);
    assert.equal(row?.name,'Cross-mode saved name'); assert.deepEqual(row?.crossStreets,['Saved test street']); assert.equal(row?.recognitionDifficulty,'hard');
    assert.ok(!snapshot.rows.some(x=>x.id===saved.deleted));
    assert.ok(!snapshot.rows.some(x=>/^route-/.test(x.id || '')), 'route exercises do not enter canonical store');
  }
  verify(dispatch);
  await page.goto(url(base, 'geo-guesser/desktop/', city), {waitUntil:'domcontentloaded'});
  const returned = await frameFor(page, '/geo-guesser/index.html');
  await returned.waitForFunction(() => window.PTBO_DISPATCH_STORE?.getAll().length >= 2, null, {timeout:120000});
  verify(await returned.evaluate(() => ({version:PTBO_DISPATCH_STORE.dataVersion,rows:PTBO_DISPATCH_STORE.getAll()})));
  return {...saved, returnedToGeo:true};
}
async function legacy(page, base, city, first, deleted, geoSeed) {
  await page.goto(url(base, 'response-simulator/play/', city), {waitUntil:'domcontentloaded'});
  await page.locator('#service-choice button[data-service=fire]').waitFor({timeout:120000});
  const actual=await page.evaluate(() => ({version:PTBO_DISPATCH_STORE.dataVersion,rows:PTBO_DISPATCH_STORE.getAll()}));
  assert.equal(actual.version,'ontario-geo-1'); assert.equal(actual.rows.find(x=>x.id===first.id)?.name,'Historical preview edit');
  assert.ok(!actual.rows.some(x=>x.id===deleted.id)); assert.ok(actual.rows.some(x=>x.id===geoSeed.id));
  return {edited:first.id,deleted:deleted.id,newGeoSeed:geoSeed.id,version:actual.version};
}
async function island(page, base, service) {
  const frame = await openSimulator(page, base, 'toronto', service);
  const id=service==='fire' ? 'fire-toronto-fire-335' : 'ems-toronto-ems-4173463';
  const number=await frame.evaluate(id => PTBO_SERVICE.getBases().find(b=>b.id===id)?.number,id);
  assert.ok(number, `Island ${service} base exists`);
  await page.locator('.station-select').selectOption(String(number));
  const published=await frame.evaluate(({id,service}) => {
    const store=parent.PTBO_DISPATCH_STORE,training=store.getTrainingData();
    const calls=PTBO_LOCAL_RESPONSE_POOL.localPool(training,store.getAll(),{cityId:'toronto',id,service}).filter(resolveIncidentArrival);
    const civic=calls.find(c=>c.canonicalCallId==='toronto-osm-node-13854671025');
    // Civic rows precede intersections; deterministic selection proves the normal path can dispatch it.
    Math.random=()=>0;
    return {civic:civic ? {id:civic.id,addr:civic.addr,access:civic.routeAccess} : null,ids:calls.map(c=>c.id),intersections:calls.filter(c=>c.locationKind==='mapped-intersection').length};
  },{id,service});
  assert.equal(published.civic?.addr,'355 Lakeshore Avenue'); assert.equal(published.civic.access.publicRoad,false);
  assert.equal(published.civic.access.sourceAccessRestrictions.motor_vehicle,'private');
  assert.ok(published.intersections>=3,'published pool retains intersection exercises alongside civic');
  await frame.locator('#hud-action-btn').click();
  const civic=await frame.evaluate(()=>({phase:mission?.phase,id:activeIncident?.id,addr:activeIncident?.addr,access:activeIncident?.routeAccess,arrival:activeArrivalPoint}));
  assert.equal(civic.phase,'response');assert.equal(civic.id,published.civic.id);assert.equal(civic.addr,'355 Lakeshore Avenue');
  await frame.locator('#ptbo-tablet-close').waitFor({state:'visible',timeout:10000});await frame.locator('#ptbo-tablet-close').click();
  await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
  await page.waitForTimeout(4300);
  assert.equal(await frame.evaluate(()=>mission.phase),'complete');
  const fixture=await frame.evaluate(({id,service}) => {
    const store=parent.PTBO_DISPATCH_STORE, original=store.getTrainingData(), profile=original.routeResponses.bases.find(p=>p.baseId===id&&p.service===service);
    const intersections=original.routeCalls.filter(c=>profile.callIds.includes(c.id)&&c.locationKind==='mapped-intersection');
    // Keep actual published intersections and profile; suppress civic calls only in memory.
    const training={...original,routeCalls:original.routeCalls.filter(c=>!(profile.callIds.includes(c.id)&&c.locationKind==='sourced-address'))};
    parent.PTBO_DISPATCH_STORE=Object.freeze({...store,getTrainingData:()=>training});
    window.dispatchEvent(new CustomEvent('ptbo-service-base-change'));
    return {published:intersections.length,fixture:'civic exercises suppressed in memory for this base'};
  },{id,service});
  assert.ok(fixture.published >= 3, 'published Island intersection exercises exist');
  await frame.locator('#hud-action-btn').click();
  const started=await frame.evaluate(() => ({phase:mission?.phase,base:PTBO_SERVICE.getBase().id,incident:activeIncident,arrival:activeArrivalPoint,
    hud:document.getElementById('hud-content').innerText,voice:window.buildCityDispatchPhrase?.(activeIncident)}));
  assert.equal(started.phase,'response'); assert.equal(started.base,id); assert.equal(started.incident.locationKind,'mapped-intersection');
  assert.equal(started.incident.name,started.incident.addr); assert.match(started.hud,/Mapped intersection exercise/); assert.match(started.voice,/mapped intersection exercise/i);
  assert.ok(started.incident.osmWays.length>=2 && started.incident.osmWays.every(x=>started.incident.sources.includes(`https://www.openstreetmap.org/${x}`)));
  await frame.evaluate(() => {simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
  await page.waitForTimeout(4300);
  const end=await frame.evaluate(() => ({phase:mission.phase,transport:mission.transportRequired,history:PTBO_TRAINING_HISTORY.summary()}));
  assert.equal(end.phase,'complete'); assert.equal(end.transport,false); assert.equal(end.history.emsTransports,0);
  return {published,civic,fixture,intersection:started.incident.addr,ways:started.incident.osmWays,arrivalFixture:'position injection',end};
}
async function support(page, base) {
  const frame=await openSimulator(page,base,'belleville','fire');
  const selected=await frame.evaluate(() => {
    const store=parent.PTBO_DISPATCH_STORE, hall=PTBO_SERVICE.getBase(), pool=PTBO_LOCAL_RESPONSE_POOL.localPool(store.getTrainingData(),store.getAll(),{cityId:store.cityId,id:hall.id,service:'fire'}).filter(resolveIncidentArrival);
    const index=pool.findIndex(c=>c.responseAssignment?.role==='support'); if(index<0)throw Error('No support exercise at selected base');
    Math.random=()=> (index+.01)/pool.length;
    const primary=PTBO_SERVICE.getBases().find(b=>b.id===pool[index].responseAssignment.primaryBaseId);
    return {base:hall.name,primaryId:pool[index].responseAssignment.primaryBaseId,primaryName:primary?.name};
  });
  assert.ok(selected.primaryName, 'modeled first-due hall exists');
  await frame.locator('#hud-action-btn').click();
  const actual=await frame.evaluate(() => ({assignment:activeIncident?.responseAssignment,hud:document.getElementById('hud-content').innerText,voice:buildCityDispatchPhrase(activeIncident)}));
  assert.equal(actual.assignment?.role,'support'); assert.equal(actual.assignment.primaryBaseId,selected.primaryId);
  assert.ok(actual.hud.includes(`modeled first-due ${selected.primaryName}`)); assert.ok(actual.voice.includes(`modeled first-due ${selected.primaryName}`));
  assert.match(actual.hud,/estimated support exercise/i); assert.match(actual.voice,/estimated support exercise/i);
  return {...selected,deterministicSelection:true,hud:actual.hud,voice:actual.voice};
}

(async () => {
  const server=await ownServer(); let browser;
  try {
    browser=await chromium.launch({headless:true,...(process.env.PTBO_CHROMIUM_EXECUTABLE ? {executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE} : {}),args:['--no-sandbox','--disable-dev-shm-usage']});
    if (modes.includes('missions')) for (const city of cities) for (const service of services)
      await runCase(browser,`mission-${city}-${service}-desktop`,false,(page,context)=>mission(page,context,server.base,city,service,false));
    if (modes.includes('bases')) for (const city of cities) await runCase(browser,`bases-${city}`,false,page=>bases(page,server.base,city));
    if (modes.includes('mobile') && cities.includes('belleville')) for (const service of services)
      await runCase(browser,`mission-belleville-${service}-mobile`,true,(page,context)=>mission(page,context,server.base,'belleville',service,true));
    if (modes.includes('island') && cities.includes('toronto')) for (const service of services)
      await runCase(browser,`island-${service}`,false,page=>island(page,server.base,service));
    if (modes.includes('crossmode')) for (const city of cities) await runCase(browser,`crossmode-${city}`,false,page=>crossmode(page,server.base,city));
    if (modes.includes('legacy')) for (const city of cities.filter(x=>['oshawa','pickering','markham','toronto'].includes(x))) {
      const training=data(city,'training-data.json'), geo=data(city,'geo-data.json'), [first,deleted]=training.sharedLocations;
      const snapshot={version:3,cityId:city,dataVersion:'1.6.8',trainingSharedLocationIds:training.sharedLocations.map(x=>x.id),trainingCareHomeIds:[],items:[{...first,name:'Historical preview edit'}]};
      const init={fn:({city,snapshot})=>localStorage.setItem(`ptboSharedDispatchLocationsV3:${city}`,JSON.stringify(snapshot)),arg:{city,snapshot}};
      await runCase(browser,`legacy-${city}`,false,page=>legacy(page,server.base,city,first,deleted,geo.locations[0]),init);
    }
    if (modes.includes('support') && cities.includes('belleville')) await runCase(browser,'support-belleville',false,page=>support(page,server.base));
  } finally { await browser?.close(); server.close(); report.finishedAt=new Date().toISOString(); checkpoint(); }
  if (report.results.some(result=>!result.pass)) process.exitCode=1;
})().catch(error => { console.error(error); process.exitCode=1; });
