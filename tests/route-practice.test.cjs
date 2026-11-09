'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createTraceCore}=require('../route-mapping/trace-core.js');
const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8');

function harness(session=new Map(),storage=new Map()){
 const elements=new Map(),listeners={};
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false,dataset:{},style:{},open:false,children:[],setAttribute(){},appendChild(child){this.children.push(child);},replaceChildren(...children){this.children=children;},getBoundingClientRect(){return{left:0,top:0,right:0,bottom:0,width:0,height:0};},addEventListener(type,fn){listeners[id+':'+type]=fn;}});return elements.get(id);};
 const base={id:'station-1',number:1,name:'Station 1',lat:44.3091,lng:-78.3197};
 const c=vm.createContext({document:{getElementById:element,createElement:()=>({textContent:''}),body:{classList:{toggle(){}}},addEventListener(){}},window:{PTBO_SERVICE_CONFIG:{profiles:{fire:{bases:[base]}}},PTBO_ROUTE_LEARNING:require('../route-mapping/learning-core.js'),addEventListener(){}},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value)},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},L:{polyline:()=>({addTo(){return this;}}),divIcon:o=>o,marker:()=>({addTo(){return this;},setLatLng(){}})},console,requestAnimationFrame:fn=>fn(),cancelAnimationFrame(){}});
 vm.runInContext(source.replace('  initialize();','  globalThis.practiceApi={state,ui,buildGraph,toXY,toLatLng,pathBetween,baseAnchor,callPoint,loadSkillProfiles,loadProgression,submitRoute,resetDrawing,undo,applySettings,newCall,bindUi,revealRoute:typeof revealRoute===\'function\'?revealRoute:null};'),c);
 const a=c.practiceApi,feature=(coordinates,name)=>({type:'Feature',properties:{name,highway:'residential'},geometry:{type:'LineString',coordinates}});
 a.state.graph=a.buildGraph({features:[feature([[-78.3197,44.3091],[-78.318,44.3091]],'Main Street'),feature([[-78.318,44.3091],[-78.318,44.311]],'Second Avenue'),feature([[-78.318,44.311],[-78.316,44.311]],'Main Street')]});
 a.state.traceCore=createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,options)=>a.pathBetween(from,to,'distance',options)});
 a.state.base=base;a.state.calls=[{id:'call-a',main:'Fire',addr:'100 Main Street',lat:44.311,lng:-78.316},{id:'call-b',main:'Fire',addr:'200 Second Avenue',lat:44.31,lng:-78.318}];a.state.call=a.state.calls[0];a.state.mode='drawing';a.state.map={removeLayer(){},fitBounds(){}};
 a.loadSkillProfiles();a.loadProgression();
 const complete=()=>{a.state.originAnchor=a.baseAnchor(a.state.base);a.state.destinationAnchor=a.state.traceCore.snap(a.callPoint(a.state.call),520);a.state.playerRoute={...a.state.traceCore.between(a.state.originAnchor,a.state.destinationAnchor),complete:true};a.state.mode='editing';a.submitRoute();};
 const reveal=()=>{assert.equal(typeof a.revealRoute,'function','production Show route handler exists');a.revealRoute();};
 return{a,c,element,storage,session,listeners,complete,reveal};
}

test('Show route reveals before drawing, displays ordered streets, and preserves incomplete submit gating',()=>{
 const {a,element,reveal,complete}=harness();
 a.submitRoute();assert.equal(a.state.progression.completed,0);assert.equal(a.state.mode,'drawing');
 reveal();assert.equal(a.state.assisted,true);assert.equal(a.state.playerRoute,null);assert.ok(a.state.referenceLayers.length>0);assert.equal(element('results').hidden,false);assert.equal(element('submit-button').disabled,true);
 assert.match(element('result-note').textContent,/unscored/i);
 assert.deepEqual(Array.from(element('reference-streets').children,child=>child.textContent),['Main Street','Second Avenue','Main Street']);
 assert.equal(element('try-again-button').hidden,false);assert.equal(element('next-button').disabled,false);
 complete();assert.equal(a.state.skillProfile.plays,0);assert.equal(a.state.progression.completed,0);
});

test('retry, Clear, Undo and tuning cannot turn a revealed exercise into scored progress or decision learning',()=>{
 const {a,storage,reveal,complete}=harness();reveal();
 const before=JSON.stringify(a.state.skillProfiles),progress=JSON.stringify(a.state.progression);
 a.resetDrawing();assert.equal(a.state.assisted,true);assert.equal(a.state.referenceLayers.length,0);assert.equal(a.state.playerRoute,null);
 a.state.history=[null];a.undo();a.applySettings('fire',{arrivalDistance:60});a.resetDrawing();complete();
 assert.equal(JSON.stringify(a.state.skillProfiles),before);assert.equal(JSON.stringify(a.state.progression),progress);
 assert.equal(storage.has('ptboRouteMappingAdaptiveSkillV1'),false);assert.equal(storage.has('ptboRouteMappingProgressionV1'),false);
 assert.match(a.ui.resultNote.textContent,/unscored/i);
 a.resetDrawing();complete();assert.equal(a.state.skillProfile.plays,0);assert.equal(a.state.progression.completed,0);
});

test('Next Call starts an unrevealed scored exercise, while revisiting the revealed exercise stays assisted',()=>{
 const {a,reveal,complete}=harness();reveal();const revealed=a.state.call.id;a.state.recentCallIds=[revealed];
 a.newCall();assert.notEqual(a.state.call.id,revealed);assert.equal(a.state.assisted,false);assert.equal(a.state.playerRoute,null);assert.equal(a.state.referenceLayers.length,0);
 complete();assert.equal(a.state.skillProfile.plays,1);assert.equal(a.state.progression.completed,1);
 a.state.recentCallIds=[a.state.call.id];a.newCall();assert.equal(a.state.call.id,revealed);assert.equal(a.state.assisted,true);
 complete();assert.equal(a.state.skillProfile.plays,1);assert.equal(a.state.progression.completed,1);
});

test('revealed exercise remains unscored after settings navigation reloads the tab',()=>{
 const first=harness();first.reveal();const second=harness(first.session);second.a.state.recentCallIds=['call-b'];second.a.newCall();
 assert.equal(second.a.state.call.id,'call-a');assert.equal(second.a.state.assisted,true);second.complete();assert.equal(second.a.state.progression.completed,0);assert.equal(second.a.state.skillProfile.plays,0);
});

test('unavailable route explains the failure and still permits retry and next call',()=>{
 const {a,element,reveal}=harness();a.state.call={id:'unreachable',lat:45,lng:-79};reveal();
 assert.equal(a.state.assisted,true);assert.equal(a.state.referenceLayers.length,0);assert.equal(element('results').hidden,false);assert.match(element('result-note').textContent,/no .*route|route .*unavailable/i);
 assert.equal(element('try-again-button').hidden,false);assert.equal(element('next-button').disabled,false);
 a.resetDrawing();assert.equal(a.state.mode,'drawing');assert.equal(a.state.assisted,true);a.newCall();assert.equal(a.state.assisted,false);
});

test('ordinary complete attempts retain efficiency, adaptive learning and progression',()=>{
 const {a,element,complete}=harness();complete();assert.equal(element('efficiency-value').textContent,'100% efficient');assert.equal(a.state.skillProfile.plays,1);assert.equal(a.state.progression.completed,1);assert.equal(a.state.mode,'results');
});

test('reference routes use a verified road-access point while preserving the actual call location',()=>{
 const {a,reveal}=harness();const call=a.state.call,actual={lat:call.lat,lng:call.lng};
 call.routeAccess={lat:44.3091,lng:-78.318};reveal();
 assert.ok(a.state.shortestRoute.distance<150,'reference ends at the explicit road access, rather than the display centre');
 assert.equal(a.state.destinationAnchor.lat,44.3091);assert.deepEqual({lat:call.lat,lng:call.lng},actual);
 a.resetDrawing();call.routeAccess={lat:'invalid',lng:-78.318};reveal();assert.ok(a.state.shortestRoute.distance>450,'invalid access falls back to the actual call');
});

test('continuous Next Call starts at the explicit road approach just reached and preserves landmark coordinates',()=>{
 const {a,complete}=harness(),call=a.state.call,centre={lat:call.lat,lng:call.lng},access={lat:44.3091,lng:-78.318};
 Object.assign(a.state.calls[1],{lat:44.311,lng:-78.317});
 call.routeAccess=access;a.state.progression.completed=19;complete();
 assert.equal(a.state.progression.completed,20);assert.deepEqual({lat:a.state.progression.lastCall.lat,lng:a.state.progression.lastCall.lng},centre);
 a.state.recentCallIds=[call.id];a.newCall();assert.equal(a.state.mode,'drawing');assert.equal(a.state.call.id,'call-b');assert.equal(a.state.phase.continuous,true);assert.equal(a.state.base.id,'previous-call');
 assert.deepEqual({lat:a.state.base.spawnLat,lng:a.state.base.spawnLng},access,'continuous start must use the road approach just reached');
 assert.deepEqual({lat:a.state.base.lat,lng:a.state.base.lng},centre);assert.deepEqual({lat:call.lat,lng:call.lng},centre);
});

test('persisted continuous progress restores the explicit reached approach after reload without relying on the catalogue',()=>{
 const first=harness(),access={lat:44.3091,lng:-78.318};first.a.state.call.routeAccess=access;first.a.state.progression.completed=19;first.complete();
 const second=harness(new Map(),new Map(first.storage));Object.assign(second.a.state.calls[1],{lat:44.311,lng:-78.317});second.a.state.recentCallIds=['call-a'];second.a.newCall();
 assert.equal(second.a.state.mode,'drawing');assert.equal(second.a.state.call.id,'call-b');assert.equal(second.a.state.phase.continuous,true);assert.equal(second.a.state.base.id,'previous-call');
 assert.deepEqual({lat:second.a.state.base.spawnLat,lng:second.a.state.base.spawnLng},access,'saved approach survives progression normalization on reload');
 assert.equal(second.a.state.base.lat,44.311);assert.equal(second.a.state.base.lng,-78.316);
});

test('practice controls are wired to the production reveal, retry and next handlers',()=>{
 const {a,listeners}=harness();a.bindUi();assert.equal(typeof listeners['show-route-button:click'],'function');assert.equal(typeof listeners['try-again-button:click'],'function');
 listeners['show-route-button:click']();assert.equal(a.state.assisted,true);listeners['try-again-button:click']();assert.equal(a.state.mode,'drawing');assert.equal(a.state.assisted,true);
 a.state.recentCallIds=['call-a'];listeners['next-button:click']();assert.equal(a.state.call.id,'call-b');assert.equal(a.state.assisted,false);
});
