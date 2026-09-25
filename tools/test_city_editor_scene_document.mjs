import assert from 'node:assert/strict';
import {
  SCENE_SCHEMA_VERSION,
  createEmptySceneDocument,
  makeAuthoredObject,
  normalizeSceneDocument,
  serializeSceneDocument,
  validateSceneDocument,
} from '../city-explorer/editor/scene-document.js';

const idA = '00000000-0000-4000-8000-000000000001';
const idB = '00000000-0000-4000-8000-000000000002';
const idHex = 'abcdefab-cdef-4abc-8def-abcdefabcdef';

function authoredObject(id, longitude = -78.32) {
  return {
    id,
    assetKey: ' tree.oak ',
    label: ' Mature oak ',
    visible: true,
    properties: { species: 'oak', tags: ['canopy', { native: true }] },
    transform: {
      longitude,
      latitude: 44.30,
      elevation: 2.5,
      rotation: { x: 0, y: 1.25, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  };
}

const empty = createEmptySceneDocument();
assert.equal(SCENE_SCHEMA_VERSION, 1);
assert.deepEqual(empty, {
  schemaVersion: 1,
  city: 'peterborough-on',
  revision: null,
  updatedAt: null,
  objects: [],
  overrides: [],
});
assert.deepEqual(validateSceneDocument(empty), { ok: true, errors: [], document: empty });

const malformedInputs = [
  { ...empty, schemaVersion: 2 },
  { ...empty, objects: [{ ...authoredObject(idA), assetKey: '   ' }] },
  { ...empty, objects: [{ ...authoredObject(idA), properties: { height: Infinity } }] },
  { ...empty, objects: [{ ...authoredObject(idA), properties: { capturedAt: new Date('2020-01-01T00:00:00Z') } }] },
  { ...empty, objects: [{ ...authoredObject(idA), transform: { ...authoredObject(idA).transform, elevation: Infinity } }] },
  { ...empty, objects: [authoredObject(idA), authoredObject(idA)] },
  { ...empty, objects: [authoredObject(idHex), authoredObject(idHex.toUpperCase())] },
  { ...empty, overrides: [
    { id: idHex, operation: 'hide' },
    { id: idHex.toUpperCase(), operation: 'hide' },
  ] },
  { ...empty, objects: [authoredObject(idA, -78.56)] },
  { ...empty, objects: [authoredObject(idA, -78.04)] },
  { ...empty, objects: [{ ...authoredObject(idA), transform: { ...authoredObject(idA).transform, latitude: 44.51 } }] },
  { ...empty, objects: [{ ...authoredObject(idA), transform: { ...authoredObject(idA).transform, elevation: -50.01 } }] },
  { ...empty, objects: [{ ...authoredObject(idA), transform: { ...authoredObject(idA).transform, scale: { x: 0, y: 1, z: 1 } } }] },
  { ...empty, overrides: [{ id: idA, operation: 'move' }] },
  null,
  'not a document',
];
for (const input of malformedInputs) {
  const result = validateSceneDocument(input);
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.equal(result.document, null);
}

const uppercaseIdResult = validateSceneDocument({ ...empty, objects: [authoredObject(idHex.toUpperCase())] });
assert.equal(uppercaseIdResult.ok, true);
assert.equal(uppercaseIdResult.document.objects[0].id, idHex);
const uppercaseOverrideResult = validateSceneDocument({
  ...empty,
  overrides: [{ id: idHex.toUpperCase(), operation: 'hide' }],
});
assert.equal(uppercaseOverrideResult.document.overrides[0].id, idHex);
const optionalDefaultsInput = authoredObject(idB);
delete optionalDefaultsInput.label;
delete optionalDefaultsInput.visible;
delete optionalDefaultsInput.properties;
const optionalDefaults = validateSceneDocument({ ...empty, objects: [optionalDefaultsInput] });
assert.equal(optionalDefaults.ok, true);
assert.deepEqual(
  (({ label, visible, properties }) => ({ label, visible, properties }))(optionalDefaults.document.objects[0]),
  { label: 'tree.oak', visible: true, properties: {} },
);

const unordered = {
  ...empty,
  unexpected: 'removed',
  objects: [
    { ...authoredObject(idB), catalogueKey: 'obsolete.asset', name: 'obsolete', notes: 'obsolete', provenance: { source: 'obsolete' }, extra: true },
    { ...authoredObject(idA), name: 'obsolete', catalogueKey: 'obsolete.asset' },
  ],
  overrides: [
    { id: idB, operation: 'hide', extra: true },
    { id: idA, operation: 'appearance', appearance: { materialKey: 'bark' } },
  ],
};
const normalized = normalizeSceneDocument(unordered);
assert.deepEqual(normalized.objects.map((object) => object.id), [idA, idB]);
assert.equal(normalized.objects[0].assetKey, 'tree.oak');
assert.equal(normalized.objects[0].label, 'Mature oak');
assert.equal(normalized.objects[0].visible, true);
assert.deepEqual(normalized.objects[0].properties, { species: 'oak', tags: ['canopy', { native: true }] });
assert.deepEqual(normalized.overrides.map((override) => override.id), [idA, idB]);
assert.equal('unexpected' in normalized, false);
assert.equal('extra' in normalized.objects[1], false);
for (const obsoleteField of ['catalogueKey', 'name', 'notes', 'provenance']) {
  assert.equal(obsoleteField in normalized.objects[1], false);
}
assert.equal('extra' in normalized.overrides[1], false);

const roundTripInput = {
  ...empty,
  objects: [authoredObject(idA)],
  overrides: [{ id: idB, operation: 'replace', assetKey: 'tree.maple' }],
};
const roundTrip = validateSceneDocument(JSON.parse(serializeSceneDocument(roundTripInput)));
assert.equal(roundTrip.ok, true);
assert.deepEqual(roundTrip.document, normalizeSceneDocument(roundTripInput));

const built = makeAuthoredObject(authoredObject(idB));
assert.equal(built.id, idB);
assert.equal(built.assetKey, 'tree.oak');
assert.deepEqual(validateSceneDocument({ ...empty, objects: [built] }).errors, []);

console.log(JSON.stringify({ status: 'pass', validationCases: malformedInputs.length, stableOrdering: true, roundTrip: true }));
