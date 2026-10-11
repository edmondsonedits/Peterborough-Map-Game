'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:4188',out=path.resolve('test-artifacts/quality-audit/after');
fs.mkdirSync(out,{recursive:true});
(async()=>{
const only=process.env.PTBO_QA_ONLY?.split(',');
const browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']}),reports=fs.existsSync(path.join(out,'journeys.json'))?JSON.parse(fs.readFileSync(path.join(out,'journeys.json'))):[];
async function journey(name,mobile,fn,setup){
 if(only&&!only.includes(name))return;
 const previous=reports.findIndex(r=>r.name===name);if(previous>=0)reports.splice(previous,1);
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[],missing=[];page.setDefaultTimeout(15000);
 await context.route('https://firestore.googleapis.com/**', route => route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:{status:'PERMISSION_DENIED',message:'Local analytics fixture'}})}));
 page.on('pageerror',e=>errors.push(e.stack||e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.status()+' '+r.url());});
 try{if(setup)await setup(context,page);const detail=await fn(page,context);assert.equal(errors.length,0,errors.join('; '));assert.equal(missing.length,0,missing.join('; '));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');reports.push({name,status:'pass',detail,errors,missing,analyticsWritesIntercepted:true});}
 catch(e){reports.push({name,status:'fail',error:e.message,errors,missing});}
 await page.screenshot({path:path.join(out,name+'.png'),fullPage:true}).catch(()=>{});
 console.log(JSON.stringify(reports.at(-1)));await context.close();
}
await journey('launcher',false,async page=>{await page.goto(base);return{links:await page.locator('a[href]').count(),version:await page.evaluate(()=>window.PTBO_BUILD.version)};});
await journey('route',false,async page=>{
 await page.goto(base+'/route-mapping/');await page.waitForFunction(()=>window.PTBO_ROUTE_MAPPING,{timeout:30000});
 await page.locator('#settings-button').click();assert.equal(await page.locator('#settings-sheet').evaluate(e=>e.open),true);
 await page.keyboard.press('Escape');assert.equal(await page.locator('#settings-sheet').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#settings-button').evaluate(e=>e===document.activeElement),true);
 const points=await page.evaluate(()=>{
  const a=PTBO_ROUTE_MAPPING,s=a.state,base={lat:Number(s.base.spawnLat||s.base.lat),lng:Number(s.base.spawnLng||s.base.lng)},call=s.call;
  const origin=a.nearestRoad(base.lat,base.lng,220),dest=a.nearestRoad(call.lat,call.lng,520),route=a.pathBetween(origin.nodeId,dest.nodeId,'distance');
  const coordinates=[base,...route.nodeIds.map(id=>s.graph.nodes[id]),call].map(n=>[n.lat,n.lng]);
  s.map.fitBounds(coordinates,{paddingTopLeft:[50,160],paddingBottomRight:[50,160],animate:false});
  return coordinates.map(ll=>{const p=s.map.latLngToContainerPoint(ll);return{x:p.x,y:p.y};});
 });
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points.at(-1).x,points.at(-1).y,{steps:4});
 await page.locator('#draw-surface').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.mode),'drawing');assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.rawPoints.length),0);
 await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(p.x,p.y);await page.mouse.up();
 await page.waitForFunction(()=>PTBO_ROUTE_MAPPING.state.mode==='editing',null,{timeout:10000});
 await page.locator('#submit-button').click();await page.waitForFunction(()=>PTBO_ROUTE_MAPPING.state.mode==='results');
 const review=await page.locator('#results').innerText();assert.match(review,/ROUTE REVIEW/);await page.locator('#next-button').click();
 assert.equal(await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.callCount),2);
 return{review,cancelDiscarded:true,settingsFocusRestored:true,graphNodes:await page.evaluate(()=>PTBO_ROUTE_MAPPING.state.graph.nodes.length)};
});
async function geoGame(page,mobile){
 await page.goto(base+'/geo-guesser/');await page.waitForFunction(()=>window.PTBO_GEO_MAP_PROVIDER?.readiness().ready);
 await page.getByRole('button',{name:'Play',exact:true}).click();await page.getByRole('button',{name:'Choose Game Mode'}).click();
 await page.locator('[onclick="selectMode(\'random\')"]').click();await page.locator('#stations button').first().click();
 for(let i=0;i<10;i++){
  await page.locator('[onclick="startDispatch()"]').click();
  await page.waitForFunction(()=>!map._animatingZoom);
  await page.evaluate(()=>{map.stop();map.setView([target.lat,target.lng],16,{animate:false,reset:true});});
  await page.waitForFunction(()=>!map._animatingZoom&&meters(map.getCenter().lat,map.getCenter().lng,target.lat,target.lng)<2);
  await page.locator('#confirm').click();assert.equal(await page.evaluate(()=>Number(history.at(-1).penalty)),0,'centred guess has no penalty');await page.locator('#next-call').click();
 }
 assert.equal(await page.evaluate(()=>history.length),10);assert.equal(await page.evaluate(()=>sessionEnded),true);
 await page.locator('#player').fill('QA local');
 await page.locator('#score-row button').click();
 const scoreCount=await page.evaluate(()=>readLocalScores().length);
 await page.evaluate(()=>saveScore());assert.equal(await page.evaluate(()=>readLocalScores().length),scoreCount);
 return{rounds:10,scoreCount,deduplicated:true,mobile};
}
await journey('geo-desktop',false,p=>geoGame(p,false));
await journey('geo-mobile',true,p=>geoGame(p,true));
for(const surface of ['desktop','mobile','online'])await journey('geo-'+surface+'-offline-scoreboard',surface==='mobile',async page=>{
 await page.goto(base+'/geo-guesser/'+surface+'/');const frame=page.frameLocator('#game-frame');
 await frame.locator('#menu').waitFor();await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.geoScoreboardFailure);
 await page.waitForTimeout(1200);
 const f=page.frames().find(f=>f!==page.mainFrame());await f.waitForFunction(()=>window.PTBO_GEO_MAP_PROVIDER?.readiness().ready);
 await f.evaluate(()=>{selectMode('open');start(0);startDispatch();map.setView([target.lat,target.lng],16,{animate:false});confirmGuess();endOpenDrill();});
 assert.match(await frame.locator('#result-title').innerText(),/Drill Complete/);
 await f.evaluate(()=>showPersonalScores());assert.match(await frame.locator('#scores').innerText(),/Scoreboard error/);
 return{practiceUsable:true,externalSdkBlocked:true};
},async context=>{await context.route('https://www.gstatic.com/firebasejs/**',r=>r.abort());});
for(const service of ['fire','ems'])await journey('response-'+service,service==='ems',async page=>{
 await page.addInitScript(()=>localStorage.setItem('ptboResponseVisualTutorialSeenV1','1'));
 await page.goto(base+(service==='ems'?'/response-simulator/mobile/':'/response-simulator/play/')+'?city=peterborough');
 await page.locator('#service-choice [data-service="'+service+'"]').click({timeout:45000});
 const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>window.PTBO_SERVICE?.state.selected);
 await page.waitForTimeout(1200);
 const skip=page.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
 const initial=await frame.evaluate(()=>({lat:simLat,lng:simLng,service:PTBO_SERVICE.state.mode}));
 if(service==='ems'){const box=await page.locator('#steering').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2-38);await page.waitForTimeout(900);await page.mouse.up();}
 else{await page.locator('iframe').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(900);await page.keyboard.up('KeyW');}
 const moved=await frame.evaluate(()=>({lat:simLat,lng:simLng}));
 assert.ok(Math.hypot(moved.lat-initial.lat,moved.lng-initial.lng)>0,'intended control drives selected service');
 await frame.evaluate(()=>dispatchEvent(new Event('blur')));await page.waitForTimeout(150);
 await frame.locator('#hud-action-btn').click();
 await frame.waitForFunction(()=>simulationState===STATES.ENROUTE);
 const incident=await frame.evaluate(()=>({service:mission.service,phase:mission.phase,type:activeIncident.main,sub:activeIncident.sub,filterEnabled:[...document.querySelectorAll('.filter-chk:checked')].some(box=>box.dataset.sub===activeIncident.sub)}));
 assert.equal(incident.service,service);assert.equal(incident.filterEnabled,true,'dispatch respects selected call types');
 await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
 await frame.waitForFunction(()=>simulationState===STATES.ONSCENE);
 if(service==='ems'){
  await frame.waitForFunction(()=>simulationState===STATES.TRANSPORTING,null,{timeout:10000});
  await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
 }
 await frame.waitForFunction(()=>simulationState===STATES.INSERVICE,null,{timeout:10000});
 const completion=await frame.evaluate(()=>({phase:mission.phase,calls:totalTrackedCalls,hospital:mission.hospital?.name}));
 assert.equal(completion.phase,'complete');assert.equal(completion.calls,1);
 return{initial,moved,service,incident,completion,arrivalPositionsSetByTest:true};
});
await journey('dispatch-editor',false,async page=>{
 await page.goto(base+'/dispatch-editor/');await page.waitForFunction(()=>document.querySelector('#call-list')?.children.length>0);
 const count=await page.locator('#call-list button').count();await page.locator('#call-list button').first().click();
 const name=page.locator('#f-name');const original=await name.inputValue();await name.fill(original+' QA');
 await page.locator('#editor button[type=submit]').click();
 await page.reload();await page.locator('#search').fill(original+' QA');await page.locator('#call-list button').first().click();
 assert.equal(await page.locator('#f-name').inputValue(),original+' QA');
 for(const mode of ['bases','hospital','calls'])await page.locator('[data-mode="'+mode+'"]').click();
 return{calls:count,persistedLocalEdit:true,serviceTabs:true};
},async context=>{await context.addInitScript(()=>localStorage.setItem('ptbo-emergency-developer-mode','enabled'));});
await journey('tunnel',true,async page=>{
 await page.goto(base+'/tunnel-break/');await page.waitForFunction(()=>window.TunnelBreakDebug);
 await page.evaluate(()=>TunnelBreakDebug.start());const board=await page.locator('#board').boundingBox();
 await page.mouse.move(board.x+board.width/2,board.y+board.height/2);await page.mouse.down();
 await page.locator('#board').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 await page.evaluate(()=>TunnelBreakDebug.forceWin());await page.locator('#modalLayer').waitFor();
 await page.locator('[data-maze]').click();await page.evaluate(()=>TunnelBreakDebug.fpFreeze());
 const moved=await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));const a=TunnelBreakDebug.fpPose();TunnelBreakDebug.fpTick(.15);const b=TunnelBreakDebug.fpPose();window.dispatchEvent(new Event('blur'));TunnelBreakDebug.fpTick(.15);const c=TunnelBreakDebug.fpPose();return{a,b,c};});
 assert.equal(moved.b.x,moved.c.x);assert.equal(moved.b.y,moved.c.y);
 await page.locator('#pauseBtn').click();assert.equal(await page.locator('#modalLayer').evaluate(e=>e.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#modalLayer').evaluate(e=>e.open),false);
 return{boardCancelDiscards:true,blurClearsMazeInput:true,modalEscape:true};
});
fs.writeFileSync(path.join(out,'journeys.json'),JSON.stringify(reports,null,2));await browser.close();if(reports.some(r=>r.status==='fail'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
