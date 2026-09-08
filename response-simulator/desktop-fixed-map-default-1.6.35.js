/* Desktop camera, acceleration and speed-zoom profile — v1.6.35. */
(() => {
  'use strict';

  const VERSION = '1.6.35';
  const STORAGE_KEY = 'ptboCameraMode';
  const VELOCITY_TO_KMH = 111195 * 60 * 3.6;
  const FIRST_ZOOM_OUT_KMH = 200;
  const SECOND_ZOOM_OUT_KMH = 500;
  const FIRST_ZOOM_IN_KMH = 180;
  const SECOND_ZOOM_IN_KMH = 450;
  const TOP_SPEED_KMH = 999;

  function isDesktopSimulatorHost() {
    try {
      return window.parent !== window && /\/response-simulator\/play\/(?:index\.html)?$/.test(window.parent.location.pathname);
    } catch (_) {
      return false;
    }
  }

  if (!isDesktopSimulatorHost()) return;
  if (window.PTBO_DESKTOP_FIXED_MAP_DEFAULT?.version === VERSION) return;

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const moveTowards = (current, target, maximumDelta) => {
    const delta = target - current;
    if (Math.abs(delta) <= maximumDelta) return target;
    return current + Math.sign(delta) * maximumDelta;
  };

  try { localStorage.setItem(STORAGE_KEY, 'fixed'); } catch (_) {}

  let fixedMapApplied = false;
  function applyFixedMap() {
    if (fixedMapApplied) return true;
    const camera = window.PTBO_DRIVING_CAMERA;
    if (!camera?.setMode) return false;
    camera.setMode(camera.modes?.FIXED || 'fixed');
    fixedMapApplied = true;
    return true;
  }

  if (!applyFixedMap()) {
    window.addEventListener('ptbo-driving-camera-ready', applyFixedMap, { once: true });
  }

  let patchedDriveApi = null;
  function installDesktopDriveProfile() {
    const current = window.PTBO_DIRECTIONAL_DRIVE_ZOOM;
    if (!current) return false;
    if (current === patchedDriveApi || current.desktopProfile?.version === VERSION) return true;

    function desktopDriveStep(seconds) {
      const dt = clamp(Number(seconds) || 0, 0, 0.08);
      if (!dt) return true;

      let signedSpeedKmh;
      try { signedSpeedKmh = (Number(velocity) || 0) * VELOCITY_TO_KMH; }
      catch (_) { return false; }

      let forward = false;
      let reverse = false;
      try {
        forward = Boolean(keys.ArrowUp || keys.w);
        reverse = Boolean(keys.ArrowDown || keys.s);
      } catch (_) {
        return false;
      }

      const speedSlider = document.getElementById('sld-speed');
      const speedSetting = clamp(Number(speedSlider?.value) || 5, 1, 50);
      const baseAccelerationKmhPerSecond = 10 + speedSetting * 1.6;
      let targetKmh = 0;
      let rateKmhPerSecond = 14;

      if (forward && !reverse) {
        if (signedSpeedKmh < -0.5) {
          targetKmh = 0;
          rateKmhPerSecond = 65;
        } else {
          const forwardSpeed = Math.max(0, signedSpeedKmh);
          const highSpeedScale = forwardSpeed >= SECOND_ZOOM_OUT_KMH
            ? 0.65
            : forwardSpeed >= FIRST_ZOOM_OUT_KMH ? 0.82 : 1;
          targetKmh = TOP_SPEED_KMH;
          rateKmhPerSecond = baseAccelerationKmhPerSecond * highSpeedScale;
        }
      } else if (reverse && !forward) {
        if (signedSpeedKmh > 0.5) {
          targetKmh = 0;
          rateKmhPerSecond = 65;
        } else {
          targetKmh = -45;
          rateKmhPerSecond = 22;
        }
      }

      signedSpeedKmh = moveTowards(signedSpeedKmh, targetKmh, rateKmhPerSecond * dt);
      try { velocity = Math.abs(signedSpeedKmh) < 0.03 ? 0 : signedSpeedKmh / VELOCITY_TO_KMH; }
      catch (_) { return false; }
      return true;
    }

    patchedDriveApi = Object.freeze({
      ...current,
      driveStep: desktopDriveStep,
      desktopProfile: Object.freeze({
        version: VERSION,
        topSpeedKmh: TOP_SPEED_KMH,
        defaultAccelerationKmhPerSecond: 18,
        firstZoomOutKmh: FIRST_ZOOM_OUT_KMH,
        secondZoomOutKmh: SECOND_ZOOM_OUT_KMH,
      }),
    });
    window.PTBO_DIRECTIONAL_DRIVE_ZOOM = patchedDriveApi;
    return true;
  }

  let speedZoomInstalled = false;
  function installDesktopSpeedZoom() {
    if (speedZoomInstalled) return true;
    if (!window.PTBO_DESKTOP_FOLLOW_CAMERA) return false;
    try {
      if (typeof mapInstance === 'undefined' || !mapInstance?.setView) return false;
    } catch (_) {
      return false;
    }

    const maximumZoom = Number(city?.map?.maxZoom) || Number(mapInstance.options?.maxZoom) || 19;
    const minimumZoom = Number(city?.map?.minZoom) || Number(mapInstance.options?.minZoom) || 10;
    const mediumZoom = Math.max(minimumZoom, maximumZoom - 1);
    const farZoom = Math.max(minimumZoom, maximumZoom - 2);
    const nativeSetView = mapInstance.setView;
    let zoomStage = 0;

    function speedKmh() {
      try { return Math.abs(Number(velocity) || 0) * VELOCITY_TO_KMH; }
      catch (_) { return 0; }
    }

    function updateZoomStage() {
      const speed = speedKmh();
      if (zoomStage === 0) {
        if (speed >= SECOND_ZOOM_OUT_KMH) zoomStage = 2;
        else if (speed >= FIRST_ZOOM_OUT_KMH) zoomStage = 1;
      } else if (zoomStage === 1) {
        if (speed >= SECOND_ZOOM_OUT_KMH) zoomStage = 2;
        else if (speed < FIRST_ZOOM_IN_KMH) zoomStage = 0;
      } else if (speed < SECOND_ZOOM_IN_KMH) {
        zoomStage = speed >= FIRST_ZOOM_IN_KMH ? 1 : 0;
      }
      return zoomStage;
    }

    function stageZoom() {
      const stage = updateZoomStage();
      return stage === 2 ? farZoom : stage === 1 ? mediumZoom : maximumZoom;
    }

    mapInstance.setView = function desktopSpeedAwareSetView(center, zoom, options) {
      let requestedZoom = zoom;
      const reviewOpen = Boolean(window.PTBO_ROUTE_COMPARE?.state?.reviewOpen);
      if (!reviewOpen && Number.isFinite(Number(requestedZoom))) {
        requestedZoom = Math.min(Number(requestedZoom), stageZoom());
      }
      return nativeSetView.call(this, center, requestedZoom, options);
    };

    window.PTBO_DESKTOP_SPEED_ZOOM = Object.freeze({
      version: VERSION,
      maximumZoom,
      mediumZoom,
      farZoom,
      firstZoomOutKmh: FIRST_ZOOM_OUT_KMH,
      secondZoomOutKmh: SECOND_ZOOM_OUT_KMH,
      firstZoomInKmh: FIRST_ZOOM_IN_KMH,
      secondZoomInKmh: SECOND_ZOOM_IN_KMH,
      getStage: () => zoomStage,
      getSpeedKmh: speedKmh,
    });
    speedZoomInstalled = true;
    return true;
  }

  function finishDesktopInstall() {
    const driveReady = installDesktopDriveProfile();
    const cameraReady = applyFixedMap();
    const zoomReady = installDesktopSpeedZoom();
    if (!driveReady || !cameraReady || !zoomReady) requestAnimationFrame(finishDesktopInstall);
  }

  window.PTBO_DESKTOP_DRIVE_PROFILE = Object.freeze({
    version: VERSION,
    topSpeedKmh: TOP_SPEED_KMH,
    defaultAccelerationKmhPerSecond: 18,
    firstZoomOutKmh: FIRST_ZOOM_OUT_KMH,
    secondZoomOutKmh: SECOND_ZOOM_OUT_KMH,
    firstZoomInKmh: FIRST_ZOOM_IN_KMH,
    secondZoomInKmh: SECOND_ZOOM_IN_KMH,
  });

  window.PTBO_DESKTOP_FIXED_MAP_DEFAULT = Object.freeze({
    version: VERSION,
    mode: 'fixed',
    apply: applyFixedMap,
  });

  requestAnimationFrame(finishDesktopInstall);
})();
