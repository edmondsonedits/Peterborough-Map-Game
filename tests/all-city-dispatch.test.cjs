'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=f=>fs.readFileSync(f,'utf8');const registry={window:{}};vm.runInNewContext(read('cities/city-registry.js'),registry);
for(const city of registry.window.PTBO_CITIES)test(city.id+' has a complete local dispatch package',async()=>{
 const manifest=JSON.parse(read(`cities/${city.id}/city.json`));
 for(const key of ['dispatch','roadBoundaries','routeGuidance','hospitalTransport'])assert.equal(manifest.features[key],true,`${city.id}: ${key}`);
 assert.equal(city.modes.dispatch,true);
 const events=[];const c={console,URL,Promise,setTimeout,clearTimeout,AbortController,CustomEvent:class{constructor(type,args){this.type=type;this.detail=args?.detail;}},location:{href:`https://test.invalid/?city=${city.id}`},document:{currentScript:{src:`https://test.invalid/cities/${city.id}/package.js`},documentElement:{dataset:{}},querySelector:()=>null},dispatchEvent:e=>events.push(e),fetch:async url=>({ok:true,json:async()=>JSON.parse(read(new URL(url).pathname.slice(1)))})};c.window=c;vm.createContext(c);
 if(city.id!=='peterborough')vm.runInContext(read('cities/preview-package-factory.js'),c);
 vm.runInContext(read(`cities/${city.id}/package.js`),c);await c.PTBO_CITY_PACKAGE_READY;
 const p=c.PTBO_CITY_PACKAGE;assert.equal(p.id,city.id);for(const key of ['dispatch','roadBoundaries','routeGuidance','hospitalTransport'])assert.equal(p.features[key],true,key);
 const h=p.serviceConfig.hospital;assert.ok(h?.id&&h.name&&Number.isFinite(h.lat)&&Number.isFinite(h.lng)&&!h.disabled,'hospital site');
 for(const service of ['fire','ems']){
   assert.ok(p.serviceConfig.profiles[service].bases.length>0,service+' bases');
   for(const base of p.serviceConfig.profiles[service].bases){
     if(!base.drivingArea)continue;
     for(const key of ['lat','lng','yardWidth','yardLength','yardRotation','spawnLat','spawnLng']){
       assert.ok(Number.isFinite(base.drivingArea[key]),`${base.id}: fitted ${key} is explicit`);
       assert.equal(base[key],base.drivingArea[key],`${base.id}: fitted ${key} is applied to runtime`);
     }
   }
 }
 assert.equal(c.PTBO_ROUTE_REVEAL,undefined,'real route runtime must be allowed to load');
 if(city.id!=='peterborough'){assert.equal(p.status,'dispatch-demo');assert.ok(fs.existsSync(`cities/${city.id}/roads.geojson.gz`));assert.equal(events.find(e=>e.type==='ptbo-city-package-data-ready').detail.dispatch,true);}
});
