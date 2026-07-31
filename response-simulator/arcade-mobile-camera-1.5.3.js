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
  The loader uses this value to identify the v1.5.3 camera module and to avoid
  installing the same module twice.
  */
  const VERSION = '1.5.3';
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
     How long speed must remain in a new band before zoom changes. Higher is
     steadier but slower to respond. Lower is faster but can cause more zooms.

     minimumChangeIntervalMs:
     Minimum time between completed zoom changes. This is another safeguard
     against repeated tile loading.

     stoppedSpeedKmh:
     Below this speed, a manual zoom is accepted as the player's new base view.

     minimumZoom / maximumZoom:
     Hard limits that keep the map within useful Leaflet zoom levels.
     ========================================================= */
  const CONFIG = Object.freeze({
    enterSpeedsKmh: [72, 132, 192],
    exitSpeedsKmh: [50, 102, 158],
    changeDelayMs: 700,
    minimumChangeIntervalMs: 1250,
    stoppedSpeedKmh: 22,
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
  programmaticZoom: distinguishes code-created zooms from player zooms.
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
    programmaticZoom: false,
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
  Reads the speed calculated by the vehicle-instruments module and converts
  missing or invalid values to zero.

  PLAYER CONNECTION:
  This is the value that decides which map zoom band should be active.
  */
  function currentSpeedKmh() {
    return Math.max(0, Number(instruments?.state?.speedKmh) || 0);
  }

  /*
  FUNCTION: cameraLockEnabled

  WHAT THE CODE DOES:
  Reads the Options checkbox that tells the map to follow the truck.

  WHY IT EXISTS:
  Speed-controlled zoom should not take over when the player deliberately
  unlocks the camera.
  */
  function cameraLockEnabled() {
    const checkbox = document.getElementById('chk-camera');
    return !checkbox || checkbox.checked;
  }

  /*
  FUNCTION: maximumLevels

  WHAT THE CODE DOES:
  Converts the player's Maximum Zoom-Out setting into a whole number of
  allowed mobile zoom steps, limited by the number of configured speed bands.

  WHY WHOLE NUMBERS:
  Leaflet can show fractional zooms, but raster tiles are stored at whole zoom
  levels. Whole steps reduce repeated rescaling and tile-container flicker.
  */
  function maximumLevels() {
    const requested = Number(arcade?.state?.settings?.zoomOutLevels) || 0;
    return clamp(Math.round(requested), 0, CONFIG.enterSpeedsKmh.length);
  }

  /*
  FUNCTION: desiredLevel

  WHAT THE CODE DOES:
  Calculates the zoom-out level appropriate for the current speed.

  IMPORTANT LOGIC:
  The first while loop moves outward only after an enter threshold is crossed.
  The second moves inward only after the lower exit threshold is crossed. This
  prevents a speed such as 72/71 km/h from making the camera change every frame.
  */
  function desiredLevel(speedKmh) {
    const maximum = maximumLevels();
    let next = clamp(state.level, 0, maximum);

    while (next < maximum && speedKmh >= CONFIG.enterSpeedsKmh[next]) next += 1;
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
    if (zoomLabel) zoomLabel.textContent = 'Mobile Zoom-Out Levels';

    const lookAheadInput = document.getElementById('ptbo-arcade-cameraLookAheadMeters');
    const lookAheadRow = lookAheadInput?.closest('.control-row');
    if (lookAheadRow) lookAheadRow.style.display = 'none';

    const note = document.getElementById('ptbo-arcade-note');
    if (note) {
      note.textContent = 'Mobile zoom uses stable whole-number speed bands. It waits for speed to settle before changing levels, preventing repeated tile reloads and black flicker while accelerating.';
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

  /*
  FUNCTION: captureBaseZoom

  WHAT THE CODE DOES:
  Records the player's close/base zoom. The current speed level is added back
  because the displayed map may already be zoomed out.

  WHY IT EXISTS:
  Every speed level is calculated relative to one stable starting view.
  */
  function captureBaseZoom() {
    const current = Number(map?.getZoom?.());
    if (!Number.isFinite(current)) return;
    state.baseZoom = clamp(Math.round(current) + state.level, CONFIG.minimumZoom, CONFIG.maximumZoom);
  }

  /*
  FUNCTION: applyLevel

  WHAT THE PLAYER EXPERIENCES:
  The map changes to one wider or closer whole-number zoom level.

  WHAT THE CODE DOES:
  Calculates the target zoom, records the new state, keeps the current map
  centre, and performs a non-animated Leaflet setView.

  IMPORTANT DETAIL:
  programmaticZoom stays true briefly so handleZoomEnd knows this zoom came
  from the game rather than from the player's fingers.
  */
  function applyLevel(level, timestamp, immediate = false) {
    if (!map?.setView || state.baseZoom === null) return;
    const nextLevel = clamp(level, 0, maximumLevels());
    const targetZoom = clamp(state.baseZoom - nextLevel, CONFIG.minimumZoom, CONFIG.maximumZoom);
    const currentZoom = Number(map.getZoom());

    state.level = nextLevel;
    state.candidateLevel = nextLevel;
    state.candidateSince = timestamp;
    state.lastChangeAt = timestamp;

    if (!Number.isFinite(currentZoom) || Math.round(currentZoom) === targetZoom) return;

    state.programmaticZoom = true;
    const center = map.getCenter?.();
    if (center) {
      map.setView(center, targetZoom, { animate: false });
    }
    setTimeout(() => { state.programmaticZoom = false; }, immediate ? 60 : 420);
  }

  /*
  FUNCTION: handleZoomEnd

  WHAT THE CODE DOES:
  When the truck is slow and the player manually changes zoom, this resets the
  speed level and treats that view as the new base zoom.

  WHY IT EXISTS:
  Manual map choices should be respected instead of immediately overwritten.
  */
  function handleZoomEnd() {
    if (state.programmaticZoom || currentSpeedKmh() > CONFIG.stoppedSpeedKmh) return;
    state.level = 0;
    state.candidateLevel = 0;
    captureBaseZoom();
  }

  /*
  FUNCTION: tick

  WHAT THE CODE DOES:
  Runs once per animation frame, but performs expensive housekeeping only once
  per second. It checks whether speed zoom is enabled, finds a possible level,
  waits for that level to remain stable, and then applies it.

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

    const enabled = arcade.state.settings.speedZoomEnabled && cameraLockEnabled();
    const speedKmh = currentSpeedKmh();

    if (!enabled) {
      if (state.level !== 0) applyLevel(0, timestamp, false);
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
    if (next !== state.level && stableLongEnough && intervalPassed) {
      applyLevel(next, timestamp, false);
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

    // A layer change creates a new tile layer, so apply the optimizations again.
    document.getElementById('layer-select')?.addEventListener('change', () => {
      syncBasemapBackground();
      setTimeout(optimizeTileLayer, 50);
      setTimeout(optimizeTileLayer, 300);
    });
    map.on?.('zoomend', handleZoomEnd);

    window.dispatchEvent(new CustomEvent('ptbo-stable-mobile-camera-ready', {
      detail: { version: VERSION, baseZoom: state.baseZoom },
    }));
    requestAnimationFrame(tick);
  }

  /*
  PUBLIC MODULE API:
  Other files can check version/state/config. resetZoom() is used by the mobile
  Recenter button to return to the close base view immediately.
  */
  window.PTBO_STABLE_MOBILE_CAMERA = Object.freeze({
    version: VERSION,
    state,
    config: CONFIG,
    resetZoom() {
      if (map && state.baseZoom !== null) applyLevel(0, performance.now(), true);
    },
  });

  install();
})();
