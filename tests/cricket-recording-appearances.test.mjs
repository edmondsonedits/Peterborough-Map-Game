import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { CRICKET_RECORDING_PROFILES, addCricketRecordingProfiles } from '../city-explorer/cricket-recording-appearances.js';
import { createFootageFacade, frontageFrame } from '../city-explorer/sherbrooke-footage.js';

const id = 'way/1015118649';
const profile = CRICKET_RECORDING_PROFILES[id];
const osm = JSON.parse(await readFile(new URL('../city-explorer/data/peterborough-osm.json', import.meta.url)));
const forbiddenMassingFields = ['height', 'eaveHeight', 'roof', 'roofRise', 'massing', 'addresses', 'collision'];

test('Cricket appearance registry is immutable and carries both source and identity provenance', () => {
  assert.ok(Object.isFrozen(CRICKET_RECORDING_PROFILES));
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.frontLatLon));
  assert.ok(Object.isFrozen(profile.groundWindows));
  assert.ok(Object.isFrozen(profile.groundWindows[0]));
  assert.equal(profile.id, id);
  assert.equal(profile.name, '22 Cricket Place brick porch house');
  assert.equal(profile.addressEvidence.kind, 'user-confirmation');
  assert.equal(profile.addressEvidence.address, '22 Cricket Place');
  assert.deepEqual(profile.parcelEvidence, { service: 'CityMapServer4', objectId: 4384 });
  assert.equal(profile.source.path, 'Peterborough-Building-References-20261024/flat-priority-2048/0870s_lens0_pitch-35_up15.jpg');
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

test('observed facade and porch component values are finite and openings avoid the entry', () => {
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
  assert.equal(profile.groundWindows.length, 1);
  const [window] = profile.groundWindows;
  for (const key of ['t', 'width', 'height', 'bottom']) assert.ok(Number.isFinite(window[key]), key);
  const frontageLengthMetres = Math.hypot(
    (profile.frontLatLon[1].lat - profile.frontLatLon[0].lat) * 111_000,
    (profile.frontLatLon[1].lon - profile.frontLatLon[0].lon) * 111_000 * Math.cos(profile.frontLatLon[0].lat * Math.PI / 180),
  );
  const doorWidth = 0.86;
  const centerDistance = Math.abs(window.t - profile.doorFraction) * frontageLengthMetres;
  assert.ok(centerDistance > (window.width + doorWidth) / 2, 'ground window must not overlap the door');
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
      const group = createFootageFacade({ THREE, profile: candidate, ring, base: 0, top: 5, project, lite });
      assert.ok(group.isGroup, `${candidate.id} creates a frontage group in ${lite ? 'lite' : 'full'} mode`);
      const details = group.getObjectByName('frontage-procedural-details');
      assert.ok(details?.getObjectByName('frontage-door'), `${candidate.id} has its entry`);
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
