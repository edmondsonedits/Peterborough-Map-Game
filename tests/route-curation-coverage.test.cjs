'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),{loadCity}=require('../tools/build-city-route-challenges.cjs');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const ids=fs.readdirSync(path.join(root,'cities')).filter(id=>fs.existsSync(path.join(root,'cities',id,'geo-data.json'))||id==='peterborough').sort();
test('all 33 Ontario cities cover exactly 623 active Fire and EMS bases with 1869 meaningful associations',()=>{
 assert.equal(ids.length,33);let bases=0,challenges=0;
 for(const id of ids){
  const city=loadCity(id),manifest=read(`cities/${id}/route-data.json`),calls=new Map(city.calls.map(c=>[c.id,c]));
  assert.equal(manifest.schemaVersion,1,id);assert.equal(manifest.cityId,id);assert.equal(manifest.networkUrl,'route-network.js');assert.equal(manifest.baseCount,city.bases.length,id);assert.equal(manifest.coverage.length,city.bases.length,id);assert.equal(manifest.exceptions.length,0,id);assert.equal(manifest.recognitionPreserved,true,id);assert.equal(manifest.reviewComplete,false,id);assert.equal(manifest.readiness,'candidate-data',id);
  const covered=new Map(manifest.coverage.map(c=>[c.baseId,c]));
  for(const base of city.bases){
   const row=covered.get(base.id),access=manifest.baseAccess[base.id];assert.ok(row,`${id}/${base.id}`);assert.equal(row.service,base.service);assert.equal(row.meaningfulCount,3);assert.equal(row.callIds.length,3);assert.equal(new Set(row.callIds).size,3);assert.equal(row.accessReviewStatus,'needs-facility-review');assert.equal(access.graphVersion,manifest.graphVersion);assert.equal(access.reviewStatus,'map-derived');assert.match(access.sourceUrl,/^https:\/\/www\.openstreetmap\.org\/way\/\d+$/);assert.ok(Number.isFinite(access.wayId)&&Number.isFinite(access.sourceLat)&&Number.isFinite(access.sourceLng));
   for(const callId of row.callIds){const call=calls.get(callId);assert.ok(call,callId);const matches=call.routeChallenges.filter(c=>c.baseId===base.id&&c.service===base.service);assert.equal(matches.length,1,`${id}/${base.id}/${callId}`);const c=matches[0];assert.equal(c.graphVersion,manifest.graphVersion);assert.equal(c.costProfileVersion,manifest.costProfileVersion);assert.equal(c.reviewStatus,'map-derived');assert.ok(c.difficulty>=0&&c.difficulty<=100);assert.ok(c.preferredRoads.length&&c.alternatives.length);for(const a of c.alternatives){assert.ok(a.roads.length);assert.ok(a.estimatedSeconds>c.responseSeconds+Math.max(18,c.responseSeconds*.035)-.02);}}
  }
  assert.equal(manifest.challengeCount,city.bases.length*3,id);assert.equal(manifest.meaningfulChallengeCount,manifest.challengeCount,id);bases+=city.bases.length;challenges+=manifest.challengeCount;
 }
 assert.equal(bases,623);assert.equal(challenges,1869);
});
test('curation preserves all original recognition tiers and sources additional calls only from real OSM junctions',()=>{
 for(const id of ids){
  const city=loadCity(id);let original=[];
  try{const relative=id==='peterborough'?'shared/dispatch-data-1.4.4.js':`cities/${id}/geo-data.json`,head=cp.execFileSync('git',['show',`HEAD:${relative}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});original=id==='peterborough'?JSON.parse(zlib.gunzipSync(Buffer.from(head.match(/const PAYLOAD = '([^']+)'/)[1],'base64'))):JSON.parse(head).locations;}catch(error){if(!['belleville','scarborough'].includes(id))throw error;}
  original=original.filter(c=>!String(c.id).includes('-route-osm-node-'));
  if(id==='peterborough')assert.equal(original.length,200);else if(!['belleville','scarborough'].includes(id))assert.equal(original.length,20,id);
  const byId=new Map(city.calls.map(c=>[c.id,c]));for(const prior of original){assert.ok(byId.has(prior.id));assert.equal(byId.get(prior.id).recognitionDifficulty,prior.recognitionDifficulty,prior.id);}
  for(const call of city.calls.filter(c=>String(c.id).includes('-route-osm-node-'))){const osmId=call.id.split('-route-osm-node-')[1];assert.match(osmId,/^\d+$/);assert.equal(call.recognitionDifficulty,null);assert.equal(call.crossStreets.length,2);assert.equal(call.addr,call.crossStreets.join(' & '));assert.ok(call.sources.includes(`https://www.openstreetmap.org/node/${osmId}`));}
 }
});
