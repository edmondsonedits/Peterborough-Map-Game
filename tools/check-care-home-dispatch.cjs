'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=(process.argv[2]||'http://127.0.0.1:4191').replace(/\/$/,''),out=path.resolve(process.env.PTBO_QA_OUTPUT||'test-artifacts/city-expansion/care-dispatch');fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true}),reports=[];try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1365,height:900},isMobile:mobile,hasTouch:mobile});
  await context.route('https://firestore.googleapis.com/**',r=>r.fulfill({status:403,body:'{}'}));
  await context.addInitScript(()=>localStorage.setItem('ptboResponseVisualTutorialSeenV1','1'));
  const page=await context.newPage(),errors=[],missing=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)missing.push(r.status()+' '+r.url());});
  await page.goto(base+`/response-simulator/${mobile?'mobile':'play'}/?city=peterborough&analytics=off`);
  await page.locator('[data-service="ems"]').click({timeout:45000});
  const frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>window.PTBO_SERVICE?.state.selected&&(window.PTBO_EMS_PRIORITY||parent.PTBO_EMS_PRIORITY));
  await page.waitForTimeout(1300);const skip=page.getByRole('button',{name:'Skip',exact:true});if(await skip.isVisible().catch(()=>false))await skip.click();
  await frame.evaluate(()=>{for(const box of document.querySelectorAll('.filter-chk'))box.checked=box.dataset.sub==='Medical Assistance';});
  await frame.locator('#hud-action-btn').click();await frame.waitForFunction(()=>simulationState===STATES.ENROUTE);
  const report=await frame.evaluate(()=>({city:PTBO_CITY_PACKAGE.id,service:mission.service,version:PTBO_BUILD.version,call:{id:activeIncident.id,name:activeIncident.name,sub:activeIncident.sub,facilityType:activeIncident.facilityType,trainingServices:activeIncident.trainingServices}}));
  assert.equal(report.call.facilityType,'long-term-care');assert.equal(report.service,'ems');assert.equal(report.call.sub,'Medical Assistance');
  await frame.evaluate(()=>{document.getElementById('ptbo-simulated-incident-disclosure')?.remove();PTBO_SIMULATED_INCIDENT_NOTICE.install();});
  await page.waitForTimeout(100);
  assert.equal(await frame.locator('#ptbo-simulated-incident-disclosure').count(),1,'one incident notice leaves the driving playfield clear');
  await page.waitForFunction(version=>document.getElementById('ptbo-build-badge')?.textContent==='v'+version,report.version);
  assert.equal(await page.locator('#ptbo-build-badge').textContent(),'v'+report.version);
  await page.screenshot({path:path.join(out,(mobile?'phone':'desktop')+'-care-home.png')});
  await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
  await frame.waitForFunction(()=>simulationState===STATES.TRANSPORTING,null,{timeout:15000});
  await frame.evaluate(()=>{simLat=activeArrivalPoint.lat;simLng=activeArrivalPoint.lng;evaluateDistanceToTarget();});
  await frame.waitForFunction(()=>simulationState===STATES.INSERVICE);
  assert.equal(await frame.evaluate(()=>mission.phase),'complete');assert.equal(await frame.evaluate(()=>totalTrackedCalls),1);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);if(process.env.PTBO_EXPECTED_VERSION)assert.equal(report.version,process.env.PTBO_EXPECTED_VERSION);
  reports.push({...report,mobile,pass:true,arrivalPositionsSetByTest:true,filterFixture:'Medical Assistance only',noticeRemountFixture:true});
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({base,reports,physicalDevice:false},null,2));console.log(JSON.stringify(reports.at(-1)));await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
