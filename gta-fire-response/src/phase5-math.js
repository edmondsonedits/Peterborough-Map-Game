export function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(number) ? number : min));
}

export function performanceTier(fps = 60, previous = 'high') {
  const value = Number(fps) || 0;
  if (value < 28) return 'low';
  if (value < 42) return previous === 'low' ? 'low' : 'medium';
  if (value > 54) return 'high';
  return previous;
}

export function adaptiveScale(tier = 'high') {
  return ({ low:.48, medium:.72, high:1 })[tier] || 1;
}

export function pickVariant(call, variantsByType, random = Math.random) {
  const list = variantsByType[call?.type] || variantsByType.rescue || [];
  if (!list.length) return null;
  return list[Math.min(list.length - 1, Math.floor(clamp(random(), 0, .999999) * list.length))];
}

export function weightedCall(calls, { lastId = null, districtReputation = {}, station = null, distance = () => 0, random = Math.random } = {}) {
  const pool = [];
  for (const call of calls) {
    if (!call || call.id === lastId) continue;
    let weight = 4;
    const metres = station ? distance(station, call) : 0;
    if (metres < 2200) weight += 3;
    else if (metres < 4200) weight += 1;
    const reputation = Number(districtReputation[call.district] ?? 50);
    if (reputation < 40) weight += 2;
    if (reputation > 75) weight -= 1;
    for (let index = 0; index < Math.max(1, Math.round(weight)); index += 1) pool.push(call);
  }
  return pool[Math.floor(clamp(random(), 0, .999999) * pool.length)] || calls[0] || null;
}

export function effectiveRisk(baseRisk = 0, variantRisk = 0, difficultyRisk = 1) {
  return clamp((Number(baseRisk) + Number(variantRisk)) * Number(difficultyRisk || 1), 0, 100);
}

export function perkTaskRate(baseRate = 1, { unlocks = [], objectiveId = '', callType = '', apparatusId = '' } = {}) {
  let rate = Number(baseRate) || 1;
  if (unlocks.includes('thermal-camera') && ['search','overhaul','meter','investigate'].includes(objectiveId)) rate *= 1.18;
  if (unlocks.includes('rescue-saw') && ['access','stabilize','debris'].includes(objectiveId)) rate *= 1.2;
  if (unlocks.includes('foam-kit') && callType === 'vehicle-fire' && objectiveId === 'attack') rate *= 1.22;
  if (apparatusId === 'rescue-3' && ['access','stabilize','assessment','treatment'].includes(objectiveId)) rate *= 1.12;
  if (apparatusId === 'ladder-1' && callType === 'structure-fire' && ['search','overhaul'].includes(objectiveId)) rate *= 1.12;
  return rate;
}

export function debriefBreakdown({ tacticalScore = 0, responseSeconds = 0, collisions = 0, escalations = 0, completionRatio = 1, waterSupply = false, support = 0, equipmentLeft = 0, difficulty = 1, variant = 1 } = {}) {
  const response = Math.max(0, Math.round(180 - Number(responseSeconds) * 1.5));
  const tactics = Math.max(0, Math.round(Number(tacticalScore)));
  const safety = Math.max(0, 180 - Math.max(0, Number(collisions)) * 55 - Math.max(0, Number(escalations)) * 22);
  const completion = Math.round(clamp(completionRatio, 0, 1) * 180);
  const water = waterSupply ? 45 : 0;
  const coordination = Math.min(70, Math.max(0, Number(support)) * 20);
  const equipment = Math.max(-80, -Math.max(0, Number(equipmentLeft)) * 20);
  const raw = response + tactics + safety + completion + water + coordination + equipment;
  const total = Math.max(0, Math.round(raw * Number(difficulty || 1) * Number(variant || 1)));
  return { response, tactics, safety, completion, water, coordination, equipment, total };
}

export function gradeForScore(score = 0) {
  const value = Number(score) || 0;
  return value >= 950 ? 'S' : value >= 760 ? 'A' : value >= 580 ? 'B' : value >= 380 ? 'C' : 'D';
}

export function medalProgress(medal, metrics = {}) {
  const source = metrics[medal.metric];
  const value = Array.isArray(source) ? new Set(source).size : Number(source || 0);
  return { value, target:medal.target, ratio:clamp(value / Math.max(1, medal.target), 0, 1), complete:value >= medal.target };
}

export function average(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : 0;
}

export function serviceRecordSummary(records = []) {
  const completed = records.length;
  const totalScore = records.reduce((sum, record) => sum + Number(record.score || 0), 0);
  const response = average(records.map(record => record.responseSeconds));
  const sRanks = records.filter(record => record.rank === 'S').length;
  const clean = records.filter(record => Number(record.collisions || 0) === 0).length;
  return {
    completed,
    averageScore:completed ? Math.round(totalScore / completed) : 0,
    averageResponse:Math.round(response),
    sRanks,
    clean,
    cleanRate:completed ? Math.round(clean / completed * 100) : 0
  };
}

export function safeJsonParse(text) {
  try { return { ok:true, value:JSON.parse(text) }; }
  catch (error) { return { ok:false, error:error?.message || 'Invalid JSON' }; }
}
