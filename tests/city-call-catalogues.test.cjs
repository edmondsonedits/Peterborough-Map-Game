'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {registry,inputs,root}=require('../tools/route-response-data.cjs');

test('every city supplies Peterborough-scale recognition pools to both services',async()=>{
 for(const city of registry){
  assert.equal(city.modes.geo,true,city.id+' has an explicit Geo capability');
  const {calls}=await inputs(city);
  const locations=calls.filter(c=>!c.id.startsWith('route-base-'));
  assert.equal(new Set(locations.map(c=>c.id)).size,locations.length,city.id+' unique runtime identities');
  for(const service of ['fire','ems']){
   const eligible=locations.filter(c=>!Array.isArray(c.trainingServices)||c.trainingServices.includes(service));
   for(const [tier,minimum] of Object.entries({easy:100,medium:50,hard:50})){
    assert.ok(eligible.filter(c=>c.recognitionDifficulty===tier).length>=minimum,`${city.id}/${service}/${tier} requires ${minimum} actual locations`);
   }
  }
 }
});

test('every supplemental location resolves to source-point and road evidence in its own city',async()=>{
 for(const city of registry.filter(c=>c.id!=='peterborough')){
  const {training}=await inputs(city),rows=training.sharedLocations;
  assert.ok(Array.isArray(rows)&&rows.length>=150,city.id+' has a substantial civic expansion');
  const evidence=JSON.parse(fs.readFileSync(path.join(root,`cities/${city.id}/call-provenance.json`)));
  assert.equal(evidence.cityId,city.id);
  assert.deepEqual(Object.keys(evidence.records).sort(),rows.map(c=>c.id).sort(),city.id+' no missing or orphaned provenance');
  const roadHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,training.roadsUrl))).digest('hex');
  assert.equal(evidence.roadSnapshot.packagedFileSha256,roadHash,city.id+' evidence matches packaged roads');
  for(const row of rows){
   const record=evidence.records[row.id];
   assert.equal(row.cityId,city.id,row.id);
   assert.equal(row.geographicVerificationRef,`cities/${city.id}/call-provenance.json#${row.id}`);
   assert.equal(row.locationKind,'sourced-address');
   assert.ok(Number.isFinite(row.lat)&&Number.isFinite(row.lng)&&row.radius>0&&row.radius<=100,row.id);
   assert.deepEqual({lat:record.sourcePoint.lat,lng:record.sourcePoint.lng},{lat:row.lat,lng:row.lng},row.id+' preserves source geometry');
   assert.ok(record.licence&&record.retrievedAt,row.id+' records source reuse and retrieval');
   assert.deepEqual(row.sources,record.sourceUrls,row.id+' source links are not dropped');
   assert.ok(row.sources.length&&row.sources.every(s=>/^https:\/\//.test(s)),row.id);
   assert.ok(['easy','medium','hard'].includes(row.recognitionDifficulty)&&row.difficultyReason,row.id);
   assert.ok(row.incidentProfiles.fire.sub&&row.incidentProfiles.ems.sub,row.id+' has both fictional service profiles');
   assert.ok(row.crossStreets.length<=2,row.id);
   assert.equal(new Set(row.crossStreets).size,row.crossStreets.length,row.id+' has distinct clues');
   if(row.crossStreets.length===1)assert.ok(record.crossStreets.oneStreetException,row.id+' discloses a missing second clue');
   if(row.routeAccess.method==='modeled-designated-emergency-road-approach'){
    assert.equal(city.id,'toronto',row.id+' exception is confined to reviewed Island roads');
    assert.equal(record.roadApproach.policySource,'cities/toronto/emergency-access-roads.geojson');
    const policyFile=path.join(root,record.roadApproach.policySource),policyHash=crypto.createHash('sha256').update(fs.readFileSync(policyFile)).digest('hex');
    assert.equal(record.roadApproach.policySourceSha256,policyHash);
    const way=JSON.parse(fs.readFileSync(policyFile)).features.find(f=>f.id===record.roadApproach.sourceWayId);
    assert.ok(way?.properties.trainingEmergencyAccess,row.id+' uses a reviewed source road');
    assert.equal(row.routeAccess.publicRoad,false);assert.equal(row.routeAccess.designatedEmergencyRoad,true);assert.equal(row.routeAccess.verifiedEntrance,false);
    for(const [key,value] of Object.entries(row.routeAccess.sourceAccessRestrictions))assert.equal(value,way.properties[key],row.id+' retains source access restrictions');
    assert.equal(row.routeAccess.sourceAccessRestrictions.motor_vehicle,'private');
    assert.equal(row.routeAccess.officialPolicyUrl,'https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/');
    if(!row.crossStreets.length){
     assert.equal(row.routeAccess.road,'Lakeshore Avenue');assert.equal(row.isolatedStreetException,true);assert.equal(record.crossStreets.isolatedStreetException,true);
     assert.ok(row.isolatedStreetExceptionReason.includes('no eligible genuine named'));
     const exception=record.crossStreets.isolatedStreetExceptionEvidence;
     assert.equal(exception.approvedRoadsSha256,policyHash);assert.equal(exception.boundedSearchMetres,1500);assert.equal(exception.sourceWayId,way.id);
     assert.match(exception.reviewedBundleSha256,/^[a-f0-9]{64}$/);assert.equal(exception.maxSites,8);assert.equal(exception.minimumSourcePointSpacingMetres,150);
    }
   }else{
    assert.equal(row.routeAccess.method,'modeled-public-road-approach');
    assert.ok(row.crossStreets.length>=1,row.id+' ordinary records require genuine clues');
   }
   assert.equal(record.roadApproach.verifiedEntrance,false,row.id+' does not present a modeled approach as a surveyed entrance');
   assert.ok(row.routeAccess.distanceMetres<=80&&row.radius>=row.routeAccess.distanceMetres+19,row.id+' public-road approach fits the arrival radius');
  }
 }
});
