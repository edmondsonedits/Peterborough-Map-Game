'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('route-mapping/app.js','utf8');
function slice(start,end){const from=source.indexOf(start),to=source.indexOf(end,from);assert.ok(from>=0&&to>from);return source.slice(from,to);}
function graph(size=5000){
 const nodes=Array.from({length:size},(_,id)=>({id,x:id,y:0,edges:[]}));
 const add=(from,to,distance,weight,bridgeKey='')=>nodes[from].edges.push({from,to,distance,duration:distance/10,weight,bridgeKey,name:`${from}-${to}`});
 add(0,1,10,2,'north');add(1,3,10,2,'north');add(0,2,15,1);add(2,3,15,1);add(0,4,8,6);add(4,3,40,6);add(3,0,50,8);add(10,11,6,1);add(11,12,6,1);
 return {nodes};
}
function context(roads=graph()){
 const counts={allocated:0,filled:0},tracked=Base=>class extends Base{constructor(length){super(length);counts.allocated+=1;}fill(...args){counts.filled+=1;return super.fill(...args);}};
 const c=vm.createContext({state:{graph:roads},CONFIG:{maxVisitedNodes:120000},Float64Array:tracked(Float64Array),Int32Array:tracked(Int32Array),Uint32Array:tracked(Uint32Array)});
 vm.runInContext(slice('  class MinHeap','  function addGrid(')+slice('  function heuristic(','  function composeRoute(')+'\nglobalThis.api={pathBetween,computePathBetween,workspace:()=>routeSearchWorkspace};',c);
 return {a:c.api,c,counts};
}
const summary=route=>route?{nodeIds:Array.from(route.nodeIds),edges:Array.from(route.edges,edge=>edge.name),distance:route.distance,duration:route.duration}:null;

test('hundreds of short uncached searches allocate one graph workspace without full-array clearing',()=>{
 const {a,counts}=context();
 for(let i=0;i<300;i++){const result=a.pathBetween(0,3,'distance',{maxDistance:100+i});assert.deepEqual(Array.from(result.nodeIds),[0,1,3]);}
 assert.equal(counts.allocated,3,'scores, parents, and epoch stamps are allocated once per graph');assert.equal(counts.filled,0,'ordinary searches must not clear graph-sized buffers');
});

test('reused search state matches fresh searches across disjoint origins, unreachable routes, and constraints',()=>{
 const {a}=context(),queries=[[0,3,'distance'],[10,12,'distance'],[11,10,'distance'],[0,3,'recommended'],[0,3,'distance',{avoidNode:1}],[0,3,'distance',{avoidBridge:'north'}],[0,3,'distance',{maxDistance:19}],[0,3,'distance',{avoidNode:2,avoidBridge:'north',maxDistance:47}],[3,0,'distance'],[0,12,'distance'],[0,3,'distance'],[0,0,'distance']];
 for(let round=0;round<3;round++)for(const query of queries){const fresh=context();assert.deepEqual(summary(a.computePathBetween(...query)),summary(fresh.a.computePathBetween(...query)),JSON.stringify(query));}
 assert.equal(a.computePathBetween(0,3,'distance',{avoidNode:2,avoidBridge:'north',maxDistance:48}).distance,48);
});

test('graph replacement invalidates cached paths and replaces the reusable workspace',()=>{
 const {a,c,counts}=context();assert.equal(a.pathBetween(0,3,'distance').distance,20);const old=a.workspace(),replacement=graph();replacement.nodes[0].edges=[{from:0,to:3,distance:5,duration:.5,weight:1,name:'replacement'}];
 c.state.graph=replacement;assert.equal(a.pathBetween(0,3,'distance').distance,5);assert.notEqual(a.workspace(),old);assert.equal(counts.allocated,6);
 c.state.graph=graph(20);assert.equal(a.pathBetween(0,3,'distance').distance,20);assert.equal(counts.allocated,9);assert.equal(a.workspace().scores.length,20);
});

test('epoch wrap clears stamps and cannot revive scores or parents from an earlier epoch',()=>{
 const {a,counts}=context();a.computePathBetween(10,12,'distance');const workspace=a.workspace();
 workspace.epoch=0xffffffff;workspace.stamps.fill(1);workspace.scores.fill(-1000);workspace.previous.fill(4999);
 const before=counts.filled,result=a.computePathBetween(0,3,'distance');assert.deepEqual(Array.from(result.nodeIds),[0,1,3]);assert.equal(result.distance,20);assert.equal(workspace.epoch,1);assert.equal(workspace.stamps[4999],0);assert.equal(counts.filled,before+1);
 assert.equal(a.computePathBetween(0,12,'distance'),null);assert.deepEqual(Array.from(a.computePathBetween(10,12,'distance').nodeIds),[10,11,12]);
});

test('visit limits do not leave a partial search usable by the next query',()=>{
 const {a,c}=context();c.CONFIG.maxVisitedNodes=1;assert.equal(a.computePathBetween(0,3,'distance'),null);c.CONFIG.maxVisitedNodes=120000;assert.deepEqual(Array.from(a.computePathBetween(0,3,'distance').nodeIds),[0,1,3]);
});
