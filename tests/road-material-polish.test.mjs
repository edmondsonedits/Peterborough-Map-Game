import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { CITY_MATERIALS, CITY_PALETTE_SURFACES, cloneCityMaterial, installCityMaterialDetail } from '../city-explorer/city-material-library.js';

const makeShader = () => ({
  vertexShader: ['#include <common>', '#include <defaultnormal_vertex>', '#include <begin_vertex>'].join('\n'),
  fragmentShader: ['#include <common>', 'void main() {', 'vec4 diffuseColor = vec4( diffuse, opacity );', '}'].join('\n'),
});
const renderer = { capabilities: { isWebGL2: true, precision: 'highp' } };
const compile = (material) => {
  const shader = makeShader();
  material.onBeforeCompile(shader, renderer);
  return shader;
};

assert.deepEqual(CITY_MATERIALS.asphalt.scaleMeters, { grain: 0.08, patch: 6 });
assert.equal(CITY_PALETTE_SURFACES.roadEdge, 'asphalt');

const improved = new THREE.MeshStandardMaterial({ color: 0x3d4443 });
assert.equal(installCityMaterialDetail(improved, { kind: 'asphalt', id: 'road/test' }), true);
const improvedShader = compile(improved).fragmentShader;
assert.match(improvedShader, /aaaAggregateFootprint/);
assert.match(improvedShader, /fwidth\(vAaaWorldPosition\.x\)/);
assert.match(improvedShader, /cameraPosition/);
assert.match(improvedShader, /smoothstep\(45\.0, 150\.0/);
assert.match(improvedShader, /aaaBroad/);
assert.equal(improved.userData.cityMaterial.asphaltStyle, 'improved');
assert.match(improved.customProgramCacheKey(), /asphalt:full$/);

const legacy = new THREE.MeshStandardMaterial({ color: 0x3d4443 });
assert.equal(installCityMaterialDetail(legacy, { kind: 'asphalt', id: 'road/test', asphaltStyle: 'legacy' }), true);
const legacyShader = compile(legacy).fragmentShader;
assert.match(legacyShader, /float aaaAggregate = cityHash21\(floor\(vAaaWorldPosition\.xz \* 3\.57\)\);/);
assert.match(legacyShader, /float aaaPatch = cityNoise21\(vAaaWorldPosition\.xz \* 0\.5\);/);
assert.doesNotMatch(legacyShader, /aaaAggregateFootprint/);
assert.equal(legacy.userData.cityMaterial.asphaltStyle, 'legacy');
assert.notEqual(legacy.customProgramCacheKey(), improved.customProgramCacheKey());

const legacyClone = cloneCityMaterial(legacy);
assert.equal(legacyClone.userData.cityMaterial.asphaltStyle, 'legacy');
assert.equal(legacyClone.customProgramCacheKey(), legacy.customProgramCacheKey());
assert.equal(compile(legacyClone).fragmentShader, legacyShader);

console.log(JSON.stringify({ status: 'pass', styles: ['improved', 'legacy'], clonePreservesStyle: true }));
