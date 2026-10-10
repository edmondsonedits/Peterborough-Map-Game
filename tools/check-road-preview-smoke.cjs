'use strict';
const { chromium } = require('playwright');

(async()=>{
  const root = (process.argv[2] || 'http://127.0.0.1:4174').replace(/\/$/,'');
  const browser = await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
  const page = await browser.newPage({viewport:{width:1280,height:720}});
  const failures=[], consoleErrors=[], calls=[];
  page.on('pageerror',error=>failures.push(String(error.stack||error).slice(0,900)));
  page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text().slice(0,700));});
  page.on('requestfailed',req=>{if(calls.length<35)calls.push({url:req.url(),failure:req.failure()?.errorText})});
  let response=null;
  try{
    response=await page.goto(root+'/city-explorer/?lite=1&roadStartupQA=1',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true'
      || Boolean(document.querySelector('.error-card, #loading-screen.has-error'))
      || document.documentElement.dataset.explorerBoot==='failed',{timeout:65000}).catch(()=>null);
    const snapshot=await page.evaluate(()=>({
      ready:document.documentElement.dataset.gameplayReady,
      dataset:Object.fromEntries(Object.entries(document.documentElement.dataset)
        .filter(([k])=>/road|boot|error|ready|terrain|official|gameplay|city/i.test(k)).slice(0,50)),
      loading:(()=>{const e=document.querySelector('#loading-screen');return {classes:e?.className,text:e?.innerText?.slice(0,1100)}})(),
      errors:[...document.querySelectorAll('.error-card,.error-details')].map(e=>e.innerText.slice(0,1000)),
      scripts:[...document.scripts].filter(s=>s.src).map(s=>s.src).slice(-18),
      startup:globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.phase,
    }));
    console.log('ROAD STARTUP:',JSON.stringify({http:response?.status(),snapshot,failures,consoleErrors,calls},null,2));
    if(snapshot.ready!=='true')throw new Error('City simulator did not become playable; inspect ROAD STARTUP diagnostics above');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});