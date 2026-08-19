/* =========================================================
   RESPONSE SIMULATOR — DIRECTIONAL DRIVE + VIEW GEAR v1.5.7

   Mobile default behaviour:
   - Directional thumbstick points the truck AND supplies forward drive.
   - Releasing the thumbstick releases forward drive and keeps the current heading.
   - The right Gas-position button becomes a view Gear in directional mode.
   - Each Gear press zooms the north-up map out by 0.5 level.
   - The map starts at the closest useful satellite view (zoom 19).
   - Speed-based automatic zoom is disabled.
   - Standard left/right steering remains selectable in Settings; in Standard
     mode the right button returns to normal Gas behaviour.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.5.7';
  if (window.PTBO_DIRECTIONAL_DRIVE_ZOOM?.version === VERSION) return;

  const DIRECTIONAL_MODE = 'directional';
  const DEFAULT_MIGRATION_KEY = 'ptboDirectionalDriveZoomDefaultV157';
  const CLOSE_ZOOM = 19;
  const MIN_ZOOM = 15;
  const ZOOM_STEP = 0.5;
  const DRIVE_DEADZONE = 0.18;

  const state = {
    installed: false,
    directionalDriveActive: false,
    steeringPointer: null,
    steeringMagnitude: 0,
    gasPointer: null,
    gearPresses: 0,
    lastMaintenanceAt: 0,
  };

  let instruments = null;
  let arcade = null;
  let parentDoc = null;
  let steering = null;
  let gas = null;
  let reverse = null;
  let hint = null;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

  function setKey(name, value) {
    try {
      if (keys && Object.prototype.hasOwnProperty.call(keys, name)) keys[name] = Boolean(value);
    } catch {
      // Base simulator globals may still be starting.
    }
  }

  function applyNorthUp() {
    try {
      headingUpMode = false;
      const pane = mapInstance?.getPane?.('mapPane');
      if (pane) pane.style.rotate = '0deg';
      updateMapOrientation?.();
    } catch {
      // The base map may not exist yet.
    }
  }

  function disableAutomaticZoom() {
    arcade = window.PTBO_ARCADE_HANDLING || arcade;
    if (arcade?.state?.settings) {
      arcade.state.settings.speedZoomEnabled = false;
      arcade.state.cameraZoom = null;
      arcade.state.baseCameraZoom = null;
    }

    const speedZoom = document.getElementById('ptbo-arcade-speed-zoom');
    if (speedZoom) {
      speedZoom.checked = false;
      speedZoom.disabled = true;
      const label = speedZoom.closest('label') || speedZoom.parentElement;
      if (label) label.title = 'Automatic speed zoom is disabled. Directional mode uses the Gear button to widen the map.';
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
      return true;
    } catch {
      return false;
    }
  }

  function setClosestView() {
    try {
      if (!mapInstance) return false;
      configureMap();
      mapInstance.setView([simLat, simLng], CLOSE_ZOOM, { animate: false });
      return true;
    } catch {
      return false;
    }
  }

  function shiftViewOut() {
    try {
      if (!mapInstance) return false;
      configureMap();
      const current = Number(mapInstance.getZoom());
      const target = Math.max(MIN_ZOOM, Math.min(CLOSE_ZOOM, current - ZOOM_STEP));
      if (!Number.isFinite(current) || Math.abs(target - current) < 0.01) return false;
      mapInstance.setView([simLat, simLng], target, { animate: false });
      state.gearPresses += 1;
      return true;
    } catch {
      return false;
    }
  }

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
      setButtonWord(gas, directional ? 'Gear' : 'Gas');
      gas.setAttribute('aria-label', directional ? 'Widen map view one gear' : 'Gas');
      gas.title = directional
        ? 'View Gear: each press zooms the north-up map out slightly.'
        : 'Gas';
    }
    if (hint) {
      hint.textContent = directional
        ? 'Point and hold the stick to drive · Gear widens the map · Reverse backs up'
        : 'Drag the wheel to steer · Hold Gas to drive · Hold Reverse to back up';
    }

    const note = document.getElementById('ptbo-steering-mode-note');
    if (note) {
      note.textContent = directional
        ? 'Directional Thumbstick is the default: point and hold to steer and drive. The right Gear button widens the fixed north-up map. Standard Left / Right remains available here.'
        : 'Standard Left / Right uses the steering control plus the Gas pedal. Automatic speed-based map zoom remains disabled.';
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
    if (!isDirectional() || !eventInside(gas, event)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    return true;
  }

  function handleGearDown(event) {
    if (!interceptDirectionalGear(event)) return;
    state.gasPointer = event.pointerId;
    gas?.setPointerCapture?.(event.pointerId);
    gas?.classList.add('pressed');
    shiftViewOut();
    try { window.parent.navigator.vibrate?.(10); } catch {}
  }

  function handleGearRelease(event) {
    if (!isDirectional() || !eventInside(gas, event)) return;
    if (state.gasPointer !== null && event?.pointerId !== undefined && event.pointerId !== state.gasPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.gasPointer = null;
    gas?.classList.remove('pressed');
    setKey('ArrowUp', state.directionalDriveActive && state.steeringMagnitude > DRIVE_DEADZONE);
  }

  function enforceDirectionalDrive() {
    if (!isDirectional()) return;
    let reverseHeld = false;
    try { reverseHeld = Boolean(keys.ArrowDown || keys.s); } catch {}
    setKey('ArrowUp', state.directionalDriveActive && state.steeringMagnitude > DRIVE_DEADZONE && !reverseHeld);
    setKey('w', false);
  }

  function installEventBridges() {
    if (!parentDoc || parentDoc.documentElement.dataset.ptboDirectionalDriveZoom === VERSION) return;
    parentDoc.documentElement.dataset.ptboDirectionalDriveZoom = VERSION;

    parentDoc.addEventListener('pointerdown', event => {
      handleSteeringDown(event);
      handleGearDown(event);
    }, true);
    parentDoc.addEventListener('pointermove', handleSteeringMove, true);
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

    window.parent.addEventListener('blur', releaseDirectionalDrive, true);
    parentDoc.addEventListener('visibilitychange', () => {
      if (parentDoc.hidden) releaseDirectionalDrive();
    });

    window.addEventListener('ptbo-steering-mode-change', () => {
      releaseDirectionalDrive();
      syncParentUi();
      disableAutomaticZoom();
      applyNorthUp();
    });
  }

  function installPublicApi() {
    window.mobileZoomGear = shiftViewOut;
    window.mobileRecenter = () => {
      disableAutomaticZoom();
      applyNorthUp();
      setClosestView();
    };
  }

  function tick(timestamp) {
    if (!state.installed) return;
    enforceDirectionalDrive();
    applyNorthUp();

    if (timestamp - state.lastMaintenanceAt > 750) {
      state.lastMaintenanceAt = timestamp;
      disableAutomaticZoom();
      syncParentUi();
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
    disableAutomaticZoom();
    configureMap();
    installEventBridges();
    installPublicApi();
    syncParentUi();

    // Run after wrapper recenter/startup helpers so v1.5.7 owns the initial view.
    setTimeout(() => {
      disableAutomaticZoom();
      applyNorthUp();
      setClosestView();
      syncParentUi();
    }, 0);
    setTimeout(setClosestView, 350);

    state.installed = true;
    requestAnimationFrame(tick);
  }

  window.PTBO_DIRECTIONAL_DRIVE_ZOOM = Object.freeze({
    version: VERSION,
    state,
    closeZoom: CLOSE_ZOOM,
    minimumZoom: MIN_ZOOM,
    zoomStep: ZOOM_STEP,
    zoomOut: shiftViewOut,
    resetView: setClosestView,
  });

  install().catch(error => console.error('Directional drive / gear zoom setup failed.', error));
})();
