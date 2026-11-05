import {test} from 'node:test';
import assert from 'node:assert/strict';
import {vehicleFootprint,polygonsOverlap,sweepVehicle,segmentBoxHit} from '../city-explorer/apparatus-collision.mjs';
test('oriented parked bodies collide along swept travel, including long steps',()=>{
 const size={length:10,width:2.5};const parked=vehicleFootprint({x:0,z:0,heading:Math.PI/2},size);
 assert.ok(polygonsOverlap(parked,vehicleFootprint({x:3,z:0,heading:0},size)));
 assert.ok(sweepVehicle({x:0,z:-20,heading:0},{x:0,z:20,heading:0},size,p=>polygonsOverlap(vehicleFootprint(p,size),parked)));
 assert.equal(polygonsOverlap(parked,vehicleFootprint({x:30,z:20,heading:.2},size)),false);
});
test('segment query clips at first 3D obstacle and supports radius',()=>{
 const b={min:{x:-1,y:2,z:-5},max:{x:1,y:5,z:-3}};
 assert.ok(Math.abs(segmentBoxHit({x:0,y:3,z:0},{x:0,y:3,z:-10},b)-.3)<1e-8);
 assert.equal(segmentBoxHit({x:3,y:3,z:0},{x:3,y:3,z:-10},b),null);
 assert.ok(segmentBoxHit({x:1.2,y:3,z:0},{x:1.2,y:3,z:-10},b,.3)!==null);
});

test('wall contact preserves the last clear heading and permits straight retreat',async()=>{
  const {resolveVehicleContact}=await import('../city-explorer/apparatus-collision.mjs');
  const previous={x:0,z:0,heading:0};
  const collision=pose=>pose.z<0||pose.heading!==0;
  const hit=resolveVehicleContact(previous,{x:0,z:-.04,heading:.02,speed:1,acceleration:1},collision);
  assert.equal(hit.heading,0);assert.equal(hit.z,0);assert.equal(hit.speed,0);
  const reverse=resolveVehicleContact(hit,{x:0,z:.04,heading:-.02,speed:-1,acceleration:-1},collision);
  assert.equal(reverse.heading,0);assert.equal(reverse.z,.04);assert.equal(reverse.speed,-1);
});

test('deployed aerial can use a rear exit outside its full stabilizer footprint',async()=>{
  const {vehicleExitCandidates,vehicleFootprint,polygonsOverlap}=await import('../city-explorer/apparatus-collision.mjs');
  const pose={x:10,z:20,heading:Math.PI/2},size={width:2.55,length:12.97};
  const body=vehicleFootprint(pose,{...size,width:size.width+3.2});
  const exits=vehicleExitCandidates(pose,size,{x:17.1,z:20});
  const clear=point=>!polygonsOverlap(body,vehicleFootprint(point,{width:.7,length:.7}));
  assert.deepEqual(exits.find(clear),{x:17.1,z:20});
  assert.ok(!clear(exits[1])&&!clear(exits[2]));
  assert.ok(vehicleExitCandidates(pose,size).some(clear));
});
