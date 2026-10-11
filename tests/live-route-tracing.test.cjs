'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTraceCore } = require('../route-mapping/trace-core.js');

function fixture(lines) {
  const nodes = [], segments = [], keys = new Map();
  function node(x,y,level='0') {
    const key = `${x},${y},${level}`;
    if (!keys.has(key)) { keys.set(key,nodes.length); nodes.push({id:nodes.length,x,y,lat:y,lng:x,edges:[]}); }
    return keys.get(key);
  }
  lines.forEach(([coords, opts={}], line) => {
    const ids = coords.map(([x,y])=>node(x,y,opts.level));
    for(let i=1;i<ids.length;i++) {
      const from=ids[i-1],to=ids[i],a=nodes[from],b=nodes[to],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),id=segments.length;
      const s={id,from,to,ax:a.x,ay:a.y,bx:b.x,by:b.y,dx,dy,length,lengthSq:length*length,forward:opts.forward!==false,backward:opts.backward!==false,name:opts.name||`Street ${line}`,highway:'residential'};
      segments.push(s);
      for(const reverse of [false,true]) {
        if(!(reverse?s.backward:s.forward))continue;
        const e={from:reverse?to:from,to:reverse?from:to,segmentId:id,reverse,distance:length,duration:length/10,name:s.name};
        nodes[e.from].edges.push(e);
      }
    }
  });
  const core=createTraceCore({graph:{nodes,segments},toXY:(lat,lng)=>({x:lng,y:lat}),toLatLng:(x,y)=>({lat:y,lng:x})});
  return {core,nodes,segments};
}
const point=(x,y=0)=>({lat:y,lng:x});
function editor(core,start=point(0),tolerance=6) {
  assert.equal(typeof core.begin,'function','live tracing must expose begin');
  assert.equal(typeof core.advance,'function','live tracing must expose advance');
  let route=core.begin(core.snap(start,tolerance)),previousPoint=start;
  return {get route(){return route;}, move(x,y=0){const p=point(x,y),result=core.advance(route,p,{tolerance,directionBias:.35,previousPoint});previousPoint=p;route=result.route;return result;}};
}
function near(actual,expected,message='distance'){assert.ok(Math.abs(actual-expected)<.6,`${message}: ${actual} vs ${expected}`);}
const straight=()=>fixture([[[[0,0],[100,0],[200,0]]]]);

test('legacy tracer regression: preserves intentional loop geometry',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100],[0,100],[0,0]]]]);
  const route=core.trace([point(0),point(100),point(100,100),point(0,100),point(0)],{tolerance:6});
  near(route.distance,400);
});
test('legacy reference routing respects one-way direction',()=>{
  const {core}=fixture([[[[0,0],[100,0]],{backward:false}]]);
  assert.equal(core.between(core.snap(point(80)),core.snap(point(20))),null);
});
test('live line snaps before release, never to the pointer offset',()=>{
  const {core}=straight(),e=editor(core);e.move(80,4);near(e.route.distance,80);
  assert.ok(e.route.coordinates.every(([lat])=>lat===0));near(e.route.endpoint.lng,80);
});
test('reverse erases a partial edge and keeps prior snapshots immutable',()=>{
  const {core}=straight(),e=editor(core);e.move(80);const before=e.route,serialized=JSON.stringify(before);
  e.move(30);near(e.route.distance,30);near(e.route.endpoint.lng,30);assert.equal(JSON.stringify(before),serialized);
});
test('reverse crosses several graph edges and erases only the tail',()=>{
  const {core}=fixture([[[[0,0],[20,0],[40,0],[60,0],[80,0],[100,0]]]]),e=editor(core);
  e.move(95);e.move(15);near(e.route.distance,15);assert.equal(e.route.edges.length,1);
});
test('reverse around a junction then choose another street',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100]]],[[[100,0],[200,0]]]]),e=editor(core);
  e.move(100);e.move(100,70);near(e.route.distance,170);e.move(100,0);e.move(70,0);near(e.route.distance,70);
  e.move(100);e.move(160);near(e.route.distance,160);assert.ok(e.route.coordinates.every(([lat])=>lat===0));
});
test('editing backwards erases a one-way street rather than driving wrong-way',()=>{
  const {core}=fixture([[[[0,0],[100,0]],{backward:false}]]),e=editor(core);
  e.move(80);e.move(25);near(e.route.distance,25);assert.ok(e.route.edges.every(edge=>!edge.reverse));
});
test('a fresh wrong-way stroke does not become a valid route',()=>{
  const {core}=fixture([[[[0,0],[100,0]],{backward:false}]]),e=editor(core,point(50));
  const result=e.move(20);assert.equal(result.blocked,true);near(e.route.distance,0);
});
test('reverse-only metadata remains correct after partial erasure',()=>{
  const {core}=fixture([[[[0,0],[100,0]],{forward:false}]]),e=editor(core,point(100));
  e.move(20);e.move(65);near(e.route.distance,35);assert.equal(e.route.edges[0].reverse,true);
});
test('erasing to START stops there and can grow forward again',()=>{
  const {core}=straight(),e=editor(core);e.move(90);e.move(0);near(e.route.distance,0);assert.equal(e.route.edges.length,0);
  e.move(30);near(e.route.distance,30);
});
test('parallel disconnected streets cannot steal the route',()=>{
  const {core}=fixture([[[[0,0],[200,0]]],[[[0,30],[200,30]]]]),e=editor(core);
  e.move(80);e.move(80,30);assert.ok(e.route.coordinates.every(([lat])=>lat===0));near(e.route.distance,80);
});
test('crossing an earlier part of a loop does not erase the loop',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100],[0,100],[0,0]]]]),e=editor(core);
  e.move(100);e.move(100,100);e.move(0,100);e.move(0);near(e.route.distance,400);
});
test('grade-separated crossing is not an intersection',()=>{
  const {core}=fixture([[[[-100,0],[0,0],[100,0]],{level:'0'}],[[[0,-100],[0,0],[0,100]],{level:'1'}]]),e=editor(core,point(-100));
  e.move(0);const result=e.move(0,60);assert.equal(result.blocked,true);assert.ok(e.route.coordinates.every(([lat])=>lat===0));
});
test('off-street pointer preserves valid work and can return to END',()=>{
  const {core}=straight(),e=editor(core);e.move(70);const result=e.move(70,100);assert.equal(result.blocked,true);near(e.route.distance,70);
  e.move(70);e.move(110);near(e.route.distance,110);
});
test('diagonal movement cannot invent a shortcut across a block',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100]]]]),e=editor(core);
  const result=e.move(100,100);assert.equal(result.blocked,true);assert.ok(e.route.distance<25);
});
test('a distant re-entry after leaving the road cannot teleport the endpoint',()=>{
  const {core}=fixture([[[[0,0],[1000,0]]]]),e=editor(core);e.move(50);e.move(50,100);e.move(900,100);e.move(900,0);
  assert.ok(e.route.distance<80,'route should freeze near last valid endpoint');
});
test('pause/resume uses the exact fractional endpoint',()=>{
  const {core}=straight(),e=editor(core);e.move(53.25);const paused=e.route;
  const result=core.advance(paused,point(105),{tolerance:6,previousPoint:paused.endpoint});near(result.route.distance,105);
  near(paused.distance,53.25);
});
test('finish requires legal road access, not proximity across a barrier',()=>{
  const {core}=fixture([[[[0,0],[200,0]]],[[[0,20],[200,20]]]]),e=editor(core);e.move(80);
  assert.equal(core.finish(e.route,core.snap(point(80,20),3),40).complete,false);
});
test('destination completion preserves the route already chosen',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100],[0,100]]],[[[0,0],[0,100]]]]),e=editor(core);
  e.move(100);e.move(100,100);e.move(20,100);const done=core.finish(e.route,core.snap(point(0,100),3),25);
  assert.equal(done.complete,true);near(done.distance,300);
});
test('a click without movement does not create distance',()=>{
  const {core}=straight(),e=editor(core);e.move(0);near(e.route.distance,0);
});
