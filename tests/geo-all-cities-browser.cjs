/* Optional all-city UI smoke test. Map tiles are stubbed; rendered-map QA runs separately. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const registry={};registry.window=registry;
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../cities/city-registry.js'),'utf8'),registry);
const cities=Array.from(registry.PTBO_CITIES).filter(city=>city.modes.geo);
assert.equal(cities.length,31);
(async()=>{
 const base=process.argv[2]||'http://127.0.0.1:4188',out=process.env.PTBO_GEO_QA_OUTPUT||'test-artifacts/geo-all-cities',report=[];
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,
  ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
 const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 try{
  for(const city of cities)for(const [surface,service,width,height] of [['desktop','fire',1365,900],['mobile','ems',390,844]]){
   const name=`${city.id}-${surface}-${service}`,errors=[],missing=[],result={name,errors,missing};report.push(result);
   const context=await browser.newContext({viewport:{width,height},isMobile:surface==='mobile',hasTouch:surface==='mobile',ignoreHTTPSErrors:true});
   await context.route(/https:\/\/(?:[abc]\.)?tile\.openstreetmap\.org\//,route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
   await context.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{}'}));
   await context.addInitScript(()=>{try{localStorage.setItem('geoShowCrossStreets','true');}catch(_){}});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.url());});
   try{
    await page.goto(`${base}/geo-guesser/${surface}/?city=${city.id}&analytics=off${process.env.PTBO_EXPECTED_VERSION?'&v='+process.env.PTBO_EXPECTED_VERSION:''}`,{waitUntil:'load'});
    const frame=page.frames().find(f=>f.url().includes('/geo-guesser/index.html'));
    await frame.waitForFunction(()=>window.PTBO_GEO?.state.ready);
    result.version=await frame.evaluate(()=>PTBO_BUILD.version);
    if(process.env.PTBO_EXPECTED_VERSION)assert.equal(result.version,process.env.PTBO_EXPECTED_VERSION);
    assert.equal(await frame.evaluate(()=>PTBO_CITY_PACKAGE.id),city.id);
    await frame.locator(`#service-${service}`).click();await frame.locator('#difficulty-medium').click();
    // Exercise an existing long location name rather than relying on random selection.
    await frame.evaluate(()=>{const g=PTBO_GEO,calls=PTBO_STATION_PRACTICE.serviceLocations(g.state.locations,g.state.service,g.state.difficulty);g.state.locations=[calls.sort((a,b)=>(b.name||'').length-(a.name||'').length)[0]];});
    await frame.locator('#practice-stations button').first().click();
    const layout=await frame.evaluate(()=>{
     const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
     return{header:rect('header'),reticle:rect('reticle'),controls:['practice-return','call-toggle','confirm','practice-controls'].map(rect)};
    });
    assert.ok(layout.header.top<=14,'location starts at the top');assert.equal(overlap(layout.header,layout.reticle),false,'location leaves the crosshair clear');
    for(const rect of layout.controls)assert.ok(rect.left>=-1&&rect.right<=width+1&&rect.top>=0&&rect.bottom<=height+1,'controls fit the screen');
    assert.equal(overlap(layout.controls[0],layout.controls[1]),false,'Return and the call toggle do not overlap');
    assert.equal(await frame.locator('#practice-feedback').innerText(),'');
    assert.equal(await frame.locator('#call-cross-streets').isVisible(),true,'cross streets are shown with the setting enabled');
    assert.equal(await frame.locator('#call-toggle').getAttribute('aria-expanded'),'true');
    const target=await frame.evaluate(()=>PTBO_GEO.state.target.id);
    // Keyboard panning is a real player input; programmatic setView must not collapse the card.
    const mapBefore=await frame.evaluate(()=>PTBO_GEO.state.map.getCenter().lng);
    await frame.locator('#map').press('ArrowRight');
    await frame.waitForFunction(lng=>Math.abs(PTBO_GEO.state.map.getCenter().lng-lng)>1e-7,mapBefore);
    assert.equal(await frame.locator('#call-toggle').getAttribute('aria-expanded'),'false');
    assert.equal(await frame.locator('#call-address').isVisible(),true);
    assert.equal(await frame.locator('#call-cross-streets').isVisible(),false);
    await frame.locator('#call-toggle').click();
    assert.equal(await frame.locator('#call-toggle').getAttribute('aria-expanded'),'true');
    assert.equal(await frame.locator('#call-cross-streets').isVisible(),true);
    assert.equal(await frame.locator('#practice-return').isVisible(),true);
    await frame.evaluate(()=>{const g=PTBO_GEO,t=g.state.target;g.state.map.setView([t.lat+.05,t.lng+.05],18,{animate:false});});
    await frame.locator('#confirm').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'incorrect');
    assert.equal(await frame.locator('#practice-review-title').innerText(),'Try again');
    const red=await frame.locator('#header').evaluate(n=>getComputedStyle(n).borderColor.match(/\d+/g).map(Number));assert.ok(red[0]>red[1]);
    await frame.locator('#confirm').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
    assert.equal(await frame.evaluate(()=>PTBO_GEO.state.target.id),target);
    await frame.evaluate(()=>{const g=PTBO_GEO,t=g.state.target;g.state.map.setView([t.lat,t.lng],18,{animate:false});});
    await frame.locator('#confirm').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'correct');
    assert.equal(await frame.locator('#guess-effect-label').innerText(),'Correct');
    const green=await frame.locator('#header').evaluate(n=>getComputedStyle(n).borderColor.match(/\d+/g).map(Number));assert.ok(green[1]>green[0]);
    await frame.locator('#practice-continue').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
    assert.equal(await frame.locator('#call-toggle').getAttribute('aria-expanded'),'true');
    assert.equal(await frame.locator('#call-cross-streets').isVisible(),true);
    await frame.locator('#practice-reveal').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'revealed');
    assert.equal(await frame.locator('#guess-effect').isVisible(),false);
    assert.equal(await frame.locator('#practice-return').isVisible(),true);
    await frame.locator('#practice-return').click();assert.equal(await frame.locator('#station-practice').isVisible(),true);
    assert.equal(await frame.locator(`#service-${service}`).getAttribute('aria-pressed'),'true');
    assert.equal(await frame.locator('#difficulty-medium').getAttribute('aria-pressed'),'true');
    result.bases=await frame.locator('#practice-stations button').count();assert.ok(result.bases>0,'base options remain available');
    const nextBaseName=await frame.locator('#practice-stations button').last().locator('strong').innerText();
    await frame.locator('#practice-stations button').last().click();
    assert.equal(await frame.evaluate(()=>PTBO_GEO.state.base.name),nextBaseName);
    assert.equal(await frame.locator('#practice-return').isVisible(),true);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);result.pass=true;console.log(JSON.stringify(result));
   }catch(error){result.error=error.message;await page.screenshot({path:path.join(out,`${name}-failure.png`)});throw error;}
   finally{await context.close();}
  }
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
