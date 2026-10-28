'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {app,registry,loadCity}=require('../tools/route-response-data.cjs');
const {createTraceCore}=require('../route-mapping/trace-core.js');

async function setup(){
 const city=registry.find(c=>c.id==='peterborough'),data=await loadCity(city),api=app(city,data.training,data.bases);
 api.state.graph=api.buildGraph(data.roads);
 api.state.traceCore=createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 return {api,...data};
}

test('Marina Boulevard stays traceable and is considered for the shortest route to 999 Hilliard',async()=>{
 const {api,training,bases}=await setup(),core=api.state.traceCore;
 // Actual road geometry either side of the 27 cm section east of Hilliard.
 const before=core.snap({lat:44.3327029,lng:-78.3227295},2);
 const after=core.snap({lat:44.3324935,lng:-78.3231752},2);
 const direct=core.between(before,after,{local:true,maxDistance:100});
 assert.ok(direct,'both sides of Marina must connect locally');
 assert.ok(direct.distance<50,'shortest local path should follow Marina');
 const gesture=core.advance(core.begin(before),after,{tolerance:18,previousPoint:before});
 assert.equal(gesture.blocked,false,'dragging along Marina must pass the short section');
 assert.ok(core.distance(gesture.route.endpoint,after)<1);

 const base=bases.find(b=>b.id==='fire-station-2'),call=training.routeCalls.find(c=>c.addr==='999 Hilliard Street');
 api.state.routeResponses=training.routeResponses;api.state.calls=training.routeCalls;
 const origin=api.baseAnchor(base),destination=core.snap(call,520),shortest=core.between(origin,destination);
 assert.ok(shortest);assert.ok(shortest.distance<1000,`shortest route is ${shortest.distance}m; it should use the direct Marina/Hilliard junction`);
 assert.ok(shortest.edges.some(e=>e.name==='Hilliard Street'));
});

test('very short directed segments connect only their own consecutive source vertices',async()=>{
 const {api}=await setup();
 const feature=(coords,p={})=>({type:'Feature',properties:{name:'Road',highway:'residential',...p},geometry:{type:'LineString',coordinates:coords}});
 const geo={features:[feature([[-78.3,44.3],[-78.29999,44.3],[-78.299989,44.3],[-78.29998,44.3]],{oneway:'yes'}),feature([[-78.299989,44.3000005],[-78.29998,44.3000005]])]};
 api.state.graph=api.buildGraph(geo);
 const core=createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 const a=core.snap({lat:44.3,lng:-78.3},.5),b=core.snap({lat:44.3,lng:-78.29998},.5);
 assert.ok(core.between(a,b,{local:true,maxDistance:10}),'one-way road crosses its short segment');
 assert.equal(core.between(b,a,{local:true,maxDistance:10}),null,'short segment does not bypass direction');
 const other=core.snap({lat:44.3000005,lng:-78.29998},.005);
 assert.equal(core.between(a,other,{local:true,maxDistance:10}),null,'nearby separate roads do not become connected');
});

test('the pictured Glebemount detour is scored against the direct Station 2 route',async()=>{
 const {api,training,bases}=await setup(),core=api.state.traceCore;
 const base=bases.find(b=>b.id==='fire-station-2'),call=training.routeCalls.find(c=>c.addr==='999 Hilliard Street');
 api.state.routeResponses=training.routeResponses;api.state.calls=training.routeCalls;
 const origin=api.baseAnchor(base),destination=core.snap(call,520);
 // The screenshot travels from Marina along Oriole, through Glebemount,
 // then Oriole and Hilliard. This point selects that same detour.
 const via=core.snap({lat:44.3313378,lng:-78.3216203},1);
 const first=core.between(origin,via),last=core.between(via,destination);
 assert.ok(first&&last);
 const detour=core.combine(first,last);
 assert.deepEqual(Array.from(detour.mainRoads),['Marina Boulevard','Oriole Drive','Glebemount Crescent','Hilliard Street']);
 assert.ok(detour.distance>1100&&detour.distance<1160);

 // Use the production submit handler; only DOM/Leaflet rendering is stubbed.
 const fs=require('node:fs'),vm=require('node:vm'),elements=new Map();
 const context={window:{},document:{getElementById(id){if(!elements.has(id))elements.set(id,{});return elements.get(id);}},L:{polyline:()=>({addTo(){return this;}})},console};
 const source=fs.readFileSync('route-mapping/app.js','utf8');
 vm.runInNewContext(source.replace('  initialize();','  globalThis.submitTest={state,submitRoute};'),context);
 const state=context.submitTest.state;
 state.map={};state.mode='editing';state.traceCore=core;state.originAnchor=origin;state.destinationAnchor=destination;
 state.playerRoute={...detour,complete:true};context.submitTest.submitRoute();
 assert.equal(elements.get('efficiency-value').textContent,'77% efficient');
 assert.equal(elements.get('shortest-distance').textContent,'869 m');
 assert.equal(elements.get('player-distance').textContent,'1.1 km');
 assert.equal(elements.get('extra-distance').textContent,'+264 m');
});
