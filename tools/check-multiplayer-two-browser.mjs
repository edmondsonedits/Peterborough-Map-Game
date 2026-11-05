#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require=createRequire(import.meta.url);
let chromium;
try { ({chromium}=require('playwright')); }
catch { ({chromium}=createRequire(path.join("C:\\Users\\Danny's Ultimate PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules",'package.json'))('playwright')); }
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const shots=path.join(root,'.superpowers/sdd/multiplayer/screenshots');await mkdir(shots,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const base=process.env.MAP_QA_URL||'http://127.0.0.1:4188';
const url=`${base}/city-explorer/?station=1&quality=balanced&qaMultiplayerWorld=1&multiplayerServer=http%3A%2F%2F127.0.0.1%3A2567`;
const errors=[],network=[];
const safeUrl=value=>{try{const url=new URL(value);url.search='';return url.href;}catch{return '[invalid-url]';}};
async function makePage(viewport){const page=await browser.newPage({viewport});page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.url().includes(':2567'))network.push({request:safeUrl(request.url()),method:request.method()});});page.on('response',response=>{if(response.status()>=400||response.url().includes(':2567'))network.push({response:safeUrl(response.url()),status:response.status()});});page.on('requestfailed',request=>network.push({url:safeUrl(request.url()),error:request.failure()?.errorText}));page.on('console',message=>{if(message.type()==='error')network.push({console:message.text()});});page.on('websocket',socket=>{network.push({websocket:safeUrl(socket.url())});socket.on('socketerror',error=>network.push({socketError:String(error)}));socket.on('close',()=>network.push({socketClosed:safeUrl(socket.url())}));});await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations&&globalThis.__PTBO_MULTIPLAYER__,null,{timeout:180000});return page;}
const state=page=>page.evaluate(()=>({active:__PTBO_MULTIPLAYER__.active,session:__PTBO_MULTIPLAYER__.session,state:__PTBO_MULTIPLAYER__.state}));
try {
  const first=await makePage({width:1280,height:800});
  const doorsBefore=await first.evaluate(()=>__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationDoors(1));
  await first.locator('.ce-roomui-toggle').click();
  await first.getByRole('button',{name:'Create room'}).click();
  try { await first.waitForFunction(()=>__PTBO_MULTIPLAYER__?.active&&__PTBO_MULTIPLAYER__.session?.roomCode,null,{timeout:25000}); }
  catch(error){console.error('Create diagnostics',await first.evaluate(()=>({multiplayer:{active:__PTBO_MULTIPLAYER__?.active,session:__PTBO_MULTIPLAYER__?.session,state:__PTBO_MULTIPLAYER__?.state},panel:document.querySelector('.ce-roomui-panel')?.innerText,roadPack:document.documentElement.dataset.roadPackId,sdk:Boolean(globalThis.ColyseusSDK||globalThis.Colyseus),scripts:[...document.scripts].map(script=>script.src).filter(src=>src.includes('colyseus'))})),errors,network);throw error;}
  const created=await state(first);assert.ok(created.session.roomCode);
  const doorsDuring=await first.evaluate(()=>__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationDoors(1));
  assert.ok(doorsDuring.front.every(door=>door.fraction===1&&door.target===1),'all multiplayer Station 1 bay doors are open');
  const second=await makePage({width:390,height:720});
  await second.locator('.ce-roomui-toggle').click();
  await second.locator('#ce-roomui-join-code').fill(created.session.roomCode);
  await second.getByRole('button',{name:'Join',exact:true}).click();
  await second.waitForFunction(()=>__PTBO_MULTIPLAYER__?.active&&__PTBO_MULTIPLAYER__.state?.snapshot?.players?.length===1,null,{timeout:90000});
  await first.waitForFunction(()=>__PTBO_MULTIPLAYER__?.state?.snapshot?.players?.length===1,null,{timeout:30000});
  await first.locator('.ce-roomui-close').click();
  await first.locator('#city-canvas').click({position:{x:640,y:400}});
  const start=await state(first);
  await first.keyboard.down('w');await first.waitForTimeout(900);await first.keyboard.up('w');
  const walked=await state(first);
  console.error('Walk diagnostics',{start:start.state?.renderedPose,walked:walked.state?.renderedPose,mode:walked.state?.mode,paused:walked.state?.pausedForWorld,errors});
  assert.ok(Math.hypot(walked.state.renderedPose.x-start.state.renderedPose.x,walked.state.renderedPose.z-start.state.renderedPose.z)>.15,'local player walked');
  await second.waitForFunction(({x,z})=>{const other=__PTBO_MULTIPLAYER__?.state?.snapshot?.players?.[0]?.pose;return other&&Math.hypot(other.x-x,other.z-z)>.1;},{x:start.state.renderedPose.x,z:start.state.renderedPose.z},{timeout:15000});
  await second.locator('.ce-roomui-close').click();
  await second.screenshot({path:path.join(shots,'multiplayer-remote-firefighter.png')});
  await first.keyboard.press('e');
  await first.waitForFunction(()=>__PTBO_MULTIPLAYER__?.state?.mode==='driving',null,{timeout:15000});
  const entered=await state(first),vehicleId=entered.state.vehicleId;
  await first.keyboard.down('w');await first.waitForTimeout(1000);await first.keyboard.up('w');
  const driven=await state(first);assert.ok(Math.abs(driven.state.renderedPose.speed)>.05,'vehicle drove');
  await second.waitForFunction(id=>__PTBO_MULTIPLAYER__?.state?.snapshot?.vehicles?.some(vehicle=>vehicle.id===id&&Math.abs(vehicle.pose.speed)>.05),vehicleId,{timeout:15000});
  await first.keyboard.down('s');await first.waitForTimeout(1100);await first.keyboard.up('s');
  await first.waitForFunction(()=>Math.abs(__PTBO_MULTIPLAYER__?.state?.authoritativePose?.speed??100)<.7,null,{timeout:12000});
  await first.keyboard.press('e');
  try{await first.waitForFunction(()=>__PTBO_MULTIPLAYER__?.state?.mode==='onFoot',null,{timeout:10000});}
  catch(error){console.error('Exit diagnostics',await state(first),await first.evaluate(()=>document.querySelector('[role="status"]')?.textContent));throw error;}
  await first.keyboard.press('Escape');
  await first.screenshot({path:path.join(shots,'multiplayer-desktop.png')});
  await second.screenshot({path:path.join(shots,'multiplayer-mobile.png')});
  const leaveResult=await first.evaluate(()=>__PTBO_MULTIPLAYER__.leave());
  if(leaveResult?.error)console.error('Leave diagnostics',{leaveResult,first:await state(first),network:network.slice(-35)});
  assert.equal(leaveResult?.ok,true,'server confirmed explicit room leave');
  await first.waitForFunction(()=>!__PTBO_MULTIPLAYER__.active,null,{timeout:15000});
  const doorsAfter=await first.evaluate(()=>__PTBO_MULTIPLAYER_WORLD_SOURCE__.stationDoors(1));
  assert.deepEqual(doorsAfter,doorsBefore,'single-player door state restored after leave');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'pass',seats:[created.session.seat,(await state(second)).session.seat],vehicleId,walkMetres:Math.hypot(walked.state.renderedPose.x-start.state.renderedPose.x,walked.state.renderedPose.z-start.state.renderedPose.z),desktopScreenshot:path.join(shots,'multiplayer-desktop.png'),mobileScreenshot:path.join(shots,'multiplayer-mobile.png')}));
} finally { await browser.close(); }
