import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {cloneCityMaterial, installCityMaterialDetail, installReviewedBrickDetail, REVIEWED_BRICK_DETAIL} from '../city-explorer/city-material-library.js';

const compile = material => {
  const shader = {vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader, {capabilities: {isWebGL2: true, precision: 'highp'}});
  return shader;
};

test('reviewed brick is opt-in, preserves the photographed base color, and adds no texture objects', () => {
  const generic = new THREE.MeshStandardMaterial({color: '#8a5549'});
  const reviewed = new THREE.MeshStandardMaterial({color: '#8a5549'});
  assert.equal(installCityMaterialDetail(generic, {kind: 'brick', quality: 'lite'}), true);
  assert.equal(installReviewedBrickDetail(reviewed, {id: 'way/1002680800', quality: 'lite'}), true);
  const a = compile(generic), b = compile(reviewed);
  assert.match(a.fragmentShader, /aaaBrickLight, 0\.52/);
  assert.doesNotMatch(a.fragmentShader, /reviewedBrickMortar/);
  assert.match(b.fragmentShader, /reviewedBrickMortar/);
  assert.equal(reviewed.color.getHexString(), '8a5549');
  assert.equal(generic.color.getHexString(), '8a5549');
  for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap']) assert.equal(reviewed[key], null, key);
  assert.notEqual(reviewed.customProgramCacheKey(), generic.customProgramCacheKey());
  assert.equal(reviewed.userData.cityMaterial.reviewedBrick, REVIEWED_BRICK_DETAIL.version);
});

test('reviewed mortar keeps one physical recipe in both quality tiers and filters subpixel joints', () => {
  const shaders = [];
  for (const quality of ['lite', 'full']) {
    const material = new THREE.MeshStandardMaterial({color: '#825449'});
    installReviewedBrickDetail(material, {quality});
    shaders.push(compile(material).fragmentShader);
    assert.deepEqual(material.userData.cityMaterial.scaleMeters, REVIEWED_BRICK_DETAIL.scaleMeters);
    assert.match(shaders.at(-1), /fwidth\(reviewedBrickGrid\)/);
    assert.match(shaders.at(-1), /cityReviewedIntervalCoverage/);
    assert.match(shaders.at(-1), /reviewedBrickMortar - reviewedBrickMeanMortar/);
    assert.doesNotMatch(shaders.at(-1), /aaaBrickLight/);
  }
  assert.equal(shaders[0], shaders[1], 'Lite retains the same bounded mortar contrast');
  assert.deepEqual(REVIEWED_BRICK_DETAIL.scaleMeters, {width: .24, height: .075, mortar: .008});
});

test('wall-tangent projection preserves physical brick width on diagonal and reversed walls', () => {
  for (const angle of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI + .7]) {
    const tangent = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const projectedTangent = new THREE.Vector2(normal.y, -normal.x).normalize();
    const delta = tangent.clone().multiplyScalar(REVIEWED_BRICK_DETAIL.scaleMeters.width);
    assert.ok(Math.abs(Math.abs(delta.dot(projectedTangent)) - .24) < 1e-12);
  }
  const material = new THREE.MeshStandardMaterial();
  installReviewedBrickDetail(material);
  assert.match(compile(material).fragmentShader, /dot\(vAaaWorldPosition\.xz, reviewedBrickTangent\)/);
});

test('the emitted filter conserves mortar area across subpixel footprints and negative world coordinates', () => {
  const material = new THREE.MeshStandardMaterial();
  installReviewedBrickDetail(material);
  const fragment = compile(material).fragmentShader;
  // Evaluate the emitted pure scalar GLSL functions, rather than reimplementing
  // their filter, against the independent geometric area of one brick cell.
  const integral = fragment.match(/float cityReviewedIntervalIntegral\([^]*?\n}/)[0];
  const coverage = fragment.match(/float cityReviewedIntervalCoverage\([^]*?\n}/)[0];
  const scalarSource = [integral, coverage].join('\n')
    .replace(/float (cityReviewed\w+)\(/g, 'function $1(')
    .replace(/float (\w+)/g, '$1')
    .replace(/\b(centre|halfSpan) =/g, 'let $1 =');
  const evaluate = new Function('floor', 'fract', 'min', 'max', 'clamp', scalarSource + '\nreturn cityReviewedIntervalCoverage;')(
    Math.floor, x => x - Math.floor(x), Math.min, Math.max, (x, low, high) => Math.max(low, Math.min(high, x)));
  const jointX = .008 / .24, jointY = .008 / .075;
  const expectedMortar = 1 - (1 - jointX) * (1 - jointY);
  for (const span of [.02, .1, .45, .9, 1.5, 4.7]) {
    let sum = 0;
    const count = 4000;
    for (let i = 0; i < count; i++) {
      const x = (i + .5) / count;
      const y = x * 2;
      const a = evaluate(x + jointX / 2, span, jointX);
      const b = evaluate(x + jointX / 2 - 5000, span, jointX);
      assert.ok(Math.abs(a - b) < 1e-9, 'negative world position retains phase');
      assert.ok(a >= 0 && a <= 1);
      sum += evaluate((y - jointY / 2) / 2, span / 2, (1 - jointY) / 2)
        + evaluate((y - 1 - jointY / 2) / 2, span / 2, (1 - jointY) / 2);
    }
    const meanRowInterior = sum / count;
    // Average head coverage over a complete x period is its geometric width.
    const mortarArea = 1 - meanRowInterior * (1 - jointX);
    assert.ok(Math.abs(mortarArea - expectedMortar) < 1e-5, `span ${span} keeps joint area`);
  }
  assert.ok(1 - REVIEWED_BRICK_DETAIL.mortarContrast * expectedMortar - REVIEWED_BRICK_DETAIL.brickVariation > 0);
});

test('reviewed material survives building batch cloning and shares shader programs between source IDs', () => {
  const first = new THREE.MeshStandardMaterial({color: '#8a5549'});
  const second = new THREE.MeshStandardMaterial({color: '#825449'});
  installReviewedBrickDetail(first, {id: 'way/1002680800', quality: 'lite'});
  installReviewedBrickDetail(second, {id: 'way/1002815291', quality: 'lite'});
  assert.equal(first.customProgramCacheKey(), second.customProgramCacheKey());
  const clone = cloneCityMaterial(first);
  assert.equal(clone.customProgramCacheKey(), first.customProgramCacheKey());
  assert.equal(compile(clone).fragmentShader, compile(first).fragmentShader);
  assert.equal(clone.userData.cityMaterial.shaderDetailFallback, false);
  assert.equal(clone.color.getHexString(), '8a5549');
  assert.equal(installReviewedBrickDetail(first), false, 'does not stack detail hooks');
});

test('missing shader anchors preserve the undecorated base instead of corrupting a program', () => {
  const material = new THREE.MeshStandardMaterial({color: '#8a5549'});
  installReviewedBrickDetail(material);
  const shader = {vertexShader: 'void main() {}', fragmentShader: 'void main() {}'};
  material.onBeforeCompile(shader, {});
  assert.deepEqual(shader, {vertexShader: 'void main() {}', fragmentShader: 'void main() {}'});
  assert.equal(material.userData.cityMaterial.shaderDetailFallback, true);
  assert.equal(material.color.getHexString(), '8a5549');
});
