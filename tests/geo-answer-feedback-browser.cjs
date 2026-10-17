/* Optional browser QA: node tests/geo-answer-feedback-browser.cjs http://127.0.0.1:4188 */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const base=process.argv[2]||'http://127.0.0.1:4188',out=process.env.PTBO_GEO_QA_OUTPUT||'test-artifacts/geo-answer-feedback',city=process.env.PTBO_GEO_QA_CITY||'peterborough';
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,
    ...(process.env.HTTPS_PROXY?{proxy:{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
  try{
    for(const [surface,width,height,reduced] of [['desktop',1365,900,false],['mobile',390,844,false],['mobile',844,390,false],['mobile',320,568,false],['desktop',1365,900,true],['mobile',390,844,true]]){
      const name=`${city}-${surface}-${width}x${height}${reduced?'-reduced-motion':''}`;
      const context=await browser.newContext({viewport:{width,height},isMobile:surface==='mobile',hasTouch:surface==='mobile',reducedMotion:reduced?'reduce':'no-preference',ignoreHTTPSErrors:true});
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(`${base}/geo-guesser/${surface}/?city=${city}&analytics=off${process.env.PTBO_EXPECTED_VERSION?'&v='+process.env.PTBO_EXPECTED_VERSION:''}`,{waitUntil:'load'});
        const frame=page.frames().find(f=>f.url().includes('/geo-guesser/index.html'));
        await frame.waitForFunction(()=>PTBO_GEO?.state.ready);
        if(process.env.PTBO_EXPECTED_VERSION)assert.equal(await frame.evaluate(()=>PTBO_BUILD.version),process.env.PTBO_EXPECTED_VERSION);
        await frame.locator('#service-fire').click();await frame.locator('#difficulty-medium').click();await frame.locator('#practice-stations button').first().click();
        await frame.evaluate(()=>{const g=PTBO_GEO,t=g.state.target;g.state.map.setView([t.lat+.03,t.lng+.03],17,{animate:false});});
        await frame.locator('#confirm').click();
        assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'incorrect');
        assert.equal(await frame.locator('#practice-review-title').innerText(),'Try again');
        const blur=await frame.locator('.leaflet-map-pane').evaluate((pane,reduced)=>{
          const a=pane.getAnimations().find(a=>a.animationName==='ptbo-answer-blur');
          if(reduced)return{present:Boolean(a),filter:getComputedStyle(pane).filter};
          if(!a)return{present:false};
          a.pause();a.currentTime=140;
          const during=getComputedStyle(pane).filter,duration=a.effect.getTiming().duration;
          a.finish();return{present:true,during,duration,after:getComputedStyle(pane).filter};
        },reduced);
        if(reduced){assert.equal(blur.present,false);assert.equal(blur.filter,'none');}
        else{assert.equal(blur.present,true);assert.match(blur.during,/blur\(/);assert.ok(blur.duration<=500);assert.equal(blur.after,'none');}
        const red=await frame.locator('#header').evaluate(n=>getComputedStyle(n).borderColor.match(/\d+/g).map(Number));
        assert.ok(red[0]>red[1],'incorrect review has a red border');
        // Freeze the real CSS entrance animation so screenshots capture the outcome clearly.
        await frame.evaluate(()=>{for(const a of document.getAnimations())if(a.animationName?.startsWith('ptbo-answer-')&&a.animationName!=='ptbo-answer-blur'){a.pause();a.currentTime=250;}});
        await page.screenshot({path:path.join(out,`${name}-incorrect.png`)});
        await frame.locator('#confirm').click();
        assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
        assert.equal(await frame.locator('#guess-effect').isVisible(),false);
        await frame.evaluate(()=>{const g=PTBO_GEO,t=g.state.target;g.state.map.setView([t.lat,t.lng],18,{animate:false});});
        await frame.locator('#confirm').click();
        assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'correct');
        assert.equal(await frame.locator('#practice-review-title').innerText(),'Location found');
        assert.equal(await frame.locator('#guess-effect-label').innerText(),'Correct');
        const motion=await frame.locator('#guess-effect').evaluate(n=>({pointerEvents:getComputedStyle(n).pointerEvents,animation:getComputedStyle(n).animationName,ring:getComputedStyle(n,'::before').animationName,aria:n.getAttribute('aria-hidden')}));
        assert.equal(motion.pointerEvents,'none');assert.equal(motion.aria,'true');
        if(reduced){assert.equal(motion.animation,'none');assert.equal(motion.ring,'none');}
        else{assert.equal(motion.animation,'ptbo-answer-pop');assert.equal(motion.ring,'ptbo-answer-ring');}
        const green=await frame.locator('#header').evaluate(n=>getComputedStyle(n).borderColor.match(/\d+/g).map(Number));
        assert.ok(green[1]>green[0],'correct review has a green border');
        await frame.evaluate(()=>{for(const a of document.getAnimations())if(a.animationName?.startsWith('ptbo-answer-')){a.pause();a.currentTime=250;}});
        const overlay=await frame.locator('#guess-effect').boundingBox(),header=await frame.locator('#header').boundingBox(),controls=await frame.locator('#practice-controls').boundingBox();
        const overlap=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
        if(!reduced){assert.equal(overlap(overlay,header),false,'feedback leaves the address readable');assert.equal(overlap(overlay,controls),false,'feedback leaves controls clear');}
        await page.screenshot({path:path.join(out,`${name}-correct.png`)});
        await frame.locator('#practice-continue').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
        await frame.locator('#practice-reveal').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),'revealed');
        assert.equal(await frame.locator('#guess-effect').isVisible(),false);
        await frame.locator('#practice-finish').click();assert.equal(await frame.locator('#game').getAttribute('data-feedback'),null);
        assert.deepEqual(errors,[]);console.log(JSON.stringify({name,pass:true,blur,errors}));
      }catch(e){await page.screenshot({path:path.join(out,`${name}-failure.png`)});throw e;}
      finally{await context.close();}
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
