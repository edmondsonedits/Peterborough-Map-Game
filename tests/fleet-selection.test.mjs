import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../city-explorer/vendor/three-r180/build/three.module.min.js',import.meta.url).href:s,c);}});
const THREE=await import('three');
const {createFleetRuntime}=await import('../city-explorer/fleet-runtime.js');
const {FLEET_DEFINITIONS}=await import('../city-explorer/vehicle-fleet.mjs');
function make(prepare){const group=new THREE.Group(),activated=[];const r=createFleetRuntime({THREE,group,spawns:Object.fromEntries(FLEET_DEFINITIONS.map((d,i)=>[d.id,{x:i*20,z:0,y:0,heading:0}])),initialId:'pump-1',prepare,activate:v=>activated.push(v.definition.id),createTruck:()=>{const g=new THREE.Group();g.userData.truck={ready:Promise.resolve(),assetStatus:'blender-ready'};return g;},installModel:()=>{}});return {r,group,activated};}
test('failed destination keeps active identity and all parked world positions',async()=>{
 const {r,group}=make(async()=>{throw Error('Roads unavailable');});r.fleet.active.state.x=456;
 const result=await r.select('pump-2');assert.equal(result.ok,false);assert.equal(r.fleet.activeId,'pump-1');assert.equal(r.fleet.active.state.x,456);assert.equal(group.children.length,5);assert.equal(r.busy,false);
});
test('superseded readiness cannot steal selection from latest target',async()=>{
 const resolve={};const {r,activated}=make(v=>new Promise(done=>resolve[v.definition.id]=done));
 const a=r.select('pump-2'),b=r.select('pump-3');resolve['pump-3']();await b;resolve['pump-2']();await a;
 assert.equal(r.fleet.activeId,'pump-3');assert.deepEqual(activated,['pump-1','pump-3']);assert.equal(r.busy,false);
});
