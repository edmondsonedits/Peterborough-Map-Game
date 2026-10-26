import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {
  CITY_MATERIALS,
  CITY_PALETTE_SURFACES,
  cloneCityMaterial,
  installCityMaterialDetail,
} from '../city-explorer/city-material-library.js';

const expectedKinds = ['asphalt', 'brick', 'concrete', 'glass', 'grass', 'metal-roof', 'render', 'roof', 'stone', 'water'];
for (const kind of expectedKinds) {
  const profile = CITY_MATERIALS[kind];
  assert.ok(profile, kind + ' has a shared material profile');
  assert.equal(profile.provenance, 'original procedural');
  assert.ok(Object.values(profile.scaleMeters).length > 0);
  assert.ok(Object.values(profile.scaleMeters).every((value) => value > 0 && Number.isFinite(value)), kind + ' uses metre-scale detail');
  assert.ok(profile.intendedUse.length > 0);
  assert.ok(profile.roughness >= 0 && profile.roughness <= 1);
  assert.ok(profile.metalness >= 0 && profile.metalness <= 1);
  assert.equal(profile.estimatedTextureBytes, 0);
  assert.ok(profile.fallback.includes('preserve base material color'));
  assert.ok(profile.licenseScope.includes('no external imagery'));
}

assert.deepEqual(CITY_MATERIALS.brick.scaleMeters, { width: 0.24, height: 0.075, mortarHorizontal: 0.0084, mortarVertical: 0.002625 });
assert.deepEqual(CITY_MATERIALS.concrete.scaleMeters, { jointSpacing: 3.2, jointWidth: 0.012, grain: 0.42 });
assert.equal(CITY_MATERIALS['metal-roof'].scaleMeters.seamSpacing, 0.55);
assert.equal(CITY_MATERIALS.glass.scaleMeters.variation, 2.5);
const compileFixture = () => ({
  vertexShader: [
    '#include <common>',
    '#include <defaultnormal_vertex>',
    '#include <begin_vertex>',
    '#include <project_vertex>',
  ].join('\n'),
  fragmentShader: [
    '#include <common>',
    'void main() {',
    'vec4 diffuseColor = vec4( diffuse, opacity );',
    '}',
  ].join('\n'),
});

assert.equal(CITY_PALETTE_SURFACES.residentialBrick, 'brick');
assert.equal(CITY_PALETTE_SURFACES.sidewalk, 'concrete');
assert.equal(CITY_PALETTE_SURFACES.roadLocal, 'asphalt');
assert.equal(CITY_PALETTE_SURFACES.roofMetal, 'metal-roof');
assert.equal(CITY_PALETTE_SURFACES.windowGlass, 'glass');
assert.equal(CITY_PALETTE_SURFACES.grass, 'grass');

// Three's defaultnormal_vertex has already converted normals into view space.
// Recover world orientation with Three's own inverseTransformDirection helper
// before using the normal to choose a world-axis material projection.
assert.match(THREE.ShaderChunk.common, /vec3 inverseTransformDirection\( in vec3 dir, in mat4 matrix \)/);
assert.match(THREE.ShaderChunk.common, /return normalize\( \( vec4\( dir, 0\.0 \) \* matrix \)\.xyz \);/);
const rotatedCamera = new THREE.PerspectiveCamera();
const worldNormal = new THREE.Vector3(0, 0, 1);
const initialProjectionAxis = worldNormal.clone().toArray();
for (const angles of [[0, 0, 0], [0.42, 0.91, -0.17], [-0.8, 2.2, 0.35]]) {
  rotatedCamera.rotation.set(...angles);
  rotatedCamera.updateMatrixWorld(true);
  rotatedCamera.matrixWorldInverse.copy(rotatedCamera.matrixWorld).invert();
  const viewNormal = worldNormal.clone().transformDirection(rotatedCamera.matrixWorldInverse);
  const restoredWorldNormal = viewNormal.clone().transformDirection(rotatedCamera.matrixWorld);
  assert.ok(restoredWorldNormal.distanceTo(worldNormal) < 1e-10, 'world projection normal is camera-rotation invariant');
  assert.ok(restoredWorldNormal.distanceTo(new THREE.Vector3(...initialProjectionAxis)) < 1e-10);
  if (angles.some((angle) => angle !== 0)) {
    const oldCameraRelativeNormal = viewNormal.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(rotatedCamera.matrixWorldInverse)).normalize();
    assert.ok(oldCameraRelativeNormal.distanceTo(worldNormal) > 0.1, 'the former view-matrix multiplication changes world projection with camera rotation');
  }
}

const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x777777 });
baseMaterial.customProgramCacheKey = () => 'base';

const renderer = { capabilities: { isWebGL2: true, precision: 'highp' } };
const standardShader = THREE.ShaderLib.standard;
const actualShaderMaterial = new THREE.MeshStandardMaterial();
installCityMaterialDetail(actualShaderMaterial, { kind: 'brick', id: 'source/three-standard', quality: 'full' });
const actualShader = { vertexShader: standardShader.vertexShader, fragmentShader: standardShader.fragmentShader };
actualShaderMaterial.onBeforeCompile(actualShader, renderer);
assert.match(actualShader.vertexShader, /inverseTransformDirection\(transformedNormal, viewMatrix\)/);
assert.match(actualShader.fragmentShader, /aaaBrickMask/);
assert.match(actualShader.fragmentShader, /return position.xz/);
assert.match(actualShader.fragmentShader, /return position.zy/);
assert.match(actualShader.fragmentShader, /return position.xy/);
assert.equal(actualShaderMaterial.userData.cityMaterial.renderer.isWebGL2, true);
assert.equal(installCityMaterialDetail(baseMaterial, { kind: 'asphalt', id: 'road/local', quality: 'full' }), true);
assert.equal(installCityMaterialDetail(baseMaterial, { kind: 'asphalt', id: 'road/local', quality: 'full' }), false, 'same detail registration is idempotent');
const asphaltShader = compileFixture();
baseMaterial.onBeforeCompile(asphaltShader, renderer);
assert.match(asphaltShader.vertexShader, /vAaaWorldPosition/);
assert.match(asphaltShader.vertexShader, /USE_INSTANCING/);
assert.match(asphaltShader.vertexShader, /vCityWorldNormal/);
assert.match(asphaltShader.fragmentShader, /citySurfaceUv/);

assert.match(asphaltShader.fragmentShader, /aaaAggregate/);
assert.equal(baseMaterial.userData.cityMaterial.kind, 'asphalt');
assert.equal(baseMaterial.color.getHex(), 0x777777, 'material detail preserves the supplied base color');
assert.equal(baseMaterial.userData.cityMaterial.id, 'road/local');
assert.equal(baseMaterial.userData.cityMaterial.scaleMeters, CITY_MATERIALS.asphalt.scaleMeters);
assert.equal(baseMaterial.userData.cityMaterial.provenance, 'original procedural');
assert.deepEqual(baseMaterial.userData.cityMaterial.renderer, { isWebGL2: true, precision: 'highp' });
assert.equal(baseMaterial.customProgramCacheKey(), 'base|ptbo-city-materials-v1:asphalt:full');

for (const kind of expectedKinds) {
  const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  assert.equal(installCityMaterialDetail(material, { kind: kind, id: 'fixture/' + kind, quality: 'full' }), true);
  const shader = compileFixture();
  material.onBeforeCompile(shader, renderer);
  if (['brick', 'concrete', 'metal-roof', 'roof', 'stone'].includes(kind)) assert.match(shader.fragmentShader, /fwidth/, kind + ' uses derivative filtering');
  if (kind === 'glass') { assert.match(shader.fragmentShader, /cityNoise21/); assert.doesNotMatch(shader.fragmentShader, /aaaPanelEdge/); }
  assert.notEqual(shader.fragmentShader, compileFixture().fragmentShader, kind + ' adds a detail effect');
}

const lite = new THREE.MeshStandardMaterial({ color: 0x777777 });
lite.customProgramCacheKey = () => '';
assert.equal(installCityMaterialDetail(lite, { kind: 'brick', quality: 'lite' }), true, 'missing IDs use a stable kind-based ID');
const liteShader = compileFixture();
lite.onBeforeCompile(liteShader, renderer);
assert.equal(lite.userData.cityMaterial.id, 'brick');
assert.equal(lite.userData.cityMaterial.quality, 'lite');
assert.equal(lite.customProgramCacheKey(), '|ptbo-city-materials-v1:brick:lite');
assert.match(liteShader.fragmentShader, /diffuseColor\.rgb \*= mix\(1\.0, aaaBrickLight, 0\.52\)/);

const hookMaterial = new THREE.MeshStandardMaterial();
hookMaterial.customProgramCacheKey = () => 'hook-base';
hookMaterial.userData.hookCalls = 0;
hookMaterial.onBeforeCompile = function (shader, seenRenderer) {
  this.userData.hookCalls += 1;
  this.userData.hookRenderer = seenRenderer;
  shader.fragmentShader += '\n// retained prior hook';
};
installCityMaterialDetail(hookMaterial, { kind: 'render', id: 'facade/render', quality: 'full' });
const hookedShader = compileFixture();
hookMaterial.onBeforeCompile(hookedShader, renderer);
assert.equal(hookMaterial.userData.hookCalls, 1);
assert.equal(hookMaterial.userData.hookRenderer, renderer);
assert.match(hookedShader.fragmentShader, /retained prior hook/);
assert.match(hookedShader.fragmentShader, /aaaRenderTone/);
assert.equal(hookMaterial.customProgramCacheKey(), 'hook-base|ptbo-city-materials-v1:render:full');
const unsupported = new THREE.MeshStandardMaterial();
assert.equal(installCityMaterialDetail(unsupported, { kind: 'unknown', id: 'unknown' }), false, 'unknown materials fall back unchanged');
assert.equal(installCityMaterialDetail(unsupported, { kind: 'brick', id: 'bad', quality: 'ultra' }), false, 'unknown quality falls back unchanged');

const partialShader = {
  vertexShader: '#include <common>',
  fragmentShader: '#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );',
};
const beforePartial = structuredClone(partialShader);
const fallback = new THREE.MeshStandardMaterial();
installCityMaterialDetail(fallback, { kind: 'brick', id: 'fallback' });
fallback.onBeforeCompile(partialShader, renderer);
assert.deepEqual(partialShader, beforePartial, 'missing shader anchors leave the shader untouched');
assert.equal(fallback.userData.cityMaterial.shaderDetailFallback, true);

const source = new THREE.MeshStandardMaterial({ color: 0x888888 });
installCityMaterialDetail(source, { kind: 'brick', id: 'building/family', quality: 'full' });
const clone = cloneCityMaterial(source);
assert.ok(clone instanceof THREE.MeshStandardMaterial);
assert.notEqual(clone, source);
assert.equal(clone.userData.cityMaterial.renderer, null);
assert.equal(clone.customProgramCacheKey(), source.customProgramCacheKey(), 'clone retains the exact custom program key');
const cloneShader = compileFixture();
clone.onBeforeCompile(cloneShader, renderer);
const sourceShader = compileFixture();
source.onBeforeCompile(sourceShader, renderer);
assert.deepEqual(clone.userData.cityMaterial, source.userData.cityMaterial);
assert.equal(clone.userData.cityMaterial.renderer.isWebGL2, true, 'clone records renderer metadata at compile time');
assert.match(cloneShader.fragmentShader, /aaaBrickMask/, 'clone retains the registered shader effect');
assert.equal(cloneShader.fragmentShader, sourceShader.fragmentShader, 'clone keeps the same compile behavior');

const hookSource = new THREE.MeshStandardMaterial();
const calls = [];
hookSource.onBeforeCompile = function (shader, seenRenderer) {
  calls.push({ thisValue: this, seenRenderer: seenRenderer });
};
hookSource.customProgramCacheKey = function () { return this.name || 'source-key'; };
hookSource.name = 'context-key';
const hookClone = cloneCityMaterial(hookSource);
hookClone.onBeforeCompile(compileFixture(), renderer);
assert.equal(calls[0].thisValue, hookSource, 'clone invokes the source hook with its original context');
assert.equal(calls[0].seenRenderer, renderer);
assert.equal(hookClone.customProgramCacheKey(), 'context-key', 'clone retains the source cache-key context');

const stableIdA = new THREE.MeshStandardMaterial();
const stableIdB = new THREE.MeshStandardMaterial();
installCityMaterialDetail(stableIdA, { kind: 'brick', id: 'building/a', quality: 'full' });
installCityMaterialDetail(stableIdB, { kind: 'brick', id: 'building/b', quality: 'full' });
assert.equal(stableIdA.customProgramCacheKey(), stableIdB.customProgramCacheKey(), 'stable IDs do not create one shader program per feature');

console.log(JSON.stringify({ status: 'pass', kinds: expectedKinds, hookClone: true, shaderFallback: true, threeRevision: THREE.REVISION }));
