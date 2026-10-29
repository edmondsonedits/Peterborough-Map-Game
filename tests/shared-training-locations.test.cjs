'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const base = {id:'seed-1',main:'Fire',sub:'Structure Fire',name:'Existing Site',addr:'10 Main Street',lat:43.65,lng:-79.38,radius:50,recognitionDifficulty:'hard'};
const civic = {id:'civic-library',cityId:'toronto',main:'Fire',sub:'Public Building',name:'Public Library',addr:'20 Main Street',lat:43.651,lng:-79.381,radius:50,recognitionDifficulty:'easy',locationKind:'library',difficultyReason:'Named public landmark.',routeAccess:{lat:43.6512,lng:-79.3811,nodeId:'road-12'},geographicVerificationRef:'civic-audit/library',incidentProfiles:{fire:{sub:'Public Building'},ems:{sub:'Medical Assistance'}},sources:['https://example.test/official/library']};
const plain = value => JSON.parse(JSON.stringify(value));
function runtime({cityId='toronto',canonical=[base],training,storage=new Map(),saved}={}) {
  const storageKey=`ptboSharedDispatchLocationsV3:${cityId}`;
  if(saved)storage.set(storageKey,JSON.stringify(saved));
  const descriptor=training||{schemaVersion:1,id:cityId,careHomes:[],sharedLocations:[{...civic,cityId}]};
  const urls=[];
  const c=vm.createContext({console,URL,URLSearchParams,Math,Number,Object,Array,JSON,Date,setTimeout,clearTimeout,AbortController,
    location:{href:`https://example.test/geo-guesser/?city=${cityId}`},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    PTBO_DISPATCH_DATA_VERSION:'test-1',PTBO_DISPATCH_DATA_READY:Promise.resolve(plain(canonical)),
    fetch:async url=>{urls.push(String(url));return{ok:true,status:200,json:async()=>plain(descriptor)};},
    document:{currentScript:{src:`https://example.test/shared/dispatch-locations.js?city=${cityId}&v=test`}},
    dispatchEvent(){},CustomEvent:class{}});
  c.window=c;
  vm.runInContext(read('shared/ems-priority.js'),c);
  vm.runInContext(read('shared/dispatch-locations.js'),c);
  return {api:c.PTBO_DISPATCH_STORE,storage,storageKey,urls};
}

// Catches accidental mandatory supplemental payloads in existing city descriptors.
test('descriptors without sharedLocations remain compatible',async()=>{
  const h=runtime({training:{schemaVersion:1,id:'toronto',careHomes:[]}});
  await h.api.ready();
  assert.deepEqual(plain(h.api.getAll()).map(row=>row.id),['seed-1']);
});

// Catches omitted supplemental merge, service filtering, and loss of distinct source/access coordinates.
test('shared civic rows enter the common pool for both services with compact metadata',async()=>{
  const h=runtime();await h.api.ready();
  assert.equal(h.urls.length,1);
  assert.equal(h.urls[0],'https://example.test/cities/toronto/training-data.json?v=test');
  assert.deepEqual(plain(h.api.getAll()).map(row=>row.id),['seed-1','civic-library']);
  const row=plain(h.api.getAll()).find(row=>row.id==='civic-library');
  assert.equal(row.lat,43.651);assert.equal(row.lng,-79.381);
  assert.deepEqual(row.routeAccess,{lat:43.6512,lng:-79.3811,nodeId:'road-12'});
  assert.equal(row.locationKind,'library');
  assert.equal(row.difficultyReason,'Named public landmark.');
  assert.equal(row.geographicVerificationRef,'civic-audit/library');
  assert.equal(row.recognitionDifficulty,'easy');
  assert.equal(h.api.forService('fire').find(row=>row.id==='civic-library').sub,'Public Building');
  assert.equal(h.api.forService('ems').find(row=>row.id==='civic-library').sub,'Medical Assistance');
  h.api.upsert({...row,name:'Edited Library'});
  const again=runtime({storage:h.storage});await again.api.ready();
  assert.equal(again.api.getAll().find(row=>row.id==='civic-library').name,'Edited Library');
  assert.deepEqual(plain(again.api.getAll().find(row=>row.id==='civic-library').routeAccess),row.routeAccess);
});

for(const [name,mutation] of [
  ['non-array shared pool',d=>{d.sharedLocations={};}],
  ['cross-city row',d=>{d.sharedLocations[0].cityId='ottawa';}],
  ['missing explicit ID',d=>{delete d.sharedLocations[0].id;}],
  ['missing name',d=>{delete d.sharedLocations[0].name;}],
  ['missing address',d=>{delete d.sharedLocations[0].addr;}],
  ['missing recognition tier',d=>{delete d.sharedLocations[0].recognitionDifficulty;}],
  ['invalid recognition tier',d=>{d.sharedLocations[0].recognitionDifficulty='invalid';}],
  ['invalid source point',d=>{d.sharedLocations[0].lat=200;}],
  ['boolean source point',d=>{d.sharedLocations[0].lat=true;}],
  ['invalid access point',d=>{d.sharedLocations[0].routeAccess.lat='invalid';}],
  ['empty access coordinate',d=>{d.sharedLocations[0].routeAccess.lng='';}],
  ['null access point',d=>{d.sharedLocations[0].routeAccess=null;}],
  ['repeated supplemental ID',d=>{d.sharedLocations.push({...d.sharedLocations[0],addr:'21 Main Street'});}],
  ['seed ID collision',d=>{d.sharedLocations[0].id='seed-1';}],
  ['same address nearpoint conflict',d=>{d.sharedLocations[0].addr='10 MAIN STREET';d.sharedLocations[0].lat=43.65001;d.sharedLocations[0].lng=-79.38;}],
])test(`shared pool rejects ${name}`,async()=>{
  const descriptor={schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[plain(civic)]};mutation(descriptor);
  const h=runtime({training:descriptor});
  await assert.rejects(h.api.ready(),/shared|training|conflict|invalid/i);
  assert.equal(h.api.getAll().length,0);
});

// Catches rejecting descriptors that predate row-level city stamps.
test('row cityId is optional, but descriptor identity is enforced',async()=>{
  const withoutCity=plain(civic);delete withoutCity.cityId;
  const h=runtime({training:{schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[withoutCity]}});
  await h.api.ready();assert.equal(h.api.getAll().length,2);
  const wrong=runtime({training:{schemaVersion:1,id:'ottawa',careHomes:[],sharedLocations:[civic]}});
  await assert.rejects(wrong.api.ready(),/city id/i);
});

// Catches silent ID renumbering and overwriting authoritative existing point/difficulty.
test('same canonical ID leaves existing seed coordinates and difficulty intact',async()=>{
  const duplicate={...civic,...base,cityId:'toronto',lat:43.65001,recognitionDifficulty:'easy',name:'Alternate Source Name'};
  const h=runtime({training:{schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[duplicate]}});
  await h.api.ready();
  const rows=plain(h.api.getAll());
  assert.equal(rows.length,1);assert.equal(rows[0].id,'seed-1');
  assert.equal(rows[0].name,'Existing Site');assert.equal(rows[0].lat,43.65);assert.equal(rows[0].recognitionDifficulty,'hard');
});

// Catches address-prefix or broad nearpoint merging that loses neighbouring units.
test('neighbouring units remain separate canonical rows',async()=>{
  const h=runtime({training:{schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[{...civic,addr:'10 Main Street Unit 2',lat:43.65,lng:-79.38}]}});
  await h.api.ready();assert.equal(h.api.getAll().length,2);
});

// Catches older V3 snapshots hiding new general-purpose rows or replacing user modifications.
test('old V3 saved edits receive new shared seeds without resurrecting deleted original seeds',async()=>{
  const saved={version:3,cityId:'toronto',dataVersion:'test-1',items:[{...base,name:'My Site',lat:43.6503,recognitionDifficulty:'medium'},{id:'custom-1',name:'My Custom',addr:'42 Elm Street',lat:43.66,lng:-79.4}]};
  const h=runtime({saved,canonical:[base,{...base,id:'seed-deleted',addr:'12 Main Street'}]});await h.api.ready();
  const rows=plain(h.api.getAll());assert.deepEqual(rows.map(row=>row.id),['seed-1','custom-1','civic-library']);
  assert.equal(rows[0].name,'My Site');assert.equal(rows[0].lat,43.6503);assert.equal(rows[0].recognitionDifficulty,'medium');
  assert.equal(h.api.dataVersion,'test-1');
});

// Catches using EMS classification as the tombstone or failing to persist observed supplemental IDs.
test('deleted supplemental seeds remain deleted across reloads and a later seed addition',async()=>{
  const h=runtime({saved:{version:3,cityId:'toronto',dataVersion:'test-1',items:[base]}});await h.api.ready();
  h.api.remove('civic-library');
  const snapshot=JSON.parse(h.storage.get(h.storageKey));
  assert.deepEqual(snapshot.trainingSharedLocationIds,['civic-library']);
  const h2=runtime({storage:h.storage});await h2.api.ready();
  assert.deepEqual(plain(h2.api.getAll()).map(row=>row.id),['seed-1']);
  const descriptor={schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[civic,{...civic,id:'civic-school',addr:'30 Main Street',lat:43.652,name:'School'}]};
  const h3=runtime({storage:h.storage,training:descriptor});await h3.api.ready();
  assert.deepEqual(plain(h3.api.getAll()).map(row=>row.id),['seed-1','civic-school']);
});

// Catches losing the first-upgrade seed history when callers save after initial hydration.
test('first upgrade snapshot retains already observed deleted supplemental IDs',async()=>{
  const saved={version:3,cityId:'toronto',dataVersion:'test-1',trainingSharedLocationIds:['civic-library'],items:[base]};
  const h=runtime({saved});await h.api.ready();
  assert.deepEqual(plain(h.api.getAll()).map(row=>row.id),['seed-1']);
  h.api.upsert({...base,name:'New Edit'});
  const again=runtime({storage:h.storage});await again.api.ready();
  assert.equal(again.api.getAll().length,1);assert.equal(again.api.getAll()[0].name,'New Edit');
});

// Catches merging care homes before shared civic rows and changing unmatched home service policy.
test('care-home enrichment matches shared civic rows and keeps unmatched homes EMS-only',async()=>{
  const training={schemaVersion:1,id:'toronto',sharedLocations:[civic],careHomes:[
    {id:'moh-ltc-1',name:'Library Care Site',addr:'20 Main Street',lat:43.651,lng:-79.381},
    {id:'moh-ltc-2',name:'Other Care Site',addr:'99 Oak Road',lat:43.67,lng:-79.4},
  ]};
  const h=runtime({training});await h.api.ready();
  assert.equal(h.api.getAll().length,3);
  assert.equal(h.api.getAll().find(row=>row.id==='civic-library').facilityType,'long-term-care');
  assert.deepEqual(plain(h.api.forService('fire')).map(row=>row.id),['seed-1','civic-library']);
  assert.deepEqual(plain(h.api.forService('ems')).map(row=>row.id),['seed-1','civic-library','moh-ltc-2']);
});

// Catches city storage sharing and trusting the city stamp inside the wrong storage envelope.
test('supplemental records and saved edits stay isolated by selected city',async()=>{
  const toronto=runtime();await toronto.api.ready();toronto.api.remove('civic-library');
  const ottawa=runtime({cityId:'ottawa',storage:toronto.storage,training:{schemaVersion:1,id:'ottawa',careHomes:[],sharedLocations:[{...civic,id:'ottawa-library',cityId:'ottawa'}]}});
  await ottawa.api.ready();
  assert.deepEqual(plain(ottawa.api.getAll()).map(row=>row.id),['seed-1','ottawa-library']);
  assert.equal(toronto.api.getAll().length,1);
  const foreign=runtime({saved:{version:3,cityId:'ottawa',dataVersion:'test-1',items:[{...base,name:'Foreign Edit'}]}});
  await foreign.api.ready();assert.equal(foreign.api.getAll()[0].name,'Existing Site');
});

// Catches a lost service fallback when civic sources provide no scenario labels.
test('shared rows without scenario profiles get distinct Fire and EMS labels',async()=>{
  const row=plain(civic);delete row.incidentProfiles;
  const h=runtime({training:{schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[row]}});await h.api.ready();
  assert.equal(h.api.forService('fire').find(item=>item.id===row.id).sub,'Structure Fire');
  assert.equal(h.api.forService('ems').find(item=>item.id===row.id).sub,'Medical Assistance');
});

// Catches dropping new metadata for edited records from a pre-metadata snapshot.
test('old snapshots gain source metadata while retaining source-coordinate and difficulty edits',async()=>{
  const saved={version:3,cityId:'toronto',dataVersion:'test-1',items:[{...base,name:'Edited Seed',lat:43.6502,recognitionDifficulty:'medium'}]};
  const enriched={...base,locationKind:'hospital',difficultyReason:'Visible named hospital.',routeAccess:{lat:43.6501,lng:-79.3801},geographicVerificationRef:'cities/toronto/call-provenance.json#seed-1'};
  const h=runtime({saved,canonical:[enriched]});await h.api.ready();
  const row=plain(h.api.getAll())[0];
  assert.equal(row.name,'Edited Seed');assert.equal(row.lat,43.6502);assert.equal(row.recognitionDifficulty,'medium');
  assert.equal(row.locationKind,'hospital');assert.deepEqual(row.routeAccess,{lat:43.6501,lng:-79.3801});
  assert.equal(row.geographicVerificationRef,'cities/toronto/call-provenance.json#seed-1');
});

// Catches treating an official home already in the shared pool as a second EMS-only seed.
test('the same official care-home ID in both descriptor pools resolves once before enrichment',async()=>{
  const shared={...civic,id:'moh-ltc-7'};
  const h=runtime({training:{schemaVersion:1,id:'toronto',sharedLocations:[shared],careHomes:[{...shared,providerId:'7',facilityType:'long-term-care',trainingServices:['ems'],lat:43.65101}]}});
  await h.api.ready();
  const rows=plain(h.api.getAll());
  assert.deepEqual(rows.map(row=>row.id),['seed-1','moh-ltc-7']);
  assert.equal(rows[1].lat,43.651);assert.equal(rows[1].facilityType,'long-term-care');assert.equal(rows[1].providerId,'7');
  assert.equal(h.api.forService('fire').length,2);assert.equal(h.api.forService('ems').length,2);
});

// Catches widening supplemental tier validation to legacy seeds or ignored canonical duplicates.
test('existing seeds retain legacy missing-tier compatibility when repeated by canonical ID',async()=>{
  const legacy={...base};delete legacy.recognitionDifficulty;
  const duplicate={...legacy,cityId:'toronto'};
  const h=runtime({canonical:[legacy],training:{schemaVersion:1,id:'toronto',careHomes:[],sharedLocations:[duplicate]}});
  await h.api.ready();
  assert.equal(h.api.getAll().length,1);assert.equal(h.api.getAll()[0].recognitionDifficulty,null);
});
