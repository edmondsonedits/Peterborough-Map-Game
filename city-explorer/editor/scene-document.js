export const SCENE_SCHEMA_VERSION = 1;

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPERATIONS = new Set(['hide', 'appearance', 'replace']);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

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
  const result = {
    id: object.id,
    catalogueKey: object.catalogueKey,
    transform: normalizedTransform(object.transform),
  };
  if (typeof object.name === 'string') result.name = object.name;
  if (typeof object.notes === 'string') result.notes = object.notes;
  if (isRecord(object.provenance)) {
    result.provenance = {};
    for (const key of ['source', 'url', 'licence', 'author', 'reviewedAt']) {
      if (typeof object.provenance[key] === 'string') result.provenance[key] = object.provenance[key];
    }
  }
  return result;
}

function normalizeOverride(override) {
  const result = { id: override.id, operation: override.operation };
  if (override.operation === 'appearance' && isRecord(override.appearance)) {
    result.appearance = {};
    for (const key of ['materialKey', 'color', 'opacity']) {
      if (override.appearance[key] !== undefined) result.appearance[key] = override.appearance[key];
    }
  }
  if (override.operation === 'replace' && typeof override.catalogueKey === 'string') {
    result.catalogueKey = override.catalogueKey;
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
    if (typeof object.id !== 'string' || !UUID_LIKE.test(object.id)) errors.push(`Authored object ID must be UUID-like: ${String(object.id)}.`);
    else if (objectIds.has(object.id)) errors.push(`Duplicate authored object ID: ${object.id}.`);
    objectIds.add(object.id);
    if (typeof object.catalogueKey !== 'string' || !object.catalogueKey.trim()) errors.push(`${object.id || 'Object'} requires a catalogueKey.`);

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
    if (typeof override.id !== 'string' || !UUID_LIKE.test(override.id)) errors.push(`Override ID must be UUID-like: ${String(override.id)}.`);
    else if (overrideIds.has(override.id)) errors.push(`Duplicate override ID: ${override.id}.`);
    overrideIds.add(override.id);
    if (!OPERATIONS.has(override.operation)) errors.push(`${override.id || 'Override'} operation must be hide, appearance, or replace.`);
    if (override.operation === 'appearance' && !isRecord(override.appearance)) errors.push(`${override.id || 'Override'} appearance operation requires appearance data.`);
    if (override.operation === 'replace' && (typeof override.catalogueKey !== 'string' || !override.catalogueKey.trim())) errors.push(`${override.id || 'Override'} replace operation requires catalogueKey.`);
  }

  return { ok: errors.length === 0, errors, document: errors.length ? null : normalizeSceneDocument(input) };
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
