'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async()=>{
  const root = (process.argv[2] || 'http://127.0.0.1:4174').replace(/\/$/,'');
  const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const failures=[], consoleErrors=[], calls=[];
  page.on('pageerror',error=>failures.push(String(error.stack||error).slice(0,900)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text().slice(0,700));});
  page.on('requestfailed',req=>{if(calls.length<35)calls.push({url:req.url(),failure:req.failure()?.errorText})});
  let response=null, waitError=null;
  const started=Date.now();
  try{
    response=await page.goto(root+'/city-explorer/?lite=1&roadStartupQA=1',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true'
      || Boolean(document.querySelector('.error-card, #loading-screen.has-error'))
      || document.documentElement.dataset.explorerBoot==='failed',null,{timeout:65000}).catch(error=>{waitError=String(error.message);});
    const snapshot=await page.evaluate(()=>({
      ready:document.documentElement.dataset.gameplayReady,
      dataset:Object.fromEntries(Object.entries(document.documentElement.dataset)
        .filter(([k])=>/road|boot|error|ready|terrain|official|gameplay|city/i.test(k)).slice(0,50)),
      loading:(()=>{const e=document.querySelector('#loading-screen');return {classes:e?.className,text:e?.innerText?.slice(0,1100)}})(),
      errors:[...document.querySelectorAll('.error-card,.error-details')].map(e=>e.innerText.slice(0,1000)),
      scripts:[...document.scripts].filter(s=>s.src).map(s=>s.src).slice(-18),
      startup:globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.phase,
      phaseTimings:globalThis.__PTBO_ROAD_STARTUP_QA__ || null,
      mappedArrowBuild:globalThis.__PTBO_ROAD_STARTUP_QA__?.mappedArrowBuild || null,
    }));
    const report={root,elapsedMilliseconds:Date.now()-started,waitError,http:response?.status(),snapshot,failures,consoleErrors,calls};
    if(process.env.PTBO_STARTUP_REPORT){const target=path.resolve(process.env.PTBO_STARTUP_REPORT);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));}
    console.log('ROAD STARTUP:',JSON.stringify(report,null,2));
    if(waitError)throw new Error('City simulator startup wait failed: '+waitError);
    if(snapshot.ready!=='true')throw new Error('City simulator did not become playable; inspect ROAD STARTUP diagnostics above');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});