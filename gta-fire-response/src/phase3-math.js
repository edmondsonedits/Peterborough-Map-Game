export function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }

export function calculateEscalation({ elapsedSeconds = 0, baseRisk = 20, completedRatio = 0, supportOnScene = 0, waterSupply = false } = {}) {
  const timePressure = Math.max(0, elapsedSeconds - 45) * 0.18;
  const mitigation = clamp01(completedRatio) * 38 + Math.max(0, supportOnScene) * 4 + (waterSupply ? 12 : 0);
  return Math.max(0, Math.min(100, baseRisk + timePressure - mitigation));
}

export function staminaStep(current, { moving = false, running = false, working = false, resting = false } = {}, dt = 0) {
  let rate = resting ? 15 : 5.5;
  if (moving) rate -= 5.5;
  if (running) rate -= 12;
  if (working) rate -= 8;
  return Math.max(0, Math.min(100, current + rate * Math.max(0, dt)));
}

export function airStep(current, { maskOn = false, nearHazard = false, working = false } = {}, dt = 0) {
  if (!maskOn) return Math.max(0, Math.min(100, current));
  const use = 0.55 + (nearHazard ? 0.75 : 0) + (working ? 0.85 : 0);
  return Math.max(0, Math.min(100, current - use * Math.max(0, dt)));
}

export function operationGrade({ completionRatio = 0, failedEssential = 0, elapsedSeconds = 0, collisions = 0, escalations = 0, optionalCompleted = 0 } = {}) {
  const completion = Math.round(clamp01(completionRatio) * 520);
  const speed = Math.max(0, 240 - Math.max(0, elapsedSeconds - 90) * 1.15);
  const safety = Math.max(0, 180 - collisions * 55 - escalations * 24);
  const bonus = Math.max(0, optionalCompleted) * 35;
  const penalty = Math.max(0, failedEssential) * 180;
  const score = Math.max(100, Math.round(completion + speed + safety + bonus - penalty));
  const rank = score >= 900 ? 'S' : score >= 760 ? 'A' : score >= 590 ? 'B' : score >= 420 ? 'C' : 'D';
  return { score, rank, breakdown: { completion, speed: Math.round(speed), safety, bonus, penalty } };
}

export function levelForXp(xp, thresholds = [0, 400, 900, 1600, 2500, 3600]) {
  const value = Math.max(0, Number(xp) || 0);
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) if (value >= thresholds[index]) level = index + 1;
  return level;
}
