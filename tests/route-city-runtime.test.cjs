'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{runtime}=require('./helpers/city-runtime.cjs');
test('route workspace resolves only the selected city and its own manifest without enabling driving',async()=>{
 const h=runtime({context:'route'});await h.c.PTBO_EDITOR_CITY_READY;
 assert.equal(h.c.PTBO_CITY_PACKAGE.id,'toronto');assert.equal(h.c.PTBO_DISPATCH_STORE.cityId,'toronto');
 assert.equal(h.c.PTBO_CITY_PACKAGE.features.routeMapping,true);assert.notEqual(h.c.PTBO_CITY_PACKAGE.roads?.available,true);
 assert.equal(h.c.PTBO_CITY_PACKAGE.route.graphVersion,'roads-1');assert.match(h.c.PTBO_CITY_PACKAGE.route.networkUrl,/cities\/toronto\/route-network\.js\?v=preview/);assert.equal(h.requested.length,2);
});
test('foreign manifests and external network URLs stop the selected city',async()=>{
 for(const patch of [{cityId:'oshawa'},{networkUrl:'https://other.test/network.js'},{networkUrl:'../oshawa/route-network.js'}]){
  const manifest={schemaVersion:1,cityId:'toronto',graphVersion:'roads-1',costProfileVersion:'cost-1',networkUrl:'route-network.js',baseAccess:{},coverage:[],...patch};
  const h=runtime({context:'route',manifest});await assert.rejects(h.c.PTBO_EDITOR_CITY_READY);assert.equal(Boolean(h.c.PTBO_DISPATCH_STORE),false);
 }
});
test('a missing manifest or explicitly invalid city never loads Peterborough as a fallback',async()=>{
 for(const options of [{failManifest:true},{search:'?city=bad-city'}]){const h=runtime({context:'route',...options});await assert.rejects(h.c.PTBO_EDITOR_CITY_READY);assert.equal(h.c.PTBO_CITY_PACKAGE?.id==='peterborough',false);}
});
test('all selector cities independently declare Route Mapping assets',()=>{
 const h=runtime({context:'route',search:'?city=bad-city'});assert.equal(h.c.PTBO_CITIES.length,33);for(const city of h.c.PTBO_CITIES){assert.equal(city.modes.route,true,city.id);assert.equal(city.routeDataUrl,`cities/${city.id}/route-data.json`);}
});
