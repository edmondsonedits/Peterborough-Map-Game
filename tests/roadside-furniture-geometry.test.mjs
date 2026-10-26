import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createRoadsideFurnitureMeshes } from '../city-explorer/roadside-furniture-geometry.js';

const material = (color = 0x808080) => new THREE.MeshStandardMaterial({ color });
const materials = {
  lightPole: material(0x495354),
  lampLens: new THREE.MeshStandardMaterial({ color: 0xffe7ad, emissive: 0xffc75c, emissiveIntensity: 0.12 }),
  signalHousing: material(0x1b2020),
  signalRed: new THREE.MeshStandardMaterial({ color: 0xdf4f40, emissive: 0x45100c, emissiveIntensity: 0.6 }),
  signalGreen: new THREE.MeshStandardMaterial({ color: 0x4eb77a, emissive: 0x0d321c, emissiveIntensity: 0.42 }),
};
const make = (overrides = {}) => createRoadsideFurnitureMeshes({
  THREE,
  lamps: [{ x: 0, z: 0, baseY: 12, armDirection: { x: 1, z: 0 }, armLength: 2, poleHeight: 7.4, sourceId: 'lamp/1' }],
  signals: [{ x: 10, z: 0, baseY: 14, armDirection: { x: 0, z: 1 }, armLength: 5, poleHeight: 8, facingDirection: { x: 1, z: 0 }, sourceId: 'signal/1' }],
  materials,
  ...overrides,
});
const instancePosition = (mesh, index) => {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
};

test('builds grounded poles and cantilever arms that reach over the road', () => {
  const result = make();
  assert.ok(result.meshes.length <= 10);
  const lampParts = result.lampParts(0);
  const signalParts = result.signalParts(0);
  assert.equal(lampParts.length, 3);
  assert.equal(signalParts.length, 7, 'pole, arm, housing, and three dark lenses are editor-addressable');
  for (const { object } of [...lampParts, ...signalParts]) {
    assert.equal(object.userData.decorative, true);
    assert.equal(object.userData.collision, false);
    assert.ok(object.boundingSphere?.radius > 0, `${object.userData.type} has a culling sphere`);
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    assert.ok(Number.isFinite(bounds.min.x) && Number.isFinite(bounds.max.y));
  }
  const lampPole = lampParts.find((part) => part.object.userData.type === 'street-lamp-poles');
  const lampArm = lampParts.find((part) => part.object.userData.type === 'street-lamp-arms');
  const lampHead = lampParts.find((part) => part.object.userData.type === 'street-lamp-heads');
  assert.ok(Math.abs(instancePosition(lampPole.object, lampPole.instanceIndex).y - (12 + 7.4 / 2)) < 1e-6);
  assert.ok(instancePosition(lampArm.object, lampArm.instanceIndex).x > 0.9);
  const lampArmBox = new THREE.Box3().setFromObject(lampArm.object);
  assert.ok(lampArmBox.min.x <= 0.1 && lampArmBox.max.x >= 1.9, 'lamp arm spans from the pole to the fixture');
  assert.ok(instancePosition(lampHead.object, lampHead.instanceIndex).x > 1.9);
  const signalArm = signalParts.find((part) => part.object.userData.type === 'traffic-signal-arms');
  const signalHead = signalParts.find((part) => part.object.userData.type === 'traffic-signal-heads');
  assert.ok(instancePosition(signalArm.object, signalArm.instanceIndex).z > 2);
  const signalArmBox = new THREE.Box3().setFromObject(signalArm.object);
  assert.ok(signalArmBox.min.z <= 0.1 && signalArmBox.max.z >= 4.9, 'signal mast arm reaches from pole to hanging head');
  assert.ok(instancePosition(signalHead.object, signalHead.instanceIndex).z > 4.9);
  const headBox = new THREE.Box3().setFromObject(signalHead.object);
  assert.ok(headBox.min.y >= 14 + 5.3, 'signal head bottom clears the road by 5.3 m');
});

test('orients signal lenses toward approaching traffic and uses no dynamic lights', () => {
  const result = make();
  const lenses = result.signalParts(0).filter((part) => part.object.userData.type === 'traffic-signal-lenses');
  assert.equal(lenses.length, 3);
  assert.deepEqual(new Set(lenses.map(({ object }) => object.userData.lensColor)), new Set(['red', 'amber', 'green']));
  for (const { object } of lenses) {
    assert.equal(object.material.emissive.getHex(), 0);
    assert.equal(object.material.emissiveIntensity, 0);
    assert.equal(object.instanceMatrix.count, 1);
    const matrix = new THREE.Matrix4();
    object.getMatrixAt(0, matrix);
    const faceNormal = new THREE.Vector3(0, 0, 1).transformDirection(matrix);
    assert.ok(faceNormal.x > 0.999 && Math.abs(faceNormal.z) < 1e-6, 'lens faces the specified approaching-traffic direction');
  }
  assert.equal(result.meshes.some((mesh) => mesh.isPointLight || mesh.isSpotLight), false);
  assert.ok(materials.signalRed.emissiveIntensity > 0, 'provided materials remain untouched');
});

test('normalizes directions, keeps all transforms finite, and handles empty inputs', () => {
  const result = make({
    lamps: [{ x: -3, z: 1, baseY: 4, armDirection: { x: 3, z: 0 }, armLength: 1.5, poleHeight: 7.4 }],
    signals: [{ x: 2, z: -1, baseY: 2, armDirection: { x: 0, z: -4 }, armLength: 4, poleHeight: 8, facingDirection: { x: 0, z: -2 } }],
  });
  assert.ok(result.meshes.every((mesh) => Number.isFinite(mesh.boundingSphere.radius)));
  for (const mesh of result.meshes) assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
  const empty = createRoadsideFurnitureMeshes({ THREE, lamps: [], signals: [], materials });
  assert.deepEqual(empty.meshes, []);
  assert.deepEqual(empty.lampParts(0), []);
  assert.deepEqual(empty.signalParts(0), []);
});
