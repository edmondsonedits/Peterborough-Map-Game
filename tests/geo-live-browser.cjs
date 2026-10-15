/* Optional browser QA: PTBO_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/geo-live-browser.cjs http://localhost:4180 */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base=process.argv[2]||'http://localhost:4180',out=process.env.PTBO_GEO_QA_OUTPUT||'/tmp/ptbo-geo-qa';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 try{
  for(const [surface,width,height] of [['desktop',1365,900],['mobile',390,844],['mobile',844,390],['mobile',667,375],['mobile',390,568]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/geo-guesser/'+surface+'/',{waitUntil:'load'});
   const frame=page.frames().find(f=>f.url().includes('/geo-guesser/index.html'));await frame.waitForFunction(()=>window.PTBO_GEO?.state.ready);
   assert.equal(await frame.evaluate(()=>PTBO_GEO.state.locations.length),200);
   await frame.locator('#service-ems').click();await frame.locator('#difficulty-medium').click();await frame.locator('.base-button').first().click();
   // Exercise the real long named catalog entry rather than random short-address luck.
   await frame.evaluate(()=>{const g=PTBO_GEO,c=g.state.locations.find(c=>c.name==='Adam Scott Collegiate and Vocational Institute');g.finish();g.state.locations=[c];g.chooseService('ems');g.chooseDifficulty('medium');g.start(0);});
   const layout=await frame.evaluate(()=>{const g=PTBO_GEO,h=document.getElementById('header').getBoundingClientRect(),r=document.getElementById('reticle').getBoundingClientRect(),m=g.state.map;return{count:g.state.pool.length,base:g.state.base.name,zoom:m.getZoom(),crossVisible:!document.getElementById('call-cross-streets').hidden,overlap:h.left<r.right&&h.right>r.left&&h.top<r.bottom&&h.bottom>r.top};});
   await page.screenshot({path:out+'/guess-'+width+'x'+height+'.png'});assert.equal(layout.overlap,false,'header obscures crosshair at '+width+'x'+height);
   assert.equal(layout.zoom,18);assert.equal(layout.crossVisible,true);
   await frame.locator('#practice-reveal').click();assert.equal(await frame.locator('#practice-continue').isVisible(),true);
   await page.screenshot({path:out+'/review-'+width+'x'+height+'.png'});
   await frame.locator('#practice-continue').click();assert.equal(await frame.evaluate(()=>PTBO_GEO.state.map.getZoom()),18);
   await frame.locator('#practice-finish').click();await frame.locator('.settings-link').click();await frame.locator('#show-cross-streets').uncheck();await frame.locator('#settings .primary').click();
   await frame.locator('.base-button').first().click();assert.equal(await frame.locator('#call-cross-streets').isVisible(),false);await frame.locator('#reveal-cross-streets').click();assert.equal(await frame.locator('#call-cross-streets').isVisible(),true);
   assert.deepEqual(errors,[]);console.log(JSON.stringify({surface,width,height,layout,errors}));await page.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
