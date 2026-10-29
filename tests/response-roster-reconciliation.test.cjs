'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reconcile}=require('../tools/reconcile-response-roster.cjs');
function descriptor(calls){return {sharedLocations:[{id:'canonical-preserved'}],routeCalls:calls,routeResponses:{bases:[{baseId:'hall',maxRouteMetres:3000,callIds:calls.map(c=>c.id),access:{lat:1,lng:2}}]}};}
const call=(id,addr,lat=44)=>({id,addr,lat,lng:-79,routeBaseId:'hall'});
test('valid previous destinations retain their identities when station access is refreshed',()=>{
 const old=descriptor([call('old-1','1 Main St'),call('old-2','2 Main St'),call('old-3','3 Main St')]);
 const fresh=descriptor([call('old-1','10 Main St'),call('old-2','20 Main St'),call('old-3','30 Main St'),call('new-4','40 Main St'),call('new-5','50 Main St'),call('new-6','60 Main St')]);
 fresh.routeResponses.bases[0].access={lat:3,lng:4};
 const before=JSON.stringify(old),result=reconcile(old,fresh,new Map(old.routeCalls.map(c=>[c.id,{valid:true}])));
 assert.equal(JSON.stringify(old),before,'source descriptor is unchanged');
 assert.deepEqual(result.training.routeCalls.slice(0,3),old.routeCalls);
 assert.deepEqual(result.training.sharedLocations,old.sharedLocations);
 assert.deepEqual(result.training.routeResponses.bases[0].access,{lat:3,lng:4});
 assert.equal(result.training.routeCalls.length,6);
 assert.equal(new Set(result.training.routeCalls.map(c=>c.id)).size,6);
 assert.equal(result.report.retained,3);
 assert.ok(result.training.routeCalls.slice(3).every(c=>!old.routeCalls.some(o=>o.id===c.id)),'different destinations cannot inherit occupied exercise IDs');
});
test('roster regeneration retains earlier retirement and review annotations',()=>{
 const old=descriptor([call('a','1 Main St'),call('b','2 Main St'),call('c','3 Main St')]);
 old.routeResponses.retiredExercises=[{id:'retired-earlier',reason:'documented earlier correction'}];
 old.routeResponses.baseAccessUpdatedOn='2026-10-29';
 const fresh=descriptor(old.routeCalls);
 const result=reconcile(old,fresh,new Map(old.routeCalls.map(c=>[c.id,{valid:true}])));
 assert.deepEqual(result.training.routeResponses.retiredExercises,old.routeResponses.retiredExercises);
 assert.equal(result.training.routeResponses.baseAccessUpdatedOn,'2026-10-29');
});
test('a retained junction refreshes its source ways without changing the destination identity',()=>{
 const junction={...call('junction','Main St & Side St'),locationKind:'mapped-intersection',osmWays:['way/1','way/2','way/3'],sources:['https://www.openstreetmap.org/way/1','https://www.openstreetmap.org/way/2','https://www.openstreetmap.org/way/3']};
 const old=descriptor([junction,call('b','2 Main St'),call('c','3 Main St')]);
 const decisions=new Map(old.routeCalls.map(c=>[c.id,{valid:true}]));decisions.get('junction').sourceWays=['way/1','way/2'];
 const result=reconcile(old,descriptor(old.routeCalls),decisions),updated=result.training.routeCalls[0];
 assert.equal(updated.id,junction.id);assert.equal(updated.lat,junction.lat);assert.equal(updated.lng,junction.lng);assert.equal(updated.addr,junction.addr);
 assert.deepEqual(updated.osmWays,['way/1','way/2']);assert.deepEqual(updated.sources,['https://www.openstreetmap.org/way/1','https://www.openstreetmap.org/way/2']);
 assert.deepEqual(junction.osmWays,['way/1','way/2','way/3'],'input evidence remains unchanged');
});
test('a destination outside the revised district is retired with its reason and replaced under a new identity',()=>{
 const old=descriptor([call('old-1','1 Main St'),call('old-2','2 Main St'),call('old-3','3 Main St')]);
 const fresh=descriptor([call('old-1','11 Main St'),call('old-2','2 Main St'),call('old-3','3 Main St')]);
 const result=reconcile(old,fresh,new Map([['old-1',{valid:false,reason:'outside-revised-area'}],['old-2',{valid:true}],['old-3',{valid:true}]]));
 assert.ok(!result.training.routeCalls.some(c=>c.id==='old-1'));
 assert.ok(result.training.routeCalls.some(c=>c.addr==='11 Main St'&&c.id.startsWith('route-roster-hall-')));
 assert.deepEqual(result.report.retired,[{id:'old-1',baseId:'hall',address:'1 Main St',reason:'outside-revised-area'}]);
});
