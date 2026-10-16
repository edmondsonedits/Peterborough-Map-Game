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


const junction=(oneway=false)=>fixture([
  [[[-100,0],[0,0],[100,0]],{backward:!oneway,name:'Main'}],
  [[[0,0],[0,100]],{name:'Branch'}]
]);
function consistent(core,r){
  near(r.distance,r.edges.reduce((sum,e)=>sum+e.distance,0),'edge distance');
  let length=0;for(let i=1;i<r.coordinates.length;i++)length+=core.distance({lat:r.coordinates[i-1][0],lng:r.coordinates[i-1][1]},{lat:r.coordinates[i][0],lng:r.coordinates[i][1]});
  near(r.distance,length,'drawn geometry distance');
  near(r.duration,r.edges.reduce((sum,e)=>sum+e.duration,0),'duration');
  for(let i=1;i<r.edges.length;i++){
    const a=r.edges[i-1],b=r.edges[i];
    assert.ok(!(a.segmentId===b.segmentId&&a.reverse!==b.reverse),'no immediate doubled-back tail');
    near(core.distance(a.end,b.start),0,'continuous edge sequence');
  }
}

// Metres relative to the shared Toronto ramp junction (OSM-derived geometry).
// These pointer samples reproduce the native zoom18 +/-2px drift, <1 m.
const rampDrift=[[43.494,23.462],[40.471,21.748],[36.584,20.034],[33.129,18.748],[29.674,17.463],[26.219,15.749],[22.764,13.607],[19.74,11.036],[16.717,8.893],[13.694,6.751],[10.239,5.037],[6.784,3.323],[3.328,2.038],[-.559,.752],[-4.014,-1.39],[-7.037,-3.533],[-10.492,-5.675],[-13.515,-8.246],[-16.97,-10.388],[-20.425,-12.102]];
function shallowFork({wrongWay=false,long=false,wide=false,loop=false}={}){
  return fixture([
    [[[56.478,31.670],[0,0]],{backward:false,name:'Incoming'}],
    [[[0,0],[-21.746,-8.257],long?[-100,-37.97]:[-43.226,-15.177]],{backward:false,name:'Other arm'}],
    [[[0,0],wide?[0,-40]:[-31.262,-17.377],wide?[0,-100]:long?[-120,-66.7]:[-65,-36]],{forward:!wrongWay,backward:wrongWay,name:'Intended arm'}],
    ...(loop?[[[[56.478,31.670],[76.478,31.670],[76.478,51.670],[56.478,51.670],[56.478,31.670]],{backward:false,name:'Earlier loop'}]]:[]),
  ]);
}
test('sub-metre drift can settle a shallow one-way fork without trapping the open end',()=>{
  const{core}=shallowFork(),e=editor(core,point(...rampDrift[0]),12);
  for(const p of rampDrift.slice(1))e.move(...p);
  const target=core.snap(point(...rampDrift.at(-1)),1);
  near(core.distance(e.route.endpoint,target),0,'reached intended arm');
  assert.equal(e.route.endpoint.road,'Intended arm');assert.ok(e.route.edges.every(edge=>edge.name!=='Other arm'&&!edge.reverse));consistent(core,e.route);
});
test('shallow fork settling survives pause/re-grab without changing the Undo snapshot',()=>{
  const{core}=shallowFork(),e=editor(core,point(...rampDrift[0]),12);
  for(const p of rampDrift.slice(1,17))e.move(...p);
  const snapshot=e.route,serialized=JSON.stringify(snapshot);let route=snapshot,previous=snapshot.endpoint;
  for(const p of rampDrift.slice(17)){const current=point(...p);route=core.advance(route,current,{tolerance:12,previousPoint:previous}).route;previous=current;}
  assert.equal(route.endpoint.road,'Intended arm');assert.equal(JSON.stringify(snapshot),serialized);consistent(core,route);
});
test('shallow fork settling cannot enter a wrong-way outgoing arm',()=>{
  const{core}=shallowFork({wrongWay:true}),e=editor(core,point(...rampDrift[0]),12);
  for(const p of rampDrift.slice(1))e.move(...p);
  assert.ok(e.route.edges.every(edge=>edge.name!=='Intended arm'&&!edge.reverse));consistent(core,e.route);
});
test('a wider deliberate turn does not gain the shallow-fork settling budget',()=>{
  const{core}=shallowFork({wide:true}),e=editor(core,point(40,22.4),12);e.move(0,0);e.move(-18,-6.8);
  const before=e.route.distance,result=core.advance(e.route,point(0,-20),{tolerance:12,previousPoint:point(0,-18)});assert.ok(result.route.edges.every(edge=>edge.name!=='Intended arm'));near(result.route.distance,before);consistent(core,result.route);
});
test('a committed longer fork choice is retained instead of erased by nearby pointer travel',()=>{
  const{core}=shallowFork({long:true}),e=editor(core,point(40,22.4),12);e.move(0,0);e.move(-65.4,-24.8);
  const before=e.route.distance;e.move(-61.18,-34.02);assert.ok(e.route.edges.every(edge=>edge.name!=='Intended arm'));near(e.route.distance,before);consistent(core,e.route);
});
test('settling the open fork retains a deliberately completed earlier loop',()=>{
  const{core}=shallowFork({loop:true}),start=point(56.478,31.670),prefix=core.trace([start,point(76.478,31.670),point(76.478,51.670),point(56.478,51.670),start],{tolerance:1});
  const serialized=JSON.stringify(prefix);let route=prefix,previous=start;
  for(const p of rampDrift){const target=point(...p);route=core.advance(route,target,{tolerance:12,previousPoint:previous}).route;previous=target;}
  const direct=core.between(core.snap(start,1),core.snap(point(...rampDrift.at(-1)),1));
  assert.equal(route.endpoint.road,'Intended arm');assert.equal(route.edges.filter(e=>e.name==='Earlier loop').length,4);near(route.distance,80+direct.distance);assert.equal(JSON.stringify(prefix),serialized);consistent(core,route);
});
for(const level of ['0','1'])test(`nearby disconnected parallel geometry stays separate at level ${level}`,()=>{
  const{core}=fixture([[[[0,0],[100,0]],{backward:false,name:'Current'}],[[[0,2],[100,2]],{level,backward:false,name:'Separate'}]]),e=editor(core,point(0),12);
  e.move(20);e.move(25,2);assert.ok(e.route.edges.every(edge=>edge.name==='Current'));
  assert.equal(core.finish(e.route,core.snap(point(30,2),.5),12).complete,false);consistent(core,e.route);
});

test('turning after a junction overshoot removes the outgoing and return spur',()=>{
  const {core}=junction(),e=editor(core,point(-80),30);
  e.move(12);const snapshot=e.route,serialized=JSON.stringify(snapshot);
  e.move(0,25);e.move(0,60);
  near(e.route.distance,140);near(e.route.endpoint.lng,0);near(e.route.endpoint.lat,60);
  assert.ok(e.route.coordinates.every(([,lng])=>lng<=0),'no eastern spur remains');
  assert.equal(JSON.stringify(snapshot),serialized,'Undo snapshot must remain untouched');
  consistent(core,e.route);
});
test('pause then branch resume removes the overshoot from the earlier stroke',()=>{
  const {core}=junction(),e=editor(core,point(-80),30);e.move(12);
  let resumed=core.advance(e.route,point(0,25),{tolerance:30,previousPoint:e.route.endpoint}).route;
  resumed=core.advance(resumed,point(0,60),{tolerance:30,previousPoint:point(0,25)}).route;
  near(resumed.distance,140);consistent(core,resumed);
});
test('arrival connector cancels the overlapped tail instead of scoring it twice',()=>{
  const {core}=junction(),e=editor(core,point(-80),30);e.move(12);
  const done=core.finish(e.route,core.snap(point(0,20),2),40);
  assert.equal(done.complete,true);near(done.distance,100);consistent(core,done);
});
test('one-way overshoot is editable before taking a legally connected branch',()=>{
  const {core}=junction(true),e=editor(core,point(-80),30);e.move(12);e.move(0,25);e.move(0,60);
  near(e.route.endpoint.lng,0);near(e.route.endpoint.lat,60);near(e.route.distance,140);
  assert.ok(e.route.edges.every(edge=>!edge.reverse));consistent(core,e.route);
});
test('one-way arrival can erase a local overshoot without creating wrong-way travel',()=>{
  const {core}=junction(true),e=editor(core,point(-80),30);e.move(12);
  const done=core.finish(e.route,core.snap(point(0,20),2),40);
  assert.equal(done.complete,true);near(done.distance,100);assert.ok(done.edges.every(edge=>!edge.reverse));
});
test('junction correction spans multiple short graph segments',()=>{
  const {core}=fixture([[[[-80,0],[0,0],[4,0],[8,0],[12,0],[100,0]]],[[[0,0],[0,100]]]]);
  const e=editor(core,point(-80),30);e.move(12);
  const done=core.finish(e.route,core.snap(point(0,20),2),40);
  assert.equal(done.complete,true);near(done.distance,100);consistent(core,done);
});
test('arrival backtracks to a fractional point on the last road',()=>{
  const {core}=fixture([[[[0,0],[100,0]]]]),e=editor(core);e.move(80);
  const done=core.finish(e.route,core.snap(point(65),1),25);
  assert.equal(done.complete,true);near(done.distance,65);near(done.endpoint.lng,65);consistent(core,done);
});
test('no geometric snap between different overpass levels at a junction',()=>{
  const {core}=fixture([[[[-80,0],[0,0],[80,0]],{level:'0'}],[[[0,0],[0,100]],{level:'1'}]]),e=editor(core,point(-80),30);
  e.move(12);const done=core.finish(e.route,core.snap(point(0,20),1),40);
  assert.equal(done.complete,false);near(done.distance,92);
});
test('a real route loop stays in the score after a small final overshoot is erased',()=>{
  const {core}=fixture([[[[0,0],[100,0],[100,100],[0,100],[0,0]]],[[[100,100],[120,100]]]]);
  const e=editor(core,point(0),12);e.move(100);e.move(100,100);e.move(0,100);e.move(0);e.move(100);e.move(100,100);e.move(110,100);
  const done=core.finish(e.route,core.snap(point(90,100),1),25);
  assert.equal(done.complete,true);near(done.distance,610);consistent(core,done);
});

for(const tolerance of [12,30,60,90]){
  test(`small junction drift stays on the current road at ${tolerance} m snap tolerance`,()=>{
    const {core}=junction(),e=editor(core,point(-80),tolerance);
    e.move(0);e.move(0,tolerance*.12);
    near(e.route.distance,80);near(e.route.endpoint.lat,0);
    e.move(0,tolerance*.7);
    near(e.route.endpoint.lat,tolerance*.7);consistent(core,e.route);
  });
}
test('hysteresis does not delay straight continuation through a graph vertex',()=>{
  const {core}=junction(),e=editor(core,point(-80),30);e.move(0);e.move(3);
  near(e.route.endpoint.lng,3);near(e.route.distance,83);
});
test('a deliberate nearby parallel-road turn can escape the junction deadband',()=>{
  const {core}=fixture([[[[-80,0],[0,0],[80,0]]],[[[0,0],[0,4]]],[[[0,4],[80,4]]]]),e=editor(core,point(-80),30);
  e.move(0);e.move(0,4);e.move(20,4);e.move(60,4);
  near(e.route.endpoint.lat,4);near(e.route.endpoint.lng,60);near(e.route.distance,144);
  consistent(core,e.route);
});

test('release at a call inside the junction deadband finishes at its exact road access',()=>{
  const {core}=junction(),e=editor(core,point(-80),30);
  e.move(0);e.move(0,3);near(e.route.endpoint.lat,0);
  const done=core.finish(e.route,core.snap(point(0,3),.5),40);
  assert.equal(done.complete,true);near(done.distance,83);near(done.endpoint.lat,3);consistent(core,done);
});
