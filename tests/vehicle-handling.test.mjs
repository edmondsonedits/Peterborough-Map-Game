import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stepFireTruckKinematics} from '../city-explorer/gameplay-systems.js';
import {FLEET_DEFINITIONS} from '../city-explorer/vehicle-fleet.mjs';

const byId=id=>FLEET_DEFINITIONS.find(vehicle=>vehicle.id===id).tuning;

test('fleet handling shares pumper dynamics and separates apparatus classes while retaining road speeds',()=>{
 const pump1=byId('pump-1'),pump2=byId('pump-2'),pump3=byId('pump-3'),aerial=byId('aerial'),medi=byId('medi');
 for(const key of ['forwardAcceleration','maximumLateralAcceleration','offRoadSpeed','offRoadAccelerationScale','offRoadGripScale']){
  assert.equal(pump1[key],pump2[key],`pumpers share ${key}`);
  assert.equal(pump1[key],pump3[key],`pumpers share ${key}`);
 }
 assert.notEqual(pump1.forwardAcceleration,aerial.forwardAcceleration);
 assert.notEqual(aerial.forwardAcceleration,medi.forwardAcceleration);
 assert.notEqual(pump1.offRoadSpeed,aerial.offRoadSpeed);
 assert.notEqual(aerial.offRoadSpeed,medi.offRoadSpeed);
 assert.notEqual(pump1.maximumLateralAcceleration,aerial.maximumLateralAcceleration);
 assert.notEqual(aerial.maximumLateralAcceleration,medi.maximumLateralAcceleration);
 assert.deepEqual([pump1,aerial,medi].map(v=>v.maximumForwardSpeed),[27.5,85/3.6,200/3.6]);
});

test('analog throttle produces proportional power and opposite input brakes through zero into reverse',()=>{
 const pump=byId('pump-1');
 const gentle=stepFireTruckKinematics({x:0,z:0,heading:0,speed:0},{throttle:.1,steering:0},.05,true,pump);
 const hard=stepFireTruckKinematics({x:0,z:0,heading:0,speed:0},{throttle:1,steering:0},.05,true,pump);
 assert.ok(gentle.speed>0&&gentle.speed<hard.speed*.1);
 let state={x:0,z:0,heading:0,speed:1,steering:0};
 for(let i=0;i<80;i++) state=stepFireTruckKinematics(state,{throttle:-.2,steering:0},.05,true,pump);
 assert.ok(state.speed<0,'held reverse eventually moves backward without a zero-speed deadlock');
});

test('legacy state and input shapes remain safe, including a zero-duration frame',()=>{
 const legacy=stepFireTruckKinematics({x:1,z:2,heading:0,speed:0},{forward:1,steering:0},1/60);
 const stopped=stepFireTruckKinematics(legacy,{},0,false);
 assert.ok([stopped.x,stopped.z,stopped.heading,stopped.speed,stopped.steering].every(Number.isFinite));
 assert.equal(stopped.speed,legacy.speed);
 assert.equal(stopped.steering,legacy.steering);
});

test('off-road speed loss is gradual and reverse remains available for recovery',()=>{
 const pump=byId('pump-1');
 let state={x:0,z:0,heading:0,speed:20,steering:0};
 const first=stepFireTruckKinematics(state,{throttle:0,steering:0},.05,false,pump);
 assert.ok(first.speed<20&&first.speed>19.5,'crossing onto rough ground does not snap to the off-road cap');
 state={...first,speed:0};
 for(let i=0;i<100;i++) state=stepFireTruckKinematics(state,{throttle:-1,steering:0},.02,false,pump);
 assert.ok(state.speed<0&&Math.abs(state.speed)<=pump.maximumReverseSpeed*.65);
});

test('off-road reverse overspeed decays gradually and acceleration cannot push through either cap',()=>{
 const tuning=byId('pump-1');
 const reverse=stepFireTruckKinematics({x:0,z:0,heading:0,speed:-8,steering:0},{throttle:0,steering:0},.05,false,tuning);
 assert.ok(reverse.speed>-8&&reverse.speed<-tuning.maximumReverseSpeed*.65,'reverse overspeed falls at the bounded rough-ground deceleration');
 const strong={...tuning,forwardAcceleration:100,reverseAcceleration:100,offRoadAccelerationScale:1,offRoadBrake:2};
 const forward=stepFireTruckKinematics({x:0,z:0,heading:0,speed:tuning.offRoadSpeed-.01,steering:0},{throttle:1,steering:0},.05,false,strong);
 const backward=stepFireTruckKinematics({x:0,z:0,heading:0,speed:-tuning.maximumReverseSpeed*.65+.01,steering:0},{throttle:-1,steering:0},.05,false,strong);
 const roadCap=stepFireTruckKinematics({x:0,z:0,heading:0,speed:tuning.maximumForwardSpeed-.01,steering:0},{throttle:1,steering:0},.05,true,strong);
 assert.ok(forward.speed<=tuning.offRoadSpeed);
 assert.ok(backward.speed>=-tuning.maximumReverseSpeed*.65);
 assert.ok(Math.abs(forward.acceleration-(forward.speed-(tuning.offRoadSpeed-.01))/.05)<1e-9);
 assert.ok(roadCap.speed<=tuning.maximumForwardSpeed);
 assert.ok(Math.abs(roadCap.acceleration-(roadCap.speed-(tuning.maximumForwardSpeed-.01))/.05)<1e-9);
});

test('full steering at 200 km/h stays inside the Medi pickup lateral acceleration limit',()=>{
 const tuning=byId('medi');
 let state={x:0,z:0,heading:0,speed:tuning.maximumForwardSpeed,steering:0};
 let worst=0;
 for(let i=0;i<300;i++){
  const prior=state;
  state=stepFireTruckKinematics(state,{throttle:0,steering:1},1/60,true,tuning);
  const yaw=Math.abs(Math.atan2(Math.sin(state.heading-prior.heading),Math.cos(state.heading-prior.heading)));
  worst=Math.max(worst,state.speed*yaw*60);
 }
 assert.ok(worst<=tuning.maximumLateralAcceleration*1.002,`lateral acceleration ${worst.toFixed(2)} m/s^2 exceeded tuned grip`);
});

test('steady road acceleration and cornering remain stable at 30, 60, and 120 Hz',()=>{
 const tuning=byId('pump-2');
 const run=hz=>{
  let state={x:0,z:0,heading:0,speed:0,steering:0};
  const steps=hz*8;
  for(let i=0;i<steps;i++) state=stepFireTruckKinematics(state,{throttle:1,steering:.4},1/hz,true,tuning);
  return state;
 };
 const results=[30,60,120].map(run);
 assert.ok(Math.max(...results.map(s=>s.speed))-Math.min(...results.map(s=>s.speed))<.03);
 assert.ok(Math.max(...results.map(s=>s.heading))-Math.min(...results.map(s=>s.heading))<.03);
 assert.ok(results.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.z)));
});
