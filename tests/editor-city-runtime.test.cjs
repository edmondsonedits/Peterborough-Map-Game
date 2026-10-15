'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runtime}=require('./helpers/city-runtime.cjs'),root=path.resolve(__dirname,'..');
test('all thirty demo catalogs load in the editor through the same city-scoped stores as Geo',async()=>{
 const ids=fs.readdirSync(path.join(root,'cities')).filter(id=>!['belleville','scarborough'].includes(id)&&fs.existsSync(path.join(root,'cities',id,'geo-data.json')));assert.equal(ids.length,30);let total=0;
 for(const id of ids){const pack=JSON.parse(fs.readFileSync(path.join(root,'cities',id,'geo-data.json'))),h=runtime({context:'editor',search:'?city='+id,pack});assert.ok(h.c.PTBO_EDITOR_CITY_READY,'editor uses shared city runtime');await h.c.PTBO_EDITOR_CITY_READY;
  assert.equal(h.c.PTBO_DISPATCH_STORE.cityId,id);assert.equal(h.c.PTBO_BASE_STORE.cityId,id);assert.deepEqual(Array.from(h.c.PTBO_DISPATCH_STORE.getAll(),r=>r.id),pack.locations.map(r=>r.id));
  assert.equal(h.c.PTBO_DISPATCH_STORE.getAll().length,pack.locations.length);assert.deepEqual(['easy','medium','hard'].map(tier=>pack.locations.filter(item=>item.recognitionDifficulty===tier).length),[10,5,5]);assert.equal(h.c.PTBO_DISPATCH_STORE.dataVersion,'ontario-geo-1');assert.equal(h.requested.length,2);assert.match(h.requested[1],new RegExp(`cities/${id}/route-data.json`));assert.match(h.requested[0],new RegExp(`cities/${id}/geo-data.json`));total+=pack.locations.filter(item=>item.recognitionDifficulty!==null).length;
 }assert.equal(total,600);
});
test('editor and Geo restore exactly the same saved address edit without affecting another city',async()=>{
 const pack=JSON.parse(fs.readFileSync(path.join(root,'cities/ottawa/geo-data.json'))),editor=runtime({context:'editor',search:'?city=ottawa',pack});assert.ok(editor.c.PTBO_EDITOR_CITY_READY);await editor.c.PTBO_EDITOR_CITY_READY;
 const call=editor.c.PTBO_DISPATCH_STORE.getAll()[0];editor.c.PTBO_DISPATCH_STORE.upsert({...call,name:'Saved Ottawa edit'});
 const geo=runtime({search:'?city=ottawa',pack});geo.storage.set('ptboSharedDispatchLocationsV3:ottawa',editor.storage.get('ptboSharedDispatchLocationsV3:ottawa'));await geo.c.PTBO_GEO_CITY_READY;assert.equal(geo.c.PTBO_DISPATCH_STORE.getAll()[0].name,'Saved Ottawa edit');
 const toronto=runtime({context:'editor',search:'?city=toronto'});await toronto.c.PTBO_EDITOR_CITY_READY;assert.notEqual(toronto.c.PTBO_DISPATCH_STORE.getAll()[0].name,'Saved Ottawa edit');
});
test('legacy cities load their canonical route catalogs without enabling Geo familiarity tiers',async()=>{
 for(const id of ['belleville','scarborough']){const pack=JSON.parse(fs.readFileSync(path.join(root,'cities',id,'geo-data.json'))),h=runtime({context:'editor',search:'?city='+id,pack});assert.ok(h.c.PTBO_EDITOR_CITY_READY);await h.c.PTBO_EDITOR_CITY_READY;assert.equal(h.c.PTBO_CITY_PACKAGE.id,id);assert.equal(h.c.PTBO_DISPATCH_STORE.getAll().length,pack.locations.length);assert.ok(h.c.PTBO_DISPATCH_STORE.getAll().every(item=>item.recognitionDifficulty===null));assert.equal(h.requested.length,2);}
});
test('an invalid explicit editor city rejects without installing a Peterborough store',async()=>{
 const h=runtime({context:'editor',search:'?city=unknown',stored:'peterborough'});assert.ok(h.c.PTBO_EDITOR_CITY_READY);await assert.rejects(h.c.PTBO_EDITOR_CITY_READY,/city|available/i);assert.equal(h.c.PTBO_DISPATCH_STORE,undefined);
});
test('Peterborough editor retains its two hundred Geo familiarity assignments alongside route exercises',async()=>{
 const h=runtime({context:'editor',search:'?city=peterborough'});assert.ok(h.c.PTBO_EDITOR_CITY_READY);Object.assign(h.c,{atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,Response,Blob,DecompressionStream});
 await h.c.PTBO_EDITOR_CITY_READY;assert.deepEqual(['easy','medium','hard'].map(tier=>h.c.PTBO_DISPATCH_STORE.getAll().filter(item=>item.recognitionDifficulty===tier).length),[100,50,50]);assert.equal(h.c.PTBO_BASE_STORE.getBases('fire').length,3);assert.ok(h.c.PTBO_BASE_STORE.getHospital());assert.ok(h.c.PTBO_DISPATCH_STORE.getAll().length>=200);
});
