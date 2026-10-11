'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const learningFile=path.resolve(__dirname,'../route-mapping/learning-core.js'),learning=fs.existsSync(learningFile)?require(learningFile):null;
function edge(from,to,distance,name='Road'){return {from,to,distance,name,start:{lat:0,lng:from},end:{lat:0,lng:to},segmentId:from*100+to,reverse:false};}
test('learning attributes a later costly error to its divergence, not an earlier near tie',()=>{
 assert.ok(learning,'decision comparison core is not implemented');
 const reference={edges:[edge(0,1,100,'A'),edge(1,2,100,'B'),edge(2,3,100,'C')],distance:300};
 const player={edges:[edge(0,4,90,'D'),edge(4,1,110,'E'),edge(1,2,100,'B'),edge(2,5,600,'X'),edge(5,3,600,'Y')],distance:1500};
 const result=learning.compareChoices(player,reference);
 assert.equal(result.regrets.length,1);assert.equal(result.regrets[0].correct.from,2);assert.equal(result.regrets[0].extra,1100);
});
test('correct decision credit is observed once and does not credit an unused reference road',()=>{
 assert.ok(learning,'decision comparison core is not implemented');
 const a=edge(0,1,100,'A'),b=edge(1,2,100,'B'),reference={edges:[a,b],distance:200};
 const player={edges:[edge(0,3,100),edge(3,1,100),b,edge(2,1,100),b],distance:500};
 const result=learning.compareChoices(player,reference);
 assert.equal(result.correctDecisions.length,1);assert.equal(result.correctDecisions[0].from,1);
});
test('near-equal legal routes receive no specific weakness blame',()=>{
 assert.ok(learning,'decision comparison core is not implemented');
 const ref={edges:[edge(0,1,1000)],distance:1000},player={edges:[edge(0,2,520),edge(2,1,530)],distance:1050};
 assert.equal(learning.compareChoices(player,ref).regrets.length,0);
});
function context(){
 const source=fs.readFileSync(path.resolve(__dirname,'../route-mapping/app.js'),'utf8');
 function slice(a,b){const x=source.indexOf(a),y=source.indexOf(b,x);assert.ok(x>=0&&y>x,a);return source.slice(x,y);}
 const c=vm.createContext({state:{service:'fire',graph:null},window:{PTBO_ROUTE_LEARNING:learning,PTBO_BASE_STORE:{getBases:()=>[]}}});
 vm.runInContext(slice('  const CONFIG =','  const ui =')+slice('  function toXY(','  function drawCasedRoute(')+slice('  function basePoint(','  function updateMarkers(')+slice('  function decisionKey(','  function callsForService(')+slice('  function basesForService(','  function fillBases('),c);
 return c;
}
test('same-name departure directions and committed bridge alternatives count as decisions',()=>{
 const c=context(),xy=[[-20,0],[20,0],[20,200],[-20,-200],[300,200]],nodes=xy.map(([x,y],id)=>({id,x,y,...c.toLatLng(x,y),edges:[]})),segments=[];
 function link(from,to,name,bridgeKey=''){const a=nodes[from],b=nodes[to],id=segments.length,d=Math.hypot(a.x-b.x,a.y-b.y);
  segments.push({id,from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx:b.x-a.x,dy:b.y-a.y,length:d,lengthSq:d*d,name,forward:true,backward:true});
  nodes[from].edges.push({from,to,segmentId:id,reverse:false,name,highway:'secondary',bridgeKey,distance:d,duration:d/10,weight:d/10});
  nodes[to].edges.push({from:to,to:from,segmentId:id,reverse:true,name,highway:'secondary',bridgeKey,distance:d,duration:d/10,weight:d/10});
 }
 link(0,1,'Hall Street');link(1,2,'East approach');link(0,3,'West approach');link(2,4,'North Bridge','North Bridge');link(3,4,'South Bridge','South Bridge');
 const segmentGrid=new Map();segments.forEach(s=>c.addGrid(segmentGrid,(s.ax+s.bx)/2,(s.ay+s.by)/2,s.id,s.length/2+12));c.state.graph={nodes,segments,segmentGrid};c.state.base=c.toLatLng(0,0);
 c.state.traceCore=require('../route-mapping/trace-core.js').createTraceCore({graph:c.state.graph,toXY:c.toXY,toLatLng:c.toLatLng,search:(from,to,o)=>c.pathBetween(from,to,'distance',o)});
 const result=c.analyzeDecisionDifficulty({...nodes[4],difficulty:30},c.state.base);
 assert.ok(result.traps.some(t=>t.kind==='departure'),'opposite directions on Hall Street must be compared');
 assert.ok(result.traps.some(t=>t.kind==='bridge'),'the competing bridge must be compared as a corridor');
 assert.ok(result.decisionScore>0);
});

test('unrejoined traces get route-level feedback instead of invented local blame',()=>{
 const ref={edges:[edge(0,1,100)],distance:100},player={edges:[edge(0,2,900)],distance:900};
 assert.equal(learning.compareChoices(player,ref).regrets.length,0);
});
test('matching road direction at a different fractional position is not correct decision evidence',()=>{
 const refEdge={...edge(0,1,100),t0:.5,t1:1,start:{lat:0,lng:.5}};
 const playerEdge={...edge(0,1,60),t0:.5,t1:.8,start:{lat:0,lng:.5},end:{lat:0,lng:.8}};
 const result=learning.compareChoices({edges:[playerEdge],distance:60},{edges:[refEdge],distance:100});
 assert.equal(result.correctDecisions.length,0);
});
