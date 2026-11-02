'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { chromium } = require('playwright');
const baseline = process.env.CITY_TIMING_BASELINE === '1';
const base = process.env.CITY_QA_URL || 'http://127.0.0.1:4183';
const output = process.env.CITY_QA_OUT || path.resolve('artifacts/plausible-city');
let browser;
(async () => {
  browser = await chromium.launch({headless:true,args:process.platform==='win32'?['--use-angle=d3d11']:[]});
  const page = await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on('pageerror', error => errors.push(error.message));
  if (baseline) for (const file of ['app.js','citywide-building-facades.mjs','station2-neighborhood-facades.mjs','facade-components.js','building-appearance.js','building-archetypes.js','station2-neighborhood-roofs.mjs']) {
    const ref = process.env.CITY_BASELINE_REF || 'a9c3462';
    const body = cp.execFileSync('git',['-c','safe.directory='+process.cwd().replaceAll('\\','/'),'show',ref+':city-explorer/'+file],{encoding:'utf8',maxBuffer:5e6});
    await page.route('**/city-explorer/'+file+'*',route=>route.fulfill({status:200,contentType:'application/javascript',body}));
  }
  const started=Date.now();
  await page.goto(base+'/city-explorer/?station=2&qa=1&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>window.__PTBO_EXPLORER_BOOTSTRAP__?.failed||document.querySelector('#loading-screen')?.classList.contains('is-hidden'),null,{timeout:300000});
  const failure=await page.evaluate(()=>window.__PTBO_EXPLORER_BOOTSTRAP__?.failed?document.querySelector('#loading-screen')?.innerText:null);
  if(failure)throw Error(failure);
  const startupMs=Date.now()-started;
  await page.waitForTimeout(1000);
  const report={baseline,startupMs,errors,metrics:await page.evaluate(()=>__PTBO_CITY_QA__.metrics())};
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'timing-'+(baseline?'baseline':'final')+'.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({baseline,startupMs,errors,textures:report.metrics.textures}));
  if(errors.length)throw Error(errors.join('; '));
})().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await browser?.close()});
