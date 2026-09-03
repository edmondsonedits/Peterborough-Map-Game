/* Pure longitudinal speed control. The simulator calls this at its fixed timestep. */
(() => {
  'use strict';
  const gearSpeedsKmh = Object.freeze([50, 100, 150, 200, 250, 999]);
  const velocityToKmh = 111195 * 60 * 3.6;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function speedForGear(gear) {
    return gearSpeedsKmh[clamp(Math.round(Number(gear) || 1), 1, 6) - 1];
  }

  function stepSpeed(speedKmh, gear, throttle, seconds) {
    const speed = Number.isFinite(speedKmh) ? speedKmh : 0;
    const dt = clamp(Number(seconds) || 0, 0, 0.1);
    // Brake through zero before reversing. Releasing the stick coasts to a stop.
    const target = throttle < 0 ? -30 : throttle > 0 ? speedForGear(gear) : 0;
    const difference = target - speed;
    if (!difference || !dt) return speed;
    const slowing = speed * difference < 0;
    const rate = slowing ? (throttle === 0 ? 24 : 45) : (gear === 6 && throttle > 0 ? 12 : 18);
    // Bounded acceleration, with exponential easing over the final few km/h.
    // Gear changes only change the target; they never assign the truck's speed.
    const change = Math.min(rate * dt, Math.abs(difference) * (1 - Math.exp(-dt / 0.45)));
    const next = speed + Math.sign(difference) * change;
    return Math.abs(target - next) < 0.001 ? target : next;
  }

  const api = Object.freeze({ gearSpeedsKmh, velocityToKmh, speedForGear, stepSpeed });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.PTBO_GEARBOX = api;
})();
