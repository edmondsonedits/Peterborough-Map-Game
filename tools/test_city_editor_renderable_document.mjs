import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRenderableSceneDocument, validatePublishableSceneDocument, validateSceneDocument } from '../city-explorer/editor/scene-document.js';
import { makeGeneratedId } from '../city-explorer/editor/generated-registry.js';

const sourceId = '00000000-0000-4000-8000-000000000100';
const replacementId = makeGeneratedId({ sourceType: 'authored-replacement', sourceId });
const transform = { longitude: -78.3, latitude: 44.3, elevation: 0, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } };
const scene = { schemaVersion: 1, city: 'peterborough-on', revision: null, updatedAt: '2026-09-25T12:00:00.000Z', objects: [], overrides: [] };
const tree = { id: '00000000-0000-4000-8000-000000000001', assetKey: 'tree', transform };
const clone = { id: replacementId, assetKey: 'generated-source-clone', properties: { sourceTargetId: sourceId }, transform };
const replace = { id: sourceId, operation: 'replace', assetKey: 'generated-source-clone' };

test('valid catalogue object and linked generated clone pass strict publication', () => {
  assert.equal(validatePublishableSceneDocument({ ...scene, objects: [tree, clone], overrides: [replace] }).ok, true);
});

test('public loader keeps valid records when legacy document includes unsupported records', () => {
  const input = { ...scene, objects: [tree, { ...tree, id: '00000000-0000-4000-8000-000000000002', assetKey: 'unknown' }] };
  assert.equal(validateSceneDocument(input).ok, true);
  const result = sanitizeRenderableSceneDocument(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.objects.map((record) => record.assetKey), ['tree']);
});

test('public loader drops orphan and unavailable generated clones without dropping catalogue objects', () => {
  const input = { ...scene, objects: [tree, clone], overrides: [replace] };
  const result = sanitizeRenderableSceneDocument(input, { hasGeneratedSource: () => false });
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.objects.map((record) => record.assetKey), ['tree']);
  assert.deepEqual(result.document.overrides, []);
});

test('public loader keeps the first valid record when a later record duplicates its ID', () => {
  const input = { ...scene, objects: [tree, { ...tree, assetKey: 'bench' }] };
  const result = sanitizeRenderableSceneDocument(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.objects.map((record) => record.assetKey), ['tree']);
});

test('unsupported record cannot shadow a renderable record with the same ID', () => {
  const input = { ...scene, objects: [{ ...tree, assetKey: 'unknown' }, tree] };
  const result = sanitizeRenderableSceneDocument(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.document.objects.map((record) => record.assetKey), ['tree']);
});
