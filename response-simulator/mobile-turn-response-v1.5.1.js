(() => {
  'use strict';

  const VERSION = '1.5.1';
  if (window.PTBO_MOBILE_TURN_RESPONSE?.version === VERSION) return;

  const CONFIG = Object.freeze({
    activeBelowKmh: 28,
    stationaryExtraTurnDegreesPerSecond: 260,
    movingExtraTurnDegreesPerSecond: 115,
    stationaryResponsePerSecond: 24,
    movingResponsePerSecond: 14,
    snapDegrees: 0.3,
    maximumDeltaSeconds: 0.04,
  });

  const runtime = {
    lastTimestamp: 0,
    appliedFrames: 0,
  };

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const normalizeHeading = value => (Number(value) % 360 + 360) % 360;
  const shortestAngleDelta = (fromDegrees, toDegrees) => (
    (toDegrees - fromDegrees + 540) % 360
  ) - 180;

  function isMobileSimulator() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  function updateMarker(heading) {
    try {
      vehicleMarker?.setRotationOrigin?.('center center');
      vehicleMarker?.setRotationAngle?.(heading - 90);
      const headingNode = document.getElementById('tel-hdg');
      if (headingNode) headingNode.textContent = `${Math.round(heading)}°`;
    } catch {
      // Simulator globals may not be ready during startup or page dismissal.
    }
  }

  function applyLowSpeedResponse(deltaSeconds) {
    const instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    const tuning = window.PTBO_DIRECTIONAL_STEERING_TUNING;
    if (!instruments?.state || !tuning?.state) return;

    // Newer built-in tuning can advertise equal or faster values. In that case,
    // this compatibility layer stays idle instead of stacking two strong boosts.
    const tuningConfig = tuning.config || {};
    if (
      Number(tuningConfig.headingResponsePerSecond) >= CONFIG.stationaryResponsePerSecond
      && Number(tuningConfig.stationaryMinimumTurnDegreesPerSecond) >= 100
    ) return;

    const tuningState = tuning.state;
    if (
      instruments.state.steeringMode !== 'directional'
      || !tuningState.pointerActive
      || tuningState.targetHeading === null
      || deltaSeconds <= 0
    ) return;

    const speedKmh = Math.max(0, Number(instruments.state.speedKmh) || 0);
    if (speedKmh >= CONFIG.activeBelowKmh) return;

    let heading;
    try {
      heading = Number(currentHeading);
    } catch {
      return;
    }
    if (!Number.isFinite(heading)) return;

    const delta = shortestAngleDelta(heading, Number(tuningState.targetHeading));
    if (!Number.isFinite(delta)) return;

    if (Math.abs(delta) <= CONFIG.snapDegrees) {
      currentHeading = normalizeHeading(Number(tuningState.targetHeading));
      updateMarker(currentHeading);
      return;
    }

    const lowSpeedInfluence = 1 - clamp(speedKmh / CONFIG.activeBelowKmh, 0, 1);
    const extraTurnRate = CONFIG.movingExtraTurnDegreesPerSecond
      + (CONFIG.stationaryExtraTurnDegreesPerSecond - CONFIG.movingExtraTurnDegreesPerSecond)
        * lowSpeedInfluence;
    const responsePerSecond = CONFIG.movingResponsePerSecond
      + (CONFIG.stationaryResponsePerSecond - CONFIG.movingResponsePerSecond)
        * lowSpeedInfluence;
    const stickInfluence = 0.82 + 0.18 * clamp(Number(tuningState.stickMagnitude) || 0, 0, 1);

    const easedStep = delta * (1 - Math.exp(-responsePerSecond * deltaSeconds));
    const maximumStep = extraTurnRate * stickInfluence * deltaSeconds;
    const step = clamp(easedStep, -maximumStep, maximumStep);

    currentHeading = normalizeHeading(heading + step);
    runtime.appliedFrames += 1;
    updateMarker(currentHeading);
  }

  function animationTick(timestamp) {
    if (!runtime.lastTimestamp) runtime.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(
      CONFIG.maximumDeltaSeconds,
      Math.max(0, (timestamp - runtime.lastTimestamp) / 1000)
    );
    runtime.lastTimestamp = timestamp;

    if (isMobileSimulator()) applyLowSpeedResponse(deltaSeconds);
    requestAnimationFrame(animationTick);
  }

  window.PTBO_MOBILE_TURN_RESPONSE = Object.freeze({
    version: VERSION,
    config: CONFIG,
    runtime,
  });

  requestAnimationFrame(animationTick);
})();
