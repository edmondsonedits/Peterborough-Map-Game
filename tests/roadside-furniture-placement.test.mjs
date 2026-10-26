import assert from 'node:assert/strict';
import test from 'node:test';
import {RoadSurfaceIndex} from '../city-explorer/road-network.js';
import {createRoadsidePlacementResolver,sampleRoadsideRibbon} from '../city-explorer/roadside-furniture-placement.js';
const line=(id,a,b,width=8)=>({a,b,width,aY:0,bY:0,lineId:id,name:id,tags:{highway:'residential'}});
function fixture(roads,extra={}) {const roadIndex=new RoadSurfaceIndex();roadIndex.addAll(roads);const surfaceAt=(x,z)=>roadIndex.sample(x,z,0)?.onRoad?{height:0}:null;return {surfaceAt,...createRoadsidePlacementResolver({roadIndex,surfaceAt,groundAt:()=>0,...extra})};}
const east=line('east',{x:-100,y:0},{x:100,y:0});
test('moves source-centre poles outside the entire crossing, arm and head over the road',()=>{
  const north=line('north',{x:0,y:-100},{x:0,y:100}),f=fixture([east,north]);
  for (let i=0;i<4;i++){const p=f.place({x:0,z:0,sourceId:'signal/'+i},'signal');assert.ok(p);assert.ok(!f.surfaceAt(p.x,p.z));assert.ok(Math.abs(p.x)>4.7&&Math.abs(p.z)>4.7);assert.ok(p.headOnRoad);assert.ok(p.moved<16);assert.ok(p.baseY+p.poleHeight-1.705>=5.3);}
});
test('preserves already safe lamp location and original source data',()=>{
  const p={x:10,z:6,sourceId:'lamp/1'},copy=structuredClone(p),f=fixture([east]);const placed=f.place(p);assert.equal(placed.x,p.x);assert.equal(placed.z,p.z);assert.equal(placed.moved,0);assert.ok(placed.armDirection.z<0);assert.deepEqual(p,copy);
});
test('respects surveyed pavement wider than a centreline ribbon and buildings on one side',()=>{
  const f=fixture([east],{surfaceAt:(x,z)=>Math.abs(z)<9?{height:1}:null,blockedAt:(x,z)=>z>0});
  const p=f.place({x:0,z:0,sourceId:'wide'},'signal');assert.ok(p.z<-9.7);assert.ok(p.headOnRoad);assert.ok(p.baseY+p.poleHeight-1.705>=6.3);
});
test('deterministic placement, road direction tags, and a conservative isolated-area lamp',()=>{
  const a=fixture([east]),b=fixture([east]);const src={x:2,z:0,sourceId:'deterministic',tags:{'traffic_signals:direction':'backward'}};
  assert.deepEqual(a.place(src,'signal'),b.place(src,'signal'));const p=fixture([east]).place(src,'signal');assert.equal(p.facingDirection.x,1);
  const isolated=fixture([]).place({x:100,z:100,sourceId:'park'});assert.equal(isolated.placement,'area-light');assert.equal(isolated.x,100);
});

test('a roadside lamp moves closer when its existing anchor cannot reach pavement with a short arm',()=>{
  const f=fixture([east]),p=f.place({x:10,z:12,sourceId:'set-back-lamp'});
  assert.ok(p.moved>0);assert.ok(p.headOnRoad);assert.ok(p.armLength<=5.5);assert.ok(!f.surfaceAt(p.x,p.z));
});
test('a lamp beside a public street faces that street instead of a parking aisle behind it',()=>{
  const aisle={...line('aisle',{x:-100,y:0},{x:100,y:0},3),tags:{highway:'service'}},street=line('Main Street',{x:-100,y:10},{x:100,y:10},12);
  const f=fixture([aisle,street]),p=f.place({x:10,z:2,sourceId:'curb-lamp'});
  assert.equal(p.roadName,'Main Street');assert.ok(p.armDirection.z>0);assert.ok(p.headOnRoad);
});

test('fast placement membership agrees with the road index across cells and endpoints',()=>{
  const index=new RoadSurfaceIndex(10);index.addAll([east,line('diagonal',{x:-14,y:-27},{x:37,y:48},6)]);
  for(let x=-30;x<50;x+=1.1)for(let z=-30;z<50;z+=1.1)assert.equal(Boolean(sampleRoadsideRibbon(index,x,z,0)),Boolean(index.sample(x,z,0)?.onRoad));
});
