(() => {
  'use strict';

  if (window.PTBO_SMOOTH_CAMERA) return;

  const CONFIG = Object.freeze({
    maximumFrameGapMs: 50,
    rebaseDistancePx: 180,
  });

  const state = {
    installed: false,
    cameraLayer: null,
    nativeSetView: null,
    rebasing: false,
    renderQueued: false,
    markerPatched: false,
  };

  function drivingCameraOwnsMap() {
    return document.documentElement.dataset.ptboDrivingCameraOwnsMap === 'true';
  }

  function globalsReady() {
    try {
      return Boolean(mapInstance && vehicleMarker && typeof simulationLoop === 'function');
    } catch {
      return false;
    }
  }

  function cameraShouldFollow() {
    try {
      return Boolean(document.getElementById('chk-camera')?.checked);
    } catch {
      return false;
    }
  }

  function removeOrientationFeature() {
    document.getElementById('map-orientation-controls')?.remove();
    if (!document.getElementById('ptbo-disable-map-orientation')) {
      const style = document.createElement('style');
      style.id = 'ptbo-disable-map-orientation';
      style.textContent = '#map-orientation-controls,#orientation-toggle,#compass{display:none!important}';
      document.head.appendChild(style);
    }
    try {
      headingUpMode = false;
      toggleHeadingUp = function disabledHeadingUp() {};
      window.toggleHeadingUp = toggleHeadingUp;
    } catch {
      // Legacy orientation globals may not be available yet.
    }
  }

  function ensureCameraLayer() {
    if (drivingCameraOwnsMap()) return null;
    if (!globalsReady()) return null;
    const mapPane = mapInstance.getPane('mapPane');
    if (!mapPane) return null;

    if (state.cameraLayer?.isConnected && state.cameraLayer.contains(mapPane)) {
      return state.cameraLayer;
    }

    let layer = document.getElementById('ptbo-smooth-camera-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'ptbo-smooth-camera-layer';
      layer.style.cssText = [
        'position:absolute',
        'inset:0',
        'z-index:200',
        'transform-origin:0 0',
        'will-change:transform',
        'backface-visibility:hidden',
        'overflow:visible',
      ].join(';');
      mapPane.parentNode.insertBefore(layer, mapPane);
    }
    if (mapPane.parentNode !== layer) layer.appendChild(mapPane);

    // Leaflet owns the inner map pane. The outer camera layer only translates,
    // keeping north permanently at the top of the screen.
    mapPane.style.rotate = '';
    mapPane.style.translate = '';
    mapPane.style.transformOrigin = '';
    state.cameraLayer = layer;
    return layer;
  }

  function rawTruckContainerPoint() {
    const exactLayerPoint = mapInstance.project([simLat, simLng], mapInstance.getZoom())
      .subtract(mapInstance.getPixelOrigin());
    return mapInstance.layerPointToContainerPoint(exactLayerPoint);
  }

  function applyCameraTranslation() {
    const layer = ensureCameraLayer();
    if (!layer || !mapInstance) return;

    if (!cameraShouldFollow()) {
      layer.style.transform = 'matrix(1,0,0,1,0,0)';
      return;
    }

    const size = mapInstance.getSize();
    if (!size.x || !size.y) return;
    const center = size.divideBy(2);
    const truck = rawTruckContainerPoint();
    const translateX = center.x - truck.x;
    const translateY = center.y - truck.y;
    layer.style.transform = `matrix(1,0,0,1,${translateX},${translateY})`;
  }

  function rebaseMapToTruck() {
    if (!globalsReady() || state.rebasing || !cameraShouldFollow() || !state.nativeSetView) return;
    state.rebasing = true;
    try {
      state.nativeSetView.call(mapInstance, [simLat, simLng], mapInstance.getZoom(), { animate: false });
      applyCameraTranslation();
    } finally {
      state.rebasing = false;
    }
  }

  function renderCamera(allowRebase = true) {
    if (drivingCameraOwnsMap()) return;
    if (!globalsReady()) return;
    if (allowRebase && cameraShouldFollow() && !state.rebasing) {
      const size = mapInstance.getSize();
      const center = size.divideBy(2);
      const truck = rawTruckContainerPoint();
      if (Math.hypot(truck.x - center.x, truck.y - center.y) > CONFIG.rebaseDistancePx) {
        rebaseMapToTruck();
        return;
      }
    }
    applyCameraTranslation();
  }

  function scheduleCameraRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(() => {
      state.renderQueued = false;
      renderCamera(true);
    });
  }

  function patchSetView() {
    if (!mapInstance || state.nativeSetView) return;
    state.nativeSetView = mapInstance.setView;
    mapInstance.setView = function northUpCameraSetView(center, zoom, options) {
      let requestedZoom = zoom;
      if (requestedZoom === undefined || requestedZoom === null) requestedZoom = this.getZoom();
      let targetsTruck = false;
      try {
        targetsTruck = this.distance(center, [simLat, simLng]) < 1;
      } catch {
        targetsTruck = false;
      }

      // Absorb legacy per-frame recenter calls. They caused camera judder and
      // are unnecessary because the lightweight outer layer follows the truck.
      if (!state.rebasing && cameraShouldFollow() && targetsTruck && requestedZoom === this.getZoom()) {
        renderCamera(true);
        return this;
      }

      const result = state.nativeSetView.call(this, center, zoom, options);
      scheduleCameraRender();
      return result;
    };
  }

  function patchMarkerPositioning() {
    if (!vehicleMarker || state.markerPatched) return;
    const originalSetLatLng = vehicleMarker.setLatLng;
    vehicleMarker.setLatLng = function preciseMarkerSetLatLng(latLng) {
      const result = originalSetLatLng.call(this, latLng);
      try {
        const exactLatLng = L.latLng(latLng);
        const exactLayerPoint = mapInstance.project(exactLatLng, mapInstance.getZoom())
          .subtract(mapInstance.getPixelOrigin());
        if (typeof this._setPos === 'function') this._setPos(exactLayerPoint);
      } catch {
        // Fall back to Leaflet's standard marker placement.
      }
      scheduleCameraRender();
      return result;
    };
    state.markerPatched = true;
  }

  function smoothSimulationLoop(timestamp) {
    if (!lastTimestamp) lastTimestamp = timestamp;
    const elapsedMs = Math.min(CONFIG.maximumFrameGapMs, Math.max(0, timestamp - lastTimestamp));
    const deltaSeconds = elapsedMs / 1000;
    const frameScale = deltaSeconds * 60;
    lastTimestamp = timestamp;

    const speedSetting = parseInt(document.getElementById('sld-speed').value, 10);
    const maxSpeed = 0.0000015 * speedSetting;
    const acceleration = 0.00000005 * speedSetting;
    const frictionPerSixtyHertzFrame = 0.96;
    const baseTurnRate = 1.2;

    if (keys.ArrowUp || keys.w) velocity += acceleration * frameScale;
    if (keys.ArrowDown || keys.s) velocity -= acceleration * 1.5 * frameScale;

    velocity *= Math.pow(frictionPerSixtyHertzFrame, frameScale);
    if (Math.abs(velocity) < 0.00000001) velocity = 0;

    let activeTurnRate = 0;
    let isTurning = false;
    if (velocity !== 0) {
      const driveDirection = velocity > 0 ? 1 : -1;
      const velocityFactor = Math.min(Math.abs(velocity) / (maxSpeed * 0.2), 1);
      const lowSpeedMultiplier = 0.85 + velocityFactor * 0.15;
      activeTurnRate = baseTurnRate * lowSpeedMultiplier * driveDirection;
    } else {
      activeTurnRate = baseTurnRate;
    }

    if (keys.ArrowLeft || keys.a) {
      currentHeading -= activeTurnRate * frameScale;
      isTurning = true;
    }
    if (keys.ArrowRight || keys.d) {
      currentHeading += activeTurnRate * frameScale;
      isTurning = true;
    }
    currentHeading = (currentHeading + 360) % 360;

    const headingRadians = currentHeading * Math.PI / 180;
    const longitudeCorrection = Math.cos(simLat * Math.PI / 180);
    simLat += Math.cos(headingRadians) * velocity * frameScale;
    simLng += Math.sin(headingRadians) * velocity * frameScale / longitudeCorrection;

    if (vehicleMarker) {
      vehicleMarker.setRotationOrigin('center center');
      vehicleMarker.setRotationAngle(currentHeading - 90);
    }

    if ((velocity !== 0 || isTurning) && vehicleMarker) {
      vehicleMarker.setLatLng([simLat, simLng]);
      if (simulationState === STATES.ENROUTE && velocity !== 0) evaluateDistanceToTarget();

      document.getElementById('tel-lat').innerText = simLat.toFixed(6);
      document.getElementById('tel-lng').innerText = simLng.toFixed(6);
      document.getElementById('tel-hdg').innerText = `${Math.round(currentHeading)}°`;
      renderCamera(true);
    }

    requestAnimationFrame(simulationLoop);
  }
  smoothSimulationLoop.__ptboSmoothCameraLoop = true;

  function installPhysicsLoop() {
    try {
      const roadState = window.PTBO_ROAD_COLLISION?.state;
      if (roadState?.originalLoop) {
        roadState.originalLoop = smoothSimulationLoop;
        return;
      }
      if (simulationLoop !== smoothSimulationLoop) {
        simulationLoop = smoothSimulationLoop;
        window.simulationLoop = simulationLoop;
      }
    } catch {
      // Globals are still being initialized; the installer retries below.
    }
  }

  function patchLegacyOrientationFunctions() {
    updateMapOrientation = function northUpMapOrientation() {
      try {
        headingUpMode = false;
      } catch {
        // Legacy state may not exist yet.
      }
      const mapPane = mapInstance?.getPane?.('mapPane');
      if (mapPane) {
        mapPane.style.rotate = '';
        mapPane.style.transformOrigin = '';
      }
      renderCamera(true);
    };
    window.updateMapOrientation = updateMapOrientation;
    removeOrientationFeature();
  }

  function cameraTick() {
    removeOrientationFeature();
    installPhysicsLoop();
    patchMarkerPositioning();
    renderCamera(true);
    requestAnimationFrame(cameraTick);
  }

  function install() {
    removeOrientationFeature();
    if (!globalsReady()) {
      requestAnimationFrame(install);
      return;
    }

    ensureCameraLayer();
    patchSetView();
    patchMarkerPositioning();
    patchLegacyOrientationFunctions();
    installPhysicsLoop();

    mapInstance.on('move zoom resize', scheduleCameraRender);
    document.getElementById('chk-camera')?.addEventListener('change', () => {
      if (cameraShouldFollow()) rebaseMapToTruck();
      renderCamera(false);
    });
    window.addEventListener('ptbo-road-collision-ready', () => {
      installPhysicsLoop();
      rebaseMapToTruck();
    });

    state.installed = true;
    rebaseMapToTruck();
    requestAnimationFrame(cameraTick);
  }

  window.PTBO_SMOOTH_CAMERA = Object.freeze({
    state,
    render: renderCamera,
    recenter: rebaseMapToTruck,
  });

  install();
})();
