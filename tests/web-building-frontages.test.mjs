import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {recordSherbrookeBuilding} from '../city-explorer/sherbrooke-plan.js';
import {createGeneratedRegistry} from '../city-explorer/editor/generated-registry.js';

const osm = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url)));
const project = (lat, lon) => new THREE.Vector2((lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), -(lat - 44.3091) * 110540);
const ids = ['way/1005977973', 'way/1006243570'];
const geometry = id => {
  const way = osm.elements.find(e => e.type === 'way' && `way/${e.id}` === id);
  assert.ok(way?.geometry, `mapped footprint exists for ${id}`);
  return way.geometry;
};
const ring = id => geometry(id).slice(0, -1).map(point => {
  const p = project(point.lat, point.lon);
  return {x: p.x, z: p.y};
});
const distanceToSegment = (point, a, b) => {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
};
const nearestRoad = wayId => {
  const way = osm.elements.find(e => e.type === 'way' && e.id === wayId);
  assert.equal(way?.tags?.name, 'George Street North');
  return way.geometry.map(point => {
    const p = project(point.lat, point.lon);
    return {x: p.x, z: p.y};
  });
};
const render = id => {
  const profile = FOOTAGE_PROFILES[id], base = 0;
  return createFootageFacade({THREE, profile, ring: ring(id), base, top: base + profile.height, project});
};
const instanceY = mesh => {
  const matrix = new THREE.Matrix4(), result = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    result.push(matrix.elements[13]);
  }
  return result;
};
const highestInstance = group => {
  let highest = -Infinity;
  group.traverse(object => {
    if (!object.isInstancedMesh) return;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix);
      highest = Math.max(highest, matrix.elements[13] + Math.abs(matrix.elements[5]) / 2);
    }
  });
  return highest;
};

test('Pappas and Cork profiles attach to their own mapped footprints and face George Street', () => {
  for (const id of ids) {
    const profile = FOOTAGE_PROFILES[id];
    assert.ok(profile, `profile exists for ${id}`);
    const points = ring(id), frontage = frontageFrame({profile, ring: points, project});
    for (const end of [frontage.start, frontage.end]) {
      assert.ok(Math.min(...points.map((a, i) => distanceToSegment(end, a, points[(i + 1) % points.length]))) < .05,
        `${id} frontage endpoint stays on its mapped footprint`);
    }
    const roads = nearestRoad(id === ids[0] ? 50875909 : 497947679);
    const mid = frontage.midpoint;
    const nearest = roads.slice(1).map((b, i) => {
      const a = roads[i], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((mid.x - a.x) * dx + (mid.z - a.z) * dz) / (dx * dx + dz * dz)));
      return {x: a.x + t * dx, z: a.z + t * dz};
    }).sort((a, b) => Math.hypot(a.x - mid.x, a.z - mid.z) - Math.hypot(b.x - mid.x, b.z - mid.z))[0];
    const towardStreet = {x: nearest.x - mid.x, z: nearest.z - mid.z};
    assert.ok((frontage.outward.x * towardStreet.x + frontage.outward.z * towardStreet.z) /
      Math.hypot(towardStreet.x, towardStreet.z) > .5, `${id} facade normal faces George Street North`);
  }
  assert.equal(FOOTAGE_PROFILES[ids[0]].name, 'Pappas Building');
  assert.equal(FOOTAGE_PROFILES[ids[1]].name, 'Cork & Bean');
});

test('Pappas renders six upper windows per floor while Cork stays within its cropped storefront band', () => {
  const pappas = render(ids[0]), cork = render(ids[1]);
  const upperGlass = pappas.getObjectByName('frontage-glass');
  assert.equal(upperGlass.count, 13, 'one broad ground pane plus twelve upper windows');
  const windowY = instanceY(upperGlass);
  assert.equal(windowY.filter(y => y > 3.9 && y < 7.8).length, 6, 'six windows on the middle storey');
  assert.equal(windowY.filter(y => y > 7.8).length, 6, 'six windows on the top storey');
  const corkGlass = cork.getObjectByName('frontage-glass');
  assert.equal(corkGlass.count, 5, 'narrow storefront divisions include a separate right entry pane');
  assert.ok(highestInstance(cork) < FOOTAGE_PROFILES[ids[1]].detailHeightMetres,
    'all generated facade geometry stays below the crop limit');
  assert.equal(pappas.userData.photoStatus, 'not-needed');
  assert.equal(cork.userData.photoStatus, 'not-needed');
  for (const id of ids) {
    const profile = FOOTAGE_PROFILES[id];
    assert.ok(!profile.facadePhoto && !profile.texturePatch, 'source photo is not a runtime texture');
  }
  assert.equal(Object.values(FOOTAGE_PROFILES).filter(profile => profile.facadePhoto).length, 6,
    'the two reference-only profiles do not change the six existing facade-photo assets');
});

test('new facades produce finite geometry and remain controlled by the shared building editor', () => {
  for (const id of ids) {
    const profile = FOOTAGE_PROFILES[id], base = 100;
    const group = createFootageFacade({THREE, profile, ring: ring(id), base, top: base + profile.height, project});
    assert.equal(group.userData.profileId, id);
    assert.equal(group.userData.photoStatus, 'not-needed');
    group.traverse(object => {
      if (object.isInstancedMesh) assert.ok([...object.instanceMatrix.array].every(Number.isFinite));
      if (object.isMesh) assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
    });
    recordSherbrookeBuilding(id, ring(id).map(p => ({x: p.x, y: p.z})), base, base + profile.height);
    const registry = createGeneratedRegistry(THREE);
    const key = registry.registerEditableObject(new THREE.Object3D(), {
      sourceType: 'building', sourceId: id,
      batchBinding: {setVisible() {}, restore() {}, cloneGeometry: () => new THREE.Group()}
    });
    assert.equal(registry.attachEditableGroup(key, group), true);
    registry.hide(key);
    assert.equal(group.visible, false);
    registry.restore(key);
    assert.equal(group.visible, true);
  }
});
