/* =========================================================
   RESPONSE SIMULATOR — DIRECTIONAL DRIVE + GEAR SPEED v1.6.0

   Mobile default behaviour:
   - Directional thumbstick points the truck AND supplies forward drive.
   - Releasing the thumbstick releases forward drive and keeps the current heading.
   - Separate up/down buttons select six gears (50–250, then 999 km/h).
   - Speed approaches the selected limit smoothly; gear 6 gains 12 km/h each second.
   - Gear shifts change speed limits; the stable mobile camera owns zoom.
   - The map starts at the closest useful satellite view (zoom 19).
   - Camera zoom steps occur at 150, 300, 450 and 600 km/h.
   - Standard left/right steering remains selectable in Settings; in Standard
     mode the right button returns to normal Gas behaviour.
   - Mobile map controls are positioned so they do not cover the dispatch HUD,
     and Leaflet attribution stays visible without a large white background box.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.6.0';
  if (window.PTBO_DIRECTIONAL_DRIVE_ZOOM?.version === VERSION) return;

  const DIRECTIONAL_MODE = 'directional';
  const DEFAULT_MIGRATION_KEY = 'ptboDirectionalDriveZoomDefaultV158';
  const CLOSE_ZOOM = 19;
  const MIN_ZOOM = 15;
  const ZOOM_STEP = 1;
  const DRIVE_DEADZONE = 0.18;
  const gearbox = window.PTBO_GEARBOX;
  if (!gearbox) throw new Error('Gearbox speed controller did not load.');
  const GEAR_SPEEDS_KMH = gearbox.gearSpeedsKmh;

  const state = {
    installed: false,
    directionalDriveActive: false,
    steeringPointer: null,
    steeringMagnitude: 0,
    gasPointer: null,
    gearButton: null,
    lastPhysicsTimestamp: null,
    currentGear: 1,
    gearPresses: 0,
    lastMaintenanceAt: 0,
  };

  let instruments = null;
  let arcade = null;
  let parentDoc = null;
  let steering = null;
  let gas = null;
  let gearDown = null;
  let gearLimit = null;
  let reverse = null;
  let hint = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function isMobileWrapper() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  function isDirectional() {
    return instruments?.state?.steeringMode === DIRECTIONAL_MODE;
  }

  function currentGearSpeed() {
    return GEAR_SPEEDS_KMH[clamp(state.currentGear - 1, 0, GEAR_SPEEDS_KMH.length - 1)];
  }

  function setKey(name, value) {
    try {
      if (keys && Object.prototype.hasOwnProperty.call(keys, name)) keys[name] = Boolean(value);
    } catch {
      // Base simulator globals may still be starting.
    }
  }

  function applyNorthUp() {
    try {
      let orientationChanged = headingUpMode !== false;
      if (orientationChanged) headingUpMode = false;
      const pane = mapInstance?.getPane?.('mapPane');
      if (pane && pane.style.rotate !== '0deg') {
        pane.style.rotate = '0deg';
        orientationChanged = true;
      }
      if (orientationChanged) updateMapOrientation?.();
    } catch {
      // The base map may not exist yet.
    }
  }

  function disableLegacySpeedZoom() {
    arcade = window.PTBO_ARCADE_HANDLING || arcade;
    if (arcade?.state?.settings) {
      arcade.state.settings.speedZoomEnabled = false;
      arcade.state.cameraZoom = null;
      arcade.state.baseCameraZoom = null;
    }

  }

  function installMobileUiFixes() {
    let style = document.getElementById('ptbo-mobile-map-layout-v158');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-mobile-map-layout-v158';
      style.textContent = `
        @media(max-width:900px),(pointer:coarse){
          #ptbo-map-toggle{
            top:calc(148px + env(safe-area-inset-top))!important;
            left:auto!important;
            right:10px!important;
            z-index:1245!important;
            max-width:150px!important;
          }
          .leaflet-control-attribution{
            max-width:92vw!important;
            margin:0 5px 3px 0!important;
            padding:1px 3px!important;
            color:rgba(255,255,255,.78)!important;
            background:transparent!important;
            box-shadow:none!important;
            border:0!important;
            border-radius:0!important;
            font:600 6px/1.08 system-ui,-apple-system,"Segoe UI",sans-serif!important;
            text-align:right!important;
            text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 3px rgba(0,0,0,.8)!important;
          }
          .leaflet-control-attribution a{
            color:inherit!important;
            background:transparent!important;
            text-decoration:none!important;
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  function configureMap() {
    try {
      if (!mapInstance) return false;
      mapInstance.options.zoomSnap = ZOOM_STEP;
      mapInstance.options.zoomDelta = ZOOM_STEP;
      mapInstance.options.fadeAnimation = false;
      mapInstance.options.zoomAnimation = false;
      const lock = document.getElementById('chk-camera');
      if (lock) lock.checked = true;
      applyNorthUp();
      installMobileUiFixes();
      return true;
    } catch {
      return false;
    }
  }

  function setClosestView() {
    try {
      if (!mapInstance) return false;
      configureMap();
      const camera = window.PTBO_STABLE_MOBILE_CAMERA;
      if (camera?.state?.installed) {
        camera.resetZoom();
        mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: false });
      } else mapInstance.setView([simLat, simLng], CLOSE_ZOOM, { animate: false });
      return true;
    } catch {
      return false;
    }
  }

  function resetGear({ resetView = false } = {}) {
    state.currentGear = 1;
    state.gearPresses = 0;
    releaseGearPress();
    if (resetView) setClosestView();
    syncParentUi();
  }

  function shiftGear(direction) {
    if (!isDirectional()) return false;
    const next = clamp(state.currentGear + direction, 1, GEAR_SPEEDS_KMH.length);
    if (next === state.currentGear) return false;
    state.currentGear = next;
    state.gearPresses += 1;
    syncParentUi();
    return true;
  }

  function shiftUp() { return shiftGear(1); }
  function shiftDown() { return shiftGear(-1); }

  function steeringMagnitudeFromEvent(event) {
    if (!steering) return 0;
    const rect = steering.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const travel = Math.max(1, Math.min(rect.width, rect.height) * 0.31);
    return Math.min(1, Math.hypot(event.clientX - centerX, event.clientY - centerY) / travel);
  }

  function updateDirectionalDrive(event) {
    if (!isDirectional()) return;
    state.directionalDriveActive = true;
    state.steeringMagnitude = steeringMagnitudeFromEvent(event);
    const reverseHeld = (() => {
      try { return Boolean(keys.ArrowDown || keys.s); } catch { return false; }
    })();
    setKey('ArrowUp', state.steeringMagnitude > DRIVE_DEADZONE && !reverseHeld);
    setKey('w', false);
  }

  function releaseDirectionalDrive() {
    state.directionalDriveActive = false;
    state.steeringPointer = null;
    state.steeringMagnitude = 0;
    setKey('ArrowUp', false);
    setKey('w', false);
  }

  function setButtonWord(button, word) {
    if (!button) return;
    const textNodes = [...button.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    if (textNodes.length) textNodes[textNodes.length - 1].nodeValue = word;
  }

  function syncParentUi() {
    const directional = isDirectional();
    if (gas) {
      const atMax = state.currentGear >= GEAR_SPEEDS_KMH.length;
      const gearText = `Gear ${state.currentGear}`;
      setButtonWord(gas, directional ? gearText : 'Gas');
      gas.classList.toggle('gear-up', directional);
      gas.disabled = directional && atMax;
      if (gearLimit) {
        gearLimit.hidden = !directional;
        gearLimit.textContent = `${currentGearSpeed()} km/h`;
      }
      gas.setAttribute(
        'aria-label',
        directional
          ? `${gearText}. ${currentGearSpeed()} kilometres per hour maximum. ${atMax ? 'Top gear.' : 'Press to shift up.'}`
          : 'Gas'
      );
      gas.title = directional
        ? `${gearText}: ${currentGearSpeed()} km/h maximum.${atMax ? ' Speed builds steadily while driving.' : ' Shift up for more speed.'}`
        : 'Gas';
    }
    if (gearDown) {
      gearDown.hidden = !directional;
      gearDown.disabled = !directional || state.currentGear === 1;
      gearDown.setAttribute('aria-label', state.currentGear === 1 ? 'Shift down. Already in gear 1.' : `Shift down to gear ${state.currentGear - 1}`);
    }
    if (hint) {
      hint.textContent = directional
        ? `Point and hold to drive · Gear ${state.currentGear}: ${currentGearSpeed()} km/h · Use Up / Down to shift`
        : 'Drag the wheel to steer · Hold Gas to drive · Hold Reverse to back up';
    }

    const acceleration = document.getElementById('sld-speed');
    if (acceleration) {
      acceleration.disabled = directional;
      acceleration.title = directional ? 'Acceleration is controlled by the selected gear.' : 'Adjust acceleration';
    }
    const speedLabel = document.getElementById('lbl-speed');
    if (speedLabel) speedLabel.textContent = directional ? 'Gear control' : acceleration?.value || '5';
    const note = document.getElementById('ptbo-steering-mode-note');
    if (note) {
      note.textContent = directional
        ? 'Directional Thumbstick is the default. Point and hold to steer and drive. Gears 1–5: 50, 100, 150, 200, 250 km/h. Gear 6 steadily builds toward 999 km/h. Shift up or down; speed changes smoothly. Standard Left / Right remains available here.'
        : 'Standard Left / Right uses the steering control plus the Gas pedal. Gear-limited speed applies only to Directional Thumbstick mode.';
    }
  }

  function makeDirectionalDefaultOnce() {
    if (!instruments?.setSteeringMode) return;
    if (localStorage.getItem(DEFAULT_MIGRATION_KEY) === '1') return;
    instruments.setSteeringMode(DIRECTIONAL_MODE);
    localStorage.setItem(DEFAULT_MIGRATION_KEY, '1');
  }

  function eventInside(element, event) {
    const target = event?.target;
    return Boolean(element && target && (target === element || element.contains(target)));
  }

  function handleSteeringDown(event) {
    if (!isDirectional() || !eventInside(steering, event)) return;
    state.steeringPointer = event.pointerId;
    updateDirectionalDrive(event);
  }

  function handleSteeringMove(event) {
    if (!isDirectional() || state.steeringPointer === null || event.pointerId !== state.steeringPointer) return;
    updateDirectionalDrive(event);
  }

  function handleSteeringRelease(event) {
    if (!isDirectional()) return;
    if (state.steeringPointer !== null && event?.pointerId !== undefined && event.pointerId !== state.steeringPointer) return;
    releaseDirectionalDrive();
  }

  function interceptDirectionalGear(event) {
    if (!isDirectional() || (!eventInside(gas, event) && !eventInside(gearDown, event))) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function releaseGearPress() {
    state.gearButton?.classList.remove('pressed');
    state.gearButton = null;
    state.gasPointer = null;
  }

  function handleGearDown(event) {
    if (!interceptDirectionalGear(event)) return;
    const button = eventInside(gearDown, event) ? gearDown : gas;
    if (button.disabled || state.gasPointer !== null) return;
    state.gasPointer = event.pointerId;
    state.gearButton = button;
    button.setPointerCapture?.(event.pointerId);
    button.classList.add('pressed');
    if (button === gearDown) shiftDown(); else shiftUp();
    if (button.disabled) {
      button.releasePointerCapture?.(event.pointerId);
      releaseGearPress();
    }
    try { window.parent.navigator.vibrate?.(10); } catch {}
  }

  function handleGearRelease(event) {
    if (state.gasPointer === null || event.pointerId !== state.gasPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    releaseGearPress();
  }

  function handleGearClick(event) {
    if (!interceptDirectionalGear(event)) return;
    // Native Enter/Space and assistive-technology clicks have no pointer press.
    // Pointer gestures already shifted on pointerdown, so never shift twice.
    if (event.detail !== 0) return;
    if (eventInside(gearDown, event)) shiftDown(); else shiftUp();
  }

  function enforceDirectionalDrive() {
    if (!isDirectional()) return;
    let reverseHeld = false;
    try { reverseHeld = Boolean(keys.ArrowDown || keys.s); } catch {}
    setKey('ArrowUp', state.directionalDriveActive && state.steeringMagnitude > DRIVE_DEADZONE && !reverseHeld);
    setKey('w', false);
  }

  function driveStep(seconds) {
    if (!state.installed || !isDirectional()) return false;
    const throttle = keys.ArrowDown || keys.s ? -1 : keys.ArrowUp || keys.w ? 1 : 0;
    const speed = (Number(velocity) || 0) * gearbox.velocityToKmh;
    velocity = gearbox.stepSpeed(speed, state.currentGear, throttle, seconds) / gearbox.velocityToKmh;
    return true;
  }

  function wrapStationTeleport() {
    if (window.teleportToStation?.ptboGearResetWrapped) return;
    const original = window.teleportToStation;
    if (typeof original !== 'function') return;
    const wrapped = function(...args) {
      const result = original.apply(this, args);
      resetGear({ resetView: true });
      return result;
    };
    wrapped.ptboGearResetWrapped = true;
    window.teleportToStation = wrapped;
  }

  function installEventBridges() {
    if (!parentDoc || parentDoc.documentElement.dataset.ptboDirectionalDriveZoom === VERSION) return;
    parentDoc.documentElement.dataset.ptboDirectionalDriveZoom = VERSION;

    parentDoc.addEventListener('pointerdown', event => {
      handleSteeringDown(event);
      handleGearDown(event);
    }, true);
    parentDoc.addEventListener('pointermove', handleSteeringMove, true);
    parentDoc.addEventListener('click', handleGearClick, true);
    parentDoc.addEventListener('pointerup', event => {
      if (eventInside(steering, event)) handleSteeringRelease(event);
      handleGearRelease(event);
    }, true);
    parentDoc.addEventListener('pointercancel', event => {
      if (eventInside(steering, event)) handleSteeringRelease(event);
      handleGearRelease(event);
    }, true);
    parentDoc.addEventListener('lostpointercapture', event => {
      if (eventInside(steering, event)) handleSteeringRelease(event);
      handleGearRelease(event);
    }, true);

    window.parent.addEventListener('blur', () => { releaseDirectionalDrive(); releaseGearPress(); }, true);
    parentDoc.addEventListener('visibilitychange', () => {
      if (parentDoc.hidden) { releaseDirectionalDrive(); releaseGearPress(); }
    });

    window.addEventListener('ptbo-steering-mode-change', () => {
      releaseDirectionalDrive();
      releaseGearPress();
      window.PTBO_SPEED_STREAK?.reset?.('steering-mode');
      if (isDirectional()) resetGear({ resetView: true });
      syncParentUi();
      disableLegacySpeedZoom();
      applyNorthUp();
    });
  }

  function installPublicApi() {
    window.mobileZoomGear = shiftUp;
    window.mobileShiftDown = shiftDown;
    window.mobileRecenter = () => {
      disableLegacySpeedZoom();
      applyNorthUp();
      // Dragging the map pauses the shared camera's follow state. Resume that
      // state before changing zoom so Recenter keeps the truck centred.
      window.PTBO_DRIVING_CAMERA?.recenter?.();
      setClosestView();
    };
  }

  function tick(timestamp) {
    if (!state.installed) return;
    const seconds = state.lastPhysicsTimestamp === null ? 0 : Math.min(0.1, (timestamp - state.lastPhysicsTimestamp) / 1000);
    state.lastPhysicsTimestamp = timestamp;
    if (!window.PTBO_FIXED_STEP) { enforceDirectionalDrive(); driveStep(seconds); }
    applyNorthUp();

    if (timestamp - state.lastMaintenanceAt > 750) {
      state.lastMaintenanceAt = timestamp;
      disableLegacySpeedZoom();
      installMobileUiFixes();
      syncParentUi();
      wrapStationTeleport();
    }
    requestAnimationFrame(tick);
  }

  async function install() {
    if (!isMobileWrapper()) return;

    while (!window.PTBO_VEHICLE_INSTRUMENTS || !window.PTBO_ARCADE_HANDLING) {
      await sleep(50);
    }

    instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    arcade = window.PTBO_ARCADE_HANDLING;
    try {
      parentDoc = window.parent.document;
      steering = parentDoc.getElementById('steering');
      gas = parentDoc.getElementById('gas-pedal');
      gearDown = parentDoc.getElementById('gear-down');
      gearLimit = parentDoc.getElementById('gear-limit');
      reverse = parentDoc.getElementById('reverse-pedal');
      hint = parentDoc.querySelector('.control-hint');
    } catch {
      return;
    }

    if (!steering || !gas || !reverse) return;

    while (true) {
      try {
        if (mapInstance) break;
      } catch {}
      await sleep(50);
    }

    makeDirectionalDefaultOnce();
    resetGear();
    disableLegacySpeedZoom();
    configureMap();
    installMobileUiFixes();
    installEventBridges();
    installPublicApi();
    wrapStationTeleport();
    syncParentUi();

    // Run after wrapper recenter/startup helpers so v1.6.0 owns the initial view.
    setTimeout(() => {
      disableLegacySpeedZoom();
      applyNorthUp();
      setClosestView();
      installMobileUiFixes();
      syncParentUi();
    }, 0);
    setTimeout(setClosestView, 350);

    state.installed = true;
    requestAnimationFrame(tick);
  }

  window.PTBO_DIRECTIONAL_DRIVE_ZOOM = Object.freeze({
    version: VERSION,
    state,
    gearSpeedsKmh: GEAR_SPEEDS_KMH,
    closeZoom: CLOSE_ZOOM,
    minimumZoom: MIN_ZOOM,
    zoomStep: ZOOM_STEP,
    shiftUp,
    shiftDown,
    driveStep,
    beforeStep() { if (state.installed) enforceDirectionalDrive(); },
    releaseInput() { releaseDirectionalDrive(); releaseGearPress(); },
    resetGear,
    resetView: setClosestView,
  });

  install().catch(error => console.error('Directional drive / gear speed setup failed.', error));
})();
