'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.COLD_SPAWN_QA_URL||'http://127.0.0.1:4183';
const out=process.env.COLD_SPAWN_QA_OUT||path.resolve('artifacts/station-cold-spawn');
const cases=[{name:'homepage-mobile',query:'accuracy=district1',station:1,mobile:true},{name:'station1-desktop',query:'station=1',station:1,mobile:false},{name:'station2-mobile',query:'station=2',station:2,mobile:true}];
const report={cases:[],errors:[],failedRequests:[]};let browser,page;
function local(point,layout){
 const anchor={x:(layout.site.anchorLon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),z:-(layout.site.anchorLat-44.3091)*110540};
 const yaw=layout.site.rotationYDegrees*Math.PI/180,dx=point.x-anchor.x,dz=point.z-anchor.z;
 return {x:dx*Math.cos(yaw)-dz*Math.sin(yaw),z:dx*Math.sin(yaw)+dz*Math.cos(yaw)};
}
async function ready(){await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__&&document.querySelector('#loading-screen')?.classList.contains('is-hidden'),null,{timeout:180000});}
async function snapshot(test,layout,label){
 const state=await page.evaluate(()=>__PTBO_GAMEPLAY__.state());
 const row={case:test.name,label,station:state.stationNumber,mode:state.mode,truck:local(state.truck,layout),player:local(state.player,layout),runtime:state[test.station===1?'stationOne':'stationTwo'],camera:state.camera,version:await page.evaluate(()=>PTBO_BUILD.version)};
 report.cases.push(row);await page.screenshot({path:path.join(out,test.name+'-'+label+'.png')});
 assert.equal(row.station,test.station);assert.equal(row.mode,'onFoot');
 assert.equal(row.runtime?.loaded,true,`${test.name}: selected station must be ready at first playable frame`);
 for(const actor of ['truck','player']){const expected=layout[actor+'Spawn'];assert.ok(Math.hypot(row[actor].x-expected.x,row[actor].z-expected.z)<.1,`${test.name}: ${actor} must spawn inside its designated bay, got ${JSON.stringify(row[actor])}`);}
 assert.ok(row.runtime.doors.front.every(door=>door.fraction===0&&door.target===0),'all front doors start closed');
 return state;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 for(const test of cases){
  const context=await browser.newContext(test.mobile?{viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1}:{viewport:{width:1440,height:900}});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push({case:test.name,message:error.message}));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.failedRequests.push({url:r.url(),status:r.status()});});
  const layout=JSON.parse(fs.readFileSync('city-explorer/assets/station'+test.station+'/layout.json'));
  await page.goto(base+'/city-explorer/?'+test.query+'&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});await ready();
  await snapshot(test,layout,'first-load');
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().canSwitchStations&&!__PTBO_GAMEPLAY__.state().transition?.busy,null,{timeout:60000});
  await page.waitForFunction(()=>document.documentElement.dataset.cityFullReady==='true',null,{timeout:120000});
  await snapshot(test,layout,'city-ready');
  const door='#station'+test.station+(test.mobile?'-mobile-door':'-door-control');
  if(test.mobile){await page.tap(door);await page.tap('#mobile-action-button');}else{await page.locator(door).click();await page.keyboard.press('e');}
  await page.waitForFunction(n=>{const s=__PTBO_GAMEPLAY__.state();return s.mode==='driving'&&s[n===1?'stationOne':'stationTwo'].doors.front.some(d=>d.fraction>.99);},test.station);
  const before=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
  await page.keyboard.down('w');await page.waitForFunction(start=>{const t=__PTBO_GAMEPLAY__.state().truck;return Math.hypot(t.x-start.x,t.z-start.z)>20;},before,{timeout:20000});await page.keyboard.up('w');
  await page.screenshot({path:path.join(out,test.name+'-drive-out.png')});
  await page.reload({waitUntil:'domcontentloaded'});await ready();await snapshot(test,layout,'reload');
  console.log(JSON.stringify({case:test.name,spawn:true,closedDoors:true,driveOut:true,reload:true}));
  await context.close();page=null;
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.passed=true;
})().catch(async error=>{report.error=error.stack;process.exitCode=1;console.error(error.message);if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});})
.finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:!!report.passed,cases:report.cases.length,errors:report.errors,failedRequests:report.failedRequests}));await browser?.close();});
