const reasons = new Set(['point', 'radius', 'address', 'name', 'scoring', 'other']);
const snapshotKeys = ['resultId', 'callId', 'city', 'service', 'mode', 'version', 'datasetId', 'datasetRevision', 'question', 'originalCircle', 'guess', 'distanceMeters', 'result', 'baseId'];

function object(value, label, allowed, required = allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new Error(`${label} must be an object.`);
  if (Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw new Error(`${label} has missing or unsupported fields.`);
  return value;
}
function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new Error(`${label} must be text between 1 and ${max} characters.`);
  return value.trim();
}
function displayedText(value, label, max) {
  if (typeof value !== 'string' || value.trim().length > max)
    throw new Error(`${label} must be text of ${max} characters or fewer.`);
  return value.trim();
}
function optionalText(value, label, max) {
  return value == null ? null : text(value, label, max);
}
function number(value, label, min, max, exclusiveMin = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > max ||
      (exclusiveMin ? value <= min : value < min))
    throw new Error(`${label} is outside its allowed range.`);
  return Object.is(value, -0) ? 0 : value;
}
function point(value, label) {
  object(value, label, ['lat', 'lng']);
  return { lat: number(value.lat, `${label} latitude`, -90, 90), lng: number(value.lng, `${label} longitude`, -180, 180) };
}
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// Reported context is evidence from the game client, not a verified catalog correction.
export function normalizeLocationReport(input) {
  object(input, 'Location report', ['schemaVersion', 'kind', 'reason', 'snapshot', 'suggestion'], ['schemaVersion', 'kind', 'reason', 'snapshot']);
  if (input.schemaVersion !== 1 || input.kind !== 'geo-location' || !reasons.has(input.reason))
    throw new Error('Choose a supported location report and reason.');
  const s = object(input.snapshot, 'Snapshot', snapshotKeys, snapshotKeys.filter(key => !['datasetRevision', 'guess', 'distanceMeters', 'baseId'].includes(key)));
  if (s.mode !== 'geo' || !['fire', 'ems'].includes(s.service) || !['correct', 'incorrect', 'revealed'].includes(s.result))
    throw new Error('Snapshot mode, service or result is invalid.');
  const q = object(s.question, 'Question', ['name', 'address', 'crossStreets', 'difficulty'], ['name', 'address']);
  const circle = object(s.originalCircle, 'Original circle', ['center', 'radiusMeters']);
  let crossStreets = null;
  if (q.crossStreets != null) {
    if (!Array.isArray(q.crossStreets) || q.crossStreets.length > 4) throw new Error('Cross streets must contain at most four street names.');
    crossStreets = q.crossStreets.map(value => text(value, 'Cross street', 150));
  }
  const guess = s.guess == null ? null : point(s.guess, 'Guess');
  const distanceMeters = s.distanceMeters == null ? null : number(s.distanceMeters, 'Distance', 0, 40100000);
  if ((guess === null) !== (distanceMeters === null)) throw new Error('Guess and distance must be supplied together.');
  let suggestion = null;
  if (input.suggestion != null) {
    const v = object(input.suggestion, 'Suggested circle', ['center', 'radiusMeters'], []);
    if (!Object.keys(v).length) throw new Error('Choose a suggested centre or radius.');
    suggestion = {};
    if (Object.hasOwn(v, 'center')) suggestion.center = point(v.center, 'Suggested centre');
    if (Object.hasOwn(v, 'radiusMeters')) suggestion.radiusMeters = number(v.radiusMeters, 'Suggested radius', 5, 2000);
  }
  return freeze({
    schemaVersion: 1, kind: 'geo-location', reason: input.reason,
    snapshot: {
      resultId: text(s.resultId, 'Result ID', 160), callId: text(s.callId, 'Call ID', 160),
      city: text(s.city, 'City', 80), service: s.service, mode: 'geo', version: text(s.version, 'Version', 80),
      datasetId: text(s.datasetId, 'Dataset ID', 240), datasetRevision: optionalText(s.datasetRevision, 'Dataset revision', 160),
      question: { name: displayedText(q.name, 'Location name', 200), address: displayedText(q.address, 'Address', 300), crossStreets, difficulty: optionalText(q.difficulty, 'Difficulty', 80) },
      originalCircle: { center: point(circle.center, 'Original centre'), radiusMeters: number(circle.radiusMeters, 'Original radius', 0, 20000, true) },
      guess, distanceMeters, result: s.result, baseId: optionalText(s.baseId, 'Base ID', 160),
    },
    suggestion,
  });
}

export function locationReportIdentity(report) {
  return JSON.stringify(normalizeLocationReport(report));
}

// Only a developer-side grouping hint. Individual private threads remain independent.
export function locationReportGroupKey(report) {
  const { reason, snapshot: s } = normalizeLocationReport(report);
  return JSON.stringify([1, s.city, s.service, s.mode, s.version, s.datasetId, s.datasetRevision, s.callId, s.question, s.originalCircle, reason]);
}
