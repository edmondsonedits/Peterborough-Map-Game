'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const slice=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start,a);return s.slice(start,end);};
const route=read('route-mapping/app.js');
function routeContext(){
 let reads=0;const edges=[{from:0,to:1,distance:10,duration:1,weight:5},{from:0,to:2,distance:30,duration:2,weight:1}];
 const nodes=[{id:0,x:0,y:0,get edges(){reads++;return edges;}},{id:1,x:10,y:0,edges:[{from:1,to:2,distance:10,duration:1,weight:5}]},{id:2,x:20,y:0,edges:[]}];
 const c=vm.createContext({state:{graph:{nodes}},CONFIG:{maxVisitedNodes:120000}});
 vm.runInContext(slice(route,'  class MinHeap','  function addGrid(')+slice(route,'  function heuristic(','  function composeRoute('),c);
 return{c,readCount:()=>reads};
}
test('repeated route searches reuse work without leaking caller array edits',()=>{
 const{c,readCount}=routeContext();const first=c.pathBetween(0,2,'distance');first.nodeIds.push(99);
 for(let i=0;i<10;i++)assert.deepEqual(Array.from(c.pathBetween(0,2,'distance').nodeIds),[0,1,2]);
 assert.equal(readCount(),1);assert.deepEqual(Array.from(c.pathBetween(0,2,'recommended').nodeIds),[0,2]);
 assert.equal(c.pathBetween(2,0,'distance'),null);
 const nodes=c.state.graph.nodes;c.state.graph={nodes:[...nodes.slice(0,2),{id:2,x:20,y:0,edges:[{from:2,to:0,distance:20,duration:2,weight:10}]}]};
 assert.ok(c.pathBetween(2,0,'distance'));assert.equal(c.pathBetween(999,0,'distance'),null);
});
test('route cache stays bounded during many distinct exercises',()=>{
 const{c}=routeContext();c.state.graph={nodes:Array.from({length:300},(_,id)=>({id,x:id,y:0,edges:id<299?[{from:id,to:id+1,distance:1,duration:1,weight:1}]:[]}))};
 for(let i=1;i<299;i++)c.pathBetween(0,i,'distance');assert.ok(vm.runInContext('routePathCache.size',c)<=256);
});
test('a cancelled route pointer discards its stroke and never snaps it',async()=>{
 const listeners={};const control={addEventListener(type,fn){listeners[type]=fn;}},noop={addEventListener(){}};
 let snaps=0,enabled=0;
 const c=vm.createContext({state:{mode:'drawing',drawingPointer:7,rawPoints:[{},{},{}],map:{removeLayer(){},dragging:{enable(){enabled++;}}},rawLine:{},editMarker:null,previewLine:null},ui:{drawSurface:{...control,hasPointerCapture:()=>true,releasePointerCapture(){}},clear:noop,undo:noop,submit:noop,next:noop,settingsButton:noop,settingsClose:noop,retry:noop,serviceSelect:noop,settingsForm:noop,settingsSheet:noop,zoomIn:noop,zoomOut:noop},clearLayer(){},setMapGestureLock(){},updateDrawTarget(){},snapStroke:async()=>{snaps++;},setHint(){},setMode(){},resetDrawing(){},undo(){},submitRoute(){},newCall(){},openSettings(){},closeSettings(){},fillBases(){},window:{addEventListener(){}},document:{addEventListener(){}}});
 vm.runInContext(slice(route,'  function clearRaw()','  async function snapStroke()')+slice(route,'  function bindUi()','  async function loadData()'),c);
 c.bindUi();await listeners.pointercancel({pointerId:7,preventDefault(){}});assert.equal(snaps,0);assert.equal(c.state.rawPoints.length,0);assert.equal(c.state.drawingPointer,null);

});
test('steering defaults survive denied optional preference reads',()=>{
 const c=vm.createContext({localStorage:{getItem(){throw new Error('Denied');}},STEERING_STORAGE_KEY:'mode',isMobileWrapper:()=>false,STEERING_MODES:{STANDARD:'standard',DIRECTIONAL:'directional'}});
 assert.doesNotThrow(()=>vm.runInContext(slice(read('response-simulator/vehicle-instruments-core.js'),'  const storedMode','  const state =')+'\nglobalThis.initial=initialMode;',c));
 assert.equal(c.initial,'standard');
});
function hospitalContext(failArea=false,failBase=false){
 const old={checkpointLat:44.3,checkpointLng:-78.3},draft={checkpointLat:44.31,checkpointLng:-78.31};
 const values=new Map([['area','old-json']]);let writes=0,baseCalls=0;
 const c=vm.createContext({current:old,staged:draft,cityId:'peterborough',storageKey:'area',validateCheckpoint:x=>x,normalized:x=>x,mergedHospital:x=>x,copy:x=>({...x}),CustomEvent:class{},window:{dispatchEvent(){}},localStorage:{getItem:k=>values.get(k)??null,removeItem:k=>values.delete(k),setItem(k,v){writes++;if(failArea)throw new Error('Quota');values.set(k,v);}},originalStore:{getHospital:()=>({id:'hospital',name:'Hospital',addr:'Road'}),saveHospital(){baseCalls++;if(failBase)throw new Error('Base denied');return{};}}});
 vm.runInContext(slice(read('shared/hospital-dropoff-store-1.6.49.js'),'  function save(raw = {})','  function hospitalRoadAccess('),c);
 return{c,values,old,draft,baseCalls:()=>baseCalls,writes:()=>writes};
}
test('hospital area persistence failure leaves both runtime records and draft intact',()=>{
 const{c,old,draft,baseCalls}=hospitalContext(true);assert.throws(()=>c.save({}),/could not be saved/);assert.equal(c.current,old);assert.equal(c.staged,draft);assert.equal(baseCalls(),0);
});
test('hospital base failure rolls back the area write and retains its draft',()=>{
 const{c,values,old,draft}=hospitalContext(false,true);assert.throws(()=>c.save({}),/Base denied/);assert.equal(values.get('area'),'old-json');assert.equal(c.current,old);assert.equal(c.staged,draft);
});

test('route starts project the selected spawn onto the public road without changing the base',()=>{
 const base={lat:44.300942,lng:-78.322201,spawnLat:44.301,spawnLng:-78.322},street={lat:44.30055,lng:-78.322,road:'Sherbrooke Street'},seen=[];
 const c=vm.createContext({state:{graph:{}},nearestRoad:(lat,lng)=>{seen.push({lat,lng});return street;}});
 vm.runInContext(slice(route,'  function basePoint(','  function callPoint('),c);
 const point=c.basePoint(base);
 assert.equal(point.lat,street.lat);assert.equal(point.lng,street.lng);
 assert.equal(seen[0].lat,base.spawnLat);assert.equal(seen[0].lng,base.spawnLng);
 assert.equal(base.lat,44.300942);assert.equal(base.spawnLat,44.301);
});

test('route start retains the selected coordinate until road data is ready or a match exists',()=>{
 const base={lat:44.3,lng:-78.32};
 const c=vm.createContext({state:{graph:null},nearestRoad:()=>null});
 vm.runInContext(slice(route,'  function basePoint(','  function callPoint('),c);
 assert.equal(c.basePoint(base).lat,base.lat);assert.equal(c.basePoint(base).lng,base.lng);
 c.state.graph={};assert.equal(c.basePoint(base).lat,base.lat);
});

test('Station 1 departure lies on Sherbrooke Street in the packaged road graph',()=>{
 const c=vm.createContext({state:{graph:null}});
 vm.runInContext(slice(route,'  const CONFIG =','  const ui =')+
   slice(route,'  function toXY(','  function clamp(')+
   slice(route,'  function nearbySegments(','  function heuristic(')+
   slice(route,'  function basePoint(','  function callPoint('),c);
 c.state.graph=c.buildGraph(JSON.parse(read('city-explorer/data/osm-public-roads.geojson')));
 const base={lat:44.30102,lng:-78.32202,spawnLat:44.300942,spawnLng:-78.322201};
 const point=c.basePoint(base),road=c.nearestRoad(point.lat,point.lng,260);
 assert.equal(road.road,'Sherbrooke Street');
 assert.ok(road.distance<.01,'departure should be on the road, not the station parcel');
 assert.ok(c.dist(point,{lat:base.spawnLat,lng:base.spawnLng})>10);
});

test('bridge groups represent connected structures, not every crossing on the same road',()=>{
 const c=vm.createContext({state:{graph:null}});
 vm.runInContext(slice(route,'  const CONFIG =','  const ui =')+slice(route,'  function toXY(','  function clamp('),c);
 const line=(coords)=>({type:'Feature',properties:{name:'Same Road',highway:'secondary',bridge:'yes',layer:'1'},geometry:{type:'LineString',coordinates:coords}});
 const graph=c.buildGraph({features:[line([[-78.32,44.30],[-78.319,44.30]]),{...line([[-78.319,44.30],[-78.318,44.30]]),properties:{name:'New Road Name',highway:'secondary',bridge:'yes',layer:'1'}},line([[-78.30,44.30],[-78.299,44.30]])]});
 assert.equal(graph.segments[0].bridgeKey,graph.segments[1].bridgeKey);
 assert.notEqual(graph.segments[0].bridgeKey,graph.segments[2].bridgeKey);
 for(const node of graph.nodes)for(const edge of node.edges)assert.equal(edge.bridgeKey,graph.segments[edge.segmentId].bridgeKey);
});

test('untagged roundabouts obey their implied direction and explicit two-way overrides',()=>{
 const c=vm.createContext({state:{graph:null}});
 vm.runInContext(slice(route,'  const CONFIG =','  const ui =')+slice(route,'  function toXY(','  function clamp('),c);
 const line=oneway=>({properties:{highway:'residential',junction:'roundabout',oneway},geometry:{type:'LineString',coordinates:[[-78.32,44.30],[-78.319,44.30]]}});
 assert.equal(c.buildGraph({features:[line(undefined)]}).directedEdges,1);
 assert.equal(c.buildGraph({features:[line('no')]}).directedEdges,2);
});
