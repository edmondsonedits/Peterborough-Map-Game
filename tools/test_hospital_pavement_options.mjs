import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { reconcileStationPavement } from '../city-explorer/station-pavement-layer.js';

const ring = [[-260,-260],[260,-260],[260,260],[-260,260],[-260,-260]];
function run(options = {}) {
  let samples = 0;
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-260,2,-260, -260,2,260, 260,2,-260, 260,2,-260, -260,2,260, 260,2,260],3));
  const mesh = new THREE.Mesh(geometry); mesh.userData.type = 'road-official-road_surfaces-batch'; group.add(mesh);
  const result = reconcileStationPavement({THREE,group,polygons:[{layer:'road_surfaces',rings:[ring]}],center:{x:0,z:0},terrainHeight:()=>0,
    roadIndex:{sampleAll(x,z){samples++;return [{width:8,distance:0,height:x === 0 && z === 0 ? 8 : 0,bridge:false}];}},Index:RenderedPavementIndex,...options});
  return {result,mesh,get samples(){return samples;}};
}
const bounded = run({radius:120,heightSmoothing:4});
assert.equal(bounded.result.field.radius,120,'Hospital radius must be configurable');
assert.equal(bounded.result.diagnostics.heightSmoothing,4);
assert.equal(bounded.result.field.weight(100,0),1);
assert.equal(bounded.result.field.weight(120,0),0);
const unfiltered = run({radius:120});
assert.ok(bounded.result.field.sample(0,0) < unfiltered.result.field.sample(0,0)*0.5,'Smoothing must attenuate a local elevation spike');
assert.ok(bounded.result.field.sample(0,0)>=.148,'Smoothing retains terrain clearance');
const calls=bounded.samples;
for(let i=0;i<100;i++) bounded.result.field.sample(0,0);
assert.equal(bounded.samples,calls,'Repeated field samples reuse memoized heights');
assert.equal(run().result.field.radius,240,'Station default radius is unchanged');
assert.equal(run().result.diagnostics.heightSmoothing,0,'Station default does not smooth');
assert.throws(()=>run({radius:0}),/radius|options/i);
assert.throws(()=>run({heightSmoothing:-1}),/heightSmoothing|options/i);
assert.equal(bounded.result.index.sample(250,250,2).height,2,'Full 520m fixture retains distant original elevation');
console.log(JSON.stringify({status:'pass',radius:120,heightSmoothing:4,fixtureWidthMetres:520,stationDefaultsPreserved:true,memoizationVerified:true}));
