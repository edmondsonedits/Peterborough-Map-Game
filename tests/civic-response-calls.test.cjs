'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {selectAssignments}=require('../tools/build-civic-response-calls.cjs');
const candidate=(id,baseId,primaryBaseId,distance,facilityType='school')=>({canonical:{id,addr:id,facilityType,incidentProfiles:{fire:{sub:'Structure Fire'}}},service:'fire',baseId,primaryBaseId,distance});
test('first due selection is stable, diverse and limited per hall',()=>{
 const input=[candidate('a','one','one',500,'school'),candidate('b','one','one',700,'school'),candidate('c','one','one',800,'hospital')];
 const result=selectAssignments(input,{firstDueLimit:2});
 assert.deepEqual(result.map(x=>x.canonical.id),['a','c']);
 assert.deepEqual(selectAssignments([...input].reverse(),{firstDueLimit:2}).map(x=>x.canonical.id),['a','c']);
});
test('support is nearest, bounded, and never replaces first due',()=>{
 const input=[candidate('x','primary','primary',500),candidate('x','other','primary',900),candidate('x','third','primary',1000),candidate('x','far','primary',6501),candidate('y','primary','primary',700),candidate('y','other','primary',1100)];
 const selected=selectAssignments(input,{firstDueLimit:6,supportPerBase:1,supportPerCall:2});
 assert.deepEqual(selected.filter(x=>x.baseId==='primary').map(x=>x.canonical.id),['x','y']);
 assert.equal(selected.filter(x=>x.baseId==='other').length,1);
 assert.ok(!selected.some(x=>x.baseId==='far'));
 assert.equal(selected.filter(x=>x.canonical.id==='x'&&x.baseId!==x.primaryBaseId).length,2);
});
test('audit requires exact canonical identity and a validated primary for support',()=>{
 const {validateCivicAssignment}=require('../tools/check-local-response-calls.cjs');
 const canonical={id:'x',cityId:'city',name:'X',addr:'1 Road',lat:1,lng:2,locationKind:'sourced-address',geographicVerificationRef:'review',sources:['https://example.test/x'],incidentProfiles:{fire:{sub:'Structure Fire'}}};
 const call={...canonical,sub:'Structure Fire',canonicalCallId:'x',routeBaseId:'support',trainingServices:['fire'],responseAssignment:{generator:'civic-v1',role:'support',primaryBaseId:'primary'}};
 const context={cityId:'city',canonical,baseId:'support',service:'fire',primary:{baseId:'primary',service:'fire'},primaryOwns:true,primaryExercise:true,distance:1200,snapDistance:20};
 assert.doesNotThrow(()=>validateCivicAssignment(call,context));
 assert.throws(()=>validateCivicAssignment({...call,lat:3},context),/canonical/);
 assert.throws(()=>validateCivicAssignment({...call,geographicVerificationRef:null},{...context,canonical:{...canonical,geographicVerificationRef:null}}),/canonical/);
 assert.throws(()=>validateCivicAssignment(call,{...context,primaryOwns:false}),/primary/);
 assert.throws(()=>validateCivicAssignment(call,{...context,distance:6501}),/support/);
 assert.throws(()=>validateCivicAssignment(call,{...context,snapDistance:81}),/snap/);
});
test('directed graph cost rejects a hall that cannot drive against a one-way road',()=>{
 const data=require('../tools/route-response-data.cjs'),trace=require('../route-mapping/trace-core.js');
 const {dijkstra,costToAnchor}=require('../tools/build-local-response-calls.cjs');
 const {computeDirectedCosts}=require('../tools/build-civic-response-calls.cjs');
 const city=data.registry.find(c=>c.id==='peterborough'),training=require('../cities/peterborough/training-data.json');
 const api=data.app(city,training,[]),roads={type:'FeatureCollection',features:[{type:'Feature',properties:{name:'One Way',highway:'residential',oneway:'yes'},geometry:{type:'LineString',coordinates:[[-78.32,44.3],[-78.31,44.3],[-78.30,44.3]]}}]};
 api.state.graph=api.buildGraph(roads);api.state.traceCore=trace.createTraceCore({graph:api.state.graph,toXY:api.toXY,toLatLng:api.toLatLng,search:(a,b,o)=>api.pathBetween(a,b,'distance',o)});
 const west=api.state.traceCore.snap({lat:44.3,lng:-78.319},80),east=api.state.traceCore.snap({lat:44.3,lng:-78.301},80);
 assert.ok(Number.isFinite(costToAnchor(api,dijkstra(api,[west],'distance'),east,'distance')));
 assert.equal(costToAnchor(api,dijkstra(api,[east],'distance'),west,'distance'),Infinity);
 assert.equal(api.state.traceCore.between(east,west),null);
 const matrix=computeDirectedCosts(api,[west,east],[west,east]);
 assert.ok(Number.isFinite(matrix[0][1]));assert.equal(matrix[1][0],Infinity);
 const distanceMatrix=computeDirectedCosts(api,[west,east],[west,east],null,'distance',6500);
 assert.ok(distanceMatrix[0][1]>1000);assert.equal(distanceMatrix[1][0],Infinity);
});

test('audit rejects missing or mismatched canonical service incidents',()=>{
 const {validateCivicAssignment}=require('../tools/check-local-response-calls.cjs');
 const canonical={id:'e',cityId:'city',name:'Clinic',addr:'2 Road',lat:1,lng:2,locationKind:'sourced-address',geographicVerificationRef:'review',sources:['https://example.test/e'],incidentProfiles:{ems:{sub:'Medical Assistance'}},trainingServices:['ems']};
 const call={...canonical,sub:'Medical Assistance',canonicalCallId:'e',routeBaseId:'medic',trainingServices:['ems'],responseAssignment:{generator:'civic-v1',role:'first-due',primaryBaseId:'medic'}};
 const context={cityId:'city',canonical,baseId:'medic',service:'ems',primary:{baseId:'medic',service:'ems'},primaryOwns:true,primaryExercise:true,distance:1200,snapDistance:20};
 assert.doesNotThrow(()=>validateCivicAssignment(call,context));
 assert.throws(()=>validateCivicAssignment(call,{...context,canonical:{...canonical,incidentProfiles:{}}}),/incident/);
 assert.throws(()=>validateCivicAssignment({...call,sub:'Structure Fire'},context),/incident/);
 assert.throws(()=>validateCivicAssignment({...call,incidentProfiles:{ems:{sub:'Structure Fire'}}},context),/incident/);
 assert.throws(()=>validateCivicAssignment(call,{...context,canonical:{...canonical,trainingServices:['fire']}}),/service/);
});
test('route candidate lower bound retains boundary cases and excludes distant snapped points',()=>{
 const {withinRouteLowerBound}=require('../tools/build-civic-response-calls.cjs');
 const api={toXY:(lat,lng)=>({x:lng,y:lat})};
 assert.equal(withinRouteLowerBound(api,{lat:0,lng:0},{lat:3900,lng:5200},6500),true);
 assert.equal(withinRouteLowerBound(api,{lat:0,lng:0},{lat:3901,lng:5200},6500),false);
});
test('invalid provisional selections are removed and replaced before support is finalized',()=>{
 const {selectValidatedAssignments}=require('../tools/build-civic-response-calls.cjs');
 const input=[candidate('a','primary','primary',400),candidate('b','primary','primary',500),candidate('b','support','primary',700),candidate('c','primary','primary',600)];
 const checked=[];const selected=selectValidatedAssignments(input,{firstDueLimit:2},c=>{checked.push(c.canonical.id);return c.canonical.id!=='a';});
 assert.deepEqual(selected.filter(c=>c.baseId==='primary').map(c=>c.canonical.id),['b','c']);
 assert.ok(selected.some(c=>c.baseId==='support'&&c.canonical.id==='b'));
 assert.equal(checked.filter(id=>id==='a').length,1);
});
test('near ties are validated before final ordering',()=>{
 const {selectValidatedAssignments}=require('../tools/build-civic-response-calls.cjs');
 const a=candidate('a','primary','primary',500),b=candidate('b','primary','primary',500.005);
 const selected=selectValidatedAssignments([a,b],{firstDueLimit:1},c=>{c.distance=c===a?500.005:499.997;return true;});
 assert.equal(selected[0].canonical.id,'b');
});
test('support at the indexed range boundary is checked before applying its strict cap',()=>{
 const {selectValidatedAssignments}=require('../tools/build-civic-response-calls.cjs');
 const primary=candidate('x','primary','primary',500),support=candidate('x','support','primary',6500.005);
 const selected=selectValidatedAssignments([primary,support],{},c=>{if(c===support)c.distance=6499.999;return true;});
 assert.ok(selected.includes(support));
});
test('modeled tie allocation balances eligible halls and keeps a single primary per location',()=>{
 const {allocatePrimaryAssignments}=require('../tools/build-civic-response-calls.cjs');
 const make=(id,base,cost,eligible=true)=>({...candidate(id,base,'pending',500),primaryEligible:eligible,costs:{own:cost}});
 const input=[make('x','a',100),make('x','b',101),make('y','a',100),make('y','b',101),make('z','a',100),make('z','b',120,false)];
 allocatePrimaryAssignments(input);
 assert.equal(input.find(c=>c.canonical.id==='z').primaryBaseId,'a');
 assert.equal(input.find(c=>c.canonical.id==='x').primaryBaseId,'b');
 assert.equal(input.find(c=>c.canonical.id==='y').primaryBaseId,'a');
 for(const id of ['x','y','z'])assert.equal(new Set(input.filter(c=>c.canonical.id===id).map(c=>c.primaryBaseId)).size,1);
});
test('an inaccessible provisional primary is reallocated to another eligible tied hall',()=>{
 const {selectValidatedAssignments}=require('../tools/build-civic-response-calls.cjs');
 const a={...candidate('x','a',null,500),primaryEligible:true,costs:{own:100}},b={...candidate('x','b',null,600),primaryEligible:true,costs:{own:102}};
 const selected=selectValidatedAssignments([a,b],{balancePrimaries:true},c=>c!==a);
 assert.equal(selected.length,1);assert.equal(selected[0].baseId,'b');assert.equal(selected[0].primaryBaseId,'b');
});
test('modeled first-due ties never produce support for fire investigations',()=>{
 const first={...candidate('park','primary','primary',500),canonical:{id:'park',addr:'Park',facilityType:'recreation',incidentProfiles:{fire:{sub:'Fire Investigation'}}}};
 const tied={...first,baseId:'other',distance:800};
 const selected=selectAssignments([first,tied]);
 assert.deepEqual(selected.map(x=>x.baseId),['primary']);
});
test('unseen priority families precede generic amenities without repeating a school type',()=>{
 const generic=candidate('generic','one','one',200,'convenience'),school1=candidate('school1','one','one',300,'school'),school2=candidate('school2','one','one',350,'school'),hospital=candidate('hospital','one','one',400,'hospital');
 const selected=selectAssignments([generic,school1,school2,hospital],{firstDueLimit:3});
 assert.deepEqual(selected.map(c=>c.canonical.id),['school1','hospital','generic']);
});
test('a healthcare-tagged pharmacy does not outrank a hospital as a priority family',()=>{
 const pharmacy=candidate('a','one','one',200,'healthcare');pharmacy.canonical.name='Main Street Pharmacy';
 const hospital=candidate('b','one','one',500,'hospital');
 assert.equal(selectAssignments([pharmacy,hospital],{firstDueLimit:1})[0],hospital);
});
test('healthcare records named Pharmasave are not preferred as care facilities',()=>{
 const pharmacy=candidate('a','one','one',200,'healthcare');pharmacy.canonical.name='Pharmasave';
 const hospital=candidate('b','one','one',500,'hospital');
 assert.equal(selectAssignments([pharmacy,hospital],{firstDueLimit:1})[0],hospital);
});
test('augmenting allocation fills every hall when a greedy tie choice would starve one',()=>{
 const {allocatePrimaryAssignments}=require('../tools/build-civic-response-calls.cjs');
 const make=(id,base)=>({...candidate(id,base,null,500),primaryEligible:true,costs:{own:100}});
 const input=[make('g1','A'),make('g1','B'),make('g2','A'),make('g2','C'),make('g3','C'),make('g3','D'),make('g4','A'),make('g4','D')];
 allocatePrimaryAssignments(input,{targetPerBase:1});
 const assigned=['g1','g2','g3','g4'].map(id=>input.find(c=>c.canonical.id===id).primaryBaseId);
 assert.deepEqual([...new Set(assigned)].sort(),['A','B','C','D']);
});
test('capacity matching preserves distinct addresses when rerouting tied groups',()=>{
 const {allocatePrimaryAssignments}=require('../tools/build-civic-response-calls.cjs');
 const groups=[['g0','x',['a']],['g1','x',['b']],['g2','y',['a','c']],['g3','x',['a','b','c']],['g4','y',['b']],['g5','z',['b','c']]];
 const input=groups.flatMap(([id,addr,bases])=>bases.map(base=>({...candidate(id,base,null,500),canonical:{...candidate(id,base,null,500).canonical,addr},primaryEligible:true,costs:{own:1}})));
 allocatePrimaryAssignments(input,{targetPerBase:2});
 const addresses=new Map();for(const [id,addr] of groups){const base=input.find(c=>c.canonical.id===id).primaryBaseId;if(!addresses.has(base))addresses.set(base,new Set());addresses.get(base).add(addr);}
 assert.equal([...addresses.values()].reduce((sum,s)=>sum+Math.min(2,s.size),0),6);
});
