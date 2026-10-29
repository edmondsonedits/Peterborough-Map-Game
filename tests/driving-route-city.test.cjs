'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('response-simulator/route-reveal.js');

async function loadRouter({packageFile,city,roads}={}) {
  const requests=[];
  const c=vm.createContext({URL,Response,DecompressionStream,console,CustomEvent:class{},dispatchEvent(){},setInterval(){},
    location:{href:'https://example.test/response-simulator/index.html'},
    document:{currentScript:{src:`https://example.test/${packageFile||'response-simulator/route-reveal.js'}`},documentElement:{dataset:{}},
      getElementById(){return null;},querySelector(){return null;},createElement(){return {};},head:{appendChild(){}}},
    fetch:async url=>{
      const parsed=new URL(url,'https://example.test/response-simulator/index.html');
      requests.push(parsed.pathname);
      if(roads) return new Response(JSON.stringify(roads));
      return new Response(fs.readFileSync(path.join(root,parsed.pathname)));
    },
  });
  c.window=c;
  if(packageFile){vm.runInContext(read(packageFile),c);await c.PTBO_CITY_PACKAGE_READY;}
  else if(city)c.PTBO_CITY_PACKAGE=city;
  vm.runInContext(source,c);
  await c.PTBO_ROUTE_REVEAL.ready;
  return {api:c.PTBO_ROUTE_REVEAL,city:c.PTBO_CITY_PACKAGE,requests};
}

test('native Richmond Hill guidance loads its gzip city graph and routes every demo response and EMS transport',async()=>{
  const {api,city,requests}=await loadRouter({packageFile:'cities/richmond-hill/package.js'});
  const training=JSON.parse(read('cities/richmond-hill/training-data.json'));
  const missing=[];let responses=0,transports=0;
  for(const profile of training.dispatchDemo.bases){
    const base=city.serviceConfig.profiles[profile.service].bases.find(base=>base.id===profile.baseId);
    for(const id of profile.callIds){
      const call=training.routeCalls.find(call=>call.id===id),point=call.routeAccess;
      const response=api.calculateRoute(base.spawnLat,base.spawnLng,point.lat,point.lng);
      if(!response?.edges.length)missing.push(`${base.id} → ${id}`);else responses++;
      if(profile.service==='ems'){
        const hospital=city.serviceConfig.hospital;
        const transport=api.calculateRoute(point.lat,point.lng,hospital.checkpointLat,hospital.checkpointLng);
        if(!transport?.edges.length)missing.push(`${id} → hospital`);else transports++;
      }
    }
  }
  assert.deepEqual(missing,[]);
  assert.equal(responses,40);assert.equal(transports,10);
  assert.deepEqual(requests,['/cities/richmond-hill/geo-data.json','/cities/richmond-hill/roads.geojson.gz']);
});

test('city routing distance uses the selected road centre latitude',async()=>{
  const {api}=await loadRouter({city:{id:'northern-city',roads:{dataUrl:'https://example.test/northern-roads.geojson',center:[60,-79]}},
    roads:{type:'FeatureCollection',features:[{type:'Feature',properties:{highway:'residential'},geometry:{type:'LineString',coordinates:[[-79,60],[-78.99,60]]}}]}});
  const route=api.calculateRoute(60,-79,60,-78.99);
  assert.ok(route);
  assert.ok(Math.abs(route.distance-556.6)<.01,'0.01° longitude at 60° is 556.6 metres in the simulator projection');
});

test('Peterborough native package and legacy embeds retain uncompressed road guidance',async()=>{
  for(const packageFile of ['cities/peterborough/package.js',undefined]){
    const {api,requests}=await loadRouter({packageFile});
    const route=api.calculateRoute(44.304839,-78.303270,44.300744,-78.347467);
    assert.ok(route?.edges.length>0);
    assert.deepEqual(requests,['/city-explorer/data/osm-public-roads.geojson']);
  }
});
