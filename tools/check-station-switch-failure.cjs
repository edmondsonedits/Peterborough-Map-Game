'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.STATION_QA_URL||'http://127.0.0.1:4183';
const out=process.env.STATION_QA_OUT||path.resolve('artifacts/station-switch-failure');
const stationTwoModel='**/city-explorer/assets/station2/station2.glb*';
let browser,page,phase='startup',blockStationTwo=true;
const report={base,success:false,errors:[],consoleErrors:[],failed:[],stationTwoResponses:[],requests:[],navigations:[],screenshots:[]};

function pose(truck){return{x:truck.x,y:truck.y,z:truck.z,heading:truck.heading,speed:truck.speed};}
function near(actual,expected,label){assert.ok(Math.abs(actual-expected)<0.02,`${label}: expected ${expected}, got ${actual}`);}
async function screenshot(name){const file=path.join(out,name);await page.screenshot({path:file,fullPage:true});report.screenshots.push(file);}

(async()=>{
 fs.mkdirSync(out,{recursive:true});
 browser=await chromium.launch({headless:true,args:['--use-angle=d3d11']});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});
 page.on('request',request=>report.requests.push({url:request.url(),type:request.resourceType(),phase}));
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())report.navigations.push({url:frame.url(),phase});});
 page.on('response',response=>{
  if(response.url().startsWith(base)&&response.status()>=400&&!response.url().includes('/assets/station2/station2.glb'))
   report.failed.push({url:response.url(),status:response.status()});
 });
 const failOrContinueStationTwo=async route=>{
  if(blockStationTwo){
   report.stationTwoResponses.push({url:route.request().url(),status:503,phase});
   if(phase==='switch-failure')await new Promise(resolve=>setTimeout(resolve,2000));
   await route.fulfill({status:503,contentType:'text/plain',body:'Station 2 model intentionally unavailable for regression'});
  }else await route.continue();
 };
 await page.route(stationTwoModel,failOrContinueStationTwo);
 await page.goto(base+'/city-explorer/?station=1&qa=1&quality=balanced',{waitUntil:'domcontentloaded',timeout:90000});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().canSwitchStations===true,null,{timeout:180000});
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__?.state().emergencyFacilities?.station2?.status==='error',null,{timeout:60000});
 assert.ok(report.stationTwoResponses.some(item=>item.phase==='startup'),'Station 2 static facility preload must receive the intentional 503');
 const baseline=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href,state:globalThis.__PTBO_GAMEPLAY__.state()}));
 report.baseline={timeOrigin:baseline.timeOrigin,stationNumber:baseline.state.stationNumber,mode:baseline.state.mode,truck:pose(baseline.state.truck)};
 assert.equal(baseline.state.stationNumber,1);assert.equal(baseline.state.mode,'onFoot');
 await page.keyboard.press('e');
 await page.waitForFunction(()=>globalThis.__PTBO_GAMEPLAY__.state().mode==='driving',null,{timeout:10000});
 const driving=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href,state:globalThis.__PTBO_GAMEPLAY__.state()}));
 assert.equal(driving.state.stationNumber,1);assert.equal(driving.state.truck.speed,0);
 const documentRequests=report.requests.filter(item=>item.type==='document').length;

 phase='switch-failure';
 await page.selectOption('#station-select','2');
 await page.waitForFunction(()=>__PTBO_GAMEPLAY__.state().transition.busy);
 await page.keyboard.press('e');
 const during=await page.evaluate(()=>__PTBO_GAMEPLAY__.state());
 assert.equal(during.stationNumber,1);assert.equal(during.mode,'driving');
 assert.equal(during.transition.busy,true);
 await page.waitForFunction(()=>{const s=globalThis.__PTBO_GAMEPLAY__?.state();return s?.transition&&!s.transition.busy&&Boolean(s.transition.error);},null,{timeout:60000});
 await page.waitForFunction(()=>document.querySelector('#station-select')?.value==='1'&&document.querySelector('#station-select')?.getAttribute('aria-busy')==='false',null,{timeout:10000});
 const failedState=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href,state:globalThis.__PTBO_GAMEPLAY__.state(),selector:document.querySelector('#station-select').value,status:document.querySelector('#station-select-status')?.textContent}));
 report.failedSwitch={stationNumber:failedState.state.stationNumber,mode:failedState.state.mode,truck:pose(failedState.state.truck),transition:failedState.state.transition,selector:failedState.selector,status:failedState.status};
 assert.equal(failedState.state.stationNumber,1);assert.equal(failedState.state.mode,'driving');assert.equal(failedState.selector,'1');
 assert.match(String(failedState.state.transition.error),/503|station 2|model/i);
 assert.equal(failedState.timeOrigin,driving.timeOrigin);assert.equal(new URL(failedState.url).searchParams.get('station'),'1');
 near(failedState.state.truck.x,driving.state.truck.x,'failed switch truck x');
 near(failedState.state.truck.y,driving.state.truck.y,'failed switch truck y');
 near(failedState.state.truck.z,driving.state.truck.z,'failed switch truck z');
 near(failedState.state.truck.heading,driving.state.truck.heading,'failed switch truck heading');
 assert.equal(failedState.state.truck.speed,0);
 assert.ok(report.stationTwoResponses.some(item=>item.phase==='switch-failure'),'runtime station switch must also receive the intentional 503');
 await screenshot('station2-failure.png');

 await page.unroute(stationTwoModel,failOrContinueStationTwo);blockStationTwo=false;phase='retry-success';
 await page.selectOption('#station-select','2');
 await page.waitForFunction(()=>{const s=globalThis.__PTBO_GAMEPLAY__?.state();return s?.stationNumber===2&&!s.transition?.busy;},null,{timeout:90000});
 const recovered=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href,state:globalThis.__PTBO_GAMEPLAY__.state(),selector:document.querySelector('#station-select').value}));
 assert.equal(recovered.state.stationNumber,2);assert.equal(recovered.state.mode,'driving');assert.equal(recovered.selector,'2');
 assert.equal(recovered.timeOrigin,driving.timeOrigin);assert.equal(new URL(recovered.url).searchParams.get('station'),'2');
 report.retry={stationNumber:recovered.state.stationNumber,mode:recovered.state.mode,transition:recovered.state.transition};
 await screenshot('station2-retry-success.png');

 phase='return-station-one';
 await page.selectOption('#station-select','1');
 await page.waitForFunction(()=>{const s=globalThis.__PTBO_GAMEPLAY__?.state();return s?.stationNumber===1&&!s.transition?.busy;},null,{timeout:90000});
 assert.equal(await page.evaluate(()=>__PTBO_GAMEPLAY__.state().mode),'driving');
 assert.equal(new URL(page.url()).searchParams.get('station'),'1');
 await screenshot('station1-return.png');

 phase='rapid-latest-wins';
 await page.evaluate(()=>{const select=document.querySelector('#station-select');for(const station of ['2','3','1']){select.value=station;select.dispatchEvent(new Event('change',{bubbles:true}));}});
 await page.waitForFunction(()=>{const s=globalThis.__PTBO_GAMEPLAY__?.state();return s?.stationNumber===1&&!s.transition?.busy;},null,{timeout:60000});
 await page.waitForTimeout(500);
 const latest=await page.evaluate(()=>({timeOrigin:performance.timeOrigin,url:location.href,state:globalThis.__PTBO_GAMEPLAY__.state(),selector:document.querySelector('#station-select').value}));
 assert.equal(latest.state.stationNumber,1);assert.equal(latest.state.mode,'driving');assert.equal(latest.selector,'1');
 assert.equal(latest.timeOrigin,driving.timeOrigin);assert.equal(new URL(latest.url).searchParams.get('station'),'1');
 assert.equal(latest.state.transition.error,null);
 // Playwright also reports history.replaceState as a same-document frame navigation.
 // Document requests and timeOrigin distinguish those URL updates from a reload.
 assert.equal(report.requests.filter(item=>item.type==='document').length,documentRequests,'station changes must not request a new document');
 assert.deepEqual(report.failed,[]);
 assert.deepEqual(report.errors,[]);
 report.success=true;
 report.final={stationNumber:latest.state.stationNumber,mode:latest.state.mode,timeOrigin:latest.timeOrigin,selector:latest.selector,transition:latest.state.transition};
 console.log(JSON.stringify({success:report.success,failedSwitch:report.failedSwitch,retry:report.retry,final:report.final,errors:report.errors,failed:report.failed}));
})().catch(async error=>{
 report.error=error?.stack||String(error);
 if(page){try{await screenshot('failure-state.png');}catch{}}
 console.error(error);process.exitCode=1;
}).finally(async()=>{
 try{fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}catch(error){console.error('Could not write station-switch report:',error.message);process.exitCode=1;}
 await browser?.close();
});
