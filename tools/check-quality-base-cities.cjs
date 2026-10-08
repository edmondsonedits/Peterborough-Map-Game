'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true}),rows=[],cities=['oshawa','belleville','scarborough','pickering','markham','toronto'];
try{for(const city of cities){
 const context=await browser.newContext({viewport:{width:1100,height:800}});await context.addInitScript(()=>localStorage.setItem('ptboResponseVisualTutorialSeenV1','1'));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.route('**/qa-direct-city.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><script src="/cities/'+city+'/package.js?v=1.6.99"></script><script>window.qaParserCity=window.PTBO_CITY_PACKAGE?.id;</script>'}));
 await page.goto('http://127.0.0.1:4188/qa-direct-city.html');assert.equal(await page.evaluate(()=>qaParserCity),city,'direct package is ready for the next parser script');
 await page.goto('http://127.0.0.1:4188/response-simulator/play/?city='+city);await page.locator('#service-choice [data-service=fire]').click({timeout:45000});
 const frame=page.frames().find(f=>f!==page.mainFrame());const receipt=await frame.evaluate(()=>{
  const captures=[];for(const service of ['fire','ems']){PTBO_SERVICE.select(service);for(const base of PTBO_SERVICE.getBases()){const spawned=PTBO_SERVICE.spawn(base.number);captures.push({service,number:base.number,spawned,actual:[simLat,simLng],expected:[base.spawnLat??base.lat,base.spawnLng??base.lng]});}}
  return{city:PTBO_CITY_PACKAGE.id,dispatchAvailable:PTBO_CITY_PACKAGE.dispatch.available,captures};
 });
 assert.equal(await page.evaluate(()=>PTBO_CITY_PACKAGE.id),city,'outer wrapper city package');assert.equal(receipt.city,city);assert.equal(receipt.dispatchAvailable,false);for(const base of receipt.captures){assert.equal(base.spawned,true);assert.ok(Math.abs(base.actual[0]-base.expected[0])<1e-8);assert.ok(Math.abs(base.actual[1]-base.expected[1])<1e-8);}
 assert.equal(errors.length,0,errors.join('; '));rows.push({city,status:'pass',bases:receipt.captures.length,services:['fire','ems'],directParserReady:true,errors});
 }catch(e){rows.push({city,status:'fail',error:e.message,errors});}
 console.log(JSON.stringify(rows.at(-1)));await context.close();
 }
 fs.writeFileSync(path.resolve('test-artifacts/quality-audit/after/base-cities.json'),JSON.stringify(rows,null,2));if(rows.some(r=>r.status==='fail'))process.exitCode=1;
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
