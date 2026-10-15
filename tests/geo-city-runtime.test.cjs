'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {runtime}=require('./helpers/city-runtime.cjs');
test('explicit Geo city wins over remembered city and loads only selected static data',async()=>{
 const h=runtime({stored:'oshawa'});assert.ok(h.c.PTBO_GEO_CITY_READY,'shared city loader supplies readiness');await h.c.PTBO_GEO_CITY_READY;
 assert.equal(h.c.PTBO_CITY_PACKAGE.id,'toronto');assert.equal(h.c.PTBO_BASE_STORE.cityId,'toronto');assert.equal(h.c.PTBO_DISPATCH_STORE.cityId,'toronto');
 assert.equal(h.requested.length,1);assert.match(h.requested[0],/cities\/toronto\/geo-data.json/);
 assert.equal(h.c.PTBO_BASE_STORE.getBases('fire').length,1);assert.equal(h.c.PTBO_BASE_STORE.getBases('ems').length,1);assert.equal(h.c.PTBO_BASE_STORE.getHospital(),null);
 assert.equal(h.c.PTBO_DISPATCH_STORE.getAll()[0].addr,'3 Main St');assert.equal(h.storage.get('ptboSelectedCity'),'toronto');
});
test('city loading readiness waits for data and both shared stores',async()=>{
 const h=runtime({delayed:true});assert.ok(h.c.PTBO_GEO_CITY_READY);let ready=false;h.c.PTBO_GEO_CITY_READY.then(()=>ready=true);
 await new Promise(r=>setImmediate(r));assert.equal(ready,false);assert.equal(h.c.PTBO_BASE_STORE,undefined);h.release();await h.c.PTBO_GEO_CITY_READY;assert.equal(ready,true);assert.equal(h.c.PTBO_DISPATCH_STORE.getAll().length,1);
});
test('unknown or unsupported explicit Geo city fails rather than launching Peterborough',async()=>{
 for(const city of ['not-a-city','<script>','belleville','scarborough']){const h=runtime({search:'?city='+encodeURIComponent(city),stored:'peterborough'});assert.ok(h.c.PTBO_GEO_CITY_READY);await assert.rejects(h.c.PTBO_GEO_CITY_READY,/city|demo|available/i);assert.equal(h.requested.length,0);assert.equal(h.c.PTBO_CITY_PACKAGE,undefined);}
});
test('missing explicit city uses a supported remembered city and handles denied storage',async()=>{
 const h=runtime({search:'',stored:'toronto'});assert.ok(h.c.PTBO_GEO_CITY_READY);await h.c.PTBO_GEO_CITY_READY;assert.equal(h.c.PTBO_CITY_PACKAGE.id,'toronto');
 const denied=runtime({denied:true});await denied.c.PTBO_GEO_CITY_READY;assert.equal(denied.c.PTBO_CITY_PACKAGE.id,'toronto');
});
test('Peterborough keeps its existing package, shared 200 catalog and saved storage namespace',async()=>{
 const h=runtime({search:'?city=peterborough',stored:'toronto'});assert.ok(h.c.PTBO_GEO_CITY_READY);
 // The compressed production payload needs standard browser decompression facilities.
 h.c.atob=s=>Buffer.from(s,'base64').toString('binary');h.c.Uint8Array=Uint8Array;h.c.Response=Response;h.c.Blob=Blob;h.c.DecompressionStream=DecompressionStream;
 await h.c.PTBO_GEO_CITY_READY;assert.equal(h.c.PTBO_CITY_PACKAGE.id,'peterborough');assert.equal(h.c.PTBO_DISPATCH_STORE.getAll().length,200);assert.equal(h.requested.length,0);assert.match(h.c.PTBO_BASE_STORE.storageKey,/:peterborough$/);
});
test('failed fetch and wrong city payload reject readiness without installing stores',async()=>{
 const offline=runtime({fail:true});assert.ok(offline.c.PTBO_GEO_CITY_READY);await assert.rejects(offline.c.PTBO_GEO_CITY_READY,/Offline|load/i);assert.equal(offline.c.PTBO_BASE_STORE,undefined);
 const wrong=runtime({pack:{id:'oshawa'}});await assert.rejects(wrong.c.PTBO_GEO_CITY_READY,/city|data/i);assert.equal(wrong.c.PTBO_BASE_STORE,undefined);
});
test('null/blank call coordinates are rejected by the shared store',async()=>{
 const h=runtime();assert.ok(h.c.PTBO_GEO_CITY_READY);h.data.locations.push({...h.data.locations[0],id:'bad-null',lat:null},{...h.data.locations[0],id:'bad-empty',lng:''});await h.c.PTBO_GEO_CITY_READY;
 assert.deepEqual(Array.from(h.c.PTBO_DISPATCH_STORE.getAll(),r=>r.id),['call']);
});
test('saved base edits follow verified legacy IDs without rewriting the saved delta',async()=>{
 const h=runtime();assert.ok(h.c.PTBO_GEO_CITY_READY);h.data.bases[0].legacyIds=['fire-old-station-1'];
 const saved=JSON.stringify({schema:1,updated:[{id:'fire-old-station-1',changes:{lat:43.701,name:'My existing station edit'}}],added:[],deleted:[]});h.storage.set('ptboBaseLocationChangesV1:toronto',saved);
 await h.c.PTBO_GEO_CITY_READY;const fire=h.c.PTBO_BASE_STORE.getBases('fire');assert.equal(fire[0].name,'My existing station edit');assert.equal(fire[0].lat,43.701);assert.equal(fire[0].id,'fire-station-1');assert.equal(h.storage.get('ptboBaseLocationChangesV1:toronto'),saved);
});
test('null saved base coordinates fall back to the verified base instead of becoming zero',async()=>{
 const h=runtime();h.storage.set('ptboBaseLocationChangesV1:toronto',JSON.stringify({schema:1,updated:[{id:'fire-station-1',changes:{lat:null}}],added:[],deleted:[]}));await h.c.PTBO_GEO_CITY_READY;
 assert.equal(h.c.PTBO_BASE_STORE.getBases('fire')[0].lat,43.7);
});
