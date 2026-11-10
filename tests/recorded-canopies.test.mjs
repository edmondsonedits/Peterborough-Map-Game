import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECORDED_CANOPIES, buildRecordedCanopy } from '../city-explorer/recorded-canopies.js';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createFootageFacade, frontageFrame } from '../city-explorer/sherbrooke-footage.js';

const id = 'way/446339023', definition = RECORDED_CANOPIES[id];
const project = (lat, lon) => ({ x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), y: -(lat - 44.3091) * 110540 });
const source = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url))).elements.find(row => row.type === 'way' && `way/${row.id}` === id);
const ring = source.geometry.slice(0, -1).map(p => project(p.lat, p.lon));
const ground = (x, z) => 12.9 + (x + 911) * .03 + (z + 1091) * .01;
const build = options => buildRecordedCanopy({ sourceId: id, ring, project, groundHeightAt: ground, ...options });
const triangles = result => Object.values(result.surfaces).flatMap(surface => surface.positions);

test('reviewed canopy retains exact source footprint with flat top, underside and four inset supports', () => {
  assert.deepEqual(definition.sourceRingLonLat, source.geometry.slice(0, -1).map(p => [p.lon, p.lat]));
  const result = build(); assert.equal(result.valid, true, result.reason);
  assert.deepEqual(result.footprint, ring.map(p => ({ x: p.x, z: p.y })));
  assert.equal(result.posts.length, 4); assert.equal(result.surfaces.roof.positions.length, 18);
  assert.equal(result.surfaces.underside.positions.length, 18);
  assert.ok(result.triangleCount <= 64); assert.ok(triangles(result).every(Number.isFinite));
  assert.ok(result.surfaces.roof.positions.filter((_, i) => i % 3 === 1).every(y => y === result.roofTop));
  assert.ok(result.surfaces.underside.positions.filter((_, i) => i % 3 === 1).every(y => y === result.undersideY));
  assert.ok(Math.abs(result.roofTop - result.undersideY - .55) < 1e-9);
  assert.ok(result.posts.every(post => post.bottomHeights.every(h => result.undersideY - h >= 4.7 - 1e-9)));
});

test('source rotation and reversal do not move the photographed navy fascia onto a different edge', () => {
  const base = build();
  for (const transformed of [[...ring.slice(2), ...ring.slice(0, 2)], [...ring].reverse(), [...ring, ring[0]]]) {
    const result = build({ ring: transformed }); assert.equal(result.valid, true);
    assert.deepEqual(result.surfaces, base.surfaces);
  }
  const a = base.footprint[3], b = base.footprint[0], navy = base.surfaces.navy.positions;
  for (let i = 0; i < navy.length; i += 3) {
    const cross = (b.x - a.x) * (navy[i + 2] - a.z) - (b.z - a.z) * (navy[i] - a.x);
    assert.ok(Math.abs(cross) < 1e-6, 'navy fascia belongs only to southwest short source edge');
  }
});

test('the center aisle remains open below the slab and all new geometry remains within the roof outline', () => {
  const result = build(), group = new THREE.Group();
  for (const [family, surface] of Object.entries(result.surfaces)) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(surface.positions, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); mesh.name = family; group.add(mesh);
  }
  group.updateMatrixWorld(true);
  const middle = edge => ({ x: (result.footprint[edge].x + result.footprint[(edge + 1) % 4].x) / 2,
    z: (result.footprint[edge].z + result.footprint[(edge + 1) % 4].z) / 2 });
  const front = middle(3), back = middle(1), direction = new THREE.Vector3(back.x - front.x, 0, back.z - front.z).normalize();
  const ray = new THREE.Raycaster(new THREE.Vector3(front.x - direction.x, result.foundationTop + 2, front.z - direction.z), direction, 0, 16);
  assert.equal(ray.intersectObject(group, true).length, 0, 'no wall or post closes the middle driving aisle');
  const roofRay = new THREE.Raycaster(new THREE.Vector3((front.x + back.x) / 2, result.foundationTop + 2, (front.z + back.z) / 2), new THREE.Vector3(0, 1, 0));
  const hit = roofRay.intersectObject(group, true)[0]; assert.equal(hit.object.name, 'underside');
  for (let i = 0, data = triangles(result); i < data.length; i += 3) {
    const px = data[i], pz = data[i + 2];
    const signs = result.footprint.map((a, edge) => { const b = result.footprint[(edge + 1) % 4]; return (b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x); });
    assert.ok(signs.every(n => n <= 1e-6) || signs.every(n => n >= -1e-6), 'triangle remains within source roof outline');
  }
});

test('bad source/ground/support inputs return no partial canopy or sign', () => {
  const moved = ring.map((p, i) => ({ x: p.x + (i === 1 ? .25 : 0), y: p.y }));
  for (const options of [
    { sourceId: 'way/1' }, { ring: moved }, { holes: [ring] }, { groundHeightAt: () => NaN },
    { groundHeightAt: () => { throw new Error('pending'); } }, { groundHeightAt: (x, z) => ground(x, z) + (x > -911 ? 2 : 0) },
    { definition: { ...definition, supports: [{ u: 0, v: 0 }, ...definition.supports.slice(1)] } },
    { definition: { ...definition, supports: [definition.supports[0], ...definition.supports.slice(0, 3)] } },
    { maxTriangles: 5 },
  ]) {
    const result = build(options); assert.equal(result.valid, false, JSON.stringify(options));
    assert.equal(triangles(result).length, 0); assert.equal(result.posts.length, 0); assert.equal(result.signProfile, null);
  }
});

test('Lite uses the same essential canopy geometry and accepts numeric or verified ground records', () => {
  const full = build(), lite = build({ lite: true, groundHeightAt: (x, z) => ({ height: ground(x, z), layer: 'parking_surfaces', sourceId: '10/99' }) });
  assert.deepEqual(lite.surfaces, full.surfaces); assert.deepEqual(lite.posts, full.posts);
  assert.equal(lite.diagnostics.groundContactOwnedByCaller, true);
});

test('the sole verified sign is compatible with the frontage renderer without windows, doors or side-name duplicates', () => {
  const result = build(), originalDocument = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillRect() {}, fillText() {} }) }) };
  try {
    const profile = result.signProfile, group = createFootageFacade({ THREE, profile,
      ring: result.footprint, base: result.foundationTop, top: result.roofTop, project, lite: true });
    assert.equal(profile.signBusinessName, 'Ultramar'); assert.equal(profile.additionalFrontages, undefined);
    assert.equal(group.userData.renderedSigns.length, 1); assert.equal(group.userData.renderedSigns[0].name, 'Ultramar');
    const meshes = []; group.traverse(node => { if (node.isMesh) meshes.push(node); });
    assert.equal(meshes.length, 1); assert.equal(meshes[0].name, 'frontage-applied-sign');
    assert.ok(meshes[0].position.y > result.undersideY && meshes[0].position.y < result.roofTop);
    const frame = frontageFrame({ profile, ring: result.footprint, project });
    const bearing = (Math.atan2(frame.outward.x, -frame.outward.z) * 180 / Math.PI + 360) % 360;
    assert.ok(bearing > 234 && bearing < 235);
  } finally { globalThis.document = originalDocument; }
});
