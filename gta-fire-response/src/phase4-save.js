import { APPARATUS_PROFILES, CITY_DISTRICTS, SHIFT_CHALLENGES } from './phase4-data.js';
import { challengeProgress, pickChallenges, readinessScore, serviceQuote } from './phase4-math.js';

const KEY = 'pfr-phase4-city-career';
const VERSION = 1;

function apparatusDefaults(profile) {
  return {
    id:profile.id,
    stationId:profile.homeStation,
    fuel:profile.fuelCapacity,
    water:profile.tank,
    maxWater:profile.tank,
    condition:{ body:100, steering:100, engine:100, lights:100, pump:100 },
    calls:0,
    distance:0,
    lastServiceAt:Date.now()
  };
}

export function defaultPhase4Save() {
  const apparatus = Object.fromEntries(APPARATUS_PROFILES.map(profile => [profile.id, apparatusDefaults(profile)]));
  const districtReputation = Object.fromEntries(CITY_DISTRICTS.map(district => [district.id, 50]));
  const challenges = pickChallenges(SHIFT_CHALLENGES, 1).map(item => ({ id:item.id, claimed:false }));
  return {
    version:VERSION,
    credits:400,
    shiftNumber:1,
    selectedStation:'station-1',
    selectedApparatus:'engine-1',
    modifierId:'normal',
    callsThisShift:0,
    lifetimeCalls:0,
    lifetimeCredits:0,
    districtReputation,
    apparatus,
    metrics:{ cleanCalls:0, waterCalls:0, crewCommands:0, fastTurnouts:0, districts:[], cleanEquipmentCalls:0 },
    challenges,
    completedChallenges:0,
    secondAlarms:0,
    cityCommendations:[]
  };
}

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function repairCondition(source = {}) {
  return Object.fromEntries(['body','steering','engine','lights','pump'].map(key => [key, Math.max(0, Math.min(100, number(source[key], 100)))]));
}

export function migratePhase4Save(input) {
  const base = defaultPhase4Save();
  if (!input || typeof input !== 'object') return base;
  const apparatus = { ...base.apparatus };
  for (const profile of APPARATUS_PROFILES) {
    const source = input.apparatus?.[profile.id] || {};
    apparatus[profile.id] = {
      ...apparatusDefaults(profile),
      ...source,
      id:profile.id,
      stationId:typeof source.stationId === 'string' ? source.stationId : profile.homeStation,
      fuel:Math.max(0, Math.min(profile.fuelCapacity, number(source.fuel, profile.fuelCapacity))),
      water:Math.max(0, Math.min(profile.tank, number(source.water, profile.tank))),
      maxWater:profile.tank,
      condition:repairCondition(source.condition),
      calls:Math.max(0, number(source.calls)),
      distance:Math.max(0, number(source.distance)),
      lastServiceAt:Math.max(0, number(source.lastServiceAt, Date.now()))
    };
  }
  const districtReputation = { ...base.districtReputation };
  for (const district of CITY_DISTRICTS) districtReputation[district.id] = Math.max(0, Math.min(100, number(input.districtReputation?.[district.id], 50)));
  const metricsSource = input.metrics || {};
  return {
    ...base,
    ...input,
    version:VERSION,
    credits:Math.max(0, number(input.credits, base.credits)),
    shiftNumber:Math.max(1, Math.floor(number(input.shiftNumber, 1))),
    selectedStation:typeof input.selectedStation === 'string' ? input.selectedStation : base.selectedStation,
    selectedApparatus:typeof input.selectedApparatus === 'string' ? input.selectedApparatus : base.selectedApparatus,
    modifierId:typeof input.modifierId === 'string' ? input.modifierId : base.modifierId,
    callsThisShift:Math.max(0, number(input.callsThisShift)),
    lifetimeCalls:Math.max(0, number(input.lifetimeCalls)),
    lifetimeCredits:Math.max(0, number(input.lifetimeCredits)),
    districtReputation,
    apparatus,
    metrics:{
      cleanCalls:Math.max(0, number(metricsSource.cleanCalls)),
      waterCalls:Math.max(0, number(metricsSource.waterCalls)),
      crewCommands:Math.max(0, number(metricsSource.crewCommands)),
      fastTurnouts:Math.max(0, number(metricsSource.fastTurnouts)),
      districts:Array.isArray(metricsSource.districts) ? [...new Set(metricsSource.districts.filter(value => typeof value === 'string'))] : [],
      cleanEquipmentCalls:Math.max(0, number(metricsSource.cleanEquipmentCalls))
    },
    challenges:Array.isArray(input.challenges) && input.challenges.length ? input.challenges.filter(item => item && typeof item.id === 'string').map(item => ({ id:item.id, claimed:Boolean(item.claimed) })) : base.challenges,
    completedChallenges:Math.max(0, number(input.completedChallenges)),
    secondAlarms:Math.max(0, number(input.secondAlarms)),
    cityCommendations:Array.isArray(input.cityCommendations) ? [...new Set(input.cityCommendations.filter(value => typeof value === 'string'))] : []
  };
}

export class Phase4SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.load();
  }
  load() {
    try { return migratePhase4Save(JSON.parse(this.storage?.getItem(KEY) || 'null')); }
    catch { return defaultPhase4Save(); }
  }
  persist() {
    try { this.storage?.setItem(KEY, JSON.stringify(this.data)); return true; }
    catch { return false; }
  }
  apparatus(id = this.data.selectedApparatus) { return this.data.apparatus[id] || this.data.apparatus['engine-1']; }
  selectStation(id) { this.data.selectedStation = id; this.persist(); }
  selectApparatus(id) { this.data.selectedApparatus = id; this.persist(); }
  spend(amount) {
    const cost = Math.max(0, Math.ceil(number(amount)));
    if (this.data.credits < cost) return false;
    this.data.credits -= cost;
    this.persist();
    return true;
  }
  earn(amount) {
    const value = Math.max(0, Math.round(number(amount)));
    this.data.credits += value;
    this.data.lifetimeCredits += value;
    this.persist();
    return value;
  }
  service(id, kind, profile) {
    const apparatus = this.data.apparatus[id];
    if (!apparatus || !profile) return { ok:false, message:'Unknown apparatus.' };
    const quote = serviceQuote(apparatus, profile);
    const cost = quote[kind];
    if (cost == null) return { ok:false, message:'Unknown service option.' };
    if (!this.spend(cost)) return { ok:false, message:`Need ${cost} credits.` };
    if (kind === 'repair' || kind === 'full') apparatus.condition = repairCondition({});
    if (kind === 'refuel' || kind === 'full') apparatus.fuel = profile.fuelCapacity;
    if (kind === 'refill' || kind === 'full') apparatus.water = profile.tank;
    apparatus.lastServiceAt = Date.now();
    this.persist();
    return { ok:true, cost, quote, message:`${profile.label} service complete.` };
  }
  readiness(id = this.data.selectedApparatus) { return readinessScore(this.apparatus(id)); }
  recordCall(record = {}) {
    const apparatus = this.apparatus();
    apparatus.calls += 1;
    apparatus.distance += Math.max(0, number(record.distance));
    apparatus.fuel = Math.max(0, number(apparatus.fuel) - Math.max(0, number(record.fuelUsed)));
    apparatus.water = Math.max(0, Math.min(apparatus.maxWater, number(record.waterRemaining, apparatus.water)));
    if (record.condition) apparatus.condition = repairCondition(record.condition);
    this.data.callsThisShift += 1;
    this.data.lifetimeCalls += 1;
    if (record.collisions === 0) this.data.metrics.cleanCalls += 1;
    if (record.waterSupply) this.data.metrics.waterCalls += 1;
    this.data.metrics.crewCommands += Math.max(0, number(record.crewCommands));
    if (record.turnoutSeconds > 0 && record.turnoutSeconds < 35) this.data.metrics.fastTurnouts += 1;
    if (record.district && !this.data.metrics.districts.includes(record.district)) this.data.metrics.districts.push(record.district);
    if (!record.equipmentLeftBehind) this.data.metrics.cleanEquipmentCalls += 1;
    this.persist();
  }
  challengeStatus() {
    return this.data.challenges.map(entry => {
      const challenge = SHIFT_CHALLENGES.find(item => item.id === entry.id);
      return challenge ? { ...challenge, claimed:entry.claimed, ...challengeProgress(challenge, this.data.metrics) } : null;
    }).filter(Boolean);
  }
  claimChallenges() {
    let reward = 0;
    for (const entry of this.data.challenges) {
      const challenge = SHIFT_CHALLENGES.find(item => item.id === entry.id);
      if (!challenge || entry.claimed) continue;
      const progress = challengeProgress(challenge, this.data.metrics);
      if (!progress.complete) continue;
      entry.claimed = true;
      reward += challenge.reward;
      this.data.completedChallenges += 1;
    }
    if (reward) this.earn(reward); else this.persist();
    return reward;
  }
  nextShift(modifierId = 'normal') {
    const claimed = this.claimChallenges();
    this.data.shiftNumber += 1;
    this.data.callsThisShift = 0;
    this.data.modifierId = modifierId;
    this.data.metrics = { cleanCalls:0, waterCalls:0, crewCommands:0, fastTurnouts:0, districts:[], cleanEquipmentCalls:0 };
    this.data.challenges = pickChallenges(SHIFT_CHALLENGES, this.data.shiftNumber).map(item => ({ id:item.id, claimed:false }));
    this.persist();
    return claimed;
  }
}
