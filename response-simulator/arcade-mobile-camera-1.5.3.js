/* =========================================================
   BEGINNER CODE GUIDE — STABLE MOBILE CAMERA

   PURPOSE:
   This module changes the map zoom at a few stable speed levels while the
   truck is being driven on a phone or tablet.

   WHAT THE PLAYER EXPERIENCES:
   At higher speed, the map reveals more road ahead. The zoom does not change
   continuously, which prevents rapid map-tile reloads and black flicker.

   HOW TO READ THIS FILE:
   - CONFIG contains fixed tuning values.
   - state is the camera's changing memory.
   - Small helper functions answer one question each.
   - tick() is the repeating camera decision loop.
   - install() connects this optional feature to the main simulator.

   SAFE EDITING:
   Test changes on a real mobile device while accelerating, slowing down,
   stopping, manually zooming, changing map layers, and pressing Recenter.
   Comments are ignored by the browser and do not affect gameplay.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE VERSION:
  The loader uses this value to identify the current camera module and to avoid
  installing the same module twice.
  */
  const VERSION = '1.5.12';
  if (window.PTBO_STABLE_MOBILE_CAMERA?.version === VERSION) return;

  /* =========================================================
     CAMERA TUNING SETTINGS

     enterSpeedsKmh:
     Speed required to zoom OUT to each wider view. Raising a number makes
     that wider view appear later; lowering it makes the view widen sooner.

     exitSpeedsKmh:
     Speed required to zoom back IN. These values are intentionally lower
     than the matching enter speeds. That gap is called hysteresis and keeps
     the camera from bouncing between two zoom levels near a threshold.

     changeDelayMs:
     How long speed must remain in a lower band before zooming in. Higher is
     steadier but slower to respond. Lower is faster but can cause more zooms.

     minimumChangeIntervalMs:
     Minimum time between completed zoom changes. This is another safeguard
     against repeated tile loading.

     minimumZoom / maximumZoom:
     Hard limits that keep the map within useful Leaflet zoom levels.
     ========================================================= */
  const CONFIG = Object.freeze({
    enterSpeedsKmh: Object.freeze([150, 300, 450, 600]),
    exitSpeedsKmh: Object.freeze([135, 285, 435, 585]),
    changeDelayMs: 350,
    minimumChangeIntervalMs: 1250,
    minimumZoom: 15,
    maximumZoom: 19,
  });

  /*
  LIVE STATE — THE CAMERA'S CHANGING MEMORY:
  installed: whether setup finished.
  active: whether this mobile-only module is in use.
  level: current number of zoom-out steps.
  candidateLevel: possible next step while speed settles.
  candidateSince: when that possible step first became valid.
  lastChangeAt: when zoom last changed.
  baseZoom: close view from which speed levels subtract.
  lastMaintenanceAt: limits housekeeping work to once per second.
  */
  const state = {
    installed: false,
    active: false,
    level: 0,
    candidateLevel: 0,
    candidateSince: 0,
    lastChangeAt: 0,
    baseZoom: null,
    lastMaintenanceAt: 0,
  };

  // References to systems created by other simulator files.
  let arcade = null;
  let instruments = null;
  let map = null;

  // Keeps a number inside a safe minimum and maximum range.
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  /*
  FUNCTION: isMobileWrapper

  WHAT THE CODE DOES:
  Checks whether the simulator is running inside the dedicated mobile page by
  looking for the parent's touch-steering control.

  WHY IT EXISTS:
  Desktop has different performance needs and should keep its existing camera.
  Cross-window access is wrapped in try/catch because browsers can block it.
  */
  function isMobileWrapper() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  /*
  FUNCTION: currentSpeedKmh

  WHAT THE CODE DOES:
  Reads the current physics speed, with instrument speed as a legacy fallback.

  PLAYER CONNECTION:
  This is the value that decides which map zoom band should be active.
  */
  function currentSpeedKmh() {
    // Use current physics speed so a gear change or delayed HUD reading cannot zoom early.
    if (window.PTBO_FIXED_STEP && window.PTBO_GEARBOX) {
      try { return Math.abs(Number(velocity) || 0) * window.PTBO_GEARBOX.velocityToKmh; } catch {}
    }
    return Math.max(0, Number(instruments?.state?.speedKmh) || 0);
  }

  // All four bands are required, regardless of saved handling-preset zoom settings.
  function maximumLevels() { return CONFIG.enterSpeedsKmh.length; }

  /*
  FUNCTION: desiredLevel

  WHAT THE CODE DOES:
  Calculates the zoom-out level appropriate for the current speed.

  IMPORTANT LOGIC:
  The first while loop moves outward only after an enter threshold is crossed.
  The second moves inward only after the lower exit threshold is crossed. This
  prevents a speed such as 150/149 km/h from making the camera change every frame.
  */
  function desiredLevel(speedKmh) {
    const maximum = maximumLevels();
    let next = clamp(state.level, 0, maximum);

    while (next < maximum && speedKmh + 1e-6 >= CONFIG.enterSpeedsKmh[next]) next += 1;
    while (next > 0 && speedKmh <= CONFIG.exitSpeedsKmh[next - 1]) next -= 1;
    return next;
  }

  /*
  FUNCTION: installStyle

  WHAT THE CODE DOES:
  Adds map background colours and small graphics-processing hints once.

  PLAYER CONNECTION:
  If a new tile is still loading, the player sees a matching grey or dark map
  background instead of a harsh black flash.
  */
  function installStyle() {
    if (document.getElementById('ptbo-stable-mobile-camera-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-stable-mobile-camera-style';
    style.textContent = `
      #map,.leaflet-container,.leaflet-tile-pane{background:#dfe3e7!important}
      html.ptbo-dark-basemap #map,
      html.ptbo-dark-basemap .leaflet-container,
      html.ptbo-dark-basemap .leaflet-tile-pane{background:#20242a!important}
      .leaflet-tile{backface-visibility:hidden;transform:translateZ(0)}
      .leaflet-zoom-animated{will-change:transform}
    `;
    document.head.appendChild(style);
  }

  /*
  FUNCTION: syncBasemapBackground

  WHAT THE CODE DOES:
  Gives the page a class when Dark Matter is selected so the temporary map
  background matches the chosen tile layer.
  */
  function syncBasemapBackground() {
    const value = document.getElementById('layer-select')?.value;
    document.documentElement.classList.toggle('ptbo-dark-basemap', value === 'dark');
  }

  /*
  FUNCTION: optimizeTileLayer

  WHAT THE CODE DOES:
  Adjusts Leaflet's existing tile layer for mobile stability:
  - waits until movement settles before replacing tiles;
  - keeps more off-screen tiles ready around the viewport;
  - limits how often tile updates begin.

  TRADE-OFF:
  A larger buffer uses more memory and data, but greatly lowers the chance that
  an empty area appears during movement or a zoom change.
  */
  function optimizeTileLayer() {
    try {
      const layer = tileLayerInstance;
      if (!layer?.options) return;
      layer.options.updateWhenZooming = false;
      layer.options.updateWhenIdle = true;
      layer.options.keepBuffer = Math.max(8, Number(layer.options.keepBuffer) || 0);
      layer.options.edgeBufferTiles = Math.max(3, Number(layer.options.edgeBufferTiles) || 0);
      layer.options.updateInterval = Math.max(250, Number(layer.options.updateInterval) || 0);
    } catch {
      // The base tile layer may still be starting, so the next maintenance pass tries again.
    }
  }

  /*
  FUNCTION: updateOptionsText

  WHAT THE CODE DOES:
  Renames the relevant settings and explains the stable mobile behaviour.
  The old look-ahead control is hidden because this module follows the truck
  without moving the camera centre ahead on every frame.
  */
  function updateOptionsText() {
    const sectionTitle = document.querySelector('#ptbo-arcade-handling-section .section-title');
    if (sectionTitle) sectionTitle.textContent = `Arcade Handling — v${VERSION}`;

    const zoomInput = document.getElementById('ptbo-arcade-zoomOutLevels');
    const zoomLabel = zoomInput?.closest('.control-row')?.querySelector('label span:first-child');
    if (zoomLabel) zoomLabel.textContent = 'Speed-based zoom';
    const zoomRow = zoomInput?.closest('.control-row');
    if (zoomRow) zoomRow.style.display = 'none';
    const toggle = document.getElementById('ptbo-arcade-speed-zoom');
    if (toggle) {
      toggle.checked = true;
      toggle.disabled = true;
      toggle.title = 'Zooms out at 150, 300, 450 and 600 km/h.';
    }

    const lookAheadInput = document.getElementById('ptbo-arcade-cameraLookAheadMeters');
    const lookAheadRow = lookAheadInput?.closest('.control-row');
    if (lookAheadRow) lookAheadRow.style.display = 'none';

    const note = document.getElementById('ptbo-arcade-note');
    if (note) {
      note.textContent = 'Camera starts fully zoomed in. It zooms out one step at 150, 300, 450 and 600 km/h, then holds that view above 600. Slowing down brings the view closer, with a 15 km/h buffer to prevent flicker. Gear shifts alone do not change zoom.';
    }
  }

  /*
  FUNCTION: readMap

  WHAT THE CODE DOES:
  Safely copies the base simulator's Leaflet map reference into this module.
  It returns null while the main map is still starting.
  */
  function readMap() {
    try {
      map = mapInstance;
    } catch {
      map = null;
    }
    return map;
  }

  // A fixed base prevents a saved/manual zoom from moving the speed thresholds.
  function captureBaseZoom() { state.baseZoom = CONFIG.maximumZoom; }

  /*
  FUNCTION: applyLevel

  WHAT THE PLAYER EXPERIENCES:
  The map changes to one wider or closer whole-number zoom level.

  WHAT THE CODE DOES:
  Calculates the target zoom, records the new state, keeps the current map
  centre, and performs a non-animated Leaflet setZoom after satellite preloading.
  */
  function applyLevel(level, timestamp) {
    if (!map?.setZoom || state.baseZoom === null) return;
    const nextLevel = clamp(level, 0, maximumLevels());
    const targetZoom = clamp(state.baseZoom - nextLevel, CONFIG.minimumZoom, CONFIG.maximumZoom);
    const currentZoom = Number(map.getZoom());
    const previousTarget = state.baseZoom - state.level;
    if (targetZoom !== previousTarget) window.PTBO_SATELLITE_MAP?.cancelPendingZoom?.(previousTarget);

    state.level = nextLevel;
    state.candidateLevel = nextLevel;
    state.candidateSince = timestamp;
    state.lastChangeAt = timestamp;

    if (!Number.isFinite(currentZoom) || Math.abs(currentZoom - targetZoom) < 0.01) return;

    // The satellite guard preloads this zoom. setZoom uses the current centre when
    // that request completes, so moving trucks do not jump back to an old position.
    map.setZoom(targetZoom, { animate: false });
  }

  /*
  FUNCTION: tick

  WHAT THE CODE DOES:
  Runs once per animation frame, but performs expensive housekeeping only once
  per second. It applies upward speed thresholds and waits for lower bands
  to settle before zooming back in. Route review keeps control of its own view.

  WHY IT EXISTS:
  This is the decision loop that connects changing vehicle speed to the camera
  without allowing camera work to overwhelm mobile map rendering.
  */
  function tick(timestamp) {
    if (!state.installed) return;

    // Disable the older fractional camera pass so two camera systems never fight.
    // The base simulator still centres the map on the moving truck.
    arcade.state.lastCameraUpdate = Number.POSITIVE_INFINITY;

    // Options text and tile settings do not need to be rewritten 60 times a second.
    if (timestamp - state.lastMaintenanceAt >= 1000) {
      updateOptionsText();
      optimizeTileLayer();
      state.lastMaintenanceAt = timestamp;
    }

    // The old arcade zoom flag and hidden camera-lock checkbox belong to retired
    // camera passes. They must not disable this controller (both driving views follow).
    const reviewing = window.PTBO_ROUTE_COMPARE?.state?.reviewOpen;
    const speedKmh = currentSpeedKmh();

    if (reviewing) {
      requestAnimationFrame(tick);
      return;
    }

    if (state.baseZoom === null) captureBaseZoom();
    if (state.baseZoom === null) {
      requestAnimationFrame(tick);
      return;
    }

    const next = desiredLevel(speedKmh);
    if (next !== state.candidateLevel) {
      state.candidateLevel = next;
      state.candidateSince = timestamp;
    }

    const stableLongEnough = timestamp - state.candidateSince >= CONFIG.changeDelayMs;
    const intervalPassed = timestamp - state.lastChangeAt >= CONFIG.minimumChangeIntervalMs;
    if (next !== state.level && (next > state.level || stableLongEnough) && intervalPassed) {
      applyLevel(next, timestamp);
    }

    requestAnimationFrame(tick);
  }

  /*
  FUNCTION: install

  WHAT THE CODE DOES:
  Stops immediately on desktop, waits until the arcade controls, instruments,
  and Leaflet map exist, then configures the map and starts tick().

  WHY THE RETRY:
  These files load asynchronously. Retrying after 60 ms avoids guessing which
  file will finish first and prevents a cold-start race condition.
  */
  function install() {
    if (!isMobileWrapper()) return;
    arcade = window.PTBO_ARCADE_HANDLING;
    instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    if (!arcade || !instruments || !readMap()) {
      setTimeout(install, 60);
      return;
    }

    state.active = true;
    state.installed = true;
    state.candidateSince = performance.now();

    // Whole zoom steps and disabled animations prioritize stable raster tiles.
    map.options.zoomSnap = 1;
    map.options.zoomDelta = 1;
    map.options.fadeAnimation = false;
    map.options.zoomAnimation = false;

    installStyle();
    syncBasemapBackground();
    optimizeTileLayer();
    updateOptionsText();
    captureBaseZoom();
    applyLevel(0, performance.now());

    // A layer change creates a new tile layer, so apply the optimizations again.
    document.getElementById('layer-select')?.addEventListener('change', () => {
      syncBasemapBackground();
      setTimeout(optimizeTileLayer, 50);
      setTimeout(optimizeTileLayer, 300);
    });

    window.dispatchEvent(new CustomEvent('ptbo-stable-mobile-camera-ready', {
      detail: { version: VERSION, baseZoom: state.baseZoom },
    }));
    requestAnimationFrame(tick);
  }

  /*
  PUBLIC MODULE API:
  Other files can check version/state/config. resetZoom() is used by the mobile
  Recenter button to restore the current speed band (the closest view at rest).
  */
  window.PTBO_STABLE_MOBILE_CAMERA = Object.freeze({
    version: VERSION,
    state,
    config: CONFIG,
    resetZoom() {
      if (map && state.baseZoom !== null) applyLevel(desiredLevel(currentSpeedKmh()), performance.now());
    },
  });

  install();
})();
