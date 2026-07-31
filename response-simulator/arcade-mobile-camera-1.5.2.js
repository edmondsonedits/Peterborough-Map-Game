(() => {
  'use strict';

  const VERSION = '1.5.2';
  if (window.PTBO_STABLE_MOBILE_CAMERA?.version === VERSION) return;

  const CONFIG = Object.freeze({
    enterSpeedsKmh: [72, 132, 192],
    exitSpeedsKmh: [50, 102, 158],
    changeDelayMs: 700,
    minimumChangeIntervalMs: 1250,
    stoppedSpeedKmh: 22,
    minimumZoom: 15,
    maximumZoom: 19,
  });

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

  let arcade = null;
  let instruments = null;
  let map = null;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function isMobileWrapper() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  function currentSpeedKmh() {
    return Math.max(0, Number(instruments?.state?.speedKmh) || 0);
  }

  function cameraLockEnabled() {
    const checkbox = document.getElementById('chk-camera');
    return !checkbox || checkbox.checked;
  }

  function maximumLevels() {
    const requested = Number(arcade?.state?.settings?.zoomOutLevels) || 0;
    return clamp(Math.round(requested), 0, CONFIG.enterSpeedsKmh.length);
  }

  function desiredLevel(speedKmh) {
    const maximum = maximumLevels();
    let next = clamp(state.level, 0, maximum);

    while (next < maximum && speedKmh >= CONFIG.enterSpeedsKmh[next]) next += 1;
    while (next > 0 && speedKmh <= CONFIG.exitSpeedsKmh[next - 1]) next -= 1;
    return next;
  }

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

  function syncBasemapBackground() {
    const value = document.getElementById('layer-select')?.value;
    document.documentElement.classList.toggle('ptbo-dark-basemap', value === 'dark');
  }

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
      // The base tile layer may still be starting.
    }
  }

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
      note.textContent = 'Mobile zoom now uses stable whole-number speed bands. It waits for speed to settle before changing levels, preventing repeated tile reloads and black flicker while accelerating.';
    }
  }

  function readMap() {
    try {
      map = mapInstance;
    } catch {
      map = null;
    }
    return map;
  }

  function captureBaseZoom() {
    const current = Number(map?.getZoom?.());
    if (!Number.isFinite(current)) return;
    state.baseZoom = clamp(Math.round(current) + state.level, CONFIG.minimumZoom, CONFIG.maximumZoom);
  }

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
      map.setView(center, targetZoom, {
        animate: false,
      });
    }
    setTimeout(() => { state.programmaticZoom = false; }, 420);
  }

  function handleZoomEnd() {
    if (state.programmaticZoom || currentSpeedKmh() > CONFIG.stoppedSpeedKmh) return;
    state.level = 0;
    state.candidateLevel = 0;
    captureBaseZoom();
  }

  function tick(timestamp) {
    if (!state.installed) return;

    // Permanently suppress the older fractional camera pass. The base simulator
    // continues following the truck; this module only changes zoom at rare,
    // stable whole-number thresholds.
    arcade.state.lastCameraUpdate = Number.POSITIVE_INFINITY;
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

    map.options.zoomSnap = 1;
    map.options.zoomDelta = 1;
    map.options.fadeAnimation = false;
    map.options.zoomAnimation = false;

    installStyle();
    syncBasemapBackground();
    optimizeTileLayer();
    updateOptionsText();
    captureBaseZoom();

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
