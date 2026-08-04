const EARTH_RADIUS = 6371000;

export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = value => value * Math.PI / 180;
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function readinessScore(apparatus = {}) {
  const condition = apparatus.condition || {};
  const systems = ['body','steering','engine','lights','pump'].map(key => Number(condition[key] ?? 100));
  const systemAverage = systems.reduce((sum, value) => sum + value, 0) / systems.length;
  const fuel = Number(apparatus.fuel ?? 100);
  const waterRatio = apparatus.maxWater ? Number(apparatus.water ?? apparatus.maxWater) / apparatus.maxWater * 100 : 100;
  return Math.max(0, Math.min(100, systemAverage * .55 + fuel * .25 + waterRatio * .2));
}

export function serviceQuote(apparatus = {}, profile = {}) {
  const condition = apparatus.condition || {};
  const repairDeficit = ['body','steering','engine','lights','pump'].reduce((sum, key) => sum + Math.max(0, 100 - Number(condition[key] ?? 100)), 0);
  const fuelMissing = Math.max(0, Number(profile.fuelCapacity ?? 100) - Number(apparatus.fuel ?? profile.fuelCapacity ?? 100));
  const waterMissing = Math.max(0, Number(profile.tank ?? 750) - Number(apparatus.water ?? profile.tank ?? 750));
  const repair = Math.ceil(repairDeficit * 1.4);
  const refuel = Math.ceil(fuelMissing * 1.1);
  const refill = Math.ceil(waterMissing * .035);
  return { repair, refuel, refill, full:Math.max(0, Math.ceil((repair + refuel + refill) * .9)) };
}

export function chooseCoverageStation(call, stations, apparatusByStation = {}) {
  return [...stations].map(station => {
    const readiness = readinessScore(apparatusByStation[station.id] || {});
    const distance = distanceMeters(call, station);
    const responseMinutes = distance / 700 + 1.1;
    const score = Math.max(0, 100 - responseMinutes * 8) * (.55 + readiness / 220);
    return { station, distance, responseMinutes, readiness, score };
  }).sort((a, b) => b.score - a.score)[0] || null;
}

export function coverageGrade(score) {
  return score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 48 ? 'Stretched' : 'Exposed';
}

export function callPayout({ score = 0, tacticalRank = 'C', responseMinutes = 5, modifier = 1, readiness = 100 } = {}) {
  const rankBonus = ({ S:180, A:120, B:70, C:35, D:0 })[tacticalRank] ?? 20;
  const speedBonus = Math.max(0, Math.round(100 - responseMinutes * 12));
  const readinessBonus = Math.round(Math.max(0, readiness - 65) * 1.4);
  return Math.max(75, Math.round((Number(score) * .18 + rankBonus + speedBonus + readinessBonus) * Number(modifier || 1)));
}

export function fuelUse(distanceMetersDriven = 0, profile = {}) {
  const heavyFactor = profile.id === 'ladder-1' ? 1.35 : profile.id === 'rescue-3' ? .92 : 1;
  return Math.max(0, distanceMetersDriven / 1000 * 3.1 * heavyFactor);
}

export function pickChallenges(challenges, shiftNumber, count = 3) {
  if (!challenges.length) return [];
  const start = Math.abs(Number(shiftNumber) || 1) % challenges.length;
  const selected = [];
  for (let index = 0; index < challenges.length && selected.length < count; index += 1) selected.push(challenges[(start + index * 2) % challenges.length]);
  return [...new Map(selected.map(item => [item.id, item])).values()];
}

export function challengeProgress(challenge, metrics = {}) {
  const value = challenge.metric === 'districts' ? new Set(metrics.districts || []).size : Number(metrics[challenge.metric] || 0);
  return { value, target:challenge.target, ratio:Math.max(0, Math.min(1, value / Math.max(1, challenge.target))), complete:value >= challenge.target };
}

export function districtReputationDelta({ rank = 'C', collisions = 0, escalations = 0, completed = true } = {}) {
  if (!completed) return -4;
  const base = ({ S:7, A:5, B:3, C:2, D:1 })[rank] ?? 1;
  return Math.max(-5, base - Math.max(0, collisions) * 2 - Math.max(0, escalations));
}

export function mutualAidEta(distance = 0, speed = 16, staffingPenalty = 1) {
  return Math.max(4, distance / Math.max(4, speed) * Math.max(1, staffingPenalty));
}
