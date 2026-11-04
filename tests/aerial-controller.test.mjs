import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAerialState,stepAerial,aerialTravelReady} from '../city-explorer/aerial-controller.mjs';
const clear={speed:0,setup:()=>({ok:true,feet:[0,0,0,0]}),motion:()=>true};
function run(s,input,seconds,env=clear){for(let t=0;t<seconds;t+=.02)stepAerial(s,input,.02,env);return s;}
test('requires stopped supported setup, then beams before feet before unfolding basket',()=>{
  const s=createAerialState();stepAerial(s,{deploy:true},.02,{...clear,speed:1});assert.equal(s.phase,'travel');
  stepAerial(s,{deploy:true},.02,{...clear,setup:()=>({ok:false,reason:'Obstructed'})});assert.equal(s.phase,'travel');
  stepAerial(s,{deploy:true},.02,clear);assert.equal(s.phase,'deploying');assert.equal(aerialTravelReady(s),false);
  run(s,{},12);assert.equal(s.phase,'operating');assert.equal(s.beams,1);assert.equal(s.jacks,1);assert.equal(s.lift,1);assert.equal(s.fold,0);
  run(s,{extend:1,raise:1,rotate:1},3);assert.ok(s.extension>0);assert.ok(s.pitch>0);assert.ok(s.yaw>0);
  assert.equal(s.fold,0);
});
test('water needs stable operating state, drains supply, stops on stop/stow, and stows before travel',()=>{
  const s=createAerialState();run(s,{flow:true},2);assert.equal(s.flow,false);assert.equal(s.supply,45);
  stepAerial(s,{deploy:true},.02,clear);run(s,{},12);run(s,{raise:1,extend:1,rotate:1},3);
  run(s,{flow:true},1);assert.ok(s.supply<45);assert.equal(s.flow,true);
  stepAerial(s,{stop:true,flow:true},.02,clear);assert.equal(s.flow,false);
  stepAerial(s,{stow:true},.02,clear);assert.equal(s.flow,false);run(s,{},45);
  assert.equal(aerialTravelReady(s),true);assert.equal(s.fold,1);assert.equal(s.jacks,0);assert.equal(s.lift,0);assert.equal(s.beams,0);
});
test('stowing from boarding reverses the validated unfold path',()=>{
  const s=createAerialState();const limited={...clear,motion:(from,to)=>to.pitch<=.4};
  stepAerial(s,{deploy:true},.02,limited);run(s,{},12,limited);
  assert.equal(s.phase,'operating');
  stepAerial(s,{stow:true},.02,limited);run(s,{},12,limited);
  assert.equal(aerialTravelReady(s),true);
});
test('blocked swept movement retains pose, reverse remains usable, invalid delta is harmless',()=>{
  const s=createAerialState();stepAerial(s,{deploy:true},.02,clear);run(s,{},12);
  const p=s.pitch;run(s,{raise:1},1,{...clear,motion:()=>false});assert.equal(s.pitch,p);assert.match(s.reason,/blocked/i);
  run(s,{raise:1},1);assert.ok(s.pitch>p);stepAerial(s,{raise:1},NaN,clear);assert.ok(Number.isFinite(s.pitch));
});
