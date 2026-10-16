'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('route-mapping/app.js','utf8');
function runtime(){
 const c={window:{},document:{getElementById:()=>({})},console};
 vm.runInNewContext(source.replace('  initialize();','  globalThis.api={applyCityData,toXY,toLatLng,cityStorageKey,CONFIG};'),c);
 return c.api;
}
test('selected-city projection and persistence do not reuse Peterborough coordinates or progress',()=>{
 const r=runtime();
 r.applyCityData({id:'toronto',name:'Toronto',map:{defaultCenter:[43.7,-79.4]}},{id:'toronto',roadsUrl:'cities/toronto/roads.geojson.gz',center:[43.7,-79.4]});
 assert.equal(r.toXY(43.7,-79.4).x,0);assert.equal(r.toXY(43.7,-79.4).y,0);
 const xy=r.toXY(43.71,-79.39),ll=r.toLatLng(xy.x,xy.y);
 assert.ok(Math.abs(ll.lat-43.71)<1e-10);assert.ok(Math.abs(ll.lng+79.39)<1e-10);
 assert.equal(r.cityStorageKey('progress'),'progress:toronto');
 r.applyCityData({id:'peterborough',name:'Peterborough'}, {id:'peterborough',center:[44.3091,-78.3197],roadsUrl:'city-explorer/data/osm-public-roads.geojson'});
 assert.equal(r.cityStorageKey('progress'),'progress');
});
test('mismatched route data fails instead of silently routing another city',()=>{
 assert.throws(()=>runtime().applyCityData({id:'toronto'}, {id:'peterborough',center:[44,-78]}),/city|match/i);
});
test('Route Mapping delegates city selection to the shared runtime without rewriting city URLs',()=>{
 const html=fs.readFileSync('route-mapping/index.html','utf8');
 assert.doesNotMatch(html,/searchParams\.set\('city', 'peterborough'\)/);
 assert.match(html,/city-location-runtime\.js/);assert.doesNotMatch(html,/dispatch-locations\.js\?city=peterborough/);
});
