import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { installCityMaterialDetail } from '../city-explorer/city-material-library.js';
import { installWorldSurfaceDetail } from '../city-explorer/vertical-slice-quality.js';
import { installStationApron } from '../city-explorer/site-surface-materials.js';

const renderer = { capabilities: { isWebGL2: true, precision: 'highp' } };
const project = (lat, lon) => ({ x: (lon + 78.32) * 80000, y: (lat - 44.30) * 111000 });
const compile = (material) => {
  const shader = {
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  material.onBeforeCompile(shader, renderer);
  return shader;
};
const assertWorldPositionInterface = (shader) => {
  const declaration = /\bvarying\s+vec3\s+vAaaWorldPosition\s*;/g;
  assert.equal([...shader.vertexShader.matchAll(declaration)].length, 1, 'vertex shader declares exactly one world-position varying');
  assert.equal([...shader.fragmentShader.matchAll(declaration)].length, 1, 'fragment shader declares exactly one world-position varying');
  assert.equal([...shader.vertexShader.matchAll(/\bvAaaWorldPosition\s*=/g)].length, 1, 'vertex shader writes the fragment input');
  assert.match(shader.fragmentShader, /vec2 p = vAaaWorldPosition\.xz;/);
};

test('station apron supplies its shader interface when optional surface detail is disabled', () => {
  const material = new THREE.MeshStandardMaterial();
  const previousKey = material.customProgramCacheKey();
  installStationApron(material, project);
  const shader = compile(material);
  assertWorldPositionInterface(shader);
  assert.match(shader.vertexShader, /#ifdef USE_BATCHING\s+\w+ = batchingMatrix \* \w+;/);
  assert.match(shader.vertexShader, /#ifdef USE_INSTANCING\s+\w+ = instanceMatrix \* \w+;/);
  assert.match(shader.vertexShader, /vAaaWorldPosition = \(modelMatrix \* \w+\)\.xyz;/);
  assert.ok(material.customProgramCacheKey().startsWith(previousKey));
  assert.notEqual(material.customProgramCacheKey(), previousKey);
});

for (const [name, installDetail] of [
  ['city material detail', (material) => installCityMaterialDetail(material, { kind: 'asphalt', quality: 'full', id: 'test/apron' })],
  ['legacy world surface detail', (material) => installWorldSurfaceDetail(material, 'asphalt')],
]) {
  test(`station apron preserves the world-position provider from ${name}`, () => {
    const material = new THREE.MeshStandardMaterial();
    installDetail(material);
    const priorShader = compile(material);
    const priorKey = material.customProgramCacheKey();
    installStationApron(material, project);
    const shader = compile(material);
    assertWorldPositionInterface(shader);
    assert.equal(shader.vertexShader, priorShader.vertexShader, 'existing world-position computation is preserved');
    assert.match(shader.fragmentShader, /aaaAggregate/);
    assert.ok(material.customProgramCacheKey().startsWith(priorKey));
    assert.notEqual(material.customProgramCacheKey(), priorKey);
  });
}
