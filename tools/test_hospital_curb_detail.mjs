import test from 'node:test';
import assert from 'node:assert/strict';
import {createPavementField} from '../city-explorer/pavement-continuity.js';
const mod=await import('../city-explorer/hospital-curb-detail.js').catch(()=>({}));
const field=createPavementField({center:{x:0,z:0},radius:120,heightAt:()=>10});
test('inferred curb retains seven centimetre reveal on final pavement and original height at feather boundary',()=>{
 assert.equal(typeof mod.hospitalInferredCurbTop,'function');
 assert.equal(mod.hospitalInferredCurbTop({x:0,y:0},20,10,field),10.07);
 assert.equal(mod.hospitalInferredCurbTop({x:110,y:0},20,10,field),15.035);
 assert.ok(Math.abs(mod.hospitalInferredCurbTop({x:119.999,y:0},20,10,field)-20)<1e-6);
 for(const x of [120,121,500])assert.equal(mod.hospitalInferredCurbTop({x,y:0},20,10,field),20);
 assert.equal(mod.hospitalInferredCurbTop({x:0,y:0},20,null,field),20);
 assert.equal(mod.hospitalInferredCurbTop({x:0,y:0},20,10,null),20);
});
test('local curb refinement covers crossing segments without changing bridges, Station or outside',()=>{
 assert.equal(typeof mod.hospitalCurbNeedsDetail,'function');
 const segment={a:{x:-130,y:0},b:{x:130,y:0}};
 assert.equal(mod.hospitalCurbNeedsDetail(segment,field),true);
 assert.equal(mod.hospitalCurbNeedsDetail({...segment,bridge:true},field),false);
 assert.equal(mod.hospitalCurbNeedsDetail({...segment,stationDetail:true},field),false);
 assert.equal(mod.hospitalCurbNeedsDetail({a:{x:121,y:0},b:{x:140,y:0}},field),false);
});
