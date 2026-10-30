(() => {
  'use strict';

  if (window.PTBO_DIRECTIONAL_STEERING_TUNING) return;
  const frameElement = (() => {
    try { return window.frameElement || (window.parent !== window ? window.parent.document.getElementById('simulator') : null); }
    catch { return null; }
  })();
  const frameDocument = document;

  const DEFAULT_MIGRATION_KEY = 'ptboDirectionalSteeringDefaultV2';
  const DIRECTIONAL_MODE = 'directional';
  const CONFIG = Object.freeze({
    retryDelayMs: 60,
    snapDegrees: 0.35,
    fullTurnAngleDegrees: 95,
    lowSpeedReferenceKmh: 70,
    lowSpeedMinimumTurnDegreesPerSecond: 46,
    lowSpeedMaximumTurnDegreesPerSecond: 300,
    stationaryMinimumTurnDegreesPerSecond: 46,
    stationaryMaximumTurnDegreesPerSecond: 300,
    highSpeedTurnMultiplier: 0.18,
    angleCurve: 0.62,
    minimumStickInfluence: 0.68,
    headingResponsePerSecond: 14,
    movementThreshold: 0.00000001,
  });

  const tuningState = {
    installed: false,
    pointerActive: false,
    pointerId: null,
    targetHeading: null,
    heldHeading: null,
    stickMagnitude: 0,
    lastTimestamp: 0,
  };

  let instruments = null;
  let steeringElement = null;
  let parentDocument = null;
  let pointerGeneration = 0;
  let disposed = false;
  let defaultsApplied = false;
  let animationFrame = 0;
  let retryTimer = 0;
  const inputListeners = [];

  function listenForInput(target, type, handler, capture = false) {
    target.addEventListener(type, handler, capture);
    inputListeners.push(() => target.removeEventListener(type, handler, capture));
  }

  function disconnectDirectionalSteering() {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame?.(animationFrame);
    window.clearTimeout(retryTimer);
    releaseDirectionalTarget();
    inputListeners.splice(0).forEach(remove => remove());
    if (steeringElement?.ptboDirectionalTuningDispose === disconnectDirectionalSteering) {
      delete steeringElement.ptboDirectionalTuningDispose;
    }
    tuningState.installed = false;
  }

  window.addEventListener('pagehide', disconnectDirectionalSteering);
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !disposed) return;
    disposed = false;
    tuningState.lastTimestamp = 0;
    install();
  });

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const normalizeHeading = value => (Number(value) % 360 + 360) % 360;
  const shortestAngleDelta = (fromDegrees, toDegrees) => (
    (toDegrees - fromDegrees + 540) % 360
  ) - 180;

  function directionalIsActive() {
    return !disposed && instruments?.state?.steeringMode === DIRECTIONAL_MODE;
  }

  function readCurrentHeading() {
    try {
      const heading = Number(currentHeading);
      return Number.isFinite(heading) ? normalizeHeading(heading) : null;
    } catch {
      return null;
    }
  }

  function clearResidualSteeringInput() {
    if (instruments?.state) {
      instruments.state.directionalTargetHeading = null;
      instruments.state.directionalMagnitude = 0;
      instruments.state.steeringRaw = 0;
      instruments.state.steeringTarget = 0;
      instruments.state.steeringApplied = 0;
    }
    try {
      keys.ArrowLeft = false;
      keys.ArrowRight = false;
      keys.a = false;
      keys.d = false;
    } catch {
      // Simulator key state may not be ready yet.
    }
  }

  function suppressLegacyDirectionalTarget() {
    if (!directionalIsActive() || !tuningState.pointerActive) return;
    const rawTarget = instruments.getDirectionalHeading ? instruments.getDirectionalHeading() : instruments.state.directionalTargetHeading;
    if (rawTarget === null || rawTarget === undefined || rawTarget === '') return;

    const target = Number(rawTarget);
    if (Number.isFinite(target)) {
      tuningState.targetHeading = normalizeHeading(target);
      tuningState.heldHeading = null;
      tuningState.stickMagnitude = clamp(
        Number(instruments.state.directionalMagnitude) || 0,
        0,
        1
      );
    }
    instruments.state.directionalTargetHeading = null;
  }

  function captureDirectionalTarget(event) {
    if (!directionalIsActive()) return;
    if (tuningState.pointerActive && event.pointerId !== tuningState.pointerId) return;
    if (!tuningState.pointerActive) {
      tuningState.pointerId = event.pointerId;
      tuningState.targetHeading = null;
      tuningState.heldHeading = null;
      tuningState.stickMagnitude = 0;
      ++pointerGeneration;
    }
    tuningState.pointerActive = true;
    queueMicrotask(suppressLegacyDirectionalTarget);
  }

  function releaseDirectionalTarget(event) {
    if (event?.pointerId !== undefined && event.pointerId !== tuningState.pointerId) return;
    if (!tuningState.pointerActive && tuningState.targetHeading === null) return;
    tuningState.pointerActive = false;
    tuningState.pointerId = null;
    const generation = ++pointerGeneration;

    queueMicrotask(() => {
      if (generation !== pointerGeneration) return;
      tuningState.heldHeading = readCurrentHeading();
      tuningState.targetHeading = null;
      tuningState.stickMagnitude = 0;
      clearResidualSteeringInput();

      if (tuningState.heldHeading !== null) {
        try {
          currentHeading = tuningState.heldHeading;
          vehicleMarker?.setRotationOrigin?.('center center');
          vehicleMarker?.setRotationAngle?.(tuningState.heldHeading - 90);
          const headingNode = document.getElementById('tel-hdg');
          if (headingNode) headingNode.textContent = `${Math.round(tuningState.heldHeading)}°`;
        } catch {
          // Vehicle globals may not be ready during page dismissal.
        }
      }
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
    if (
      !directionalIsActive()
      || !tuningState.pointerActive
      || tuningState.targetHeading === null
      || deltaSeconds <= 0
    ) return;

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

      // Large direction changes receive a strong initial response. As the truck
      // aligns, exponential easing takes over for a soft, controlled finish.
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
      note.textContent = 'Point the stick to steer. Releasing it immediately holds the truck’s current heading. Large changes turn faster, while higher speeds soften steering.';
    }
  }

  function makeDirectionalDefault() {
    if (!instruments?.setSteeringMode) return;
    // Storage may be denied; keep the default usable for this session.
    try { if (localStorage.getItem(DEFAULT_MIGRATION_KEY) === '1') return; } catch {}
    instruments.setSteeringMode(DIRECTIONAL_MODE);
    try { localStorage.setItem(DEFAULT_MIGRATION_KEY, '1'); } catch {}
  }

  function eventBelongsToSteering(event) {
    const target = event?.target;
    return Boolean(
      steeringElement
      && target
      && (target === steeringElement || steeringElement.contains(target))
    );
  }

  function animationTick(timestamp) {
    if (disposed) return;
    if (!tuningState.lastTimestamp) tuningState.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(
      0.05,
      Math.max(0, (timestamp - tuningState.lastTimestamp) / 1000)
    );
    tuningState.lastTimestamp = timestamp;

    // Prevent the earlier fixed-rate directional routine from also steering.
    suppressLegacyDirectionalTarget();
    if (!window.PTBO_FIXED_STEP) applyAdaptiveDirectionalSteering(deltaSeconds);
    animationFrame = requestAnimationFrame(animationTick);
  }

  function install() {
    if (disposed || tuningState.installed) return;
    if (frameElement && frameElement.contentDocument !== frameDocument) {
      disconnectDirectionalSteering();
      return;
    }
    instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    if (!instruments) {
      retryTimer = setTimeout(install, CONFIG.retryDelayMs);
      return;
    }

    if (window.parent === window) return;
    try {
      parentDocument = window.parent.document;
      steeringElement = parentDocument.getElementById('steering');
    } catch {
      parentDocument = null;
      steeringElement = null;
    }

    if (!steeringElement || !parentDocument) {
      if (window.parent.document.readyState === 'loading') {
        retryTimer = setTimeout(install, CONFIG.retryDelayMs);
      }
      return;
    }

    steeringElement.ptboDirectionalTuningDispose?.();
    steeringElement.ptboDirectionalTuningDispose = disconnectDirectionalSteering;
    if (!defaultsApplied) {
      makeDirectionalDefault();
      defaultsApplied = true;
    }
    updateOptionsDescription();

    // Listen on the parent document so these handlers run before the older
    // element-level steering code can stop propagation of the release event.
    listenForInput(parentDocument, 'pointerdown', event => {
      if (eventBelongsToSteering(event)) captureDirectionalTarget(event);
    }, true);
    listenForInput(parentDocument, 'pointermove', event => {
      if (tuningState.pointerActive && event.pointerId === tuningState.pointerId) captureDirectionalTarget(event);
    }, true);
    listenForInput(parentDocument, 'pointerup', event => {
      releaseDirectionalTarget(event);
    }, true);
    listenForInput(parentDocument, 'pointercancel', event => {
      releaseDirectionalTarget(event);
    }, true);
    listenForInput(parentDocument, 'lostpointercapture', event => {
      releaseDirectionalTarget(event);
    }, true);

    listenForInput(window, 'ptbo-steering-mode-change', event => {
      tuningState.pointerActive = false;
      tuningState.pointerId = null;
      ++pointerGeneration;
      tuningState.targetHeading = null;
      tuningState.heldHeading = readCurrentHeading();
      tuningState.stickMagnitude = 0;
      clearResidualSteeringInput();
      if (event.detail?.mode === DIRECTIONAL_MODE) updateOptionsDescription();
    });
    listenForInput(window.parent, 'blur', event => {
      if (event.target === window.parent) releaseDirectionalTarget();
    }, true);
    listenForInput(parentDocument, 'visibilitychange', () => {
      if (parentDocument.hidden) releaseDirectionalTarget();
    });

    tuningState.installed = true;
    animationFrame = requestAnimationFrame(animationTick);
  }

  window.PTBO_DIRECTIONAL_STEERING_TUNING = Object.freeze({
    state: tuningState,
    config: CONFIG,
    captureTarget: suppressLegacyDirectionalTarget,
    step(seconds) { suppressLegacyDirectionalTarget(); applyAdaptiveDirectionalSteering(seconds); },
  });

  install();
})();
