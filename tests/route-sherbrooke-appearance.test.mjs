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
import {businessOpeningTop, planBusinessWallSigns} from '../city-explorer/business-sign-layout.js';

const expected = ['way/1006594206', 'way/1006575786', 'way/1006575766', 'way/1006594188', 'way/1006575767', 'way/1006594168', 'way/1006575755', 'way/755554888'];
const northSide = new Set(['way/1006594206', 'way/1006594188', 'way/1006594168']);
const center = {lat: 44.3091, lon: -78.3197};
const project = (lat, lon) => ({x: (lon - center.lon) * 111320 * Math.cos(center.lat * Math.PI / 180), z: -(lat - center.lat) * 110540});
const data = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url), 'utf8'));
const ways = new Map(data.elements.filter(value => value.type === 'way').map(value => ['way/' + value.id, value]));

async function registry() {
  const module = await import('../city-explorer/route-sherbrooke-appearances.js').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  });
  assert.ok(module, 'the eight source-reviewed Sherbrooke frontages are available');
  return module.ROUTE_SHERBROOKE_APPEARANCES;
}

function sourceHeight(id, profile) {
  // Match app.js buildingDimensions and the non-appearanceOnly roof allowance.
  // No Frills keeps its existing 5.2 m reviewed wall; the seven new records use OSM.
  if (!profile.appearanceOnly && !profile.preserveMappedMassing && profile.eaveHeight) {
    return profile.eaveHeight + (profile.roof === 'flat' ? .2 : profile.roofRise);
  }
  return mappedBuildingDimensions(ways.get(id).tags, id).height;
}

function render(id, profile, {lite = false} = {}) {
  const ring = ways.get(id).geometry.slice(0, -1).map(({lat, lon}) => project(lat, lon));
  const height = sourceHeight(id, profile);
  return {group: createFootageFacade({THREE, profile, ring, base: 100, top: 100 + height, project, lite}), height, ring};
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

function assertSeparate(a, b, label) {
  assert.ok(a.right <= b.left + .01 || b.right <= a.left + .01 || a.top <= b.bottom + .01 || b.top <= a.bottom + .01, label);
}

async function composed() {
  await registry();
  const base = Object.fromEntries(Object.entries(FOOTAGE_PROFILES).map(([id, profile]) => [id, applyRecordingAppearance(profile)]));
  return addRouteLandmarkAppearances(base);
}

test('Sherbrooke composition preserves existing geometry, the No Frills west photograph and the default opt-out', async () => {
  const records = await registry();
  assert.deepEqual(Object.keys(records).sort(), [...expected].sort());
  const base = { 'way/755554888': applyRecordingAppearance(FOOTAGE_PROFILES['way/755554888']) }, snapshot = structuredClone(base);
  assert.equal(addRouteLandmarkAppearances(base, false), base);
  assert.equal(recordingReferencesEnabled(''), true);
  assert.equal(recordingReferencesEnabled('?visuals=legacy'), false);
  assert.equal(recordingReferencesEnabled('?recordingReferences=off'), false);
  const result = addRouteLandmarkAppearances(base);
  assert.deepEqual(base, snapshot);
  for (const id of expected.filter(value => value !== 'way/755554888')) {
    assert.ok(result[id], `${id} is included in production composition`);
    assert.equal(result[id].appearanceOnly, true);
    assert.equal(result[id].preserveMappedMassing, true);
    for (const field of ['height', 'eaveHeight', 'roofRise', 'roof', 'massing', 'roofColor']) assert.equal(result[id][field], undefined, `${id} does not change ${field}`);
  }
  for (const field of ['height', 'eaveHeight', 'roofRise', 'roof', 'frontLatLon', 'facadePhoto', 'facadePanels', 'signText']) assert.deepEqual(result['way/755554888'][field], base['way/755554888'][field], `existing No Frills ${field} is preserved`);
  assert.equal(result['way/755554888'].additionalFrontages.length, 1);
  for (const id of ['way/749414219', 'way/194193065', 'way/1006594187', 'way/1006575662', 'way/1006575663']) assert.equal(records[id], undefined, `${id} is outside this evidence-ready set`);
});

test('Sherbrooke faces use the exact current source edges and point toward the photographed street side', async () => {
  const records = await registry(), profiles = await composed();
  const owned = new Set(emergencyFacilityEntries().flatMap(entry => entry.sourceIds));
  for (const id of expected) {
    assert.equal(owned.has(id), false, `${id} has no authored GLB owner to duplicate`);
    const profile = profiles[id], face = id === 'way/755554888' ? profile.additionalFrontages[0] : profile;
    const coords = ways.get(id).geometry.slice(0, -1), ring = coords.map(({lat, lon}) => project(lat, lon));
    const indices = face.frontLatLon.map(end => coords.findIndex(point => point.lat === end.lat && point.lon === end.lon));
    assert.ok(indices.every(index => index >= 0), `${id} endpoints exist in the current ring`);
    assert.ok(Math.abs(indices[0] - indices[1]) === 1 || Math.abs(indices[0] - indices[1]) === coords.length - 1, `${id} uses adjacent vertices`);
    const frame = frontageFrame({profile: face, ring, project});
    assert.ok(northSide.has(id) ? frame.outward.z > .9 : frame.outward.z < -.9, `${id} points toward Sherbrooke`);
    assert.ok(records[id].observation && records[id].estimated && records[id].photoIds.length, `${id} retains observation/estimate separation`);
  }
});

test('Sherbrooke details remain finite and uncollapsed at actual source wall heights in balanced and Lite rendering', async () => {
  const profiles = await composed();
  for (const id of expected) for (const lite of [false, true]) {
    const profile = profiles[id], face = id === 'way/755554888' ? {...profile, ...profile.additionalFrontages[0], additionalFrontages: undefined, facadePhoto: undefined} : profile;
    const {group, height, ring} = render(id, face, {lite});
    assert.equal(group.userData.collision, false);
    group.traverse(node => {
      if (node.isInstancedMesh) assert.ok([...node.instanceMatrix.array].every(Number.isFinite), `${id} finite transforms`);
      if (node.geometry) assert.ok([...node.geometry.attributes.position.array].every(Number.isFinite), `${id} finite vertices`);
    });
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group), frame = frontageFrame({profile: face, ring, project});
    assert.ok(bounds.min.y >= 99.99 && bounds.max.y <= 100 + height + .01, `${id} stays within its actual ${height.toFixed(5)} m source height`);
    for (const panel of face.facadePanels || []) {
      const matching = instances(group, `frontage-${panel.color}`, frame).filter(box => Math.abs(box.bottom - panel.bottomMetres) < .01 && Math.abs(box.scale.y - panel.heightMetres) < .01);
      assert.ok(matching.length, `${id} ${panel.color} panel is emitted at intended height, without top-edge collapse`);
    }
    const openings = [...instances(group, 'frontage-glass', frame), ...instances(group, 'frontage-upper-arched-glass', frame)];
    for (let i = 0; i < openings.length; i++) {
      assert.ok(openings[i].left >= -.01 && openings[i].right <= frame.length + .01, `${id} opening fits the source edge`);
      for (let j = i + 1; j < openings.length; j++) assertSeparate(openings[i], openings[j], `${id} openings ${i}/${j} do not overlap`);
    }
    if (face.signText) {
      const sign = {left: face.signFraction * frame.length - face.signWidthMetres / 2, right: face.signFraction * frame.length + face.signWidthMetres / 2, bottom: face.signHeightMetres - face.signBoardHeightMetres / 2, top: face.signHeightMetres + face.signBoardHeightMetres / 2};
      for (const opening of openings) assertSeparate(sign, opening, `${id} lettering board does not cross an opening`);
    }
  }
});

test('Dominion leaves the west ground wall blank and keeps three narrow upper sash above the east storefront', async () => {
  const profile = (await composed())['way/1006594206'], {group, ring} = render(profile.id, profile);
  const frame = frontageFrame({profile, ring, project}), glass = instances(group, 'frontage-glass', frame);
  assert.equal(glass.length, 6, 'three upper sash and three east storefront glass fields');
  const lower = glass.filter(box => box.top < 3.5), upper = glass.filter(box => box.bottom > 4);
  assert.equal(lower.length, 3); assert.equal(upper.length, 3);
  assert.ok(lower.every(box => box.left / frame.length >= .34), 'no guessed retail bay on the blank west ground wall');
  assert.equal(profile.entryDoor, null);
  assert.equal(profile.signText, 'DOMINION LENDING');
});

test('laundromat west shop window and door do not swap to the east side or acquire overlapping lettering', async () => {
  const profile = (await composed())['way/1006575786'], {group, ring} = render(profile.id, profile);
  const frame = frontageFrame({profile, ring, project}), glass = instances(group, 'frontage-glass', frame);
  assert.equal(glass.length, 5, 'three upper sash, one west shop window and one west glazed door');
  assert.ok(profile.entryDoor.fraction < .12);
  const shop = glass.find(box => box.bottom > .4 && box.top < 2.5);
  assert.ok(shop && shop.right / frame.length < .45, 'large shop window is on the west portion');
  const eastDoor = instances(group, 'frontage-#e1dfd0', frame);
  assert.equal(eastDoor.length, 1); assert.ok(eastDoor[0].left / frame.length > .8);
  assert.equal(profile.signText, 'LAUNDROMAT');
  assert.ok(profile.signFraction < .35);
});

test('Stewart side walls keep exactly two and five observed windows without a guessed street entrance or porch', async () => {
  const profiles = await composed();
  for (const [id, count] of [['way/1006575766', 2], ['way/1006594188', 5]]) {
    const profile = profiles[id], {group} = render(id, profile), windows = instances(group, 'frontage-glass');
    assert.equal(windows.length, count, `${id} corrected observed count`);
    assert.equal(group.getObjectByName('frontage-door'), undefined);
    assert.equal(group.getObjectByName('frontage-supported-depth-details'), undefined);
    if (count === 2) assert.ok(windows.every(window => window.bottom > 2.4), 'Stewart SW ground wall stays blank');
    else assert.equal(windows.filter(window => window.scale.x < .5 && window.scale.y < .6).length, 1, 'Stewart NW retains the tiny fifth opening');
  }
});

test('Stewart SE retains two arched windows flanking the central door rather than three windows', async () => {
  const profile = (await composed())['way/1006575767'], {group, ring} = render(profile.id, profile);
  const frame = frontageFrame({profile, ring, project}), arches = instances(group, 'frontage-upper-arched-glass', frame), door = instances(group, 'frontage-glass', frame);
  assert.equal(arches.length, 2); assert.equal(door.length, 1);
  assert.ok(arches[0].right < door[0].left && door[0].right < arches[1].left);
  assert.ok(arches.every(window => window.top < 3), 'one principal wall storey is detailed');
  assert.equal(profile.levels, 1);
  assert.equal(profile.porch, false);
});

test('Thrive uses tall divided glazing and lower green screening without inventing an opaque named sign', async () => {
  const profile = (await composed())['way/1006594168'], {group, ring} = render(profile.id, profile);
  const frame = frontageFrame({profile, ring, project}), panes = instances(group, 'frontage-glass', frame);
  assert.equal(panes.length, 1, 'continuous glazing is visibly split by the broad central pier');
  assert.ok(panes[0].scale.y > 3.5 && panes[0].scale.x > frame.length * .85);
  const pier = instances(group, 'frontage-#92958d', frame).find(panel => panel.scale.y > 3.5 && panel.left / frame.length > .45 && panel.right / frame.length < .55);
  assert.ok(pier, 'broad grey central pier splits two tall fields');
  const green = instances(group, 'frontage-#25834b', frame);
  assert.equal(green.length, 2); assert.ok(green.every(panel => panel.top < 1.6));
  assert.equal(profile.signText, null);
  assert.equal(profile.signBusinessName, 'Thrive Health');
  assert.equal(profile.entryDoor, null);
});

test('Thrive tall glazing leaves no space for the stale automatically placed diner sign at the actual wall height', async () => {
  const id = 'way/1006594168', profile = (await composed())[id], source = ways.get(id);
  const directory = JSON.parse(await readFile(new URL('../city-explorer/data/business-directory.json', import.meta.url), 'utf8'));
  const rows = directory.businesses.filter(row => row.buildingSourceId === id && row.placementStatus === 'approved');
  const height = mappedBuildingDimensions(source.tags, id).height;
  const openingTopMetres = businessOpeningTop(source.tags, height, profile);
  const result = planBusinessWallSigns({
    building: {sourceId: id, polygons: [{base: 100, wallTop: 100 + height, rings: [source.geometry.map(({lat, lon}) => project(lat, lon))]}]},
    businesses: rows.map(row => ({...row, openingTopMetres: Math.max(row.openingTopMetres || 0, openingTopMetres)})),
    project,
  });
  assert.equal(result.signs.length, 0, 'no opaque sign can be placed across the tall glazed field');
  assert.ok(result.rejected.every(row => row.reason === 'insufficient-height-above-opening'));
});

test('Aylmer southwest block retains two upper arches and two substantial lower fields with no automatic entry', async () => {
  const profile = (await composed())['way/1006575755'], {group} = render(profile.id, profile);
  assert.equal(instances(group, 'frontage-upper-arched-glass').length, 2);
  const lower = instances(group, 'frontage-glass');
  assert.equal(lower.length, 2);
  assert.ok(lower.every(window => window.scale.x >= 1.6 && window.scale.y >= 1.6), 'lower glass-block fields are not shrunk to small sash');
  assert.equal(group.getObjectByName('frontage-door'), undefined);
  assert.equal(profile.entryDoor, null);
});

test('No Frills east loading return never inherits the west yellow panel, wording or photo badge', async () => {
  const profile = (await composed())['way/755554888'];
  const face = profile.additionalFrontages[0], rendered = render(profile.id, profile);
  assert.equal(rendered.group.userData.frontageCount, 2);
  const group = rendered.group.children[1];
  assert.equal(face.signText, null); assert.equal(face.facadePhoto, undefined);
  assert.equal(group.userData.facadePhotoStatus, undefined, 'the renderer never requests the western photo for this return');
  assert.equal(group.getObjectByName('frontage-#f6df16'), undefined);
  assert.equal(group.getObjectByName('reviewed-facade-photo'), undefined);
  assert.equal(instances(group, 'frontage-#1a2020').length, 1, 'one broad dark loading field');
  assert.equal(instances(group, 'frontage-glass').length, 0, 'dark aperture is not asserted to be a glazed entrance');
  assert.equal(group.userData.collision, false);
});
