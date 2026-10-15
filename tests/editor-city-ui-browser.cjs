/* Production-runtime browser checks on an isolated loopback server; no public gate is changed.
   NODE_PATH=$CODEX_PRIMARY_RUNTIME_NODE_MODULES PLAYWRIGHT_BROWSERS_PATH=/tmp/ptbo-browser-bin node tests/editor-city-ui-browser.cjs */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname),file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{const body=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/json');res.setHeader('Cache-Control','no-store');res.end(body);}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 if(process.env.PTBO_EDITOR_QA_OUTPUT)fs.mkdirSync(process.env.PTBO_EDITOR_QA_OUTPUT,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 async function boot(city='ottawa',viewport={width:1365,height:900},initial={}){
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('https://**/*',route=>route.abort());
  await page.addInitScript(({initial})=>{localStorage.setItem('ptbo-emergency-developer-mode','enabled');for(const [key,value] of Object.entries(initial))if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(value));},{initial});
  await page.goto(`${base}/dispatch-editor/?city=${city}`);await page.waitForFunction(()=>window.PTBO_EDITOR_READY,{timeout:30000});
  assert.ok(await page.evaluate(()=>PTBO_EDITOR_READY),'production city loader must complete');assert.equal(await page.evaluate(()=>PTBO_DISPATCH_STORE.cityId),city);
  return {page,context,errors};
 }
 async function exportData(page){await page.locator('#export-changes').click();const data=JSON.parse(await page.locator('.export-dialog textarea').inputValue());await page.locator('[data-close]').click();return data;}
 async function coverage(page,city){
  const manifest=read(`cities/${city}/route-data.json`),bases=await page.evaluate(()=>PTBO_BASE_STORE.getAll());
  assert.equal(await page.locator('#base-filter option').count(),bases.length+1);
  for(const row of manifest.coverage){
   const station=bases.find(base=>base.service===row.service&&(base.id===row.baseId||base.id===row.service+'-'+row.baseId));assert.ok(station,`${city}: manifest base ${row.baseId}`);
   await page.selectOption('#base-filter',station.id);const ids=await page.locator('.call-item').evaluateAll(nodes=>nodes.map(node=>node.dataset.id));assert.deepEqual(ids.sort(),[...row.callIds].sort(),`${city} ${row.baseId}: filtered calls match manifest`);
   assert.match(await page.locator('#route-coverage-summary').innerText(),/3 of 3 valid/);
  }
  await page.locator('#clear-filters').click();
 }
 try{
  // Every city uses the normal loader, stores and compiled published files.
  const registryPage=await boot();const registry=await registryPage.page.evaluate(()=>PTBO_CITIES.map(city=>({id:city.id,callCount:city.callCount})));assert.equal(registry.length,33);
  assert.equal(await registryPage.page.locator('#city-select option').count(),33);await registryPage.context.close();
  for(const city of registry){const h=await boot(city.id);assert.equal(await h.page.locator('.call-item').count(),city.callCount,city.id+' published count');assert.match(await h.page.locator('#city-summary').innerText(),new RegExp(city.callCount+' published'));await coverage(h.page,city.id);assert.deepEqual(h.errors,[]);await h.context.close();}
  // Actual Peterborough production content must leave a usable record list in both orientations.
  for(const [width,height] of [[1280,720],[1366,768],[390,844],[844,390],[667,375]]){
   const h=await boot('peterborough',{width,height}),p=h.page;
   const layout=await p.evaluate(()=>({listHeight:document.getElementById('call-list').clientHeight,overflow:document.documentElement.scrollWidth>innerWidth}));console.log(JSON.stringify({city:'peterborough',width,height,...layout}));
   assert.ok(layout.listHeight>=100,`Peterborough ${width}x${height}: list height ${layout.listHeight}`);assert.equal(layout.overflow,false);
   await p.locator('.call-item').first().click();assert.equal(await p.locator('#editor').isVisible(),true);await p.locator('#close-editor').click();await p.locator('.call-item').last().click();assert.equal(await p.locator('#editor').isVisible(),true);await p.locator('#close-editor').click();
   assert.deepEqual(h.errors,[]);if(process.env.PTBO_EDITOR_QA_OUTPUT)await p.screenshot({path:path.join(process.env.PTBO_EDITOR_QA_OUTPUT,`peterborough-${width}x${height}.png`)});await h.context.close();
  }
  const h=await boot(),p=h.page;
  const pristine=await exportData(p);for(const type of ['calls','bases','hospital'])assert.deepEqual(pristine[type],{added:[],updated:[],deleted:[]});
  const selected=await p.evaluate(()=>PTBO_DISPATCH_STORE.getAll().find(item=>item.routeChallenges?.length));assert.ok(selected);
  await p.locator(`.call-item[data-id="${selected.id}"]`).click();assert.equal(await p.locator('#route-details').isVisible(),true);await p.locator('#route-details summary').click();assert.match(await p.locator('#route-details-body').innerText(),/Preferred roads:/);
  await p.fill('#f-name','My Ottawa name');await p.locator('#editor button[type="submit"]').click();const renamed=await exportData(p);assert.equal(renamed.calls.updated.length,1);assert.deepEqual(renamed.calls.updated[0].changes,{name:'My Ottawa name'});assert.equal(renamed.calls.added.length,0);assert.equal(renamed.calls.deleted.length,0);
  await p.reload();await p.evaluate(()=>PTBO_EDITOR_READY);const restored=await p.evaluate(id=>PTBO_DISPATCH_STORE.getAll().find(item=>item.id===id),selected.id);assert.equal(restored.name,'My Ottawa name');assert.deepEqual(restored.routeChallenges,selected.routeChallenges);assert.deepEqual(restored.routeAccess,selected.routeAccess);
  await p.selectOption('#city-select','toronto');await p.waitForURL('**/?city=toronto');await p.evaluate(()=>PTBO_EDITOR_READY);assert.equal(await p.evaluate(()=>PTBO_DISPATCH_STORE.getAll().some(item=>item.name==='My Ottawa name')),false);assert.deepEqual(h.errors,[]);await h.context.close();
  // The former empty catalogs must retain user-created calls through their first canonical upgrade.
  for(const city of ['belleville','scarborough']){
   const key='ptboSharedDispatchLocationsV3:'+city,custom={id:'local-custom',name:'My saved custom',addr:'Local address',lat:44.17,lng:-77.38,radius:50,recognitionDifficulty:'hard',custom:true};
   const legacy=await boot(city,undefined,{[key]:{version:3,dataVersion:'1.6.8',items:[custom]}});assert.ok(await legacy.page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().some(item=>item.id==='local-custom'&&item.name==='My saved custom'&&item.recognitionDifficulty==='hard')));assert.equal(await legacy.page.evaluate(key=>JSON.parse(localStorage.getItem(key)).routeMetadataVersion,key),1);await legacy.page.reload();await legacy.page.evaluate(()=>PTBO_EDITOR_READY);assert.ok(await legacy.page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().some(item=>item.id==='local-custom')));assert.deepEqual(legacy.errors,[]);await legacy.context.close();
  }
  const pb=await boot('peterborough'),b=pb.page;const pristinePb=await exportData(b);for(const type of ['calls','bases','hospital'])assert.deepEqual(pristinePb[type],{added:[],updated:[],deleted:[]},'Peterborough pristine '+type);
  const station=await b.evaluate(()=>PTBO_BASE_STORE.getAll().find(base=>PTBO_DISPATCH_STORE.getAll().some(call=>(call.routeChallenges||[]).some(challenge=>challenge.service===base.service&&(challenge.baseId===base.id||challenge.service+'-'+challenge.baseId===base.id)))));assert.ok(station);
  await b.evaluate(id=>PTBO_BASE_STORE.replaceAll(PTBO_BASE_STORE.getAll().map(base=>base.id===id?{...base,name:base.name+' local'}:base)),station.id);await b.selectOption('#base-filter',station.id);assert.match(await b.locator('#route-coverage-summary').innerText(),/3 of 3 valid/);
  await b.evaluate(id=>PTBO_BASE_STORE.replaceAll(PTBO_BASE_STORE.getAll().map(base=>base.id===id?{...base,spawnLat:base.spawnLat+0.00001}:base)),station.id);assert.match(await b.locator('#route-coverage-summary').innerText(),/0 of 3 valid/);assert.match(await b.locator('#route-coverage-summary').innerText(),/need review/);
  const stale=await exportData(b);assert.equal(stale.calls.updated.length,3);assert.ok(stale.calls.updated.every(row=>row.changes.routeChallenges.some(challenge=>challenge.reviewStatus==='stale')));
  await b.reload();await b.evaluate(()=>PTBO_EDITOR_READY);await b.selectOption('#base-filter',station.id);assert.match(await b.locator('#route-coverage-summary').innerText(),/0 of 3 valid/);assert.deepEqual(pb.errors,[]);await pb.context.close();
  console.log('Production editor: all 33 cities, manifest/base coverage, responsive Peterborough lists, pristine/name-only exports, reload evidence, city isolation, legacy custom migration and base invalidation passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
