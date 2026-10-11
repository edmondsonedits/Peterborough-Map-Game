'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const before = process.argv[2] || 'http://127.0.0.1:4175';
const after = process.argv[3] || 'http://127.0.0.1:4174';
const output = path.resolve(process.env.PTBO_QA_ARTIFACT_DIR || 'artifacts/street-paint-qa');
const sites = [
 {name:'sherbrooke-station',lat:44.30080,lon:-78.32212,altitude:36,distance:42,bearing:180,pitch:-0.70},
 {name:'george-downtown',lat:44.3045,lon:-78.3200,altitude:40,distance:36,bearing:105,pitch:-0.80},
 {name:'lansdowne-west',lat:44.2742,lon:-78.3777,altitude:40,distance:42,bearing:180,pitch:-0.72},
 {name:'parkhill-west',lat:44.3117,lon:-78.3367,altitude:38,distance:42,bearing:180,pitch:-0.72},
];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const report={method:'Same headless software-rendered Chromium, viewport, camera, packaged assets; not real phone GPU benchmarking or survey accuracy.',runs:[]};
 try {
  for(const [label,root] of [['before',before],['after',after]]) {
   const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e.message)));
   const start=Date.now();
   await page.goto(root+'/city-explorer/?qa=1',{waitUntil:'domcontentloaded',timeout:90000});
   await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true',null,{timeout:180000});
   const readyMs=Date.now()-start;
   const entry={label,readyMs,errors,views:[]};
   report.runs.push(entry);
   for(const site of sites) {
    await page.evaluate(view=>window.__PTBO_CITY_QA__.setView(view),site);
    await page.waitForTimeout(1000);
    const samples=await page.evaluate(()=>new Promise(resolve=>{
      const out=[];let previous=performance.now();
      function step(now){out.push(now-previous);previous=now;if(out.length===60)resolve(out);else requestAnimationFrame(step);}
      requestAnimationFrame(step);
    }));
    samples.shift();samples.sort((a,b)=>a-b);
    const metrics=await page.evaluate(()=>({
      ...window.__PTBO_CITY_QA__.metrics(),
      paintVersion:document.documentElement.dataset.roadPaintVersion||'legacy',
      paintVertices:Number(document.documentElement.dataset.roadPaintVertices||0),
      roadSource:document.documentElement.dataset.officialRoadDetail,
      cityReadyMs:document.documentElement.dataset.cityReadyMs,
    }));
    await page.screenshot({path:path.join(output,label+'-'+site.name+'.png')});
    entry.views.push({site:site.name,medianFrameMs:samples[Math.floor(samples.length*.5)],p95FrameMs:samples[Math.floor(samples.length*.95)],...metrics});
   }
   if(label==='after' && entry.views.some(v=>v.paintVersion!=='street-evidence-1'))throw new Error('New paint renderer was not active');
   if(errors.length)throw new Error(label+' uncaught browser errors: '+errors.join('; '));
   await page.close();
  }
 } finally {
  fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
