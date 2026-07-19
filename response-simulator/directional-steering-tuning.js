(() => {
  'use strict';

  if (window.PTBO_DIRECTIONAL_STEERING_TUNING) return;

  const DEFAULT_MIGRATION_KEY = 'ptboDirectionalSteeringDefaultV2';
  const DIRECTIONAL_MODE = 'directional';
  const CONFIG = Object.freeze({
    retryDelayMs: 60,
    snapDegrees: 0.35,
    fullTurnAngleDegrees: 95,
    lowSpeedReferenceKmh: 120,
    lowSpeedMinimumTurnDegreesPerSecond: 20,
    lowSpeedMaximumTurnDegreesPerSecond: 220,
    stationaryMinimumTurnDegreesPerSecond: 16,
    stationaryMaximumTurnDegreesPerSecond: 145,
    highSpeedTurnMultiplier: 0.28,
    angleCurve: 0.62,
    minimumStickInfluence: 0.68,
    headingResponsePerSecond: 11,
    movementThreshold: 0.00000001,
  });

  const tuningState = {
    installed: false,
    targetHeading: null,
    stickMagnitude: 0,
    lastTimestamp: 0,
  };

  let instruments = null;
  let steeringElement = null;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const normalizeHeading = value => (Number(value) % 360 + 360) % 360;
  const shortestAngleDelta = (fromDegrees, toDegrees) => (
    (toDegrees - fromDegrees + 540) % 360
  ) - 180;

  function directionalIsActive() {
    return instruments?.state?.steeringMode === DIRECTIONAL_MODE;
  }

  function suppressLegacyDirectionalTarget() {
    if (!directionalIsActive()) return;
    const target = Number(instruments.state.directionalTargetHeading);
    if (Number.isFinite(target)) {
      tuningState.targetHeading = normalizeHeading(target);
      tuningState.stickMagnitude = clamp(
        Number(instruments.state.directionalMagnitude) || 0,
        0,
        1
      );
    }
    instruments.state.directionalTargetHeading = null;
  }

  function captureDirectionalTarget() {
    queueMicrotask(suppressLegacyDirectionalTarget);
  }

  function releaseDirectionalTarget() {
    queueMicrotask(() => {
      tuningState.targetHeading = null;
      tuningState.stickMagnitude = 0;
      if (instruments?.state) instruments.state.directionalTargetHeading = null;
    });
  }

  function calculateTurnRate(angleDifference, speedKmh, isStationary) {
    const angleRatio = clamp(
      Math.abs(angleDifference) / CONFIG.fullTurnAngleDegrees,
      0,
      1
    );
    const angleInfluence = angleRatio ** CONFIG.angleCurve;

    const minimumRate = isStationary
      ? CONFIG.stationaryMinimumTurnDegreesPerSecond
      : CONFIG.lowSpeedMinimumTurnDegreesPerSecond;
    const maximumRate = isStationary
      ? CONFIG.stationaryMaximumTurnDegreesPerSecond
      : CONFIG.lowSpeedMaximumTurnDegreesPerSecond;
    const angleBasedRate = minimumRate + (maximumRate - minimumRate) * angleInfluence;

    const speedRatio = clamp(speedKmh / CONFIG.lowSpeedReferenceKmh, 0, 1);
    const speedMultiplier = 1 - (
      1 - CONFIG.highSpeedTurnMultiplier
    ) * (speedRatio ** 0.9);
    const stickMultiplier = CONFIG.minimumStickInfluence + (
      1 - CONFIG.minimumStickInfluence
    ) * tuningState.stickMagnitude;

    return angleBasedRate * speedMultiplier * stickMultiplier;
  }

  function applyAdaptiveDirectionalSteering(deltaSeconds) {
    if (!directionalIsActive() || tuningState.targetHeading === null || deltaSeconds <= 0) return;

    let heading;
    let currentVelocity;
    try {
      heading = Number(currentHeading);
      currentVelocity = Number(velocity);
    } catch {
      return;
    }
    if (!Number.isFinite(heading)) return;

    const delta = shortestAngleDelta(heading, tuningState.targetHeading);
    const absoluteDelta = Math.abs(delta);
    if (absoluteDelta <= CONFIG.snapDegrees) {
      currentHeading = tuningState.targetHeading;
    } else {
      const speedKmh = Math.max(0, Number(instruments.state.speedKmh) || 0);
      const isStationary = !Number.isFinite(currentVelocity)
        || Math.abs(currentVelocity) <= CONFIG.movementThreshold;
      const maximumStep = calculateTurnRate(delta, speedKmh, isStationary) * deltaSeconds;

      // Far-away targets use the higher rate above. Exponential easing becomes
      // dominant near the target, creating a soft, controlled final alignment.
      const speedRatio = clamp(speedKmh / CONFIG.lowSpeedReferenceKmh, 0, 1);
      const responsePerSecond = CONFIG.headingResponsePerSecond * (1 - 0.48 * speedRatio);
      const easedStep = delta * (1 - Math.exp(-responsePerSecond * deltaSeconds));
      const step = clamp(easedStep, -maximumStep, maximumStep);
      currentHeading = normalizeHeading(heading + step);
    }

    vehicleMarker?.setRotationOrigin?.('center center');
    vehicleMarker?.setRotationAngle?.(currentHeading - 90);
    const headingNode = document.getElementById('tel-hdg');
    if (headingNode) headingNode.textContent = `${Math.round(currentHeading)}°`;
  }

  function updateOptionsDescription() {
    const note = document.getElementById('ptbo-steering-mode-note');
    if (note) {
      note.textContent = 'Directional mode turns quickly toward large heading changes, eases softly as the truck aligns, and reduces steering at higher speeds.';
    }
  }

  function makeDirectionalDefault() {
    if (!instruments?.setSteeringMode) return;
    if (localStorage.getItem(DEFAULT_MIGRATION_KEY) !== '1') {
      instruments.setSteeringMode(DIRECTIONAL_MODE);
      localStorage.setItem(DEFAULT_MIGRATION_KEY, '1');
    }
  }

  function animationTick(timestamp) {
    if (!tuningState.lastTimestamp) tuningState.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(
      0.05,
      Math.max(0, (timestamp - tuningState.lastTimestamp) / 1000)
    );
    tuningState.lastTimestamp = timestamp;

    // Prevent the earlier fixed-rate directional routine from also steering.
    suppressLegacyDirectionalTarget();
    applyAdaptiveDirectionalSteering(deltaSeconds);
    requestAnimationFrame(animationTick);
  }

  function install() {
    instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    try {
      steeringElement = window.parent !== window
        ? window.parent.document.getElementById('steering')
        : null;
    } catch {
      steeringElement = null;
    }

    if (!instruments || !steeringElement) {
      setTimeout(install, CONFIG.retryDelayMs);
      return;
    }

    makeDirectionalDefault();
    updateOptionsDescription();

    steeringElement.addEventListener('pointerdown', captureDirectionalTarget, true);
    steeringElement.addEventListener('pointermove', captureDirectionalTarget, true);
    steeringElement.addEventListener('pointerup', releaseDirectionalTarget, true);
    steeringElement.addEventListener('pointercancel', releaseDirectionalTarget, true);
    steeringElement.addEventListener('lostpointercapture', releaseDirectionalTarget, true);

    window.addEventListener('ptbo-steering-mode-change', event => {
      tuningState.targetHeading = null;
      tuningState.stickMagnitude = 0;
      if (event.detail?.mode === DIRECTIONAL_MODE) updateOptionsDescription();
    });
    window.parent.addEventListener('blur', releaseDirectionalTarget, true);
    window.parent.document.addEventListener('visibilitychange', () => {
      if (window.parent.document.hidden) releaseDirectionalTarget();
    });

    tuningState.installed = true;
    requestAnimationFrame(animationTick);
  }

  window.PTBO_DIRECTIONAL_STEERING_TUNING = Object.freeze({
    state: tuningState,
    config: CONFIG,
  });

  install();
})();
