(() => {
  'use strict';

  if (window.PTBO_VEHICLE_INSTRUMENTS) return;

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
  });

  const state = {
    speedKmh: 0,
    rawSpeedKmh: 0,
    steeringRaw: 0,
    steeringTarget: 0,
    steeringApplied: 0,
    lastTimestamp: 0,
    previousLat: null,
    previousLng: null,
    mobileSteeringConnected: false,
  };

  let speedNumberNode = null;
  let mobileSteeringElement = null;
  let mobileSteeringPointer = null;

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
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function renderSpeedometer() {
    installSpeedometer();
    if (!speedNumberNode) return;
    const displayedSpeed = Math.max(0, Math.min(999, Math.round(state.speedKmh)));
    speedNumberNode.textContent = String(displayedSpeed);
    const speedometer = speedNumberNode.parentElement;
    speedometer?.setAttribute('aria-label', `Vehicle speed, ${displayedSpeed} kilometres per hour`);
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

  function applyAnalogSteering(deltaSeconds) {
    const responseSeconds = state.steeringTarget === 0 ? CONFIG.steeringReturnSeconds : CONFIG.steeringResponseSeconds;
    const response = 1 - Math.exp(-deltaSeconds / responseSeconds);
    state.steeringApplied += (state.steeringTarget - state.steeringApplied) * response;
    if (Math.abs(state.steeringApplied) < 0.002 && state.steeringTarget === 0) state.steeringApplied = 0;
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
      currentHeading = (currentHeading + state.steeringApplied * degreesPerFrame * frameScale * driveDirection + 360) % 360;
      vehicleMarker?.setRotationOrigin?.('center center');
      vehicleMarker?.setRotationAngle?.(currentHeading - 90);
    } catch {
      // Vehicle globals are not available yet.
    }
  }

  function blockLegacyDigitalSteering(event) {
    if (!state.mobileSteeringConnected || event.isTrusted) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function connectMobileSteering() {
    if (state.mobileSteeringConnected) return true;
    try {
      if (window.parent === window) return false;
      mobileSteeringElement = window.parent.document.getElementById('steering');
    } catch {
      return false;
    }
    if (!mobileSteeringElement) return false;

    state.mobileSteeringConnected = true;
    try {
      keys.ArrowLeft = false;
      keys.ArrowRight = false;
    } catch {
      // Keyboard state has not been initialized yet.
    }

    const updateFromPointer = event => {
      if (mobileSteeringPointer !== null && event.pointerId !== mobileSteeringPointer) return;
      const rect = mobileSteeringElement.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const travel = Math.max(1, rect.width * 0.25);
      shapeSteering((event.clientX - center) / travel);
    };
    const finishPointer = event => {
      if (mobileSteeringPointer !== null && event?.pointerId !== undefined && event.pointerId !== mobileSteeringPointer) return;
      mobileSteeringPointer = null;
      shapeSteering(0);
    };

    mobileSteeringElement.addEventListener('pointerdown', event => {
      mobileSteeringPointer = event.pointerId;
      updateFromPointer(event);
    }, true);
    mobileSteeringElement.addEventListener('pointermove', updateFromPointer, true);
    mobileSteeringElement.addEventListener('pointerup', finishPointer, true);
    mobileSteeringElement.addEventListener('pointercancel', finishPointer, true);
    mobileSteeringElement.addEventListener('lostpointercapture', finishPointer, true);
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
    sampleSpeed(deltaSeconds);
    applyAnalogSteering(deltaSeconds);
    requestAnimationFrame(tick);
  }

  installSpeedometer();
  connectMobileSteering();
  requestAnimationFrame(tick);

  window.PTBO_VEHICLE_INSTRUMENTS = Object.freeze({
    state,
    setAnalogSteering: shapeSteering,
    resetSpeedometer() {
      state.previousLat = null;
      state.previousLng = null;
      state.rawSpeedKmh = 0;
      state.speedKmh = 0;
      renderSpeedometer();
    },
  });
})();
