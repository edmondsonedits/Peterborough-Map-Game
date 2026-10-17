'use strict';
// Real Chromium + real tiles. Route submission uses a disclosed deterministic
// trace fixture; mouse/touch drawing is covered by quality-review-browser.cjs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const base=(process.argv[2]||'http://127.0.0.1:4191').replace(/\/$/,''),out=path.resolve(process.env.PTBO_QA_OUTPUT||'test-artifacts/city-expansion/routes');
const c={window:{}};vm.runInNewContext(fs.readFileSync('cities/city-registry.js','utf8'),c);
const cities=c.window.PTBO_CITIES.filter(city=>!process.env.PTBO_CITIES||process.env.PTBO_CITIES.split(',').includes(city.id));
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PTBO_CHROMIUM_PATH?{executablePath:process.env.PTBO_CHROMIUM_PATH}:{}),...(process.env.PTBO_BROWSER_PROXY?{proxy:{server:process.env.PTBO_BROWSER_PROXY,bypass:'127.0.0.1,localhost'}}:{})}),results=[];
 try{
  for(const city of cities)for(const service of ['fire','ems']){
   const context=await browser.newContext({ignoreHTTPSErrors:process.env.PTBO_QA_IGNORE_TLS==='1',viewport:service==='ems'?{width:390,height:844}:{width:1365,height:900},isMobile:service==='ems',hasTouch:service==='ems'});
   const page=await context.newPage(),errors=[],missing=[];page.setDefaultTimeout(60000);
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.status()+' '+r.url());});
   await context.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,body:'{}'}));
   if(process.env.PTBO_QA_STUB_TILES==='1')await context.route('https://tile.openstreetmap.org/**',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDOsAAAAASUVORK5CYII=','base64')}));
   await page.addInitScript(service=>{localStorage.setItem('ptboRouteMappingService',service);},service);
   const report={city:city.id,service,input:service==='ems'?'emulated phone':'desktop',fixture:'reference trace; real Submit/Next controls'};
   try{
    await page.goto(base+'/route-mapping/?city='+city.id+'&analytics=off');
    await page.waitForFunction(()=>window.PTBO_ROUTE_MAPPING||!document.getElementById('loading-error').hidden);
    const failure=await page.locator('#loading-error').isVisible();if(failure)throw Error(await page.locator('#loading-error-message').innerText());
    assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.cityId),city.id);
    report.detail=await page.evaluate(()=>{
     const api=PTBO_ROUTE_MAPPING,s=api.state,c=s.traceCore;
     const origin=c.snap(s.startMarker.getLatLng(),260),destination=c.snap(s.call,520),reference=c.between(origin,destination);
     if(!reference?.edges.length)throw Error('No usable reference route');
     const profile=s.routeResponses?.bases.find(p=>p.baseId===s.base.id&&p.service===s.service);
     if(!profile||profile.callIds.length<3||s.call.routeBaseId!==s.base.id||!profile.callIds.includes(s.call.id)||reference.distance>profile.maxRouteMetres)throw Error('Call is outside the current hall response catalog');
     const trace=c.trace([reference.start,...reference.edges.map(e=>e.end)],{tolerance:12});
     s.playerRoute=c.finish(trace,destination,40);s.originAnchor=origin;s.destinationAnchor=destination;s.mode='editing';
     if(!s.playerRoute.complete)throw Error('Reference route did not complete');
     document.getElementById('submit-button').disabled=false;
     return {version:PTBO_BUILD.version,base:s.base.name,call:s.call.name,facilityType:s.call.facilityType,distance:reference.distance,responseMethod:profile.method,localCalls:profile.callIds.length,roads:s.graph.segments.length,callCount:s.callCount,progress:s.progression.completed};
    });
    await page.locator('#submit-button').click();await page.locator('#results').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.progression.completed),report.detail.progress+1);
    report.review=await page.locator('#results').innerText();
    await page.locator('#next-button').click();
    assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.callCount),report.detail.callCount+1);
    assert.equal(await page.evaluate(()=>{const s=PTBO_ROUTE_MAPPING.state;return s.call.routeBaseId===s.base.id&&s.routeResponses.bases.find(p=>p.baseId===s.base.id).callIds.includes(s.call.id);}),true);
    const active=await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.call.id);
    await page.locator('#settings-button').click();await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.call.id),active,'same-service Apply preserves the call');
    await page.locator('#settings-button').click();await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    assert.equal(await page.evaluate(()=>document.activeElement===document.getElementById('settings-button')),true);
    if(process.env.PTBO_EXPECTED_VERSION)assert.equal(report.detail.version,process.env.PTBO_EXPECTED_VERSION);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    report.pass=true;
   }catch(e){report.pass=false;report.error=e.message;report.errors=errors;report.missing=missing;}
   if(report.pass){
    await page.waitForTimeout(900);
    await page.waitForFunction(()=>!PTBO_ROUTE_MAPPING.state.map._animatingZoom&&!Object.values(PTBO_ROUTE_MAPPING.state.map._layers).some(layer=>layer._loading===true)&&[...document.querySelectorAll('.leaflet-tile')].some(t=>t.complete&&t.naturalWidth));
    await page.waitForTimeout(400);
   }
   await page.screenshot({path:path.join(out,city.id+'-'+service+'.png')}).catch(()=>{});
   results.push(report);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,results,physicalDevice:false,stubbedTiles:process.env.PTBO_QA_STUB_TILES==='1'},null,2));
   console.log(JSON.stringify({city:city.id,service,pass:report.pass,error:report.error}));await context.close();
  }
 }finally{await browser.close();}
 if(results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
