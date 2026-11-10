import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=createRequire("C:/Users/Danny's Ultimate PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/package.json")('playwright'));}
const output=path.resolve('artifacts/driving-profile-benchmark');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
const report={environment:'Headless desktop Edge at 390x844, not physical-phone results',profiles:{}};
try{for(const quality of ['balanced','lite']){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const started=Date.now();await page.goto(`http://127.0.0.1:4199/city-explorer/?station=1&quality=${quality}`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});const startupMs=Date.now()-started;
 await page.evaluate(()=>__PTBO_GAMEPLAY__.selectVehicle('pump-1'));
 await page.waitForFunction(()=>globalThis.__PTBO_CITY_LOADING__?.state().fullCityReady,null,{timeout:180000});
 await page.waitForTimeout(2000);
 const frames=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now();function frame(now){samples.push(now-last);last=now;if(samples.length<180)requestAnimationFrame(frame);else resolve(samples);}requestAnimationFrame(frame);}));
 const sorted=frames.slice(5).sort((a,b)=>a-b);const metrics=await page.evaluate(()=>({drawCalls:Number(document.documentElement.dataset.drawCalls),triangles:Number(document.documentElement.dataset.renderTriangles),geometries:Number(document.documentElement.dataset.gpuGeometries),textures:Number(document.documentElement.dataset.gpuTextures),canvasPixels:document.getElementById('city-canvas').width*document.getElementById('city-canvas').height,quality:__PTBO_GAMEPLAY__.state().graphicsQuality}));
 report.profiles[quality]={startupMs,medianFrameMs:sorted[Math.floor(sorted.length*.5)],p95FrameMs:sorted[Math.floor(sorted.length*.95)],...metrics,errors};
 await page.screenshot({path:path.join(output,`${quality}.png`)});console.log(quality,JSON.stringify(report.profiles[quality]));await context.close();
}}finally{await browser.close();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
