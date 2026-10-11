'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createTraceCore}=require('../../route-mapping/trace-core.js');
const source=fs.readFileSync(path.resolve(__dirname,'../../route-mapping/app.js'),'utf8');
function harness(){
 const els=new Map(),listeners={},capture=new Set(),attributes={},frames=new Map();let frameId=0;
 const element=id=>{if(!els.has(id))els.set(id,{id,style:{},textContent:'',disabled:false,hidden:false,open:false,dataset:{},classList:{add(){},remove(){},toggle(){}},showModal(){this.open=true;},close(){this.open=false;},setAttribute(k,v){attributes[k]=v;},getBoundingClientRect(){if(id==='draw-surface'){const left=parseFloat(this.style.left)||0,top=parseFloat(this.style.top)||0;return{id,left:left-28,top:top-28,width:56,height:56,right:left+28,bottom:top+28};}return{id,left:100,top:40,width:300,height:200,right:400,bottom:240};},addEventListener(type,fn){listeners[id+':'+type]=fn;},setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);}});return els.get(id);};
 const c=vm.createContext({document:{body:{classList:{toggle(){}}},getElementById:element,createElement:()=>({}),addEventListener(){}},window:{addEventListener(){},PTBO_SERVICE_CONFIG:{profiles:{fire:{bases:[{id:'s1',name:'Station 1',address:'Main Street'}]}}}},L:{point:(x,y)=>({x,y}),divIcon:o=>o,polyline:coordinates=>({coordinates,addTo(){return this;},setLatLngs(points){this.coordinates=points;}}),marker:point=>({point,addTo(){return this;},setLatLng(point){this.point=point;}})},console,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),Math,Number,String,Object,Boolean,Array,Promise});
 const exports=['state','ui','updateDrawTarget','setMapGestureLock','onDrawStart','onDrawMove','onDrawEnd','cancelDrawing','setMode','initMap','bindUi','pointerPoint','openSettings','closeSettings','undo','resetDrawing'];
 vm.runInContext(source.replace('  initialize();','  globalThis.routeGestureTest={'+exports.join(',')+'};'),c);
 const api=c.routeGestureTest,draw=element('draw-surface');
 const handlers=Object.fromEntries(['dragging','touchZoom','scrollWheelZoom','keyboard','doubleClickZoom','boxZoom'].map(name=>[name,{active:true,enabled(){return this.active;},enable(){this.active=true;},disable(){this.active=false;}}]));
 api.state.map={...handlers,removeLayer(){},fitBounds(){},latLngToContainerPoint:p=>({x:p.lng,y:p.lat}),getSize:()=>({x:300,y:200}),getContainer:()=>element('map'),containerPointToLatLng:p=>({lat:p.y,lng:p.x})};
 api.ui.map=element('map');api.ui.drawSurface=draw;api.ui.submit=element('submit-button');api.ui.undo=element('undo-button');api.ui.clear=element('clear-button');api.ui.results=element('results');api.ui.settingsSheet=element('settings-sheet');api.ui.hint=element('hint');api.ui.zoomIn=element('zoom-in');api.ui.zoomOut=element('zoom-out');api.ui.baseSelect=element('base-select');api.ui.baseSelect.appendChild=()=>{};api.ui.serviceSelect=element('service-select');api.ui.phaseNote=element('phase-note');api.ui.next=element('next-button');api.ui.settingsButton=element('settings-button');api.ui.settingsClose=element('settings-close');api.ui.retry=element('retry-button');api.ui.settingsForm=element('settings-form');
 for(const id of ['street-forgiveness','straight-preference','arrival-distance','challenge-frequency','street-forgiveness-value','straight-preference-value','arrival-distance-value','challenge-frequency-value'])api.ui[id]=element(id);
 api.state.base={id:'s1',name:'Station 1',lat:70,lng:80};api.state.tuning={streetForgiveness:12,straightPreference:35,arrivalDistance:40,challengeFrequency:80};api.state.call={lat:70,lng:250};
 // Fixed test projection: one map unit is one metre. Use the real street core,
 // not a fake advance/finish response, while stubbing only browser surfaces.
 const nodes=[80,150,250].map((x,id)=>({id,x,y:70,lat:70,lng:x,edges:[]}));
 const segments=[];
 for(let id=0;id<2;id++){
  const a=nodes[id],b=nodes[id+1],length=b.x-a.x;
  segments.push({id,from:id,to:id+1,ax:a.x,ay:70,bx:b.x,by:70,dx:length,dy:0,length,lengthSq:length*length,forward:true,backward:true,name:'Main Street'});
  for(const reverse of [false,true]){const from=reverse?id+1:id,to=reverse?id:id+1;nodes[from].edges.push({from,to,segmentId:id,reverse,distance:length,duration:length/10,name:'Main Street'});}
 }
 api.state.traceCore=createTraceCore({graph:{nodes,segments},toXY:(lat,lng)=>({x:lng,y:lat}),toLatLng:(x,y)=>({lat:y,lng:x})});api.state.mode='drawing';
 function flushFrames(){for(const [id,callback] of [...frames]){frames.delete(id);callback();}}
 const pointer=(x,y=70,pointerId=7)=>({clientX:100+x,clientY:40+y,button:0,pointerId,preventDefault(){}});
 return{api,draw,element,listeners,capture,attributes,c,frames,flushFrames,pointer};
}
module.exports={harness};
