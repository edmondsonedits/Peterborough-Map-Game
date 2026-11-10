import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createRecordedEnclosedBays } from '../city-explorer/recorded-enclosed-bays.js';

const frame = { start: { x: 10, z: 20 }, tangent: { x: 1, z: 0 }, outward: { x: 0, z: 1 }, length: 8.4 };
const spec = { fraction: .78, widthMetres: 2.25, bottomMetres: 3.15, heightMetres: 2.55,
  depthMetres: .55, frontWidthFraction: .58, baseHeightMetres: .42, capHeightMetres: .12,
  wallColor: '#d4c9ae', trimColor: '#a68d66', glassColor: '#687976' };
const build = (overrides = {}) => createRecordedEnclosedBays({ THREE, frame, base: 100, height: 9.4,
  specs: [spec, { ...spec, bottomMetres: 6.25 }], ...overrides });
const vertices = group => group.children.flatMap(mesh => [...mesh.geometry.attributes.position.array]);

test('two stacked enclosed bays share three surface batches and have no balcony components', () => {
  const group = build();
  assert.equal(group.userData.enclosedBays.length, 2);
  assert.equal(group.userData.rejectedCount, 0);
  assert.equal(group.children.length, 3);
  assert.deepEqual(group.children.map(mesh => mesh.name), ['recorded-enclosed-bay-wall', 'recorded-enclosed-bay-trim', 'recorded-enclosed-bay-glass']);
  assert.equal(group.userData.collision, false);
  assert.ok(group.userData.enclosedBays.every(bay => bay.faceCount === 3));
  const glass = group.children.find(mesh => mesh.name.endsWith('-glass'));
  assert.equal(glass.geometry.attributes.position.count, 2 * 3 * 6, 'one rectangular pane per outward face and tier');
  assert.ok(group.children.every(mesh => !/rail|post|balcony|platform/.test(mesh.name)));
});

test('all geometry stays within the reviewed frontage and facade height with bounded outward projection', () => {
  for (const reflected of [false, true]) {
    const f = reflected ? { start: { x: -18, z: 27 }, tangent: { x: 0, z: -1 }, outward: { x: -1, z: 0 }, length: 8.4 } : frame;
    const group = build({ frame: f }), data = vertices(group);
    assert.ok(data.every(Number.isFinite));
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i] - f.start.x, z = data[i + 2] - f.start.z;
      const along = x * f.tangent.x + z * f.tangent.z, out = x * f.outward.x + z * f.outward.z;
      assert.ok(along >= 0 && along <= f.length, `frontage coordinate ${along}`);
      assert.ok(out >= .03 && out <= .56, `outward coordinate ${out}`);
      assert.ok(data[i + 1] >= 100 && data[i + 1] <= 109.4);
    }
  }
});

test('the center and angled cheek panes face out on either source winding', () => {
  for (const outward of [{ x: 0, z: 1 }, { x: 0, z: -1 }]) {
    const group = build({ frame: { ...frame, outward } });
    const glass = group.children.find(mesh => mesh.name.endsWith('-glass'));
    const normals = glass.geometry.attributes.normal.array;
    const unique = new Set();
    for (let i = 0; i < normals.length; i += 3) {
      assert.ok(normals[i] * outward.x + normals[i + 2] * outward.z > .1, 'glass normal points away from the wall');
      assert.ok(Math.abs(normals[i + 1]) < .0001);
      unique.add(`${normals[i].toFixed(3)},${normals[i + 2].toFixed(3)}`);
    }
    assert.equal(unique.size, 3, 'center plus two angled cheek normals');
  }
});

test('oversized estimates are clamped and malformed or excessive bays are withheld', () => {
  const group = build({ specs: [
    { ...spec, fraction: 1, widthMetres: 20, depthMetres: 20, bottomMetres: 8, heightMetres: 15 },
    { ...spec, fraction: NaN },
    { ...spec, bottomMetres: 9.3 },
    spec,
    spec,
  ] });
  assert.equal(group.userData.enclosedBays.length, 2);
  assert.equal(group.userData.rejectedCount, 3);
  const normalized = group.userData.enclosedBays[0];
  assert.equal(normalized.widthMetres, 4);
  assert.equal(normalized.depthMetres, 1.2);
  assert.ok(normalized.bottomMetres + normalized.heightMetres <= 9.4);
  assert.ok(vertices(group).every(Number.isFinite));
  assert.equal(build({ frame: { ...frame, outward: { x: 1, z: 0 } } }).children.length, 0);
  assert.equal(build({ base: Infinity }).children.length, 0);
});

test('Lite retains the enclosed silhouette and windows without environment maps or shadow draws', () => {
  const environment = new THREE.Texture(), full = build({ glassEnvironment: environment }), lite = build({ lite: true, glassEnvironment: environment });
  assert.deepEqual(vertices(lite), vertices(full));
  assert.ok(lite.children.every(mesh => mesh.castShadow === false));
  assert.equal(full.children.find(mesh => mesh.name.endsWith('-glass')).material.envMap, environment);
  assert.equal(lite.children.find(mesh => mesh.name.endsWith('-glass')).material.envMap, null);
  assert.ok(lite.children.every(mesh => mesh.material.map === null));
});

test('only an explicit matching stacked bay fills the projected inter-floor spandrel', () => {
  const ray = new THREE.Raycaster(new THREE.Vector3(frame.start.x + frame.length * spec.fraction, 106, 23), new THREE.Vector3(0, 0, -1));
  const disconnected = build(); disconnected.updateMatrixWorld(true);
  assert.equal(ray.intersectObject(disconnected, true).length, 0, 'no inferred link without opt-in');
  const joined = build({ specs: [{ ...spec, joinToNext: true }, { ...spec, bottomMetres: 6.25 }] });
  joined.updateMatrixWorld(true);
  assert.equal(joined.userData.enclosedBayJoins.length, 1);
  assert.equal(joined.children.length, 3, 'spandrel shares the existing wall batch');
  const hit = ray.intersectObject(joined, true)[0];
  assert.equal(hit.object.name, 'recorded-enclosed-bay-wall');
  assert.ok(Math.abs(hit.point.z - (frame.start.z + spec.depthMetres)) < .00001);
  for (const changed of [{ fraction: .4 }, { widthMetres: 2.5 }, { depthMetres: .6 }, { frontWidthFraction: .7 }, { bottomMetres: 7.5 }]) {
    const unmatched = build({ specs: [{ ...spec, joinToNext: true }, { ...spec, bottomMetres: 6.25, ...changed }] });
    assert.equal(unmatched.userData.enclosedBayJoins.length, 0, `no unsupported connection for ${JSON.stringify(changed)}`);
  }
});
