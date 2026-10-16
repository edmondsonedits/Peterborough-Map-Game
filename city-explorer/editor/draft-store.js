import { validateSceneDocument } from './scene-document.js';

const DEFAULT_KEY = 'ptbo-city-editor-draft-v1';
const DRAFT_FORMAT_VERSION = 1;

function result(status, document = null, error = null, extra = {}) {
  return { status, document, error, ...extra };
}

function normalizeDocument(input) {
  const validated = validateSceneDocument(input);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, document: validated.document };
}

function copyDocument(document) {
  return normalizeDocument(document).document;
}

function documentIdentity(document) {
  const normalized = normalizeDocument(document);
  if (!normalized.ok) throw new TypeError(`Published base is invalid: ${normalized.errors.join(' ')}`);
  const canonical = (value) => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  };
  // Store the exact canonical content rather than a collision-prone short hash.
  return JSON.stringify(canonical(normalized.document));
}

function parseEnvelope(raw) {
  const envelope = JSON.parse(raw);
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)
      || envelope.formatVersion !== DRAFT_FORMAT_VERSION
      || !(envelope.baseRevision === null || Number.isInteger(envelope.baseRevision))
      || typeof envelope.timestamp !== 'string') {
    throw new TypeError('Draft metadata is invalid.');
  }
  const validated = normalizeDocument(envelope.document);
  if (!validated.ok) throw new TypeError(`Draft document is invalid: ${validated.errors.join(' ')}`);
  let baseIdentity = null;
  if (envelope.baseIdentity !== undefined && envelope.baseIdentity !== null) {
    if (typeof envelope.baseIdentity !== 'string') throw new TypeError('Draft base identity is invalid.');
    baseIdentity = documentIdentity(JSON.parse(envelope.baseIdentity));
  }
  return { ...envelope, baseIdentity, document: validated.document };
}

export function createDraftStore({ storage, key = DEFAULT_KEY, debounceMs = 250, now = () => new Date().toISOString(), baseDocument } = {}) {
  let pending = null;
  let timer = null;
  if (baseDocument !== undefined) documentIdentity(baseDocument);
  let baseline = baseDocument === undefined ? null : copyDocument(baseDocument);

  function resolveStorage() {
    if (storage !== undefined) return storage;
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function quarantine(raw) {
    const target = resolveStorage();
    if (!target) return;
    const quarantineKey = `${key}:corrupt:${Date.now()}`;
    try {
      target.setItem(quarantineKey, raw);
    } catch {
      // Preserve the corrupt value when storage cannot accept the quarantine copy.
      return;
    }
    try {
      target.removeItem(key);
    } catch {
      // The quarantine copy still protects the original bytes from being lost.
    }
  }

  function readEnvelope() {
    const target = resolveStorage();
    if (!target) return result('unavailable', null, new Error('Draft storage is unavailable.'));
    let raw;
    try {
      raw = target.getItem(key);
    } catch (error) {
      return result('unavailable', null, error);
    }
    if (raw === null || raw === undefined) return result('missing');
    try {
      const envelope = parseEnvelope(raw);
      return result('recovered', envelope.document, null, { envelope });
    } catch (error) {
      quarantine(raw);
      return result('corrupt', null, error);
    }
  }

  function flush() {
    clearTimer();
    if (!pending) return result('idle');
    const target = resolveStorage();
    if (!target) return result('unavailable', null, new Error('Draft storage is unavailable.'));
    try {
      target.setItem(key, JSON.stringify(pending));
      const document = pending.document;
      pending = null;
      return result('saved', copyDocument(document));
    } catch (error) {
      return result('unavailable', null, error);
    }
  }

  return {
    saveDraft(document, { baseDocument = baseline, baseRevision = baseDocument ? baseDocument.revision ?? null : document?.revision ?? null } = {}) {
      const normalized = normalizeDocument(document);
      if (!normalized.ok) return result('invalid', null, new TypeError(normalized.errors.join(' ')));
      if (!(baseRevision === null || Number.isInteger(baseRevision))) {
        return result('invalid', null, new TypeError('baseRevision must be an integer or null.'));
      }
      let baseIdentity = null;
      try { if (baseDocument) baseIdentity = documentIdentity(baseDocument); }
      catch (error) { return result('invalid', null, error); }
      pending = {
        formatVersion: DRAFT_FORMAT_VERSION,
        baseRevision,
        baseIdentity,
        timestamp: now(),
        document: normalized.document,
      };
      clearTimer();
      timer = setTimeout(() => { flush(); }, Math.max(0, debounceMs));
      return result('scheduled', copyDocument(normalized.document));
    },

    flush,

    setBaseDocument(document, { rebaseDraft = false } = {}) {
      let baseIdentity;
      try { baseIdentity = documentIdentity(document); }
      catch (error) { return result('invalid', null, error); }
      baseline = copyDocument(document);
      if (!rebaseDraft) return result('base-updated');
      // Publication may finish while a newer edit is pending. Rebase that draft's
      // metadata, preserving its content rather than resaving the published snapshot.
      const loaded = pending ? { status:'recovered', envelope:pending } : readEnvelope();
      if (loaded.status === 'missing') return result('base-updated');
      if (loaded.status !== 'recovered') return loaded;
      pending = { ...loaded.envelope, baseRevision:baseline.revision, baseIdentity };
      return flush();
    },

    loadDraft({ baseRevision = baseline?.revision, baseDocument = baseline } = {}) {
      const loaded = readEnvelope();
      if (loaded.status !== 'recovered') return loaded;
      const envelope = loaded.envelope;
      if (baseRevision !== undefined && baseRevision !== envelope.baseRevision) {
        return result('base-revision-mismatch', copyDocument(loaded.document), Object.assign(
          new Error(`Draft is based on revision ${envelope.baseRevision}; current revision is ${baseRevision}.`),
          { code: 'BASE_REVISION_MISMATCH', baseRevision: envelope.baseRevision, currentRevision: baseRevision },
        ), { timestamp: envelope.timestamp, baseRevision: envelope.baseRevision });
      }
      let currentIdentity = null;
      try { if (baseDocument) currentIdentity = documentIdentity(baseDocument); }
      catch (error) { return result('invalid', null, error); }
      if (currentIdentity && envelope.baseIdentity && currentIdentity !== envelope.baseIdentity) {
        return result('base-content-mismatch', copyDocument(loaded.document), Object.assign(
          new Error('Draft is based on different published city content.'), { code:'BASE_CONTENT_MISMATCH' },
        ), { timestamp:envelope.timestamp, baseRevision:envelope.baseRevision });
      }
      if ((currentIdentity && !envelope.baseIdentity) || (baseRevision === null && !currentIdentity)) {
        return result('base-content-unverified', copyDocument(loaded.document), Object.assign(
          new Error('This draft does not identify its published base content.'), { code:'BASE_CONTENT_UNVERIFIED' },
        ), { timestamp:envelope.timestamp, baseRevision:envelope.baseRevision });
      }
      return result('recovered', copyDocument(loaded.document), null, { timestamp: envelope.timestamp, baseRevision: envelope.baseRevision });
    },

    exportDraft() {
      if (pending) {
        return result('exported', copyDocument(pending.document), null, { data: `${JSON.stringify(pending, null, 2)}\n` });
      }
      const loaded = readEnvelope();
      if (loaded.status !== 'recovered') return loaded;
      return result('exported', copyDocument(loaded.document), null, { data: `${JSON.stringify(loaded.envelope, null, 2)}\n` });
    },

    discardDraft() {
      clearTimer();
      pending = null;
      const target = resolveStorage();
      if (!target) return result('unavailable', null, new Error('Draft storage is unavailable.'));
      try {
        target.removeItem(key);
        return result('discarded');
      } catch (error) {
        return result('unavailable', null, error);
      }
    },
  };
}
