import { MEDALS } from './phase5-data.js';
import { medalProgress, safeJsonParse } from './phase5-math.js';

const KEY = 'pfr-phase5-final-release';
const VERSION = 1;
const MAX_RECORDS = 120;

export function defaultPhase5Save() {
  return {
    version:VERSION,
    difficulty:'standard',
    tutorialComplete:false,
    tutorialDismissed:false,
    tutorialStep:0,
    completedCalls:0,
    completedShifts:0,
    perfectShifts:0,
    incidentTypes:[],
    districts:[],
    stations:[],
    apparatus:[],
    cleanCalls:0,
    sRanks:0,
    secondAlarms:0,
    medals:[],
    records:[],
    bestByCall:{},
    accessibility:{ highContrast:false, largeText:false, simplifiedHud:false, showHints:true },
    performance:{ mode:'auto', lastTier:'high' },
    createdAt:Date.now(),
    updatedAt:Date.now()
  };
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function stringArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').slice(0, 100))] : [];
}

function cleanRecord(record = {}) {
  return {
    id:typeof record.id === 'string' ? record.id : `record-${Date.now()}`,
    callId:typeof record.callId === 'string' ? record.callId : 'unknown',
    title:typeof record.title === 'string' ? record.title : 'Incident',
    type:typeof record.type === 'string' ? record.type : 'rescue',
    district:typeof record.district === 'string' ? record.district : 'central',
    station:typeof record.station === 'string' ? record.station : 'station-1',
    apparatus:typeof record.apparatus === 'string' ? record.apparatus : 'engine-1',
    variant:typeof record.variant === 'string' ? record.variant : 'standard',
    difficulty:typeof record.difficulty === 'string' ? record.difficulty : 'standard',
    rank:typeof record.rank === 'string' ? record.rank : 'C',
    score:Math.max(0, number(record.score)),
    responseSeconds:Math.max(0, number(record.responseSeconds)),
    collisions:Math.max(0, number(record.collisions)),
    escalations:Math.max(0, number(record.escalations)),
    completedAt:Math.max(0, number(record.completedAt, Date.now())),
    breakdown:record.breakdown && typeof record.breakdown === 'object' ? { ...record.breakdown } : {}
  };
}

export function migratePhase5Save(input) {
  const base = defaultPhase5Save();
  if (!input || typeof input !== 'object') return base;
  const accessibility = input.accessibility || {};
  const performance = input.performance || {};
  const records = Array.isArray(input.records) ? input.records.slice(0, MAX_RECORDS).map(cleanRecord) : [];
  const bestByCall = input.bestByCall && typeof input.bestByCall === 'object' ? Object.fromEntries(Object.entries(input.bestByCall).filter(([key]) => typeof key === 'string').slice(0, 100).map(([key, value]) => [key, Math.max(0, number(value))])) : {};
  return {
    ...base,
    ...input,
    version:VERSION,
    difficulty:['story','standard','veteran','chaos'].includes(input.difficulty) ? input.difficulty : base.difficulty,
    tutorialComplete:Boolean(input.tutorialComplete),
    tutorialDismissed:Boolean(input.tutorialDismissed),
    tutorialStep:Math.max(0, Math.floor(number(input.tutorialStep))),
    completedCalls:Math.max(0, number(input.completedCalls)),
    completedShifts:Math.max(0, number(input.completedShifts)),
    perfectShifts:Math.max(0, number(input.perfectShifts)),
    incidentTypes:stringArray(input.incidentTypes),
    districts:stringArray(input.districts),
    stations:stringArray(input.stations),
    apparatus:stringArray(input.apparatus),
    cleanCalls:Math.max(0, number(input.cleanCalls)),
    sRanks:Math.max(0, number(input.sRanks)),
    secondAlarms:Math.max(0, number(input.secondAlarms)),
    medals:stringArray(input.medals),
    records,
    bestByCall,
    accessibility:{
      highContrast:Boolean(accessibility.highContrast),
      largeText:Boolean(accessibility.largeText),
      simplifiedHud:Boolean(accessibility.simplifiedHud),
      showHints:accessibility.showHints !== false
    },
    performance:{
      mode:['auto','high','medium','low'].includes(performance.mode) ? performance.mode : 'auto',
      lastTier:['high','medium','low'].includes(performance.lastTier) ? performance.lastTier : 'high'
    },
    createdAt:Math.max(0, number(input.createdAt, Date.now())),
    updatedAt:Date.now()
  };
}

export class Phase5SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try { return migratePhase5Save(JSON.parse(this.storage?.getItem(KEY) || 'null')); }
    catch { return defaultPhase5Save(); }
  }
  persist() {
    this.data.updatedAt = Date.now();
    try { this.storage?.setItem(KEY, JSON.stringify(this.data)); return true; }
    catch { return false; }
  }
  setDifficulty(id) {
    if (!['story','standard','veteran','chaos'].includes(id)) return false;
    this.data.difficulty = id;
    this.persist();
    return true;
  }
  setAccessibility(key, value) {
    if (!(key in this.data.accessibility)) return false;
    this.data.accessibility[key] = Boolean(value);
    this.persist();
    return true;
  }
  setPerformance(mode) {
    if (!['auto','high','medium','low'].includes(mode)) return false;
    this.data.performance.mode = mode;
    this.persist();
    return true;
  }
  record(record = {}) {
    const clean = cleanRecord(record);
    this.data.records.unshift(clean);
    this.data.records = this.data.records.slice(0, MAX_RECORDS);
    this.data.completedCalls += 1;
    if (!this.data.incidentTypes.includes(clean.type)) this.data.incidentTypes.push(clean.type);
    if (!this.data.districts.includes(clean.district)) this.data.districts.push(clean.district);
    if (!this.data.stations.includes(clean.station)) this.data.stations.push(clean.station);
    if (!this.data.apparatus.includes(clean.apparatus)) this.data.apparatus.push(clean.apparatus);
    if (clean.collisions === 0) this.data.cleanCalls += 1;
    if (clean.rank === 'S') this.data.sRanks += 1;
    this.data.bestByCall[clean.callId] = Math.max(Number(this.data.bestByCall[clean.callId] || 0), clean.score);
    const unlocked = this.refreshMedals();
    this.persist();
    return { record:clean, unlocked };
  }
  recordShift({ perfect = false } = {}) {
    this.data.completedShifts += 1;
    if (perfect) this.data.perfectShifts += 1;
    const unlocked = this.refreshMedals();
    this.persist();
    return unlocked;
  }
  recordSecondAlarm() {
    this.data.secondAlarms += 1;
    const unlocked = this.refreshMedals();
    this.persist();
    return unlocked;
  }
  metrics(level = 1) {
    return {
      calls:this.data.completedCalls,
      types:this.data.incidentTypes,
      districts:this.data.districts,
      stations:this.data.stations,
      apparatus:this.data.apparatus,
      cleanCalls:this.data.cleanCalls,
      sRanks:this.data.sRanks,
      secondAlarms:this.data.secondAlarms,
      perfectShifts:this.data.perfectShifts,
      level:Number(level || 1)
    };
  }
  medalStatus(level = 1) {
    const metrics = this.metrics(level);
    return MEDALS.map(medal => ({ ...medal, unlocked:this.data.medals.includes(medal.id), ...medalProgress(medal, metrics) }));
  }
  refreshMedals(level = 1) {
    const unlocked = [];
    for (const medal of this.medalStatus(level)) {
      if (medal.complete && !this.data.medals.includes(medal.id)) {
        this.data.medals.push(medal.id);
        unlocked.push(medal);
      }
    }
    return unlocked;
  }
  tutorialNext() {
    this.data.tutorialStep += 1;
    this.persist();
  }
  tutorialFinish() {
    this.data.tutorialComplete = true;
    this.data.tutorialDismissed = false;
    this.persist();
  }
  tutorialDismiss() {
    this.data.tutorialDismissed = true;
    this.persist();
  }
  tutorialRestart() {
    this.data.tutorialComplete = false;
    this.data.tutorialDismissed = false;
    this.data.tutorialStep = 0;
    this.persist();
  }
  exportBundle(extra = {}) {
    return JSON.stringify({ format:'PFR_PHASE5_SAVE', version:VERSION, exportedAt:new Date().toISOString(), phase5:this.data, ...extra }, null, 2);
  }
  importBundle(text) {
    const parsed = safeJsonParse(text);
    if (!parsed.ok) return { ok:false, message:`Invalid save file: ${parsed.error}` };
    const bundle = parsed.value;
    if (!bundle || bundle.format !== 'PFR_PHASE5_SAVE' || !bundle.phase5) return { ok:false, message:'This is not a Peterborough Fire Response Phase 5 save.' };
    this.data = migratePhase5Save(bundle.phase5);
    this.persist();
    return { ok:true, message:'Phase 5 career imported.' };
  }
  reset() {
    this.data = defaultPhase5Save();
    this.persist();
  }
}
