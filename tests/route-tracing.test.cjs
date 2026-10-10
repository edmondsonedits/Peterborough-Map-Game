'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../route-mapping/trace-core.js');
const api=fs.existsSync(file)?require(file):null;
function fixture(coords,links){
 const nodes=coords.map(([x,y],id)=>({id,x,y,lng:x,lat:y,edges:[]})),segments=[];
 links.forEach(([from,to,oneway=false,name='Road',bridge=false])=>{
  const a=nodes[from],b=nodes[to],id=segments.length,length=Math.hypot(b.x-a.x,b.y-a.y);
  segments.push({id,from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx:b.x-a.x,dy:b.y-a.y,lengthSq:length*length,length,name,forward:true,backward:!oneway,bridgeKey:bridge?name:''});
  function edge(x,y,reverse){nodes[x].edges.push({from:x,to:y,segmentId:id,reverse,name,bridgeKey:bridge?name:'',distance:length,duration:length/10,weight:length/10});}
  edge(from,to,false);if(!oneway)edge(to,from,true);
 });
 return {nodes,segments};
}
function core(graph){assert.ok(api,'faithful tracing core has not been implemented');return api.createTraceCore({graph,toXY:(lat,lng)=>({x:lng,y:lat}),toLatLng:(x,y)=>({lat:y,lng:x})});}
const pt=(x,y)=>({lat:y,lng:x}),line=()=>fixture([[0,0],[200,0]],[[0,1]]);
test('short stroke stays partial at its fractional released position',()=>{
 const c=core(line()),r=c.trace([pt(0,0),pt(25,0),pt(50,0)],{tolerance:12});
 assert.equal(r.complete,false);assert.ok(Math.abs(r.distance-50)<.01);assert.ok(Math.abs(r.endpoint.lng-50)<.01);
 assert.equal(c.finish(r,c.snap(pt(200,0),12),40).complete,false);
});
test('continuation and nearby network arrival complete only the remaining small gap',()=>{
 const c=core(line()),a=c.trace([pt(0,0),pt(60,0)],{tolerance:12}),b=c.trace([a.endpoint,pt(170,0)],{tolerance:12});
 const r=c.finish(c.combine(a,b),c.snap(pt(200,0),12),40);
 assert.equal(r.complete,true);assert.ok(Math.abs(r.distance-200)<.01);
});
test('north and south bridge choices remain distinct',()=>{
 const c=core(fixture([[0,0],[0,100],[100,100],[100,0],[0,-150],[100,-150]],[[0,1,false,'West bank'],[1,2,false,'North Bridge',true],[2,3,false,'East bank'],[0,4,false,'West bank'],[4,5,false,'South Bridge',true],[5,3,false,'East bank']]));
 const n=c.trace([pt(0,0),pt(0,100),pt(100,100),pt(100,0)],{tolerance:12}),s=c.trace([pt(0,0),pt(0,-150),pt(100,-150),pt(100,0)],{tolerance:12});
 assert.equal(Math.round(n.distance),300);assert.equal(Math.round(s.distance),400);
 assert.ok(n.edges.some(e=>e.bridgeKey==='North Bridge'));assert.ok(s.edges.some(e=>e.bridgeKey==='South Bridge'));
});
test('intentional return to a previously visited junction keeps the loop',()=>{
 const c=core(fixture([[0,0],[0,100],[100,100],[100,0],[-200,0]],[[0,1],[1,2],[2,3],[3,0],[0,4]]));
 const r=c.trace([pt(0,0),pt(0,100),pt(100,100),pt(100,0),pt(0,0),pt(-200,0)],{tolerance:12});
 assert.equal(Math.round(r.distance),600);assert.ok(r.edges.length>=5);
});
test('one-way fractional tracing refuses backward travel',()=>{
 const c=core(fixture([[0,0],[200,0]],[[0,1,true]]));
 assert.equal(Math.round(c.trace([pt(20,0),pt(70,0)],{tolerance:12}).distance),50);
 assert.throws(()=>c.trace([pt(70,0),pt(20,0)],{tolerance:12}),/connected|direction|street/i);
});
test('nearby disconnected roads never count as arrival or get silently joined',()=>{
 const c=core(fixture([[0,0],[100,0],[0,25],[100,25]],[[0,1],[2,3]]));
 const r=c.trace([pt(0,0),pt(90,0)],{tolerance:12});
 assert.equal(c.finish(r,c.snap(pt(90,25),12),40).complete,false);
 assert.throws(()=>c.trace([pt(0,0),pt(90,0),pt(90,25)],{tolerance:12}),/connected|street/i);
});
module.exports={fixture,pt};

test('coincident disconnected crossings cannot change levels without a road connection',()=>{
 const c=core(fixture([[-100,0],[0,0],[100,0],[0,-100],[0,0],[0,100]],[[0,1],[1,2],[3,4],[4,5]]));
 assert.throws(()=>c.trace([pt(-100,0),pt(0,0),pt(0,100)],{tolerance:12}),/connected|connection|street/i);
});
test('combining discontinuous edge chains is rejected',()=>{
 const c=core(line()),a=c.trace([pt(0,0),pt(40,0)],{tolerance:12}),b=c.trace([pt(40,0),pt(80,0)],{tolerance:12});
 b.edges[0].start=pt(150,0);
 assert.throws(()=>c.combine(a,b),/connection|connected|street/i);
});

test('a straight stroke cannot invent a connector whose turn leaves its corridor',()=>{
 const c=core(fixture([[-20,0],[0,30],[20,0],[0,-30]],[[0,1],[1,2],[0,3],[3,2]]));
 // Both legal alternatives leave the line; neither turn was drawn.
 assert.throws(()=>c.trace([pt(-20,0),pt(20,0)],{tolerance:12}),/street|connected|junction/i);
});
test('local connectors must keep their endpoints inside the drawn corridor',()=>{
 const c=core(fixture([[0,0],[0,30],[10,0]],[[0,1],[1,2]]));
 const a={...pt(0,0),segmentId:0,t:0},b={...pt(10,0),segmentId:1,t:1};
 assert.equal(c.between(a,b,{local:true,maxDistance:100,corridorStart:pt(0,0),corridorEnd:pt(10,0),corridorWidth:18}),null);
});

test('a modest visual offset is rejected by the old cap but traces with explicit extra forgiveness',()=>{
 const c=core(line()),points=[{...pt(0,0),segmentId:0,t:0},pt(50,45)];
 assert.throws(()=>c.trace(points,{tolerance:40}),/street/);
 const r=c.trace(points,{tolerance:50});
 assert.ok(Math.abs(r.distance-50)<.01);assert.equal(r.complete,false);
});
test('street-following preference changes geometric matching without routing to a call',()=>{
 const c=core(fixture([[-100,0],[100,0],[8,-100],[8,100]],[[0,1,false,'East-west'],[2,3,false,'North-south']]));
 assert.equal(c.snap(pt(8,3),12,{x:1,y:0},null,0).road,'North-south');
 assert.equal(c.snap(pt(8,3),12,{x:1,y:0},null,1).road,'East-west');
});
test('a street-gap rejection exposes its location and measured tolerance for actionable feedback',()=>{
 const c=core(line());
 assert.throws(()=>c.trace([pt(0,0),pt(50,45)],{tolerance:40}),error=>{
  assert.equal(error.code,'street-gap');assert.ok(error.point);assert.ok(error.nearestDistance>40);assert.equal(error.tolerance,40);
  return true;
 });
});

test('high forgiveness still rejects disconnected crossings and backward one-way travel',()=>{
 const separate=core(fixture([[0,0],[100,0],[0,25],[100,25]],[[0,1],[2,3]]));
 assert.throws(()=>separate.trace([pt(0,0),pt(90,0),pt(90,25)],{tolerance:90,directionBias:1}),/connected|street/i);
 const oneWay=core(fixture([[0,0],[200,0]],[[0,1,true]]));
 assert.throws(()=>oneWay.trace([pt(70,0),pt(20,0)],{tolerance:90,directionBias:0}),/connected|direction/i);
 const partial=separate.trace([pt(0,0),pt(90,0)],{tolerance:90});
 assert.equal(separate.finish(partial,separate.snap(pt(90,25),12),60).complete,false);
});
