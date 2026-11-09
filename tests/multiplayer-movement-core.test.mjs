import test from 'node:test';
import assert from 'node:assert/strict';
import { stepWalking, stepVehicle, stepVehicleKinematics, DEFAULT_VEHICLE_TUNING } from '../city-explorer/multiplayer/movement-core.mjs';
import { FLEET_DEFINITIONS } from '../city-explorer/vehicle-fleet.mjs';

test('walking matches the legacy camera-relative integrator for its fixture sequence',()=>{
 const state={x:0,y:2,z:0,heading:0,vx:0,vz:0,speed:0};
 const world={sampleSurface:()=>({height:2,onRoad:false,surfaceId:'terrain',version:'test'}),blocks:()=>false};
 const controls={forward:.2,strafe:0,sprint:false,viewYaw:0};
 const next=stepWalking(state,controls,.05,world);
 const legacyVelocity=1.6*(1-Math.exp(-13*.05));
 assert.ok(Math.abs(next.x)<1e-12);assert.ok(Math.abs(next.z-(-legacyVelocity*.05))<1e-12);
 assert.ok(Math.abs(next.vz-(-legacyVelocity))<1e-12);
});
test('walking basis turns with finite normalized camera yaw',()=>{
 const state={x:0,y:0,z:0,heading:0,vx:0,vz:0,speed:0};
 const world={sampleSurface:()=>({height:0,onRoad:false,surfaceId:'terrain',version:'test'}),blocks:()=>false};
 const east=stepWalking(state,{forward:1,strafe:0,viewYaw:Math.PI/2},.1,world);
 const west=stepWalking(state,{forward:1,strafe:0,viewYaw:-Math.PI/2},.1,world);
 const right=stepWalking(state,{forward:0,strafe:1,viewYaw:0},.1,world);
 assert.ok(east.x<0&&Math.abs(east.z)<1e-8);assert.ok(west.x>0&&Math.abs(west.z)<1e-8);assert.ok(right.x>0&&Math.abs(right.z)<1e-8);
});
test('walking is deterministic, world-surface grounded, and does not mutate state',()=>{
 const state={x:0,y:0,z:0,heading:0,vx:0,vz:0,speed:0},original=structuredClone(state);
 const world={sampleSurface:(x,z)=>({height:x+z,onRoad:false,surfaceId:'terrain',version:'test'}),blocks:()=>false};
 const a=stepWalking(state,{forward:1,strafe:0,sprint:true,viewYaw:0},.1,world),b=stepWalking(state,{forward:1,strafe:0,sprint:true,viewYaw:0},.1,world);
 assert.deepEqual(a,b);assert.deepEqual(state,original);assert.ok(a.z<0);assert.equal(a.y,world.sampleSurface(a.x,a.z).height);assert.ok(Number.isFinite(a.vx)&&Number.isFinite(a.vz));
});
test('vehicle uses world surface speed and clamps malformed controls',()=>{
 const s={x:1,y:2,z:3,heading:.2,vx:0,vz:0,speed:0,steering:0};
 const road={sampleSurface:()=>({height:2,onRoad:true,surfaceId:'road',version:'test'}),blocks:()=>false};
 const dirt={sampleSurface:()=>({height:4,onRoad:false,surfaceId:'terrain',version:'test'}),blocks:()=>false};
 const safe=stepVehicle(s,{throttle:'nan',steering:Infinity},.1,road);assert.equal(safe.x,s.x);assert.equal(safe.z,s.z);
 const a=stepVehicle(s,{throttle:1,steering:0},.1,road),b=stepVehicle(s,{throttle:1,steering:0},.1,dirt);assert.ok(a.speed>b.speed);assert.equal(a.y,2);assert.equal(b.y,4);
});
test('walk and vehicle steps stop at exported blockers',()=>{
 const s={x:0,y:0,z:0,heading:0,vx:0,vz:0,speed:0,steering:0},w={sampleSurface:()=>({height:0,onRoad:true,surfaceId:'road',version:'test'}),blocks:()=>true};
 const a=stepWalking(s,{forward:1,viewYaw:0},.1,w),b=stepVehicle(s,{throttle:1},.1,w);assert.equal(a.x,0);assert.equal(a.z,0);assert.equal(a.vx,0);assert.equal(a.vz,0);assert.equal(b.x,0);assert.equal(b.z,0);assert.equal(b.speed,0);
});

test('center pavement hole remains driveable when two fresh wheel contacts reach road',()=>{const state={x:0,y:0,z:0,heading:0,vx:0,vz:0,speed:0,steering:0};let initialSamples=0;const mixed={sampleSurface:(x)=>{initialSamples++;return{height:0,onRoad:x<0};},blocks:()=>false},offroad={sampleSurface:()=>({height:0,onRoad:false}),blocks:()=>false};const on=stepVehicle(state,{throttle:1},.1,mixed),off=stepVehicle(state,{throttle:1},.1,offroad);assert.equal(initialSamples,6,'centre, four wheel contacts, and destination must be sampled');assert.ok(on.speed>off.speed,'two road-side wheels restore the on-road tuning');});

test('vehicle tuning gives distinct predictable pumper, aerial, and medic handling',()=>{
 const byId=Object.fromEntries(FLEET_DEFINITIONS.map(v=>[v.id,v.tuning]));
 assert.ok(byId.aerial.forwardAcceleration<byId['pump-1'].forwardAcceleration);
 assert.ok(byId.medi.forwardAcceleration>byId['pump-1'].forwardAcceleration);
 assert.ok(byId.aerial.serviceBrake<byId['pump-1'].serviceBrake);
 assert.ok(byId.medi.maximumForwardSpeed>byId['pump-1'].maximumForwardSpeed);
 assert.ok(byId.medi.steeringLowSpeed>byId.aerial.steeringLowSpeed);
 assert.ok(byId.aerial.length>byId['pump-1'].length);
});

test('vehicle kinematics stay close across 30 and 60 Hz control frames',()=>{
 const run=hz=>{let state={x:0,z:0,heading:0,speed:0,steering:0};for(let i=0;i<hz*4;i++)state=stepVehicleKinematics(state,{throttle:.72,steering:.36},1/hz,true,DEFAULT_VEHICLE_TUNING);return state;};
 const at30=run(30),at60=run(60);
 assert.ok(Math.hypot(at30.x-at60.x,at30.z-at60.z)<.18,`position drift ${Math.hypot(at30.x-at60.x,at30.z-at60.z)}`);
 assert.ok(Math.abs(at30.heading-at60.heading)<.035,`heading drift ${at30.heading-at60.heading}`);
 assert.ok(Math.abs(at30.speed-at60.speed)<.02);
});
