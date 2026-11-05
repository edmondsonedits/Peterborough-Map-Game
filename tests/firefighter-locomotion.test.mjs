import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {createFirefighterLocomotion}=await import('../city-explorer/firefighter-locomotion.js');

function fixture(){
  const scene=new THREE.Group();
  for(const name of ['Hips','Spine','Chest','Neck','Head','LeftArm','LeftForeArm','LeftHand','RightArm','RightForeArm','RightHand','LeftLeg','LeftShin','LeftFoot','LeftToe','RightLeg','RightShin','RightFoot','RightToe']){const bone=new THREE.Bone();bone.name=name;scene.add(bone);}
  const clips=['Idle','Walk','Run'].map((name,i)=>new THREE.AnimationClip(name,[1.2,.86,.64][i],[new THREE.QuaternionKeyframeTrack('LeftLeg.quaternion',[0,[1.2,.86,.64][i]],[0,0,0,1,0,0,Math.sin(.4),Math.cos(.4)]),new THREE.QuaternionKeyframeTrack('RightLeg.quaternion',[0,[1.2,.86,.64][i]],[0,0,0,1,0,0,-Math.sin(.4),Math.cos(.4)])]));
  return {scene,clips};
}
function advance(controller,rate,seconds,speed){for(let i=0;i<Math.round(rate*seconds);i++)controller.update(1/rate,speed);}

test('sprint takes over at top speed and blends back to run in phase',()=>{
  const {scene,clips}=fixture();
  const sprint=clips[2].clone();
  sprint.name='Sprint';
  clips.push(sprint);
  const gait=createFirefighterLocomotion(scene,clips);
  advance(gait,60,1,5.4);
  assert.equal(gait.state().mode,'sprint');
  assert.ok(gait.state().weights.Sprint>.98);
  advance(gait,60,.2,4.5);
  const {weights,actionTimes}=gait.state();
  assert.ok(weights.Run>.1&&weights.Sprint>.1);
  assert.ok(Math.abs(actionTimes.Run/clips[2].duration-actionTimes.Sprint/sprint.duration)<1e-5);
  advance(gait,60,1,3.8);
  assert.equal(gait.state().mode,'run');
});

test('locomotion selects and crossfades idle, walk, and run by measured speed',()=>{
  const {scene,clips}=fixture(),gait=createFirefighterLocomotion(scene,clips);
  assert.equal(gait.state().mode,'idle');assert.equal(gait.state().weights.Idle,1);
  advance(gait,60,1.2,1.6);assert.equal(gait.state().mode,'walk');assert.ok(gait.state().weights.Walk>.94);
  advance(gait,60,1,2.7);assert.equal(gait.state().mode,'transition');assert.ok(gait.state().weights.Walk>0&&gait.state().weights.Run>0);
  advance(gait,60,1,3.8);assert.equal(gait.state().mode,'run');assert.ok(gait.state().weights.Run>.98);
});

test('walk and run actions share normalized cycle phase across transitions',()=>{
  const {scene,clips}=fixture(),gait=createFirefighterLocomotion(scene,clips);
  advance(gait,60,1,1.6);let phase=gait.state().phase;
  advance(gait,60,.5,2.7);const state=gait.state();
  assert.ok(state.phase>phase);
  assert.ok(Math.abs((state.actionTimes.Walk/clips[1].duration)-(state.actionTimes.Run/clips[2].duration))<1e-5);
  assert.ok(Math.abs(state.walkPlaybackRate-2.7/1.51)<1e-5);
  assert.ok(Math.abs(state.runPlaybackRate-2.7/3.71)<1e-5);
});


test('clip playback matches calibrated nominal speeds',()=>{
  const {scene,clips}=fixture(),gait=createFirefighterLocomotion(scene,clips);
  advance(gait,60,.8,1.51);assert.equal(gait.state().mode,'walk');assert.ok(Math.abs(gait.state().walkPlaybackRate-1)<1e-6);
  advance(gait,60,.8,3.71);assert.equal(gait.state().mode,'run');assert.ok(Math.abs(gait.state().runPlaybackRate-1)<1e-6);
});

test('locomotion applies clip poses to the animated skeleton',()=>{
  const {scene,clips}=fixture(),gait=createFirefighterLocomotion(scene,clips),left=scene.getObjectByName('LeftLeg');
  gait.update(.08,3.8);
  assert.ok(Math.abs(left.rotation.z)>.01);
});
test('gait phase and blend output are stable at 30 and 60 frames per second',()=>{
  const a=fixture(),b=fixture(),ga=createFirefighterLocomotion(a.scene,a.clips),gb=createFirefighterLocomotion(b.scene,b.clips);
  advance(ga,30,2.4,2.2);advance(gb,60,2.4,2.2);
  assert.ok(Math.abs(ga.state().phase-gb.state().phase)<1e-5);
  assert.ok(Math.abs(ga.state().weights.Walk-gb.state().weights.Walk)<1e-5);
  assert.ok(Math.abs(ga.state().weights.Run-gb.state().weights.Run)<1e-5);
});

test('invalid delta or speed stays bounded and stopping settles into idle',()=>{
  const {scene,clips}=fixture(),gait=createFirefighterLocomotion(scene,clips);
  gait.update(Infinity,NaN);assert.equal(gait.state().mode,'idle');assert.ok(Number.isFinite(gait.state().phase));
  gait.update(.1,2);gait.update(.1,0);
  for(let i=0;i<90;i++)gait.update(1/60,0);
  assert.equal(gait.state().mode,'idle');assert.ok(gait.state().weights.Idle>.98);assert.equal(gait.state().speed,0);
});
