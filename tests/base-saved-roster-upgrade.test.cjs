'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {runtime:geoRuntime}=require('./helpers/city-runtime.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const key='ptboBaseLocationChangesV1:scarborough';
const custom={id:'ems-my-custom-base',service:'ems',number:25,name:'My Custom Base',shortName:'My Base',address:'100 Custom Road',lat:43.76,lng:-79.24,spawnLat:43.7601,spawnLng:-79.2401,yardWidth:120,yardLength:150,yardRotation:10,spawnHeading:90};
const snapshot=()=>({schema:1,cityId:'scarborough',updated:[{id:'fire-station-221-221',changes:{name:'My saved hall name'}},{id:'ems-ambulance-station-20-20',before:{number:20},changes:{number:28,name:'My renamed EMS base'}}],added:[custom],deleted:[{id:'fire-station-231-231'}]});
// Published fallback identities from the previous Scarborough package. Small explicit
// fixture keeps the historical upgrade test independent of Git history availability.
const previousFire=[
 {number:221,name:'Station 221',address:'2575 Eglinton Ave E',lat:43.734799,lng:-79.255066},
 {number:231,name:'Station 231',address:'740 Markham Rd',lat:43.764653,lng:-79.227791},
];
const previousEms=[
 {number:20,name:'Ambulance Station 20',address:'2430 Lawrence Ave E',lat:43.750897,lng:-79.271360},
 {number:21,name:'Ambulance Station 21',address:'887 Pharmacy Ave',lat:43.729554,lng:-79.298529},
 {number:22,name:'Ambulance Station 22',address:'3100 Eglinton Ave E',lat:43.742000,lng:-79.226258},
 {number:24,name:'Ambulance Station 24',address:'3061 Birchmount Rd',lat:43.802797,lng:-79.308158},
 {number:26,name:'Ambulance Station 26',address:'4331 Lawrence Ave E',lat:43.770827,lng:-79.174053},
 {number:27,name:'Ambulance Station 27',address:'900 Tapscott Rd',lat:43.823993,lng:-79.242870},
];
async function preview({previous=false,storage=new Map(),saved=snapshot(),source}={}){
 if(saved)storage.set(key,JSON.stringify(saved));
 const warnings=[];
 const c=vm.createContext({URL,console:{...console,warn:(...args)=>warnings.push(args)},CustomEvent:class{},location:{href:'https://example.test/?city=scarborough'},
  fetch:async url=>{if(String(url)==='https://example.test/cities/scarborough/geo-data.json')return {ok:true,json:async()=>JSON.parse(read('cities/scarborough/geo-data.json'))};throw Error('Packaged bases must not use a network lookup');},
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},addEventListener(){},dispatchEvent(){},
  document:{currentScript:{src:'https://example.test/cities/preview-package-factory.js'},readyState:'complete',documentElement:{dataset:{}},createElement:()=>({dataset:{}}),head:{appendChild(){}}}});
 c.window=c;vm.runInContext(read('cities/preview-package-factory.js'),c);
 c.document.currentScript.src='https://example.test/cities/scarborough/package.js';
 if(previous)await c.PTBO_PREVIEW_CITY_FACTORY.create({id:'scarborough',name:'Scarborough',sourceUrl:new URL(c.document.currentScript.src),
  map:{defaultCenter:[43.7764,-79.2318],bounds:[[43.67,-79.34],[43.86,-79.11]],minZoom:10,maxZoom:19},
  sources:{fire:{type:'static',entries:previousFire},ems:{type:'static',entries:previousEms}}});
 else {vm.runInContext(source||read('cities/scarborough/package.js'),c);await c.PTBO_CITY_PACKAGE_READY;}
 vm.runInContext(read('shared/location-changes.js'),c);c.document.currentScript.src='https://example.test/shared/base-locations.js';
 vm.runInContext(read('shared/base-locations.js'),c);
 return {api:c.PTBO_BASE_STORE,storage,warnings};
}
function assertRestored(api){
 const rows=plain(api.getAll());
 assert.equal(rows.find(base=>base.id==='fire-station-221-221').name,'My saved hall name');
 assert.equal(rows.some(base=>base.id==='fire-station-231-231'),false,'saved tombstone survives');
 const added=rows.find(base=>base.id===custom.id);assert.ok(added,'custom stable ID survives');
 assert.equal(added.name,'My Custom Base');assert.equal(added.lat,43.76);assert.equal(added.spawnLat,43.7601);assert.equal(added.yardLength,150);
 const official25=rows.find(base=>base.id==='ems-toronto-ems-2303629');assert.equal(official25.number,25);
 const official28=rows.find(base=>base.id==='ems-toronto-ems-2807376');assert.equal(official28.number,28);
 assert.notEqual(added.number,25);assert.equal(added.numberConflict.requestedNumber,25);assert.equal(added.numberConflict.assignedNumber,added.number);assert.equal(added.numberConflict.conflictingBaseId,official25.id);
 const edited=rows.find(base=>base.id==='ems-ambulance-station-20-20');assert.equal(edited.name,'My renamed EMS base');
 assert.notEqual(edited.number,28);assert.equal(edited.numberConflict.requestedNumber,28);assert.equal(edited.numberConflict.conflictingBaseId,official28.id);
 assert.equal(new Set(rows.map(base=>`${base.service}:${base.number}`)).size,rows.length);
 return rows;
}

test('expanded preview preserves valid old saved delta and official numbers when saved numbers collide',async()=>{
 const old=await preview({previous:true});
 assert.equal(old.api.getAll().find(base=>base.id===custom.id).number,25);
 assert.equal(old.api.getAll().find(base=>base.id==='ems-ambulance-station-20-20').number,28);
 assert.equal(old.api.getAll().find(base=>base.id==='fire-station-221-221').name,'My saved hall name');
 const next=await preview({storage:old.storage,saved:null});assertRestored(next.api);assert.equal(next.warnings.length,0);
 const again=await preview({storage:next.storage,saved:null});
 assert.deepEqual(plain(again.api.getAll()),plain(next.api.getAll()),'reconciliation is deterministic without a storage write');
 next.api.replaceAll(next.api.getAll());
 const reloaded=await preview({storage:next.storage,saved:null});assertRestored(reloaded.api);
 assert.equal(JSON.parse(next.storage.get(key)).added.find(base=>base.id===custom.id).numberConflict.requestedNumber,25);
});

test('Geo uses the same saved snapshot without losing custom identities, edits, or tombstones',async()=>{
 const pack=JSON.parse(read('cities/scarborough/geo-data.json'));
 const h=geoRuntime({search:'?city=scarborough',pack});h.storage.set(key,JSON.stringify(snapshot()));
 await h.c.PTBO_GEO_CITY_READY;assertRestored(h.c.PTBO_BASE_STORE);
 h.c.PTBO_BASE_STORE.replaceAll(h.c.PTBO_BASE_STORE.getAll());
 const again=geoRuntime({search:'?city=scarborough',pack});again.storage.set(key,h.storage.get(key));
 await again.c.PTBO_GEO_CITY_READY;assertRestored(again.c.PTBO_BASE_STORE);
});

test('malformed saved additions are still rejected rather than silently skipped',async()=>{
 const saved=snapshot();saved.added[0]={...custom,lat:'invalid'};
 const h=await preview({saved});
 assert.equal(h.warnings.length>0,true);
 assert.equal(h.api.getAll().some(base=>base.id===custom.id),false);
 assert.equal(h.api.getAll().find(base=>base.id==='fire-station-221-221').name,'Fire Station 221');
});

test('duplicate saved custom number claims remain invalid instead of masking malformed snapshots',async()=>{
 const saved=snapshot();saved.added.push({...custom,id:'ems-another-custom'});
 const h=await preview({saved});assert.equal(h.warnings.length>0,true);
 assert.equal(h.api.getAll().some(base=>base.id===custom.id),false);
});

test('multiple published-number conflicts resolve by stable ID independent of saved array order',async()=>{
 const saved=snapshot();saved.updated=saved.updated.filter(row=>row.id!=='ems-ambulance-station-20-20');
 saved.added.push({...custom,id:'ems-another-custom',number:28});
 const first=await preview({saved});
 const reversed={...saved,added:[...saved.added].reverse()};const second=await preview({saved:reversed});
 const assigned=api=>plain(api.getAll()).filter(row=>row.id===custom.id||row.id==='ems-another-custom').map(row=>({id:row.id,number:row.number,conflict:row.numberConflict})).sort((a,b)=>a.id.localeCompare(b.id));
 assert.deepEqual(assigned(first.api),assigned(second.api));
 assert.equal(assigned(first.api).length,2);assert.equal(assigned(first.api).every(row=>row.conflict.assignedNumber===row.number),true);
});

test('an explicit subsequent number edit clears stale conflict metadata and remains persisted',async()=>{
 const h=await preview();const rows=plain(h.api.getAll());
 const edited=rows.find(row=>row.id===custom.id);assert.ok(edited,'conflicting custom row is retained');
 assert.ok(edited.numberConflict);edited.number=50000;
 h.api.replaceAll(rows);
 assert.equal(h.api.getAll().find(row=>row.id===custom.id).numberConflict,undefined);
 const again=await preview({storage:h.storage,saved:null});
 assert.equal(again.api.getAll().find(row=>row.id===custom.id).number,50000);
 assert.equal(again.api.getAll().find(row=>row.id===custom.id).numberConflict,undefined);
});
