(() => {
  'use strict';

  const VERSION = '1.5.2';
  if (window.PTBO_MOBILE_TURN_RESPONSE?.version === VERSION) return;

  const CONFIG = Object.freeze({
    activeBelowKmh: 200,
    stationaryTurnDegreesPerSecond: 780,
    movingTurnDegreesPerSecond: 345,
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

  function applyImmediateTurnResponse(deltaSeconds) {
    const instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    const tuning = window.PTBO_DIRECTIONAL_STEERING_TUNING;
    if (!instruments?.state || !tuning?.state) return;

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
    let currentVelocity;
    try {
      heading = Number(currentHeading);
      currentVelocity = Number(velocity);
    } catch {
      return;
    }
    if (!Number.isFinite(heading)) return;

    const targetHeading = Number(tuningState.targetHeading);
    const delta = shortestAngleDelta(heading, targetHeading);
    if (!Number.isFinite(delta)) return;

    if (Math.abs(delta) <= CONFIG.snapDegrees) {
      currentHeading = normalizeHeading(targetHeading);
      updateMarker(currentHeading);
      return;
    }

    const speedInfluence = 1 - clamp(speedKmh / CONFIG.activeBelowKmh, 0, 1);
    const isStationary = !Number.isFinite(currentVelocity) || Math.abs(currentVelocity) <= 0.00000001;
    const maximumTurnRate = isStationary
      ? CONFIG.stationaryTurnDegreesPerSecond
      : CONFIG.movingTurnDegreesPerSecond
        + (CONFIG.stationaryTurnDegreesPerSecond - CONFIG.movingTurnDegreesPerSecond)
          * speedInfluence;
    const stickInfluence = 0.82 + 0.18 * clamp(Number(tuningState.stickMagnitude) || 0, 0, 1);
    const maximumStep = maximumTurnRate * stickInfluence * deltaSeconds;

    // No input smoothing or exponential ramp: the full turn rate is available
    // on the first animation frame after the steering direction changes.
    const step = Math.sign(delta) * Math.min(Math.abs(delta), maximumStep);
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

    if (isMobileSimulator()) applyImmediateTurnResponse(deltaSeconds);
    requestAnimationFrame(animationTick);
  }

  window.PTBO_MOBILE_TURN_RESPONSE = Object.freeze({
    version: VERSION,
    config: CONFIG,
    runtime,
  });

  requestAnimationFrame(animationTick);
})();