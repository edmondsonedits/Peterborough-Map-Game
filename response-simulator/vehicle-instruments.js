(() => {
  'use strict';

  if (window.PTBO_VEHICLE_INSTRUMENTS) return;

  const STEERING_STORAGE_KEY = 'ptboMobileSteeringMode';
  const STEERING_MODES = Object.freeze({
    STANDARD: 'standard',
    DIRECTIONAL: 'directional',
  });

  const CONFIG = Object.freeze({
    speedSmoothingSeconds: 0.32,
    stationaryThresholdKmh: 0.8,
    teleportDistanceMeters: 250,
    steeringDeadzone: 0.08,
    steeringCurve: 1.45,
    steeringResponseSeconds: 0.11,
    steeringReturnSeconds: 0.075,
    lowSpeedTurnDegreesPerFrame: 1.08,
    highSpeedTurnDegreesPerFrame: 0.52,
    steeringReferenceSpeedKmh: 105,
    movementThreshold: 0.00000001,

    directionalDeadzone: 0.18,
    directionalStationaryTurnDegreesPerSecond: 32,
    directionalLowSpeedTurnDegreesPerSecond: 112,
    directionalHighSpeedTurnDegreesPerSecond: 42,
    directionalReferenceSpeedKmh: 105,
    directionalHeadingResponsePerSecond: 8.5,
    directionalSnapDegrees: 0.45,
  });

  const storedMode = localStorage.getItem(STEERING_STORAGE_KEY);
  const initialMode = storedMode === STEERING_MODES.DIRECTIONAL
    ? STEERING_MODES.DIRECTIONAL
    : STEERING_MODES.STANDARD;

  const state = {
    speedKmh: 0,
    rawSpeedKmh: 0,
    steeringMode: initialMode,
    steeringRaw: 0,
    steeringTarget: 0,
    steeringApplied: 0,
    directionalTargetHeading: null,
    directionalMagnitude: 0,
    lastTimestamp: 0,
    previousLat: null,
    previousLng: null,
    mobileSteeringConnected: false,
  };

  let speedNumberNode = null;
  let mobileSteeringElement = null;
  let mobileSteeringThumb = null;
  let mobileSteeringLabel = null;
  let mobileSteeringPointer = null;
  let standardThumbMarkup = '';
  let steeringSelect = null;
  let steeringModeLabel = null;

  function normalizeHeading(value) {
    return (Number(value) % 360 + 360) % 360;
  }

  function shortestAngleDelta(fromDegrees, toDegrees) {
    return ((toDegrees - fromDegrees + 540) % 360) - 180;
  }

  function installSpeedometer() {
    if (speedNumberNode?.isConnected) return;

    if (!document.getElementById('ptbo-vehicle-instruments-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-vehicle-instruments-style';
      style.textContent = `
        #ptbo-speedometer {
          position:absolute;
          top:62px;
          left:15px;
          z-index:1240;
          min-width:66px;
          display:flex;
          align-items:baseline;
          justify-content:center;
          gap:4px;
          padding:5px 8px 6px;
          color:#f8fafc;
          border:1px solid rgba(255,255,255,.2);
          border-radius:9px;
          background:rgba(8,13,24,.82);
          box-shadow:0 5px 16px rgba(0,0,0,.3);
          backdrop-filter:blur(5px);
          pointer-events:none;
          user-select:none;
        }
        #ptbo-speedometer-value {
          min-width:2.2ch;
          font-family:"SFMono-Regular",Consolas,monospace;
          font-size:18px;
          font-weight:900;
          line-height:1;
          letter-spacing:-.04em;
          text-align:right;
          font-variant-numeric:tabular-nums;
        }
        #ptbo-speedometer-unit {
          color:#cbd5e1;
          font-size:7px;
          font-weight:850;
          line-height:1;
          letter-spacing:.08em;
          text-transform:uppercase;
        }
        #ptbo-steering-mode-note {
          margin-top:6px;
          color:#666;
          font-size:10px;
          line-height:1.35;
        }
        @media (max-width:900px), (pointer:coarse) {
          #ptbo-speedometer {
            top:calc(148px + env(safe-area-inset-top));
            left:10px;
            min-width:61px;
            padding:4px 7px 5px;
            border-radius:8px;
          }
          #ptbo-speedometer-value { font-size:16px; }
          #ptbo-speedometer-unit { font-size:6px; }
        }
        @media (orientation:landscape) and (max-height:560px) {
          #ptbo-speedometer { top:calc(137px + env(safe-area-inset-top)); }
        }
      `;
      document.head.appendChild(style);
    }

    let speedometer = document.getElementById('ptbo-speedometer');
    if (!speedometer) {
      speedometer = document.createElement('div');
      speedometer.id = 'ptbo-speedometer';
      speedometer.setAttribute('role', 'status');
      speedometer.setAttribute('aria-label', 'Vehicle speed, 0 kilometres per hour');
      speedometer.innerHTML = '<span id="ptbo-speedometer-value">0</span><span id="ptbo-speedometer-unit">km/h</span>';
      document.body.appendChild(speedometer);
    }
    speedNumberNode = speedometer.querySelector('#ptbo-speedometer-value');
  }

  function isMobileWrapper() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  function installSteeringModeControl() {
    if (!isMobileWrapper()) return false;
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;

    if (!document.getElementById('ptbo-steering-mode-title')) {
      const title = document.createElement('div');
      title.id = 'ptbo-steering-mode-title';
      title.className = 'section-title';
      title.textContent = 'Mobile Steering';

      const row = document.createElement('div');
      row.id = 'ptbo-steering-mode-row';
      row.className = 'control-row';
      row.innerHTML = `
        <label>
          <span>Steering Mode</span>
          <span id="ptbo-steering-mode-label">Standard</span>
        </label>
        <select id="ptbo-steering-mode-select" aria-label="Mobile steering mode">
          <option value="${STEERING_MODES.STANDARD}">Standard Left / Right</option>
          <option value="${STEERING_MODES.DIRECTIONAL}">Directional Thumbstick</option>
        </select>
        <div id="ptbo-steering-mode-note">Directional mode points the truck's nose toward the stick angle. Releasing the stick keeps the current heading.</div>
      `;

      const drivingTitle = [...panel.querySelectorAll('.section-title')]
        .find(node => node.textContent.trim() === 'Driving Modifiers');
      if (drivingTitle) {
        panel.insertBefore(title, drivingTitle);
        panel.insertBefore(row, drivingTitle);
      } else {
        panel.append(title, row);
      }
    }

    steeringSelect = document.getElementById('ptbo-steering-mode-select');
    steeringModeLabel = document.getElementById('ptbo-steering-mode-label');
    if (steeringSelect && !steeringSelect.dataset.ptboBound) {
      steeringSelect.dataset.ptboBound = 'true';
      steeringSelect.addEventListener('change', () => setSteeringMode(steeringSelect.value));
    }
    syncSteeringModeControl();
    return true;
  }

  function syncSteeringModeControl() {
    if (steeringSelect) steeringSelect.value = state.steeringMode;
    if (steeringModeLabel) {
      steeringModeLabel.textContent = state.steeringMode === STEERING_MODES.DIRECTIONAL
        ? 'Directional'
        : 'Standard';
    }
  }

  function installParentJoystickStyle() {
    if (!isMobileWrapper()) return;
    const parentDoc = window.parent.document;
    if (parentDoc.getElementById('ptbo-directional-steering-style')) return;

    const style = parentDoc.createElement('style');
    style.id = 'ptbo-directional-steering-style';
    style.textContent = `
      #steering.directional-mode {
        background:
          linear-gradient(rgba(255,255,255,.12),rgba(255,255,255,.12)) center/1px calc(100% - 28px) no-repeat,
          linear-gradient(90deg,rgba(255,255,255,.12),rgba(255,255,255,.12)) center/calc(100% - 28px) 1px no-repeat,
          radial-gradient(circle at center,rgba(56,189,248,.13) 0 34%,transparent 35%),
          rgba(17,24,39,.92);
        border-color:rgba(56,189,248,.45);
      }
      #steering.directional-mode .joystick-thumb {
        border-color:rgba(125,211,252,.78);
        background:linear-gradient(145deg,#075985,#0f172a);
        box-shadow:0 0 0 3px rgba(56,189,248,.12),0 7px 17px rgba(0,0,0,.45);
      }
      #steering.directional-mode .joystick-label {
        color:#bae6fd;
      }
    `;
    parentDoc.head.appendChild(style);
  }

  function updateParentJoystickMode() {
    if (!mobileSteeringElement || !isMobileWrapper()) return;
    installParentJoystickStyle();

    const directional = state.steeringMode === STEERING_MODES.DIRECTIONAL;
    mobileSteeringElement.classList.toggle('directional-mode', directional);
    mobileSteeringElement.setAttribute(
      'aria-label',
      directional ? 'Directional steering thumbstick' : 'Steering joystick'
    );

    if (mobileSteeringLabel) {
      mobileSteeringLabel.textContent = directional ? 'Point' : 'Steer';
    }

    if (mobileSteeringThumb) {
      if (!standardThumbMarkup) standardThumbMarkup = mobileSteeringThumb.innerHTML;
      mobileSteeringThumb.innerHTML = directional
        ? '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 6.5 10h3v8h5v-8h3L12 3Z"/><circle cx="12" cy="12" r="9"/></svg>'
        : standardThumbMarkup;
      mobileSteeringThumb.style.transform = 'translate(-50%, -50%)';
    }
  }

  function releaseDirectionalPointer() {
    mobileSteeringPointer = null;
    state.directionalTargetHeading = null;
    state.directionalMagnitude = 0;
    if (mobileSteeringElement) mobileSteeringElement.classList.remove('active');
    if (mobileSteeringThumb) mobileSteeringThumb.style.transform = 'translate(-50%, -50%)';
  }

  function resetSteeringInputs() {
    state.steeringRaw = 0;
    state.steeringTarget = 0;
    state.steeringApplied = 0;
    releaseDirectionalPointer();
    try {
      keys.ArrowLeft = false;
      keys.ArrowRight = false;
      keys.a = false;
      keys.d = false;
    } catch {
      // Simulator globals may not be ready yet.
    }
  }

  function setSteeringMode(mode) {
    const nextMode = mode === STEERING_MODES.DIRECTIONAL
      ? STEERING_MODES.DIRECTIONAL
      : STEERING_MODES.STANDARD;
    if (state.steeringMode === nextMode) {
      syncSteeringModeControl();
      updateParentJoystickMode();
      return state.steeringMode;
    }

    resetSteeringInputs();
    state.steeringMode = nextMode;
    localStorage.setItem(STEERING_STORAGE_KEY, nextMode);
    syncSteeringModeControl();
    updateParentJoystickMode();

    window.dispatchEvent(new CustomEvent('ptbo-steering-mode-change', {
      detail: { mode: nextMode },
    }));
    return state.steeringMode;
  }

  function distanceMeters(latA, lngA, latB, lngB) {
    try {
      if (mapInstance?.distance) return mapInstance.distance([latA, lngA], [latB, lngB]);
    } catch {
      // Use the geographic fallback until Leaflet is ready.
    }
    const radius = 6371000;
    const toRadians = value => value * Math.PI / 180;
    const lat1 = toRadians(latA);
    const lat2 = toRadians(latB);
    const deltaLat = lat2 - lat1;
    const deltaLng = toRadians(lngB - lngA);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderSpeedometer() {
    installSpeedometer();
    if (!speedNumberNode) return;
    const displayedSpeed = Math.max(0, Math.min(999, Math.round(state.speedKmh)));
    speedNumberNode.textContent = String(displayedSpeed);
    speedNumberNode.parentElement?.setAttribute(
      'aria-label',
      `Vehicle speed, ${displayedSpeed} kilometres per hour`
    );
  }

  function sampleSpeed(deltaSeconds) {
    let currentLat;
    let currentLng;
    let currentVelocity;
    try {
      currentLat = Number(simLat);
      currentLng = Number(simLng);
      currentVelocity = Number(velocity);
    } catch {
      return;
    }
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) return;

    if (state.previousLat === null || state.previousLng === null || deltaSeconds <= 0 || deltaSeconds > 0.5) {
      state.previousLat = currentLat;
      state.previousLng = currentLng;
      state.rawSpeedKmh = 0;
      state.speedKmh = 0;
      renderSpeedometer();
      return;
    }

    const distance = distanceMeters(state.previousLat, state.previousLng, currentLat, currentLng);
    state.previousLat = currentLat;
    state.previousLng = currentLng;

    if (!Number.isFinite(distance) || distance > CONFIG.teleportDistanceMeters) {
      state.rawSpeedKmh = 0;
      state.speedKmh = 0;
      renderSpeedometer();
      return;
    }

    let measuredSpeed = distance / deltaSeconds * 3.6;
    if (Math.abs(currentVelocity) <= CONFIG.movementThreshold && distance < 0.04) measuredSpeed = 0;
    if (measuredSpeed < CONFIG.stationaryThresholdKmh) measuredSpeed = 0;
    state.rawSpeedKmh = measuredSpeed;

    const smoothing = 1 - Math.exp(-deltaSeconds / CONFIG.speedSmoothingSeconds);
    state.speedKmh += (measuredSpeed - state.speedKmh) * smoothing;
    if (measuredSpeed === 0 && state.speedKmh < 0.6) state.speedKmh = 0;
    renderSpeedometer();
  }

  function shapeSteering(rawValue) {
    if (state.steeringMode !== STEERING_MODES.STANDARD) return;
    const raw = Math.max(-1, Math.min(1, Number(rawValue) || 0));
    const magnitude = Math.abs(raw);
    state.steeringRaw = raw;
    if (magnitude <= CONFIG.steeringDeadzone) {
      state.steeringTarget = 0;
      return;
    }
    const normalized = (magnitude - CONFIG.steeringDeadzone) / (1 - CONFIG.steeringDeadzone);
    state.steeringTarget = Math.sign(raw) * normalized ** CONFIG.steeringCurve;
  }

  function setDirectionalVector(rawX, rawY, magnitudeOverride) {
    if (state.steeringMode !== STEERING_MODES.DIRECTIONAL) return;
    const x = Math.max(-1, Math.min(1, Number(rawX) || 0));
    const y = Math.max(-1, Math.min(1, Number(rawY) || 0));
    const magnitude = Math.min(1, Number.isFinite(Number(magnitudeOverride))
      ? Math.max(0, Number(magnitudeOverride))
      : Math.hypot(x, y));

    state.directionalMagnitude = magnitude;
    if (magnitude <= CONFIG.directionalDeadzone) {
      state.directionalTargetHeading = null;
      return;
    }

    state.directionalTargetHeading = normalizeHeading(Math.atan2(x, -y) * 180 / Math.PI);
  }

  function applyAnalogSteering(deltaSeconds) {
    if (state.steeringMode !== STEERING_MODES.STANDARD) return;

    const responseSeconds = state.steeringTarget === 0
      ? CONFIG.steeringReturnSeconds
      : CONFIG.steeringResponseSeconds;
    const response = 1 - Math.exp(-deltaSeconds / responseSeconds);
    state.steeringApplied += (state.steeringTarget - state.steeringApplied) * response;
    if (Math.abs(state.steeringApplied) < 0.002 && state.steeringTarget === 0) {
      state.steeringApplied = 0;
    }
    if (!state.mobileSteeringConnected || state.steeringApplied === 0) return;

    let currentVelocity;
    try {
      currentVelocity = Number(velocity);
    } catch {
      return;
    }
    if (!Number.isFinite(currentVelocity) || Math.abs(currentVelocity) <= CONFIG.movementThreshold) return;

    const speedRatio = Math.min(1, Math.max(0, state.speedKmh / CONFIG.steeringReferenceSpeedKmh));
    const degreesPerFrame = CONFIG.lowSpeedTurnDegreesPerFrame
      + (CONFIG.highSpeedTurnDegreesPerFrame - CONFIG.lowSpeedTurnDegreesPerFrame) * speedRatio;
    const frameScale = Math.min(3, deltaSeconds * 60);
    const driveDirection = currentVelocity >= 0 ? 1 : -1;

    try {
      currentHeading = normalizeHeading(
        currentHeading + state.steeringApplied * degreesPerFrame * frameScale * driveDirection
      );
      vehicleMarker?.setRotationOrigin?.('center center');
      vehicleMarker?.setRotationAngle?.(currentHeading - 90);
    } catch {
      // Vehicle globals are not available yet.
    }
  }

  function applyDirectionalSteering(deltaSeconds) {
    if (
      state.steeringMode !== STEERING_MODES.DIRECTIONAL
      || state.directionalTargetHeading === null
      || deltaSeconds <= 0
    ) return;

    let currentVelocity;
    let heading;
    try {
      currentVelocity = Number(velocity);
      heading = Number(currentHeading);
    } catch {
      return;
    }
    if (!Number.isFinite(heading)) return;

    const speedRatio = Math.min(
      1,
      Math.max(0, state.speedKmh / CONFIG.directionalReferenceSpeedKmh)
    );
    const movingTurnRate = CONFIG.directionalLowSpeedTurnDegreesPerSecond
      + (
        CONFIG.directionalHighSpeedTurnDegreesPerSecond
        - CONFIG.directionalLowSpeedTurnDegreesPerSecond
      ) * speedRatio;
    const turnRate = Math.abs(currentVelocity) <= CONFIG.movementThreshold
      ? CONFIG.directionalStationaryTurnDegreesPerSecond
      : movingTurnRate;

    const delta = shortestAngleDelta(heading, state.directionalTargetHeading);
    if (Math.abs(delta) <= CONFIG.directionalSnapDegrees) {
      currentHeading = state.directionalTargetHeading;
    } else {
      const easedStep = delta * (
        1 - Math.exp(-CONFIG.directionalHeadingResponsePerSecond * deltaSeconds)
      );
      const maximumStep = turnRate * deltaSeconds;
      const step = Math.max(-maximumStep, Math.min(maximumStep, easedStep));
      currentHeading = normalizeHeading(heading + step);
    }

    vehicleMarker?.setRotationOrigin?.('center center');
    vehicleMarker?.setRotationAngle?.(currentHeading - 90);
    const headingNode = document.getElementById('tel-hdg');
    if (headingNode) headingNode.textContent = `${Math.round(currentHeading)}°`;
  }

  function blockLegacyDigitalSteering(event) {
    if (!state.mobileSteeringConnected || event.isTrusted) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function updateStandardFromPointer(event) {
    const rect = mobileSteeringElement.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const travel = Math.max(1, rect.width * 0.25);
    shapeSteering((event.clientX - center) / travel);
  }

  function updateDirectionalFromPointer(event) {
    const rect = mobileSteeringElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const travel = Math.max(1, Math.min(rect.width, rect.height) * 0.31);
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > travel ? travel / distance : 1;
    const offsetX = rawX * scale;
    const offsetY = rawY * scale;
    const normalizedX = offsetX / travel;
    const normalizedY = offsetY / travel;
    const magnitude = Math.min(1, distance / travel);

    setDirectionalVector(normalizedX, normalizedY, magnitude);
    if (mobileSteeringThumb) {
      mobileSteeringThumb.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    }
  }

  function finishPointer(event, intercept = false) {
    if (
      mobileSteeringPointer !== null
      && event?.pointerId !== undefined
      && event.pointerId !== mobileSteeringPointer
    ) return;

    if (intercept && event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    mobileSteeringPointer = null;
    if (state.steeringMode === STEERING_MODES.DIRECTIONAL) {
      releaseDirectionalPointer();
    } else {
      shapeSteering(0);
    }
  }

  function connectMobileSteering() {
    if (state.mobileSteeringConnected) return true;
    try {
      if (window.parent === window) return false;
      mobileSteeringElement = window.parent.document.getElementById('steering');
      mobileSteeringThumb = window.parent.document.getElementById('steering-thumb');
      mobileSteeringLabel = mobileSteeringElement?.querySelector('.joystick-label') || null;
    } catch {
      return false;
    }
    if (!mobileSteeringElement) return false;

    state.mobileSteeringConnected = true;
    resetSteeringInputs();
    installParentJoystickStyle();
    updateParentJoystickMode();

    mobileSteeringElement.addEventListener('pointerdown', event => {
      mobileSteeringPointer = event.pointerId;
      if (state.steeringMode === STEERING_MODES.DIRECTIONAL) {
        event.preventDefault();
        event.stopImmediatePropagation();
        mobileSteeringElement.setPointerCapture?.(event.pointerId);
        mobileSteeringElement.classList.add('active');
        updateDirectionalFromPointer(event);
      } else {
        updateStandardFromPointer(event);
      }
    }, true);

    mobileSteeringElement.addEventListener('pointermove', event => {
      if (mobileSteeringPointer !== null && event.pointerId !== mobileSteeringPointer) return;
      if (state.steeringMode === STEERING_MODES.DIRECTIONAL) {
        event.preventDefault();
        event.stopImmediatePropagation();
        updateDirectionalFromPointer(event);
      } else {
        updateStandardFromPointer(event);
      }
    }, true);

    mobileSteeringElement.addEventListener('pointerup', event => {
      finishPointer(event, state.steeringMode === STEERING_MODES.DIRECTIONAL);
    }, true);
    mobileSteeringElement.addEventListener('pointercancel', event => {
      finishPointer(event, state.steeringMode === STEERING_MODES.DIRECTIONAL);
    }, true);
    mobileSteeringElement.addEventListener('lostpointercapture', event => {
      finishPointer(event, state.steeringMode === STEERING_MODES.DIRECTIONAL);
    }, true);

    window.parent.addEventListener('blur', () => finishPointer(), true);
    window.parent.document.addEventListener('visibilitychange', () => {
      if (window.parent.document.hidden) finishPointer();
    });

    window.addEventListener('keydown', blockLegacyDigitalSteering, true);
    window.addEventListener('keyup', blockLegacyDigitalSteering, true);
    return true;
  }

  function tick(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(0.1, Math.max(0, (timestamp - state.lastTimestamp) / 1000));
    state.lastTimestamp = timestamp;

    if (!state.mobileSteeringConnected) connectMobileSteering();
    installSteeringModeControl();
    sampleSpeed(deltaSeconds);
    applyAnalogSteering(deltaSeconds);
    applyDirectionalSteering(deltaSeconds);
    requestAnimationFrame(tick);
  }

  installSpeedometer();
  installSteeringModeControl();
  connectMobileSteering();
  requestAnimationFrame(tick);

  window.PTBO_VEHICLE_INSTRUMENTS = Object.freeze({
    state,
    modes: STEERING_MODES,
    setSteeringMode,
    setAnalogSteering: shapeSteering,
    setDirectionalSteering: setDirectionalVector,
    clearDirectionalSteering: releaseDirectionalPointer,
    resetSpeedometer() {
      state.previousLat = null;
      state.previousLng = null;
      state.rawSpeedKmh = 0;
      state.speedKmh = 0;
      renderSpeedometer();
    },
  });
})();