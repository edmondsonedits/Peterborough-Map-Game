const STORAGE_KEY = 'pfr-street-shift-save';
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    callHistory: [],
    shift: {
      callsCompleted: 0, totalScore: 0, distanceDriven: 0, collisions: 0,
      apparatusDamage: 0, hydrantsUsed: 0, waterUsed: 0, patientsAssisted: 0,
      equipmentLeftBehind: 0, bestRank: null, responseTimes: [], turnoutTimes: []
    },
    lifetime: { callsCompleted: 0, bestScore: 0 },
    achievements: []
  };
}

function finite(value, fallback = 0) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

export function migrateSave(input) {
  const base = defaultSave();
  if (!input || typeof input !== 'object') return base;
  const source = input.version === SAVE_VERSION ? input : { ...input, version: SAVE_VERSION };
  const shift = source.shift && typeof source.shift === 'object' ? source.shift : {};
  const lifetime = source.lifetime && typeof source.lifetime === 'object' ? source.lifetime : {};
  return {
    version: SAVE_VERSION,
    callHistory: Array.isArray(source.callHistory) ? source.callHistory.slice(-40).filter(item => item && typeof item === 'object') : [],
    shift: {
      ...base.shift,
      ...shift,
      callsCompleted: Math.max(0, finite(shift.callsCompleted)),
      totalScore: Math.max(0, finite(shift.totalScore)),
      distanceDriven: Math.max(0, finite(shift.distanceDriven)),
      collisions: Math.max(0, finite(shift.collisions)),
      apparatusDamage: Math.max(0, finite(shift.apparatusDamage)),
      hydrantsUsed: Math.max(0, finite(shift.hydrantsUsed)),
      waterUsed: Math.max(0, finite(shift.waterUsed)),
      patientsAssisted: Math.max(0, finite(shift.patientsAssisted)),
      equipmentLeftBehind: Math.max(0, finite(shift.equipmentLeftBehind)),
      responseTimes: Array.isArray(shift.responseTimes) ? shift.responseTimes.slice(-30).map(v => Math.max(0, finite(v))) : [],
      turnoutTimes: Array.isArray(shift.turnoutTimes) ? shift.turnoutTimes.slice(-30).map(v => Math.max(0, finite(v))) : []
    },
    lifetime: {
      callsCompleted: Math.max(0, finite(lifetime.callsCompleted)),
      bestScore: Math.max(0, finite(lifetime.bestScore))
    },
    achievements: Array.isArray(source.achievements) ? [...new Set(source.achievements.filter(v => typeof v === 'string'))] : []
  };
}

export class SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try { return migrateSave(JSON.parse(this.storage?.getItem(STORAGE_KEY) || 'null')); }
    catch { return defaultSave(); }
  }
  persist() {
    try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.data)); return true; }
    catch { return false; }
  }
  resetShift() { this.data.shift = defaultSave().shift; this.persist(); }
  recordCall(record) {
    this.data.callHistory.push({ ...record, at: Date.now() });
    this.data.callHistory = this.data.callHistory.slice(-40);
    this.data.shift.callsCompleted += 1;
    this.data.shift.totalScore += Math.max(0, record.score || 0);
    this.data.shift.responseTimes.push(Math.max(0, record.responseTime || 0));
    this.data.shift.responseTimes = this.data.shift.responseTimes.slice(-30);
    this.data.shift.bestRank = betterRank(this.data.shift.bestRank, record.rank);
    this.data.lifetime.callsCompleted += 1;
    this.data.lifetime.bestScore = Math.max(this.data.lifetime.bestScore, record.score || 0);
    this.persist();
  }
}

function betterRank(current, candidate) {
  const order = ['S', 'A', 'B', 'C', 'D'];
  if (!candidate) return current;
  if (!current) return candidate;
  return order.indexOf(candidate) < order.indexOf(current) ? candidate : current;
}
