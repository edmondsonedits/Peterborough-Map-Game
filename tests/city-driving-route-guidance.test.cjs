'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const source = fs.readFileSync('response-simulator/route-reveal.js', 'utf8');
const center = [43.867171820603346, -79.44249767296054];
const lngScale = 111320 * Math.cos(center[0] * Math.PI / 180);
const point = x => ({lat:center[0], lng:center[1] + x / lngScale});
const line = (from, to, name = 'Richmond Hill road') => ({type:'Feature', properties:{highway:'residential', name},
  geometry:{type:'LineString', coordinates:[from, to].map(x => {const p=point(x); return [p.lng,p.lat];})}});
const collection = features => ({type:'FeatureCollection', features});
const city = {id:'richmond-hill', map:{defaultCenter:center}, roads:{available:true, center,
  dataUrl:'https://example.test/cities/richmond-hill/roads.geojson.gz'}};

function boot({fetchRoads, collision, bootstrap, activeCity = city} = {}) {
  const context = vm.createContext({console, Response, DecompressionStream, setInterval(){},
    PTBO_CITY_PACKAGE:activeCity, PTBO_ROAD_COLLISION:collision, PTBO_ROAD_COLLISION_BOOTSTRAP_READY:bootstrap,
    document:{getElementById(){return null;}, querySelector(){return null;}, createElement(){return {};}, head:{appendChild(){}}},
    fetch:fetchRoads || (async () => {return new Response(zlib.gzipSync(JSON.stringify(collection([line(0,1000)]))));}),
    CustomEvent:class {}, dispatchEvent(){},
  });
  context.window=context;
  vm.runInContext(source, context);
  return context.PTBO_ROUTE_REVEAL;
}

test('Richmond Hill routing reads its compressed city roads and uses the city projection', async () => {
  const requested=[];
  const api=boot({fetchRoads:async url => {
    requested.push(url);
    return new Response(zlib.gzipSync(JSON.stringify(collection([line(0,1000)]))));
  }});
  await api.ready;
  assert.deepEqual(requested,[city.roads.dataUrl]);
  const a=point(100), b=point(900), route=api.calculateRoute(a.lat,a.lng,b.lat,b.lng);
  assert.ok(route);
  assert.ok(Math.abs(route.distance-800)<0.01, 'distance must use Richmond Hill latitude');
  assert.equal(route.mainRoads[0],'Richmond Hill road');
});

test('routing waits for the same city collision surface and includes its access supplements', async () => {
  let release;
  const collision={config:{cityId:'richmond-hill'},state:{status:'loading',geojson:null},ready:new Promise(resolve=>release=resolve)};
  let fetches=0;
  const api=boot({collision,fetchRoads:async()=>{fetches++;return new Response(JSON.stringify(collection([line(0,100)])));}});
  assert.equal(api.state.status,'loading');
  collision.state.geojson=collection([line(0,100),line(100,200,'Emergency access'),line(200,300)]);
  collision.state.status='ready';
  release();
  await api.ready;
  assert.equal(fetches,0,'reuse the exact decoded drivable surface');
  const a=point(10), b=point(290), route=api.calculateRoute(a.lat,a.lng,b.lat,b.lng);
  assert.ok(route,'the loaded access supplement connects the two city roads');
  assert.ok(route.mainRoads.includes('Emergency access'));
});

test('routing never reuses another city collision graph', async () => {
  const requested=[];
  const api=boot({collision:{config:{cityId:'peterborough'},state:{geojson:collection([line(0,20,'Wrong city')])},ready:Promise.resolve()},
    fetchRoads:async url=>{requested.push(url);return new Response(zlib.gzipSync(JSON.stringify(collection([line(0,1000)]))));}});
  await api.ready;
  assert.deepEqual(requested,[city.roads.dataUrl]);
  assert.equal(api.state.graph.nodes.length,2);
  const a=point(100),b=point(900),route=api.calculateRoute(a.lat,a.lng,b.lat,b.lng);
  assert.equal(route.mainRoads[0],'Richmond Hill road');
});

test('routing waits for a pending collision bootstrap before selecting its dataset', async () => {
  let release, fetches=0;
  const collision={config:{cityId:'richmond-hill'},state:{geojson:collection([line(0,1000,'Bootstrapped road')])},ready:Promise.resolve()};
  const bootstrap=new Promise(resolve=>release=resolve);
  const api=boot({bootstrap,fetchRoads:async()=>{fetches++;return new Response(zlib.gzipSync(JSON.stringify(collection([line(0,10)]))));}});
  release(collision);
  await api.ready;
  assert.equal(fetches,0);
  const a=point(100),b=point(900),route=api.calculateRoute(a.lat,a.lng,b.lat,b.lng);
  assert.equal(route.mainRoads[0],'Bootstrapped road');
});

test('legacy Peterborough routing still loads its uncompressed road file without a city package', async () => {
  const requested=[];
  const api=boot({activeCity:null,fetchRoads:async url=>{
    requested.push(url);
    return new Response(JSON.stringify(collection([line(0,1000)])));
  }});
  await api.ready;
  assert.deepEqual(requested,['../city-explorer/data/osm-public-roads.geojson']);
  assert.equal(api.state.graph.nodes.length,2);
});
