'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createTraceCore}=require('../route-mapping/trace-core.js');
function fixture({connected=false,mainY=30,oneway,coincident=false}={}){
 const c={window:{},document:{getElementById:()=>({}),createElement:()=>({})},console};
 const source=fs.readFileSync('route-mapping/app.js','utf8');
 vm.runInNewContext(source.replace('  initialize();',"  globalThis.api={state,ui,buildGraph,toXY,toLatLng,pathBetween,basePoint,baseAnchor:typeof baseAnchor==='function'?baseAnchor:(base=>state.traceCore.snap(basePoint(base),260)),buildDifficultyIndex,scoreCall,chooseCall,progressionPhase,stationForPhase,fillBases,previousCallBase,applyProgressionStart,phaseNoteText};"),c);
 const a=c.api,ll=(x,y)=>a.toLatLng(x,y),line=(points,properties)=>({type:'Feature',properties,geometry:{type:'LineString',coordinates:points.map(([x,y])=>{const p=ll(x,y);return[p.lng,p.lat];})}});
 let roads;
 if(oneway){roads=[line([[-20,0],[20,0]],{highway:'service',name:'One-way yard',oneway}),line([[-20,0],[-20,30],[-150,30]],{highway:'residential',name:'Public access'})];}
 else if(coincident){roads=[line([[-50,0],[50,0]],{highway:'service',name:'Isolated yard'}),line([[-100,0],[100,0],[200,0]],{highway:'residential',name:'Public access'})];}
 else{roads=[line([[-20,0],[20,0]],{highway:'service',name:'Yard road'}),line([[-100,mainY],[20,mainY],[200,mainY]],{highway:'residential',name:'Public access'})];if(connected)roads.push(line([[20,0],[20,mainY]],{highway:'service',name:'Yard exit'}));}
 a.state.graph=a.buildGraph({type:'FeatureCollection',features:roads});a.state.traceCore=createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,o)=>a.pathBetween(from,to,'distance',o)});
 const base={id:'base',service:'fire',name:'Station',...ll(0,2)},call={id:'call',name:'Call',main:'Fire',...ll(oneway?-100:150,oneway?30:coincident?0:mainY)};
 a.state.base=base;a.state.service='fire';a.state.calls=[call];return{a,base,call,c};
}
test('disconnected nearest driveway uses the nearest reachable public access within260m',()=>{
 const{a,base,call}=fixture(),identity={...base},access=a.baseAnchor(base);
 assert.equal(access.road,'Public access');assert.ok(access.distance>27&&access.distance<29);assert.deepEqual(base,identity);
 assert.equal(a.state.traceCore.finish(a.state.traceCore.between(access,a.state.traceCore.snap(call,520)),a.state.traceCore.snap(call,520),40).complete,true);
});
test('a closer connected service road remains the valid start',()=>{
 const{a,base}=fixture({connected:true}),access=a.baseAnchor(base);assert.equal(access.road,'Yard road');assert.ok(access.distance<3);
});
test('absence of connected public access within260m fails clearly instead of extending radius',()=>{
 const{a,base}=fixture({mainY:300});assert.equal(a.baseAnchor(base),null);assert.throws(()=>a.chooseCall(),/connected public-road.*260 m/i);
});
test('departure reachability respects one-way travel rather than weak connectivity',()=>{
 const forward=fixture({oneway:'yes'});assert.notEqual(forward.a.baseAnchor(forward.base).road,'One-way yard');
 const reverse=fixture({oneway:'-1'});assert.equal(reverse.a.baseAnchor(reverse.base).road,'One-way yard');
});
test('the selected reachable segment survives coincident-road ties in difficulty scoring',()=>{
 const{a,base,call}=fixture({coincident:true}),access=a.baseAnchor(base);assert.equal(access.road,'Public access');
 a.buildDifficultyIndex(base);assert.ok(a.scoreCall(call).difficultyDistance>0);
});
test('automatic phases skip origins with no reachable destination without deleting their identity',()=>{
 const{a,base,c}=fixture(),blocked={id:'island',number:1,name:'Island',service:'fire',...a.toLatLng(5000,0)};base.number=2;
 c.window.PTBO_SERVICE_CONFIG={profiles:{fire:{bases:[blocked,base]}}};a.state.progression={completed:0};
 const phase=a.progressionPhase();assert.equal(phase.stationNumber,2);assert.equal(a.stationForPhase(phase),base);assert.equal(c.window.PTBO_SERVICE_CONFIG.profiles.fire.bases.length,2);
});
test('unavailable origins are labelled and disabled in the base list while an available base is retained',()=>{
 const{a,base,c}=fixture(),blocked={id:'island',number:1,name:'Island',service:'fire',...a.toLatLng(5000,0)},options=[];
 c.window.PTBO_SERVICE_CONFIG={profiles:{fire:{bases:[blocked,base]}}};a.ui.baseSelect.appendChild=o=>options.push(o);
 assert.equal(a.fillBases('fire',blocked.id),base);assert.equal(options[0].disabled,true);assert.match(options[0].textContent,/no reachable training destination/i);assert.equal(options[1].disabled,false);
});
test('continuous practice retains call identity and starts at its previously reached public access',()=>{
 const{a}=fixture(),last={id:'last',name:'Remote address',...a.toLatLng(150,320)},next=a.previousCallBase(last);
 assert.equal(next.lat,last.lat);assert.equal(next.lng,last.lng);assert.ok(a.state.traceCore.distance({lat:next.spawnLat,lng:next.spawnLng},last)>260);assert.ok(a.baseAnchor(next));
});
test('unavailability compares stable base IDs when the shared store returns fresh records',()=>{
 const{a,base,c}=fixture(),blocked={id:'island',number:1,name:'Island',service:'fire',...a.toLatLng(5000,0)},options=[];
 c.window.PTBO_BASE_STORE={getBases:()=>[blocked,base].map(b=>({...b}))};a.ui.baseSelect.appendChild=o=>options.push(o);
 a.fillBases('fire',base.id);assert.equal(options[0].disabled,true);assert.equal(options[1].disabled,false);assert.doesNotMatch(a.phaseNoteText('fire'),/No reachable training destination: Island, Station/);
});
test('a terminal directed arrival falls back to an available base for the next call',()=>{
 const{a,base,c}=fixture(),ll=(x,y)=>a.toLatLng(x,y),line=(points,properties)=>({properties,geometry:{type:'LineString',coordinates:points.map(([x,y])=>{const p=ll(x,y);return[p.lng,p.lat];})}});
 a.state.graph=a.buildGraph({features:[line([[0,0],[600,0]],{highway:'service',oneway:'yes',name:'Terminal approach'}),line([[0,0],[0,100],[-100,100]],{highway:'residential',name:'Public route'})]});
 a.state.traceCore=createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,o)=>a.pathBetween(from,to,'distance',o)});
 const last={id:'terminal',main:'Fire',...ll(600,0)},next={id:'next',main:'Fire',...ll(-80,100)};base.number=1;Object.assign(base,ll(0,70));
 c.window.PTBO_SERVICE_CONFIG={profiles:{fire:{bases:[base]}}};a.state.calls=[last,next];a.state.progression={completed:20,lastCall:last};
 const phase=a.applyProgressionStart();assert.equal(phase.continuous,true);assert.equal(a.state.base.id,base.id);assert.equal(phase.originFallback,true);
});
