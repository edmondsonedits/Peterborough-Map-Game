import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSherbrookePlan,landscapeClear,segmentDistance,recordSherbrookeBuilding,sherbrookeBuildings} from '../city-explorer/sherbrooke-plan.js';
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(lat-44.3091)*110540});
const full=makeSherbrookePlan(project),lite=makeSherbrookePlan(project,{lowPower:true});
test('corridor generation is deterministic with unique IDs and finite bounded placements',()=>{
 assert.deepEqual(full,makeSherbrookePlan(project));assert.ok(full.features.length>300&&full.features.length<1500);
 assert.equal(new Set(full.features.map(f=>f.id)).size,full.features.length);
 for(const f of full.features){assert.ok([f.x,f.z,f.yaw,f.size].every(Number.isFinite));assert.ok(f.size>0);}
});
test('solid street furniture clears every road carriageway',()=>{
 for(const f of full.features.filter(f=>f.kind!=='joint'))for(const road of full.roads)assert.ok(segmentDistance(f,road.a,road.b)>road.width/2+.5,`${f.id} intrudes into ${road.id}`);
});
test('lite reduces decoration density without changing retained feature transforms',()=>{
 assert.deepEqual(lite.features.filter(f=>f.kind==='pole'),full.features.filter(f=>f.kind==='pole'));
 assert.ok(lite.features.length<full.features.length);const indexed=new Map(full.features.map(f=>[f.id,f]));
 for(const f of lite.features)if(indexed.has(f.id))assert.deepEqual(f,indexed.get(f.id));
});
test('wire runs have bounded spans and surveyed station mass is recorded without alteration',()=>{
 for(const w of full.wires){const d=Math.hypot(w.a.x-w.b.x,w.a.z-w.b.z);assert.ok(d>0&&d<65);}
 const ring=[{x:1,y:2},{x:3,y:4},{x:4,y:2}];const saved=JSON.stringify(ring);recordSherbrookeBuilding('way/1009651229',ring,170,176);assert.equal(JSON.stringify(ring),saved);assert.equal(sherbrookeBuildings.get('way/1009651229').top,176);
});

test('landscape details reject building interiors and road edges',()=>{
 const plan={roads:[{a:{x:0,z:0},b:{x:20,z:0},width:6}],rings:[[{x:5,z:10},{x:15,z:10},{x:15,z:20},{x:5,z:20}]]};
 assert.equal(landscapeClear({x:10,z:15},.5,plan),false);
 assert.equal(landscapeClear({x:10,z:3.2},.5,plan),false);
 assert.equal(landscapeClear({x:10,z:7},.5,plan),true);
});
