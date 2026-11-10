import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { createFootageFacade, frontageFrame } from '../city-explorer/sherbrooke-footage.js';
import { FOOTAGE_PROFILES } from '../city-explorer/sherbrooke-footage-profiles.js';

const fixtureRing = [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 8 }, { x: 0, z: 8 }];
const project = (lat, lon) => ({ x: lon, z: lat });
const fixture = { id: 'test', label: 'test', confidence: 'observed', style: 'house', levels: 2, windowColumns: 3,
  porch: false, frontLatLon: [{ lat: 0, lon: 0 }, { lat: 0, lon: 12 }] };
const make = (profile = fixture, options = {}) => createFootageFacade({ THREE, profile, ring: fixtureRing, base: 0, top: 6, project, ...options });
function instances(group, name) {
  const mesh = group.getObjectByName(name); if (!mesh) return [];
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3();
  return Array.from({ length: mesh.count }, (_, i) => { mesh.getMatrixAt(i, matrix); matrix.decompose(position, new THREE.Quaternion(), scale);
    return { x: position.x, y: position.y, z: position.z, width: scale.x, height: scale.y, depth: scale.z }; });
}

test('actual S10 fallback has no inferred central window sill crossing the existing door', () => {
  const profile = FOOTAGE_PROFILES['way/1006575702'];
  const way = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url))).elements.find(row => row.type === 'way' && row.id === 1006575702);
  const projectReal = (lat, lon) => ({ x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540 });
  const ring = way.geometry.slice(0, -1).map(p => projectReal(p.lat, p.lon)), frame = frontageFrame({ profile, ring, project: projectReal });
  const group = make(profile, { ring, project: projectReal, top: profile.eaveHeight + profile.roofRise, lite: true });
  const doors = instances(group, 'frontage-door'); assert.equal(doors.length, 1);
  assert.equal(instances(group, 'frontage-glass').length, 5, 'two ground sash plus the three upper sash remain');
  const door = doors[0];
  for (const sill of instances(group, 'frontage-accent')) {
    const horizontal = Math.abs((sill.x - door.x) * frame.tangent.x + (sill.z - door.z) * frame.tangent.z) < (sill.width + door.width) / 2;
    const vertical = Math.abs(sill.y - door.y) < (sill.height + door.height) / 2;
    assert.equal(horizontal && vertical, false, 'no inferred sill crosses the door rectangle');
  }
});

test('implicit-door exclusion follows actual overlap rather than deleting a neighboring window bay', () => {
  const centered = make(), offset = make({ ...fixture, doorFraction: 1 / 6 });
  assert.equal(instances(centered, 'frontage-glass').filter(item => item.y < 3).length, 2);
  assert.equal(instances(offset, 'frontage-glass').filter(item => item.y < 3).length, 2);
  assert.ok(instances(offset, 'frontage-glass').filter(item => item.y < 3).every(item => Math.abs(item.x - 2) > .1));
  const between = make({ ...fixture, windowColumns: 4 });
  assert.equal(instances(between, 'frontage-glass').filter(item => item.y < 3).length, 4, 'door between separated windows does not delete either');
  const office = make({ ...fixture, style: 'office' });
  assert.equal(instances(office, 'frontage-glass').filter(item => item.y < 3).length, 2);
});

test('explicit authored windows and suppressed doors retain their authored behavior', () => {
  const noDoor = make({ ...fixture, entryDoor: null });
  assert.equal(instances(noDoor, 'frontage-glass').length, 6); assert.equal(instances(noDoor, 'frontage-door').length, 0);
  const authored = make({ ...fixture, windowOverrides: [{ level: 0, column: 1, widthMetres: .55, heightMetres: .4, bottomMetres: 2.3 }] });
  assert.equal(instances(authored, 'frontage-glass').length, 6, 'an explicit transom above the door remains');
  const custom = make({ ...fixture, skipGroundWindows: true, groundWindows: [{ t: .5, width: .55, height: .4, bottom: 2.3 }] });
  assert.equal(instances(custom, 'frontage-glass').length, 4, 'explicit ground window records are untouched');
});

test('Balanced may retain low-power geometry caps while loading both reviewed facade photographs', async () => {
  const loads = [];
  class Loader { load(url, onLoad, _progress, onError) { loads.push({ url, onLoad, onError }); } }
  const profile = { ...fixture, style: 'retail', windowColumns: 20, facadePhoto: { file: 'primary.jpg' },
    additionalFrontages: [{ frontLatLon: [{ lat: 0, lon: 12 }, { lat: 8, lon: 12 }], facadePhoto: { file: 'secondary.jpg' } }] };
  const group = make(profile, { THREE: { ...THREE, TextureLoader: Loader }, lite: true, optionalAssets: true });
  assert.equal(loads.length, 2, 'optional asset policy propagates to each reviewed face');
  for (const face of group.children) assert.equal(instances(face, 'frontage-glass').length, 16, '8-column low-power geometry cap retained');
  for (const load of loads) load.onLoad(new THREE.Texture());
  assert.equal(await group.userData.photoReady, 'loaded');
  for (const face of group.children) {
    assert.ok(face.getObjectByName('reviewed-facade-photo'));
    assert.equal(face.getObjectByName('frontage-procedural-details').visible, false, 'loaded photo replaces its procedural fallback');
  }
});

test('explicitly disabled optional assets make no downloads or garden calls independently of geometry quality', () => {
  for (const lite of [false, true]) {
    class Loader { load() { assert.fail('omitted optional photograph must not download'); } }
    const profile = { ...fixture, style: 'retail', facadePhoto: { file: 'primary.jpg' }, frontGarden: { depthMetres: 3 },
      additionalFrontages: [{ frontLatLon: [{ lat: 0, lon: 12 }, { lat: 8, lon: 12 }], facadePhoto: { file: 'secondary.jpg' } }] };
    const group = make(profile, { THREE: { ...THREE, TextureLoader: Loader }, lite, optionalAssets: false,
      terrainHeightAtWorld: () => assert.fail('omitted garden must not sample ground'), gardenClear: () => assert.fail('omitted garden must not query clearance') });
    assert.equal(group.userData.photoStatus, 'not-needed');
    assert.equal(group.getObjectByName('reviewed-facade-photo'), undefined);
  }
});
