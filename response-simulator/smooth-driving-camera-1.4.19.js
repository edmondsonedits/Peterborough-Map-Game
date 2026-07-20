(() => {
  'use strict';

  const VERSION = '1.4.19';
  const MODE = Object.freeze({ FIXED: 'fixed', DRIVING: 'driving' });
  const MODE_LABEL = Object.freeze({ [MODE.FIXED]: 'Fixed Map', [MODE.DRIVING]: 'Driving View' });
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const wrap360 = angle => ((angle % 360) + 360) % 360;
  const shortestDelta = (from, to) => ((to - from + 540) % 360) - 180;
  const dampAngle = (current, target, dtSeconds, timeConstantSeconds) => {
    const alpha = 1 - Math.exp(-dtSeconds / Math.max(0.001, timeConstantSeconds));
    return wrap360(current + shortestDelta(current, target) * alpha);
  };

  if (window.PTBO_DRIVING_CAMERA_VERSION === VERSION && window.PTBO_DRIVING_CAMERA_READY) return;
  window.PTBO_DRIVING_CAMERA_VERSION = VERSION;

  async function waitFor(readValue, label, timeoutMilliseconds = 30000) {
    const startedAt = performance.now();
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) throw new Error(`${label} did not become ready in time.`);
      await sleep(40);
    }
  }

  function isMobileWrapper() {
    try {
      return matchMedia('(pointer:coarse)').matches || Boolean(parent?.document?.getElementById('steering'));
    } catch (_) {
      return matchMedia('(pointer:coarse)').matches;
    }
  }

  function isAutomationRun() {
    try {
      return new URL(parent.parent.location.href).searchParams.get('automation') === '1';
    } catch (_) {
      return false;
    }
  }

  async function initialize() {
    await waitFor(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof vehicleMarker !== 'undefined' && vehicleMarker?._icon,
      'Simulator map and truck',
    );

    const mapContainer = mapInstance.getContainer();
    const mapPane = mapInstance.getPane('mapPane');
    if (!mapContainer || !mapPane) throw new Error('Leaflet map structure is unavailable.');

    const errors = [];
    const state = {
      version: VERSION,
      mode: MODE.DRIVING,
      following: true,
      transitioning: false,
      rawHeading: wrap360(Number(currentHeading) || 0),
      visualHeading: wrap360(Number(currentHeading) || 0),
      mapBearing: wrap360(Number(currentHeading) || 0),
      latestLatLng: L.latLng(vehicleMarker.getLatLng()),
      frameCount: 0,
      positionSyncCount: 0,
      lastTimestamp: performance.now(),
      maxNormalPositionError: 0,
      maxLongFramePositionError: 0,
      maxRoadScreenError: 0,
      longFrameCount: 0,
      previousRawHeading: wrap360(Number(currentHeading) || 0),
      previousVisualHeading: wrap360(Number(currentHeading) || 0),
      previousMapBearing: wrap360(Number(currentHeading) || 0),
      maximumVisualHeadingStep: 0,
      maximumMapBearingStep: 0,
      headingWrapCrossings: 0,
    };

    const recordError = (kind, value) => {
      const message = value?.message || value?.reason?.message || value?.reason || String(value || kind);
      errors.push({ kind, message: String(message), frame: state.frameCount });
    };
    addEventListener('error', event => recordError(event.target === window ? 'error' : 'resource', event.error || event.message || event.target?.src || event.target?.href));
    addEventListener('unhandledrejection', event => recordError('unhandledrejection', event));

    try { headingUpMode = false; } catch (_) {}
    try { updateMapOrientation = () => {}; } catch (_) { window.updateMapOrientation = () => {}; }
    const cameraLock = document.getElementById('chk-camera');
    if (cameraLock) cameraLock.checked = false;
    const legacyControls = document.getElementById('map-orientation-controls');
    if (legacyControls) legacyControls.style.display = 'none';
    mapPane.style.rotate = '';
    mapPane.style.transformOrigin = '';
    mapPane.style.willChange = 'transform';

    const obsoleteRotator = document.getElementById('ptbo-camera-rotator');
    if (obsoleteRotator) {
      if (obsoleteRotator.contains(mapPane)) obsoleteRotator.parentNode?.insertBefore(mapPane, obsoleteRotator);
      obsoleteRotator.remove();
    }
    document.getElementById('ptbo-fixed-truck')?.remove();

    let world = document.getElementById('ptbo-camera-world');
    if (world) {
      while (world.firstChild) mapPane.insertBefore(world.firstChild, world);
      world.remove();
    }
    world = document.createElement('div');
    world.id = 'ptbo-camera-world';
    world.setAttribute('aria-hidden', 'true');
    mapPane.appendChild(world);

    const moveGeographicPanesIntoWorld = nodes => {
      for (const node of nodes) {
        if (node instanceof HTMLElement && node !== world && node.classList.contains('leaflet-pane')) world.appendChild(node);
      }
    };
    moveGeographicPanesIntoWorld([...mapPane.children]);
    const paneObserver = new MutationObserver(records => {
      for (const record of records) moveGeographicPanesIntoWorld([...record.addedNodes]);
    });
    paneObserver.observe(mapPane, { childList: true });

    const originalCreatePane = mapInstance.createPane.bind(mapInstance);
    mapInstance.createPane = function cameraAwareCreatePane(name, container) {
      const pane = originalCreatePane(name, container);
      if ((!container || container === mapPane) && pane.parentNode !== world) world.appendChild(pane);
      return pane;
    };

    const originalSetLatLng = vehicleMarker.setLatLng.bind(vehicleMarker);
    const originalSetRotationAngle = typeof vehicleMarker.setRotationAngle === 'function'
      ? vehicleMarker.setRotationAngle.bind(vehicleMarker)
      : null;
    if (originalSetRotationAngle) {
      vehicleMarker.setRotationAngle = function cameraAwareMarkerRotation() {
        return originalSetRotationAngle(state.visualHeading - 90);
      };
    }

    let style = document.getElementById('ptbo-driving-camera-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-driving-camera-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #ptbo-camera-world{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;transform-origin:0 0;will-change:transform;backface-visibility:hidden}
      #ptbo-camera-panel{position:absolute;right:12px;bottom:92px;z-index:2400;display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:7px;color:#f8fafc;border:1px solid rgba(255,255,255,.2);border-radius:14px;background:rgba(8,13,24,.94);box-shadow:0 8px 24px rgba(0,0,0,.42);backdrop-filter:blur(12px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #ptbo-camera-panel-title{grid-column:1/-1;padding:2px 4px 0;color:#38bdf8;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;text-align:center;pointer-events:none}
      .ptbo-camera-mode{min-height:40px;padding:0 10px;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:10px;background:rgba(255,255,255,.08);font:800 11px/1 system-ui;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
      .ptbo-camera-mode.active{color:#07111f;border-color:transparent;background:#38bdf8}.ptbo-camera-mode:active{transform:scale(.97)}
      #ptbo-camera-recenter{grid-column:1/-1;display:none;min-height:36px;color:#052014;border:0;border-radius:9px;background:#34d399;font:850 10px/1 system-ui;cursor:pointer}#ptbo-camera-recenter.visible{display:block}
      #ptbo-camera-route-test{grid-column:1/-1;min-height:34px;color:#fff;border:1px solid #a78bfa;border-radius:9px;background:#5b21b6;font:850 9px/1 system-ui;cursor:pointer}
      #ptbo-camera-telemetry{display:none}
      @media(max-width:900px),(pointer:coarse){#ptbo-camera-panel{right:10px;bottom:calc(184px + env(safe-area-inset-bottom));padding:6px;gap:5px}#ptbo-camera-panel-title{display:none}.ptbo-camera-mode{min-height:42px;padding:0 9px;font-size:10px}}
    `;

    document.getElementById('ptbo-smooth-camera-panel')?.remove();
    document.getElementById('ptbo-camera-panel')?.remove();
    const panel = document.createElement('section');
    panel.id = 'ptbo-camera-panel';
    panel.setAttribute('aria-label', `Camera Test v${VERSION}`);
    panel.innerHTML = `
      <div id="ptbo-camera-panel-title">Camera Test v${VERSION}</div>
      <button id="ptbo-camera-fixed" class="ptbo-camera-mode" type="button" aria-pressed="false">Fixed Map</button>
      <button id="ptbo-camera-driving" class="ptbo-camera-mode active" type="button" aria-pressed="true">Driving View</button>
      <button id="ptbo-camera-recenter" type="button">Re-centre</button>
      <output id="ptbo-camera-telemetry" aria-label="Camera test telemetry"></output>
    `;
    if (isAutomationRun()) {
      const routeTestButton = document.createElement('button');
      routeTestButton.id = 'ptbo-camera-route-test';
      routeTestButton.type = 'button';
      routeTestButton.textContent = 'Set up route review test';
      routeTestButton.addEventListener('click', () => {
        if (!activeIncident) return;
        simLat = activeIncident.lat;
        simLng = activeIncident.lng;
        vehicleMarker.setLatLng([simLat, simLng]);
        evaluateDistanceToTarget();
      });
      panel.insertBefore(routeTestButton, panel.querySelector('#ptbo-camera-telemetry'));
    }
    document.body.appendChild(panel);
    const fixedButton = document.getElementById('ptbo-camera-fixed');
    const drivingButton = document.getElementById('ptbo-camera-driving');
    const recenterButton = document.getElementById('ptbo-camera-recenter');
    const telemetryOutput = document.getElementById('ptbo-camera-telemetry');

    function updateUi() {
      const fixed = state.mode === MODE.FIXED;
      fixedButton.classList.toggle('active', fixed);
      drivingButton.classList.toggle('active', !fixed);
      fixedButton.setAttribute('aria-pressed', String(fixed));
      drivingButton.setAttribute('aria-pressed', String(!fixed));
      recenterButton.classList.toggle('visible', !state.following);
    }

    function cameraTransform(point, bearing) {
      const angle = -bearing * Math.PI / 180;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const e = point.x - cosine * point.x + sine * point.y;
      const f = point.y - sine * point.x - cosine * point.y;
      return `matrix(${cosine},${sine},${-sine},${cosine},${e},${f})`;
    }

    function applyCameraTransform() {
      const pivot = mapInstance.latLngToLayerPoint(state.latestLatLng);
      world.style.transform = cameraTransform(pivot, state.mapBearing);
      if (originalSetRotationAngle) originalSetRotationAngle(state.visualHeading - 90);
      const compassNeedle = document.getElementById('compass-needle');
      if (compassNeedle) compassNeedle.style.transform = `rotate(${-state.mapBearing}deg)`;
    }

    function centerOnTruck() {
      if (!state.following) return;
      if (cameraLock?.checked) cameraLock.checked = false;
      try { headingUpMode = false; } catch (_) {}
      mapInstance.setView(state.latestLatLng, mapInstance.getZoom(), { animate: false, reset: false });
      applyCameraTransform();
      state.positionSyncCount += 1;
    }

    vehicleMarker.setLatLng = function cameraAwareSetLatLng(latLng) {
      const result = originalSetLatLng(latLng);
      state.latestLatLng = L.latLng(vehicleMarker.getLatLng());
      centerOnTruck();
      return result;
    };

    function setMode(nextMode) {
      state.mode = nextMode === MODE.FIXED || nextMode === 'Fixed Map' ? MODE.FIXED : MODE.DRIVING;
      state.following = true;
      state.transitioning = true;
      centerOnTruck();
      updateUi();
      return MODE_LABEL[state.mode];
    }

    function recenter() {
      state.following = true;
      state.latestLatLng = L.latLng(vehicleMarker.getLatLng());
      centerOnTruck();
      updateUi();
    }

    fixedButton.addEventListener('click', () => setMode(MODE.FIXED));
    drivingButton.addEventListener('click', () => setMode(MODE.DRIVING));
    recenterButton.addEventListener('click', recenter);
    mapInstance.on('dragstart', () => { state.following = false; updateUi(); });
    mapInstance.on('zoomend resize', () => state.following ? centerOnTruck() : applyCameraTransform());
    window.mobileRecenter = recenter;

    function rotatedScreenPoint(layerPoint, pivot, panePosition, bearing) {
      const angle = -bearing * Math.PI / 180;
      const dx = layerPoint.x - pivot.x;
      const dy = layerPoint.y - pivot.y;
      return {
        x: panePosition.x + pivot.x + Math.cos(angle) * dx - Math.sin(angle) * dy,
        y: panePosition.y + pivot.y + Math.sin(angle) * dx + Math.cos(angle) * dy,
      };
    }

    function readTelemetry(frameDuration) {
      const iconRect = vehicleMarker?._icon?.getBoundingClientRect();
      const mapRect = mapContainer.getBoundingClientRect();
      const screenX = iconRect ? iconRect.left + iconRect.width / 2 - mapRect.left : NaN;
      const screenY = iconRect ? iconRect.top + iconRect.height / 2 - mapRect.top : NaN;
      const expectedAnchor = mapInstance.latLngToContainerPoint(state.latestLatLng);
      const expectedX = expectedAnchor.x;
      const expectedY = expectedAnchor.y;
      const screenPositionError = Math.hypot(screenX - expectedX, screenY - expectedY);
      const panePosition = mapInstance._getMapPanePos();
      const truckLayerPoint = mapInstance.latLngToLayerPoint(state.latestLatLng);
      let road = null;
      let roadScreenError = null;
      try {
        road = window.PTBO_ROAD_COLLISION?.nearestRoad?.(state.latestLatLng.lat, state.latestLatLng.lng, 60) || null;
        if (road) {
          const roadLayerPoint = mapInstance.latLngToLayerPoint([road.lat, road.lng]);
          const roadScreenPoint = rotatedScreenPoint(roadLayerPoint, truckLayerPoint, panePosition, state.mapBearing);
          const truckScreenPoint = rotatedScreenPoint(truckLayerPoint, truckLayerPoint, panePosition, state.mapBearing);
          roadScreenError = Math.hypot(roadScreenPoint.x - truckScreenPoint.x, roadScreenPoint.y - truckScreenPoint.y);
          state.maxRoadScreenError = Math.max(state.maxRoadScreenError, roadScreenError);
        }
      } catch (error) { recordError('telemetry', error); }
      if (frameDuration > 40) {
        state.longFrameCount += 1;
        state.maxLongFramePositionError = Math.max(state.maxLongFramePositionError, screenPositionError);
      } else {
        state.maxNormalPositionError = Math.max(state.maxNormalPositionError, screenPositionError);
      }

      const telemetry = {
        version: VERSION,
        cameraMode: MODE_LABEL[state.mode],
        truckLatitude: state.latestLatLng.lat,
        truckLongitude: state.latestLatLng.lng,
        rawVehicleHeading: state.rawHeading,
        smoothedVisualHeading: state.visualHeading,
        mapBearing: state.mapBearing,
        truckScreenCentreX: screenX,
        truckScreenCentreY: screenY,
        expectedAnchorX: expectedX,
        expectedAnchorY: expectedY,
        screenPositionErrorPixels: screenPositionError,
        nearestRoad: road ? { latitude: road.lat, longitude: road.lng, distanceMetres: road.distance, name: road.road } : null,
        roadScreenErrorPixels: roadScreenError,
        frameCount: state.frameCount,
        frameDurationMilliseconds: frameDuration,
        longFrameCount: state.longFrameCount,
        maximumNormalPositionErrorPixels: state.maxNormalPositionError,
        maximumLongFramePositionErrorPixels: state.maxLongFramePositionError,
        maximumRoadScreenErrorPixels: state.maxRoadScreenError,
        maximumVisualHeadingStepDegrees: state.maximumVisualHeadingStep,
        maximumMapBearingStepDegrees: state.maximumMapBearingStep,
        headingWrapCrossings: state.headingWrapCrossings,
        angleInterpolationSelfTest: {
          forwardWrapDelta: shortestDelta(359, 1),
          reverseWrapDelta: shortestDelta(1, 359),
          halfTurnMagnitude: Math.abs(shortestDelta(0, 180)),
          passed: shortestDelta(359, 1) === 2 && shortestDelta(1, 359) === -2 && Math.abs(shortestDelta(0, 180)) === 180,
        },
        positionSyncCount: state.positionSyncCount,
        following: state.following,
        transitioning: state.transitioning,
        devicePixelRatio,
        mapPaneTranslation: { x: panePosition.x, y: panePosition.y },
        truckLayerPoint: { x: truckLayerPoint.x, y: truckLayerPoint.y },
        javascriptErrors: errors.slice(),
      };
      window.PTBO_CAMERA_TEST_TELEMETRY = telemetry;
      telemetryOutput.value = JSON.stringify(telemetry);
      telemetryOutput.textContent = telemetryOutput.value;
      telemetryOutput.dataset.cameraMode = telemetry.cameraMode;
      telemetryOutput.dataset.latitude = String(telemetry.truckLatitude);
      telemetryOutput.dataset.longitude = String(telemetry.truckLongitude);
      telemetryOutput.dataset.positionError = String(telemetry.screenPositionErrorPixels);
      telemetryOutput.dataset.roadError = String(telemetry.roadScreenErrorPixels ?? '');
      telemetryOutput.dataset.frameCount = String(telemetry.frameCount);
      telemetryOutput.dataset.javascriptErrors = String(telemetry.javascriptErrors.length);
      return telemetry;
    }

    async function runModeSwitchTest(count = 20) {
      const start = L.latLng(vehicleMarker.getLatLng());
      let maximumLatitudeDifference = 0;
      let maximumLongitudeDifference = 0;
      for (let index = 0; index < count; index += 1) {
        setMode(index % 2 ? MODE.DRIVING : MODE.FIXED);
        await new Promise(resolve => requestAnimationFrame(resolve));
        const position = vehicleMarker.getLatLng();
        maximumLatitudeDifference = Math.max(maximumLatitudeDifference, Math.abs(position.lat - start.lat));
        maximumLongitudeDifference = Math.max(maximumLongitudeDifference, Math.abs(position.lng - start.lng));
      }
      const end = vehicleMarker.getLatLng();
      return {
        switches: count,
        start: { latitude: start.lat, longitude: start.lng },
        end: { latitude: end.lat, longitude: end.lng },
        maximumLatitudeDifference,
        maximumLongitudeDifference,
        passed: maximumLatitudeDifference < 1e-8 && maximumLongitudeDifference < 1e-8,
      };
    }

    function setTestHeading(value) {
      currentHeading = wrap360(Number(value) || 0);
      return currentHeading;
    }

    function frame(timestamp) {
      try {
        const frameDuration = clamp(timestamp - state.lastTimestamp, 0, 1000);
        const dtSeconds = Math.min(frameDuration / 1000, 0.08);
        state.lastTimestamp = timestamp;
        state.rawHeading = wrap360(Number(currentHeading) || 0);
        if ((state.previousRawHeading > 350 && state.rawHeading < 10) || (state.previousRawHeading < 10 && state.rawHeading > 350)) {
          state.headingWrapCrossings += 1;
        }
        state.previousRawHeading = state.rawHeading;
        const turnDifference = Math.abs(shortestDelta(state.visualHeading, state.rawHeading));
        const speedAmount = Math.min(1, Math.abs(Number(velocity) || 0) / 0.00002);
        const headingTimeConstant = 0.09 + speedAmount * 0.035 - Math.min(0.025, turnDifference / 2800);
        state.visualHeading = dampAngle(state.visualHeading, state.rawHeading, dtSeconds, headingTimeConstant);
        const targetBearing = state.mode === MODE.DRIVING ? state.visualHeading : 0;
        if (state.transitioning) {
          state.mapBearing = dampAngle(state.mapBearing, targetBearing, dtSeconds, 0.14);
          if (Math.abs(shortestDelta(state.mapBearing, targetBearing)) < 0.03) {
            state.mapBearing = targetBearing;
            state.transitioning = false;
          }
        } else state.mapBearing = targetBearing;
        state.maximumVisualHeadingStep = Math.max(
          state.maximumVisualHeadingStep,
          Math.abs(shortestDelta(state.previousVisualHeading, state.visualHeading)),
        );
        state.maximumMapBearingStep = Math.max(
          state.maximumMapBearingStep,
          Math.abs(shortestDelta(state.previousMapBearing, state.mapBearing)),
        );
        state.previousVisualHeading = state.visualHeading;
        state.previousMapBearing = state.mapBearing;
        if (state.following) centerOnTruck();
        else applyCameraTransform();
        state.frameCount += 1;
        readTelemetry(frameDuration);
      } catch (error) { recordError('camera-frame', error); }
      requestAnimationFrame(frame);
    }

    updateUi();
    centerOnTruck();
    requestAnimationFrame(frame);
    const api = Object.freeze({
      version: VERSION,
      modes: MODE,
      setMode,
      recenter,
      getTelemetry: () => ({ ...window.PTBO_CAMERA_TEST_TELEMETRY, javascriptErrors: errors.slice() }),
      runModeSwitchTest,
      setTestHeading,
      isMobile: isMobileWrapper(),
    });
    window.PTBO_DRIVING_CAMERA = api;
    window.dispatchEvent(new CustomEvent('ptbo-driving-camera-ready', { detail: { version: VERSION } }));
    return api;
  }

  const ready = initialize();
  window.PTBO_DRIVING_CAMERA_READY = ready;
  ready.catch(error => {
    console.error('Driving camera failed to initialize.', error);
    window.dispatchEvent(new CustomEvent('ptbo-driving-camera-error', { detail: { version: VERSION, error } }));
  });
})();
