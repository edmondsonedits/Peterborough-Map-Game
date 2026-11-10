import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {applyRecordingAppearance, recordingReferencesEnabled} from '../city-explorer/recording-appearance.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {emergencyFacilityEntries} from '../city-explorer/emergency-facilities-catalog.js';

const expected = ['way/1006243552', 'way/1006243558', 'way/1006243559', 'way/1006243553', 'way/1006243555', 'way/1006243541', 'way/1031042883'];
const cream = ['way/1006243558', 'way/1006243559'];
const project = (lat, lon) => ({x: (lon + 78.3197) * 111320 * Math.cos(44.3091 * Math.PI / 180), z: -(lat - 44.3091) * 110540});
const osm = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(osm.elements.filter(row => row.type === 'way').map(row => ['way/' + row.id, row]));
const app = await readFile(new URL('../city-explorer/app.js', import.meta.url), 'utf8');
const dimensionBody = app.match(/function buildingDimensions\([^]*?\n}\n/)[0];
const base = Object.fromEntries(Object.entries(FOOTAGE_PROFILES).map(([id, profile]) => [id, applyRecordingAppearance(profile)]));

async function registry() {
  const module = await import('../city-explorer/route-water-appearances.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  });
  assert.ok(module, 'the seven evidence-ready Water/Hunter appearance deltas are available');
  return module.ROUTE_WATER_APPEARANCES;
}

async function profiles() { await registry(); return addRouteLandmarkAppearances(base); }
function render(id, profile, options = {}) {
  const dimensionsFor = new Function('FOOTAGE_PROFILES', 'REVIEWED_BUILDING_STYLES', 'mappedBuildingDimensions', 'LANDMARK_BUILDING_HEIGHT_OVERRIDES', dimensionBody + ';return buildingDimensions;')({[id]: profile}, {}, mappedBuildingDimensions, {});
  const dimensions = dimensionsFor(ways.get(id).tags, id), ring = ways.get(id).geometry.slice(0, -1).map(({lat, lon}) => project(lat, lon));
  const top = 100 + dimensions.height + (profile.appearanceOnly ? 0 : dimensions.roofHeight);
  const group = createFootageFacade({THREE, profile, ring, base: 100, top, project, ...options});
  return {group, dimensions, ring};
}
function instances(group, name, frame) {
  const result = [], matrix = new THREE.Matrix4();
  group.traverse(mesh => {
    if (!mesh.isInstancedMesh || mesh.name !== name) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, matrix);
      const position = new THREE.Vector3(), scale = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), scale);
      const x = frame ? (position.x - frame.start.x) * frame.tangent.x + (position.z - frame.start.z) * frame.tangent.z : position.x;
      result.push({position, scale, left: x - scale.x / 2, right: x + scale.x / 2, bottom: position.y - 100 - scale.y / 2, top: position.y - 100 + scale.y / 2});
    }
  });
  return result;
}
function separate(a, b) { return a.right <= b.left + .01 || b.right <= a.left + .01 || a.top <= b.bottom + .01 || b.top <= a.bottom + .01; }
function faces(profile) {
  const {additionalFrontages, ...primary} = profile;
  return [primary, ...(additionalFrontages || []).map(face => ({...primary, ...face, facadePhoto: face.facadePhoto, additionalFrontages: undefined}))];
}

test('Water overlays preserve all seven existing source masses and remain disabled with the shared reference opt-out', async () => {
  const records = await registry(), snapshot = structuredClone(base), active = await profiles();
  assert.deepEqual(Object.keys(records).sort(), [...expected].sort());
  assert.equal(addRouteLandmarkAppearances(base, false), base);
  assert.equal(recordingReferencesEnabled(''), true); assert.equal(recordingReferencesEnabled('?visuals=legacy'), false);
  assert.equal(recordingReferencesEnabled('?recordingReferences=off'), false);
  assert.deepEqual(base, snapshot);
  for (const id of expected) {
    assert.equal(active[id].reviewedWallMaterial, true, `${id} is composed into the active route`);
    for (const field of ['id', 'height', 'eaveHeight', 'roof', 'roofRise', 'roofColor', 'frontLatLon', 'massing', 'preserveMappedMassing', 'reference']) assert.deepEqual(active[id][field], base[id][field], `${id} preserves ${field}`);
  }
  for (const id of ['way/1006243563', 'way/458496269']) assert.equal(records[id], undefined, `${id} remains in the separate corner review`);
});

test('Water faces and camera positions use actual adjacent source geometry without an authored GLB owner', async () => {
  const records = await registry(), active = await profiles(), owned = new Set(emergencyFacilityEntries().flatMap(entry => entry.sourceIds));
  for (const id of expected) {
    assert.equal(owned.has(id), false);
    const coords = ways.get(id).geometry.slice(0, -1), ring = coords.map(({lat, lon}) => project(lat, lon));
    for (const [index, face] of faces(active[id]).entries()) {
      const indices = face.frontLatLon.map(end => coords.findIndex(point => point.lat === end.lat && point.lon === end.lon));
      assert.ok(indices.every(n => n >= 0)); assert.ok(Math.abs(indices[0] - indices[1]) === 1 || Math.abs(indices[0] - indices[1]) === coords.length - 1, `${id}/${index} exact adjacent vertices`);
      const frame = frontageFrame({profile: face, ring, project});
      assert.ok(id === 'way/1006243541' || id === 'way/1006243555' && index === 0 ? frame.outward.z < -.9 : id === 'way/1031042883' && index >= 2 ? frame.outward.z > .9 : cream.includes(id) ? frame.outward.x > .9 : frame.outward.x < -.9, `${id}/${index} observed street-facing direction`);
    }
    assert.ok(records[id].observation && records[id].estimated && records[id].photoIds.length);
    for (const camera of [records[id].camera, ...(records[id].additionalCameras || [])]) {
      const road = ways.get(camera.roadId), p = project(camera.lat, camera.lon);
      assert.ok(road?.tags.highway, `${id} camera road exists`);
      const distances = road.geometry.slice(1).map((coord, i) => {
        const a = project(road.geometry[i].lat, road.geometry[i].lon), b = project(coord.lat, coord.lon), dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
        return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
      });
      assert.ok(Math.min(...distances) < .08, `${id} cab review coordinate lies on the current road centerline`);
    }
  }
});

test('Water openings and panels fit the actual active source heights without clipping or overlapping', async () => {
  const active = await profiles();
  for (const id of expected) for (const face of faces(active[id])) for (const lite of [false, true]) {
    const {group, dimensions, ring} = render(id, face, {lite}), frame = frontageFrame({profile: face, ring, project});
    assert.equal(group.userData.collision, false);
    group.traverse(node => {
      if (node.isInstancedMesh) assert.ok([...node.instanceMatrix.array].every(Number.isFinite), `${id} finite transforms`);
      if (node.geometry) assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite), `${id} finite vertices`);
    });
    group.updateMatrixWorld(true); const bounds = new THREE.Box3().setFromObject(group);
    assert.ok(bounds.min.y >= 99.99 && bounds.max.y <= 100 + dimensions.height + .01, `${id} details fit active ${dimensions.height} m wall`);
    for (const panel of face.facadePanels || []) {
      assert.ok(instances(group, `frontage-${panel.color}`, frame).some(box => Math.abs(box.bottom - panel.bottomMetres) < .01 && Math.abs(box.scale.y - panel.heightMetres) < .01), `${id} ${panel.color} panel does not collapse at the wall top`);
    }
    const glass = [...instances(group, 'frontage-glass', frame), ...instances(group, 'frontage-upper-arched-glass', frame)];
    for (let i = 0; i < glass.length; i++) {
      assert.ok(glass[i].left >= -.01 && glass[i].right <= frame.length + .01, `${id} opening stays on facade`);
      for (let j = i + 1; j < glass.length; j++) assert.ok(separate(glass[i], glass[j]), `${id} separate opening ${i}/${j}`);
    }
    if (face.signText) {
      const sign = {left: face.signFraction * frame.length - face.signWidthMetres / 2, right: face.signFraction * frame.length + face.signWidthMetres / 2, bottom: face.signHeightMetres - face.signBoardHeightMetres / 2, top: face.signHeightMetres + face.signBoardHeightMetres / 2};
      for (const window of glass) assert.ok(separate(sign, window), `${id} sign does not obscure an opening`);
    }
  }
});

test('lime shop keeps six upper sash and its full lime ground surround beside two different shops', async () => {
  const profile = (await profiles())['way/1006243552'], {group, ring} = render(profile.id, profile), frame = frontageFrame({profile, ring, project});
  const glass = instances(group, 'frontage-glass', frame);
  assert.equal(glass.filter(window => window.bottom > 4).length, 6);
  assert.equal(glass.filter(window => window.top < 3).length, 4, 'three different storefront glass fields and one lime-shop door');
  const lime = instances(group, 'frontage-#a5b72c', frame).filter(box => box.scale.x > 2);
  assert.equal(lime.length, 1); assert.ok(lime[0].scale.y >= 2.7 && lime[0].bottom < .2, 'lime color surrounds the complete lower shop');
  assert.ok(lime[0].left / frame.length > .34 && lime[0].right / frame.length < .74);
  assert.equal(instances(group, 'frontage-#315a79', frame).length, 1, 'blue fascia remains separate');
  assert.equal(profile.signText, null, 'no uncertain shop wordmark is invented');
});

test('both cream Water buildings have flat sash and closed projecting bays instead of open balconies', async () => {
  const active = await profiles();
  for (const id of cream) {
    const profile = active[id], {group, ring} = render(id, profile), frame = frontageFrame({profile, ring, project});
    assert.deepEqual(profile.balconyLevels, []); assert.equal(profile.wallSurface, 'render');
    const flat = instances(group, 'frontage-glass', frame).filter(window => window.bottom > 3);
    assert.equal(flat.length, 4, `${id} has two flat sash columns on two upper floors`);
    assert.ok(flat.every(window => window.right / frame.length < .45));
    const bays = group.getObjectByName('recorded-enclosed-bays');
    assert.ok(bays, `${id} projects the observed enclosed bays`);
    assert.equal(bays.userData.collision, false); assert.equal(bays.userData.enclosedBays.length, 2);
    assert.ok(bays.userData.enclosedBays.every(bay => bay.fraction > .65 && bay.depthMetres > .3 && bay.depthMetres < 1));
    assert.ok(bays.getObjectByName('recorded-enclosed-bay-glass'), 'bay faces have enclosed glazing');
    assert.ok(profile.enclosedBays[0].joinToNext, 'the projected cream spandrel connects both tiers');
  }
});

test('the east Water brick block has six top arches and six middle sash without six guessed shop entrances', async () => {
  const profile = (await profiles())['way/1006243553'], {group} = render(profile.id, profile);
  assert.equal(instances(group, 'frontage-upper-arched-glass').length, 6);
  const flat = instances(group, 'frontage-glass');
  assert.equal(flat.filter(window => window.bottom > 3.5).length, 6);
  assert.equal(flat.filter(window => window.top < 3).length, 3);
  assert.equal(profile.entryDoor, null); assert.equal(profile.signText, null, 'glass lettering is not replaced by an opaque plaque');
});

test('Scotiabank red tower and white applied name stay on the Water return at opposite ends', async () => {
  const profile = (await profiles())['way/1006243555'];
  const original = globalThis.document, canvasCalls = [];
  globalThis.document = {createElement: () => ({width: 0, height: 0, getContext: () => ({fillRect() {canvasCalls.push('background');}, fillText(text) {canvasCalls.push(text);}})})};
  try {
    const {group, ring} = render(profile.id, profile);
    assert.equal(group.userData.frontageCount, 2);
    const hunter = group.children[0], water = group.children[1], face = faces(profile)[1], frame = frontageFrame({profile: face, ring, project});
    assert.equal(instances(hunter, 'frontage-#bc2634').length, 0, 'no red tower copied to Hunter');
    const tower = instances(water, 'frontage-#bc2634', frame);
    assert.equal(tower.length, 1); assert.ok(tower[0].left / frame.length > .8 && tower[0].scale.y > 6.8, 'red tower at south/right end');
    const upper = instances(water, 'frontage-glass', frame).filter(window => window.bottom > 4);
    assert.equal(upper.filter(window => window.scale.x > 2).length, 6, 'six broad upper groups observed across R235/R236');
    assert.equal(upper.filter(window => window.scale.x < 1).length, 1, 'one narrow terminal field before the tower');
    const text = water.getObjectByName('frontage-applied-sign');
    assert.ok(text); assert.equal(text.material.transparent, true);
    assert.deepEqual(canvasCalls, ['Scotiabank'], 'only white letters are drawn with no opaque canvas background');
    assert.equal(face.signTextColor, '#f3f1e8'); assert.ok(face.signFraction < .4);
    assert.equal(hunter.getObjectByName('frontage-applied-sign'), undefined);
  } finally { globalThis.document = original; }
});

test('Nordia wraps only the two southwest short faces in blue while both main faces retain five visible tiers', async () => {
  const profile = (await profiles())['way/1031042883'], {group, dimensions} = render(profile.id, profile);
  assert.equal(dimensions.height, 20, 'actual shipped source wall');
  assert.equal(group.userData.frontageCount, 4); assert.equal(group.children.length, 4);
  assert.equal(profile.verticalGlazing, null, 'false north-end blue bay is cleared');
  for (const index of [0, 3]) {
    const face = faces(profile)[index], glass = instances(group.children[index], 'frontage-glass');
    assert.equal(glass.length, 5, 'ground lobby, broad first upper and three narrow upper ribbons');
    assert.equal(glass.filter(window => window.scale.y < 1).length, 3);
    assert.ok(face.glazedLevelHeights[1] >= 2, 'first upper is broad');
    assert.equal(face.verticalGlazing, null);
    assert.ok(face.facadePanels.every(panel => panel.fraction < .2), 'pier remains at south/west end, never copied to north');
  }
  for (const index of [1, 2]) {
    const face = faces(profile)[index], glass = instances(group.children[index], 'frontage-glass');
    assert.equal(glass.length, 3, 'three estimated continuous blue curtain fields');
    assert.ok(glass.every(window => window.bottom > 3 && window.top < 19));
    assert.equal(face.glassColor, '#487789');
    assert.equal(face.signText, null, 'temporary sale sign is omitted');
    assert.ok(instances(group.children[index], 'frontage-#28383e').length, 'ground lobby remains dark below blue upper glass');
  }
});

test('Smiles has one broad window, west door and blank east wall under one dark fascia', async () => {
  const profile = (await profiles())['way/1006243541'], {group, ring} = render(profile.id, profile), frame = frontageFrame({profile, ring, project});
  const glass = instances(group, 'frontage-glass', frame);
  assert.equal(glass.length, 2, 'one shop window and one west door glass field');
  assert.ok(glass.every(window => window.right / frame.length < .67), 'east third stays blank brick');
  assert.ok(profile.entryDoor.fraction < .2); assert.deepEqual(profile.features, []);
  assert.equal(profile.signText, 'smiles to you');
  assert.ok(profile.signFraction < .5);
  assert.equal(group.getObjectByName('frontage-shade'), undefined, 'no repeated default shop awnings');
});
