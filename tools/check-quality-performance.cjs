'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),rows=[];
 try{for(const lite of [false,true]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto('http://127.0.0.1:4188/city-explorer/?qa=1'+(lite?'&lite=1':''),{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true',null,{timeout:180000});
  await page.locator('#play-mode').click();await page.locator('canvas').first().focus();await page.keyboard.press('KeyE');
  await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');await page.waitForTimeout(2500);
  const client=await page.context().newCDPSession(page);await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:1000});await client.send('Profiler.start');
  const sample=await page.evaluate(()=>new Promise(resolve=>{const times=[];let previous=performance.now(),start=previous;function tick(now){times.push(now-previous);previous=now;if(now-start>=10000){times.sort((a,b)=>a-b);resolve({frames:times.length,durationMs:now-start,medianFps:1000/times[Math.floor(times.length/2)],p99FrameMs:times[Math.floor(times.length*.99)],metrics:__PTBO_CITY_QA__.metrics(),lod:document.documentElement.dataset.cityDetailLod});}else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
  const {profile}=await client.send('Profiler.stop'),counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
  const top=profile.nodes.map(n=>({function:n.callFrame.functionName,url:n.callFrame.url.split('/').pop(),line:n.callFrame.lineNumber+1,samples:counts.get(n.id)||0})).sort((a,b)=>b.samples-a.samples).slice(0,16);
  const out=path.resolve('test-artifacts/quality-audit/after');fs.writeFileSync(path.join(out,'cpu-'+(lite?'lite':'full')+'.json'),JSON.stringify(profile));
  rows.push({profile:lite?'lite':'full',sample,top});console.log(JSON.stringify(rows.at(-1)));await page.close();
 }
 fs.writeFileSync(path.resolve('test-artifacts/quality-audit/after/performance.json'),JSON.stringify(rows,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
