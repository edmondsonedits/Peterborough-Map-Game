'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=read('route-mapping/app.js'),html=read('route-mapping/index.html'),css=read('route-mapping/styles.css');
function harness(){
 const els=new Map(),listeners={},capture=new Set(),attributes={};
 const element=id=>{if(!els.has(id))els.set(id,{id,style:{},textContent:'',disabled:false,hidden:false,open:false,dataset:{},classList:{add(){},remove(){},toggle(){}},showModal(){this.open=true;},close(){this.open=false;},setAttribute(k,v){attributes[k]=v;},getBoundingClientRect(){if(id==='draw-surface'){const left=parseFloat(this.style.left)||0,top=parseFloat(this.style.top)||0;return{id,left:left-28,top:top-28,width:56,height:56,right:left+28,bottom:top+28};}return{id,left:100,top:40,width:300,height:200,right:400,bottom:240};},addEventListener(type,fn){listeners[id+':'+type]=fn;},setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);}});return els.get(id);};
 const c=vm.createContext({document:{body:{classList:{toggle(){}}},getElementById:element,createElement:()=>({}),addEventListener(){}},window:{addEventListener(){},PTBO_SERVICE_CONFIG:{profiles:{fire:{bases:[{id:'s1',name:'Station 1',address:'Main Street'}]}}}},L:{point:(x,y)=>({x,y}),polyline:()=>({addTo(){return this;},addLatLng(){}})},console,requestAnimationFrame:fn=>fn(),Math,Number,String,Object,Boolean,Array,Promise});
 const exports=['state','ui','updateDrawTarget','setMapGestureLock','onDrawStart','onDrawMove','onDrawEnd','cancelDrawing','setMode','initMap','bindUi','pointerPoint','openSettings','closeSettings'];
 vm.runInContext(source.replace('  initialize();','  globalThis.routeGestureTest={'+exports.join(',')+'};'),c);
 const api=c.routeGestureTest,draw=element('draw-surface');
 const handlers=Object.fromEntries(['dragging','touchZoom','scrollWheelZoom','keyboard','doubleClickZoom','boxZoom'].map(name=>[name,{active:true,enabled(){return this.active;},enable(){this.active=true;},disable(){this.active=false;}}]));
 api.state.map={...handlers,latLngToContainerPoint:p=>({x:p.lng,y:p.lat}),getSize:()=>({x:300,y:200}),getContainer:()=>element('map'),containerPointToLatLng:p=>({lat:p.y,lng:p.x})};
 api.ui.map=element('map');api.ui.drawSurface=draw;api.ui.submit=element('submit-button');api.ui.undo=element('undo-button');api.ui.clear=element('clear-button');api.ui.results=element('results');api.ui.settingsSheet=element('settings-sheet');api.ui.hint=element('hint');api.ui.zoomIn=element('zoom-in');api.ui.zoomOut=element('zoom-out');api.ui.baseSelect=element('base-select');api.ui.baseSelect.appendChild=()=>{};api.ui.serviceSelect=element('service-select');api.ui.phaseNote=element('phase-note');api.ui.next=element('next-button');api.ui.settingsButton=element('settings-button');api.ui.settingsClose=element('settings-close');api.ui.retry=element('retry-button');api.ui.settingsForm=element('settings-form');
 for(const id of ['street-forgiveness','straight-preference','arrival-distance','challenge-frequency','street-forgiveness-value','straight-preference-value','arrival-distance-value','challenge-frequency-value'])api.ui[id]=element(id);
 api.state.base={id:'s1',name:'Station 1',lat:70,lng:80};api.state.tuning={streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80};api.state.traceCore={snap:p=>p};api.state.mode='drawing';
 return{api,draw,element,listeners,capture,attributes,c};
}
test('draw hotspot follows the active endpoint in viewport coordinates',()=>{
 const{api,draw,attributes}=harness();api.state.playerRoute={endpoint:{lat:90,lng:120},complete:false};api.updateDrawTarget();
 assert.equal(draw.style.left,'220px');assert.equal(draw.style.top,'130px');assert.equal(attributes['aria-label'],'Drag from END to draw the response route');
 api.state.playerRoute=null;api.updateDrawTarget();assert.equal(attributes['aria-label'],'Drag from START to draw the response route');
});
test('hotspot hides when drawing is unavailable or its active anchor is offscreen',()=>{
 const{api,draw}=harness();api.state.playerRoute={endpoint:{lat:240,lng:350},complete:false};api.updateDrawTarget();assert.equal(draw.hidden,true);
 api.state.playerRoute=null;api.state.mode='snapping';api.updateDrawTarget();assert.equal(draw.hidden,true);
 api.state.mode='editing';api.state.playerRoute={endpoint:{lat:90,lng:120},complete:true};api.updateDrawTarget();assert.equal(draw.hidden,true);
});
test('drawing surface is a local hotspot and the Pan/Draw toggle is removed',()=>{
 assert.doesNotMatch(css,/#draw-surface\s*\{[^}]*inset\s*:\s*0/s);
 assert.match(css,/#draw-surface\s*\{[^}]*width\s*:\s*56px/s);assert.match(css,/#draw-surface\s*\{[^}]*height\s*:\s*56px/s);
 assert.doesNotMatch(html,/id="interaction-button"/);assert.match(source,/Drag from START to draw\. Drag elsewhere to move the map\./);
 assert.match(html,/id="clear-button"[\s\S]*id="undo-button"[\s\S]*id="submit-button"/);
});
test('captured drawing continues outside the hotspot and cancellation releases capture',()=>{
 const{api,draw,capture}=harness();let prevented=0;api.state.playerRoute=null;api.updateDrawTarget();
 api.onDrawStart({clientX:180,clientY:110,button:0,pointerId:7,preventDefault(){prevented++;}});
 assert.equal(capture.has(7),true);assert.equal(api.state.rawPoints.length,2);
 assert.ok(Object.values(api.state.map).filter(value=>value&&typeof value==='object'&&'active'in value).every(handler=>handler.active===false));assert.equal(api.ui.zoomIn.disabled,true);assert.equal(api.ui.zoomOut.disabled,true);
 api.onDrawMove({clientX:350,clientY:180,pointerId:7,preventDefault(){prevented++;}});
 assert.equal(api.state.rawPoints.length,3);assert.equal(prevented,2);
 api.cancelDrawing({pointerId:7});assert.equal(capture.has(7),false);assert.equal(api.state.drawingPointer,null);assert.equal(api.state.rawPoints.length,0);
 assert.ok(Object.values(api.state.map).filter(value=>value&&typeof value==='object'&&'active'in value).every(handler=>handler.active===true));assert.equal(api.ui.zoomIn.disabled,false);assert.equal(api.ui.zoomOut.disabled,false);
});
test('accepted drawing stops native pan animation before route sampling and capture',()=>{
 const{api,draw}=harness(),order=[];api.updateDrawTarget();
 api.state.map.stop=()=>order.push('stop');api.state.traceCore.snap=p=>{order.push('snap');return p;};
 api.state.map.containerPointToLatLng=p=>{order.push('pointer');return{lat:p.y,lng:p.x};};
 const capture=draw.setPointerCapture.bind(draw);draw.setPointerCapture=id=>{order.push('capture');capture(id);};
 api.onDrawStart({clientX:180,clientY:110,button:0,pointerId:11,preventDefault(){}});
 assert.deepEqual(order,['stop','snap','pointer','capture']);assert.equal(api.state.drawingPointer,11);
});
test('gesture lock restores handlers and controls to their previous states',()=>{
 const{api}=harness();api.state.map.dragging.disable();api.ui.zoomOut.disabled=true;api.setMapGestureLock(true);
 assert.equal(api.state.map.scrollWheelZoom.active,false);api.setMapGestureLock(false);
 assert.equal(api.state.map.dragging.active,false);assert.equal(api.state.map.scrollWheelZoom.active,true);assert.equal(api.ui.zoomIn.disabled,false);assert.equal(api.ui.zoomOut.disabled,true);
});
test('pointerup restores map gestures before asynchronous street matching',async()=>{
 const sourceFunction=source.slice(source.indexOf('  async function onDrawEnd(event){'),source.indexOf('\n  function cancelDrawing(',source.indexOf('  async function onDrawEnd(event){')));
 const calls=[],c=vm.createContext({state:{mode:'drawing',drawingPointer:9,rawPoints:[{lat:0,lng:0}]},pointerPoint:()=>({lat:1,lng:1}),dist:()=>1,setMapGestureLock:locked=>calls.push(locked?'lock':'unlock'),snapStroke:async()=>calls.push('snap')});
 vm.runInContext(sourceFunction+'\nglobalThis.finishStroke=onDrawEnd;',c);
 await c.finishStroke({pointerId:9,preventDefault(){}});assert.deepEqual(calls,['unlock','snap']);assert.equal(c.state.drawingPointer,null);
});
test('clear, undo, and completion modes refresh or remove the drawing hotspot',()=>{
 const{api,draw}=harness();api.state.playerRoute={endpoint:{lat:90,lng:120},complete:false};api.setMode('drawing');assert.equal(draw.hidden,false);
 api.state.playerRoute=null;api.setMode('drawing');assert.equal(draw.hidden,false);
 api.state.playerRoute={endpoint:{lat:90,lng:120},complete:true};api.setMode('editing');assert.equal(draw.hidden,true);
 api.setMode('results');assert.equal(draw.hidden,true);
});
test('settings modal hides the hotspot and closing it restores the current target',()=>{
 const{api,draw}=harness();api.setMode('drawing');assert.equal(draw.hidden,false);
 api.openSettings();assert.equal(api.ui.settingsSheet.open,true);assert.equal(draw.hidden,true);
 api.updateDrawTarget();assert.equal(draw.hidden,true);
 api.closeSettings();assert.equal(api.ui.settingsSheet.open,false);assert.equal(draw.hidden,false);
});
test('native dialog close event restores the drawing hotspot after Escape dismissal',()=>{
 const{api,draw,listeners}=harness();api.setMode('drawing');api.bindUi();api.openSettings();assert.equal(draw.hidden,true);
 api.ui.settingsSheet.open=false;listeners['settings-sheet:close']({type:'close'});assert.equal(draw.hidden,false);
});
test('stale pointer events cannot start a hidden or zooming draw target',()=>{
 const{api,draw,capture}=harness();api.updateDrawTarget();draw.hidden=true;
 api.onDrawStart({clientX:180,clientY:110,button:0,pointerId:2,preventDefault(){}});assert.equal(capture.has(2),false);
 draw.hidden=false;api.state.mapZooming=true;
 api.onDrawStart({clientX:180,clientY:110,button:0,pointerId:3,preventDefault(){}});assert.equal(capture.has(3),false);
});

test('native map movement events refresh the target without becoming coordinates',()=>{
 const{api,c,draw}=harness(),callbacks=new Map(),map=api.state.map;map.options={};map.on=(name,fn)=>callbacks.set(name,fn);
 c.L.map=()=>({setView:()=>map});c.L.tileLayer=()=>({addTo(){}});
 map.latLngToContainerPoint=p=>{assert.ok(Number.isFinite(p.lat)&&Number.isFinite(p.lng),'map events must not be projected as coordinates');return{x:p.lng,y:p.lat};};
 api.initMap();callbacks.get('move resize')({type:'move',target:map});
 assert.equal(draw.hidden,false);assert.equal(draw.style.left,'180px');assert.equal(draw.style.top,'110px');
});
