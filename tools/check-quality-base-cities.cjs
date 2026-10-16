'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),base=(process.argv[2]||'http://127.0.0.1:4188').replace(/\/$/,''),out=path.resolve(process.env.PTBO_QA_OUTPUT||path.join(root,'test-artifacts/quality-audit/after'));
const versionSource=fs.readFileSync(path.join(root,'shared/build-version.js'),'utf8'),version=versionSource.match(/const VERSION = '([^']+)'/)?.[1];assert.ok(version,'current release marker is readable');
const expectedVersion=process.env.PTBO_EXPECTED_VERSION;
fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true}),rows=[],cities=['oshawa','belleville','scarborough','pickering','markham','toronto'];
try{for(const city of cities){
 const context=await browser.newContext({viewport:{width:1100,height:800}});await context.addInitScript(()=>localStorage.setItem('ptboResponseVisualTutorialSeenV1','1'));
 await context.route('https://firestore.googleapis.com/**',route=>route.fulfill({status:403,contentType:'application/json',body:'{"error":{"message":"QA telemetry fixture"}}'}));await context.route('https://cloudflareinsights.com/**',route=>route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 const packageUrl=new URL(`cities/${city}/package.js?v=${version}`,base+'/').href;
 await page.route('**/qa-direct-city.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script src="'+packageUrl+'"></script><script>window.qaParserCity=window.PTBO_CITY_PACKAGE?.id;</script>'}));
 await page.goto(base+'/qa-direct-city.html');assert.equal(await page.evaluate(()=>qaParserCity),city,'direct package is ready for the next parser script');
 const directVersion=await page.evaluate(()=>window.PTBO_BUILD?.version||null);
 await page.goto(base+'/response-simulator/play/?city='+city);await page.locator('#service-choice [data-service=fire]').click({timeout:45000});
 const frame=page.frames().find(f=>f!==page.mainFrame());const receipt=await frame.evaluate(()=>{
  const captures=[];for(const service of ['fire','ems']){PTBO_SERVICE.select(service);for(const base of PTBO_SERVICE.getBases()){const spawned=PTBO_SERVICE.spawn(base.number);captures.push({service,number:base.number,spawned,actual:[simLat,simLng],expected:[base.spawnLat??base.lat,base.spawnLng??base.lng]});}}
  return{city:PTBO_CITY_PACKAGE.id,dispatchAvailable:PTBO_CITY_PACKAGE.dispatch.available,captures};
 });
 assert.equal(await page.evaluate(()=>PTBO_CITY_PACKAGE.id),city,'outer wrapper city package');assert.equal(receipt.city,city);assert.equal(receipt.dispatchAvailable,false);for(const base of receipt.captures){assert.equal(base.spawned,true);assert.ok(Math.abs(base.actual[0]-base.expected[0])<1e-8);assert.ok(Math.abs(base.actual[1]-base.expected[1])<1e-8);}
 const buildVersions=[];for(const frame of page.frames()){try{const observed=await frame.evaluate(()=>window.PTBO_BUILD?.version||null);if(observed)buildVersions.push({url:frame.url(),version:observed});}catch{}}if(directVersion)buildVersions.push({url:'direct-package-fixture',version:directVersion});if(expectedVersion&&buildVersions.some(v=>v.version!==expectedVersion))throw Error(`Expected build ${expectedVersion}; observed ${JSON.stringify(buildVersions)}`);
 assert.equal(errors.length,0,errors.join('; '));rows.push({city,status:'pass',bases:receipt.captures.length,services:['fire','ems'],directParserReady:true,directPackageUrl:packageUrl,currentReleaseVersion:version,buildVersions,telemetryFixture:'Firestore denied and Cloudflare Insights aborted; no live telemetry writes',errors});
 }catch(e){rows.push({city,status:'fail',error:e.message,errors,telemetryFixture:'Firestore denied and Cloudflare Insights aborted; no live telemetry writes'});}
 console.log(JSON.stringify(rows.at(-1)));await context.close();
 }
 fs.writeFileSync(path.join(out,'base-cities.json'),JSON.stringify(rows,null,2));if(rows.some(r=>r.status==='fail'))process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
