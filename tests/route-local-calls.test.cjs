'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('route-mapping/app.js','utf8');
const {createTraceCore}=require('../route-mapping/trace-core.js');

function fixture(){
 const elements=new Map(),storage=new Map(),math=Object.create(Math);math.random=()=>.25;
 const c={Math:math,console,window:{PTBO_ROUTE_LEARNING:require('../route-mapping/learning-core.js')},localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById(id){if(!elements.has(id))elements.set(id,{dataset:{},appendChild(){},setAttribute(){}});return elements.get(id);},createElement:()=>({})}};
 vm.runInNewContext(source.replace('  initialize();',`  globalThis.api={state,ui,CONFIG,toLatLng,toXY,buildGraph,pathBetween,baseAnchor,chooseCall,newCall,applyProgressionStart,normalizeProgression,recordProgressionCompletion,availableBasesForService,fillBases,loadData,applySettings,normalizeTuning,watchScoring(fn){const score=scoreCall;scoreCall=(call,...args)=>{fn(call);return score(call,...args);};},watchAnalysis(fn){const analyze=analyzeCallShortlist;analyzeCallShortlist=(calls,target)=>{fn(calls);return analyze(calls,target);};}};`),c);
 const a=c.api,ll=(x,y)=>a.toLatLng(x,y),line=(coords,name,extra={})=>({type:'Feature',properties:{highway:'residential',name,...extra},geometry:{type:'LineString',coordinates:coords.map(([x,y])=>{const p=ll(x,y);return[p.lng,p.lat];})}});
 const roads={features:[line([[-100,0],[0,0],[200,0]],'Hall Street'),line([[200,0],[200,400],[600,400],[800,400],[1000,400]],'Local Road'),line([[-100,0],[-100,-700],[1000,-700],[1000,400]],'West Loop'),line([[200,0],[1200,0],[1200,400],[1000,400]],'East Loop'),line([[1200,0],[9000,0],[9500,0],[10000,0]],'Far Road'),line([[2000,2000],[2200,2000]],'Disconnected Road')]};
 a.state.graph=a.buildGraph(roads);a.state.traceCore=createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,o)=>a.pathBetween(from,to,'distance',o)});
 const bases=[{id:'fire-a',service:'fire',number:1,name:'Hall A',address:'Hall Street',...ll(0,2)},{id:'fire-b',service:'fire',number:2,name:'Hall B',address:'Far Road',...ll(9000,2)},{id:'ems-a',service:'ems',number:1,name:'EMS A',address:'Hall Street',...ll(0,2)}];
 c.window.PTBO_BASE_STORE={getBases:service=>bases.filter(base=>base.service===service).map(base=>({...base})),getSeed:()=>bases.map(base=>({...base}))};
 const call=(id,base,service,x,y,extra={})=>({id,name:id,addr:id,main:service==='fire'?'Fire':'Medical',sub:'Assistance',trainingServices:[service],incidentProfiles:{[service]:{sub:'Assistance'}},routeBaseId:base,...ll(x,y),...extra});
 const local=[call('route-local-a1','fire-a','fire',600,400),call('route-local-a2','fire-a','fire',800,400),call('route-local-a3','fire-a','fire',1000,400)];
 const other=[call('route-local-b1','fire-b','fire',9500,0),call('route-local-b2','fire-b','fire',9800,0),call('route-local-b3','fire-b','fire',10000,0)];
 const medical=[call('route-local-ems1','ems-a','ems',600,400),call('route-local-ems2','ems-a','ems',800,400),call('route-local-ems3','ems-a','ems',1000,400)];
 const citywide={id:'citywide-care-home',main:'Medical',facilityType:'long-term-care',...ll(9500,0)};
 a.state.calls=[...local,...other,...medical,citywide];
 const profiles=bases.map(base=>({baseId:base.id,service:base.service,number:base.number,name:base.name,method:'modeled-road-response',maxRouteMetres:3000,callIds:a.state.calls.filter(call=>call.routeBaseId===base.id).map(call=>call.id),access:{...ll(base.id==='fire-b'?9000:0,0),road:base.id==='fire-b'?'Far Road':'Hall Street',gapMetres:2}}));
 a.state.routeResponses={schemaVersion:1,minCallsPerBase:3,bases:profiles};a.state.base=bases[0];a.state.service='fire';a.state.progression={completed:0,lastCall:null};a.state.phase={continuous:false,completedInPhase:0};a.state.recentCallIds=[];
 return {a,c,bases,local,other,medical,profiles,citywide,ll,roads,storage};
}

test('hall and service scope is applied before scoring and decision analysis',()=>{
 const {a,local,other,medical,profiles}=fixture(),scored=[],analyzed=[];profiles[0].callIds.push(other[0].id,medical[0].id);a.watchScoring(call=>scored.push(call.id));a.watchAnalysis(calls=>analyzed.push(...calls.map(call=>call.id)));
 const selected=a.chooseCall(),ids=new Set(local.map(call=>call.id));
 assert.ok(scored.length>=3);assert.ok(scored.every(id=>ids.has(id)),scored.join(', '));assert.ok(analyzed.every(id=>ids.has(id)));assert.ok(ids.has(selected.id));assert.ok(selected.decisionAnalysis.traps.length>0,'local routes retain real direction/route decisions');
 assert.ok(Math.abs(selected.difficultyDistance-selected.decisionAnalysis.optimalDistance)<.01,'difficulty uses the actual hall route');
 assert.equal(a.state.difficultyIndex,null,'small local pools do not build a citywide distance index');
});

test('exhausted history recycles only this hall and avoids the immediately previous call',()=>{
 const {a,local}=fixture(),ids=new Set(local.map(call=>call.id));a.state.recentCallIds=local.map(call=>call.id);
 for(let i=0;i<25;i++){const previous=a.state.recentCallIds.at(-1),next=a.chooseCall();assert.ok(ids.has(next.id));assert.notEqual(next.id,previous);}
});

test('EMS priority receives only the current EMS hall catalog, including after exhaustion',()=>{
 const {a,c,bases,medical}=fixture(),seen=[];a.state.service='ems';a.state.base=bases[2];a.state.recentCallIds=medical.map(call=>call.id);
 c.window.PTBO_EMS_PRIORITY={chooseGroup(pool){seen.push(...pool);return pool;}};
 const selected=a.chooseCall();assert.ok(medical.some(call=>call.id===selected.id));assert.ok(seen.length);assert.ok(seen.every(call=>call.routeBaseId==='ems-a'&&call.trainingServices.includes('ems')));
});

test('missing, out-of-range, and unreachable catalogs fail clearly without citywide fallback',()=>{
 const {a,profiles,local,ll}=fixture();profiles[0].callIds=[];
 assert.throws(()=>a.chooseCall(),/local response.*Hall A|Hall A.*local response/i);
 profiles[0].callIds=local.map(call=>call.id);profiles[0].maxRouteMetres=100;
 assert.throws(()=>a.chooseCall(),/local response.*Hall A|Hall A.*local response/i);
 profiles[0].maxRouteMetres=3000;for(const call of local)Object.assign(call,ll(2100,2000));
 assert.throws(()=>a.chooseCall(),/local response.*Hall A|Hall A.*local response/i);
});

test('an invalid reachable hall remains visible while explicitly unavailable profiles are disabled',()=>{
 const {a,bases,profiles}=fixture(),options=[];profiles[0].callIds=[];profiles[1].unavailable=true;profiles[1].reason='No usable local road network';
 a.ui.baseSelect.appendChild=option=>options.push(option);assert.equal(a.fillBases('fire',bases[0].id).id,bases[0].id);
 assert.equal(options[0].disabled,false);assert.equal(options[1].disabled,true);assert.throws(()=>a.chooseCall(),/local response/i);
});

test('custom bases without a local profile give an explanation instead of a distant fallback',()=>{
 const {a,ll}=fixture();a.state.base={id:'custom-hall',name:'Custom Hall',service:'fire',...ll(200,0)};
 assert.throws(()=>a.chooseCall(),/local response.*Custom Hall|Custom Hall.*local response/i);
});

test('audited access remains on the road and stale access searches only for this hall’s local calls',()=>{
 const {a,profiles,ll,local}=fixture(),anchor=a.baseAnchor(a.state.base);assert.ok(Math.abs(anchor.distance-2)<.01);assert.equal(anchor.road,'Hall Street');
 profiles[0].access={...ll(100000,0),road:'Stale road',gapMetres:2};const selected=a.chooseCall();assert.ok(local.some(call=>call.id===selected.id));assert.ok(a.baseAnchor(a.state.base).distance<3);
});

test('a close call behind a one-way terminal cannot become a legal response',()=>{
 const {a,local,ll}=fixture(),points=[[-500,0],[0,0]].map(([x,y])=>{const p=ll(x,y);return[p.lng,p.lat];});
 a.state.graph=a.buildGraph({features:[{properties:{name:'One way approach',highway:'residential',oneway:'yes'},geometry:{type:'LineString',coordinates:points}}]});a.state.traceCore=createTraceCore({graph:a.state.graph,toXY:a.toXY,toLatLng:a.toLatLng,search:(from,to,o)=>a.pathBetween(from,to,'distance',o)});
 local.forEach((call,index)=>Object.assign(call,ll(-400+index*100,0)));assert.throws(()=>a.chooseCall(),/local response.*legal routes/i);
});

test('a later phase with invalid response data displays the data error',()=>{
 const {a,c,profiles}=fixture();profiles[1].callIds=[];a.state.progression.completed=20;c.console={...console,error(){}};
 assert.doesNotThrow(()=>a.newCall());assert.equal(a.state.mode,'loading');assert.equal(a.ui.error.hidden,false);assert.match(a.ui.errorMessage.textContent,/local response.*Hall B/i);assert.equal(a.state.callCount,0);
});

test('continuous practice preserves its hall scope through saved progress',()=>{
 const {a,local,storage}=fixture();a.state.call=a.chooseCall();a.recordProgressionCompletion();
 assert.equal(a.state.progression.lastCall.responseBaseId,'fire-a');assert.equal(JSON.parse(storage.get(a.CONFIG.progressionStorageKey)).progression.lastCall.responseBaseId,'fire-a');
 const saved=a.normalizeProgression(a.state.progression);assert.equal(saved.lastCall.responseBaseId,'fire-a');a.state.progression={...saved,completed:40};
 a.applyProgressionStart();assert.equal(a.state.base.id,'previous-call');assert.equal(a.state.base.responseBaseId,'fire-a');
 for(let i=0;i<8;i++){const selected=a.chooseCall();assert.ok(local.some(call=>call.id===selected.id));}
});

test('legacy continuous progress resolves a nearby local hall and distant legacy origins return to a hall',()=>{
 const {a,ll,local}=fixture();a.state.progression={completed:40,lastCall:{id:'old-catalog-call',name:'Legacy call',...ll(600,350)}};a.applyProgressionStart();
 assert.equal(a.state.base.id,'previous-call');assert.equal(a.state.base.responseBaseId,'fire-a');const nearby=a.chooseCall();assert.ok(local.some(call=>call.id===nearby.id));
 a.state.progression={completed:40,lastCall:{id:'old-far-call',name:'Far legacy call',...ll(100000,0)}};const phase=a.applyProgressionStart();
 assert.notEqual(a.state.base.id,'previous-call');assert.equal(phase.originFallback,true);const fallback=a.chooseCall();assert.ok(local.some(call=>call.id===fallback.id));
});

test('published data loads route-only calls without modifying the shared catalog and requires valid profiles',async()=>{
 const {a,c,local,other,medical,profiles,roads}=fixture(),shared=[{id:'shared',main:'Fire',...local[0]}];shared[0].id='shared';delete shared[0].routeBaseId;
 const routeCalls=[...local,...other,...medical],data={id:'peterborough',routeResponses:a.state.routeResponses,routeCalls};
 c.window.PTBO_DISPATCH_STORE={ready:async()=>shared,getTrainingData:()=>data};c.window.PTBO_ROUTE_TRACE={createTraceCore};c.location={href:'https://example.invalid/route-mapping/'};c.URL=URL;c.AbortSignal=AbortSignal;c.fetch=async()=>({ok:true,json:async()=>roads});
 await a.loadData();assert.equal(shared.length,1);assert.equal(shared[0].routeBaseId,undefined);assert.equal(a.state.routeResponses,data.routeResponses);assert.ok(a.state.calls.some(call=>call.id===local[0].id));assert.equal(a.state.originalCalls.length,1);
 profiles[0].callIds=['missing'];await assert.rejects(a.loadData(),/local response/i);
 delete data.routeResponses;await assert.rejects(a.loadData(),/local response/i);
});

test('route response changes retain UI defaults and same-service Apply keeps the active call',()=>{
 const {a}=fixture();assert.deepEqual({...a.normalizeTuning(null)},{streetForgiveness:18,straightPreference:50,arrivalDistance:40,challengeFrequency:80});a.state.call={id:'in-progress'};
 assert.equal(a.applySettings('fire',{streetForgiveness:18,straightPreference:50,arrivalDistance:40,challengeFrequency:80}),false);assert.equal(a.state.call.id,'in-progress');assert.equal(a.CONFIG.callsPerStationPhase,20);
});
