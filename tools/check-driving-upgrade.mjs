import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch(error){if(process.platform!=='win32')throw error;({chromium}=createRequire("C:/Users/Danny's Ultimate PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json")('playwright'));}
const dir=path.resolve('artifacts/driving-upgrade');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'
  ?{channel:'msedge',args:['--use-angle=d3d11']}
  :{args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']})});
const base=(process.env.MAP_QA_URL||'http://127.0.0.1:4199').replace(/\/$/,'');
const backend=process.env.MULTIPLAYER_QA_SERVER||'http://127.0.0.1:2569';
const errors=[],consoleErrors=[],report={};
const criticalConsolePattern=/\b(?:uncaught|typeerror|referenceerror|syntaxerror|rangeerror|webgl|shader|context\s*lost|failed to load module)\b/i;
let activePage,activeName;
try{
 // Balanced checks rendering and the complete local driving/map interaction.
 // Cross-city functional checks use Lite, so SwiftShader's <1 FPS building work
 // does not turn a destination-readiness timeout into a vehicle-control failure.
 for(const {name,mobile,quality,allStations} of [
  {name:'desktop-balanced',mobile:false,quality:'balanced',allStations:false},
  {name:'desktop-lite',mobile:false,quality:'lite',allStations:true},
  {name:'mobile-lite',mobile:true,quality:'lite',allStations:true},
 ]){
  report[name]={quality};
  const phase=value=>{report[name].phase=value;console.log(name,value);};
  // Keep the balanced scene and CSS viewport; reduce only CI's software raster workload.
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:process.platform==='win32'?1:.5});
  const page=await context.newPage();activePage=page;activeName=name;
  page.on('pageerror',e=>errors.push({name,error:e.message}));
  page.on('console',message=>{if(message.type()==='error'&&criticalConsolePattern.test(message.text()))consoleErrors.push({name,error:message.text()});});
  const started=Date.now();
  phase('startup');
  await page.goto(`${base}/city-explorer/${mobile?'lite/':''}?station=1&qa=1&quality=${quality}&multiplayerServer=${encodeURIComponent(backend)}`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:quality==='balanced'?300000:180000});
  report[name].startupMs=Date.now()-started;console.log(name,'ready',report[name].startupMs);
  assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().graphicsQuality),quality);
  phase('camera views');
  // Select through the same fleet runtime as the in-game fleet panel.
  await page.evaluate(()=>__PTBO_GAMEPLAY__.selectVehicle('pump-1'));
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');
  await page.evaluate(()=>document.getElementById('graphics-quality-open').click());
  await page.locator('#camera-view-select').selectOption('cab');
  await page.locator('#graphics-quality-dialog button[value="cancel"]').click();
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().camera.near===.08);
  await page.evaluate(()=>document.getElementById('graphics-quality-open').click());
  await page.locator('#camera-view-select').selectOption('wide');
  await page.locator('#graphics-quality-dialog button[value="cancel"]').click();
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().camera.near===.16);
  await page.evaluate(()=>document.getElementById('graphics-quality-open').click());
  await page.locator('#camera-view-select').selectOption('cab');
  await page.locator('#graphics-quality-dialog button[value="cancel"]').click();
  phase('bay door and forward driving');
  await page.locator('#city-canvas').focus();await page.keyboard.press('g');
  // Simulation time is capped per frame: wall-clock sleeps can end before a slow
  // software renderer has opened the door or processed a driving input.
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationOne?.doors?.front?.some(door=>door.target===1&&door.fraction>=.98),null,{timeout:60000});
  const driveStart=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
  await page.keyboard.down('w');
  try{await page.waitForFunction(({x,z})=>{const truck=__PTBO_GAMEPLAY__.state().truck;return truck.speed>.1&&Math.hypot(truck.x-x,truck.z-z)>.5;},driveStart,{timeout:60000});}
  finally{await page.keyboard.up('w');}
  assert.equal(await page.locator('#cab-view-frame').isVisible(),true);
  await page.screenshot({path:path.join(dir,`${name}-cab.png`)});
  phase('training call and map layers');
  await page.evaluate(()=>document.getElementById('dispatch-training-start').click());
  assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().dispatch.status),'responding');
  await page.evaluate(()=>document.getElementById('map-mode').click());
  await page.waitForFunction(()=>document.querySelectorAll('.tactical-marker').length>=6);
  for(const layer of ['3d','satellite','osm']){
    await page.locator('#map-layer-'+layer).click();
    assert.ok(await page.locator('.tactical-marker[data-kind="truck"]').count()>=5);
  }
  assert.equal(await page.locator('#cab-view-frame').isVisible(),false);
  await page.locator('#map-drive-toggle').click();
  assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().mapDriving),true);
  phase('map driving');
  const before=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
  report[name].mapBefore=before;report[name].mapInput=mobile?'touch reverse':'KeyS';
  const waitForMapMovement=()=>page.waitForFunction(({x,z})=>{const state=__PTBO_GAMEPLAY__.state();return state.mapDriving&&state.truck.speed<-.1&&Math.hypot(state.truck.x-x,state.truck.z-z)>.1;},before,{timeout:60000});
  // Hold reverse until the simulation proves movement, then release the input.
  if(mobile){
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const box=await page.locator('#movement-joystick').boundingBox();assert.ok(box&&box.width>80);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+38,id:1}]});
    try{await waitForMapMovement();}finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  }else{await page.keyboard.down('s');try{await waitForMapMovement();}finally{await page.keyboard.up('s');}}
  const after=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
  report[name].mapAfter=after;
  report[name].mapDistance=Math.hypot(after.x-before.x,after.z-before.z);assert.ok(report[name].mapDistance>.1,'map controls move truck');
  await page.screenshot({path:path.join(dir,`${name}-map-drive.png`)});
  await page.locator('#map-drive-toggle').click();assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().mapDriving),false);
  await page.keyboard.press('m');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');
  await page.evaluate(()=>document.getElementById('dispatch-cancel').click());
  for(const hall of allStations?[2,3]:[]){
    phase(`station ${hall} training call`);
    const result=await page.evaluate(n=>__PTBO_GAMEPLAY__.switchStation(n),hall);assert.equal(result.ok,true,JSON.stringify(result));
    await page.evaluate(()=>document.getElementById('dispatch-training-start').click());
    assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().dispatch.station),hall);
  }
  report[name].final=await page.evaluate(()=>({quality:__PTBO_GAMEPLAY__.state().graphicsQuality,hall:__PTBO_GAMEPLAY__.state().stationNumber,call:__PTBO_GAMEPLAY__.state().dispatch.destination.name}));
  report[name].stationsChecked=allStations?[1,2,3]:[1];phase('passed');
  console.log(name,JSON.stringify(report[name]));await context.close();
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(consoleErrors,[]);
}catch(error){
 report.failure=String(error);
 if(activePage&&!activePage.isClosed()){
  report.failureState=await activePage.evaluate(()=>({gameplay:globalThis.__PTBO_GAMEPLAY__?.state(),input:globalThis.__PTBO_CITY_QA__?.input(),dataset:{...document.documentElement.dataset},focused:document.activeElement?.id,loading:document.querySelector('#loading-screen')?.innerText})).catch(()=>null);
  await activePage.screenshot({path:path.join(dir,`${activeName}-failure.png`),timeout:10000}).catch(()=>{});
 }
 console.error(JSON.stringify(report));throw error;
}finally{report.errors=errors;report.consoleErrors=consoleErrors;await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();}
