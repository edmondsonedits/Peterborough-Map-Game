import { ASSET_CATALOG } from './asset-catalog.js';
import { makeGeneratedId } from './generated-registry.js';

export const SCENE_SCHEMA_VERSION = 1;

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATIONS = new Set(['hide', 'appearance', 'replace']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const canonicalId = (value) => typeof value === 'string' && UUID_LIKE.test(value) ? value.toLowerCase() : value;

function isJsonSafe(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  seen.add(value);
  const safe = Array.isArray(value)
    ? value.every((item) => isJsonSafe(item, seen))
    : Object.keys(value).every((key) => isJsonSafe(value[key], seen));
  seen.delete(value);
  return safe;
}

export function createEmptySceneDocument() {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    city: 'peterborough-on',
    revision: null,
    updatedAt: null,
    objects: [],
    overrides: [],
  };
}

function normalizedTransform(transform = {}) {
  const scale = transform.scale || {};
  const rotation = transform.rotation || {};
  return {
    longitude: transform.longitude,
    latitude: transform.latitude,
    elevation: transform.elevation,
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  };
}

function normalizeObject(object) {
  const assetKey = object.assetKey.trim();
  const result = {
    id: canonicalId(object.id),
    assetKey,
    label: typeof object.label === 'string' && object.label.trim() ? object.label.trim() : assetKey,
    visible: object.visible ?? true,
    properties: object.properties === undefined ? {} : JSON.parse(JSON.stringify(object.properties)),
    transform: normalizedTransform(object.transform),
  };
  return result;
}

function normalizeOverride(override) {
  const result = { id: canonicalId(override.id), operation: override.operation };
  if (override.operation === 'appearance' && isRecord(override.appearance)) {
    result.appearance = {};
    for (const key of ['materialKey', 'color', 'opacity']) {
      if (override.appearance[key] !== undefined) result.appearance[key] = override.appearance[key];
    }
  }
  if (override.operation === 'replace' && typeof override.assetKey === 'string') {
    result.assetKey = override.assetKey.trim();
  }
  return result;
}

export function normalizeSceneDocument(input) {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    city: 'peterborough-on',
    revision: input.revision ?? null,
    updatedAt: input.updatedAt ?? null,
    objects: input.objects.map(normalizeObject).sort((a, b) => a.id.localeCompare(b.id)),
    overrides: input.overrides.map(normalizeOverride).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function validateSceneDocument(input) {
  const errors = [];
  if (!isRecord(input)) return { ok: false, errors: ['Scene document must be an object.'], document: null };
  if (input.schemaVersion !== SCENE_SCHEMA_VERSION) errors.push('schemaVersion must be 1.');
  if (input.city !== 'peterborough-on') errors.push('city must be peterborough-on.');
  if (input.revision !== null && input.revision !== undefined && !Number.isInteger(input.revision)) errors.push('revision must be an integer or null.');
  if (input.updatedAt !== null && input.updatedAt !== undefined && typeof input.updatedAt !== 'string') errors.push('updatedAt must be a string or null.');
  if (!Array.isArray(input.objects)) errors.push('objects must be an array.');
  if (!Array.isArray(input.overrides)) errors.push('overrides must be an array.');

  const objectIds = new Set();
  for (const object of Array.isArray(input.objects) ? input.objects : []) {
    if (!isRecord(object)) {
      errors.push('Each authored object must be an object.');
      continue;
    }
    const id = canonicalId(object.id);
    if (typeof object.id !== 'string' || !UUID_LIKE.test(object.id)) errors.push(`Authored object ID must be UUID-like: ${String(object.id)}.`);
    else if (objectIds.has(id)) errors.push(`Duplicate authored object ID: ${object.id}.`);
    objectIds.add(id);
    if (typeof object.assetKey !== 'string' || !object.assetKey.trim()) errors.push(`${object.id || 'Object'} requires an assetKey.`);
    if (object.label !== undefined && typeof object.label !== 'string') errors.push(`${object.id || 'Object'} label must be a string.`);
    if (object.visible !== undefined && typeof object.visible !== 'boolean') errors.push(`${object.id || 'Object'} visible must be a boolean.`);
    if (object.properties !== undefined && (!isRecord(object.properties) || !isJsonSafe(object.properties))) {
      errors.push(`${object.id || 'Object'} properties must be a JSON-safe object.`);
    }

    const transform = object.transform;
    if (!isRecord(transform)) {
      errors.push(`${object.id || 'Object'} requires a transform.`);
      continue;
    }
    for (const [key, minimum, maximum] of [
      ['longitude', -78.55, -78.05],
      ['latitude', 44.15, 44.50],
      ['elevation', -50, 500],
    ]) {
      const value = transform[key];
      if (!isFiniteNumber(value) || value < minimum || value > maximum) {
        errors.push(`${object.id || 'Object'} transform.${key} must be finite and within [${minimum}, ${maximum}].`);
      }
    }
    for (const group of ['rotation', 'scale']) {
      if (!isRecord(transform[group])) {
        errors.push(`${object.id || 'Object'} transform.${group} must contain x, y, and z.`);
        continue;
      }
      for (const axis of ['x', 'y', 'z']) {
        const value = transform[group][axis];
        const valid = isFiniteNumber(value) && (group === 'rotation' || (value >= 0.01 && value <= 100));
        if (!valid) errors.push(`${object.id || 'Object'} transform.${group}.${axis} must be finite${group === 'scale' ? ' and within [0.01, 100]' : ''}.`);
      }
    }
  }

  const overrideIds = new Set();
  for (const override of Array.isArray(input.overrides) ? input.overrides : []) {
    if (!isRecord(override)) {
      errors.push('Each override must be an object.');
      continue;
    }
    const id = canonicalId(override.id);
    if (typeof override.id !== 'string' || !UUID_LIKE.test(override.id)) errors.push(`Override ID must be UUID-like: ${String(override.id)}.`);
    else if (overrideIds.has(id)) errors.push(`Duplicate override ID: ${override.id}.`);
    overrideIds.add(id);
    if (!OPERATIONS.has(override.operation)) errors.push(`${override.id || 'Override'} operation must be hide, appearance, or replace.`);
    if (override.operation === 'appearance' && !isRecord(override.appearance)) errors.push(`${override.id || 'Override'} appearance operation requires appearance data.`);
    if (override.operation === 'replace' && (typeof override.assetKey !== 'string' || !override.assetKey.trim())) errors.push(`${override.id || 'Override'} replace operation requires assetKey.`);
  }

  return { ok: errors.length === 0, errors, document: errors.length ? null : normalizeSceneDocument(input) };
}

export function validatePublishableSceneDocument(input) {
  const result = validateSceneDocument(input);
  if (!result.ok) return result;
  const errors = [];
  const document = result.document;
  const clonesBySource = new Map();
  for (const object of document.objects) {
    if (Object.hasOwn(ASSET_CATALOG, object.assetKey)) continue;
    if (object.assetKey !== 'generated-source-clone') {
      errors.push(`${object.id} uses an unapproved assetKey.`);
      continue;
    }
    const sourceId = object.properties?.sourceTargetId;
    if (typeof sourceId !== 'string' || !UUID_LIKE.test(sourceId) || sourceId === object.id
        || object.id !== makeGeneratedId({ sourceType: 'authored-replacement', sourceId })) {
      errors.push(`${object.id} generated source clone requires a matching sourceTargetId and replacement ID.`);
      continue;
    }
    clonesBySource.set(sourceId, object);
  }
  for (const override of document.overrides) {
    if (override.operation !== 'replace') continue;
    if (override.assetKey === 'generated-source-clone') {
      if (!clonesBySource.has(override.id)) errors.push(`${override.id} generated source replacement requires a matching clone.`);
    } else if (!Object.hasOwn(ASSET_CATALOG, override.assetKey)) errors.push(`${override.id} replacement uses an unapproved assetKey.`);
  }
  for (const sourceId of clonesBySource.keys()) {
    if (!document.overrides.some((override) => override.id === sourceId && override.operation === 'replace' && override.assetKey === 'generated-source-clone')) {
      errors.push(`${sourceId} generated source clone requires a matching replace override.`);
    }
  }
  return { ok: errors.length === 0, errors, document: errors.length ? null : document };
}

export function sanitizeRenderableSceneDocument(input, { hasGeneratedSource = () => true } = {}) {
  if (!Array.isArray(input?.objects) || !Array.isArray(input?.overrides)) return validateSceneDocument(input);
  const base = validateSceneDocument({ ...input, objects: [], overrides: [] });
  if (!base.ok) return base;
  const document = base.document;
  const objects = [];
  const overrides = [];
  for (const object of input.objects) {
    const result = validateSceneDocument({ ...document, objects: [object] });
    if (result.ok) objects.push(result.document.objects[0]);
  }
  for (const override of input.overrides) {
    const result = validateSceneDocument({ ...document, overrides: [override] });
    if (result.ok) overrides.push(result.document.overrides[0]);
  }
  function firstPerId(records) {
    const seen = new Set();
    return records.filter((record) => {
      if (seen.has(record.id)) return false;
      seen.add(record.id);
      return true;
    });
  }
  const cloneSources = new Set(overrides.filter((item) => item.operation === 'replace' && item.assetKey === 'generated-source-clone').map((item) => item.id));
  document.objects = firstPerId(objects.filter((object) => {
    if (Object.hasOwn(ASSET_CATALOG, object.assetKey)) return true;
    if (object.assetKey !== 'generated-source-clone') return false;
    const sourceId = object.properties?.sourceTargetId;
    return typeof sourceId === 'string' && UUID_LIKE.test(sourceId)
      && object.id === makeGeneratedId({ sourceType: 'authored-replacement', sourceId })
      && cloneSources.has(sourceId) && hasGeneratedSource(sourceId);
  }));
  document.overrides = firstPerId(overrides.filter((override) => {
    if (override.operation !== 'replace') return true;
    if (Object.hasOwn(ASSET_CATALOG, override.assetKey)) return true;
    return override.assetKey === 'generated-source-clone'
      && document.objects.some((object) => object.assetKey === 'generated-source-clone' && object.properties.sourceTargetId === override.id);
  }));
  document.objects = document.objects.filter((object) => object.assetKey !== 'generated-source-clone'
    || document.overrides.some((override) => override.id === object.properties.sourceTargetId && override.operation === 'replace' && override.assetKey === 'generated-source-clone'));
  return validateSceneDocument(document);
}

export function serializeSceneDocument(input) {
  const result = validateSceneDocument(input);
  if (!result.ok) throw new TypeError(`Cannot serialize invalid scene document: ${result.errors.join(' ')}`);
  return `${JSON.stringify(result.document, null, 2)}\n`;
}

export function makeAuthoredObject(input) {
  if (!isRecord(input)) throw new TypeError('Authored object input must be an object.');
  return normalizeObject(input);
}
