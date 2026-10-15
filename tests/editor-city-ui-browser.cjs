/* Focused real-browser UI checks: PTBO_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/editor-city-ui-browser.cjs */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
 const file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{let body=fs.readFileSync(file);if(pathname==='/dispatch-editor/'&&url.searchParams.has('fixture'))body=Buffer.from(body.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''));res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/json');res.end(body);}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 if(process.env.PTBO_EDITOR_QA_OUTPUT)fs.mkdirSync(process.env.PTBO_EDITOR_QA_OUTPUT,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PTBO_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
 async function boot(city='ottawa',viewport={width:1365,height:900}){
  const page=await browser.newPage({viewport}),errors=[],roads=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('osm-public-roads'))roads.push(req.url());});
  await page.route('https://**/*',route=>route.abort());
  await page.goto(`${base}/dispatch-editor/?city=${city}&v=1.6.110&fixture=1`);
  for(const file of ['cities/city-registry.js','response-simulator/vendor/leaflet-1.9.4/leaflet.js','shared/location-changes.js'])await page.addScriptTag({url:base+'/'+file});
  const pack=JSON.parse(read('cities/ottawa/geo-data.json'));
  if(city==='peterborough'){pack.locations=JSON.parse(zlib.gunzipSync(Buffer.from(read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1],'base64')));pack.map=JSON.parse(read('cities/peterborough/city.json')).map;}
  await page.evaluate(({pack,city})=>{
   const profiles=Object.fromEntries(['fire','ems'].map(service=>[service,{id:service,bases:pack.bases.filter(x=>x.service===service&&x.status==='active'&&x.selectionEligible)}]));
   window.PTBO_CITY_PACKAGE={id:city,name:city==='peterborough'?'Peterborough':city==='ottawa'?'Ottawa':'Belleville',map:pack.map,features:{geoGuesser:city==='ottawa',baseTraining:false}};
   window.PTBO_SERVICE_CONFIG={profiles,hospital:null};window.PTBO_STATIONS=profiles.fire.bases;
   window.PTBO_EDITOR_CAPABILITIES={bases:false,hospital:false};
   window.PTBO_DISPATCH_DATA_VERSION='ontario-geo-1';window.PTBO_DISPATCH_DATA_READY=Promise.resolve(city!=='belleville'?pack.locations:[]);
  },{pack,city});
  if(city==='peterborough')await page.addScriptTag({url:base+'/cities/peterborough/package.js'});
  for(const file of ['shared/base-locations.js','shared/dispatch-locations.js','dispatch-editor/editor.js'])await page.addScriptTag({url:base+'/'+file+'?city='+city});
  await page.evaluate(()=>window.PTBO_EDITOR_UI_READY||PTBO_DISPATCH_STORE.ready());
  return {page,errors,roads};
 }
 try{
  for(const [width,height] of [[1280,720],[1366,768],[844,390],[667,375]])for(const city of ['ottawa','peterborough']){
   const fixture=await boot(city,{width,height}),p=fixture.page;
   const layout=await p.evaluate(()=>{const list=document.getElementById('call-list'),r=list.getBoundingClientRect();return {height:list.clientHeight,top:r.top,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
   console.log(JSON.stringify({city,width,height,layout}));
   assert.ok(layout.height>=100,`${city} ${width}×${height}: call list needs room for an accessible row; got ${layout.height}px`);
   assert.equal(layout.overflow,false);await p.locator('.call-item').first().click({timeout:2000});assert.equal(await p.locator('#editor').isVisible(),true);
   await p.locator('#close-editor').click();await p.locator('.call-item').last().click({timeout:2000});assert.equal(await p.locator('#editor').isVisible(),true);
   assert.deepEqual(fixture.errors,[]);if(process.env.PTBO_EDITOR_QA_OUTPUT)await p.screenshot({path:path.join(process.env.PTBO_EDITOR_QA_OUTPUT,city+'-'+width+'x'+height+'.png')});await p.close();
  }
  const {page,errors,roads}=await boot();
  assert.equal(await page.locator('#city-select').count(),1,'selected-city control must exist');
  const options=await page.locator('#city-select option').evaluateAll(nodes=>nodes.map(n=>({id:n.value,text:n.textContent})));
  assert.equal(options.length,33);assert.equal(options[0].id,'peterborough');assert.match(options[0].text,/200/);
  assert.match(options.find(x=>x.id==='ottawa').text,/20/);assert.match(options.find(x=>x.id==='belleville').text,/0/);
  assert.deepEqual(options.slice(1).map(x=>x.text.split(' · ')[0]),options.slice(1).map(x=>x.text.split(' · ')[0]).sort((a,b)=>a.localeCompare(b)));
  assert.equal(await page.locator('.call-item').count(),20);assert.equal(await page.locator('.leaflet-marker-icon').count(),20);
  await page.locator('#export-changes').click();const pristine=JSON.parse(await page.locator('.export-dialog textarea').inputValue());for(const type of ['calls','bases','hospital'])assert.deepEqual(pristine[type],{added:[],updated:[],deleted:[]},'unchanged '+type+' export must be empty');await page.locator('[data-close]').click();
  if(process.env.PTBO_EDITOR_QA_OUTPUT){fs.mkdirSync(process.env.PTBO_EDITOR_QA_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.PTBO_EDITOR_QA_OUTPUT,'desktop.png')});}
  assert.equal(await page.locator('.call-item').filter({hasText:'Ottawa'}).count(),20);assert.equal(await page.locator('.call-item').filter({hasText:'Shared address'}).count(),20);
  for(const [tier,count] of [['easy',10],['medium',5],['hard',5],['unranked',0]]){await page.selectOption('#difficulty-filter',tier);assert.equal(await page.locator('.call-item').count(),count);assert.equal(await page.locator('.leaflet-marker-icon').count(),count);}
  await page.locator('#clear-filters').click();assert.equal(await page.locator('.call-item').count(),20);
  await page.fill('#search','Rochester Street');assert.equal(await page.locator('.call-item').count(),1);assert.match(await page.locator('.call-item').innerText(),/Plant Recreation Centre/);
  await page.fill('#search','no location matches');assert.equal(await page.locator('.leaflet-marker-icon').count(),0);assert.match(await page.locator('#empty-state').innerText(),/No matching/);
  await page.locator('#clear-filters').click();assert.equal(await page.locator('.call-item').count(),20);
  await page.locator('[data-mode="bases"]').click();await page.locator('.call-item').first().click();assert.equal(await page.locator('#base-editor').isVisible(),false);assert.equal(await page.locator('#add-call').isVisible(),false);assert.equal(await page.locator('.leaflet-marker-draggable').count(),0);assert.match(await page.locator('#editor-notice').innerText(),/reference/i);
  assert.equal(await page.locator('[data-mode="hospital"]').isDisabled(),true);assert.deepEqual(roads,[],'unsupported cities cannot fetch Peterborough roads');
  await page.locator('[data-mode="calls"]').click();await page.locator('.call-item').first().click();assert.equal(await page.locator('#f-main').isVisible(),false);assert.equal(await page.locator('#f-district').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),true,'selecting a saved call does not block unload');
  await page.fill('#f-name','My Ottawa draft');assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false,'a changed draft guards unload');const markerCount=await page.locator('.leaflet-marker-icon').count();let prompts=0;
  page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});await page.selectOption('#city-select','toronto');assert.equal(prompts,1);assert.equal(await page.inputValue('#city-select'),'ottawa');assert.equal(await page.inputValue('#f-name'),'My Ottawa draft');assert.equal(await page.locator('.leaflet-marker-icon').count(),markerCount);
  await page.selectOption('#f-recognition','hard');await page.fill('#f-cross-1','Local Cross Street');await page.locator('#editor button[type="submit"]').click();
  const saved=await page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().find(x=>x.name==='My Ottawa draft'));assert.ok(saved,await page.locator('#save-status').innerText());assert.equal(saved.recognitionDifficulty,'hard');assert.equal(saved.crossStreets[0],'Local Cross Street');assert.equal(saved.district,undefined);
  await page.locator('#export-changes').click();const data=JSON.parse(await page.locator('.export-dialog textarea').inputValue());assert.equal(data.cityId,'ottawa');assert.equal(data.cityName,'Ottawa');assert.deepEqual(data.hospital,{added:[],updated:[],deleted:[]});assert.equal(data.calls.updated.length,1);assert.equal(data.calls.updated[0].changes.name,'My Ottawa draft');
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-download]').click();assert.equal((await downloadPromise).suggestedFilename(),'ottawa-location-changes.json');await page.locator('[data-close]').click();
  await page.locator('#close-editor').click();await page.locator('#add-call').click();await page.locator('#map').click({position:{x:100,y:100}});assert.equal(await page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().length),20,'new placement remains an unsaved draft');
  await page.locator('#editor button[type="submit"]').click();assert.equal(await page.evaluate(()=>PTBO_DISPATCH_STORE.getAll().length),21);assert.match(await page.locator('#visible-count').innerText(),/21/);
  await page.locator('#close-editor').click();await page.locator('.call-item').first().click();await page.selectOption('#city-select','toronto');assert.equal(prompts,1,'a selected saved call must not prompt');await page.waitForURL('**/?city=toronto&v=1.6.110&fixture=1');
  assert.deepEqual(errors,[]);await page.close();
  const confirmed=await boot();await confirmed.page.locator('.call-item').first().click();await confirmed.page.fill('#f-name','Confirmed dirty switch');let accepted=0;confirmed.page.on('dialog',async dialog=>{accepted++;await dialog.accept();});await confirmed.page.selectOption('#city-select','toronto');await confirmed.page.waitForURL('**/?city=toronto&v=1.6.110&fixture=1');assert.equal(accepted,1,'confirmed city switching must not add a second unload prompt');assert.deepEqual(confirmed.errors,[]);await confirmed.page.close();
  const empty=await boot('belleville',{width:390,height:844});assert.equal(await empty.page.locator('.call-item').count(),0);assert.match(await empty.page.locator('#empty-state').innerText(),/Belleville.*published calls/);assert.match(await empty.page.locator('#city-summary').innerText(),/0/);assert.deepEqual(empty.errors,[]);if(process.env.PTBO_EDITOR_QA_OUTPUT)await empty.page.screenshot({path:path.join(process.env.PTBO_EDITOR_QA_OUTPUT,'mobile-empty.png')});await empty.page.close();
  const mobile=await boot('ottawa',{width:390,height:844});assert.equal(await mobile.page.locator('#city-select').isVisible(),true);assert.equal(await mobile.page.locator('.call-item').first().isVisible(),true);assert.equal(await mobile.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(process.env.PTBO_EDITOR_QA_OUTPUT)await mobile.page.screenshot({path:path.join(process.env.PTBO_EDITOR_QA_OUTPUT,'mobile.png')});await mobile.page.close();
  console.log('Editor city UI: options, tiers, shared labels, marker filtering, cross streets, readonly bases, null hospital, dirty switch, saves, new drafts and city export passed.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
