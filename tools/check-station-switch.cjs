'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.STATION_QA_URL||'http://127.0.0.1:4183';
const out=process.env.STATION_QA_OUT||path.resolve('artifacts/station-switch');
const observe=process.env.STATION_QA_OBSERVE!=='0';
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],failed=[],requests=[],rows=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push({url:r.url(),type:r.resourceType()}));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push({url:r.url(),status:r.status()})});
 if(observe){
  const src=fs.readFileSync('city-explorer/app.js','utf8');
  const hook=`globalThis.__STATION_SWITCH_OBSERVE__=()=>({identities:[scene.uuid,renderer.domElement.id,buildingGroup.uuid,playerActor.uuid,fireTruckActor.uuid],spawn:gameplaySpawnPoints(),activeLocal:selectedStationRuntime()?.localPoint(truckState),roots:[stationOneRuntime,stationTwoRuntime].map(r=>r?{visible:r.root.visible,owner:r.root.userData.stationRuntimeOwner}:null)});\n`;
  assert.ok(src.includes('populateLandmarks();'));
  await page.route('**/city-explorer/app.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:src.replace('populateLandmarks();',hook+'populateLandmarks();')}));
 }
 await page.goto(base+'/city-explorer/?station=1&qa=1&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});
 const baseline=await page.evaluate(()=>({origin:performance.timeOrigin,identities:globalThis.__STATION_SWITCH_OBSERVE__?.().identities,loading:globalThis.__PTBO_CITY_LOADING__?.state()}));
 const requestStart=requests.length;
 await page.keyboard.press('e');
 await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');
 for(const station of [2,3,1,3,2,1]){
  const started=Date.now();
  await page.selectOption('#station-select',String(station));
  await page.waitForFunction(()=>!__PTBO_GAMEPLAY__.state().transition.busy,null,{timeout:60000});
  const actual=await page.evaluate(()=>({state:__PTBO_GAMEPLAY__.state(),origin:performance.timeOrigin,observed:globalThis.__STATION_SWITCH_OBSERVE__?.(),url:location.href}));
  assert.equal(actual.state.stationNumber,station,JSON.stringify(actual.state.transition));
  assert.equal(actual.state.mode,'driving');assert.equal(actual.origin,baseline.origin);
  assert.equal(new URL(actual.url).searchParams.get('station'),String(station));
  if(observe){
   assert.deepEqual(actual.observed.identities,baseline.identities);
   const spawn=actual.observed.spawn.truckPoint;
   assert.ok(Math.hypot(actual.state.truck.x-spawn.x,actual.state.truck.z-spawn.y)<.1);
   const facility=actual.state.emergencyFacilities['station'+station];
   if(station!==3&&facility?.status==='ready'){assert.equal(facility.runtimeOwned,true);assert.equal(facility.visible,false);}
  }
  const key=station===1?'stationOne':'stationTwo';
  if(station!==3)assert.ok(actual.state[key].doors.front.every(d=>d.fraction===0));
  await page.screenshot({path:path.join(out,'station'+station+'-spawn.png')});
  const switchMs=Date.now()-started;
  if(station===3)await page.waitForFunction(()=>__PTBO_GAMEPLAY__.stationThree.doorPhase()==='open',null,{timeout:20000});
  else {await page.locator('#station'+station+'-door-control').click();await page.waitForFunction(key=>__PTBO_GAMEPLAY__.state()[key].doors.front.some(d=>d.fraction>=.99),key);}
  const before=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
  await page.keyboard.down('w');
  await page.waitForFunction(start=>{const t=__PTBO_GAMEPLAY__.state().truck;return Math.hypot(t.x-start.x,t.z-start.z)>23;},before,{timeout:15000});
  await page.keyboard.up('w');
  const after=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck),distance=Math.hypot(after.x-before.x,after.z-before.z);
  await page.screenshot({path:path.join(out,'station'+station+'-departure.png')});
  rows.push({station,switchMs,distance,spawn:actual.state.truck,local:actual.observed?.activeLocal});
  console.log(JSON.stringify({station,switchMs,distance}));
  assert.ok(distance>20,`Station ${station}: drove only ${distance} m`);
 }
 await page.evaluate(()=>{const s=document.querySelector('#station-select');for(const n of ['2','3','1']){s.value=n;s.dispatchEvent(new Event('change'));}});
 await page.waitForFunction(()=>!__PTBO_GAMEPLAY__.state().transition.busy);
 assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().stationNumber),1);
 await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());
 await page.selectOption('#station-select','2');
 await page.waitForFunction(()=>!__PTBO_GAMEPLAY__.state().transition.busy);
 assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().mode),'onFoot');
 const rebootRequests=requests.slice(requestStart).filter(r=>r.type==='document'||/\/app\.js|\/terrain[^/]*\.(?:json|bin)|\/peterborough-buildings[^/]*\.geojson/.test(r.url));
 const report={baseline,rows,rapidSelection:true,onFoot:true,errors,failed,rebootRequests,method:observe?'Desktop Chromium with read-only identity observer':'Unmodified desktop Chromium'};
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
 assert.deepEqual(rebootRequests,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>browser?.close());
