/* Desktop camera startup default — v1.6.34. */
(() => {
  'use strict';

  const VERSION = '1.6.34';
  const STORAGE_KEY = 'ptboCameraMode';

  function isDesktopSimulatorHost() {
    try {
      return window.parent !== window && /\/response-simulator\/play\/(?:index\.html)?$/.test(window.parent.location.pathname);
    } catch (_) {
      return false;
    }
  }

  if (!isDesktopSimulatorHost()) return;
  if (window.PTBO_DESKTOP_FIXED_MAP_DEFAULT?.version === VERSION) return;

  try { localStorage.setItem(STORAGE_KEY, 'fixed'); } catch (_) {}

  function applyFixedMap() {
    const camera = window.PTBO_DRIVING_CAMERA;
    if (!camera?.setMode) return false;
    camera.setMode(camera.modes?.FIXED || 'fixed');
    return true;
  }

  if (!applyFixedMap()) {
    window.addEventListener('ptbo-driving-camera-ready', applyFixedMap, { once: true });
  }

  window.PTBO_DESKTOP_FIXED_MAP_DEFAULT = Object.freeze({
    version: VERSION,
    mode: 'fixed',
    apply: applyFixedMap,
  });
})();
