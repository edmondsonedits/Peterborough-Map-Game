import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createVehicleFleet,FLEET_DEFINITIONS} from '../city-explorer/vehicle-fleet.mjs';
import {stepFireTruckKinematics} from '../city-explorer/gameplay-systems.js';

test('six independent vehicles retain exact poses across selections and fresh fleets reset',()=>{
  const spawns=Object.fromEntries(FLEET_DEFINITIONS.map((v,i)=>[v.id,{x:i*30,z:4,y:2,heading:.5}]));
  const fleet=createVehicleFleet(spawns);
  fleet.select('pump-1');Object.assign(fleet.active.state,{x:180,z:-240,heading:1.3});
  for(const id of ['pump-2','pump-3','aerial','medi','rescue-1','pump-1'])fleet.select(id);
  assert.equal(fleet.active.state.x,180);assert.equal(fleet.active.state.z,-240);
  assert.equal(fleet.active.state.heading,1.3);assert.equal(fleet.vehicles.length,6);
  assert.equal(createVehicleFleet(spawns).active.state.x,0);
  assert.throws(()=>fleet.select('bogus'),/Unknown vehicle/);
});
test('medi tuning is faster and accelerates harder; pumper defaults unchanged',()=>{
  const by=id=>FLEET_DEFINITIONS.find(v=>v.id===id).tuning;
  assert.equal(by('pump-1').maximumForwardSpeed,27.5);
  assert.ok(by('medi').maximumForwardSpeed>by('pump-1').maximumForwardSpeed);
  assert.ok(by('medi').forwardAcceleration>by('pump-1').forwardAcceleration);
  assert.ok(by('aerial').length>=12.8);
  const radius=tuning=>tuning.wheelbase/Math.tan(tuning.steeringLowSpeed);
  assert.ok(radius(by('aerial'))>1.4*radius(by('pump-1')));
});
test('the real driving integrator gives medi higher acceleration and road speed',()=>{
  const drive=id=>{const tuning=FLEET_DEFINITIONS.find(v=>v.id===id).tuning;let s={x:0,z:0,heading:0,speed:0};for(let i=0;i<1500;i++)s=stepFireTruckKinematics(s,{throttle:1,steering:0},.02,true,tuning);return s;};
  const pump=drive('pump-1'),medi=drive('medi'),aerial=drive('aerial');
  assert.equal(medi.speed*3.6,200);assert.ok(Math.abs(medi.z)>Math.abs(pump.z));assert.ok(aerial.speed<pump.speed);
});
