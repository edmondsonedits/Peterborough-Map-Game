import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=createRequire("C:/Users/Danny's Ultimate PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json")('playwright'));}
const dir=path.resolve('artifacts/driving-upgrade');await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const errors=[],report={};
try{
 for(const mobile of [false,true]){
  const name=mobile?'mobile-lite':'desktop';
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({name,error:e.message}));
  const started=Date.now();
  await page.goto(`http://127.0.0.1:4199/city-explorer/${mobile?'lite/':''}?station=1&quality=${mobile?'lite':'balanced'}&multiplayerServer=http%3A%2F%2F127.0.0.1%3A2569`,{waitUntil:'domcontentloaded',timeout:90000});
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
  await page.locator('#city-canvas').focus();await page.keyboard.press('g');await page.waitForTimeout(3500);
  await page.keyboard.down('w');await page.waitForTimeout(3500);await page.keyboard.up('w');
  await page.waitForTimeout(500);assert.equal(await page.locator('#cab-view-frame').isVisible(),true);
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
  // Reverse leaves the bay without requiring the front door to be open.
  if(mobile){
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const box=await page.locator('#movement-joystick').boundingBox();assert.ok(box&&box.width>80);
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+38,id:1}]});
    await page.waitForTimeout(1200);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await page.keyboard.down('s');await page.waitForTimeout(1200);await page.keyboard.up('s');}
  const after=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);
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
}catch(error){report.failure=String(error);throw error;}finally{report.errors=errors;await writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();}
