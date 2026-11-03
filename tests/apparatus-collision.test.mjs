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
