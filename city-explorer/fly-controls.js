/*
  Peterborough Explorer desktop free-flight controls.

  This module has no DOM or Three.js dependency. Input aliases, look clamping,
  speed tuning, and frame-rate-independent damping stay testable without loading
  the full city renderer.
*/

export const FLY_TUNING = Object.freeze({
  accelerationResponse: 8.2,
  baseSpeed: 110,
  boostMultiplier: 3.4,
  brakingResponse: 5.6,
  maximumFrameDelta: 0.05,
  maximumSpeedScale: 3,
  minimumClearance: 5,
  minimumSpeedScale: 0.25,
  mouseSensitivityX: 0.0021,
  mouseSensitivityY: 0.0018,
  pitchMaximum: 85 * Math.PI / 180,
  pitchMinimum: -85 * Math.PI / 180,
  precisionMultiplier: 0.28,
  speedStep: 1.25,
});

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACKWARD_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];
const UP_KEYS = ['KeyE', 'Space', 'PageUp'];
const DOWN_KEYS = ['KeyQ', 'PageDown'];
const BOOST_KEYS = ['ShiftLeft', 'ShiftRight'];
const PRECISION_KEYS = ['AltLeft', 'AltRight'];
const CONTROL_CODES = new Set([
  ...FORWARD_KEYS,
  ...BACKWARD_KEYS,
  ...LEFT_KEYS,
  ...RIGHT_KEYS,
  ...UP_KEYS,
  ...DOWN_KEYS,
  ...BOOST_KEYS,
  ...PRECISION_KEYS,
]);

const keyIsDown = (keys, aliases) => aliases.some((code) => keys?.has?.(code));

export function clampFlySpeedScale(value, tuning = FLY_TUNING) {
  const finiteValue = Number.isFinite(value) ? value : 1;
  return Math.min(tuning.maximumSpeedScale, Math.max(tuning.minimumSpeedScale, finiteValue));
}

export function adjustFlySpeedScale(current, wheelDelta, tuning = FLY_TUNING) {
  const clamped = clampFlySpeedScale(current, tuning);
  if (!Number.isFinite(wheelDelta) || wheelDelta === 0) return clamped;
  // One conventional mouse-wheel notch is about 100 delta units. Fractional
  // trackpad deltas adjust continuously instead of racing to the speed limits.
  const notches = Math.min(4, Math.max(-4, -wheelDelta / 100));
  const multiplier = tuning.speedStep ** notches;
  return clampFlySpeedScale(clamped * multiplier, tuning);
}

export function flyAxesFromKeys(keys) {
  let forward = Number(keyIsDown(keys, FORWARD_KEYS)) - Number(keyIsDown(keys, BACKWARD_KEYS));
  let strafe = Number(keyIsDown(keys, RIGHT_KEYS)) - Number(keyIsDown(keys, LEFT_KEYS));
  let vertical = Number(keyIsDown(keys, UP_KEYS)) - Number(keyIsDown(keys, DOWN_KEYS));
  const length = Math.hypot(forward, strafe, vertical);
  if (length > 1) {
    forward /= length;
    strafe /= length;
    vertical /= length;
  }
  return {
    boost: keyIsDown(keys, BOOST_KEYS),
    forward,
    moving: length > 0,
    precision: keyIsDown(keys, PRECISION_KEYS),
    strafe,
    vertical,
  };
}

export function flySpeedFor(scale, axes = {}, tuning = FLY_TUNING) {
  const modifier = axes.precision
    ? tuning.precisionMultiplier
    : axes.boost
      ? tuning.boostMultiplier
      : 1;
  return tuning.baseSpeed * clampFlySpeedScale(scale, tuning) * modifier;
}

export function isFlyControlCode(code) {
  return CONTROL_CODES.has(code);
}

export function wrapFlyYaw(value) {
  if (!Number.isFinite(value)) return 0;
  const turn = Math.PI * 2;
  return ((value + Math.PI) % turn + turn) % turn - Math.PI;
}

export function flyYawToward(fromX, fromZ, toX, toZ) {
  const dx = Number(fromX) - Number(toX);
  const dz = Number(fromZ) - Number(toZ);
  if (!Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 0.000001) return 0;
  return wrapFlyYaw(Math.atan2(dx, dz));
}

export function applyFlyLookDelta(yaw, pitch, movementX, movementY, tuning = FLY_TUNING) {
  const dx = Number.isFinite(movementX) ? movementX : 0;
  const dy = Number.isFinite(movementY) ? movementY : 0;
  return {
    pitch: Math.min(tuning.pitchMaximum, Math.max(tuning.pitchMinimum, pitch - dy * tuning.mouseSensitivityY)),
    yaw: wrapFlyYaw(yaw - dx * tuning.mouseSensitivityX),
  };
}

export function dampingFactors(response, delta) {
  const safeResponse = Math.max(0.0001, Number.isFinite(response) ? response : 0.0001);
  const safeDelta = Math.max(0, Number.isFinite(delta) ? delta : 0);
  const decay = Math.exp(-safeResponse * safeDelta);
  const velocityIntegral = (1 - decay) / safeResponse;
  return {
    decay,
    targetIntegral: safeDelta - velocityIntegral,
    velocityIntegral,
  };
}

export function dampedAxisStep(currentVelocity, targetVelocity, response, delta) {
  const factors = dampingFactors(response, delta);
  return {
    displacement: currentVelocity * factors.velocityIntegral + targetVelocity * factors.targetIntegral,
    velocity: currentVelocity * factors.decay + targetVelocity * (1 - factors.decay),
  };
}
