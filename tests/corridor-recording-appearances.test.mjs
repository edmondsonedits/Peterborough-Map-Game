import assert from 'node:assert/strict';
import { test } from 'node:test';
import review from '../city-explorer/data/corridor-recording-review.json' with { type: 'json' };
import { CORRIDOR_RECORDING_APPEARANCES, applyCorridorRecordingAppearance } from '../city-explorer/corridor-recording-appearances.js';
import { ROUTE_BUILDING_PROFILES } from '../city-explorer/route-building-profiles.js';
import { FOOTAGE_PROFILES } from '../city-explorer/sherbrooke-footage-profiles.js';

const allowedAppearanceFields = new Set([
  'wallColor', 'trimColor', 'plinthHeight', 'plinthColor',
  'windowWidthMetres', 'windowHeightMetres', 'doorFraction',
  'glazedLevels', 'glazedLevelHeights', 'archedWindowLevels', 'windowOverrides',
  'features', 'facadePanels', 'frontGarden',
]);
const profileById = new Map([
  ...ROUTE_BUILDING_PROFILES.map(profile => [profile.id, profile]),
  ...Object.values(FOOTAGE_PROFILES).map(profile => [profile.id, profile]),
]);

test('audit covers each catalogue target and records baseline dispositions without claiming a visual match', () => {
  assert.equal(review.records.length, 51);
  assert.equal(Object.keys(CORRIDOR_RECORDING_APPEARANCES).length, review.summary.newChanged);
  assert.equal(new Set(review.records.map(record => record.id)).size, 51);
  assert.equal(review.summary.reviewed, 51);
  assert.equal(review.summary.newChanged, 5);
  assert.equal(review.summary.alreadyRepresented, 35);
  assert.equal(review.summary.representedWithLimitations, 8);
  assert.equal(review.summary.blocked, 8);
  assert.equal(review.summary.sourcePixelViewsInspected, 39);
  assert.equal(review.summary.baselineFrontageCapturesReviewed, 55);
  assert.ok(review.records.every(record => record.source.length > 0 && record.evidence.length > 20));
  for (const record of review.records) {
    assert.ok(record.rendererBaseline && typeof record.rendererBaseline.status === 'string', record.id);
    for (const field of Object.keys(record.appearance)) assert.ok(allowedAppearanceFields.has(field), `${record.id} unsupported ${field}`);
    assert.ok(record.disposition === 'blocked-unresolved' || record.disposition === 'already-represented' || record.disposition === 'represented-with-limitations');
    if (Object.keys(record.appearance).length) {
      const entry = CORRIDOR_RECORDING_APPEARANCES[record.id];
      assert.ok(entry, record.id);
      assert.equal(entry.id, record.id);
      assert.equal(entry.disposition, record.disposition);
      assert.deepEqual(entry.source, record.source);
      assert.equal(entry.evidence, record.evidence);
      assert.deepEqual(entry.appearance, record.appearance);
    } else assert.equal(CORRIDOR_RECORDING_APPEARANCES[record.id], undefined, `${record.id} has no empty overlay`);
  }
  assert.equal(review.records.find(record => record.id === 'way/1009651262').rendererBaseline.status, 'profile-correction-proposed-renderer-api-available-pending-wiring');
  assert.match(review.records.find(record => record.id === 'way/1006243554').rendererBaseline.observation, /rectangular Curate storefront windows/);
  for (const id of ['way/1006243559', 'way/1006243554']) {
    const record = review.records.find(item => item.id === id);
    assert.deepEqual(record.appearance, {});
    assert.match(record.rendererBaseline.status, /unsupported-correction-rejected/);
    assert.equal(CORRIDOR_RECORDING_APPEARANCES[id], undefined);
  }
});

test('supported appearance overlays apply immutably and repeat without changing identity or massing', () => {
  for (const profile of [...ROUTE_BUILDING_PROFILES, ...Object.values(FOOTAGE_PROFILES)]) {
    const before = structuredClone(profile);
    const once = applyCorridorRecordingAppearance(profile);
    const twice = applyCorridorRecordingAppearance(once);
    assert.deepEqual(profile, before, profile.id);
    assert.deepEqual(twice, once, profile.id);
    for (const key of ['id', 'name', 'height', 'eaveHeight', 'roof', 'roofRise', 'frontLatLon', 'reference', 'frontSource', 'collision', 'massing']) {
      assert.deepEqual(once[key], profile[key], `${profile.id} ${key}`);
    }
  }

  const get = id => applyCorridorRecordingAppearance(profileById.get(id));
  const r02 = get('way/1009651246');
  assert.equal(r02.plinthHeight, 0.8);
  assert.equal(r02.plinthColor, '#b7b3a8');
  const r06 = get('way/1009651260');
  assert.equal(r06.doorFraction, 0.12);
  const r10 = get('way/995887447');
  assert.equal(r10.windowOverrides.length, 10);
  assert.deepEqual(r10.windowOverrides.map(({ level, column, shape, heightMetres }) => ({ level, column, shape, heightMetres })), Array.from({ length: 10 }, (_, column) => ({ level: 0, column, shape: 'rectangle', heightMetres: 3.2 })));
  assert.deepEqual(r10.windowOverrides.map(({ referenceId }) => referenceId), Array.from({ length: 10 }, (_, column) => `source-0636-lens0-ground-bay-${column}`));
  const r08 = get('way/1009651262');
  assert.deepEqual(r08.windowOverrides, [{ level: 1, column: 1, shape: 'arch', widthMetres: 1.8, heightMetres: 2.2, referenceId: 'source-0630-lens1-upper-center-arch' }]);
  assert.deepEqual(get('way/1006243553').archedWindowLevels, [2]);
  const r19 = get('way/1006243554');
  assert.equal(r19.signText, profileById.get('way/1006243554').signText);
  assert.ok(get('way/1006243553').features.includes('corbelled-cornice'));
  assert.ok(r19.features.includes('corbelled-cornice'));
});

test('explicit profile values and opt-out are preserved', () => {
  const explicit = {
    id: 'way/1009651246', height: 8, roof: 'gable',
    plinthHeight: 0.6, plinthColor: '#123456',
    frontGarden: { pathColor: '#654321' },
  };
  assert.equal(applyCorridorRecordingAppearance(explicit).plinthHeight, 0.6);
  assert.equal(applyCorridorRecordingAppearance(explicit).plinthColor, '#123456');
  assert.deepEqual(applyCorridorRecordingAppearance(explicit).frontGarden, explicit.frontGarden);
  assert.equal(applyCorridorRecordingAppearance({ id: 'way/1009651260', doorFraction: 0.8 }).doorFraction, 0.8);
  assert.deepEqual(applyCorridorRecordingAppearance({ id: 'way/1006243559', archedWindowLevels: [] }).archedWindowLevels, []);
  const existingOpening = { level: 1, column: 1, shape: 'rectangle', widthMetres: 1.2, referenceId: 'manual-center-window' };
  assert.deepEqual(applyCorridorRecordingAppearance({ id: 'way/1009651262', windowOverrides: [existingOpening] }).windowOverrides, [existingOpening]);
  assert.equal(applyCorridorRecordingAppearance(explicit, false), explicit);
  assert.equal(applyCorridorRecordingAppearance({ id: 'way/not-in-corridor' }).id, 'way/not-in-corridor');
});

test('published appearance map is deeply immutable and all entries retain review evidence', () => {
  assert.ok(Object.isFrozen(CORRIDOR_RECORDING_APPEARANCES));
  for (const entry of Object.values(CORRIDOR_RECORDING_APPEARANCES)) {
    assert.ok(Object.keys(entry.appearance).length > 0);
    assert.ok(entry.evidence.length > 20);
    assert.ok(entry.source.length > 0);
    assert.ok(Object.isFrozen(entry));
    assert.ok(Object.isFrozen(entry.source));
    assert.ok(Object.isFrozen(entry.appearance));
  }
});
