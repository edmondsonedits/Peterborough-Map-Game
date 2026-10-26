import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { RECORDING_REFERENCE_APPEARANCES, applyRecordingReferenceAppearance } from '../city-explorer/recording-reference-appearances.js';

const evidence = JSON.parse(await readFile(new URL('../city-explorer/data/recording-reference-evidence.json', import.meta.url), 'utf8'));
const ids = Object.keys(RECORDING_REFERENCE_APPEARANCES);

test('lookup entries are one-to-one with photo evidence and carry appearance settings only', () => {
  assert.deepEqual(new Set(evidence.records.map(record => record.id)), new Set(ids));
  assert.equal(new Set(evidence.records.map(record => record.id)).size, evidence.records.length);
  for (const record of Object.values(RECORDING_REFERENCE_APPEARANCES)) {
    assert.match(record.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(record.observation.length > 20);
    assert.ok(record.limitations.length > 20);
  }
  const residential = RECORDING_REFERENCE_APPEARANCES['way/1006575704'].appearance;
  assert.deepEqual(Object.keys(residential), ['frontGarden']);
  assert.deepEqual(Object.keys(residential.frontGarden).sort(), ['drivewayColor', 'pathColor']);
  const noFrills = RECORDING_REFERENCE_APPEARANCES['way/755554888'].appearance;
  assert.deepEqual(Object.keys(noFrills).sort(), ['facadePanels', 'signLayout']);
  assert.equal(noFrills.facadePanels.length, 1);
});

test('applying a residential setting changes only existing garden surface colors', () => {
  const profile = {
    id: 'way/1006575704', label: 'S03', name: '219 Sherbrooke',
    height: 8.68, roof: 'gable', roofRise: 2.3, frontLatLon: [{ lat: 1, lon: 2 }, { lat: 3, lon: 4 }],
    frontGarden: { depthMetres: 6, pathFraction: 0.15, pathWidthMetres: 1.1, lawnColor: '#65754b', drivewayFraction: 0.04, drivewayWidthMetres: 2.2 },
  };
  const before = structuredClone(profile);
  const updated = applyRecordingReferenceAppearance(profile);
  assert.notEqual(updated, profile);
  assert.deepEqual(profile, before);
  assert.equal(updated.id, profile.id);
  assert.equal(updated.name, profile.name);
  assert.equal(updated.height, profile.height);
  assert.equal(updated.roof, profile.roof);
  assert.equal(updated.roofRise, profile.roofRise);
  assert.deepEqual(updated.frontLatLon, profile.frontLatLon);
  const { pathColor, drivewayColor, ...gardenBounds } = updated.frontGarden;
  assert.deepEqual(gardenBounds, profile.frontGarden);
  assert.equal(pathColor, '#85827b');
  assert.equal(drivewayColor, '#514f4b');
});

test('No Frills receives one bounded yellow facade panel and preserves existing overrides', () => {
  const profile = {
    id: 'way/755554888', label: 'R01', name: 'No Frills', height: 5.4, roof: 'flat', roofRise: 0,
    frontLatLon: [{ lat: 44.3006964, lon: -78.3195426 }, { lat: 44.3007145, lon: -78.3191166 }],
    wallColor: '#ecebe5', signText: 'NO FRILLS', signFraction: 0.18, signWidthMetres: 12, signHeightMetres: 4.3,
    facadePanels: [{ fraction: 0.5, widthFraction: 0.1, color: '#dddddd', referenceId: 'existing-override' }],
  };
  const before = structuredClone(profile);
  const once = applyRecordingReferenceAppearance(profile);
  const twice = applyRecordingReferenceAppearance(once);
  assert.deepEqual(profile, before);
  assert.equal(once.id, profile.id);
  assert.equal(once.height, profile.height);
  assert.equal(once.roof, profile.roof);
  assert.deepEqual(once.frontLatLon, profile.frontLatLon);
  assert.equal(once.wallColor, profile.wallColor);
  assert.equal(once.signText, profile.signText);
  assert.equal(once.signFraction, 0.15);
  assert.equal(once.signWidthMetres, 9);
  assert.equal(once.signHeightMetres, 3.75);
  assert.equal(once.signBoardHeightMetres, 0.8);
  assert.equal(once.facadePanels[0], profile.facadePanels[0]);
  assert.equal(once.facadePanels.length, 2);
  assert.deepEqual(twice.facadePanels, once.facadePanels);
  const panel = once.facadePanels[1];
  assert.equal(panel.referenceId, 'recording-reference-r01-yellow-wall');
  assert.equal(panel.fraction, 0.18);
  assert.equal(panel.widthFraction, 0.36);
  assert.equal(panel.bottomMetres, 0.15);
  assert.equal(panel.heightMetres, 4.9);
  assert.equal(panel.color, '#f6df16');
  const customizedSign = { ...profile, signWidthMetres: 10, signFraction: 0.22, signHeightMetres: 3.9, signBoardHeightMetres: 1.1 };
  const customResult = applyRecordingReferenceAppearance(customizedSign);
  assert.equal(customResult.signWidthMetres, 10);
  assert.equal(customResult.signFraction, 0.22);
  assert.equal(customResult.signHeightMetres, 3.9);
  assert.equal(customResult.signBoardHeightMetres, 1.1);
});

test('R13 restores the source-backed stone pier without changing the building profile', () => {
  const profile = {
    id: 'way/1031042883', label: 'R13', name: '364 Water Street office', height: 20.2,
    wallColor: '#b9ae96', roof: 'flat', roofRise: 0,
    verticalGlazing: { fraction: 0.91, widthFraction: 0.13 },
    facadePanels: [{ fraction: 0.15, widthFraction: 0.04, referenceId: 'existing-panel' }],
  };
  const before = structuredClone(profile);
  const updated = applyRecordingReferenceAppearance(profile);
  assert.deepEqual(profile, before);
  assert.equal(updated.height, profile.height);
  assert.deepEqual(updated.verticalGlazing, profile.verticalGlazing);
  assert.equal(updated.facadePanels[0], profile.facadePanels[0]);
  assert.equal(updated.facadePanels.length, 2);
  assert.deepEqual(updated.facadePanels[1], {
    fraction: 0.73, widthFraction: 0.22, bottomMetres: 0, heightMetres: 20.2,
    color: '#b9ae96', outsetMetres: 0.30, referenceId: 'recording-reference-r13-stone-pier',
  });
});

test('disabled, unknown, and garden-less profiles are returned unchanged', () => {
  const profile = { id: 'way/1006575704', frontGarden: { depthMetres: 6 } };
  assert.equal(applyRecordingReferenceAppearance(profile, false), profile);
  const unknown = { id: 'way/unknown', frontGarden: {} };
  const withoutGarden = { id: 'way/1006575704' };
  assert.equal(applyRecordingReferenceAppearance(unknown), unknown);
  assert.equal(applyRecordingReferenceAppearance(withoutGarden), withoutGarden);
});



test('explicit garden colors and a customized sign board take precedence over defaults', () => {
  const house = { id: 'way/1006575704', frontGarden: { pathColor: '#aabbcc', drivewayColor: '#112233', depthMetres: 6 } };
  assert.deepEqual(applyRecordingReferenceAppearance(house).frontGarden, house.frontGarden);
  const shop = { id: 'way/755554888', signWidthMetres: 12, signFraction: 0.18, signHeightMetres: 4.3, signBoardHeightMetres: 1.1 };
  const applied = applyRecordingReferenceAppearance(shop);
  for (const key of ['signWidthMetres', 'signFraction', 'signHeightMetres', 'signBoardHeightMetres']) assert.equal(applied[key], shop[key]);
});
