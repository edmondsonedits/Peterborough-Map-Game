import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
import { reconcileStationPavement } from '../city-explorer/station-pavement-layer.js';

const group = new THREE.Group();
const rect = (x, z, w, d, y) => [x,y,z, x,y,z+d, x+w,y,z, x+w,y,z, x,y,z+d, x+w,y,z+d];
function mesh(type, positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const object = new THREE.Mesh(geometry);
  object.userData.type = type;
  group.add(object);
  return object;
}
const road = mesh('road-official-road_surfaces-batch', rect(-10,-10,20,20,2));
mesh('road-official-parking_surfaces-batch', rect(0,-10,20,20,3));
const distant = mesh('road-official-road_surfaces-batch', rect(900,900,20,20,8));
const bridge = mesh('road-official-bridges-batch', rect(-10,-10,20,20,12));
const originalDistant = distant.geometry, originalBridge = bridge.geometry;
const ring = (x,z,w,d) => [[x,z],[x+w,z],[x+w,z+d],[x,z+d],[x,z]];
const result = reconcileStationPavement({ THREE, group, center:{x:0,z:0},
  // The road outline encloses the entire pilot: no vertex is nearby.
  polygons:[{layer:'road_surfaces',rings:[ring(-500,-500,1000,1000)]},
    {layer:'parking_surfaces',rings:[ring(0,-10,20,20)]}],
  terrainHeight:()=>0, roadIndex:{sampleAll:()=>[]}, Index:RenderedPavementIndex });
assert.ok(result, 'Enclosing source polygon must not be omitted');
assert.equal(distant.geometry, originalDistant, 'Distant GPU geometry must be reused');
assert.equal(bridge.geometry, originalBridge, 'Bridge deck geometry must be untouched');
assert.equal(result.diagnostics.changedMeshes, 2);
assert.equal(result.diagnostics.reusedMeshes, 2);
assert.equal(result.index.sample(905,905,8).height, 8);
assert.equal(result.index.sample(0,0,12).height, 12);
assert.ok(Math.abs(result.index.sample(0,0,0).height - .148) < 1e-6);
assert.equal(group.children[1].geometry.attributes.position.count, 0, 'Road ownership removes parking overlap');
assert.ok(road.geometry.attributes.position.count > 6);
console.log(JSON.stringify({status:'pass',outsideGeometryReused:true,bridgePreserved:true,enclosingPolygonHandled:true,parkingOverlapRemoved:true}));
