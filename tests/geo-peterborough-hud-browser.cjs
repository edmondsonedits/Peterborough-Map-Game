/* Optional browser QA: node tests/geo-peterborough-hud-browser.cjs http://127.0.0.1:4188 */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const base=process.argv[2]||'http://127.0.0.1:4188';
  const out=process.env.PTBO_GEO_QA_OUTPUT||'test-artifacts/geo-hud';fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,
    ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
  const report=[];
  try{
    for(const [surface,width,height,service,city] of [
      ['desktop',1365,900,'fire','peterborough'],['desktop',1024,768,'ems','peterborough'],
      ['mobile',390,844,'ems','peterborough'],['mobile',360,740,'fire','peterborough'],
      ['mobile',320,568,'ems','peterborough'],['mobile',844,390,'fire','peterborough'],
      ['mobile',667,375,'ems','peterborough'],['mobile',430,932,'fire','peterborough'],
      ['mobile',390,844,'fire','toronto'],
    ]){
      const name=`${city}-${surface}-${service}-${width}x${height}`,errors=[],missing=[];
      const context=await browser.newContext({viewport:{width,height},isMobile:surface==='mobile',hasTouch:surface==='mobile',deviceScaleFactor:1,ignoreHTTPSErrors:true});
      await context.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{}'}));
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.url());});
      const result={name,errors,missing};report.push(result);
      try{
        await page.goto(`${base}/geo-guesser/${surface}/?city=${city}&analytics=off${process.env.PTBO_EXPECTED_VERSION?'&v='+process.env.PTBO_EXPECTED_VERSION:''}`,{waitUntil:'load'});
        const frame=page.frames().find(f=>f.url().includes('/geo-guesser/index.html'));
        await frame.waitForFunction(()=>window.PTBO_GEO?.state.ready);
        result.version=await frame.evaluate(()=>PTBO_BUILD.version);
        if(process.env.PTBO_EXPECTED_VERSION)assert.equal(result.version,process.env.PTBO_EXPECTED_VERSION);
        const example=city==='peterborough'&&surface==='desktop'&&width===1365;
        await frame.locator(`#service-${service}`).click();await frame.locator(example?'#difficulty-easy':'#difficulty-medium').click();
        if(city==='peterborough')await frame.evaluate(name=>{PTBO_GEO.state.locations=[PTBO_GEO.state.locations.find(c=>c.name===name)];},example?'Portage Place':'Adam Scott Collegiate and Vocational Institute');
        await frame.locator('#practice-stations button').first().click();
        if(process.env.PTBO_GEO_REQUIRE_TILES==='true')await frame.locator('.leaflet-tile-loaded').first().waitFor({timeout:20000});
        const inspectLayout=()=>frame.evaluate(()=>{
          const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
          const header=box('header'),reticle=box('reticle');
          return{width:innerWidth,height:innerHeight,header,reticle,address:box('call-address'),cross:box('call-cross-streets'),
            overlap:header.left<reticle.right&&header.right>reticle.left&&header.top<reticle.bottom&&header.bottom>reticle.top,
            controls:['practice-bases-toggle','practice-finish','confirm','practice-controls','practice-reveal','practice-continue'].map(id=>({id,...box(id)}))};
        });
        const layout=await inspectLayout();result.layout=layout;
        assert.ok(layout.header.top<=14,'location card begins at the top');
        assert.equal(layout.overlap,false,'long location name leaves crosshair clear');
        if(surface==='desktop'){
          assert.ok(layout.cross.left>=layout.address.right+8,'cross streets sit to the right of the address');
          assert.ok(Math.abs(layout.cross.bottom-layout.address.bottom)<4,'address and cross streets share one baseline');
        }
        if(example)assert.ok(layout.header.height<115,'the supplied Portage Place example has a flat card');
        for(const c of layout.controls)assert.ok(c.left>=-1&&c.right<=width+1&&c.top>=0&&c.bottom<=height+1,`${c.id} fits ${width}x${height}`);
        assert.equal(await frame.locator('#practice-feedback').innerText(),'');
        assert.equal(await frame.locator('#call-cross-streets').isVisible(),surface!=='mobile');
        const target=await frame.evaluate(()=>PTBO_GEO.state.target.id);
        await frame.locator('#practice-bases-toggle').click();
        assert.equal(await frame.locator('#practice-base-options').isVisible(),true);
        result.bases=await frame.locator('#practice-base-options button').allTextContents();
        await page.screenshot({path:path.join(out,`${name}-bases.png`)});
        await frame.locator('#practice-bases-toggle').press('Escape');
        assert.equal(await frame.locator('#practice-base-options').isVisible(),false);
        await frame.locator('#practice-bases-toggle').click();await frame.locator('#practice-base-options button').last().click();
        assert.equal(await frame.locator('#practice-base-options').isVisible(),false);
        assert.equal(await frame.evaluate(()=>PTBO_GEO.state.target.id),target);
        assert.equal(await frame.evaluate(()=>Math.abs(PTBO_GEO.state.map.getCenter().lat-PTBO_GEO.state.base.lat)<1e-8),true);
        await frame.locator('#practice-bases-toggle').click();await page.mouse.click(width-5,height/2);
        assert.equal(await frame.locator('#practice-base-options').isVisible(),false,'outside click closes base menu');
        const mapBefore=await frame.evaluate(()=>PTBO_GEO.state.map.getCenter().lng);
        await frame.locator('#map').press('ArrowRight');
        await frame.waitForFunction(lng=>Math.abs(PTBO_GEO.state.map.getCenter().lng-lng)>1e-7,mapBefore);
        if(surface==='mobile'){
          await frame.locator('#reveal-cross-streets').click();assert.equal(await frame.locator('#call-cross-streets').isVisible(),true);
          await page.screenshot({path:path.join(out,`${name}-cross-streets.png`)});
          await frame.locator('#reveal-cross-streets').click();assert.equal(await frame.locator('#call-cross-streets').isVisible(),false);
        }
        await page.screenshot({path:path.join(out,`${name}-play.png`)});
        await frame.locator('#practice-reveal').click();assert.equal(await frame.locator('#practice-review-title').innerText(),'Location revealed');
        await page.screenshot({path:path.join(out,`${name}-review.png`)});
        await frame.locator('#practice-continue').click();
        assert.equal(await frame.locator('#call-cross-streets').isVisible(),surface!=='mobile');
        await frame.locator('#confirm').click();assert.equal(await frame.locator('#practice-review-title').innerText(),'Try again');
        await frame.locator('#confirm').click();assert.equal(await frame.locator('#reticle').isVisible(),true);
        await frame.evaluate(()=>{const g=PTBO_GEO;g.state.map.setView([g.state.target.lat,g.state.target.lng],18,{animate:false});});
        await frame.locator('#confirm').click();assert.equal(await frame.locator('#practice-review-title').innerText(),'Location found');
        await frame.locator('#practice-finish').click();assert.equal(await frame.locator('#station-practice').isVisible(),true);
        assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);result.pass=true;console.log(JSON.stringify(result));
      }catch(e){result.error=e.message;await page.screenshot({path:path.join(out,`${name}-failure.png`)});throw e;}
      finally{await context.close();}
    }
  }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
