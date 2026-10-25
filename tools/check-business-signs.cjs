// Real-browser coverage and multi-angle check for citywide wall-mounted names.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:8870',label=process.argv[3]||'local-business';
 const out=path.resolve('test-artifacts/business-signs',label);fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--use-angle=d3d11']});
 const reports=[];
 try{for(const mobile of (process.env.CITY_QA_PROFILE==='desktop'?[false]:[false,true])){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:900}}),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)failed.push({url:new URL(r.url()).pathname,status:r.status()})});
  await page.goto(base+'/city-explorer/?qa=1&analytics=off'+(mobile?'&lite=1':''),{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>document.documentElement.dataset.gameplayReady==='true'&&window.__PTBO_CITY_QA__,null,{timeout:180000});
  await page.waitForFunction(()=>document.documentElement.dataset.businessSigns!=='loading',null,{timeout:15000});
  const data=await page.evaluate(()=>({metrics:__PTBO_CITY_QA__.metrics(),samples:__PTBO_CITY_QA__.businessSigns(),rejected:__PTBO_CITY_QA__.businessSignRejections(),version:PTBO_BUILD.version}));
  assert.equal(data.version,process.env.EXPECTED_BUILD||'1.6.128');assert.ok(data.samples.length>0,'business names loaded');assert.equal(errors.length,0,errors.join('; '));assert.equal(failed.length,0,JSON.stringify(failed));
  if(process.argv.includes('--require-parity'))assert.equal(data.rejected.length,0,'offline candidates must pass actual runtime geometry');
  if(!mobile){await page.addStyleTag({content:'#app > :not(canvas), #ptbo-build-badge {visibility:hidden!important}'});
   const candidates=data.samples.filter(s=>s.center),selected=[],used=new Set();
   const patterns=[/business directory/i,/Bijoux|Veronus|Watson|Sweet Fern|Take Cover|Faculty/i,/Amandala|Fresh Urban|Food Shop|Curate/i,/Sherbrooke|Avant|Westland/i,/Walmart|Costco|Canadian Tire|Home Depot/i,/Chemong|Lansdowne|Dollarama|Tim Hortons/i];
   for(const pattern of patterns){const sign=candidates.find(s=>pattern.test(s.name)&&!used.has(s.buildingSourceId));if(sign){selected.push(sign);used.add(sign.buildingSourceId)}}
   for(const sign of candidates){if(selected.length>=9)break;if(!used.has(sign.buildingSourceId)&&selected.every(s=>Math.hypot(s.center.x-sign.center.x,s.center.z-sign.center.z)>350)){selected.push(sign);used.add(sign.buildingSourceId)}}
   const center={lat:44.3091,lon:-78.3197},lonScale=111320*Math.cos(center.lat*Math.PI/180);
   for(let i=0;i<selected.length;i++){const sign=selected[i],lat=center.lat-sign.center.z/110540,lon=center.lon+sign.center.x/lonScale,bearing=Math.atan2(sign.normal.x,-sign.normal.z)*180/Math.PI;
    for(const [angle,offset] of [['front',0],['left',-32],['right',32]]){await page.evaluate(v=>__PTBO_CITY_QA__.setView(v),{lat,lon,altitude:3.0,distance:Math.max(10,sign.width*2.7),bearing:bearing+offset,pitch:.015});await page.waitForTimeout(1100);await page.screenshot({path:path.join(out,String(i).padStart(2,'0')+'-'+angle+'.jpg'),type:'jpeg',quality:78})}
   }
   data.views=selected.map(s=>({name:s.name,sourceId:s.buildingSourceId,center:s.center}));
  }
  reports.push({profile:mobile?'narrow-lite':'desktop',...data,errors,failed});await page.close();
  console.log(JSON.stringify({profile:mobile?'narrow-lite':'desktop',version:data.version,signs:data.metrics.businessSigns,rejected:data.rejected.length}));
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checkedAt:new Date().toISOString(),base,physicalPhoneTested:false,reports},null,2));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
