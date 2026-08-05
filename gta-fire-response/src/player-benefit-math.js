const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));

// Converts thumb-stick travel into throttle demand. The old game always added
// 20% throttle as soon as the stick crossed the dead zone, which made precise
// parking and corner setup difficult. Full stick and keyboard input still
// produce full speed, while small movements now produce a controllable crawl.
export function driveThrottleDemand(magnitude, deadzone = 0.08) {
  const raw = clamp(magnitude);
  if (raw <= deadzone) return 0;
  const normalized = clamp((raw - deadzone) / Math.max(0.01, 1 - deadzone));
  return clamp(0.055 + 0.945 * Math.pow(normalized, 1.55));
}

export function legacyThrottleDemand(magnitude) {
  const raw = clamp(magnitude);
  return raw > 0.08 ? 0.2 + 0.8 * raw : 0;
}

export function driveSpeedScale(magnitude) {
  const legacy = legacyThrottleDemand(magnitude);
  if (!legacy) return 1;
  return driveThrottleDemand(magnitude) / legacy;
}

export function reverseSpeedScale(magnitude) {
  const raw = clamp(magnitude);
  if (raw <= 0.08) return 1;
  return driveThrottleDemand(raw) / raw;
}

export function laneOffsetMeters(segment = {}, yielding = false) {
  const width = Math.max(8, Number(segment.width) || 12);
  const allowed = Math.max(width / 2, Number(segment.allowed) || width / 2);
  const normal = clamp(width * 0.17, 1.35, 3.15);
  if (!yielding) return normal;
  return Math.min(Math.max(normal + 1.15, 2.35), Math.max(normal, allowed - 0.85));
}

export function followingGap(vehicle, other, segmentLength) {
  if (!vehicle || !other || vehicle === other) return Infinity;
  if (vehicle.segmentId !== other.segmentId || vehicle.direction !== other.direction) return Infinity;
  const distance = (Number(other.t) - Number(vehicle.t)) * Number(vehicle.direction) * Math.max(0, Number(segmentLength) || 0);
  return distance > 0 ? distance : Infinity;
}

export function followingSpeedLimit(gap, cruiseSpeed) {
  const cruise = Math.max(0, Number(cruiseSpeed) || 0);
  if (!Number.isFinite(gap)) return cruise;
  if (gap <= 5.5) return 0;
  if (gap >= 24) return cruise;
  const ratio = clamp((gap - 5.5) / 18.5);
  return cruise * ratio * ratio;
}

export function selectSafeExit(candidates = [], traffic = [], activeCall = null, distance) {
  if (typeof distance !== 'function') return candidates[0] || null;
  return candidates.find(point => {
    const clearOfTraffic = traffic.every(vehicle => !vehicle?.active || distance(point, vehicle) > 4.8);
    const clearOfIncident = !activeCall || distance(point, activeCall) > 5.2;
    return clearOfTraffic && clearOfIncident;
  }) || null;
}

export function priorityScore({ impact = 0, reach = 0, confidence = 0, effort = 1, risk = 1 } = {}) {
  return (Math.max(0, impact) * Math.max(0, reach) * Math.max(0, confidence)) / Math.max(1, effort + risk);
}
