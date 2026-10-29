'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../cities/belleville/training-data.json');
const {localPool}=require('../response-simulator/local-pool.js');
const pool=(base,service,canonical=data.sharedLocations)=>localPool(data,canonical,{cityId:'belleville',id:base,service});
test('station and service isolate sourced calls, retaining modeled support assignments',()=>{
 const calls=pool('fire-fire-station-1-1','fire');assert.ok(calls.length);assert.ok(calls.some(c=>c.responseAssignment.role==='support'));
 assert.ok(calls.every(c=>c.routeBaseId==='fire-fire-station-1-1'&&c.trainingServices[0]==='fire'&&c.locationKind==='sourced-address'));
 assert.deepEqual(pool('fire-fire-station-1-1','ems'),[]);
});
test('deleted or modified canonical locations are not silently dispatched using stale routes',()=>{
 const first=pool('fire-fire-station-1-1','fire')[0];
 assert.ok(!pool('fire-fire-station-1-1','fire',data.sharedLocations.filter(c=>c.id!==first.canonicalCallId)).some(c=>c.id===first.id));
 const edited=data.sharedLocations.map(c=>c.id===first.canonicalCallId?{...c,lat:c.lat+.01}:c);
 assert.ok(!pool('fire-fire-station-1-1','fire',edited).some(c=>c.id===first.id));
});
test('mismatched city fails closed',()=>assert.deepEqual(localPool(data,data.sharedLocations,{cityId:'other',id:'fire-fire-station-1-1',service:'fire'}),[]));
test('saved canonical display edits are shown without replacing exercise identity or provenance',()=>{
 const original=pool('fire-fire-station-1-1','fire')[0];
 const edited=data.sharedLocations.map(c=>c.id===original.canonicalCallId?{...c,name:'User edited name',crossStreets:['Saved cross street'],recognitionDifficulty:'hard',difficultyReason:'Saved clue',sources:['changed-source']}:c);
 const result=pool('fire-fire-station-1-1','fire',edited).find(c=>c.id===original.id);
 assert.equal(result.name,'User edited name');assert.deepEqual(result.crossStreets,['Saved cross street']);assert.equal(result.recognitionDifficulty,'hard');assert.equal(result.difficultyReason,'Saved clue');
 assert.equal(result.routeBaseId,original.routeBaseId);assert.deepEqual(result.responseAssignment,original.responseAssignment);assert.deepEqual(result.routeAccess,original.routeAccess);assert.deepEqual(result.sources,original.sources);
});
test('audited mapped intersections supply a fallback for a base without enough civic calls',()=>{
 const toronto=require('../cities/toronto/training-data.json'),base={cityId:'toronto',id:'fire-toronto-fire-335',service:'fire'};
 const withoutCivic={...toronto,routeCalls:toronto.routeCalls.filter(c=>!(c.routeBaseId===base.id&&c.locationKind==='sourced-address'))};
 const calls=localPool(withoutCivic,toronto.sharedLocations,base);
 assert.ok(calls.length>=3);assert.ok(calls.every(c=>c.locationKind==='mapped-intersection'&&c.name===c.addr&&c.name.includes(' & ')&&c.simulatedIncident));
 const bad=JSON.parse(JSON.stringify(toronto)),one=bad.routeCalls.find(c=>c.id===calls[0].id);one.sources=[];
 assert.ok(!localPool(bad,bad.sharedLocations,base).some(c=>c.id===one.id));
 one.sources=['https://www.openstreetmap.org/way/1005985765','https://www.openstreetmap.org/way/100974747'];one.cityId='oshawa';
 assert.ok(!localPool(bad,bad.sharedLocations,base).some(c=>c.id===one.id));
 assert.deepEqual(localPool(toronto,toronto.sharedLocations,{...base,service:'ems'}),[]);
});

test('reviewed Island civic exercise is retained with intersections for both local services',()=>{
 const t=require('../cities/toronto/training-data.json');
 for(const [service,id] of [['fire','fire-toronto-fire-335'],['ems','ems-toronto-ems-4173463']]){
  const calls=localPool(t,t.sharedLocations,{cityId:'toronto',id,service}),civic=calls.filter(c=>c.canonicalCallId==='toronto-osm-node-13854671025');
  assert.equal(civic.length,1);assert.equal(civic[0].addr,'355 Lakeshore Avenue');assert.equal(civic[0].routeAccess.publicRoad,false);assert.equal(civic[0].routeAccess.sourceAccessRestrictions.motor_vehicle,'private');
  assert.ok(calls.filter(c=>c.locationKind==='mapped-intersection').length>=3,'fallback supplements sparse civic pool');
 }
});

test('Island civic fails closed for altered city, supplement policy, source way, or unchecked source',()=>{
 const t=require('../cities/toronto/training-data.json'),base={cityId:'toronto',id:'fire-toronto-fire-335',service:'fire'};
 const has=(data,canonical=data.sharedLocations)=>localPool(data,canonical,base).some(c=>c.canonicalCallId==='toronto-osm-node-13854671025');
 assert.ok(has(t));
 for(const mutate of [
  d=>{d.id='other'},
  d=>{d.roadSource.emergencyAccessSupplement.officialPolicyUrl='https://example.test/unreviewed'},
  d=>{d.roadSource.emergencyAccessSupplement.excludedWayIds.push('way/7779153')},
  d=>{d.routeCalls.find(c=>c.canonicalCallId==='toronto-osm-node-13854671025'&&c.routeBaseId===base.id).routeAccess.sourceWayId='way/1'},
  d=>{d.routeCalls.find(c=>c.canonicalCallId==='toronto-osm-node-13854671025'&&c.routeBaseId===base.id).sources=[]},
  d=>{d.routeCalls.find(c=>c.canonicalCallId==='toronto-osm-node-13854671025'&&c.routeBaseId===base.id).routeAccess.publicRoad=true},
 ]){const bad=structuredClone(t);mutate(bad);assert.ok(!has(bad));}
 const canonical=structuredClone(t.sharedLocations);canonical.find(c=>c.id==='toronto-osm-node-13854671025').routeAccess.sourceAccessRestrictions.motor_vehicle='yes';assert.ok(!has(t,canonical));
});

test('Island supplement snapshot and reviewed source way retain their audited identity',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const bytes=fs.readFileSync(path.join(__dirname,'../cities/toronto/emergency-access-roads.geojson'));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'e2a3b85c2b10a8b2b6f98610a5d7b33919feacd640180044f7d47fae14cd9e8c');
 const extra=JSON.parse(bytes),way=extra.features.find(x=>x.id==='way/7779153');
 assert.equal(extra.features.length,33);assert.equal(way.properties.trainingEmergencyAccess,true);assert.equal(way.properties.motor_vehicle,'private');assert.equal(way.properties.sourceUrl,'https://www.openstreetmap.org/way/7779153');
});
