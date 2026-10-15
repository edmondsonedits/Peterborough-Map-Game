'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(root,file),'utf8');
function payload() {
  const encoded = source('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1];
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(encoded,'base64')));
  const old=source('shared/dispatch-data-1.4.4.js').match(/const LEGACY_PAYLOAD = '([^']+)'/);
  return {locations:data,legacy:old?JSON.parse(zlib.gunzipSync(Buffer.from(old[1],'base64'))):[]};
}
async function store(saved) {
  const data=payload(), storage=new Map(saved ? [['ptboSharedDispatchLocationsV3:peterborough',JSON.stringify(saved)]] : []);
  const c=vm.createContext({console,URL,CustomEvent:class{},
    location:{href:'https://example.test/'},document:{currentScript:{src:'https://example.test/shared/dispatch-locations.js'}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},dispatchEvent(){},
    PTBO_DISPATCH_DATA_VERSION:'1.6.108',PTBO_DISPATCH_DATA_READY:Promise.resolve(data.locations),PTBO_DISPATCH_LEGACY_LOCATIONS:data.legacy});
  c.window=c;vm.runInContext(source('shared/dispatch-locations.js'),c);await c.PTBO_DISPATCH_STORE.ready();
  return {api:c.PTBO_DISPATCH_STORE,storage};
}
test('production catalog contains 200 unique civic locations with 100/50/50 recognition tiers',()=>{
  const calls=payload().locations, counts={easy:0,medium:0,hard:0};
  assert.equal(calls.length,200);
  for(const call of calls){counts[call.recognitionDifficulty]++;assert.ok(call.crossStreets.length>=1);assert.ok(Number.isFinite(call.lat)&&Number.isFinite(call.lng));}
  assert.deepEqual(counts,{easy:100,medium:50,hard:50});
  assert.equal(new Set(calls.map(c=>c.id)).size,200);assert.equal(new Set(calls.map(c=>c.addr.toLowerCase())).size,200);
});
test('shared editing retains recognition metadata and offers all addresses to each service',async()=>{
  const {api}=await store();const calls=api.getAll();
  assert.equal(api.forService('fire').length,200);assert.equal(api.forService('ems').length,200);
  assert.ok(api.forService('ems').every(c=>c.main==='Medical'));
  assert.ok(api.forService('fire').every(c=>c.main==='Fire'));
  const original=calls[0].crossStreets[0];calls[0].crossStreets[0]='External mutation';assert.equal(api.getAll()[0].crossStreets[0],original);
  const edited=api.getAll()[0];api.upsert({...edited,lat:edited.lat+.0001});
  assert.equal(api.getAll()[0].recognitionDifficulty,edited.recognitionDifficulty);assert.deepEqual(api.getAll()[0].crossStreets,edited.crossStreets);
});
test('upgrading rebases explicit edits without restoring unchanged retired calls',async()=>{
  const data=payload();assert.ok(data.legacy.length);
  const linked=data.legacy.find(old=>data.locations.some(c=>c.sourceCallIds.includes(old.id)));
  const calls=structuredClone(data.legacy);const edited=calls.find(c=>c.id===linked.id);edited.lat+=.0002;
  calls.push({...edited,id:'custom-user-location',name:'My saved location',custom:true});
  const {api}=await store({version:3,dataVersion:'1.4.20',items:calls});const active=api.getAll();
  assert.equal(active.length,201);assert.equal(active.find(c=>c.sourceCallIds.includes(linked.id)).lat,edited.lat);
  assert.ok(active.find(c=>c.id==='custom-user-location'));
  assert.equal(active.filter(c=>c.recognitionDifficulty==='hard').length,50);
});
test('both Geo services share the same difficulty pool and wait for explicit Next Call',()=>{
  const c=vm.createContext({setTimeout,clearTimeout});vm.runInContext(source('geo-guesser/station-practice.js'),c);
  const api=c.PTBO_STATION_PRACTICE,calls=payload().locations;
  assert.equal(api.serviceLocations(calls,'fire','easy').length,100);
  assert.equal(api.serviceLocations(calls,'ems','easy').length,100);
  const session=api.createSession({locations:calls.slice(0,2)}),first=session.state.target;
  assert.equal(session.guess(0,60).correct,true);assert.equal(session.state.target,first);
  assert.equal(session.next(),true);assert.notEqual(session.state.target,first);
});

test('migration preserves a location when one of its old duplicate scenario rows remains',async()=>{
 const data=payload(),duplicate=data.locations.find(c=>c.sourceCallIds.length>1);assert.ok(duplicate);
 const rows=structuredClone(data.legacy).filter(c=>c.id!==duplicate.sourceCallIds[0]);
 const {api}=await store({version:3,dataVersion:'1.4.20',items:rows});
 assert.ok(api.getAll().find(c=>c.id===duplicate.id));
});

test('saved incident-category edits remain effective in simulator service projections after migration',async()=>{
 const data=payload(),linked=data.legacy.find(old=>data.locations.some(c=>c.sourceCallIds.includes(old.id)));
 const rows=structuredClone(data.legacy),edited=rows.find(c=>c.id===linked.id);edited.main='Medical';edited.sub='Difficulty Breathing';
 const {api}=await store({version:3,dataVersion:'1.4.20',items:rows});
 assert.equal(api.forService('ems').find(c=>c.sourceCallIds.includes(linked.id)).sub,'Difficulty Breathing');
});
test('editor export can compare saved edits against the immutable published seed',async()=>{
 const {api}=await store(),original=api.getAll()[0];
 const saved=api.upsert({...original,name:'User edit'});saved.crossStreets[0]='Mutated';
 assert.equal(api.getSeed()[0].name,original.name);assert.equal(api.getAll()[0].crossStreets[0],original.crossStreets[0]);
});
test('EMS route mapping shares every canonical address regardless of legacy scenario labels',()=>{
 const app=source('route-mapping/app.js'),fn=app.match(/  function callsForService\(\)\{[^\n]+/)[0];
 const calls=[...payload().locations,{id:'extra-address',main:'Fire',sub:'Training address'}];
 const c=vm.createContext({state:{service:'ems',calls}});vm.runInContext(fn,c);
 const pool=c.callsForService();assert.equal(pool.length,calls.length);assert.ok(pool.every(call=>call.main==='Medical'));
});
