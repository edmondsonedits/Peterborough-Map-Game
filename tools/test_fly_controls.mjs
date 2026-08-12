import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const moduleSource = fs.readFileSync(new URL('city-explorer/fly-controls.js', root), 'utf8');
const controls = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);

const failures = [];
const fail = (message) => failures.push(message);
const close = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
const keys = (...codes) => new Set(codes);

const wasdForward = controls.flyAxesFromKeys(keys('KeyW'));
const arrowForward = controls.flyAxesFromKeys(keys('ArrowUp'));
if (!close(wasdForward.forward, arrowForward.forward) || wasdForward.forward !== 1) fail('ArrowUp is not an exact W alias');
if (controls.flyAxesFromKeys(keys('KeyS')).forward !== controls.flyAxesFromKeys(keys('ArrowDown')).forward) fail('ArrowDown is not an exact S alias');
if (controls.flyAxesFromKeys(keys('KeyW', 'ArrowUp')).forward !== 1) fail('duplicate forward aliases doubled input');
if (controls.flyAxesFromKeys(keys('KeyW', 'ArrowDown')).forward !== 0) fail('opposing forward inputs did not cancel');
if (controls.flyAxesFromKeys(keys('KeyA')).strafe !== controls.flyAxesFromKeys(keys('ArrowLeft')).strafe) fail('ArrowLeft is not an exact A alias');
if (controls.flyAxesFromKeys(keys('KeyD')).strafe !== controls.flyAxesFromKeys(keys('ArrowRight')).strafe) fail('ArrowRight is not an exact D alias');
if (controls.flyAxesFromKeys(keys('KeyA', 'ArrowRight')).strafe !== 0) fail('opposing strafe inputs did not cancel');
if (controls.flyAxesFromKeys(keys('KeyE')).vertical !== controls.flyAxesFromKeys(keys('PageUp')).vertical) fail('PageUp is not an exact E alias');
if (controls.flyAxesFromKeys(keys('KeyE')).vertical !== controls.flyAxesFromKeys(keys('Space')).vertical) fail('Space is not an exact E alias');
if (controls.flyAxesFromKeys(keys('KeyQ')).vertical !== controls.flyAxesFromKeys(keys('PageDown')).vertical) fail('PageDown is not an exact Q alias');
if (controls.flyAxesFromKeys(keys('KeyE', 'PageDown')).vertical !== 0) fail('opposing vertical inputs did not cancel');

const diagonal = controls.flyAxesFromKeys(keys('ArrowUp', 'ArrowRight', 'KeyE'));
if (!close(Math.hypot(diagonal.forward, diagonal.strafe, diagonal.vertical), 1)) fail('three-axis diagonal input is faster than straight flight');

const cruise = controls.flySpeedFor(1, {});
const boost = controls.flySpeedFor(1, { boost: true });
const precision = controls.flySpeedFor(1, { boost: true, precision: true });
if (!close(boost, cruise * controls.FLY_TUNING.boostMultiplier)) fail('boost multiplier is incorrect');
if (!close(precision, cruise * controls.FLY_TUNING.precisionMultiplier)) fail('precision mode does not override boost');
if (!controls.flyAxesFromKeys(keys('ShiftRight')).boost) fail('right Shift does not enable boost');
if (!controls.flyAxesFromKeys(keys('AltRight')).precision) fail('right Alt does not enable precision mode');

let scale = 1;
scale = controls.adjustFlySpeedScale(scale, -100);
if (!close(scale, controls.FLY_TUNING.speedStep)) fail('wheel-up did not increase speed');
scale = controls.adjustFlySpeedScale(scale, 100);
if (!close(scale, 1)) fail('wheel-down did not restore speed');
const trackpadScale = controls.adjustFlySpeedScale(1, -1);
if (!(trackpadScale > 1 && trackpadScale < 1.01)) fail('small trackpad delta changed speed too aggressively');
for (let index = 0; index < 30; index += 1) scale = controls.adjustFlySpeedScale(scale, -100);
if (scale !== controls.FLY_TUNING.maximumSpeedScale) fail('speed adjustment exceeded its maximum');
for (let index = 0; index < 100; index += 1) scale = controls.adjustFlySpeedScale(scale, 100);
if (scale !== controls.FLY_TUNING.minimumSpeedScale) fail('speed adjustment exceeded its minimum');

const look = controls.applyFlyLookDelta(0, 0, 100, -100);
if (!(look.yaw < 0) || !(look.pitch > 0)) fail('mouse-look direction is inverted');
const clampedLook = controls.applyFlyLookDelta(0, 0, 0, -100000);
if (clampedLook.pitch !== controls.FLY_TUNING.pitchMaximum) fail('mouse pitch exceeded its upper limit');
const lowerClampedLook = controls.applyFlyLookDelta(0, 0, 0, 100000);
if (lowerClampedLook.pitch !== controls.FLY_TUNING.pitchMinimum) fail('mouse pitch exceeded its lower limit');
if (!close(controls.wrapFlyYaw(Math.PI * 5), -Math.PI)) fail('yaw wrapping is unstable');
const landmarkYaw = controls.flyYawToward(110, 180, 0, 0);
const landmarkForward = { x: -Math.sin(landmarkYaw), z: -Math.cos(landmarkYaw) };
const landmarkLength = Math.hypot(110, 180);
const landmarkDirection = { x: -110 / landmarkLength, z: -180 / landmarkLength };
if (landmarkForward.x * landmarkDirection.x + landmarkForward.z * landmarkDirection.z < 0.999999) {
  fail('quick travel camera does not face the selected landmark');
}

function simulate(deltas, initialVelocity, targetVelocity, response) {
  let position = 0;
  let velocity = initialVelocity;
  deltas.forEach((delta) => {
    const step = controls.dampedAxisStep(velocity, targetVelocity, response, delta);
    position += step.displacement;
    velocity = step.velocity;
  });
  return { position, velocity };
}

const fixedDeltas = (fps) => Array.from({ length: fps }, () => 1 / fps);
const irregularDeltas = [0.011, 0.027, 0.008, 0.05, 0.019, 0.034, 0.013, 0.041, 0.022, 0.016];
const irregularSecond = [];
let irregularTotal = 0;
while (irregularTotal < 1 - 1e-12) {
  const next = Math.min(irregularDeltas[irregularSecond.length % irregularDeltas.length], 1 - irregularTotal);
  irregularSecond.push(next);
  irregularTotal += next;
}

const targetVelocity = cruise;
const accelerationRuns = [30, 60, 144].map((fps) => simulate(fixedDeltas(fps), 0, targetVelocity, controls.FLY_TUNING.accelerationResponse));
accelerationRuns.push(simulate(irregularSecond, 0, targetVelocity, controls.FLY_TUNING.accelerationResponse));
const referenceAcceleration = accelerationRuns[0];
accelerationRuns.slice(1).forEach((run, index) => {
  if (!close(run.position, referenceAcceleration.position, 1e-8) || !close(run.velocity, referenceAcceleration.velocity, 1e-8)) {
    fail(`frame-rate-independent acceleration failed run ${index + 2}`);
  }
});

const brakingRuns = [30, 60, 144].map((fps) => simulate(fixedDeltas(fps), referenceAcceleration.velocity, 0, controls.FLY_TUNING.brakingResponse));
brakingRuns.push(simulate(irregularSecond, referenceAcceleration.velocity, 0, controls.FLY_TUNING.brakingResponse));
const referenceBraking = brakingRuns[0];
brakingRuns.slice(1).forEach((run, index) => {
  if (!close(run.position, referenceBraking.position, 1e-8) || !close(run.velocity, referenceBraking.velocity, 1e-8)) {
    fail(`frame-rate-independent braking failed run ${index + 2}`);
  }
});
if (!(referenceBraking.velocity > 0 && referenceBraking.velocity < referenceAcceleration.velocity)) fail('braking overshot or reversed velocity');

const zeroStep = controls.dampedAxisStep(12, 100, controls.FLY_TUNING.accelerationResponse, 0);
if (zeroStep.displacement !== 0 || zeroStep.velocity !== 12) fail('zero-delta damping changed motion');
['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'PageUp', 'PageDown', 'Space', 'ShiftLeft', 'AltLeft'].forEach((code) => {
  if (!controls.isFlyControlCode(code)) fail(`${code} is missing from the flight control set`);
});

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  arrowAliases: true,
  diagonalNormalized: true,
  frameRateIndependent: true,
  cruiseSpeedMetresPerSecond: cruise,
  boostSpeedMetresPerSecond: boost,
  precisionSpeedMetresPerSecond: Number(precision.toFixed(1)),
  pitchLimitDegrees: 85,
  quickTravelFacesLandmark: true,
}, null, 2));
