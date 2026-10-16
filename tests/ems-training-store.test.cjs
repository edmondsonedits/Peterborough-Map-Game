'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function runtime({failFirst = false, hangFirst = false, hangScriptFirst = false, timeoutMs = 12000, saved = false, trainingData, cityId = 'toronto', canonicalRecords} = {}) {
  const storage = new Map();
  const firstCanonical = {id:'dispatch-canonical',main:'Medical',sub:'Medical Assistance',name:'Original Care Site',addr:'50 Elm Street',lat:44.3,lng:-78.3,radius:80,recognitionDifficulty:'hard'};
  const canonical = canonicalRecords || [firstCanonical];
  if (saved) storage.set(`ptboSharedDispatchLocationsV3:${cityId}`,JSON.stringify({version:3,cityId,dataVersion:'test-1',items:[{...firstCanonical,name:'Saved Care Site',lat:firstCanonical.lat+0.0003}]}));
  const urls = [], scripts = [];
  const training = trainingData || {schemaVersion:1,id:cityId,roadsUrl:'https://example.test/roads.geojson',center:[44.3,-78.3],careHomes:[
    {id:'moh-ltc-101',name:'Published Care Site',addr:'50 Elm Street',lat:44.3003,lng:-78.3,radius:65,facilityType:'long-term-care',recognitionDifficulty:'medium',main:'Medical',sub:'Medical Assistance',incidentProfiles:{ems:{sub:'Medical Assistance'}},sources:['MOHSERLO'],providerId:'101',community:'Toronto'},
    {id:'moh-ltc-202',name:'New Care Site',addr:'9 Oak Road',lat:44.31,lng:-78.31,radius:65,facilityType:'long-term-care',recognitionDifficulty:'medium',main:'Medical',sub:'Medical Assistance',incidentProfiles:{ems:{sub:'Medical Assistance'}},trainingServices:['ems'],sources:['MOHSERLO'],providerId:'202',community:'Toronto'},
  ]};
  const c = vm.createContext({console,URL,URLSearchParams,Math,Number,Object,Array,JSON,Date,setTimeout,clearTimeout,AbortController,
    location:{href:`https://example.test/geo-guesser/?city=${cityId}`},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    PTBO_DISPATCH_DATA_VERSION:'test-1',PTBO_DISPATCH_DATA_READY:Promise.resolve(canonical),
    PTBO_TRAINING_DATA_TIMEOUT_MS:timeoutMs,
    fetch:async url=>{urls.push(String(url));if(hangFirst&&urls.length===1)return new Promise(()=>{});if(failFirst&&urls.length===1)return{ok:false,status:503,json:async()=>({})};return{ok:true,status:200,json:async()=>structuredClone(training)};},
    document:{currentScript:{src:`https://example.test/shared/dispatch-locations.js?city=${cityId}&v=1.6.112`},scripts,createElement:()=>({dataset:{},addEventListener(){},remove(){scripts.splice(scripts.indexOf(this),1);}}),head:{appendChild:script=>{scripts.push(script);if(hangScriptFirst){hangScriptFirst=false;return;}if(script.src.includes('ems-priority.js')){vm.runInContext(read('shared/ems-priority.js'),c);script.onload();}}}},
    dispatchEvent(){},CustomEvent:class{}});
  c.window=c;
  vm.runInContext(read('shared/dispatch-locations.js'),c);
  return{api:c.PTBO_DISPATCH_STORE,urls,scripts,storage,training};
}

test('store fetches selected-city training descriptor once and preserves canonical IDs, coordinates, difficulty, and saved edits', async()=>{
  const h=runtime({saved:true});
  await Promise.all([h.api.ready(),h.api.ready()]);
  const calls=h.api.getAll();
  assert.equal(h.urls.length,1);
  assert.equal(h.urls[0],'https://example.test/cities/toronto/training-data.json?v=1.6.112');
  assert.equal(h.scripts.filter(s=>s.src.includes('ems-priority.js')).length,1);
  assert.equal(calls.length,2);
  const matched=calls.find(c=>c.id==='dispatch-canonical');
  assert.equal(matched.name,'Saved Care Site');
  assert.equal(matched.lat,44.3003);
  assert.equal(matched.recognitionDifficulty,'hard');
  assert.equal(matched.facilityType,'long-term-care');
  assert.equal(matched.providerId,'101');
  assert.equal(matched.community,'Toronto');
  const added=calls.find(c=>c.id==='moh-ltc-202');
  assert.equal(added.recognitionDifficulty,'medium');
  assert.deepEqual(Array.from(added.trainingServices),['ems']);
  assert.equal(added.providerId,'202');
  assert.equal(h.api.forService('fire').length,1);
  assert.equal(h.api.forService('ems').length,2);
  assert.deepEqual(Array.from(h.api.getTrainingData().careHomes,c=>c.id),['moh-ltc-101','moh-ltc-202']);
  const descriptor=h.api.getTrainingData();descriptor.careHomes[0].lat=0;
  assert.equal(h.api.getTrainingData().careHomes[0].lat,44.3003);
});

test('failed training descriptor load rejects ready and permits retry instead of silently omitting care homes', async()=>{
  const h=runtime({failFirst:true});
  await assert.rejects(h.api.ready(),/training data|training-data|503/i);
  assert.equal(h.api.getAll().length,0);
  await h.api.ready();
  assert.equal(h.api.getAll().length,2);
  assert.equal(h.urls.length,2);
});

test('a stalled policy script rejects readiness and removes the failed node before retry',{timeout:300},async()=>{
 const h=runtime({hangScriptFirst:true,timeoutMs:15});
 await assert.rejects(h.api.ready(),/timed out/i);
 assert.equal(h.scripts.length,0);
 await h.api.ready();assert.equal(h.api.getAll().length,2);
});

test('hung training descriptor request times out promptly and the store can retry', async()=>{
  const h=runtime({hangFirst:true,timeoutMs:15});
  const started=Date.now();
  await assert.rejects(h.api.ready(),/training data for toronto timed out after 15 ms/i);
  assert.ok(Date.now()-started<500,'training readiness must not wait indefinitely');
  assert.equal(h.api.getAll().length,0);
  await h.api.ready();
  assert.equal(h.api.getAll().length,2);
  assert.equal(h.urls.length,2);
});

test('Peterborough training homes all resolve to marked canonical calls or EMS-only additions',async()=>{
  const encoded=read('shared/dispatch-data-1.4.4.js').match(/const PAYLOAD = '([^']+)'/)[1];
  const canonical=JSON.parse(zlib.gunzipSync(Buffer.from(encoded,'base64')));
  const descriptor=JSON.parse(read('cities/peterborough/training-data.json'));
  const h=runtime({cityId:'peterborough',canonicalRecords:canonical,trainingData:descriptor});
  await h.api.ready();
  const getKey=value=>String(value||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const distance=(a,b)=>{const radians=value=>value*Math.PI/180,lat=radians(b.lat-a.lat),lng=radians(b.lng-a.lng),h=Math.sin(lat/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(lng/2)**2;return 6371000*2*Math.asin(Math.sqrt(h));};
  const records=h.api.getAll(),seed=h.api.getSeed();
  assert.equal(records.length,new Set(records.map(record=>record.id)).size);
  assert.equal(h.api.forService('fire').length,canonical.length);
  assert.equal(h.api.forService('ems').length,canonical.length+descriptor.careHomes.filter(home=>!canonical.some(call=>getKey(call.addr)===getKey(home.addr)&&distance(call,home)<100)).length);
  for(const home of descriptor.careHomes){
    const match=canonical.filter(call=>getKey(call.addr)===getKey(home.addr)&&distance(call,home)<100).sort((a,b)=>distance(a,home)-distance(b,home))[0];
    const record=records.find(item=>item.id===(match?.id||home.id));
    assert.ok(record,home.id);
    assert.equal(record.facilityType,'long-term-care');
    if(match){assert.equal(record.lat,match.lat);assert.equal(record.lng,match.lng);assert.equal(record.recognitionDifficulty,match.recognitionDifficulty);}
    else assert.deepEqual(Array.from(record.trainingServices),['ems']);
  }
  assert.deepEqual(seed.map(item=>item.id).slice(0,canonical.length),canonical.map(item=>item.id));
});
