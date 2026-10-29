/* Optional real-browser Richmond Hill Dispatch QA.
 * Requires Playwright on NODE_PATH and a provisioned Chromium, or
 * PTBO_CHROMIUM_EXECUTABLE. PTBO_QA_OUTPUT overrides artifact output;
 * PTBO_QA_CASES accepts comma-separated case names. Owns its static server.
 * PTBO_QA_LIVE_TILES=1 enables two map-render cases and GET tile images only,
 * using the inherited proxy and normal TLS verification.
 * External traffic is blocked; the launcher request adapter is mocked only
 * for explicit request-button checks. Native Fire drive never sets GPS/heading.
 * Other completion checks intentionally inject scene/hospital GPS positions.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.env.PTBO_QA_OUTPUT || path.join(root, 'test-artifacts/richmond-hill-demo-browser'));
fs.mkdirSync(output, {recursive:true});
const liveTiles=process.env.PTBO_QA_LIVE_TILES==='1';
const report = {liveTiles,startedAt:new Date().toISOString(), results:[], limitations:[
  'Native Fire trip uses only browser keyboard controls; other lifecycle checks set scene/hospital GPS to exercise the real arrival timers.',
  liveTiles ? 'Only GET image requests to the shipped map tile providers are allowed externally. Feedback and telemetry remain blocked.' : 'External HTTPS, including Feedback writes, telemetry and map tiles, is blocked. Local Leaflet, city roads, vehicle and HUD run normally; live basemap imagery is not validated.',
  'Launcher form submission replaces only PTBO_DEMO_REQUESTS with an in-memory adapter. No real message is sent.',
]};
const checkpoint=()=>fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  fs.readFile(file,(error,data)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(data);});
});
let base;
function url(file,city='richmond-hill',extra={}){const u=new URL(file,base+'/');u.searchParams.set('city',city);u.searchParams.set('analytics','off');for(const[k,v]of Object.entries(extra))u.searchParams.set(k,v);return u.href;}
async function frameFor(page){for(let i=0;i<300;i++){const f=page.frames().find(f=>f.url().includes('/response-simulator/index.html'));if(f)return f;await page.waitForTimeout(100);}throw Error('simulator frame did not attach');}
async function open(page,service='fire',mobile=false,city='richmond-hill',extra={}){
  await page.goto(url(`response-simulator/${mobile?'mobile':'play'}/`,city,extra),{waitUntil:'domcontentloaded'});
  await page.locator(`#service-choice button[data-service=${service}]`).click({timeout:120000});
  const f=await frameFor(page);await f.waitForFunction(()=>window.PTBO_ROAD_COLLISION?.state.status==='ready'&&window.PTBO_SERVICE?.state.selected,null,{timeout:120000});
  if(city==='richmond-hill')await f.waitForFunction(()=>Boolean(window.PTBO_DISPATCH_DEMO),null,{timeout:30000});
  return f;
}
async function closeTablet(f){const b=f.locator('#ptbo-tablet-close');await b.waitFor({state:'visible',timeout:10000});await b.click();}
async function shot(page,name){await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});return name+'.png';}
async function state(f){return f.evaluate(()=>({city:PTBO_CITY_PACKAGE.id,base:PTBO_SERVICE.getBase().id,service:PTBO_SERVICE.state.mode,demo:PTBO_DISPATCH_DEMO?.state,phase:mission?.phase,call:mission?.scene?.id,generation:mission?.generation,total:totalTrackedCalls,pos:[simLat,simLng],hospital:mission?.hospital?.name}));}
async function start(f){await f.locator('#hud-action-btn').click();await f.waitForFunction(()=>mission?.phase==='response');await closeTablet(f);return state(f);}
async function arrive(f){await f.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});}
async function complete(f,service){await arrive(f);if(service==='ems'){
  await f.waitForFunction(()=>mission?.phase==='transport',null,{timeout:10000});
  assert.match((await state(f)).hospital,/Mackenzie Richmond Hill/);await arrive(f);
}await f.waitForFunction(()=>mission?.phase==='complete',null,{timeout:10000});}
async function launcher(page,mobile){
  await page.goto(url(''),{waitUntil:'domcontentloaded'});await page.locator('#home-city-select').selectOption('richmond-hill');
  await page.evaluate(()=>{window.qaRequests=[];window.qaSaved=false;window.PTBO_DEMO_REQUESTS={requestStatus:()=>({remoteSaved:window.qaSaved}),recordDemoRequest:async(...args)=>{window.qaRequests.push(args);window.qaSaved=true;return true;},openDemoConversation:()=>true};});
  await page.locator('#dispatch-game-link').click();await page.locator('#home-demo-dialog[open]').waitFor();assert.equal(await page.locator('#launch-status').innerText(),'','opening request popup must not announce simulator navigation');
  assert.equal(await page.locator('#home-demo-close').innerText(),'Close');assert.equal(await page.locator('#home-demo-play').innerText(),'Demo');assert.equal(await page.locator('#home-demo-submit').innerText(),'Request full version');
  const bounds=await page.locator('#home-demo-dialog').boundingBox();const viewport=page.viewportSize();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1,'popup fits viewport');
  const href=await page.locator('#home-demo-play').getAttribute('href');const target=new URL(href);assert.equal(target.searchParams.get('city'),'richmond-hill');assert.ok(target.pathname.endsWith(mobile?'/mobile/':'/play/'));
  const screenshot=await shot(page,`popup-${mobile?'mobile':'desktop'}`);
  assert.deepEqual(await page.evaluate(()=>qaRequests),[],'opening never sends');await page.locator('#home-demo-close').click();assert.equal(await page.locator('#home-demo-dialog').evaluate(e=>e.open),false);
  await page.locator('#dispatch-game-link').click();await page.locator('#home-demo-submit').click();await page.waitForFunction(()=>document.getElementById('home-demo-submit').textContent==='Request sent');
  assert.deepEqual(await page.evaluate(()=>qaRequests),[['richmond-hill','dispatch','full-version']]);
  await page.locator('#home-demo-play').click();await page.locator('#service-choice button[data-service=fire]').click({timeout:120000});const f=await frameFor(page);await f.waitForFunction(()=>window.PTBO_DISPATCH_DEMO);assert.equal((await state(f)).city,'richmond-hill');
  return {screenshot,target:target.pathname,request:'mocked explicit full-version request',selectedCity:(await state(f)).city};
}
async function bases(page){const f=await open(page);const rows=await f.evaluate(()=>{
  const rows=[];for(const service of ['fire','ems']){PTBO_SERVICE.select(service);for(const b of PTBO_SERVICE.getBases()){
    PTBO_SERVICE.spawn(b.number);const road=PTBO_ROAD_COLLISION.nearestRoad(simLat,simLng,120);const calls=PTBO_DISPATCH_DEMO.pool();
    rows.push({id:b.id,service,spawn:[simLat,simLng],expected:[b.spawnLat,b.spawnLng],roadMetres:road?.distance,calls:calls.length,accessible:calls.filter(resolveIncidentArrival).length});
  }}return rows;
});assert.equal(rows.length,8);for(const r of rows){assert.ok(r.roadMetres<=20,r.id+' is on a road');assert.ok(Math.hypot(r.spawn[0]-r.expected[0],r.spawn[1]-r.expected[1])<.00001,r.id+' selected spawn');assert.equal(r.calls,5);assert.equal(r.accessible,5);}return rows;}
async function nativeFire(page){
  const f=await open(page);await page.locator('.station-select').selectOption('10003');
  await f.evaluate(()=>{const pool=PTBO_DISPATCH_DEMO.pool();const i=pool.findIndex(c=>c.name==='1335 Elgin Mills Road East');if(i<0)throw Error('short native trip missing');Math.random=()=> (i+.01)/pool.length;});
  const initial=await start(f);const samples=[];let held=new Set();
  async function keys(next){for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
  const begin=Date.now();while(Date.now()-begin<60000){
    const s=await f.evaluate(()=>({lat:simLat,lng:simLng,heading:currentHeading,phase:mission.phase,target:activeArrivalPoint,collisions:PTBO_ROAD_COLLISION.state.collisions}));
    if(s.phase!=='response')break;const dy=(s.target.lat-s.lat)*110540,dx=(s.target.lng-s.lng)*111320*Math.cos(s.lat*Math.PI/180);const desired=(Math.atan2(dx,dy)*180/Math.PI+360)%360;const delta=(desired-s.heading+540)%360-180;
    const next=new Set();if(Math.abs(delta)>3)next.add(delta>0?'ArrowRight':'ArrowLeft');if(Math.abs(delta)<12)next.add('ArrowUp');await keys(next);if(samples.length===0||Date.now()-begin>samples.length*1000)samples.push({...s,delta,distance:Math.hypot(dx,dy)});await page.waitForTimeout(60);
  }await keys(new Set());const arrived=await state(f);assert.ok(['on-scene','complete'].includes(arrived.phase),'native keyboard drive arrives without GPS/heading injection');await f.waitForFunction(()=>mission.phase==='complete',null,{timeout:10000});assert.equal((await state(f)).demo.completed,1);
  return {initial,final:await state(f),input:'native browser keyboard only; no GPS or heading mutation',deterministicCallSelection:true,samples,screenshot:await shot(page,'native-fire-complete')};
}
async function nativeRoutes(page){
  const f=await open(page);await f.evaluate(async()=>await PTBO_ROUTE_REVEAL.ready);const coreScript=await f.evaluate(()=>document.querySelector('script[data-ptbo-route-reveal]')?.src);const build=await page.evaluate(()=>window.PTBO_BUILD?.version);assert.equal(new URL(coreScript).searchParams.get('v'),build,'native route core cache version matches canonical build');fs.writeFileSync(path.join(output,'native-route-runtime.json'),JSON.stringify({coreScript,build},null,2)+'\n');
  const rows=await f.evaluate(()=>{const rows=[];for(const service of ['fire','ems']){PTBO_SERVICE.select(service);for(const base of PTBO_SERVICE.getBases()){PTBO_SERVICE.spawn(base.number);for(const call of PTBO_DISPATCH_DEMO.pool()){const arrival=resolveIncidentArrival(call),route=PTBO_ROUTE_REVEAL.calculateRoute(simLat,simLng,arrival.lat,arrival.lng);const hospital=service==='ems'?resolveIncidentArrival(PTBO_SERVICE_CONFIG.hospital):null;const transport=hospital&&PTBO_ROUTE_REVEAL.calculateRoute(arrival.lat,arrival.lng,hospital.lat,hospital.lng);const onward=hospital&&PTBO_ROUTE_REVEAL.calculateRoute(hospital.lat,hospital.lng,arrival.lat,arrival.lng);rows.push({base:base.id,service,call:call.id,routeMetres:route?.distance??null,roads:route?.mainRoads??[],hospitalMetres:transport?.distance??null,hospitalOnwardMetres:onward?.distance??null});}}}return rows;});
  fs.writeFileSync(path.join(output,'native-routes.json'),JSON.stringify(rows,null,2)+'\n');assert.equal(rows.length,40);for(const r of rows){assert.ok(r.routeMetres!==null,`${r.base} → ${r.call}: native directed route`);if(r.service==='ems'){assert.ok(r.hospitalMetres!==null,`${r.call} → hospital: native directed route`);assert.ok(r.hospitalOnwardMetres!==null,`hospital → ${r.call}: native directed route`);}}return rows;
}
async function nativeStreet(page){
  const f=await open(page);await f.evaluate(()=>{const pool=PTBO_DISPATCH_DEMO.pool();const i=pool.findIndex(c=>c.name==='40 Harding Boulevard West');if(i<0)throw Error('native street call missing');Math.random=()=> (i+.01)/pool.length;});
  const initial=await start(f);await f.waitForFunction(()=>Boolean(PTBO_ROUTE_REVEAL?.state.graph),null,{timeout:20000});
  const route=await f.evaluate(()=>{const r=PTBO_ROUTE_REVEAL.calculateRoute(simLat,simLng,activeArrivalPoint.lat,activeArrivalPoint.lng);return r&&{coordinates:r.coordinates,distance:r.distance,mainRoads:r.mainRoads};});assert.ok(route?.coordinates?.length>2,'production directed route supplies native-control waypoints');
  const revealed=await f.evaluate(()=>({shown:PTBO_ROUTE_REVEAL.showRoute(false),coordinates:PTBO_ROUTE_REVEAL.state.routeLine?.getLatLngs().map(p=>[p.lat,p.lng])}));assert.equal(revealed.shown,true,'production route reveal draws the active city route');assert.ok(revealed.coordinates.every(p=>p[0]>43.8&&p[0]<44&&p[1]>-79.6&&p[1]<-79.3),'drawn route stays in Richmond Hill');
  const trace={initial,route,revealed,input:'production route read only; browser keyboard steering/throttle only; no GPS/heading/velocity/physics writes',samples:[],publicRoadMetres:0,outsideBaseYard:false};
  const metres=(a,b)=>Math.hypot((a[0]-b[0])*110540,(a[1]-b[1])*111320*Math.cos(a[0]*Math.PI/180));
  const file=path.join(output,'native-street-trace.json');let index=1,held=new Set(),previous=null,publicShot=false,lastSaved=0;
  async function input(next){for(const k of held)if(!next.has(k))await page.keyboard.up(k);for(const k of next)if(!held.has(k))await page.keyboard.down(k);held=next;}
  const began=Date.now();try{while(Date.now()-began<180000){
    const v=await f.evaluate(()=>({lat:simLat,lng:simLng,heading:currentHeading,speedKmh:Math.abs(velocity)*111195*60*3.6,phase:mission.phase,road:PTBO_ROAD_COLLISION.nearestRoad(simLat,simLng,40),inBaseYard:PTBO_BASE_STORE.contains(PTBO_SERVICE.getBase(),simLat,simLng),collisions:PTBO_ROAD_COLLISION.state.collisions}));
    if(v.phase!=='response')break;const pos=[v.lat,v.lng];while(index<route.coordinates.length-1&&metres(pos,route.coordinates[index])<7)index++;
    const target=route.coordinates[index],dy=(target[0]-v.lat)*110540,dx=(target[1]-v.lng)*111320*Math.cos(v.lat*Math.PI/180),distance=Math.hypot(dx,dy),bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360,delta=(bearing-v.heading+540)%360-180;
    const onPublicRoad=Boolean(!v.inBaseYard&&v.road?.road&&v.road.distance<10&&v.road.highway!=='service');if(previous&&onPublicRoad&&previous.onPublicRoad)trace.publicRoadMetres+=metres(pos,[previous.lat,previous.lng]);trace.outsideBaseYard||=!v.inBaseYard;
    const sample={...v,elapsedMs:Date.now()-began,index,distance,delta,onPublicRoad};previous=sample;
    if(!trace.samples.length||sample.elapsedMs-trace.samples.at(-1).elapsedMs>400)trace.samples.push(sample);
    const next=new Set();if(Math.abs(delta)>3)next.add(delta>0?'ArrowRight':'ArrowLeft');if(Math.abs(delta)<10&&v.speedKmh<(distance<16?17:30))next.add('ArrowUp');await input(next);
    if(!publicShot&&trace.publicRoadMetres>100){await input(new Set());await page.waitForTimeout(150);trace.streetScreenshot=await shot(page,'native-street-enroute');publicShot=true;}
    if(Date.now()-lastSaved>1000){fs.writeFileSync(file,JSON.stringify(trace,null,2)+'\n');lastSaved=Date.now();}await page.waitForTimeout(60);
  }}finally{await input(new Set());trace.final=await state(f);fs.writeFileSync(file,JSON.stringify(trace,null,2)+'\n');}
  assert.ok(['on-scene','complete'].includes(trace.final.phase),'native keyboard street drive arrives normally');assert.equal(trace.outsideBaseYard,true);assert.ok(trace.publicRoadMetres>200,'at least 200m of named street travel outside base yard');await f.waitForFunction(()=>mission.phase==='complete',null,{timeout:10000});trace.final=await state(f);assert.equal(trace.final.demo.completed,1);trace.completionScreenshot=await shot(page,'native-street-complete');fs.writeFileSync(file,JSON.stringify(trace,null,2)+'\n');return trace;
}
async function lifecycle(page,mobile,service){const f=await open(page,service,mobile);const calls=[];const screenshot=[];
  for(let i=1;i<=5;i++){
    const s=await start(f);assert.equal(s.demo.completed,i-1);assert.equal(s.demo.cityId,'richmond-hill');calls.push(s.call);
    if(i===1){const before=s.pos;if(mobile){const box=await page.locator('#steering').boundingBox();assert.ok(box);const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+10,id:1}]});await page.waitForTimeout(1500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await page.keyboard.down('ArrowUp');await page.waitForTimeout(1500);await page.keyboard.up('ArrowUp');}const after=(await state(f)).pos;assert.ok(Math.hypot(after[0]-before[0],after[1]-before[1])>1e-6,'native departure movement');screenshot.push(await shot(page,`map-${service}-${mobile?'mobile':'desktop'}`));}
    await arrive(f);if(service==='ems'){
      assert.equal((await state(f)).demo.completed,i-1,'scene arrival does not complete EMS');await f.waitForFunction(()=>mission.phase==='transport',null,{timeout:10000});assert.equal((await state(f)).demo.completed,i-1,'pickup does not complete EMS');assert.match((await state(f)).hospital,/Mackenzie Richmond Hill/);await arrive(f);
    }await f.waitForFunction(()=>mission.phase==='complete',null,{timeout:10000});assert.equal((await state(f)).demo.completed,i);
    await f.evaluate(()=>{completeAssignment();executeIncidentArrivalProcedures();});assert.equal((await state(f)).demo.completed,i,'repeat completion ignored');
  }assert.equal(new Set(calls).size,5,'five distinct completed calls');await page.locator('#ptbo-dispatch-demo-finish[open]').waitFor();screenshot.push(await shot(page,`finish-${service}-${mobile?'mobile':'desktop'}`));
  assert.equal((await state(f)).demo.finished,true);await f.evaluate(()=>fireRandomIncidentDispatch());assert.equal((await state(f)).demo.completed,5);assert.equal((await state(f)).phase,'complete','sixth call blocked');
  const request=new URL(await page.locator('#ptbo-dispatch-demo-request').getAttribute('href'),page.url());assert.equal(request.searchParams.get('city'),'richmond-hill');assert.equal(request.searchParams.get('request'),'dispatch');
  if(service==='ems'){
    await page.locator('#ptbo-dispatch-demo-request').click();await page.locator('#home-demo-dialog[open]').waitFor();assert.equal(await page.locator('#home-demo-city').innerText(),'Richmond Hill');assert.equal(await page.locator('#home-demo-submit').innerText(),'Request full version');assert.equal(await page.locator('#home-demo-status').innerText(),'','finish request link opens popup without sending');
    return {calls,screenshot,finishRequest:request.search,finishRequestOpenedWithoutSending:true,arrivalFixture:'scene and hospital GPS injection; real transition timers'};
  }
  await page.locator('#ptbo-dispatch-demo-replay').click();assert.equal((await state(f)).demo.completed,0);await start(f);assert.equal((await state(f)).demo.completed,0);
  return {calls,screenshot,finishRequest:request.search,arrivalFixture:'scene and hospital GPS injection; real transition timers',replay:await state(f)};
}
async function mapRender(page,mobile){const f=await open(page,'fire',mobile);await start(f);await f.waitForFunction(()=>[...document.querySelectorAll('#map img.leaflet-tile')].some(i=>i.complete&&i.naturalWidth>0),null,{timeout:20000});await page.waitForTimeout(2000);const tiles=await f.evaluate(()=>[...document.querySelectorAll('#map img.leaflet-tile')].map(i=>({loaded:i.complete&&i.naturalWidth>0,host:new URL(i.src).hostname})));return {tiles,screenshot:await shot(page,`rendered-map-${mobile?'mobile':'desktop'}`)};}
async function abortAndIsolation(page){const f=await open(page);await start(f);await complete(f,'fire');assert.equal((await state(f)).demo.completed,1);await start(f);
  await page.locator('.station-select').selectOption('10001');assert.equal((await state(f)).demo.completed,1);assert.equal((await state(f)).phase,undefined);
  await start(f);await f.evaluate(()=>PTBO_SERVICE.select('ems'));assert.equal((await state(f)).demo.completed,1);assert.equal((await state(f)).phase,undefined);
  await start(f);await f.evaluate(()=>resetDispatchWorkflow());assert.equal((await state(f)).demo.completed,1);await page.reload({waitUntil:'domcontentloaded'});await page.locator('#service-choice button[data-service=fire]').click({timeout:120000});const fresh=await frameFor(page);await fresh.waitForFunction(()=>window.PTBO_DISPATCH_DEMO);assert.equal((await state(fresh)).demo.completed,0,'reload fresh session');
  const pb=await open(page,'fire',false,'peterborough',{demo:'1',callLimit:'5'});const pbState=await pb.evaluate(()=>({city:PTBO_CITY_PACKAGE.id,demo:Boolean(window.PTBO_DISPATCH_DEMO),transport:PTBO_CITY_PACKAGE.features.hospitalTransport!==false,bases:PTBO_SERVICE.getBases().length}));assert.equal(pbState.city,'peterborough');assert.equal(pbState.demo,false);assert.equal(pbState.transport,true);
  const other=await open(page,'fire',false,'oshawa',{demo:'richmond-hill',callLimit:'5'});const otherState=await other.evaluate(()=>({city:PTBO_CITY_PACKAGE.id,demo:Boolean(window.PTBO_DISPATCH_DEMO),transport:PTBO_CITY_PACKAGE.features.hospitalTransport}));assert.equal(otherState.city,'oshawa');assert.equal(otherState.demo,false);assert.equal(otherState.transport,false);
  // Kingston has no Dispatch package. Its existing startup diagnostics are
  // expected; assert it fails closed rather than falling back to another city.
  page.removeAllListeners('pageerror');const expectedStartupErrors=[];page.on('pageerror',e=>expectedStartupErrors.push(e.message));
  await page.goto(url('response-simulator/play/','kingston',{demo:'richmond-hill',callLimit:'5'}),{waitUntil:'domcontentloaded'});await page.locator('#startup-retry').waitFor({state:'visible',timeout:40000});const missing=await frameFor(page);const unavailable=await missing.evaluate(()=>({requested:window.PTBO_REQUESTED_CITY,city:window.PTBO_CITY_PACKAGE?.id||null,demo:Boolean(window.PTBO_DISPATCH_DEMO),selected:Boolean(window.PTBO_SERVICE?.state.selected)}));assert.equal(unavailable.requested,'kingston');assert.equal(unavailable.city,null);assert.equal(unavailable.demo,false);assert.equal(unavailable.selected,false);
  return {progressSurvivedBaseServiceAbort:true,reloadFresh:true,pb:pbState,other:otherState,unavailable,expectedStartupErrors};
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;let browser;
try{const proxyUrl=liveTiles&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);const proxy=proxyUrl?new URL(proxyUrl):null;browser=await chromium.launch({headless:true,...(proxy?{proxy:{server:proxy.origin,bypass:'127.0.0.1,localhost',...(proxy.username?{username:decodeURIComponent(proxy.username),password:decodeURIComponent(proxy.password)}:{})}}:{}),...(process.env.PTBO_CHROMIUM_EXECUTABLE?{executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
  const cases=[['map-desktop',false,p=>mapRender(p,false)],['map-mobile',true,p=>mapRender(p,true)],['launcher-desktop',false,p=>launcher(p,false)],['launcher-mobile',true,p=>launcher(p,true)],['bases',false,bases],['native-fire',false,nativeFire],['native-street',false,nativeStreet],['native-routes',false,nativeRoutes],['fire-five-desktop',false,p=>lifecycle(p,false,'fire')],['ems-five-mobile',true,p=>lifecycle(p,true,'ems')],['abort-isolation',false,abortAndIsolation]];
  const selected=process.env.PTBO_QA_CASES?.split(',');for(const[name,mobile,action]of cases){if(name.startsWith('map-')&&!liveTiles)continue;if(selected&&!selected.includes(name))continue;const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});await context.route('**/*',r=>{const q=r.request(),u=new URL(q.url()),host=u.hostname;if(u.origin===base)return r.continue();return liveTiles&&u.protocol==='https:'&&q.method()==='GET'&&q.resourceType()==='image'&&/(?:^|\.)(?:arcgisonline\.com|arcgis\.com|basemaps\.cartocdn\.com|tile\.openstreetmap\.org)$/.test(host)?r.continue():r.abort();});await context.addInitScript(()=>{localStorage.setItem('ptboResponseVisualTutorialSeenV1','1');localStorage.setItem('ptboDispatchVoiceEnabled','false');});const page=await context.newPage();page.setDefaultTimeout(45000);const result={name,mobile,errors:[],dialogs:[],tileResponses:{},tileFailures:{}};page.on('response',r=>{if(r.request().resourceType()==='image'&&new URL(r.url()).protocol==='https:'){const key=new URL(r.url()).hostname+':'+r.status();result.tileResponses[key]=(result.tileResponses[key]||0)+1;}});page.on('requestfailed',r=>{if(r.resourceType()==='image'&&new URL(r.url()).protocol==='https:'){const key=new URL(r.url()).hostname+':'+r.failure()?.errorText;result.tileFailures[key]=(result.tileFailures[key]||0)+1;}});page.on('pageerror',e=>result.errors.push(e.message));page.on('dialog',d=>{result.dialogs.push(d.message());void d.dismiss();});const began=Date.now();try{result.detail=await action(page);assert.deepEqual(result.errors,[]);assert.deepEqual(result.dialogs,[]);result.pass=true;}catch(e){result.pass=false;result.error=e.stack;result.screenshot=await shot(page,`failed-${name}`).catch(()=>null);}result.durationMs=Date.now()-began;report.results.push(result);checkpoint();console.log(JSON.stringify({name,pass:result.pass,durationMs:result.durationMs,error:result.error?.split('\n')[0]}));await context.close();}
}finally{await browser?.close();await new Promise(r=>server.close(r));report.finishedAt=new Date().toISOString();checkpoint();}if(report.results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
