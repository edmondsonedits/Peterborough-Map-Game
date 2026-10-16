'use strict';
// Static data + actual browser startup/gameplay + homepage request flow. Never writes live telemetry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=(process.argv[2]||'http://127.0.0.1:4181').replace(/\/$/,''),externalBase=Boolean(process.argv[2]),out=path.resolve(process.env.PTBO_QA_OUTPUT||path.join(root,'test-artifacts/ontario-demos'));
const expectedVersion=process.env.PTBO_EXPECTED_VERSION;fs.mkdirSync(out,{recursive:true});
(async()=>{
 let server=null;if(!externalBase){server=spawn(process.execPath,[path.join(__dirname,'serve-preview.cjs'),'4181'],{cwd:root});await once(server.stdout,'data');}let browser;
 const report={base,localServerStarted:Boolean(server),cities:[],viewports:[],requests:{},errors:[],missing:[],buildVersions:[],externalWritesIntercepted:true,analyticsFixture:'Firestore requests return 403 and Cloudflare Insights requests are aborted'};
 try{
  browser=await chromium.launch({headless:true,...(process.env.PTBO_BROWSER_PROXY?{proxy:{server:process.env.PTBO_BROWSER_PROXY,bypass:'127.0.0.1,localhost'}}:{}),...(process.env.PTBO_CHROMIUM_PATH?{executablePath:process.env.PTBO_CHROMIUM_PATH}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:"reduce",ignoreHTTPSErrors:Boolean(process.env.PTBO_BROWSER_PROXY)});
  await context.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"QA write intercepted"}}'}));
  await context.route('**/cloudflareinsights.com/**',route=>route.abort());
  if(process.env.PTBO_QA_OFFLINE_TILES==='1'){
   report.tileFixture=true;
   await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dae3dc"/><path d="M0 90H256M90 0V256" stroke="white" stroke-width="16"/><text x="120" y="150" font-size="11" fill="#68776a">QA tile fixture</text></svg>'}));
  }
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base+'/')&&r.status()>=400)report.missing.push(r.url());});
  async function captureVersions(){for(const frame of page.frames()){try{const version=await frame.evaluate(()=>window.PTBO_BUILD?.version||null);if(version)report.buildVersions.push({url:frame.url(),version});}catch{}}}
  const ids=fs.readdirSync(path.join(root,'cities')).filter(id=>fs.existsSync(path.join(root,'cities',id,'geo-data.json')));assert.equal(ids.length,30);
  for(const id of ids){
   await page.goto(`${base}/geo-guesser/?city=${id}&analytics=off`);await page.waitForFunction(()=>window.PTBO_GEO?.state.ready);await captureVersions();
   const state=await page.evaluate(()=>{const w=window,a=w.PTBO_GEO,c=w.PTBO_CITY_PACKAGE,results=[];
    for(const service of ['fire','ems'])for(const tier of ['easy','medium','hard']){
     a.chooseService(service);a.chooseDifficulty(tier);const bases=w.PTBO_BASE_STORE.getBases(service);
     for(const i of new Set([0,bases.length-1])){if(!a.start(i))throw Error('Start failed');const t=a.state.target;
      if(a.state.map.distance(a.state.map.getCenter(),[bases[i].lat,bases[i].lng])>1||a.state.map.getZoom()!==18)throw Error('Wrong base '+JSON.stringify({actual:a.state.map.getCenter(),base:bases[i],zoom:a.state.map.getZoom()}));
      a.state.map.setView([t.lat,t.lng],18,{animate:false});if(!a.check())throw Error('Correct guess rejected');
      if(a.state.target!==t)throw Error('Advanced without Next');a.next();if(a.state.map.distance(a.state.map.getCenter(),[bases[i].lat,bases[i].lng])>1||a.state.map.getZoom()!==18)throw Error('Next did not reset');
      a.reveal();a.next();a.finish();}
     results.push({service,tier,count:a.state.pool.length});
    }
    return {city:c.id,calls:a.state.locations.length,bases:w.PTBO_BASE_STORE.getAll().length,results,title:document.title};
   });assert.equal(state.city,id);assert.equal(state.calls,20);assert.equal(state.results.length,6);report.cities.push(state);
  }
  for(const [width,height,surface] of [[1440,900,'desktop'],[390,844,'mobile'],[844,390,'mobile'],[768,1024,'desktop'],[320,740,'mobile']]){
   await page.setViewportSize({width,height});await page.goto(`${base}/geo-guesser/${surface}/?city=toronto&analytics=off`);
   const frame=page.frameLocator('#game-frame');await frame.locator('#service-fire').waitFor();
   await page.waitForFunction(()=>document.getElementById('game-frame')?.contentWindow?.PTBO_GEO?.state.ready);await captureVersions();
   await page.waitForFunction(()=>!document.getElementById('loading')||document.getElementById('loading').classList.contains('hidden'));
   assert.match(await frame.locator('#geo-city-label').innerText(),/Toronto/i);await frame.locator('#service-ems').click();await frame.locator('#difficulty-hard').click();
   await page.screenshot({path:path.join(out,`setup-${width}x${height}.png`),fullPage:true});await frame.locator('#practice-stations button').last().click();
   await frame.locator('#game').waitFor({state:'visible'});
   const gameFrame=page.frames().find(f=>f.url().includes('/geo-guesser/index.html'));
   await gameFrame.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].some(t=>t.complete&&t.naturalWidth>0),null,{timeout:15000});
   const dimensions=await gameFrame.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,width:innerWidth,height:innerHeight,map:PTBO_GEO.state.map.getSize(),tiles:[...document.querySelectorAll('.leaflet-tile')].filter(t=>t.complete&&t.naturalWidth>0).length}));assert.equal(dimensions.overflow,false);assert.ok(dimensions.tiles);
   await page.screenshot({path:path.join(out,`game-${width}x${height}.png`),fullPage:true});await frame.locator('#practice-reveal').click();await page.screenshot({path:path.join(out,`review-${width}x${height}.png`),fullPage:true});report.viewports.push({width,height,surface,...dimensions});
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/?city=ottawa&analytics=off`);await page.waitForFunction(()=>window.PTBO_HOMEPAGE&&document.body.dataset.homeCity==='ottawa');await captureVersions();
  assert.equal(await page.locator('#home-city-select option').count(),33);
  assert.match(await page.locator('#geo-game-link').getAttribute('href'),/city=ottawa/);assert.equal(await page.locator('#route-game-link').getAttribute('href'),null);
  await page.screenshot({path:path.join(out,'homepage-ottawa.png'),fullPage:true});await page.locator('#route-game-link').click();await page.locator('#home-demo-dialog').waitFor({state:'visible'});
  const before=await page.evaluate(()=>PTBO_DEMO_REQUESTS.loadLocalStats());assert.equal(before.demoRequests.total,0);
  await page.locator('#home-demo-close').click();assert.equal(await page.evaluate(()=>PTBO_DEMO_REQUESTS.loadLocalStats().demoRequests.total),0);
  await page.locator('#route-game-link').press('Enter');await page.locator('#home-demo-submit').click();await page.waitForFunction(()=>document.getElementById('home-demo-submit').disabled&&/recorded|saved|sent/i.test(document.getElementById('home-demo-status').textContent));
  const after=await page.evaluate(()=>PTBO_DEMO_REQUESTS.loadLocalStats());assert.equal(after.demoRequests.total,1);assert.match(await page.locator('#home-demo-status').innerText(),/device/i);
  await page.screenshot({path:path.join(out,'request-recorded.png'),fullPage:true});await page.locator('#home-demo-close').click();assert.equal(await page.locator('#route-game-link').evaluate(n=>document.activeElement===n),true);
  await page.goto(`${base}/site-stats/`);await page.waitForFunction(()=>document.body.innerText.includes('Ottawa'));await page.screenshot({path:path.join(out,'stats-local.png'),fullPage:true});report.requests={before,after,visibleInStats:true};
  await page.goto(`${base}/geo-guesser/mobile/?city=made-up&analytics=off`);await page.frameLocator('#game-frame').locator('#load-retry').waitFor({state:'visible'});assert.match(await page.frameLocator('#game-frame').locator('#practice-setup-status').innerText(),/not available/);await captureVersions();
  // Unknown-city handled errors are expected console messages, not uncaught page errors.
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);if(expectedVersion&&report.buildVersions.some(v=>v.version!==expectedVersion))throw Error(`Expected build ${expectedVersion}; observed ${JSON.stringify(report.buildVersions)}`);report.pass=true;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server?.kill();}
 console.log(JSON.stringify({pass:report.pass,cities:report.cities.length,viewports:report.viewports.length,requests:report.requests,errors:report.errors,missing:report.missing}));
})().catch(e=>{console.error(e);process.exitCode=1;});
