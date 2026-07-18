(() => {
  'use strict';

  if (window.PTBO_SMOOTH_CAMERA) return;

  const CONFIG = Object.freeze({
    maximumFrameGapMs: 50,
    rebaseDistancePx: 180,
    headingResponsePerSecond: 22,
  });

  const state = {
    installed: false,
    cameraLayer: null,
    nativeSetView: null,
    rebasing: false,
    renderQueued: false,
    visualHeading: 180,
    lastCameraTimestamp: 0,
    markerPatched: false,
  };

  function shortestAngleDelta(fromDegrees, toDegrees) {
    return ((toDegrees - fromDegrees + 540) % 360) - 180;
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
      return Boolean(headingUpMode || document.getElementById('chk-camera')?.checked);
    } catch {
      return false;
    }
  }

  function ensureCameraLayer() {
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

    // Leaflet still owns mapPane.style.transform. Camera motion belongs only
    // to the outer layer so the two transform systems never overwrite each other.
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

  function applyCameraMatrix() {
    const layer = ensureCameraLayer();
    if (!layer || !mapInstance) return;

    if (!cameraShouldFollow()) {
      layer.style.transform = 'matrix(1,0,0,1,0,0)';
      const needle = document.getElementById('compass-needle');
      if (needle) needle.style.transform = 'rotate(0deg)';
      return;
    }

    const size = mapInstance.getSize();
    if (!size.x || !size.y) return;
    const center = size.divideBy(2);
    const truck = rawTruckContainerPoint();
    const rotationDegrees = headingUpMode ? -state.visualHeading : 0;
    const radians = rotationDegrees * Math.PI / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);

    // Exact 2D affine camera: rotate the map, then translate the truck's
    // untransformed Leaflet point precisely onto the viewport centre.
    const translateX = center.x - (cosine * truck.x - sine * truck.y);
    const translateY = center.y - (sine * truck.x + cosine * truck.y);
    layer.style.transform = `matrix(${cosine},${sine},${-sine},${cosine},${translateX},${translateY})`;

    const needle = document.getElementById('compass-needle');
    if (needle) needle.style.transform = `rotate(${rotationDegrees}deg)`;
  }

  function rebaseMapToTruck() {
    if (!globalsReady() || state.rebasing || !cameraShouldFollow()) return;
    state.rebasing = true;
    try {
      state.nativeSetView.call(mapInstance, [simLat, simLng], mapInstance.getZoom(), { animate: false });
      applyCameraMatrix();
    } finally {
      state.rebasing = false;
    }
  }

  function renderCamera(allowRebase = true) {
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
    applyCameraMatrix();
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
    mapInstance.setView = function smoothCameraSetView(center, zoom, options) {
      let requestedZoom = zoom;
      if (requestedZoom === undefined || requestedZoom === null) requestedZoom = this.getZoom();
      let targetsTruck = false;
      try {
        targetsTruck = this.distance(center, [simLat, simLng]) < 1;
      } catch {
        targetsTruck = false;
      }

      // The legacy physics and road-boundary code attempted a full Leaflet
      // view reset every frame. Absorb only those same-position recenter calls.
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
    vehicleMarker.setLatLng = function smoothMarkerSetLatLng(latLng) {
      const result = originalSetLatLng.call(this, latLng);
      try {
        const exactLatLng = L.latLng(latLng);
        const exactLayerPoint = mapInstance.project(exactLatLng, mapInstance.getZoom())
          .subtract(mapInstance.getPixelOrigin());
        if (typeof this._setPos === 'function') this._setPos(exactLayerPoint);
      } catch {
        // Fall back to Leaflet's normal marker placement.
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
      activeTurnRate = baseTurnRate * Math.max(velocityFactor, 0.3) * driveDirection;
    } else {
      activeTurnRate = baseTurnRate * 0.7;
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

    const headingResponse = deltaSeconds > 0
      ? 1 - Math.exp(-CONFIG.headingResponsePerSecond * deltaSeconds)
      : 1;
    state.visualHeading = (
      state.visualHeading
      + shortestAngleDelta(state.visualHeading, currentHeading) * headingResponse
      + 360
    ) % 360;

    if (vehicleMarker) {
      vehicleMarker.setRotationOrigin('center center');
      vehicleMarker.setRotationAngle(state.visualHeading - 90);
    }

    const headingStillSmoothing = Math.abs(shortestAngleDelta(state.visualHeading, currentHeading)) > 0.03;
    if ((velocity !== 0 || isTurning || headingStillSmoothing) && vehicleMarker) {
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

  function patchOrientationControls() {
    updateMapOrientation = function smoothMapOrientation() {
      renderCamera(true);
    };
    window.updateMapOrientation = updateMapOrientation;

    toggleHeadingUp = function smoothToggleHeadingUp() {
      headingUpMode = !headingUpMode;
      const button = document.getElementById('orientation-toggle');
      button?.classList.toggle('active', headingUpMode);
      button?.setAttribute('aria-pressed', String(headingUpMode));
      if (button) button.innerText = headingUpMode ? 'Heading Up' : 'North Up';
      rebaseMapToTruck();
      renderCamera(false);
    };
    window.toggleHeadingUp = toggleHeadingUp;
  }

  function cameraTick(timestamp) {
    if (!state.lastCameraTimestamp) state.lastCameraTimestamp = timestamp;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - state.lastCameraTimestamp) / 1000));
    state.lastCameraTimestamp = timestamp;

    try {
      const response = deltaSeconds > 0
        ? 1 - Math.exp(-CONFIG.headingResponsePerSecond * deltaSeconds)
        : 1;
      state.visualHeading = (
        state.visualHeading
        + shortestAngleDelta(state.visualHeading, currentHeading) * response
        + 360
      ) % 360;
    } catch {
      // Simulator globals are not ready yet.
    }

    installPhysicsLoop();
    patchMarkerPositioning();
    renderCamera(true);
    requestAnimationFrame(cameraTick);
  }

  function install() {
    if (!globalsReady()) {
      requestAnimationFrame(install);
      return;
    }

    state.visualHeading = Number(currentHeading) || 0;
    ensureCameraLayer();
    patchSetView();
    patchMarkerPositioning();
    patchOrientationControls();
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
