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
 for(const mobile of [false,true]){
  const name=mobile?'mobile-lite':'desktop';
  // Keep the balanced scene and CSS viewport; reduce only CI's software raster workload.
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:process.platform==='win32'?1:.5});
  const page=await context.newPage();activePage=page;activeName=name;
  page.on('pageerror',e=>errors.push({name,error:e.message}));
  page.on('console',message=>{if(message.type()==='error'&&criticalConsolePattern.test(message.text()))consoleErrors.push({name,error:message.text()});});
  const started=Date.now();
  await page.goto(`${base}/city-explorer/${mobile?'lite/':''}?station=1&qa=1&quality=${mobile?'lite':'balanced'}&multiplayerServer=${encodeURIComponent(backend)}`,{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});
  report[name]={startupMs:Date.now()-started};console.log(name,'ready',report[name].startupMs);
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
  for(const hall of [2,3]){
    const result=await page.evaluate(n=>__PTBO_GAMEPLAY__.switchStation(n),hall);assert.equal(result.ok,true);
    await page.evaluate(()=>document.getElementById('dispatch-training-start').click());
    assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().dispatch.station),hall);
  }
  report[name].final=await page.evaluate(()=>({quality:__PTBO_GAMEPLAY__.state().graphicsQuality,hall:__PTBO_GAMEPLAY__.state().stationNumber,call:__PTBO_GAMEPLAY__.state().dispatch.destination.name}));
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
