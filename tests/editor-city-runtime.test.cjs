'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runtime}=require('./helpers/city-runtime.cjs'),root=path.resolve(__dirname,'..');
const readJson=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
function actualRuntime(id,options={}){return runtime({search:'?city='+id,pack:readJson(`cities/${id}/geo-data.json`),training:readJson(`cities/${id}/training-data.json`),...options});}
test('all 32 Geo packs load the same canonical city catalog in editor and Geo stores',async()=>{
 const ids=fs.readdirSync(path.join(root,'cities')).filter(id=>fs.existsSync(path.join(root,'cities',id,'geo-data.json')));assert.equal(ids.length,32);let total=0;
 for(const id of ids){
  const pack=readJson(`cities/${id}/geo-data.json`),training=readJson(`cities/${id}/training-data.json`),editor=actualRuntime(id,{context:'editor'}),geo=actualRuntime(id);
  await Promise.all([editor.c.PTBO_EDITOR_CITY_READY,geo.c.PTBO_GEO_CITY_READY]);
  const rows=editor.c.PTBO_DISPATCH_STORE.getAll(),byId=new Map(rows.map(row=>[row.id,row]));
  assert.equal(editor.c.PTBO_DISPATCH_STORE.cityId,id);assert.equal(editor.c.PTBO_BASE_STORE.cityId,id);
  assert.deepEqual(JSON.parse(JSON.stringify(rows)),JSON.parse(JSON.stringify(geo.c.PTBO_DISPATCH_STORE.getAll())),id+' editor and Geo use the same source');
  assert.equal(byId.size,rows.length,id+' unique stored identities');
  for(const source of [...pack.locations,...training.sharedLocations]){
   const row=byId.get(source.id);assert.ok(row,id+' retains source '+source.id);assert.equal(row.addr,source.addr);assert.equal(row.lat,source.lat);assert.equal(row.lng,source.lng);
  }
  const common=rows.filter(row=>!row.trainingServices||['fire','ems'].every(service=>row.trainingServices.includes(service)));
  for(const [tier,min] of Object.entries({easy:100,medium:50,hard:50}))assert.ok(common.filter(row=>row.recognitionDifficulty===tier).length>=min,id+' '+tier+' canonical floor');
  assert.equal(editor.c.PTBO_DISPATCH_STORE.dataVersion,pack.dispatchDataVersion||'ontario-geo-1');assert.equal(editor.requested.length,1);assert.match(editor.requested[0],new RegExp(`cities/${id}/geo-data.json`));
  assert.equal(editor.trainingRequested.length,1);assert.match(editor.trainingRequested[0],new RegExp(`cities/${id}/training-data.json`));total+=common.length;
 }assert.ok(total>=32*200);
});
test('editor and Geo restore the same saved canonical edit and deletion without affecting another city',async()=>{
 const editor=actualRuntime('ottawa',{context:'editor'});assert.ok(editor.c.PTBO_EDITOR_CITY_READY);await editor.c.PTBO_EDITOR_CITY_READY;
 const [callId,deletedId]=readJson('cities/ottawa/training-data.json').sharedLocations.slice(0,2).map(row=>row.id);
 const call=editor.c.PTBO_DISPATCH_STORE.getAll().find(row=>row.id===callId);editor.c.PTBO_DISPATCH_STORE.upsert({...call,name:'Saved Ottawa edit'});editor.c.PTBO_DISPATCH_STORE.remove(deletedId);
 const geo=actualRuntime('ottawa');geo.storage.set('ptboSharedDispatchLocationsV3:ottawa',editor.storage.get('ptboSharedDispatchLocationsV3:ottawa'));await geo.c.PTBO_GEO_CITY_READY;assert.equal(geo.c.PTBO_DISPATCH_STORE.getAll().find(row=>row.id===callId).name,'Saved Ottawa edit');assert.ok(!geo.c.PTBO_DISPATCH_STORE.getAll().some(row=>row.id===deletedId));
 const toronto=actualRuntime('toronto',{context:'editor'});await toronto.c.PTBO_EDITOR_CITY_READY;assert.notEqual(toronto.c.PTBO_DISPATCH_STORE.getAll()[0].name,'Saved Ottawa edit');
});
test('Belleville and Scarborough load their own published calls while retaining empty legacy seeds',async()=>{
 for(const id of ['belleville','scarborough']){
  const h=actualRuntime(id,{context:'editor'});assert.equal(h.data.locations.length,0);await h.c.PTBO_EDITOR_CITY_READY;
  assert.equal(h.c.PTBO_CITY_PACKAGE.id,id);assert.equal(h.c.PTBO_DISPATCH_STORE.cityId,id);
  const rows=h.c.PTBO_DISPATCH_STORE.getAll();assert.ok(rows.length>=200);assert.ok(rows.every(row=>row.cityId===id||row.trainingServices?.length===1&&row.trainingServices[0]==='ems'));
  assert.equal(h.requested.length,1);assert.match(h.requested[0],new RegExp(`cities/${id}/geo-data.json`));assert.equal(h.trainingRequested.length,1);
 }
});
test('an invalid explicit editor city rejects without installing a Peterborough store',async()=>{
 const h=runtime({context:'editor',search:'?city=unknown',stored:'peterborough'});assert.ok(h.c.PTBO_EDITOR_CITY_READY);await assert.rejects(h.c.PTBO_EDITOR_CITY_READY,/city|available/i);assert.equal(h.c.PTBO_DISPATCH_STORE,undefined);
});
test('Peterborough editor retains its original two hundred benchmark seed calls',async()=>{
 const h=runtime({context:'editor',search:'?city=peterborough'});assert.ok(h.c.PTBO_EDITOR_CITY_READY);Object.assign(h.c,{atob:s=>Buffer.from(s,'base64').toString('binary'),Uint8Array,Response,Blob,DecompressionStream});
 await h.c.PTBO_EDITOR_CITY_READY;assert.equal(h.c.PTBO_DISPATCH_STORE.getAll().length,200);assert.equal(h.c.PTBO_BASE_STORE.getBases('fire').length,3);assert.ok(h.c.PTBO_BASE_STORE.getHospital());
});
