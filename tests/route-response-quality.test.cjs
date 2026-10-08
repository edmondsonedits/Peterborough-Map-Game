'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const slice=(s,a,b)=>{const start=s.indexOf(a),end=s.indexOf(b,start);assert.ok(start>=0&&end>start,a);return s.slice(start,end);};
const route=read('route-mapping/app.js');
function routeContext(){
 let reads=0;const edges=[{from:0,to:1,distance:10,duration:1,weight:5},{from:0,to:2,distance:30,duration:2,weight:1}];
 const nodes=[{id:0,x:0,y:0,get edges(){reads++;return edges;}},{id:1,x:10,y:0,edges:[{from:1,to:2,distance:10,duration:1,weight:5}]},{id:2,x:20,y:0,edges:[]}];
 const c=vm.createContext({state:{graph:{nodes}},CONFIG:{maxVisitedNodes:120000}});
 vm.runInContext(slice(route,'  class MinHeap','  function addGrid(')+slice(route,'  function heuristic(','  function eraseGraphLoops('),c);
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
 const c=vm.createContext({state:{mode:'drawing',drawingPointer:7,rawPoints:[{},{},{}],map:{removeLayer(){},dragging:{enable(){enabled++;}}},rawLine:{},editMarker:null,previewLine:null},ui:{drawSurface:{...control,hasPointerCapture:()=>true,releasePointerCapture(){}},clear:noop,undo:noop,submit:noop,next:noop,settingsButton:noop,settingsClose:noop,retry:noop,serviceSelect:noop,settingsForm:noop,settingsSheet:noop},clearLayer(){},snapStroke:async()=>{snaps++;},setHint(){},setMode(){},resetDrawing(){},undo(){},submitRoute(){},newCall(){},openSettings(){},closeSettings(){},fillBases(){},window:{addEventListener(){}},document:{addEventListener(){}}});
 vm.runInContext(slice(route,'  function clearRaw()','  async function snapStroke()')+slice(route,'  function bindUi()','  async function loadData()'),c);
 c.bindUi();await listeners.pointercancel({pointerId:7,preventDefault(){}});assert.equal(snaps,0);assert.equal(c.state.rawPoints.length,0);assert.equal(c.state.drawingPointer,null);
 c.cancelEdit();assert.ok(enabled>0);
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
