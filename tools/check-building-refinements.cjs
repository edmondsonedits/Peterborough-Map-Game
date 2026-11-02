'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {chromium}=require('playwright');
const root=process.cwd(),out=process.env.REFINEMENT_QA_OUT||path.resolve('artifacts/plausible-city/refinements'),baseline=process.env.REFINEMENT_BASELINE==='1';
const git=file=>cp.execFileSync('git',['-c','safe.directory='+root.replaceAll('\\','/'),'show','42b54c0:city-explorer/'+file],{encoding:'utf8',maxBuffer:5e6});
let src=baseline?git('app.js'):fs.readFileSync('city-explorer/app.js','utf8');
const anchor='globalThis.__PTBO_GAMEPLAY__ = Object.freeze({';
if(!src.includes(anchor))throw Error('Missing QA bridge anchor');
src=src.replace(anchor,`globalThis.__CANOPY_TEST__={place(x,z,heading){Object.assign(truckState,{x,z,y:gameplaySurfaceAt(x,z).height+.035,heading,speed:0,steering:0});fireTruckActor.position.set(truckState.x,truckState.y,truckState.z);setMode('driving',true);state.gameplayYaw=heading;snapGameplayCamera();},ready(x,z){return !roadTileLayer||roadTileLayer.readyAt(x,z,12);}};\n`+anchor);
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});browser=await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/city-explorer/app.js*',r=>r.fulfill({status:200,contentType:'application/javascript',body:src}));
 if(baseline)for(const file of ['citywide-building-facades.mjs','station2-neighborhood-facades.mjs','facade-components.js','building-appearance.js','building-archetypes.js','station2-neighborhood-roofs.mjs']){const body=git(file);await page.route('**/city-explorer/'+file+'*',r=>r.fulfill({status:200,contentType:'application/javascript',body}));}
 await page.goto('http://127.0.0.1:4183/city-explorer/?station=2&qa=1&quality=low',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>window.__PTBO_EXPLORER_BOOTSTRAP__?.failed||document.querySelector('#loading-screen')?.classList.contains('is-hidden'),null,{timeout:300000});
 const failure=await page.evaluate(()=>window.__PTBO_EXPLORER_BOOTSTRAP__?.failed?document.querySelector('#loading-screen')?.innerText:null);if(failure)throw Error(failure);
 const center={x:-1871.5242351875345,z:3011.032222000168},length=39.6,dx=12.1479312924967/39.55068608209916,dz=37.6388700000084/39.55068608209916;
 await page.evaluate(()=>__PTBO_CITY_QA__.setView({lat:44.2818607,lon:-78.343194325,altitude:14,distance:65,bearing:140,pitch:-.17}));
 await page.waitForFunction(p=>__CANOPY_TEST__.ready(p.x,p.z),center,{timeout:60000});
 const start={x:center.x-dx*(length/2+8),z:center.z-dz*(length/2+8),heading:Math.atan2(-dx,-dz)};
 await page.evaluate(p=>__CANOPY_TEST__.place(p.x,p.z,p.heading),start);await page.waitForTimeout(1000);await page.screenshot({path:path.join(out,'canopy-approach.png')});
 await page.keyboard.down('w');
 await page.waitForFunction(p=>{const t=__PTBO_GAMEPLAY__.state().truck;return(t.x-p.center.x)*p.dx+(t.z-p.center.z)*p.dz>p.length/2+8},{center,dx,dz,length},{timeout:45000});
 await page.keyboard.up('w');const truck=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);await page.screenshot({path:path.join(out,'canopy-cleared.png')});
 await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());const mobile=[];await page.setViewportSize({width:390,height:844});const cases=JSON.parse(fs.readFileSync('docs/building-reconstruction/plausible-city-review-cases.json'));
 for(const name of ['apartment','flat-roof-fallback','industrial']){
  await page.evaluate(v=>__PTBO_CITY_QA__.setView(v),cases.find(c=>c.name===name).view);await page.waitForTimeout(1000);
  const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let previous=performance.now(),start=previous;function tick(now){values.push(now-previous);previous=now;if(now-start>=5000)resolve(values);else requestAnimationFrame(tick)}requestAnimationFrame(tick)}));frames.sort((a,b)=>a-b);
  const metrics=await page.evaluate(()=>__PTBO_CITY_QA__.metrics());mobile.push({name,frameSamples:frames.length,medianMs:frames[Math.floor(frames.length*.5)],p95Ms:frames[Math.floor(frames.length*.95)],drawCalls:metrics.drawCalls,triangles:metrics.triangles,textures:metrics.textures});await page.screenshot({path:path.join(out,'mobile-'+name+'.png')});
 }
 const report={baseline,version:await page.evaluate(()=>PTBO_BUILD.version),checkedAt:new Date().toISOString(),canopy:{id:'way/704352204',distance:Math.hypot(truck.x-start.x,truck.z-start.z),passed:true},mobile,measurement:'Desktop Chromium at390x844, low graphics, desktop GPU; not physical-phone performance.',errors};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(errors.length)throw Error(errors.join(';'));console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{await browser?.close()});
