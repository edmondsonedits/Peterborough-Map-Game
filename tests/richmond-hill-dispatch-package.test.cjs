'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
async function load(id,version=''){
 const requested=[];
 const c=vm.createContext({URL,console,AbortController,setTimeout,clearTimeout,
  location:{href:`https://example.test/response-simulator/index.html?city=${id}`},
  document:{currentScript:{src:`https://example.test/cities/${id}/package.js${version?'?v='+version:''}`},documentElement:{dataset:{}},createElement:()=>({dataset:{}}),head:{appendChild(){}}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},dispatchEvent(){},
  fetch:async url=>{requested.push(String(url));return {ok:true,json:async()=>JSON.parse(read(`cities/${id}/geo-data.json`))};}});
 c.window=c;
 vm.runInContext(read('cities/preview-package-factory.js'),c);
 vm.runInContext(read(`cities/${id}/package.js`),c);
 await c.PTBO_CITY_PACKAGE_READY;
 return {c,requested};
}
test('Richmond Hill enables the shared protected-road dispatch and hospital workflow',async()=>{
 const {c,requested}=await load('richmond-hill'),p=c.PTBO_CITY_PACKAGE;
 assert.equal(p.features.baseTraining,false);
 assert.equal(p.features.sceneResponseDrills,false);
 for(const key of ['dispatch','roadBoundaries','routeGuidance','hospitalTransport'])assert.equal(p.features[key],true,key);
 assert.equal(p.dispatch.available,true);
 assert.equal(p.roads.available,true);
 assert.equal(p.roads.dataUrl,'https://example.test/cities/richmond-hill/roads.geojson.gz');
 assert.equal(p.roads.manifestUrl,'https://example.test/cities/richmond-hill/training-data.json');
 for(const key of ['PTBO_ROAD_COLLISION','PTBO_ROUTE_REVEAL','PTBO_ROUTE_COMPARE','PTBO_ROAD_COLLISION_BOOTSTRAP_READY'])assert.equal(c[key],undefined,`real ${key} must initialize`);
 assert.equal(p.serviceConfig.profiles.fire.bases.length,6);
 assert.equal(p.serviceConfig.profiles.ems.bases.length,2);
 assert.equal(p.serviceConfig.hospital.name,'Mackenzie Richmond Hill Hospital');
 assert.match(p.serviceConfig.hospital.addr,/10 Trench Street/);
 assert.ok(Number.isFinite(p.serviceConfig.hospital.checkpointLat));
  assert.equal(p.serviceConfig.hospital.lat,p.serviceConfig.hospital.checkpointLat,'EMS arrival works before the optional drop-off editor loads');
  assert.equal(p.serviceConfig.hospital.lng,p.serviceConfig.hospital.checkpointLng);
 assert.equal(requested.length,1,'startup loads the packaged roster without live facility servers');
});
test('the five demo calls are sourced city addresses usable by both services',async()=>{
 const {c}=await load('richmond-hill'),ids=Array.from(c.PTBO_CITY_PACKAGE.dispatch.demoCallIds||[]);
 assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
 const data=JSON.parse(read('cities/richmond-hill/training-data.json'));
 for(const id of ids){
  const call=data.sharedLocations.find(x=>x.id===id);
  assert.ok(call,id);assert.equal(call.cityId,'richmond-hill');
  assert.ok(call.incidentProfiles.fire.sub);assert.ok(call.incidentProfiles.ems.sub);
  assert.ok(Number.isFinite(call.routeAccess.lat));assert.ok(call.sources.length);
 }
});
test('other preview cities retain their existing base-training capability and shims',async()=>{
 const {c}=await load('ajax');assert.equal(c.PTBO_CITY_PACKAGE.features.baseTraining,true);
 assert.equal(c.PTBO_CITY_PACKAGE.dispatch.available,false);
 assert.equal(c.PTBO_ROAD_COLLISION.config.available,false);
 assert.equal(c.PTBO_ROUTE_REVEAL.available,false);
});
test('the demo roster uses the release cache token so updated road spawns reach returning players',async()=>{
 const {requested}=await load('richmond-hill','1.6.157');
 assert.equal(requested[0],'https://example.test/cities/richmond-hill/geo-data.json?v=1.6.157');
});
test('every Richmond Hill response base starts on a mapped road with a road-aligned heading',async()=>{
 const {c}=await load('richmond-hill');
 const roads=JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'../cities/richmond-hill/roads.geojson.gz'))));
 const m=111320*Math.cos(43.88*Math.PI/180);
 for(const profile of Object.values(c.PTBO_SERVICE_CONFIG.profiles))for(const base of profile.bases){
  assert.ok(Number.isFinite(base.spawnLat),base.name);
  assert.ok(Number.isFinite(base.spawnHeading),base.name);
  let nearest=Infinity;
  for(const feature of roads.features){
   if(feature.geometry.type!=='LineString')continue;
   const points=feature.geometry.coordinates;
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=(b[0]-a[0])*m,dy=(b[1]-a[1])*110540;
    const px=(base.spawnLng-a[0])*m,py=(base.spawnLat-a[1])*110540;
    const t=dx*dx+dy*dy?Math.max(0,Math.min(1,(px*dx+py*dy)/(dx*dx+dy*dy))):0;
    nearest=Math.min(nearest,Math.hypot(px-t*dx,py-t*dy));
   }
  }
  assert.ok(nearest<1,`${base.name}: ${nearest}m off road`);
 }
});
