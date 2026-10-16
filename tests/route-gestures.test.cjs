'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const source=read('route-mapping/app.js'),html=read('route-mapping/index.html'),css=read('route-mapping/styles.css');
const {harness}=require('./helpers/route-gesture-harness.cjs');
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
 assert.doesNotMatch(html,/id="interaction-button"/);assert.match(source,/Drag from START\. Backtrack to erase\. Release to pause\./);
 assert.match(html,/id="clear-button"[\s\S]*id="undo-button"[\s\S]*id="submit-button"/);
});
test('captured drawing updates the snapped line before release and cancellation preserves it',()=>{
 const{api,draw,capture,flushFrames,pointer}=harness();api.updateDrawTarget();
 api.onDrawStart(pointer(80));assert.equal(capture.has(7),true);assert.equal(api.state.playerRoute.distance,0);
 assert.ok(Object.values(api.state.map).filter(value=>value&&typeof value==='object'&&'active'in value).every(handler=>!handler.active));
 assert.equal(api.ui.zoomIn.disabled,true);assert.equal(api.ui.zoomOut.disabled,true);
 api.onDrawMove(pointer(160));flushFrames();
 assert.equal(api.state.playerRoute.distance,80,'line is snapped before releasing outside the hotspot');
 assert.deepEqual(JSON.parse(JSON.stringify(api.state.playerLayers[1].coordinates)),[[70,80],[70,150],[70,160]]);
 const saved=api.state.playerRoute;api.cancelDrawing({pointerId:7});
 assert.equal(api.state.playerRoute,saved);assert.equal(api.state.playerRoute.complete,false);
 assert.equal(capture.has(7),false);assert.equal(api.state.drawingPointer,null);assert.equal(api.state.stroke,null);
 assert.equal(api.state.history.length,1);assert.equal(draw.hidden,false);
 assert.ok(Object.values(api.state.map).filter(value=>value&&typeof value==='object'&&'active'in value).every(handler=>handler.active));
 assert.equal(api.ui.zoomIn.disabled,false);assert.equal(api.ui.zoomOut.disabled,false);
});
test('accepted drawing stops native pan animation before route sampling and capture',()=>{
 const{api,draw}=harness(),order=[];api.updateDrawTarget();
 api.state.map.stop=()=>order.push('stop');const snap=api.state.traceCore.snap;api.state.traceCore.snap=(...args)=>{order.push('snap');return snap(...args);};
 api.state.map.containerPointToLatLng=p=>{order.push('pointer');return{lat:p.y,lng:p.x};};
 const capture=draw.setPointerCapture.bind(draw);draw.setPointerCapture=id=>{order.push('capture');capture(id);};
 api.onDrawStart({clientX:180,clientY:110,button:0,pointerId:11,preventDefault(){}});
 assert.equal(order[0],'stop');assert.ok(order.indexOf('snap')>0);assert.ok(order.indexOf('pointer')>order.indexOf('snap'));assert.equal(order.at(-1),'capture');assert.equal(api.state.drawingPointer,11);
});
test('gesture lock restores handlers and controls to their previous states',()=>{
 const{api}=harness();api.state.map.dragging.disable();api.ui.zoomOut.disabled=true;api.setMapGestureLock(true);
 assert.equal(api.state.map.scrollWheelZoom.active,false);api.setMapGestureLock(false);
 assert.equal(api.state.map.dragging.active,false);assert.equal(api.state.map.scrollWheelZoom.active,true);assert.equal(api.ui.zoomIn.disabled,false);assert.equal(api.ui.zoomOut.disabled,true);
});
test('pointerup flushes pending samples once, preserves the route and restores map gestures',()=>{
 const{api,draw,capture,frames,pointer}=harness();api.updateDrawTarget();
 api.onDrawStart(pointer(80));api.onDrawMove(pointer(130));assert.equal(frames.size,1);
 api.onDrawEnd(pointer(160));
 assert.equal(api.state.playerRoute.distance,80);assert.equal(api.state.history.length,1);
 assert.equal(api.state.drawingPointer,null);assert.equal(api.state.stroke,null);assert.equal(frames.size,0);
 assert.equal(capture.has(7),false);assert.equal(api.state.map.dragging.enabled(),true);
 assert.equal(draw.hidden,false);assert.equal(draw.style.left,'260px');
 const paused=api.state.playerRoute;api.onDrawEnd(pointer(160));assert.equal(api.state.playerRoute,paused);
 api.onDrawStart(pointer(160));api.onDrawEnd(pointer(180));assert.equal(api.state.playerRoute.distance,100);
 api.undo();assert.equal(api.state.playerRoute,paused);assert.equal(api.state.mode,'drawing');
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
 api.initMap();callbacks.get('move')({type:'move',target:map});callbacks.get('resize')({type:'resize',target:map});
 assert.equal(draw.hidden,false);assert.equal(draw.style.left,'180px');assert.equal(draw.style.top,'110px');
});

test('off-centre click does not add distance and another pointer cannot cancel active drawing',()=>{
 const{api,capture,pointer,flushFrames}=harness();api.updateDrawTarget();
 api.onDrawStart(pointer(88));api.onDrawEnd(pointer(88));
 assert.equal(api.state.playerRoute,null);assert.equal(api.state.history.length,0);
 api.onDrawStart(pointer(80));api.onDrawMove(pointer(130));flushFrames();
 api.cancelDrawing({pointerId:99});assert.equal(api.state.drawingPointer,7);assert.equal(capture.has(7),true);
 api.onDrawEnd(pointer(130));assert.equal(api.state.playerRoute.distance,50);
});
