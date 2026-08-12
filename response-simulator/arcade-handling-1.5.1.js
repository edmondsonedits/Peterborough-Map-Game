(() => {
  'use strict';

  const VERSION = '1.5.1';
  if (window.PTBO_ARCADE_HANDLING?.version === VERSION) return;

  const STORAGE_KEY = 'ptboArcadeHandlingV151';
  const DEFAULT_MIGRATION_KEY = 'ptboArcadeHandlingDefaultV151';
  const STANDARD_MODE = 'standard';
  const DIRECTIONAL_MODE = 'directional';
  const MOVEMENT_THRESHOLD = 0.00000001;
  const DESKTOP_MANUAL_MAP = (() => {
    try {
      return /\/response-simulator\/play\//.test(parent.location.pathname);
    } catch {
      return !matchMedia('(pointer: coarse)').matches;
    }
  })();

  const PRESETS = Object.freeze({
    classic: Object.freeze({
      responseMs: 45,
      lowSpeedTurnRate: 245,
      highSpeedTurnRate: 72,
      highSpeedReferenceKmh: 190,
      steeringCurve: 1.10,
      cornerAssist: 58,
      zoomOutLevels: 2.0,
      cameraLookAheadMeters: 38,
    }),
    tight: Object.freeze({
      responseMs: 28,
      lowSpeedTurnRate: 310,
      highSpeedTurnRate: 92,
      highSpeedReferenceKmh: 175,
      steeringCurve: 0.92,
      cornerAssist: 72,
      zoomOutLevels: 1.75,
      cameraLookAheadMeters: 30,
    }),
    heavy: Object.freeze({
      responseMs: 90,
      lowSpeedTurnRate: 178,
      highSpeedTurnRate: 44,
      highSpeedReferenceKmh: 165,
      steeringCurve: 1.35,
      cornerAssist: 42,
      zoomOutLevels: 2.5,
      cameraLookAheadMeters: 46,
    }),
  });

  const DEFAULT_SETTINGS = Object.freeze({
    preset: 'classic',
    speedZoomEnabled: !DESKTOP_MANUAL_MAP,
    ...PRESETS.classic,
  });

  const state = {
    installed: false,
    settings: loadSettings(),
    lastTimestamp: 0,
    lastCameraUpdate: 0,
    cameraZoom: null,
    baseCameraZoom: null,
    lastHeading: null,
  };

  let instruments = null;
  let directionalTuning = null;
  let presetSelect = null;
  const controlNodes = new Map();

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const normalizeHeading = value => (Number(value) % 360 + 360) % 360;
  const shortestAngleDelta = (fromDegrees, toDegrees) => (
    (toDegrees - fromDegrees + 540) % 360
  ) - 180;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
      return sanitizeSettings({ ...DEFAULT_SETTINGS, ...saved });
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function sanitizeSettings(settings) {
    return {
      preset: ['classic', 'tight', 'heavy', 'custom'].includes(settings.preset)
        ? settings.preset
        : 'classic',
      speedZoomEnabled: DESKTOP_MANUAL_MAP ? false : settings.speedZoomEnabled !== false,
      responseMs: clamp(Number(settings.responseMs) || DEFAULT_SETTINGS.responseMs, 20, 180),
      lowSpeedTurnRate: clamp(Number(settings.lowSpeedTurnRate) || DEFAULT_SETTINGS.lowSpeedTurnRate, 120, 360),
      highSpeedTurnRate: clamp(Number(settings.highSpeedTurnRate) || DEFAULT_SETTINGS.highSpeedTurnRate, 25, 130),
      highSpeedReferenceKmh: clamp(Number(settings.highSpeedReferenceKmh) || DEFAULT_SETTINGS.highSpeedReferenceKmh, 100, 260),
      steeringCurve: clamp(Number(settings.steeringCurve) || DEFAULT_SETTINGS.steeringCurve, 0.70, 2.00),
      cornerAssist: clamp(Number(settings.cornerAssist) || DEFAULT_SETTINGS.cornerAssist, 0, 100),
      zoomOutLevels: clamp(Number(settings.zoomOutLevels) || 0, 0, 3),
      cameraLookAheadMeters: clamp(Number(settings.cameraLookAheadMeters) || 0, 0, 70),
    };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function currentSpeedKmh() {
    return Math.max(0, Number(instruments?.state?.speedKmh) || 0);
  }

  function currentVelocityValue() {
    try {
      const value = Number(velocity);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  function readHeading() {
    try {
      const heading = Number(currentHeading);
      return Number.isFinite(heading) ? normalizeHeading(heading) : null;
    } catch {
      return null;
    }
  }

  function writeHeading(heading) {
    const normalized = normalizeHeading(heading);
    try {
      currentHeading = normalized;
      vehicleMarker?.setRotationOrigin?.('center center');
      vehicleMarker?.setRotationAngle?.(normalized - 90);
      const headingNode = document.getElementById('tel-hdg');
      if (headingNode) headingNode.textContent = `${Math.round(normalized)}°`;
      state.lastHeading = normalized;
    } catch {
      // Base simulator globals are not ready yet.
    }
  }

  function formatSetting(key, value) {
    if (key === 'responseMs') return `${Math.round(value)} ms`;
    if (key === 'lowSpeedTurnRate' || key === 'highSpeedTurnRate') return `${Math.round(value)}°/s`;
    if (key === 'highSpeedReferenceKmh') return `${Math.round(value)} km/h`;
    if (key === 'steeringCurve') return Number(value).toFixed(2);
    if (key === 'cornerAssist') return `${Math.round(value)}%`;
    if (key === 'zoomOutLevels') return Number(value).toFixed(2);
    if (key === 'cameraLookAheadMeters') return `${Math.round(value)} m`;
    return String(value);
  }

  function markCustom() {
    state.settings.preset = 'custom';
    if (presetSelect) presetSelect.value = 'custom';
  }

  function syncControls() {
    if (presetSelect) presetSelect.value = state.settings.preset;
    controlNodes.forEach(({ input, value }, key) => {
      input.value = String(state.settings[key]);
      value.textContent = formatSetting(key, state.settings[key]);
    });
    const zoomToggle = document.getElementById('ptbo-arcade-speed-zoom');
    if (zoomToggle) zoomToggle.checked = state.settings.speedZoomEnabled;
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.settings = sanitizeSettings({
      ...state.settings,
      ...preset,
      preset: name,
    });
    saveSettings();
    syncControls();
  }

  function createRangeControl(key, label, minimum, maximum, step) {
    const row = document.createElement('div');
    row.className = 'control-row ptbo-arcade-control';
    row.innerHTML = `
      <label><span>${label}</span><span id="ptbo-arcade-${key}-value"></span></label>
      <input id="ptbo-arcade-${key}" type="range" min="${minimum}" max="${maximum}" step="${step}">
    `;
    const input = row.querySelector('input');
    const value = row.querySelector('label span:last-child');
    controlNodes.set(key, { input, value });
    input.addEventListener('input', () => {
      state.settings[key] = Number(input.value);
      markCustom();
      value.textContent = formatSetting(key, state.settings[key]);
      saveSettings();
    });
    return row;
  }

  function installSettingsPanel() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel || document.getElementById('ptbo-arcade-handling-section')) return Boolean(panel);

    const section = document.createElement('div');
    section.id = 'ptbo-arcade-handling-section';
    section.innerHTML = `
      <div class="section-title">Arcade Handling — v${VERSION}</div>
      <div class="control-row">
        <label><span>Handling Preset</span><span>Live</span></label>
        <select id="ptbo-arcade-preset" aria-label="Arcade handling preset">
          <option value="classic">Classic Top-Down</option>
          <option value="tight">Tight City</option>
          <option value="heavy">Heavy Fire Truck</option>
          <option value="custom">Custom Values</option>
        </select>
      </div>
      <div id="ptbo-arcade-range-controls"></div>
      <label class="checkbox-row"><input type="checkbox" id="ptbo-arcade-speed-zoom"> Speed-based camera zoom</label>
      <div id="ptbo-arcade-note">Classic Top-Down uses immediate steering, stronger low-speed rotation, automatic speed reduction in sharp corners, and a camera that looks farther ahead as speed increases. Every value updates while driving and is saved on this device.</div>
    `;

    const drivingTitle = [...panel.querySelectorAll('.section-title')]
      .find(node => node.textContent.trim() === 'Driving Modifiers');
    if (drivingTitle) panel.insertBefore(section, drivingTitle);
    else panel.appendChild(section);

    if (!document.getElementById('ptbo-arcade-handling-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-arcade-handling-style';
      style.textContent = `
        #ptbo-arcade-handling-section{padding:0 0 4px}
        #ptbo-arcade-note{margin:-2px 0 12px;color:#666;font-size:10px;line-height:1.4}
        .ptbo-arcade-control{margin-bottom:11px}
        .ptbo-arcade-control input[type="range"]{padding:0!important}
      `;
      document.head.appendChild(style);
    }

    presetSelect = document.getElementById('ptbo-arcade-preset');
    presetSelect.addEventListener('change', () => {
      if (presetSelect.value !== 'custom') applyPreset(presetSelect.value);
      else {
        state.settings.preset = 'custom';
        saveSettings();
      }
    });

    const controls = document.getElementById('ptbo-arcade-range-controls');
    controls.append(
      createRangeControl('responseMs', 'Steering Response', 20, 180, 5),
      createRangeControl('lowSpeedTurnRate', 'Low-Speed Turn Rate', 120, 360, 5),
      createRangeControl('highSpeedTurnRate', 'High-Speed Turn Rate', 25, 130, 5),
      createRangeControl('highSpeedReferenceKmh', 'Full High-Speed Handling', 100, 260, 10),
      createRangeControl('steeringCurve', 'Steering Input Curve', 0.70, 2.00, 0.05),
      createRangeControl('cornerAssist', 'Cornering Speed Assist', 0, 100, 5),
      createRangeControl('zoomOutLevels', 'Maximum Zoom-Out', 0, 3, 0.25),
      createRangeControl('cameraLookAheadMeters', 'Camera Look-Ahead', 0, 70, 5),
    );

    const speedZoomToggle = document.getElementById('ptbo-arcade-speed-zoom');
    if (DESKTOP_MANUAL_MAP) {
      state.settings.speedZoomEnabled = false;
      state.cameraZoom = null;
      state.baseCameraZoom = null;
      speedZoomToggle.checked = false;
      speedZoomToggle.disabled = true;
      speedZoomToggle.parentElement.lastChild.textContent = ' Desktop zoom is manual';
      document.getElementById('ptbo-arcade-zoomOutLevels')?.closest('.ptbo-arcade-control')?.remove();
      document.getElementById('ptbo-arcade-cameraLookAheadMeters')?.closest('.ptbo-arcade-control')?.remove();
      document.getElementById('ptbo-arcade-note').textContent = 'Desktop map position and zoom are manual. Drag the map and use the mouse wheel or + / − controls; driving will not change your chosen view.';
      saveSettings();
    }

    speedZoomToggle.addEventListener('change', event => {
      if (DESKTOP_MANUAL_MAP) return;
      state.settings.speedZoomEnabled = event.target.checked;
      markCustom();
      saveSettings();
      if (!state.settings.speedZoomEnabled) {
        state.cameraZoom = null;
        state.baseCameraZoom = null;
      }
    });

    const steeringSelect = document.getElementById('ptbo-steering-mode-select');
    if (steeringSelect) {
      const standardOption = steeringSelect.querySelector(`option[value="${STANDARD_MODE}"]`);
      if (standardOption) standardOption.textContent = 'Arcade Top-Down (Left / Right)';
    }
    const steeringNote = document.getElementById('ptbo-steering-mode-note');
    if (steeringNote) {
      steeringNote.textContent = 'Arcade Top-Down is the recommended classic handling mode. Directional Thumbstick remains available and uses the same cornering and camera assists.';
    }

    syncControls();
    return true;
  }

  function migrateDefaultMode() {
    if (!instruments?.setSteeringMode) return;
    if (localStorage.getItem(DEFAULT_MIGRATION_KEY) === '1') return;
    instruments.setSteeringMode(STANDARD_MODE);
    localStorage.setItem(DEFAULT_MIGRATION_KEY, '1');
  }

  function shapedSteeringInput(rawInput) {
    const raw = clamp(Number(rawInput) || 0, -1, 1);
    const magnitude = Math.abs(raw);
    const deadzone = 0.06;
    if (magnitude <= deadzone) return 0;
    const normalized = (magnitude - deadzone) / (1 - deadzone);
    return Math.sign(raw) * normalized ** state.settings.steeringCurve;
  }

  function desiredTurnRate(speedKmh) {
    const ratio = clamp(speedKmh / state.settings.highSpeedReferenceKmh, 0, 1);
    const easedRatio = ratio ** 0.82;
    return state.settings.lowSpeedTurnRate
      + (state.settings.highSpeedTurnRate - state.settings.lowSpeedTurnRate) * easedRatio;
  }

  function applyMobileArcadeSteering(deltaSeconds) {
    const instrumentState = instruments?.state;
    if (!instrumentState?.mobileSteeringConnected || instrumentState.steeringMode !== STANDARD_MODE) return;

    const rawTarget = shapedSteeringInput(instrumentState.steeringRaw);
    instrumentState.steeringTarget = rawTarget;

    const coreApplied = Number(instrumentState.steeringApplied) || 0;
    const responseSeconds = rawTarget === 0
      ? Math.max(0.025, state.settings.responseMs / 1000 * 0.72)
      : Math.max(0.02, state.settings.responseMs / 1000);
    const response = 1 - Math.exp(-deltaSeconds / responseSeconds);
    const customApplied = coreApplied + (rawTarget - coreApplied) * response;
    instrumentState.steeringApplied = Math.abs(customApplied) < 0.002 && rawTarget === 0
      ? 0
      : customApplied;

    const heading = readHeading();
    if (heading === null || deltaSeconds <= 0) return;
    const velocityValue = currentVelocityValue();
    const driveDirection = velocityValue < -MOVEMENT_THRESHOLD ? -1 : 1;
    const speedKmh = currentSpeedKmh();

    const coreSpeedRatio = clamp(speedKmh / 70, 0, 1);
    const coreDegreesPerFrame = 2.2 + (0.42 - 2.2) * coreSpeedRatio;
    const frameScale = Math.min(3, deltaSeconds * 60);
    const estimatedCoreStep = coreApplied * coreDegreesPerFrame * frameScale * driveDirection;
    const desiredStep = instrumentState.steeringApplied
      * desiredTurnRate(speedKmh)
      * deltaSeconds
      * driveDirection;

    writeHeading(heading + desiredStep - estimatedCoreStep);
  }

  function desktopSteeringInput() {
    try {
      const left = Boolean(keys.ArrowLeft || keys.a);
      const right = Boolean(keys.ArrowRight || keys.d);
      return (right ? 1 : 0) - (left ? 1 : 0);
    } catch {
      return 0;
    }
  }

  function applyDesktopArcadeSteering(deltaSeconds) {
    if (instruments?.state?.mobileSteeringConnected || instruments?.state?.steeringMode !== STANDARD_MODE) return;
    const input = desktopSteeringInput();
    if (!input || deltaSeconds <= 0) return;

    const heading = readHeading();
    if (heading === null) return;
    const velocityValue = currentVelocityValue();
    const driveDirection = velocityValue < -MOVEMENT_THRESHOLD ? -1 : 1;
    const speedKmh = currentSpeedKmh();

    let legacyStep = 0.84 * input;
    if (Math.abs(velocityValue) > MOVEMENT_THRESHOLD) {
      const speedSetting = Number(document.getElementById('sld-speed')?.value) || 5;
      const maxSpeed = 0.0000015 * speedSetting;
      const velocityFactor = Math.min(Math.abs(velocityValue) / Math.max(maxSpeed * 0.2, MOVEMENT_THRESHOLD), 1);
      legacyStep = 1.2 * Math.max(velocityFactor, 0.3) * input * driveDirection;
    }

    const desiredStep = input * desiredTurnRate(speedKmh) * deltaSeconds * driveDirection;
    writeHeading(heading + desiredStep - legacyStep);
  }

  function applyDirectionalArcadeSteering(deltaSeconds) {
    const instrumentState = instruments?.state;
    const tuningState = directionalTuning?.state;
    if (instrumentState?.steeringMode !== DIRECTIONAL_MODE || !tuningState) return;

    const current = readHeading();
    if (current === null) return;
    const target = Number(tuningState.targetHeading);
    if (!tuningState.pointerActive || !Number.isFinite(target) || deltaSeconds <= 0) {
      state.lastHeading = current;
      return;
    }

    const startHeading = Number.isFinite(state.lastHeading) ? state.lastHeading : current;
    const delta = shortestAngleDelta(startHeading, normalizeHeading(target));
    const absoluteDelta = Math.abs(delta);
    if (absoluteDelta <= 0.35) {
      writeHeading(target);
      return;
    }

    const speedKmh = currentSpeedKmh();
    const stickMagnitude = clamp(Number(tuningState.stickMagnitude) || 0, 0, 1);
    const angleInfluence = clamp(absoluteDelta / 95, 0.18, 1) ** Math.max(0.55, state.settings.steeringCurve * 0.65);
    const maximumStep = desiredTurnRate(speedKmh)
      * (0.58 + 0.42 * stickMagnitude)
      * angleInfluence
      * deltaSeconds;
    const responseSeconds = Math.max(0.02, state.settings.responseMs / 1000);
    const easedStep = delta * (1 - Math.exp(-deltaSeconds / responseSeconds));
    const step = clamp(easedStep, -maximumStep, maximumStep);
    writeHeading(startHeading + step);
  }

  function directionalTurnDemand() {
    const tuningState = directionalTuning?.state;
    const heading = readHeading();
    if (!tuningState || heading === null || tuningState.targetHeading === null) return 0;
    const angle = Math.abs(shortestAngleDelta(heading, tuningState.targetHeading));
    return clamp(angle / 100, 0, 1) * clamp(Number(tuningState.stickMagnitude) || 0, 0, 1);
  }

  function standardTurnDemand() {
    const instrumentState = instruments?.state;
    if (!instrumentState) return 0;
    if (instrumentState.mobileSteeringConnected) {
      return clamp(Math.abs(Number(instrumentState.steeringApplied) || 0), 0, 1);
    }
    return Math.abs(desktopSteeringInput());
  }

  function currentTurnDemand() {
    return instruments?.state?.steeringMode === DIRECTIONAL_MODE
      ? directionalTurnDemand()
      : standardTurnDemand();
  }

  function applyCorneringAssist(deltaSeconds) {
    const strength = state.settings.cornerAssist / 100;
    if (strength <= 0 || deltaSeconds <= 0) return;

    const speedKmh = currentSpeedKmh();
    const demand = currentTurnDemand();
    if (speedKmh < 38 || demand < 0.22) return;

    const safeCornerSpeed = 42 + (1 - demand ** 0.72) * 118;
    if (speedKmh <= safeCornerSpeed) return;

    const excessRatio = clamp((speedKmh - safeCornerSpeed) / Math.max(speedKmh, 1), 0, 1);
    const dampingPerSecond = strength * (0.7 + demand * 1.45 + excessRatio * 1.8);
    const multiplier = Math.exp(-dampingPerSecond * deltaSeconds);
    try {
      velocity *= multiplier;
    } catch {
      // Vehicle globals are not ready yet.
    }
  }

  function cameraLockEnabled() {
    const checkbox = document.getElementById('chk-camera');
    return !checkbox || checkbox.checked;
  }

  function cameraCenterAhead(lookAheadMeters) {
    let latitude;
    let longitude;
    let heading;
    try {
      latitude = Number(simLat);
      longitude = Number(simLng);
      heading = Number(currentHeading);
    } catch {
      return null;
    }
    if (![latitude, longitude, heading].every(Number.isFinite)) return null;

    const radians = heading * Math.PI / 180;
    const latitudeOffset = Math.cos(radians) * lookAheadMeters / 111320;
    const longitudeScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
    const longitudeOffset = Math.sin(radians) * lookAheadMeters / (111320 * longitudeScale);
    return [latitude + latitudeOffset, longitude + longitudeOffset];
  }

  function applySpeedCamera(deltaSeconds, timestamp) {
    if (DESKTOP_MANUAL_MAP || !state.settings.speedZoomEnabled || !cameraLockEnabled() || timestamp - state.lastCameraUpdate < 45) return;

    let map;
    try {
      map = mapInstance;
    } catch {
      return;
    }
    if (!map?.getZoom || !map?.setView) return;

    const speedKmh = currentSpeedKmh();
    const speedRatio = clamp((speedKmh - 35) / 165, 0, 1);
    const currentZoom = Number(map.getZoom());
    if (!Number.isFinite(currentZoom)) return;

    if (state.baseCameraZoom === null || (speedRatio < 0.03 && Math.abs(currentZoom - (state.cameraZoom ?? currentZoom)) > 0.3)) {
      state.baseCameraZoom = clamp(currentZoom, 16.5, 19);
    }
    if (state.cameraZoom === null) state.cameraZoom = currentZoom;

    map.options.zoomSnap = 0.25;
    map.options.zoomDelta = 0.25;
    const targetZoom = clamp(
      (state.baseCameraZoom ?? 18) - state.settings.zoomOutLevels * (speedRatio ** 0.72),
      15.5,
      19,
    );
    const zoomResponse = 1 - Math.exp(-deltaSeconds * 3.2);
    state.cameraZoom += (targetZoom - state.cameraZoom) * zoomResponse;
    const snappedZoom = Math.round(state.cameraZoom * 4) / 4;

    const lookAhead = state.settings.cameraLookAheadMeters * (0.18 + 0.82 * speedRatio);
    const center = cameraCenterAhead(lookAhead);
    if (!center) return;

    map.setView(center, snappedZoom, { animate: false });
    state.lastCameraUpdate = timestamp;
  }

  function animationTick(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - state.lastTimestamp) / 1000));
    state.lastTimestamp = timestamp;

    installSettingsPanel();
    applyMobileArcadeSteering(deltaSeconds);
    applyDesktopArcadeSteering(deltaSeconds);
    applyDirectionalArcadeSteering(deltaSeconds);
    applyCorneringAssist(deltaSeconds);
    applySpeedCamera(deltaSeconds, timestamp);
    requestAnimationFrame(animationTick);
  }

  function install() {
    instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    if (!instruments) {
      setTimeout(install, 60);
      return;
    }

    directionalTuning = window.PTBO_DIRECTIONAL_STEERING_TUNING || null;
    migrateDefaultMode();
    installSettingsPanel();
    state.installed = true;
    requestAnimationFrame(animationTick);

    window.dispatchEvent(new CustomEvent('ptbo-arcade-handling-ready', {
      detail: { version: VERSION, settings: { ...state.settings } },
    }));
  }

  window.PTBO_ARCADE_HANDLING = Object.freeze({
    version: VERSION,
    state,
    presets: PRESETS,
    applyPreset,
    reset() {
      state.settings = { ...DEFAULT_SETTINGS };
      saveSettings();
      syncControls();
    },
  });

  install();
})();
