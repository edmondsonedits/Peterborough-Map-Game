// Reproducible local/live smoke check. A narrow viewport is not physical-phone certification.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const [base='http://127.0.0.1:8870',label='local']=process.argv.slice(2);
 const out=path.resolve('test-artifacts/sherbrooke',label);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--use-angle=d3d11']});
 const reports=[];
 try {for(const mobile of (process.env.CITY_QA_PROFILE==='mobile'?[true]:[false,true])){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:900}}),errors=[],failed=[];
  await page.addInitScript(()=>localStorage.setItem('ptbo-emergency-stats-mode','enabled'));
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:new URL(r.url()).origin+new URL(r.url()).pathname,status:r.status()});});
  await page.goto(base+'/city-explorer/?qa=1&analytics=off'+(mobile?'&lite=1':''),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true'&&window.__PTBO_CITY_QA__,null,{timeout:180000});
  await page.waitForFunction(()=>!document.querySelector('#loading-screen')||document.querySelector('#loading-screen').classList.contains('is-hidden'),null,{timeout:30000});
  const metrics=await page.evaluate(()=>__PTBO_CITY_QA__.metrics());
  assert.equal(metrics.footage.length,19);assert.ok(metrics.footage.every(x=>x.editorLinked));assert.equal(metrics.stationEditorLinked,true);
  assert.equal(metrics.footage.filter(x=>x.facadePhotoStatus==='loaded').length,6);
  assert.ok(metrics.footage.filter(x=>x.gardenMeshes>0).length>=8,'reviewed lawns rendered');
  assert.equal(metrics.footage.find(x=>x.sourceId==='way/846927296').photoStatus,'loaded');
  if(!mobile){
   const style=await page.addStyleTag({content:'#app > :not(canvas), #ptbo-build-badge {visibility:hidden!important}'});
   const views={block:{lat:44.30078,lon:-78.3213,altitude:67,distance:145,bearing:180,pitch:-.40},south:{lat:44.3005,lon:-78.3221,altitude:2.8,distance:26,bearing:0,pitch:.015},balcony:{lat:44.30055,lon:-78.32239,altitude:3.2,distance:24,bearing:0,pitch:.08},bluehouse:{lat:44.30062,lon:-78.32122,altitude:2.8,distance:23,bearing:0,pitch:.06},store:{lat:44.30085,lon:-78.32146,altitude:2.8,distance:22,bearing:180,pitch:.06},office:{lat:44.30085,lon:-78.32271,altitude:2.8,distance:25,bearing:168,pitch:.06},mural:{lat:44.3009,lon:-78.31995,altitude:2.8,distance:23,bearing:165,pitch:.03}};
   for(const [name,view]of Object.entries(views)){await page.evaluate(v=>__PTBO_CITY_QA__.setView(v),view);await page.waitForTimeout(1500);await page.screenshot({path:path.join(out,name+'.png')});}
   await style.evaluate(n=>n.remove());
  }
  await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());await page.locator('canvas').first().focus();
  if(!mobile){await page.keyboard.press('KeyE');await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().mode==='driving');const start=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);await page.keyboard.down('KeyW');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');const end=await page.evaluate(()=>__PTBO_GAMEPLAY__.state().truck);assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>.1,'truck moves with the original controls');await page.evaluate(()=>__PTBO_GAMEPLAY__.reset());}
  await page.waitForFunction(()=>!document.querySelector('#loading-screen')||Number(getComputedStyle(document.querySelector('#loading-screen')).opacity)<.01);
  await page.waitForTimeout(800);
  await page.screenshot({path:path.join(out,mobile?'mobile-lite.png':'play-controls.png')});
  const result={profile:mobile?'narrow-lite':'desktop',build:await page.evaluate(()=>PTBO_BUILD.version),metrics,errors,failed};
  assert.equal(errors.length,0,errors.join('; '));assert.equal(failed.length,0,JSON.stringify(failed));reports.push(result);await page.close();
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,physicalPhoneTested:false,reports},null,2));
 console.log(JSON.stringify({status:'pass',base,profiles:reports.map(r=>({profile:r.profile,build:r.build,frontages:r.metrics.footage.length,mural:'loaded',stationLinked:r.metrics.stationEditorLinked,drawCalls:r.metrics.drawCalls,errors:r.errors.length}))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});