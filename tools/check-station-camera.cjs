'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.CAMERA_QA_URL||'http://127.0.0.1:4183',out=process.env.CAMERA_QA_OUT||path.resolve('artifacts/station-camera');
const observe=process.env.CAMERA_QA_OBSERVE!=='0';
let browser,page;const report={rows:[],errors:[],failed:[]};
async function ready(){await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});}
async function state(){return page.evaluate(()=>__PTBO_GAMEPLAY__.state());}
async function doorOpen(station){
 await page.locator('#station'+station+'-door-control').click();
 await page.waitForFunction(n=>{const s=__PTBO_GAMEPLAY__.state();return n===3?s.stationThreeDoor.fraction>=.999:s[n===1?'stationOne':'stationTwo'].doors.front.some(d=>d.fraction>=.999);},station);
}
async function brake(){await page.keyboard.down('s');await page.waitForFunction(()=>Math.abs(__PTBO_GAMEPLAY__.state().truck.speed)<.5,null,{timeout:10000});await page.keyboard.up('s');}
async function settings(view,mobile=false){
 if(mobile)await page.tap('#mobile-menu-toggle');
 await page.locator('#graphics-quality-open').click();
 await page.selectOption('#camera-view-select',view);
 assert.equal((await state()).camera.view,view);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
 await page.waitForTimeout(450);
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 function errors(p){p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.failed.push({url:r.url(),status:r.status()})});}
 errors(page);
 if(observe){const source=fs.readFileSync('city-explorer/app.js','utf8');const hook=`globalThis.__CAMERA_QA__=()=>{const b=stationCameraBay();return {camera:camera.position.toArray(),local:b?.local(camera.position),bounds:b?.bounds,scene:scene.uuid,truck:fireTruckActor?.uuid};};\n`;await page.route('**/city-explorer/app.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:source.replace('populateLandmarks();',hook+'populateLandmarks();')}));}
 await page.goto(base+'/city-explorer/?station=3&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});await ready();
 const origin=await page.evaluate(()=>performance.timeOrigin),ids=observe?await page.evaluate(()=>__CAMERA_QA__()):null;
 await page.waitForTimeout(4000);assert.equal((await state()).stationThreeDoor.phase,'closed','Station 3 must not auto-open');
 await page.keyboard.press('e');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');
 const closedStart=(await state()).truck;
 await page.keyboard.down('w');await page.waitForTimeout(1700);await page.keyboard.up('w');
 const closedEnd=(await state()).truck;assert.ok(Math.hypot(closedEnd.x-closedStart.x,closedEnd.z-closedStart.z)<.5,'closed Station3 door must block departure');
 await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());await page.keyboard.press('e');
 for(const station of [3,1,2]){
  if(station!==3){await page.selectOption('#station-select',String(station));await page.waitForFunction(n=>__PTBO_GAMEPLAY__.state().stationNumber===n&&!__PTBO_GAMEPLAY__.state().transition.busy,station,{timeout:60000});}
  const inside=await state();assert.equal(inside.mode,'driving');assert.equal(inside.camera.view,'auto');assert.ok(inside.camera.scale<.84);
  const observed=observe?await page.evaluate(()=>__CAMERA_QA__()):null;
  if(observe){assert.equal(observed.scene,ids.scene);assert.equal(observed.truck,ids.truck);const {local:p,bounds:b}=observed;assert.ok(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ,'camera must stay inside bay walls');}
  await page.screenshot({path:path.join(out,'station'+station+'-inside.png')});
  await doorOpen(station);
  const before=(await state()).truck;
  if(station===3){
   await page.keyboard.down('w');await page.waitForFunction(start=>{const t=__PTBO_GAMEPLAY__.state().truck;return Math.hypot(t.x-start.x,t.z-start.z)>4;},before,{timeout:10000});await page.keyboard.up('w');await brake();
   await page.locator('#station3-door-control').click();assert.equal((await state()).stationThreeDoor.target,1,'obstructed door remains open');
  }
  await page.keyboard.down('w');await page.waitForFunction(start=>{const t=__PTBO_GAMEPLAY__.state().truck;return Math.hypot(t.x-start.x,t.z-start.z)>17;},before,{timeout:15000});await page.keyboard.up('w');await brake();
  await page.waitForTimeout(800);
  const outside=await state();assert.ok(outside.camera.scale>.94,'camera returns toward standard after leaving');assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);
  await page.screenshot({path:path.join(out,'station'+station+'-outside.png')});
  if(station===3){await page.keyboard.press('g');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationThreeDoor.phase==='closed');const p=(await state()).truck;await page.keyboard.down('w');await page.waitForTimeout(500);await page.keyboard.up('w');assert.ok((await state()).truck.speed>0,'closing the door must not disable driving outside');await brake();}
  report.rows.push({station,inside:inside.camera,outside:outside.camera,distance:Math.hypot(outside.truck.x-before.x,outside.truck.z-before.z)});console.log(JSON.stringify(report.rows.at(-1)));
 }
 for(const [view,scale] of [['wide',1.38],['close',.82],['standard',1]]){await settings(view);assert.equal((await state()).camera.scale,scale);assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);}
 await settings('wide');await page.selectOption('#station-select','1');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationNumber===1&&!__PTBO_GAMEPLAY__.state().transition.busy);assert.equal((await state()).camera.view,'wide');
 await page.keyboard.press('c');assert.equal((await state()).camera.view,'auto');
 await page.close();
 page=await browser.newPage({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1});errors(page);
 await page.goto(base+'/city-explorer/?station=3&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});await ready();
 assert.equal((await state()).stationThreeDoor.phase,'closed');
 await page.tap('#mobile-action-button');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');
 assert.equal((await state()).camera.view,'auto');await page.screenshot({path:path.join(out,'mobile-driving-auto.png')});
 await page.tap('#station3-mobile-door');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationThreeDoor.phase==='open');
 await settings('wide',true);const mobileOrigin=await page.evaluate(()=>performance.timeOrigin);await page.screenshot({path:path.join(out,'mobile-station3.png')});
 await page.reload({waitUntil:'domcontentloaded'});await ready();assert.equal((await state()).camera.view,'wide');assert.notEqual(await page.evaluate(()=>performance.timeOrigin),mobileOrigin);assert.equal((await state()).stationThreeDoor.phase,'closed');
 await page.tap('#mobile-menu-toggle');await page.tap('#graphics-quality-open');await page.screenshot({path:path.join(out,'mobile-settings.png')});
 report.version=await page.evaluate(()=>PTBO_BUILD.version);report.mobile=true;report.persistence=true;assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);report.passed=true;
})().catch(async e=>{report.error=e.stack;console.error(e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});})
.finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser?.close();});
