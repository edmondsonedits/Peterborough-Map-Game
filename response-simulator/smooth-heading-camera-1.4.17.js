(() => {
  'use strict';

  const VERSION = '1.4.17';
  if (window.PTBO_SMOOTH_HEADING_CAMERA_VERSION === VERSION && window.PTBO_SMOOTH_HEADING_CAMERA_READY) return;
  window.PTBO_SMOOTH_HEADING_CAMERA_VERSION = VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const wrap360 = angle => ((angle % 360) + 360) % 360;
  const shortestDelta = (from, to) => ((to - from + 540) % 360) - 180;
  const dampAngle = (current, target, dtSeconds, timeConstantSeconds) => {
    const alpha = 1 - Math.exp(-dtSeconds / Math.max(0.001, timeConstantSeconds));
    return wrap360(current + shortestDelta(current, target) * alpha);
  };

  async function waitFor(readValue, label, timeoutMilliseconds = 20000) {
    const startedAt = performance.now();
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) throw new Error(`${label} did not become ready in time.`);
      await sleep(40);
    }
  }

  function isCoarsePointer() {
    try {
      return matchMedia('(pointer:coarse)').matches || Boolean(parent?.document?.getElementById('steering'));
    } catch (_) {
      return matchMedia('(pointer:coarse)').matches;
    }
  }

  async function initialize() {
    await waitFor(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof vehicleMarker !== 'undefined' && vehicleMarker?._icon,
      'Simulator map and truck',
    );

    const state = {
      version: VERSION,
      mode: 'heading',
      following: true,
      visualHeading: wrap360(Number(currentHeading) || 0),
      cameraBearing: wrap360(Number(currentHeading) || 0),
      transitioning: false,
      frameCount: 0,
      positionSyncCount: 0,
      lastTimestamp: performance.now(),
      latestLatLng: L.latLng(simLat, simLng),
      screenOffsetPixels: 0,
      lastError: null,
    };

    try { headingUpMode = false; } catch (_) {}
    try { updateMapOrientation = () => {}; } catch (_) { window.updateMapOrientation = () => {}; }

    const cameraLock = document.getElementById('chk-camera');
    if (cameraLock) cameraLock.checked = false;

    const legacyControls = document.getElementById('map-orientation-controls');
    if (legacyControls) legacyControls.style.display = 'none';

    const mapPane = mapInstance.getPane('mapPane');
    if (!mapPane) throw new Error('Leaflet map pane is unavailable.');
    mapPane.style.rotate = '0deg';
    mapPane.style.willChange = 'transform, rotate';
    mapPane.style.backfaceVisibility = 'hidden';

    if (vehicleMarker._icon) {
      vehicleMarker._icon.style.opacity = '1';
      vehicleMarker._icon.style.willChange = 'transform';
    }

    const originalSetLatLng = vehicleMarker.setLatLng.bind(vehicleMarker);
    const originalSetRotationAngle = typeof vehicleMarker.setRotationAngle === 'function'
      ? vehicleMarker.setRotationAngle.bind(vehicleMarker)
      : null;

    if (originalSetRotationAngle) {
      vehicleMarker.setRotationAngle = function patchedSetRotationAngle() {
        return originalSetRotationAngle(state.visualHeading - 90);
      };
    }

    let style = document.getElementById('ptbo-smooth-camera-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-smooth-camera-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #ptbo-smooth-camera-panel{position:absolute;right:12px;bottom:92px;z-index:2400;display:flex;align-items:stretch;gap:7px;padding:7px;color:#f8fafc;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(8,13,24,.94);box-shadow:0 8px 24px rgba(0,0,0,.42);backdrop-filter:blur(12px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #ptbo-smooth-camera-copy{min-width:122px;padding:3px 5px;display:flex;flex-direction:column;justify-content:center;pointer-events:none}
      #ptbo-smooth-camera-copy strong{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#38bdf8}
      #ptbo-smooth-camera-copy span{margin-top:2px;font-size:9px;color:#cbd5e1;white-space:nowrap}
      #ptbo-smooth-camera-toggle,#ptbo-smooth-camera-recenter{min-height:40px;padding:0 11px;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:rgba(255,255,255,.08);font:800 11px/1 system-ui;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      #ptbo-smooth-camera-toggle.active{color:#07111f;border-color:transparent;background:#38bdf8}
      #ptbo-smooth-camera-recenter{display:none;color:#052014;border-color:transparent;background:#34d399}
      #ptbo-smooth-camera-recenter.visible{display:block}
      #ptbo-smooth-camera-toggle:active,#ptbo-smooth-camera-recenter:active{transform:scale(.97)}
      @media(max-width:900px),(pointer:coarse){#ptbo-smooth-camera-panel{right:10px;bottom:calc(184px + env(safe-area-inset-bottom));padding:6px;gap:5px}#ptbo-smooth-camera-copy{display:none}#ptbo-smooth-camera-toggle,#ptbo-smooth-camera-recenter{min-height:42px;padding:0 10px;font-size:10px}}
    `;

    let panel = document.getElementById('ptbo-smooth-camera-panel');
    if (panel) panel.remove();
    panel = document.createElement('div');
    panel.id = 'ptbo-smooth-camera-panel';
    panel.innerHTML = `
      <div id="ptbo-smooth-camera-copy"><strong>Camera Test v${VERSION}</strong><span id="ptbo-smooth-camera-detail">Real marker pivot lock</span></div>
      <button id="ptbo-smooth-camera-toggle" class="active" type="button" aria-pressed="true">Heading Up</button>
      <button id="ptbo-smooth-camera-recenter" type="button">Re-center</button>
    `;
    document.body.appendChild(panel);

    const toggleButton = document.getElementById('ptbo-smooth-camera-toggle');
    const recenterButton = document.getElementById('ptbo-smooth-camera-recenter');
    const detail = document.getElementById('ptbo-smooth-camera-detail');

    function updateUi() {
      const headingMode = state.mode === 'heading';
      toggleButton.textContent = headingMode ? 'Heading Up' : 'North Up';
      toggleButton.classList.toggle('active', headingMode);
      toggleButton.setAttribute('aria-pressed', String(headingMode));
      recenterButton.classList.toggle('visible', !state.following);
      if (detail) {
        detail.textContent = state.following
          ? (headingMode ? 'Real truck remains on its map coordinate' : 'North-facing map with real truck marker')
          : 'Free camera — re-center to follow';
      }
    }

    function markerPivot(latLng = state.latestLatLng) {
      if (vehicleMarker?._point && Number.isFinite(vehicleMarker._point.x) && Number.isFinite(vehicleMarker._point.y)) {
        return vehicleMarker._point;
      }
      return mapInstance.latLngToLayerPoint(latLng);
    }

    function updateRotationOrigin(latLng = state.latestLatLng) {
      const pivot = markerPivot(latLng);
      mapPane.style.transformOrigin = `${pivot.x}px ${pivot.y}px`;
      return pivot;
    }

    function measureScreenOffset() {
      const icon = vehicleMarker?._icon;
      const container = mapInstance.getContainer();
      if (!icon || !container) return 0;
      const iconRect = icon.getBoundingClientRect();
      const mapRect = container.getBoundingClientRect();
      const iconX = iconRect.left + iconRect.width / 2;
      const iconY = iconRect.top + iconRect.height / 2;
      const centreX = mapRect.left + mapRect.width / 2;
      const centreY = mapRect.top + mapRect.height / 2;
      return Math.hypot(iconX - centreX, iconY - centreY);
    }

    function applyOrientation() {
      if (!state.following) return;
      updateRotationOrigin();
      mapPane.style.rotate = `${-state.cameraBearing}deg`;
      if (originalSetRotationAngle) originalSetRotationAngle(state.visualHeading - 90);
      const compassNeedle = document.getElementById('compass-needle');
      if (compassNeedle) compassNeedle.style.transform = `rotate(${-state.cameraBearing}deg)`;
    }

    function syncCameraPosition(latLng) {
      state.latestLatLng = L.latLng(latLng);
      if (!state.following) return;
      if (cameraLock?.checked) cameraLock.checked = false;
      try { headingUpMode = false; } catch (_) {}

      mapInstance.setView(state.latestLatLng, mapInstance.getZoom(), { animate: false, reset: false });
      updateRotationOrigin(state.latestLatLng);
      applyOrientation();
      state.positionSyncCount += 1;
      requestAnimationFrame(() => { state.screenOffsetPixels = measureScreenOffset(); });
    }

    vehicleMarker.setLatLng = function patchedVehicleSetLatLng(latLng) {
      const result = originalSetLatLng(latLng);
      syncCameraPosition(latLng);
      return result;
    };

    function setMode(nextMode) {
      state.mode = nextMode === 'north' ? 'north' : 'heading';
      state.following = true;
      state.transitioning = true;
      if (cameraLock) cameraLock.checked = false;
      if (vehicleMarker._icon) vehicleMarker._icon.style.opacity = '1';
      updateUi();
      syncCameraPosition(state.latestLatLng);
      return state.mode;
    }

    function recenter() {
      state.following = true;
      state.transitioning = true;
      if (cameraLock) cameraLock.checked = false;
      state.latestLatLng = L.latLng(simLat, simLng);
      if (vehicleMarker._icon) vehicleMarker._icon.style.opacity = '1';
      syncCameraPosition(state.latestLatLng);
      updateUi();
    }

    toggleButton.addEventListener('click', () => setMode(state.mode === 'heading' ? 'north' : 'heading'));
    recenterButton.addEventListener('click', recenter);

    mapInstance.on('dragstart', () => {
      state.following = false;
      mapPane.style.rotate = '0deg';
      if (originalSetRotationAngle) originalSetRotationAngle(state.visualHeading - 90);
      updateUi();
    });

    window.mobileRecenter = recenter;

    function frame(timestamp) {
      try {
        const dtSeconds = clamp((timestamp - state.lastTimestamp) / 1000, 0, 0.08);
        state.lastTimestamp = timestamp;

        const rawHeading = wrap360(Number(currentHeading) || 0);
        const turnDifference = Math.abs(shortestDelta(state.visualHeading, rawHeading));
        const speedAmount = Math.min(1, Math.abs(Number(velocity) || 0) / 0.00002);
        const headingTimeConstant = 0.095 + speedAmount * 0.035 - Math.min(0.03, turnDifference / 2600);
        state.visualHeading = dampAngle(state.visualHeading, rawHeading, dtSeconds, headingTimeConstant);

        if (state.mode === 'heading') {
          if (state.transitioning) {
            state.cameraBearing = dampAngle(state.cameraBearing, state.visualHeading, dtSeconds, 0.16);
            if (Math.abs(shortestDelta(state.cameraBearing, state.visualHeading)) < 0.2) state.transitioning = false;
          } else {
            state.cameraBearing = state.visualHeading;
          }
        } else {
          state.cameraBearing = dampAngle(state.cameraBearing, 0, dtSeconds, 0.16);
          if (Math.abs(shortestDelta(state.cameraBearing, 0)) < 0.2) {
            state.cameraBearing = 0;
            state.transitioning = false;
          }
        }

        applyOrientation();
        state.frameCount += 1;
        if (state.frameCount % 10 === 0) state.screenOffsetPixels = measureScreenOffset();

        window.PTBO_SMOOTH_HEADING_CAMERA_STATE = {
          version: VERSION,
          mode: state.mode,
          following: state.following,
          frameCount: state.frameCount,
          positionSyncCount: state.positionSyncCount,
          rawHeading,
          visualHeading: state.visualHeading,
          cameraBearing: state.cameraBearing,
          screenTruckHeading: wrap360(state.visualHeading - state.cameraBearing),
          screenOffsetPixels: state.screenOffsetPixels,
          centre: { lat: state.latestLatLng.lat, lng: state.latestLatLng.lng },
        };
      } catch (error) {
        state.lastError = error;
        console.error('Smooth heading camera frame failed.', error);
      }
      requestAnimationFrame(frame);
    }

    updateUi();
    recenter();
    requestAnimationFrame(frame);

    const api = Object.freeze({
      version: VERSION,
      state,
      setMode,
      recenter,
      syncCameraPosition,
      getSnapshot: () => ({ ...window.PTBO_SMOOTH_HEADING_CAMERA_STATE }),
      isMobile: isCoarsePointer(),
    });
    window.PTBO_SMOOTH_HEADING_CAMERA = api;
    window.dispatchEvent(new CustomEvent('ptbo-smooth-heading-camera-ready', { detail: { version: VERSION } }));
    return api;
  }

  const ready = initialize();
  window.PTBO_SMOOTH_HEADING_CAMERA_READY = ready;
  ready.catch(error => {
    console.error('Smooth heading camera failed to initialize.', error);
    window.dispatchEvent(new CustomEvent('ptbo-smooth-heading-camera-error', { detail: { version: VERSION, error } }));
  });
})();
