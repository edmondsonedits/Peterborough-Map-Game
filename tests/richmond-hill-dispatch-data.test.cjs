'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const data=require('../tools/route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
const {localPool}=require('../response-simulator/local-pool.js');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),json=file=>JSON.parse(read(file));

function context(file,pathname='/response-simulator/play/'){
 const c={URL,Promise,CustomEvent:class{},console,setTimeout,clearTimeout,AbortController,location:{href:'https://example.test'+pathname+'?city=richmond-hill'},document:{currentScript:{src:'https://example.test/'+file},documentElement:{dataset:{}}},dispatchEvent(){},fetch:async url=>({ok:true,json:async()=>json(new URL(url).pathname.slice(1))})};
 c.window=c;return c;
}
async function loadPackage(){
 const file='cities/richmond-hill/package.js';assert.ok(fs.existsSync(path.join(root,file)),'Richmond Hill has a native Dispatch package');
 const c=context(file);vm.runInNewContext(read(file),c);await c.PTBO_CITY_PACKAGE_READY;return c;
}

test('Richmond Hill boots native Fire/EMS, collision, guidance, and a local transport target without preview shims',async()=>{
 const c=await loadPackage(),city=c.PTBO_CITY_PACKAGE;
 assert.equal(city.id,'richmond-hill');assert.equal(city.dispatchDemo.callLimit,5);
 for(const feature of ['dispatch','roadBoundaries','routeGuidance','hospitalTransport'])assert.equal(city.features[feature],true,feature);
 assert.notEqual(city.features.sceneResponseDrills,true);assert.equal(c.PTBO_ROAD_COLLISION,undefined);assert.equal(c.PTBO_ROUTE_REVEAL,undefined);
 assert.equal(city.serviceConfig.profiles.fire.bases.length,6);assert.equal(city.serviceConfig.profiles.ems.bases.length,2);
 const h=city.serviceConfig.hospital;assert.equal(h.name,'Mackenzie Richmond Hill Hospital');assert.equal(h.addr,'10 Trench Street');
 assert.equal(h.checkpointLat,43.8714902);assert.equal(h.checkpointLng,-79.449977);
 const locations=await c.PTBO_DISPATCH_DATA_READY;assert.ok(locations.length>=20);assert.ok(locations.every(p=>p.id.startsWith('richmond-hill-')));
 assert.equal(json('cities/richmond-hill/city.json').features.dispatch,true);
});

test('native Dispatch and its standalone descriptor preserve existing Richmond Hill edits, deletions and custom calls',async t=>{
 const geo=json('cities/richmond-hill/geo-data.json'),training=json('cities/richmond-hill/training-data.json'),key='ptboSharedDispatchLocationsV3:richmond-hill';
 const renamedId='richmond-hill-call-01',deletedId='richmond-hill-call-02',deletedSharedId='richmond-hill-odef-d61defca76ac3ff0cdd5';
 const custom={id:'rh-user-practice',name:'User practice location',addr:'User saved address',lat:43.87,lng:-79.44,main:'Medical',sub:'Medical Assistance',custom:true};
 const saved={version:3,cityId:'richmond-hill',dataVersion:'ontario-geo-1',trainingCareHomeIds:training.careHomes.map(p=>p.id),trainingSharedLocationIds:training.sharedLocations.map(p=>p.id),items:[...geo.locations.filter(p=>p.id!==deletedId).map(p=>p.id===renamedId?{...p,name:'Renamed library'}:p),...training.sharedLocations.filter(p=>p.id!==deletedSharedId),...training.careHomes,custom]};
 for(const entry of ['native package','standalone descriptor'])await t.test(entry,async()=>{
  const storage=new Map([[key,JSON.stringify(saved)]]),c=entry==='native package'?await loadPackage():context('cities/richmond-hill/dispatch-data.js','/city-editor/');
  c.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  if(entry==='standalone descriptor')vm.runInNewContext(read('cities/richmond-hill/dispatch-data.js'),c);
  c.document.currentScript.src='https://example.test/shared/dispatch-locations.js?city=richmond-hill';
  vm.runInNewContext(read('shared/ems-priority.js'),c);vm.runInNewContext(read('shared/dispatch-locations.js'),c);
  await c.PTBO_DISPATCH_STORE.ready();
  const store=c.PTBO_DISPATCH_STORE,all=store.getAll();
  assert.equal(all.find(p=>p.id===renamedId)?.name,'Renamed library',entry+' retains renamed seed');
  assert.equal(all.some(p=>p.id===deletedId),false,entry+' retains deleted seed');
  assert.equal(all.some(p=>p.id===deletedSharedId),false,entry+' retains deleted supplemental call');
  assert.equal(all.find(p=>p.id===custom.id)?.name,custom.name,entry+' retains custom call');
  store.upsert({...all.find(p=>p.id===custom.id),name:'Updated user practice location'});
  const persisted=JSON.parse(storage.get(key));
  assert.equal(persisted.dataVersion,'ontario-geo-1');
  assert.equal(persisted.items.find(p=>p.id===renamedId)?.name,'Renamed library');
  assert.equal(persisted.items.some(p=>p.id===deletedId||p.id===deletedSharedId),false);
  assert.equal(persisted.items.find(p=>p.id===custom.id)?.name,'Updated user practice location');
 });
});

test('all eight Richmond Hill bases have exactly five distinct service-eligible, sourced demo calls',async()=>{
 const city=data.registry.find(c=>c.id==='richmond-hill'),{training,bases,calls}=await data.loadCity(city),demo=training.dispatchDemo;
 assert.equal(demo?.schemaVersion,1,'five-call curated manifest exists');assert.equal(demo.callLimit,5);assert.equal(demo.bases.length,8);
 assert.deepEqual(demo.bases.map(p=>p.baseId).sort(),Array.from(bases,b=>b.id).sort());
 for(const base of bases){
  const profile=demo.bases.find(p=>p.baseId===base.id&&p.service===base.service),allowed=new Set(profile.callIds),pool=localPool(training,calls,{...base,cityId:city.id}).filter(c=>allowed.has(c.id));
  assert.equal(profile.callIds.length,5);assert.equal(pool.length,5,base.id+' is playable through the production local pool');assert.equal(new Set(pool.map(c=>c.canonicalCallId)).size,5);
  for(const call of pool){assert.ok(call.sources.length);assert.equal(call.locationKind,'sourced-address');assert.equal(call.routeAccess.method,'modeled-public-road-approach');}
 }
});

test('every demo origin and destination is connected, including continuous Fire calls and EMS hospital legs',async()=>{
 const c=await loadPackage(),city=data.registry.find(c=>c.id==='richmond-hill'),{training,bases,roads}=await data.loadCity(city),api=data.app(city,training,bases);
 assert.ok(training.dispatchDemo,'demo manifest is required');
 api.state.graph=api.buildGraph(roads);api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 api.state.routeResponses=training.routeResponses;const core=api.state.traceCore,hospital=core.snap(c.PTBO_SERVICE_CONFIG.hospital,1);
 assert.ok(hospital,'hospital checkpoint lies on packaged road geometry');
 const way=roads.features.find(f=>f.id==='way/856561984');assert.equal(way.properties.name,'Trench Street');
 function verify(a,b,label){const route=core.between(a,b);assert.ok(route&&route.distance>0,label);assert.ok(core.finish(route,b,40).complete,label+' completes');for(let i=0;i<route.edges.length;i++){const edge=route.edges[i],s=api.state.graph.segments[edge.segmentId];assert.ok(edge.reverse?s.backward:s.forward,label+' follows directed roads');if(i)assert.ok(core.distance(route.edges[i-1].end,edge.start)<.2,label+' is continuous');}return route.distance;}
 let dispatchLegs=0,transportLegs=0,continuousLegs=0;
 for(const profile of training.dispatchDemo.bases){
  const base=bases.find(b=>b.id===profile.baseId),origin=api.baseAnchor(base,profile.service),calls=profile.callIds.map(id=>training.routeCalls.find(c=>c.id===id)),targets=calls.map(call=>core.snap(call.routeAccess,1));
  assert.ok(origin);assert.ok(targets.every(Boolean),'every checkpoint lies on a packaged road');
  for(let i=0;i<calls.length;i++){
   verify(origin,targets[i],base.id+' → '+calls[i].id);dispatchLegs++;
   if(profile.service==='ems'){verify(targets[i],hospital,calls[i].id+' → hospital');verify(hospital,targets[i],'hospital → '+calls[i].id);transportLegs+=2;}
   else for(let j=0;j<targets.length;j++)if(i!==j){verify(targets[i],targets[j],calls[i].id+' → '+calls[j].id);continuousLegs++;}
  }
 }
 assert.equal(dispatchLegs,40);assert.equal(transportLegs,20);assert.equal(continuousLegs,120);
});
