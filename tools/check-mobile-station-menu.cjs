'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const {chromium}=require('playwright');
const base=process.env.MENU_QA_URL||'http://127.0.0.1:4183';
const out=process.env.MENU_QA_OUT||path.resolve('artifacts/mobile-station-menu');
const baseline=process.env.MENU_QA_BASELINE==='1';
let browser,page;
const report={baseline,errors:[],failed:[]};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:393,height:852},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.failed.push({url:r.url(),status:r.status()})});
 if(baseline){
  const source=cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show','HEAD:city-explorer/mobile-controls-1.6.68.js'],{encoding:'utf8'});
  await page.route('**/mobile-controls-1.6.68.js*',route=>route.fulfill({status:200,contentType:'application/javascript',body:source}));
 }
 await page.goto(base+'/city-explorer/?station=1&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations,null,{timeout:180000});
 const origin=await page.evaluate(()=>performance.timeOrigin);
 await page.tap('#mobile-menu-toggle');
 await page.waitForFunction(()=>document.querySelector('#app').classList.contains('mobile-menu-open'));
 await page.tap('#station-select');
 await page.waitForTimeout(1500);
 report.openAfterTap=await page.evaluate(()=>document.querySelector('#app').classList.contains('mobile-menu-open'));
 await page.screenshot({path:path.join(out,'picker-after-wait.png')});
 if(baseline){assert.equal(report.openAfterTap,false,'baseline must reproduce the disappearing panel');report.reproduced=true;return;}
 assert.equal(report.openAfterTap,true,'opening the select must not dismiss its parent menu');
 // Native mobile picker UI belongs to the OS; simulate its focus hand-off explicitly.
 await page.evaluate(()=>{document.querySelector('#station-select').focus();window.dispatchEvent(new Event('blur'));});
 await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>document.querySelector('#app').classList.contains('mobile-menu-open')),true);
 await page.selectOption('#station-select','2');
 await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().stationNumber===2&&!__PTBO_GAMEPLAY__.state().transition.busy,null,{timeout:60000});
 await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('mobile-menu-open'));
 assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);
 await page.tap('#mobile-menu-toggle');
 await page.tap('#station-select');await page.waitForTimeout(1500);
 assert.equal(await page.evaluate(()=>document.querySelector('#app').classList.contains('mobile-menu-open')),true);
 await page.keyboard.press('Escape');
 await page.tap('#mobile-menu-toggle');
 assert.equal(await page.evaluate(()=>document.querySelector('#app').classList.contains('mobile-menu-open')),false);
 await page.tap('#mobile-menu-toggle');
 await page.tap('#play-mode');
 await page.waitForFunction(()=>!document.querySelector('#app').classList.contains('mobile-menu-open'));
 await page.screenshot({path:path.join(out,'station2-after-selection.png')});
 report.station=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().stationNumber);
 report.version=await page.evaluate(()=>PTBO_BUILD.version);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);
 report.passed=true;
})().catch(async e=>{report.error=e.stack;console.error(e);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});})
.finally(async()=>{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser?.close();});
