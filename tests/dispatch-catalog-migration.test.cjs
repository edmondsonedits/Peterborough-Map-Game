'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=file=>fs.readFileSync(new URL('../'+file,'file://'+__filename),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const old=[
  {id:'landmark',main:'Fire',sub:'Structure Fire',name:'Old label',addr:'10 Main St',lat:44.3,lng:-78.3,radius:60,recognitionDifficulty:'easy',crossStreets:['First Street','Second Street']},
  {id:'deleted',main:'Fire',sub:'Structure Fire',name:'Deleted by user',addr:'20 Main St',lat:44.301,lng:-78.3,radius:60,recognitionDifficulty:'easy'},
];
const published=[{...old[0],name:'Corrected landmark',lat:44.3005,radius:143,routeAccess:{lat:44.3001,lng:-78.3002},arrivalRadiusMeters:60},old[1],
  {id:'new',main:'Fire',sub:'Structure Fire',name:'New published place',addr:'30 Main St',lat:44.302,lng:-78.3,radius:60,recognitionDifficulty:'easy'}];
async function runtime(saved,{seed=published,version='new',previous={version:'old',locations:old},city='peterborough'}={}){
  const storage=new Map(saved?[[`ptboSharedDispatchLocationsV3:${city}`,JSON.stringify(saved)]]:[]);
  const c=vm.createContext({console:{info(){},warn(){}},URL,setTimeout,clearTimeout,AbortController,CustomEvent:class{},
    location:{href:`https://example.test/geo-guesser/?city=${city}`},document:{currentScript:{src:`https://example.test/shared/dispatch-locations.js?city=${city}`}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},dispatchEvent(){},
    fetch:async()=>({ok:true,json:async()=>({schemaVersion:1,id:city,careHomes:[]})}),
    PTBO_DISPATCH_DATA_VERSION:version,PTBO_DISPATCH_DATA_READY:Promise.resolve(seed),PTBO_DISPATCH_PREVIOUS_DATA:previous});
  c.window=c;vm.runInContext(source('shared/ems-priority.js'),c);vm.runInContext(source('shared/dispatch-locations.js'),c);
  await c.PTBO_DISPATCH_STORE.ready();return{api:c.PTBO_DISPATCH_STORE,storage};
}
const saved=(items=old)=>({version:3,cityId:'peterborough',dataVersion:'old',items:plain(items)});
test('published corrections replace unchanged cached coordinates, circles and labels',async()=>{
  const{api}=await runtime(saved());const item=api.getAll().find(x=>x.id==='landmark');
  assert.equal(item.name,'Corrected landmark');assert.equal(item.lat,44.3005);assert.equal(item.radius,143);
  assert.deepEqual(plain(item.routeAccess),published[0].routeAccess);assert.equal(item.arrivalRadiusMeters,60);
});
test('upgrading preserves intentional field edits, custom locations and deletions',async()=>{
  const edited={...old[0],name:'My name',radius:72};
  const custom={...old[1],id:'custom',name:'My extra place',custom:true};
  const snapshot=saved([edited,custom]),{api,storage}=await runtime(snapshot),items=api.getAll();
  assert.equal(items.find(x=>x.id==='landmark').name,'My name');assert.equal(items.find(x=>x.id==='landmark').radius,72);
  assert.equal(items.find(x=>x.id==='landmark').lat,44.3005,'unchanged latitude adopts the published correction');
  assert.equal(items.some(x=>x.id==='deleted'),false);assert.ok(items.some(x=>x.id==='custom'));assert.ok(items.some(x=>x.id==='new'));
  assert.deepEqual(JSON.parse(storage.get(api.storageKey+':before-new')),snapshot);
});
test('saving after an upgrade records the immutable seed separately from user changes',async()=>{
  const{api,storage}=await runtime(saved());api.upsert({...api.getAll()[0],name:'Edited after update'});
  const stored=JSON.parse(storage.get(api.storageKey));
  assert.equal(stored.dataVersion,'new');assert.equal(stored.items[0].name,'Edited after update');
  assert.equal(stored.seed[0].name,'Corrected landmark');assert.equal(stored.seed[0].radius,143);
});
test('subsequent catalogue updates rebase using the saved seed and preserve edits',async()=>{
  const{api,storage}=await runtime(saved());api.upsert({...api.getAll()[0],name:'My persistent name'});
  const snapshot=JSON.parse(storage.get(api.storageKey)),next=plain(published);next[0].radius=150;next[0].lng=-78.301;
  const reloaded=await runtime(snapshot,{seed:next,version:'newer',previous:null});const row=reloaded.api.getAll()[0];
  assert.equal(row.name,'My persistent name');assert.equal(row.radius,150);assert.equal(row.lng,-78.301);
});
test('migration baselines cannot import another city\'s saved records',async()=>{
  const snapshot={...saved(),cityId:'richmond-hill'};const{api}=await runtime(snapshot);
  assert.equal(api.getAll()[0].name,'Corrected landmark');assert.equal(api.getAll().length,published.length);
});
test('canonical arrival tolerance survives shared editing without changing recognition radius',async()=>{
  const{api}=await runtime(null);const row=api.getAll()[0];api.upsert({...row,name:'New label'});
  assert.equal(api.getAll()[0].radius,143);assert.equal(api.getAll()[0].arrivalRadiusMeters,60);
});
test('the generated production payload upgrades real 1.6.108 caches and keeps deliberate edits',async()=>{
  const c=vm.createContext({Uint8Array,atob,Blob,Response,DecompressionStream});c.window=c;
  vm.runInContext(source('shared/dispatch-data-1.4.4.js'),c);const seed=await c.PTBO_DISPATCH_DATA_READY;
  const previous=c.PTBO_DISPATCH_PREVIOUS_DATA;assert.equal(previous.version,'1.6.108');
  const edited=plain(previous.locations),tim=edited.find(x=>x.id==='ptbo-location-ac5bdbdeeb0516');tim.name='My saved restaurant label';
  const snapshot={version:3,cityId:'peterborough',dataVersion:'1.6.108',items:edited};
  const{api}=await runtime(snapshot,{seed,version:c.PTBO_DISPATCH_DATA_VERSION,previous});const corrected=api.getAll().find(x=>x.id===tim.id);
  assert.equal(corrected.name,'My saved restaurant label');assert.equal(corrected.lat,44.28682164170232);assert.equal(corrected.lng,-78.3295583485264);assert.equal(corrected.radius,24);assert.equal(corrected.arrivalRadiusMeters,60);
});
