'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {registry,inputs,canonicalBases}=require('../tools/route-response-data.cjs');
const {dijkstra,costToAnchor}=require('../tools/build-local-response-calls.cjs');

test('response ownership uses direct fractional travel on the origin road and obeys its direction',()=>{
 class Heap{constructor(){this.items=[];}get size(){return this.items.length;}push(v){this.items.push(v);this.items.sort((a,b)=>a.score-b.score);}pop(){return this.items.shift();}}
 const segment={id:0,from:0,to:1,length:1000,forward:true,backward:true};
 const graph={segments:[segment],nodes:[{edges:[{to:1,segmentId:0,distance:1000,weight:100}]},{edges:[{to:0,segmentId:0,distance:1000,weight:100}]}]},api={state:{graph},MinHeap:Heap},origin={segmentId:0,t:.2};
 let index=dijkstra(api,[origin],'weight');
 assert.equal(costToAnchor(api,index,{segmentId:0,t:.4}),20);
 assert.equal(costToAnchor(api,index,{segmentId:0,t:.1}),10);
 assert.equal(costToAnchor(api,dijkstra(api,[origin],'distance'),{segmentId:0,t:.4},'distance'),200);
 segment.backward=false;graph.nodes[1].edges=[];index=dijkstra(api,[origin],'weight');
 assert.equal(costToAnchor(api,index,{segmentId:0,t:.1}),Infinity);
 assert.equal(costToAnchor(api,index,{segmentId:0,t:.4}),20);
 const multi=dijkstra(api,[origin,{segmentId:0,t:.3}],'weight');assert.ok(Math.abs(costToAnchor(api,multi,{segmentId:0,t:.4})-10)<1e-8);
});

test('every published hall has multiple individually assigned, sourced local response calls',async()=>{
 let halls=0,total=0;
 for(const city of registry.filter(c=>c.modes.route)){
  const {training,bases:raw}=await inputs(city),bases=canonicalBases(city,raw),manifest=training.routeResponses;
  assert.equal(manifest?.schemaVersion,1,city.id+' needs a local response manifest');
  assert.equal(manifest.bases.length,bases.length,city.id+' covers every hall');
  assert.ok(manifest.minCallsPerBase>=3);
  const calls=new Map(training.routeCalls.map(call=>[call.id,call]));
  assert.equal(calls.size,training.routeCalls.length);
  const assigned=new Set();
  assert.deepEqual(manifest.bases.map(p=>p.baseId).sort(),Array.from(bases,b=>b.id).sort(),city.id+' uses production base identities');
  for(const profile of manifest.bases){
   halls++;assert.ok(!profile.unavailable,city.id+' '+profile.baseId+' must have playable local calls');
   assert.ok(profile.callIds.length>=manifest.minCallsPerBase,profile.baseId);
   assert.ok(profile.access.gapMetres<=260);
   assert.ok(['official-run-area','modeled-road-response'].includes(profile.method));
   assert.ok(profile.maxRouteMetres>0&&profile.maxRouteMetres<=15000);
   for(const id of profile.callIds){
    const call=calls.get(id);assert.ok(call,id);assert.ok(!assigned.has(id),id+' must have one owner');assigned.add(id);total++;
    assert.equal(call.routeBaseId,profile.baseId);assert.deepEqual(call.trainingServices,[profile.service]);
    assert.equal(call.main,profile.service==='fire'?'Fire':'Medical');assert.ok(call.incidentProfiles[profile.service]?.sub);
    assert.ok(call.addr&&call.sources.every(url=>/^https:\/\//.test(url))&&call.sources.length);
    assert.ok(Number.isFinite(call.lat)&&Number.isFinite(call.lng));
    assert.ok(call.routeQuality.routeMetres>0&&call.routeQuality.routeMetres<=profile.maxRouteMetres);
    assert.ok(Number.isInteger(call.routeQuality.meaningfulDecisions));
    assert.equal(call.simulatedIncident,true,'incidents are training scenarios at real mapped locations');
    if(call.locationKind==='mapped-intersection')assert.ok(call.osmWays.length>=2&&call.osmWays.every(id=>/^way\/\d+$/.test(id)),id+' retains actual source ways');
   }
  }
  assert.equal(assigned.size,calls.size,city.id+' has no unassigned local calls');
 }
 assert.equal(halls,606);assert.ok(total>=1818);
});
