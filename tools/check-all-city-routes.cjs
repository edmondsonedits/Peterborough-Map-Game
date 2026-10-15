'use strict';
// Production game checks. Local tiles are labeled fixtures; external writes are blocked.
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),{once}=require('node:events'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-artifacts/all-city-routes');fs.mkdirSync(out,{recursive:true});
const registry={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'cities/city-registry.js'),'utf8'),registry);
const ids=process.env.PTBO_ROUTE_QA_CITIES?.split(',')||registry.window.PTBO_CITIES.map(c=>c.id);
async function pointerJourney(page){
 const points=await page.evaluate(()=>{
  const a=PTBO_ROUTE_MAPPING,s=a.state,origin=a.snapRoadAccess(s.startMarker.getLatLng(),260,{base:true}),destination=a.snapRoadAccess(s.callMarker.getLatLng(),520),reference=a.referenceBetween(origin,destination);
  if(!reference)throw Error('No reference for pointer journey');
  const coords=reference.coordinates;s.map.fitBounds(coords,{paddingTopLeft:[60,190],paddingBottomRight:[60,165],animate:false,maxZoom:17});
  return coords.map(ll=>{const p=s.map.latLngToContainerPoint(ll);return{x:p.x,y:p.y};});
 });
 await page.waitForFunction(()=>!PTBO_ROUTE_MAPPING.state.mapZooming);
 async function draw(){await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();await page.waitForFunction(()=>PTBO_ROUTE_MAPPING.state.mode==='editing',null,{timeout:15000});}
 await draw();assert.equal(await page.locator('#undo-button').isEnabled(),true);await page.locator('#undo-button').click();assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.playerRoute),null);
 await draw();await page.locator('#submit-button').click();await page.locator('#results').waitFor({state:'visible'});
 const review=await page.locator('#results').innerText(),before=await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.callCount);assert.match(review,/modeled time/i);assert.match(review,/\d+% (?:efficient|response quality)/);
 await page.locator('#next-button').click();assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.callCount),before+1);assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.mode),'drawing');return{samples:points.length,undo:true,submit:true,next:true,review};
}
(async()=>{
 const server=spawn(process.execPath,[path.join(__dirname,'serve-preview.cjs'),'4198'],{cwd:root});await once(server.stdout,'data');let browser;
 const report={cities:[],errors:[],assetFailures:[],failures:[],tileFixture:true,externalWritesBlocked:true};
 try{
  browser=await chromium.launch({headless:true,...(process.env.PTBO_CHROMIUM_PATH?{executablePath:process.env.PTBO_CHROMIUM_PATH}:{}),args:['--no-sandbox']});
  const ctx=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  await ctx.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,contentType:'application/json',body:'{}'}));
  const tile=r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe4de"/><path d="M0 90H256M90 0V256" stroke="white" stroke-width="12"/><text x="108" y="150" font-size="11" fill="#68776a">QA tile fixture</text></svg>'});
  await ctx.route(/https:\/\/([abc]\.)?tile\.openstreetmap\.org\/.*/,tile);
  for(const id of ids){
   const page=await ctx.newPage(),requested=[];page.on('pageerror',e=>report.errors.push({city:id,error:e.message}));page.on('request',r=>requested.push(r.url()));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4198/')&&r.status()>=400)report.assetFailures.push({city:id,url:r.url(),status:r.status()});});
   try{
    const t=Date.now();await page.goto(`http://127.0.0.1:4198/route-mapping/?city=${id}&analytics=off`);await page.waitForFunction(()=>window.PTBO_ROUTE_MAPPING||!document.querySelector('#loading-error').hidden,null,{timeout:180000});
    assert.equal(await page.locator('#loading-error').isVisible(),false,await page.locator('#loading-error-message').textContent());const bootMs=Date.now()-t;
    const state=await page.evaluate(()=>({city:PTBO_ROUTE_MAPPING.state.cityId,store:PTBO_DISPATCH_STORE.cityId,mode:PTBO_ROUTE_MAPPING.state.mode,calls:PTBO_ROUTE_MAPPING.state.calls.length,nodes:PTBO_ROUTE_MAPPING.state.graph.nodes.length,advanced:PTBO_ROUTE_MAPPING.state.advancedCalls.length,base:PTBO_ROUTE_MAPPING.state.base.id,graphCity:PTBO_ROUTE_NETWORK.cityId}));
    assert.equal(state.city,id);assert.equal(state.store,id);assert.equal(state.graphCity,id);assert.equal(state.mode,'drawing');assert.equal(state.advanced,0);assert.ok(state.nodes>0&&state.calls>0);
    assert.equal(requested.filter(u=>u.includes('/route-network.js')).length,1);assert.ok(requested.find(u=>u.includes(`/cities/${id}/route-network.js`)));assert.ok(!requested.some(u=>u.includes('osm-public-roads.geojson')));
    const services=[];
    for(const service of ['fire','ems']){
     await page.locator('#settings-button').click();await page.selectOption('#service-select',service);await page.locator('#settings-form button[type=submit]').click();
     const result=await page.evaluate(()=>{
      const a=PTBO_ROUTE_MAPPING,s=a.state,c=s.traceCore,origin=a.snapRoadAccess(s.startMarker.getLatLng(),260,{base:true}),destination=a.snapRoadAccess(s.callMarker.getLatLng(),520),reference=a.referenceBetween(origin,destination);if(!reference)return{error:'No reference route'};
      const trace=c.trace([origin,...reference.edges.map(e=>e.end||s.graph.nodes[e.to])],{tolerance:12}),finished=c.finish(trace,destination,40),metrics=PTBO_ROUTE_COST.evaluateRoute(s.graph,finished.edges,a.responseProfile(),null,{baseAccess:true});
      return{service:s.service,baseId:s.base.id,callId:s.call.id,complete:finished.complete,distance:finished.distance,referenceDistance:reference.distance,cost:metrics.cost,referenceCost:reference.cost};
     });
     assert.equal(result.error,undefined,result.error);assert.equal(result.service,service);assert.equal(result.complete,true);assert.ok(Number.isFinite(result.cost)&&result.cost>0);assert.ok(Math.abs(result.distance-result.referenceDistance)<=42,JSON.stringify(result));services.push(result);
    }
    const interaction=['peterborough','oshawa','belleville','scarborough'].includes(id)?await pointerJourney(page):null;
    if(['peterborough','oshawa','toronto','ottawa','belleville','scarborough'].includes(id))await page.screenshot({path:path.join(out,id+'-desktop.png'),fullPage:true});
    const row={id,...state,bootMs,loadMs:Date.now()-t,services,interaction};report.cities.push(row);console.log(JSON.stringify({id,nodes:state.nodes,calls:state.calls,bootMs,loadMs:row.loadMs,pointer:!!interaction}));
   }catch(error){report.failures.push({city:id,error:error.message});console.error(id,error.message);await page.screenshot({path:path.join(out,id+'-failure.png'),fullPage:true}).catch(()=>{});}finally{await page.close();}
  }
  for(const [width,height] of [[1280,720],[390,844],[320,740],[844,390]]){const page=await ctx.newPage();await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4198/route-mapping/?city=oshawa&analytics=off');await page.waitForFunction(()=>window.PTBO_ROUTE_MAPPING,null,{timeout:180000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);assert.equal(await page.locator('#submit-button').isVisible(),true);await page.locator('#settings-button').click();assert.equal(await page.locator('#settings-close').isVisible(),true);await page.screenshot({path:path.join(out,`settings-${width}x${height}.png`),fullPage:true});await page.close();}
  const page=await ctx.newPage();await page.goto('http://127.0.0.1:4198/route-mapping/?city=not-a-city');await page.locator('#loading-error').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>Boolean(window.PTBO_ROUTE_MAPPING)),false);await page.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.assetFailures,[]);assert.deepEqual(report.failures,[]);report.pass=true;
 }finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
 console.log(JSON.stringify({pass:report.pass,cities:report.cities.length,failures:report.failures.length}));
})().catch(error=>{console.error(error);process.exitCode=1;});
