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

function authoredObject(id, longitude = -78.32) {
  return {
    id,
    catalogueKey: 'tree.oak',
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
  { ...empty, objects: [{ ...authoredObject(idA), transform: { ...authoredObject(idA).transform, elevation: Infinity } }] },
  { ...empty, objects: [authoredObject(idA), authoredObject(idA)] },
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

const unordered = {
  ...empty,
  unexpected: 'removed',
  objects: [
    { ...authoredObject(idB), extra: true },
    authoredObject(idA),
  ],
  overrides: [
    { id: idB, operation: 'hide', extra: true },
    { id: idA, operation: 'appearance', appearance: { materialKey: 'bark' } },
  ],
};
const normalized = normalizeSceneDocument(unordered);
assert.deepEqual(normalized.objects.map((object) => object.id), [idA, idB]);
assert.deepEqual(normalized.overrides.map((override) => override.id), [idA, idB]);
assert.equal('unexpected' in normalized, false);
assert.equal('extra' in normalized.objects[1], false);
assert.equal('extra' in normalized.overrides[1], false);

const roundTripInput = {
  ...empty,
  objects: [authoredObject(idA)],
  overrides: [{ id: idB, operation: 'replace', catalogueKey: 'tree.maple' }],
};
const roundTrip = validateSceneDocument(JSON.parse(serializeSceneDocument(roundTripInput)));
assert.equal(roundTrip.ok, true);
assert.deepEqual(roundTrip.document, normalizeSceneDocument(roundTripInput));

const built = makeAuthoredObject(authoredObject(idB));
assert.equal(built.id, idB);
assert.equal(built.catalogueKey, 'tree.oak');
assert.deepEqual(validateSceneDocument({ ...empty, objects: [built] }).errors, []);

console.log(JSON.stringify({ status: 'pass', validationCases: malformedInputs.length, stableOrdering: true, roundTrip: true }));
