(() => {
  'use strict';

  const VERSION = '1.5.1';
  if (window.PTBO_ARCADE_CAMERA_SMOOTHER?.version === VERSION) return;

  const state = {
    lastTimestamp: 0,
    baseZoom: null,
    smoothedZoom: null,
  };

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

  function readVehicleState() {
    const arcade = window.PTBO_ARCADE_HANDLING;
    const instruments = window.PTBO_VEHICLE_INSTRUMENTS;
    if (!arcade || !instruments) return null;
    return { arcade, instruments, settings: arcade.state.settings };
  }

  function cameraLockEnabled() {
    const checkbox = document.getElementById('chk-camera');
    return !checkbox || checkbox.checked;
  }

  function readCenterAhead(meters) {
    try {
      const latitude = Number(simLat);
      const longitude = Number(simLng);
      const heading = Number(currentHeading);
      if (![latitude, longitude, heading].every(Number.isFinite)) return null;
      const radians = heading * Math.PI / 180;
      const latitudeOffset = Math.cos(radians) * meters / 111320;
      const longitudeScale = Math.max(0.2, Math.cos(latitude * Math.PI / 180));
      const longitudeOffset = Math.sin(radians) * meters / (111320 * longitudeScale);
      return [latitude + latitudeOffset, longitude + longitudeOffset];
    } catch {
      return null;
    }
  }

  function tick(timestamp) {
    if (!state.lastTimestamp) state.lastTimestamp = timestamp;
    const deltaSeconds = Math.min(0.05, Math.max(0, (timestamp - state.lastTimestamp) / 1000));
    state.lastTimestamp = timestamp;

    const vehicle = readVehicleState();
    if (!vehicle) {
      requestAnimationFrame(tick);
      return;
    }

    // Disable the older throttled camera pass so the map never alternates
    // between truck-centred and look-ahead positions on adjacent frames.
    vehicle.arcade.state.lastCameraUpdate = Number.POSITIVE_INFINITY;

    if (!vehicle.settings.speedZoomEnabled || !cameraLockEnabled()) {
      state.baseZoom = null;
      state.smoothedZoom = null;
      requestAnimationFrame(tick);
      return;
    }

    let map;
    try {
      map = mapInstance;
    } catch {
      requestAnimationFrame(tick);
      return;
    }
    if (!map?.getZoom || !map?.setView) {
      requestAnimationFrame(tick);
      return;
    }

    const speedKmh = Math.max(0, Number(vehicle.instruments.state.speedKmh) || 0);
    const speedRatio = clamp((speedKmh - 35) / 165, 0, 1);
    const currentZoom = Number(map.getZoom());
    if (!Number.isFinite(currentZoom)) {
      requestAnimationFrame(tick);
      return;
    }

    if (state.baseZoom === null) state.baseZoom = clamp(currentZoom, 16.5, 19);
    if (state.smoothedZoom === null) state.smoothedZoom = currentZoom;

    map.options.zoomSnap = 0.25;
    map.options.zoomDelta = 0.25;
    const targetZoom = clamp(
      state.baseZoom - vehicle.settings.zoomOutLevels * (speedRatio ** 0.72),
      15.5,
      19,
    );
    const zoomResponse = 1 - Math.exp(-deltaSeconds * 3.2);
    state.smoothedZoom += (targetZoom - state.smoothedZoom) * zoomResponse;
    const snappedZoom = Math.round(state.smoothedZoom * 4) / 4;

    const lookAheadMeters = vehicle.settings.cameraLookAheadMeters * (0.18 + 0.82 * speedRatio);
    const center = readCenterAhead(lookAheadMeters);
    if (center) map.setView(center, snappedZoom, { animate: false });

    requestAnimationFrame(tick);
  }

  window.PTBO_ARCADE_CAMERA_SMOOTHER = Object.freeze({ version: VERSION, state });
  requestAnimationFrame(tick);
})();
