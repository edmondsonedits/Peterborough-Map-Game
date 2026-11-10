import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { CRICKET_RECORDING_PROFILES, addCricketRecordingProfiles } from '../city-explorer/cricket-recording-appearances.js';
import { createFootageFacade, frontageFrame } from '../city-explorer/sherbrooke-footage.js';
import { mappedBuildingDimensions } from '../city-explorer/mapped-building-dimensions.js';

const id = 'way/1015118649';
const profile = CRICKET_RECORDING_PROFILES[id];
const osm = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url)));
const forbiddenMassingFields = ['height', 'eaveHeight', 'roof', 'roofRise', 'massing', 'addresses', 'collision'];

function renderedBoxes(candidate, lite = false) {
  const way = osm.elements.find(element => element.type === 'way' && `way/${element.id}` === candidate.id);
  const origin = candidate.frontLatLon[0];
  const project = (lat, lon) => ({ x: (lon - origin.lon) * 79_720, y: (lat - origin.lat) * 111_320 });
  const ring = way.geometry.slice(0, -1).map(point => {
    const p = project(point.lat, point.lon); return { x: p.x, z: p.y };
  });
  const frame = frontageFrame({ profile: candidate, ring, project });
  const wallHeight = mappedBuildingDimensions(way.tags, candidate.id).height;
  const group = createFootageFacade({ THREE, profile: candidate, ring, base: 0, top: wallHeight, project, lite });
  const boxes = [], matrix = new THREE.Matrix4();
  group.traverse(node => {
    if (!node.isInstancedMesh) return;
    for (let i = 0; i < node.count; i++) {
      node.getMatrixAt(i, matrix);
      const position = new THREE.Vector3(), scale = new THREE.Vector3();
      matrix.decompose(position, new THREE.Quaternion(), scale);
      boxes.push({ name: node.name, t: ((position.x - frame.start.x) * frame.tangent.x + (position.z - frame.start.z) * frame.tangent.z) / frame.length,
        y: position.y, width: scale.x, height: scale.y, depth: scale.z });
    }
  });
  return { boxes, frame, wallHeight };
}

test('current address records use distinct reviewed houses while retaining the earlier photo identification conflict', () => {
  const narrow = CRICKET_RECORDING_PROFILES['way/1015118649'];
  const broad = CRICKET_RECORDING_PROFILES['way/1015118651'];
  assert.equal(narrow.source.photoId, 'R281', '22 uses the narrow pale-gable house isolated before the camera reversal');
  assert.equal(broad.source.photoId, 'R283', '24 uses the broad cross-gable house beside the toy');
  assert.equal(narrow.parcelEvidence.objectId, 4384);
  assert.equal(broad.parcelEvidence.objectId, 4385);
  for (const candidate of [narrow, broad]) {
    assert.equal(candidate.reviewedWallMaterial, true, 'reviewed Cricket fronts retain their materials and essential facade in lite mode');
    assert.equal(candidate.identityReview.historicalUserIdentification.address, '22 Cricket Place');
    assert.deepEqual(candidate.identityReview.historicalUserIdentification.photoIds, ['R283', 'R285']);
    assert.equal(candidate.identityReview.independentReviews.length, 2);
  }
});

test('24 renders the observed broad porch rather than the narrower eastern neighbor porch', () => {
  for (const lite of [false, true]) {
    const { boxes, frame } = renderedBoxes(CRICKET_RECORDING_PROFILES['way/1015118651'], lite);
    const roof = boxes.find(box => Math.abs(box.height - .14) < .001 && box.depth > 1.5);
    assert.ok(roof, 'porch canopy is generated');
    assert.ok(roof.width >= frame.length * .8, `24 porch covers the broad frontage in ${lite ? 'lite' : 'full'} mode`);
  }
});

test('22 retains only the visible eastern lower entry and no guessed glass behind the dense tree', () => {
  for (const lite of [false, true]) {
    const { boxes, wallHeight } = renderedBoxes(profile, lite);
    const lowGlass = boxes.filter(box => box.name === 'frontage-glass' && box.y < 2.6);
    assert.ok(lowGlass.length > 0, 'observed entry glazing remains visible');
    assert.ok(lowGlass.every(box => box.t > .65), 'lower glass is confined to the east entry');
    assert.ok(boxes.every(box => box.y + box.height / 2 <= wallHeight + .001), 'all details fit the real mapped wall');
  }
});

test('Cricket appearance registry is immutable and carries both source and identity provenance', () => {
  assert.ok(Object.isFrozen(CRICKET_RECORDING_PROFILES));
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.frontLatLon));
  assert.ok(Object.isFrozen(profile.groundWindows));
  assert.ok(Object.isFrozen(profile.entryDoor));
  assert.ok(Object.isFrozen(profile.identityReview.historicalUserIdentification));
  assert.equal(profile.id, id);
  assert.equal(profile.name, '22 Cricket Place brick porch house');
  assert.equal(profile.addressEvidence.kind, 'municipal-parcel');
  assert.equal(profile.addressEvidence.address, '22 Cricket Place');
  assert.deepEqual(profile.parcelEvidence, { service: 'CityMapServer4', objectId: 4384 });
  assert.equal(profile.source.path, 'Peterborough-Building-References-20261024/dense/flat-768/frame_0433_lens1_pitch+0.jpg');
  assert.match(profile.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(profile.source.neighborFrames.length, 2);
  assert.ok(profile.source.neighborFrames.every(frame => /^[a-f0-9]{64}$/.test(frame.sha256) && frame.pixelInspected));
  assert.ok(Object.isFrozen(profile.source.neighborFrames));
  assert.ok(profile.source.neighborFrames.every(Object.isFrozen));
  assert.equal(profile.source.pixelInspected, true);
  assert.equal(profile.confidence, 'observed');
  assert.equal(profile.appearanceOnly, true);
  assert.equal(profile.preserveMappedMassing, true);
  for (const key of forbiddenMassingFields) assert.equal(Object.hasOwn(profile, key), false, key);

  const neighbor = CRICKET_RECORDING_PROFILES['way/1015118651'];
  assert.equal(neighbor.addressEvidence.address, '24 Cricket Place');
  assert.deepEqual(neighbor.parcelEvidence, { service: 'CityMapServer4', objectId: 4385 });
  assert.equal(neighbor.source.pixelInspected, true);
  for (const candidate of Object.values(CRICKET_RECORDING_PROFILES)) {
    assert.equal(Object.hasOwn(candidate, 'frontGarden'), false, `${candidate.id} avoids guessed garden geometry`);
    for (const key of forbiddenMassingFields) assert.equal(Object.hasOwn(candidate, key), false, `${candidate.id} ${key}`);
  }
});

test('profile addition is opt-out, immutable, and preserves existing profile precedence', () => {
  const base = { 'way/existing': { id: 'way/existing', style: 'house' } };
  const snapshot = structuredClone(base);
  assert.equal(addCricketRecordingProfiles(base, false), base);
  const extended = addCricketRecordingProfiles(base);
  assert.notEqual(extended, base);
  assert.deepEqual(base, snapshot);
  assert.deepEqual(Object.keys(extended), ['way/existing', ...Object.keys(CRICKET_RECORDING_PROFILES)]);
  assert.equal(extended[id], profile);

  const override = { id, name: 'caller-authored', wallColor: '#123456' };
  const withOverride = {
    [id]: override,
    'way/1015118651': { id: 'way/1015118651', name: 'caller-authored-24' },
    'way/existing': base['way/existing'],
  };
  assert.equal(addCricketRecordingProfiles(withOverride), withOverride);
  assert.equal(addCricketRecordingProfiles(withOverride)[id], override);
});

test('observed facade and porch component values are finite and omit obscured lower openings', () => {
  assert.equal(profile.style, 'house');
  assert.deepEqual(profile.frontLatLon, [
    { lat: 44.3072879, lon: -78.3113502 },
    { lat: 44.3073049, lon: -78.3112781 },
  ]);
  for (const key of ['levels', 'windowColumns', 'doorFraction', 'porchWidthFraction', 'porchDepthMetres', 'porchHeightMetres']) {
    assert.ok(Number.isFinite(profile[key]), key);
  }
  assert.equal(profile.levels, 2);
  assert.equal(profile.windowColumns, 2);
  assert.equal(profile.groundWindows.length, 0);
  for (const key of ['fraction', 'widthMetres', 'heightMetres']) assert.ok(Number.isFinite(profile.entryDoor[key]), key);
  assert.ok(profile.porchHeightMetres < 2.8, 'porch roof remains below upper-floor openings');
});

test('confirmed Cricket profiles generate finite facade geometry in full and lite modes', () => {
  for (const candidate of Object.values(CRICKET_RECORDING_PROFILES)) {
    const sourceWay = osm.elements.find(element => element.type === 'way' && `way/${element.id}` === candidate.id);
    assert.ok(sourceWay?.geometry?.length >= 4, `${candidate.id} has its mapped OSM ring`);
    const origin = candidate.frontLatLon[0];
    const project = (lat, lon) => ({
      x: (lon - origin.lon) * 111_320 * Math.cos(origin.lat * Math.PI / 180),
      y: (lat - origin.lat) * 110_540,
    });
    const ring = sourceWay.geometry.slice(0, -1).map(point => {
      const projected = project(point.lat, point.lon);
      return { x: projected.x, z: projected.y };
    });
    const frame = frontageFrame({ profile: candidate, ring, project });
    assert.ok(Number.isFinite(frame.length) && frame.length > 2, `${candidate.id} frontage endpoints project finitely`);
    for (const lite of [false, true]) {
      const top = mappedBuildingDimensions(sourceWay.tags, candidate.id).height;
      const group = createFootageFacade({ THREE, profile: candidate, ring, base: 0, top, project, lite });
      assert.ok(group.isGroup, `${candidate.id} creates a frontage group in ${lite ? 'lite' : 'full'} mode`);
      const details = group.getObjectByName('frontage-procedural-details');
      assert.ok(details?.getObjectByName(`frontage-${candidate.entryDoor?.color || 'door'}`), `${candidate.id} has its entry`);
      assert.ok(group.getObjectByName('frontage-depth-trim'), `${candidate.id} has porch geometry`);
      assert.equal(group.getObjectByName('front-garden-path'), undefined, `${candidate.id} leaves observed but unmodeled lawn/path geometry alone`);
      group.updateMatrixWorld(true);
      group.traverse(object => {
        if (object.isInstancedMesh) {
          for (const value of object.instanceMatrix.array) assert.ok(Number.isFinite(value), `${candidate.id} ${object.name} matrix`);
        }
        if (object.isMesh && object.geometry.attributes.position) {
          for (const value of object.geometry.attributes.position.array) assert.ok(Number.isFinite(value), `${candidate.id} ${object.name} vertex`);
        }
      });
    }
  }
});
