import test from 'node:test';
import assert from 'node:assert/strict';
import { STATION_THREE_BAY, stationThreeDoorObstructed, stationThreeDoorSweep } from '../city-explorer/station-three-bay.mjs';

const truck=(x,z,heading=0)=>({x,z,heading});
const player=(x,z)=>({x,z});

test('exports the GLB-derived Station 3 bay interior bounds',()=>{
 assert.deepEqual(STATION_THREE_BAY,{minX:-3.4,maxX:14.1,minZ:-14,maxZ:0,ceiling:5.8});
 assert.equal(Object.isFrozen(STATION_THREE_BAY),true);
});

test('door obstruction uses the Door 01 threshold and oriented truck or player footprint',()=>{
 assert.equal(stationThreeDoorObstructed(truck(-.7,0)),true);
 assert.equal(stationThreeDoorObstructed(truck(-.7,0,Math.PI/2)),true,'rotated truck still overlaps the aperture');
 assert.equal(stationThreeDoorObstructed(player(-.7,.5),{player:true}),true);
 assert.equal(stationThreeDoorObstructed(player(2.1,0),{player:true}),false,'player outside the door aperture does not obstruct');
 assert.equal(stationThreeDoorObstructed(truck(-.7,-5.6)),false,'spawned truck clears the threshold');
 assert.equal(stationThreeDoorObstructed(truck(5,0)),false,'another bay does not obstruct Door 01');
});

test('Door 01 crossing requires a fully open door and permits clear reverse departure',()=>{
 const inside=truck(-.7,-5.6),outside=truck(-.7,7);
 assert.equal(stationThreeDoorSweep(inside,outside,{fraction:0}),true);
 assert.equal(stationThreeDoorSweep(outside,inside,{fraction:0}),true);
 assert.equal(stationThreeDoorSweep(inside,outside,{fraction:.97}),true);
 assert.equal(stationThreeDoorSweep(inside,outside,{fraction:.98}),false);
 assert.equal(stationThreeDoorSweep(truck(-.7,-.5),truck(-.7,-3),{fraction:0}),false,'backing away from the closed door is allowed');
});

test('swept collision catches long truck and pedestrian crossings without freezing outside travel',()=>{
 assert.equal(stationThreeDoorSweep(truck(-.7,-20),truck(-.7,20)),true,'long motion cannot tunnel through Door 01');
 assert.equal(stationThreeDoorSweep(player(-.7,-2),player(-.7,2),{player:true}),true);
 assert.equal(stationThreeDoorSweep(player(-.7,-2),player(-.7,2),{fraction:1,player:true}),false);
 assert.equal(stationThreeDoorSweep(truck(-30,10),truck(30,10)),false,'parallel travel outside the facade stays free');
 assert.equal(stationThreeDoorSweep(truck(-.7,-10,0),truck(-.7,10,Math.PI/4),{fraction:1}),true,'rotated swept truck cannot clip through the aperture');
});

test('other Station 3 bay openings remain solid even when Door 01 is open',()=>{
 assert.equal(stationThreeDoorSweep(truck(5,-5),truck(5,5),{fraction:1}),true);
 assert.equal(stationThreeDoorSweep(truck(10,-5),truck(10,5),{fraction:1}),true);
 assert.equal(stationThreeDoorSweep(truck(-10,-5),truck(-10,5),{fraction:1}),false,'route outside the left facade edge remains clear');
});

test('QIII heading sweep retains intermediate projected width extrema at the facade edge',()=>{
 const x=19.426;
 assert.equal(stationThreeDoorSweep(truck(x,-10,4.35),truck(x,10,4.6),{fraction:1}),true,
  'a rotating truck cannot tunnel past the right front facade between endpoint headings');
});

test('rotation from a clear bay pose into the closed facade is blocked without center translation',()=>{
 assert.equal(stationThreeDoorSweep(truck(-.7,-5.36,0),truck(-.7,-5.36,Math.PI/2),{fraction:0}),true,
  'the swept oriented box enters the front wall while turning');
});

test('lateral movement into the facade is blocked while outward escape and outside travel remain clear',()=>{
 assert.equal(stationThreeDoorSweep(player(-5,0),player(5,0),{player:true}),true,
  'pedestrian cannot move sideways from outside into the front wall');
 assert.equal(stationThreeDoorSweep(player(-5,.3),player(5,.3),{player:true}),true,
  'pedestrian footprint reaching the facade is blocked even when its center is outside the slab');
 assert.equal(stationThreeDoorSweep(truck(-10,0),truck(10,0)),true,
  'truck cannot sweep laterally through the front wall');
 assert.equal(stationThreeDoorSweep(truck(-10,1),truck(10,1)),true,
  'truck footprint reaching the facade is blocked even when its center is outside the slab');
 assert.equal(stationThreeDoorSweep(player(-.7,0),player(-5,0),{player:true}),false,
  'pedestrian can escape laterally out of an existing facade overlap');
 assert.equal(stationThreeDoorSweep(player(-2.4,0),player(1.1,0),{fraction:1,player:true}),false,
  'lateral movement through Door 01 remains clear when fully open');
 assert.equal(stationThreeDoorSweep(truck(-30,10),truck(30,10)),false,
  'parallel movement outside the facade remains clear');
});
