'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const coreFile=path.resolve('route-mapping/station-core.js');
function core(){assert.ok(fs.existsSync(coreFile),'station selection needs a production station model');return require(coreFile);}
const bases=[{id:'fire-2',service:'fire',number:2,name:'Station 2',address:'22 North Road'},{id:'fire-1',service:'fire',number:1,name:'Station 1',address:'11 Main Street'},{id:'ems-1',service:'ems',number:1,name:'EMS Headquarters',address:'1 Medical Drive'}];
function training(){
 const calls=bases.flatMap(base=>Array.from({length:base.id==='fire-2'?3:6},(_,i)=>({id:base.id+'-call-'+i,routeBaseId:base.id,trainingServices:[base.service],main:base.service==='fire'?'Fire':'Medical'})));
 return {routeCalls:calls,routeResponses:{schemaVersion:1,minCallsPerBase:3,bases:bases.map(base=>({baseId:base.id,service:base.service,callIds:calls.filter(c=>c.routeBaseId===base.id).map(c=>c.id)}))}};
}
test('station choices show the actual hall/service catalog count in numeric station order',()=>{
 const list=core().stationChoices(bases,training(),'fire');
 assert.deepEqual(list.map(c=>c.base.id),['fire-1','fire-2']);assert.deepEqual(list.map(c=>c.callCount),[6,3]);assert.ok(list.every(c=>c.available));
 const ems=core().stationChoices(bases,training(),'ems');assert.equal(ems.length,1);assert.equal(ems[0].callCount,6);
});
test('counts exclude duplicates, missing calls, and calls assigned to a different hall or service',()=>{
 const d=training(),p=d.routeResponses.bases.find(p=>p.baseId==='fire-2');p.callIds.push(p.callIds[0],'missing','fire-1-call-0','ems-1-call-0');
 assert.equal(core().stationChoices(bases,d,'fire').find(c=>c.base.id==='fire-2').callCount,3);
 d.routeCalls.find(c=>c.id==='fire-2-call-0').trainingServices=['ems'];
 const choice=core().stationChoices(bases,d,'fire').find(c=>c.base.id==='fire-2');assert.equal(choice.callCount,2);assert.equal(choice.available,false);
 assert.equal(core().stationChoices([...bases,{id:'custom',service:'fire',number:3,name:'Custom',address:'Road'}],d,'fire').find(c=>c.base.id==='custom').available,false);
});
test('search finds station numbers, names and addresses, including no-result searches',()=>{
 const list=core().stationChoices(bases,training(),'fire');
 assert.equal(core().filterStations(list,' North ROAD ')[0].base.id,'fire-2');assert.equal(core().filterStations(list,'Station 1')[0].base.number,1);assert.equal(core().filterStations(list,'22')[0].base.number,2);assert.equal(core().filterStations(list,'not a station').length,0);assert.equal(core().filterStations(list,'').length,2);
});
test('launch and return URLs carry the exact city, service and station safely',()=>{
 const c=core(),href='https://example.test/game/route-mapping/?city=toronto&analytics=off',url=new URL(c.playUrl(href,{city:'toronto',service:'ems',station:'ems-1',version:'1.6.121'}));
 assert.equal(url.pathname,'/game/route-mapping/play.html');assert.equal(url.searchParams.get('city'),'toronto');assert.equal(url.searchParams.get('service'),'ems');assert.equal(url.searchParams.get('station'),'ems-1');assert.equal(url.searchParams.get('analytics'),'off');
 const back=new URL(c.pickerUrl(url.href,{city:'toronto',service:'ems',version:'1.6.121'}));assert.equal(back.pathname,'/game/route-mapping/');assert.equal(back.searchParams.get('station'),null);assert.equal(back.searchParams.get('service'),'ems');
});
test('Route Mapping opens the picker without loading the map engine or gameplay',()=>{
 const html=fs.readFileSync('route-mapping/index.html','utf8');assert.match(html,/Choose a station/);assert.match(html,/station-list/);assert.doesNotMatch(html,/<script[^>]*src=["'][^"']*(?:leaflet(?:-1\.9\.4)?\/leaflet|\.\/app)\.js/);
 assert.ok(fs.existsSync('route-mapping/play.html'),'gameplay has its own launch page');
});
test('the chosen hall remains the origin beyond the old automatic 20-call phases',()=>{
 const source=fs.readFileSync('route-mapping/app.js','utf8'),c={window:{PTBO_BASE_STORE:{getBases:service=>bases.filter(b=>b.service===service)}},document:{getElementById:()=>({})},console};
 vm.runInNewContext(source.replace('  initialize();','  globalThis.api={state,progressionPhase,applyProgressionStart};'),c);
 const {state,progressionPhase,applyProgressionStart}=c.api;state.service='fire';state.selectedBaseId='fire-2';state.selectedStartCompleted=50;
 for(const completed of [50,70,1000]){state.progression={completed,lastCall:null};const phase=progressionPhase();assert.equal(phase.stationNumber,2);assert.equal(phase.continuous,false);assert.equal(phase.completedInPhase,completed-50);applyProgressionStart();assert.equal(state.base.id,'fire-2');}
});
test('all cities expose every published hall with an accurate nonzero call count',async()=>{
 const {registry,inputs,canonicalBases}=require('../tools/route-response-data.cjs');let halls=0,calls=0;
 for(const city of registry.filter(city=>city.modes.route)){
  const {training,bases:raw}=await inputs(city),canonical=canonicalBases(city,raw);
  for(const service of ['fire','ems'])for(const choice of core().stationChoices(canonical,training,service)){
   assert.ok(choice.available,city.id+' '+choice.base.id);assert.equal(choice.callCount,training.routeCalls.filter(call=>call.routeBaseId===choice.base.id&&call.trainingServices.includes(service)).length);halls++;calls+=choice.callCount;
  }
 }
 assert.equal(halls,606);assert.equal(calls,3630);
});
