/* Optional browser acceptance harness. Sequential contexts avoid retaining two
 * large city road graphs. Without a URL argument, this process owns its Python
 * HTTP server so browser and server share the same execution network namespace.
 * NODE_PATH points to the temporary Playwright installation; no npm dependency
 * or browser binary is required in the repository.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const json=file=>JSON.parse(read(file));
const registry={window:{}};vm.runInNewContext(read('cities/city-registry.js'),registry);
const requestedCities=process.env.PTBO_QA_CITIES?.split(',').filter(Boolean);
const cities=Array.from(registry.window.PTBO_CITIES).filter(c=>!requestedCities||requestedCities.includes(c.id));
const services=process.env.PTBO_QA_SERVICES?.split(',').filter(Boolean)||['fire','ems'];
const modes=new Set((process.env.PTBO_QA_MODES||'geo,route,deep,transport').split(','));
const requestedRouteIds=(process.env.PTBO_QA_ROUTE_CALL_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
const out=path.resolve(process.env.PTBO_QA_OUTPUT||'/tmp/ptbo-city-call-expansion-browser');
const expectedVersion=process.env.PTBO_EXPECTED_VERSION;
const stubTiles=process.env.PTBO_QA_STUB_TILES!=='0';
const tileWaitMs=Math.max(1000,Math.min(30000,Number(process.env.PTBO_QA_TILE_WAIT_MS)||30000));
const screenshots=new Set(['peterborough','belleville','scarborough','ajax','ottawa']);
const caseStates=new WeakMap();
const tileUrl=/https:\/\/(?:[abc]\.)?tile\.openstreetmap\.org\//;
const blankPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
fs.mkdirSync(out,{recursive:true});
const report={startedAt:new Date().toISOString(),base:null,requestedCities:requestedCities||'all',requestedRouteIds,modes:[...modes],tileWaitMs,results:[],
 limits:[
  'Browser contexts are sequential. Desktop Fire and emulated mobile EMS are exhaustive by city; additional opposite-surface checks are sampled.',
  'Geo selects every recognition tier and checks its real answer/return flow. EMS care-home tier overrides are counted separately from the shared canonical recognition target.',
  'Route station/profile inventories are exhaustive; gameplay selects one published civic exercise per city/service where available. Exhaustive directed route/source audits run separately.',
  'Most route submissions use a disclosed deterministic reference-trace fixture. Deeper samples use native mouse/touch events on published road paths.',
  'Simulator transport samples set GPS at the published scene and hospital targets to exercise arrival/state transitions; they do not drive the trip or verify an entrance.',
  'Active-game screenshots report visible decoded real tiles separately from request outcomes. Zero decoded real tiles means basemap rendering is unverified; screenshot inspection remains required.',
  'Stubbed tiles establish UI/count/selection behavior only. Physical-device behavior, source truth and emergency-routing fidelity are not established by this harness.',
 ]};
function checkpoint(){fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
function url(base,file,city,extra={}){const u=new URL(file,base+'/');u.searchParams.set('city',city);u.searchParams.set('analytics','off');if(expectedVersion)u.searchParams.set('v',expectedVersion);for(const[k,v]of Object.entries(extra))u.searchParams.set(k,String(v));return u.href;}
async function ownServer(){
 const reservation=net.createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const log=fs.openSync(path.join(out,'http-server.log'),'a');
 const child=spawn(process.env.PYTHON||'python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{cwd:root,stdio:['ignore',log,log]});
 const base='http://127.0.0.1:'+port;let last;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)throw Error('HTTP server exited: '+child.exitCode);
  try{const response=await fetch(base+'/cities/city-registry.js',{signal:AbortSignal.timeout(1000)});if(response.ok)return{base,close:()=>{child.kill('SIGTERM');fs.closeSync(log);}};}catch(error){last=error;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 child.kill('SIGTERM');fs.closeSync(log);throw Error('HTTP server did not become ready: '+last?.message);
}
async function findFrame(page,part){
 for(let i=0;i<150;i++){const frame=page.frames().find(f=>f.url().includes(part));if(frame)return frame;await page.waitForTimeout(100);}
 throw Error('Game frame did not load: '+part);
}
async function contextFor(browser,mobile,{visual=false}={}){
 const realTiles=visual&&process.env.PTBO_QA_REAL_TILES==='1';
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},isMobile:mobile,hasTouch:mobile,
  ignoreHTTPSErrors:process.env.PTBO_QA_IGNORE_TLS==='1',reducedMotion:'reduce'});
 await context.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,contentType:'application/json',body:'{}'}));
 await context.route('https://cloudflareinsights.com/**',r=>r.abort());
 if(stubTiles&&!realTiles)await context.route(/https:\/\/(?:[abc]\.)?tile\.openstreetmap\.org\//,r=>r.fulfill({contentType:'image/png',body:blankPng}));
 await context.addInitScript(()=>{localStorage.setItem('geoShowCrossStreets','true');localStorage.setItem('ptboResponseVisualTutorialSeenV1','1');});
 return{context,stubbedTiles:stubTiles&&!realTiles};
}
async function check(browser,base,name,mobile,fn,{visual=false}={}){
 const began=Date.now(),{context,stubbedTiles}=await contextFor(browser,mobile,{visual}),page=await context.newPage();
 const result={name,mobile,stubbedTiles,errors:[],missingLocal:[],activeScreenshots:[]};page.setDefaultTimeout(45000);
 const tileRequests={loaded:new Set(),httpFailed:new Set(),networkFailed:new Set()};caseStates.set(page,{result,visual,tileRequests});
 page.on('response',response=>{if(tileUrl.test(response.url()))(response.ok()?tileRequests.loaded:tileRequests.httpFailed).add(response.url());});
 page.on('requestfailed',request=>{if(tileUrl.test(request.url()))tileRequests.networkFailed.add(request.url());});
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)result.missingLocal.push(r.status()+' '+r.url());});
 try{
  result.detail=await fn(page,context,result);
  assert.deepEqual(result.errors,[],'uncaught browser errors');assert.deepEqual(result.missingLocal,[],'missing local assets');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
  result.pass=true;
 }catch(error){result.pass=false;result.error=error.stack||error.message;}
 if(visual||!result.pass){result.endScreenshot=name+(stubbedTiles?'-stubbed-map':'')+'.png';await page.screenshot({path:path.join(out,result.endScreenshot),fullPage:true}).catch(()=>{});}
 result.durationMs=Date.now()-began;report.results.push(result);checkpoint();
 console.log(JSON.stringify({name,pass:result.pass,ms:result.durationMs,error:result.error?.split('\n')[0]}));
 await context.close();return result;
}
async function captureActiveGame(page,surface,stage){
 const entry=caseStates.get(page);if(!entry?.visual)return;
 const {result,tileRequests}=entry;
 await surface.locator('#map').waitFor({state:'visible'});await surface.locator('#call-address').waitFor({state:'visible'});
 // Wait only for the currently visible tile set; distant buffered tiles do not
 // establish what is actually visible behind the game UI.
 await surface.waitForFunction(()=>{
  const tiles=[...document.querySelectorAll('#map img.leaflet-tile')].filter(tile=>{const r=tile.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;});
  return tiles.length>0&&tiles.every(tile=>tile.complete);
 },null,{timeout:tileWaitMs}).catch(()=>{});
 const detail=await surface.evaluate(()=>{
  const images=[...document.querySelectorAll('#map img.leaflet-tile')].filter(tile=>{const r=tile.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;});
  const loaded=images.filter(tile=>tile.complete&&tile.naturalWidth>1&&tile.naturalHeight>1).length;
  const failed=images.filter(tile=>tile.complete&&tile.naturalWidth===0).length;
  const pending=images.filter(tile=>!tile.complete).length;
  const s=window.PTBO_ROUTE_MAPPING?.state;
  const visible=element=>{const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;};
  return{visibleTileImages:images.length,loaded,failed,pending,nonMapPixels:images.filter(tile=>tile.complete&&tile.naturalWidth===1).length,
   callAddress:document.getElementById('call-address').textContent,
   ...(s?{routeMode:s.mode,referenceOverlayLayers:s.referenceLayers.length,playerOverlayLayers:s.playerLayers.length,
    visibleRoutePaths:[...document.querySelectorAll('#map .leaflet-overlay-pane path')].filter(visible).length,
    visibleRouteCanvases:[...document.querySelectorAll('#map .leaflet-overlay-pane canvas')].filter(visible).length,
    routeOverlaysInViewport:[...s.referenceLayers,...s.playerLayers].filter(layer=>s.map.hasLayer(layer)&&s.map.getBounds().intersects(layer.getBounds())).length}:{geoPhase:document.getElementById('game').hidden?'setup':'active'})};
 });
 if(stage.startsWith('route')){assert.ok(detail.referenceOverlayLayers+detail.playerOverlayLayers>0,'active route screenshot has a route overlay');assert.ok(detail.routeOverlaysInViewport>0&&detail.visibleRoutePaths+detail.visibleRouteCanvases>0,'active route overlay is visible');}
 const filename=result.name+'-'+stage+(result.stubbedTiles?'-stubbed-map':'')+'.png';
 const realTilePixelsLoaded=!result.stubbedTiles&&detail.loaded>0;
 const screenshot={filename,stage,...detail,stubbedTiles:result.stubbedTiles,realTilePixelsLoaded,
  basemapStatus:result.stubbedTiles?'stubbed':!detail.loaded?'unavailable':detail.failed||detail.pending?'partial':'loaded',
  tileRequests:{loaded:tileRequests.loaded.size,httpFailed:tileRequests.httpFailed.size,networkFailed:tileRequests.networkFailed.size},
  visualInspection:'pending',...(!result.stubbedTiles&&!detail.loaded?{limitation:'No decoded visible external map tiles loaded; this screenshot does not verify basemap rendering.'}:{})};
 await page.screenshot({path:path.join(out,filename),fullPage:true});result.activeScreenshots.push(screenshot);
 if(screenshot.limitation)console.log(JSON.stringify({name:result.name,stage,basemapStatus:screenshot.basemapStatus,limitation:screenshot.limitation}));
}
async function geoCase(page,base,city,service,mobile){
 const other=city.id==='toronto'?'belleville':'toronto';
 await page.addInitScript(({other})=>{
  localStorage.setItem('ptboSelectedCity',other);
  localStorage.setItem('ptboSharedDispatchLocationsV3:'+other,JSON.stringify({version:3,cityId:other,dataVersion:'ontario-geo-1',items:[{id:'qa-foreign-city-edit',name:'Foreign city edit',addr:'Foreign address',lat:43.7,lng:-79.4,radius:50,recognitionDifficulty:'easy',custom:true}]}));
 },{other});
 await page.goto(url(base,'geo-guesser/'+(mobile?'mobile':'desktop')+'/',city.id),{waitUntil:'load'});
 const frame=await findFrame(page,'/geo-guesser/index.html');
 await frame.waitForFunction(()=>window.PTBO_GEO?.state.ready,null,{timeout:60000});
 const inventory=await frame.evaluate(service=>{
  const g=PTBO_GEO,all=g.state.locations,eligible=item=>!item.trainingServices||item.trainingServices.includes(service);
  const common=all.filter(item=>!item.trainingServices||(['fire','ems'].every(s=>item.trainingServices.includes(s))));
  const tiers=Object.fromEntries(['easy','medium','hard'].map(tier=>{
   const pool=PTBO_STATION_PRACTICE.serviceLocations(all,service,tier);
   return[tier,{canonical:common.filter(c=>c.recognitionDifficulty===tier&&eligible(c)).length,normalEligible:pool.filter(c=>c.recognitionDifficulty===tier).length,careHomeOverrides:pool.filter(c=>c.recognitionDifficulty!==tier&&c.facilityType==='long-term-care').length,total:pool.length}];
  }));
  return{city:PTBO_CITY_PACKAGE.id,storeCity:PTBO_DISPATCH_STORE.cityId,trainingCity:PTBO_DISPATCH_STORE.getTrainingData().id,storageKey:PTBO_DISPATCH_STORE.storageKey,
   version:PTBO_BUILD.version,baseIds:PTBO_BASE_STORE.getBases(service).map(b=>b.id),tiers,commonLocations:common.length,uniqueCommonIds:new Set(common.map(c=>c.id)).size,
   foreignEditPresent:all.some(c=>c.id==='qa-foreign-city-edit'),sharedRowCityMismatch:PTBO_DISPATCH_STORE.getTrainingData().sharedLocations?.some(c=>c.cityId&&c.cityId!==PTBO_CITY_PACKAGE.id)||false};
 },service);
 assert.equal(inventory.city,city.id);assert.equal(inventory.storeCity,city.id);assert.equal(inventory.trainingCity,city.id);assert.ok(inventory.storageKey.endsWith(':'+city.id));
 assert.equal(inventory.foreignEditPresent,false);assert.equal(inventory.sharedRowCityMismatch,false);assert.equal(inventory.commonLocations,inventory.uniqueCommonIds);
 if(expectedVersion)assert.equal(inventory.version,expectedVersion);
 for(const[tier,min]of Object.entries({easy:100,medium:50,hard:50})){
  const count=inventory.tiers[tier];assert.ok(count.canonical>=min,city.id+' '+tier+' canonical shortfall: '+count.canonical);
  assert.equal(count.total,count.normalEligible+count.careHomeOverrides);
 }
 await frame.locator('#service-'+service).click();
 const played=[];
 for(const[tier,index]of [['easy',0],['medium',Math.floor(inventory.baseIds.length/2)],['hard',inventory.baseIds.length-1]]){
  await frame.locator('#difficulty-'+tier).click();
  assert.equal(Number(await frame.locator('#count-'+tier).innerText()),inventory.tiers[tier].total);
  assert.equal(await frame.locator('#practice-stations button').count(),inventory.baseIds.length);
  await frame.locator('#practice-stations button').nth(index).click();
  const selected=await frame.evaluate(()=>({baseId:PTBO_GEO.state.base.id,tier:PTBO_GEO.state.difficulty,target:PTBO_GEO.state.target.id,targetTier:PTBO_GEO.state.target.recognitionDifficulty,facilityType:PTBO_GEO.state.target.facilityType,address:PTBO_GEO.state.target.addr,crossStreets:PTBO_GEO.state.target.crossStreets}));
  assert.equal(selected.baseId,inventory.baseIds[index]);assert.equal(selected.tier,tier);
  assert.equal(await frame.locator('#call-address').innerText(),selected.address);
  if(tier==='easy')await captureActiveGame(page,frame,'geo-active-easy');
  await frame.evaluate(()=>{const s=PTBO_GEO.state;s.map.stop().setView([s.target.lat,s.target.lng],18,{animate:false});});
  await frame.locator('#confirm').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'correct');
  assert.equal(await frame.evaluate(()=>PTBO_GEO.state.target.id),selected.target,'answer waits for explicit Next');
  await frame.locator('#practice-continue').click();
  assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
  await frame.locator('#practice-return').click();assert.equal(await frame.locator('#station-practice').isVisible(),true);
  assert.equal(await frame.locator('#service-'+service).getAttribute('aria-pressed'),'true');
  assert.equal(await frame.locator('#difficulty-'+tier).getAttribute('aria-pressed'),'true');played.push(selected);
 }
 return{...inventory,played,answerMethod:'Map centred on the published source point; real Check location and Next/Return buttons.'};
}
async function openRoute(page,base,city,service,{baseId,callId}={}){
 await page.goto(url(base,'route-mapping/',city.id,{service}),{waitUntil:'load'});
 await page.locator('#station-picker[aria-busy="false"]').waitFor();
 const inventory=await page.evaluate(service=>{
  const training=PTBO_DISPATCH_STORE.getTrainingData(),bases=PTBO_BASE_STORE.getBases(service),profiles=training.routeResponses.bases.filter(p=>p.service===service);
  const choices=PTBO_ROUTE_STATIONS.stationChoices(bases,training,service);
  return{city:PTBO_CITY_PACKAGE.id,storeCity:PTBO_DISPATCH_STORE.cityId,trainingCity:training.id,version:PTBO_BUILD.version,
   bases:bases.map(b=>({id:b.id,number:b.number})),profiles:profiles.map(p=>({baseId:p.baseId,callIds:p.callIds,unavailable:!!p.unavailable})),
   choices:choices.map(c=>({id:c.base.id,callCount:c.callCount,available:c.available})),
   calls:training.routeCalls.filter(c=>c.trainingServices?.includes(service)).map(c=>({id:c.id,baseId:c.routeBaseId,canonicalId:c.canonicalCallId,role:c.responseAssignment?.role,generator:c.responseAssignment?.generator})),
   civic:training.routeCalls.filter(c=>c.trainingServices?.includes(service)&&c.responseAssignment?.generator==='civic-v1').map(c=>({id:c.id,baseId:c.routeBaseId,canonicalId:c.canonicalCallId,role:c.responseAssignment.role,generator:c.responseAssignment.generator}))};
 },service);
 assert.equal(inventory.city,city.id);assert.equal(inventory.storeCity,city.id);assert.equal(inventory.trainingCity,city.id);
 assert.deepEqual(inventory.bases.map(b=>b.id).sort(),inventory.profiles.map(p=>p.baseId).sort());
 assert.equal(await page.locator('[data-station-id]').count(),inventory.bases.length);
 for(const c of inventory.choices){const row=page.locator('[data-station-id="'+c.id+'"]');assert.equal(await row.count(),1);if(c.available)assert.equal(await row.locator('.station-call-count').innerText(),c.callCount+' '+(c.callCount===1?'call':'calls')+' available');}
 const desired=callId?inventory.calls.find(c=>c.id===callId):inventory.civic[0];
 if(callId)assert.ok(desired,'requested published call is not available');
 const chosenId=baseId||desired?.baseId||inventory.choices.find(c=>c.available)?.id;
 assert.ok(chosenId,'no available station');
 await page.locator('#station-search').fill('qa no station matches');assert.equal(await page.locator('[data-station-id]').count(),0);
 await page.locator('#station-search').fill('');await page.locator('a[data-station-id="'+chosenId+'"]').click();
 await page.waitForFunction(()=>window.PTBO_ROUTE_MAPPING||!document.getElementById('loading-error').hidden,null,{timeout:120000});
 if(!await page.evaluate(()=>!!window.PTBO_ROUTE_MAPPING))throw Error(await page.locator('#loading-error-message').innerText());
 const wanted=callId||desired?.id;
 if(wanted)await page.evaluate(id=>{const a=PTBO_ROUTE_MAPPING,s=a.state,p=s.routeResponses.bases.find(p=>p.baseId===s.base.id);s.recentCallIds=p.callIds.filter(x=>x!==id);a.newCall();},wanted);
 const detail=await page.evaluate(()=>{
  const s=PTBO_ROUTE_MAPPING.state,p=s.routeResponses.bases.find(p=>p.baseId===s.base.id&&p.service===s.service),c=s.call;
  return{city:PTBO_ROUTE_MAPPING.cityId,service:s.service,baseId:s.base.id,callId:c.id,canonicalId:c.canonicalCallId,role:c.responseAssignment?.role,generator:c.responseAssignment?.generator,
   local:c.routeBaseId===s.base.id&&p.callIds.includes(c.id),profileCalls:p.callIds.length,callCount:s.callCount,progress:s.progression.completed,
   canonicalPresent:!!s.originalCalls.find(row=>row.id===c.canonicalCallId),version:PTBO_BUILD.version};
 });
 assert.equal(detail.city,city.id);assert.equal(detail.service,service);assert.equal(detail.baseId,chosenId);assert.equal(detail.local,true);
 if(wanted)assert.equal(detail.callId,wanted);
 if(desired?.generator==='civic-v1'){assert.equal(detail.generator,'civic-v1');assert.equal(detail.canonicalPresent,true);}
 if(expectedVersion)assert.equal(detail.version,expectedVersion);
 return{inventory,detail,historySelectionFixture:!!wanted};
}
async function referenceTrace(page){
 return page.evaluate(()=>{
  const s=PTBO_ROUTE_MAPPING.state,c=s.traceCore,origin=c.snap(s.startMarker.getLatLng(),3),destination=c.snap(s.callMarker.getLatLng(),3),route=origin&&destination&&c.between(origin,destination);
  if(!route?.edges.length)throw Error('No directed reference route to the displayed CALL marker');
  return{distance:route.distance,origin,destination,points:[route.start,...route.edges.map(e=>e.end)]};
 });
}
async function submitFixture(page){
 const before=await page.evaluate(()=>({progress:PTBO_ROUTE_MAPPING.state.progression.completed,callCount:PTBO_ROUTE_MAPPING.state.callCount}));
 const route=await referenceTrace(page);
 await page.evaluate(route=>{const s=PTBO_ROUTE_MAPPING.state,c=s.traceCore;s.originAnchor=route.origin;s.destinationAnchor=route.destination;s.playerRoute=c.finish(c.trace(route.points,{tolerance:12}),route.destination,40);if(!s.playerRoute.complete)throw Error('Reference trace did not arrive');s.mode='editing';document.getElementById('submit-button').disabled=false;},route);
 await page.locator('#submit-button').click();await page.locator('#results').waitFor({state:'visible'});
 assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.progression.completed),before.progress+1);
 const review=await page.locator('#results').innerText();assert.match(review,/100% efficient/);
 await captureActiveGame(page,page,'route-review');
 await page.locator('#next-button').click();assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.callCount),before.callCount+1);
 assert.equal(await page.evaluate(()=>{const s=PTBO_ROUTE_MAPPING.state;return s.call.routeBaseId===s.base.id;}),true);
 return{distance:route.distance,review,submissionMethod:'Production trace-core path supplied by test; real Submit and Next buttons.'};
}
async function returnRoute(page,service){await page.locator('.back-button').click();await page.locator('#station-picker[aria-busy="false"]').waitFor();assert.equal(await page.locator('#picker-'+service).getAttribute('aria-pressed'),'true');}
async function nativeTrace(page,context,mobile){
 const info=await page.evaluate(()=>{
  const s=PTBO_ROUTE_MAPPING.state,c=s.traceCore,route=c.between(c.snap(s.startMarker.getLatLng(),3),c.snap(s.callMarker.getLatLng(),3));
  if(!route?.edges.length)throw Error('No published route for native input');
  let metres=0;window.qaExpansionPoints=[{...route.start,metres:0}];
  for(const e of route.edges){const n=Math.max(1,Math.ceil(e.distance/4));for(let i=1;i<=n;i++)qaExpansionPoints.push({lat:e.start.lat+(e.end.lat-e.start.lat)*i/n,lng:e.start.lng+(e.end.lng-e.start.lng)*i/n,metres:metres+e.distance*i/n});metres+=e.distance;}
  return{distance:route.distance,samples:qaExpansionPoints.length,progress:s.progression.completed};
 });
 const touch=mobile?await context.newCDPSession(page):null;let index=0,events=0,chunks=0;
 while(index<info.samples-1){
  const chunk=await page.evaluate(({index,length})=>{
   const s=PTBO_ROUTE_MAPPING.state;let end=index+1;while(end<qaExpansionPoints.length-1&&qaExpansionPoints[end].metres-qaExpansionPoints[index].metres<length)end++;
   const points=qaExpansionPoints.slice(index,end+1);s.map.fitBounds(points.map(p=>[p.lat,p.lng]),{paddingTopLeft:[60,150],paddingBottomRight:[60,190],maxZoom:18,animate:false});
   const r=s.map.getContainer().getBoundingClientRect();return{end,points:points.map(p=>{const q=s.map.latLngToContainerPoint(p);return{x:r.left+q.x,y:r.top+q.y};})};
  },{index,length:mobile?170:450});
  await page.waitForTimeout(60);const box=await page.locator('#draw-surface').boundingBox();assert.ok(box,'START/END pointer handle');
  const start={x:box.x+box.width/2,y:box.y+box.height/2};
  if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});else{await page.mouse.move(start.x,start.y);await page.mouse.down();}
  for(const p of chunk.points.slice(1)){if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});else await page.mouse.move(p.x,p.y);events++;}
  if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  chunks++;index=chunk.end;
  const mode=await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.mode);if(mode==='editing')break;
  const gap=await page.evaluate(end=>{const s=PTBO_ROUTE_MAPPING.state;return s.playerRoute?s.traceCore.distance(s.playerRoute.endpoint,qaExpansionPoints[end]):Infinity;},index);
  assert.ok(gap<=70,'native trace lost its intended road path by '+gap.toFixed(1)+' m');
 }
 await page.waitForFunction(()=>PTBO_ROUTE_MAPPING.state.mode==='editing',null,{timeout:10000});
 assert.equal(await page.locator('#submit-button').isEnabled(),true);
 await page.locator('#submit-button').click();await page.locator('#results').waitFor({state:'visible'});
 const review=await page.locator('#results').innerText();assert.match(review,/100% efficient/);
 await captureActiveGame(page,page,'route-review');
 assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.progression.completed),info.progress+1);
 return{...info,review,nativeEvents:events,chunks,pointer:mobile?'emulated touch':'native mouse'};
}
async function simulatorTransport(page,base,mobile){
 await page.addInitScript(()=>{Math.random=()=>0;});
 await page.goto(url(base,'response-simulator/'+(mobile?'mobile':'play')+'/','peterborough'),{waitUntil:'load'});
 await page.locator('#service-choice [data-service="ems"]').click({timeout:60000});
 const frame=await findFrame(page,'/response-simulator/index.html');
 await frame.waitForFunction(()=>window.PTBO_SERVICE?.state.selected&&window.PTBO_TRAINING_HISTORY,null,{timeout:60000});
 assert.equal(await frame.evaluate(()=>PTBO_CITY_PACKAGE.id),'peterborough');
 assert.equal(await frame.evaluate(()=>PTBO_SERVICE_CONFIG.profiles.ems.id),'ems');
 const skip=page.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
 await frame.locator('#hud-action-btn').click();await frame.waitForFunction(()=>simulationState===STATES.ENROUTE);
 const response=await frame.evaluate(()=>({sceneId:activeIncident.id,source:{lat:activeIncident.lat,lng:activeIncident.lng},arrival:{...activeArrivalPoint},hospital:PTBO_BASE_STORE.getHospital(),before:PTBO_TRAINING_HISTORY.exportData().entries.length}));
 assert.ok(response.hospital&&!response.hospital.disabled,'verified configured receiving destination must be supported');
 await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
 await frame.waitForFunction(()=>simulationState===STATES.ONSCENE);
 assert.equal(await frame.evaluate(()=>mission.phase),'pickup');
 await frame.waitForFunction(()=>simulationState===STATES.TRANSPORTING,null,{timeout:15000});
 assert.equal(await frame.evaluate(()=>activeIncident.sub),'Hospital Transport');
 const transport=await frame.evaluate(()=>({hospitalId:activeIncident.id,address:activeIncident.addr,name:activeIncident.name,arrival:{...activeArrivalPoint},phase:mission.phase}));
 assert.equal(transport.address,response.hospital.addr);
 assert.ok(['transport','handover'].includes(transport.phase));
 if(transport.phase==='transport')await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
 await frame.waitForFunction(()=>mission.phase==='handover');
 await frame.waitForFunction(()=>simulationState===STATES.INSERVICE,null,{timeout:15000});
 assert.equal(await frame.evaluate(()=>PTBO_TRAINING_HISTORY.exportData().entries.length),response.before+1);
 return{response,transport,completionCount:1,selectionRandomFixture:0,gpsSetByTest:true,tripDriven:false};
}
async function citySwitch(page,base,first,second,service){
 await page.goto(url(base,'',first.id),{waitUntil:'load'});
 await page.locator('#home-city-select:not([disabled])').waitFor();
 await page.locator('#home-city-select').selectOption(second.id);
 const href=await page.locator('#geo-game-link').getAttribute('href');assert.equal(new URL(href,base).searchParams.get('city'),second.id);
 await page.locator('#geo-game-link').click();
 const frame=await findFrame(page,'/geo-guesser/index.html');await frame.waitForFunction(()=>window.PTBO_GEO?.state.ready);
 assert.equal(await frame.evaluate(()=>PTBO_CITY_PACKAGE.id),second.id);assert.equal(await frame.evaluate(()=>PTBO_DISPATCH_STORE.cityId),second.id);
 await frame.locator('#service-'+service).click();await frame.locator('#difficulty-easy').click();
 assert.ok(await frame.locator('#practice-stations button').count());
 await frame.locator('#practice-stations button').first().click();await frame.locator('#practice-return').click();
 await frame.locator('#game-home').click();await page.locator('#home-city-select:not([disabled])').waitFor();
 assert.equal(await page.locator('#home-city-select').inputValue(),second.id);
 return{fromCity:first.id,toCity:second.id,service,homepageSelection:true,geoStoreCity:second.id,returnKeepsCity:true};
}
async function run(){
 for(const service of services)assert.ok(['fire','ems'].includes(service),'unknown service '+service);
 assert.ok(cities.length,'no selected city matches the registry');
 for(const mode of modes)assert.ok(['geo','route','deep','transport'].includes(mode),'unknown QA mode '+mode);
 if(requestedCities)assert.equal(cities.length,new Set(requestedCities).size,'unknown requested city');
 if(!requestedCities)assert.equal(cities.length,33,'configured city inventory changed');
 assert.equal(new Set(requestedRouteIds).size,requestedRouteIds.length,'duplicate requested route exercise');
 const requestedRoutes=requestedRouteIds.map(id=>{
  const matches=cities.flatMap(city=>(json(`cities/${city.id}/training-data.json`).routeCalls||[]).filter(call=>call.id===id).map(call=>({city,call})));
  assert.equal(matches.length,1,'requested route exercise must occur in one selected city: '+id);
  assert.ok(services.includes(matches[0].call.trainingServices?.[0]),'requested route service must be selected');
  return matches[0];
 });
 let server,browser;
 try{
  const base=process.argv[2]?process.argv[2].replace(/\/$/,''):(server=await ownServer()).base;report.base=base;
  browser=await chromium.launch({headless:true,...(process.env.PTBO_CHROMIUM_EXECUTABLE?{executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox','--disable-dev-shm-usage'],
   ...(process.env.PTBO_BROWSER_PROXY?{proxy:{server:process.env.PTBO_BROWSER_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
  if(modes.has('geo'))for(const city of cities)for(const service of services)await check(browser,base,`geo-${city.id}-${service}`,service==='ems',page=>geoCase(page,base,city,service,service==='ems'),{visual:screenshots.has(city.id)});
  if(modes.has('route'))for(const city of cities)for(const service of services)await check(browser,base,`route-${city.id}-${service}`,service==='ems',async page=>{
   const selected=await openRoute(page,base,city,service);const submission=await submitFixture(page);await returnRoute(page,service);return{...selected,submission,returnedToSameService:true};
  },{visual:screenshots.has(city.id)});
  if(modes.has('route'))for(const {city,call} of requestedRoutes){
   const service=call.trainingServices[0];
   await check(browser,base,`targeted-route-${call.id}`,service==='ems',async page=>{
    const selected=await openRoute(page,base,city,service,{baseId:call.routeBaseId,callId:call.id});
    const submission=await submitFixture(page);await returnRoute(page,service);
    return{...selected,submission,requestedPublishedExercise:call.id,returnedToSameService:true};
   });
  }
  if(modes.has('deep')){
   const opposite=cities.find(c=>c.id==='peterborough')||cities[0];
   for(const[service,mobile]of [['fire',true],['ems',false]])if(services.includes(service))await check(browser,base,`deep-geo-${opposite.id}-${service}-${mobile?'mobile':'desktop'}`,mobile,page=>geoCase(page,base,opposite,service,mobile),{visual:true});
   if(services.includes('ems'))await check(browser,base,`deep-route-${opposite.id}-ems-desktop`,false,async(page,context)=>{const selected=await openRoute(page,base,opposite,'ems');return{...selected,drawing:await nativeTrace(page,context,false)};},{visual:true});
   if(cities.length>1){
    const first=cities.find(c=>c.id==='belleville')||cities[0],second=cities.find(c=>c.id==='scarborough')||cities.find(c=>c.id!==first.id);
    for(const mobile of [false,true])await check(browser,base,'deep-city-switch-'+(mobile?'mobile':'desktop'),mobile,page=>citySwitch(page,base,mobile?second:first,mobile?first:second,mobile?'ems':'fire'),{visual:true});
   }
   const pairs=[];
   for(const city of cities.filter(c=>c.id!=='toronto')){
    const training=json(`cities/${city.id}/training-data.json`),groups=new Map();
    for(const call of training.routeCalls||[])if(call.trainingServices?.includes('fire')&&call.responseAssignment?.generator==='civic-v1'&&call.sub==='Structure Fire'){
     const key=call.canonicalCallId;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(call);
    }
    for(const[canonicalId,group]of groups){const primary=group.find(c=>c.responseAssignment.role==='first-due'),support=group.find(c=>c.responseAssignment.role==='support');if(primary&&support){pairs.push({city,canonicalId,primary,support});break;}}
    if(pairs.length===2)break;
   }
   if(!pairs.length){report.results.push({name:'deep-shared-structure-availability',pass:false,error:'No published primary/support structure-fire pair available for browser sampling.'});checkpoint();}
   for(const pair of pairs)for(const[role,mobile]of [['primary',false],['support',true]])await check(browser,base,`deep-${pair.city.id}-shared-${role}`,mobile,async(page,context)=>{
    const call=pair[role],selected=await openRoute(page,base,pair.city,'fire',{baseId:call.routeBaseId,callId:call.id});assert.equal(selected.detail.canonicalId,pair.canonicalId);
    if(role==='support'){
     const primary=json(`cities/${pair.city.id}/training-data.json`).routeResponses.bases.find(b=>b.baseId===call.responseAssignment.primaryBaseId);
     const label=await page.locator('#call-type').innerText();assert.match(label,/estimated support exercise/i);assert.ok(label.includes(primary.name),'support label names the modeled first-due hall');
    }
    const drawing=await nativeTrace(page,context,mobile);return{...selected,drawing,canonicalIncident:pair.canonicalId,publishedRole:call.responseAssignment.role};
   },{visual:true});
   // Choose a real published short route rather than adding a synthetic detour.
   let shortest;
   for(const city of cities.filter(c=>c.id!=='toronto'))for(const call of json(`cities/${city.id}/training-data.json`).routeCalls||[]){const metres=call.routeQuality?.routeMetres;if(metres>0&&metres<=500&&(!shortest||metres<shortest.metres))shortest={city,call,metres};}
   if(shortest)await check(browser,base,'deep-published-short-route',true,async(page,context)=>{
    const {city,call}=shortest;await openRoute(page,base,city,call.trainingServices[0],{baseId:call.routeBaseId,callId:call.id});
    const drawing=await nativeTrace(page,context,true);assert.ok(drawing.distance<=500,'published short route remains short');return{publishedCall:call.id,city:city.id,storedMetres:shortest.metres,drawing};
   },{visual:true});
   else{report.results.push({name:'deep-published-short-route',pass:false,error:'No published route of 500 metres or less available for the short-route acceptance sample.'});checkpoint();}
  }
  if(modes.has('transport')&&(!requestedCities||requestedCities.includes('peterborough')))for(const mobile of [false,true])await check(browser,base,'transport-peterborough-'+(mobile?'mobile':'desktop'),mobile,page=>simulatorTransport(page,base,mobile),{visual:true});
 }finally{if(browser)await browser.close();server?.close();report.finishedAt=new Date().toISOString();const activeScreenshots=report.results.flatMap(r=>r.activeScreenshots||[]);report.summary={cases:report.results.length,passed:report.results.filter(r=>r.pass).length,failed:report.results.filter(r=>!r.pass).length,activeMapScreenshots:activeScreenshots.length,realTileScreenshotsWithLoadedTiles:activeScreenshots.filter(s=>s.realTilePixelsLoaded).length,realTileScreenshotsUnavailable:activeScreenshots.filter(s=>!s.stubbedTiles&&!s.realTilePixelsLoaded).length};checkpoint();}
 if(report.results.some(r=>!r.pass))process.exitCode=1;
}
if(require.main===module)run().catch(error=>{report.fatal=error.stack;checkpoint();console.error(error);process.exitCode=1;});
