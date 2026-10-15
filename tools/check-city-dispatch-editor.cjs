'use strict';
// Full production boot and city isolation. External writes never reach production.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),{once}=require('node:events'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/city-editor');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const server=spawn(process.execPath,[path.join(__dirname,'serve-preview.cjs'),'4190'],{cwd:root});await once(server.stdout,'data');let browser;
 const result={cities:[],errors:[],missing:[],writesIntercepted:true,tileFixture:true};
 try{
  browser=await chromium.launch({headless:true,...(process.env.PTBO_CHROMIUM_PATH?{executablePath:process.env.PTBO_CHROMIUM_PATH}:{})});
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await ctx.addInitScript(()=>localStorage.setItem('ptbo-emergency-developer-mode','enabled'));
  await ctx.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,contentType:'application/json',body:'{}'}));
  const tile=r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe4de"/><path d="M0 90H256M90 0V256" stroke="white" stroke-width="16"/><text x="105" y="150" font-size="11" fill="#68776a">QA tile fixture</text></svg>'});
  await ctx.route('https://tile.openstreetmap.org/**',tile);await ctx.route('https://server.arcgisonline.com/**',tile);
  const page=await ctx.newPage(),requests=[];page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4190/')&&r.status()>=400)result.missing.push(r.url());});
  await page.goto('http://127.0.0.1:4190/dispatch-editor/?city=peterborough&analytics=off');await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);
  const registry=await page.evaluate(()=>PTBO_CITIES.map(city=>({id:city.id,callCount:city.callCount,geo:city.modes?.geo===true}))),cityIds=registry.map(city=>city.id);
  let total=0;
  for(const id of cityIds){
   requests.length=0;await page.goto(`http://127.0.0.1:4190/dispatch-editor/?city=${id}&analytics=off`);await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);
   const city=registry.find(city=>city.id===id),expected=city.callCount;
   assert.equal(await page.locator('.call-item').count(),expected,id);assert.equal(await page.locator('.leaflet-marker-icon').count(),expected,id);assert.equal(await page.inputValue('#city-select'),id);
   assert.equal(await page.locator('#city-select option').count(),33);const store=await page.evaluate(()=>({city:PTBO_DISPATCH_STORE.cityId,ids:PTBO_DISPATCH_STORE.getAll().map(x=>x.id),count:PTBO_DISPATCH_STORE.getAll().length}));assert.equal(store.city,id);assert.equal(store.count,expected);total+=expected;
   for(const [tier,count]of [['easy',id==='peterborough'?100:city.geo?10:0],['medium',id==='peterborough'?50:city.geo?5:0],['hard',id==='peterborough'?50:city.geo?5:0]]){await page.selectOption('#difficulty-filter',tier);assert.equal(await page.locator('.call-item').count(),count,`${id} ${tier}`);assert.equal(await page.locator('.leaflet-marker-icon').count(),count);}
   await page.locator('#clear-filters').click();await page.locator('#export-changes').click();const exported=JSON.parse(await page.locator('.export-dialog textarea').inputValue());assert.equal(exported.cityId,id);for(const key of ['calls','bases','hospital'])assert.deepEqual(exported[key],{added:[],updated:[],deleted:[]},`${id} untouched ${key}`);await page.locator('[data-close]').click();
   if(id!=='peterborough')assert.ok(!requests.some(url=>url.includes('osm-public-roads.geojson')),id+' cannot load Peterborough roads');
   const fetched=requests.filter(url=>url.includes('/geo-data.json'));if(id!=='peterborough'){assert.equal(fetched.length,1);assert.ok(fetched[0].includes(`/cities/${id}/`));}
   result.cities.push({id,count:expected,isolated:true});
  }
  assert.equal(total,registry.reduce((sum,city)=>sum+city.callCount,0));
  await page.goto('http://127.0.0.1:4190/dispatch-editor/?city=peterborough&analytics=off');await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);
  await page.locator('[data-mode="hospital"]').click();await page.locator('.call-item').click();const width=Number(await page.inputValue('#h-area-width'));await page.fill('#h-area-width',String(width+1));await page.waitForFunction(w=>PTBO_BASE_STORE.getHospital().areaWidth===w,width+1);
  await page.locator('#export-changes').click();const draftExport=JSON.parse(await page.locator('.export-dialog textarea').inputValue());assert.deepEqual(draftExport.hospital,{added:[],updated:[],deleted:[]},'export excludes unsaved hospital preview');assert.equal(await page.inputValue('#h-area-width'),String(width+1),'export preserves draft');await page.locator('[data-close]').click();page.once('dialog',d=>d.accept());await page.locator('#cancel-base').click();
  result.savedHospitalExport=true;

  await page.goto('http://127.0.0.1:4190/dispatch-editor/?city=ottawa&analytics=off');await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);
  await page.locator('.call-item').first().click();const original=await page.inputValue('#f-name');await page.fill('#f-name',original+' QA saved');await page.fill('#f-cross-1','QA Cross Street');await page.selectOption('#f-recognition','hard');await page.locator('#editor button[type=submit]').click();
  const saved=await page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().find(x=>x.name.endsWith(' QA saved')));assert.ok(saved);const storedOttawa=await page.evaluate(()=>localStorage.getItem('ptboSharedDispatchLocationsV3:ottawa'));
  await page.selectOption('#city-select','toronto');await page.waitForURL('**/?city=toronto**');await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);assert.equal(await page.locator('.call-item').filter({hasText:' QA saved'}).count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('ptboSharedDispatchLocationsV3:ottawa')),storedOttawa);
  await page.goto('http://127.0.0.1:4190/geo-guesser/?city=ottawa&analytics=off');await page.waitForFunction(()=>window.PTBO_GEO?.state.ready);const gameCall=await page.evaluate(id=>PTBO_GEO.state.locations.find(x=>x.id===id),saved.id);assert.equal(gameCall.name,saved.name);assert.equal(gameCall.crossStreets[0],'QA Cross Street');assert.equal(gameCall.recognitionDifficulty,'hard');result.roundTrip=true;
  for(const [width,height]of [[1440,900],[1280,720],[1366,768],[390,844],[320,740],[844,390]]){await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4190/dispatch-editor/?city=toronto&analytics=off');await page.waitForFunction(()=>window.PTBO_EDITOR_UI_READY);await page.evaluate(()=>PTBO_EDITOR_UI_READY);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.ok(await page.locator('#call-list').evaluate(n=>n.clientHeight>80));await page.screenshot({path:path.join(out,`editor-${width}x${height}.png`),fullPage:true});}
  await page.goto('http://127.0.0.1:4190/dispatch-editor/?city=not-real&analytics=off');await page.locator('#editor-load-retry').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>Boolean(window.PTBO_DISPATCH_STORE)),false);
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.missing,[]);result.pass=true;result.total=total;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(result,null,2));await browser?.close();server.kill();}
 console.log(JSON.stringify({pass:result.pass,cities:result.cities.length,total:result.total,roundTrip:result.roundTrip,errors:result.errors,missing:result.missing}));
})().catch(e=>{console.error(e);process.exitCode=1;});
