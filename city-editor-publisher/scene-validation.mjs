import { serializeSceneDocument, validateSceneDocument } from '../city-explorer/editor/scene-document.js';

export function validateCandidate(input) {
  const result = validateSceneDocument(input);
  if (!result.ok) return { ok: false, errors: result.errors };
  if (typeof result.document.updatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result.document.updatedAt)
      || !Number.isFinite(Date.parse(result.document.updatedAt))) {
    return { ok: false, errors: ['updatedAt must be an ISO UTC timestamp.'] };
  }
  return { ok: true, document: result.document, serialized: serializeSceneDocument(result.document) };
}
