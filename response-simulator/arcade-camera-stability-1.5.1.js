(() => {
  'use strict';

  /* ================================================================
     MOBILE CAMERA STABILITY PATCH

     WHAT THE PLAYER WAS SEEING:
     Accelerating changed the Leaflet map zoom several times per second.
     Every zoom level needs a different set of raster map tiles, so mobile
     browsers briefly showed an empty/black map while those tiles loaded.

     CHOSEN FIX:
     Mobile now loads one slightly wider zoom level before driving begins
     and keeps that zoom unchanged while the truck accelerates. The normal
     camera-follow code can still pan across the map without reloading an
     entirely different tile level.

     WHY THIS OPTION:
     A fixed wide zoom removes the source of the flicker rather than hiding
     it with animations. It is also predictable on slower phones and weak
     cellular connections. Desktop keeps the existing speed-based zoom.
     ================================================================ */

  const VERSION = '1.5.1-mobile-stability-1';
  const MOBILE_FIXED_ZOOM = 17.5;
  if (window.PTBO_ARCADE_CAMERA_SMOOTHER?.stabilityVersion === VERSION) return;

  const state = {
    mobile: false,
    fixedZoomApplied: false,
    recenterWrapped: false,
    settingsDecorated: false,
  };

  /* The mobile game runs the simulator inside the page containing the
     steering wheel. Checking for that wheel is more reliable than guessing
     from a phone model or screen width. */
  function detectMobileWrapper() {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch {
      return false;
    }
  }

  function readMap() {
    try {
      return mapInstance || null;
    } catch {
      return null;
    }
  }

  function readVehicleCenter() {
    try {
      const latitude = Number(simLat);
      const longitude = Number(simLng);
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [latitude, longitude]
        : null;
    } catch {
      return null;
    }
  }

  function cameraLockEnabled() {
    const checkbox = document.getElementById('chk-camera');
    return !checkbox || checkbox.checked;
  }

  /* Arcade handling contains an older speed-zoom routine. Giving its timer
     an infinite last-update value makes that routine safely skip itself on
     mobile without changing steering, braking, or desktop behaviour. */
  function disableDynamicMobileZoom() {
    const arcade = window.PTBO_ARCADE_HANDLING;
    if (arcade?.state) arcade.state.lastCameraUpdate = Number.POSITIVE_INFINITY;
  }

  function prepareMobileTileRendering(map) {
    // Half-level zoom gives a useful wider view without making roads tiny.
    map.options.zoomSnap = 0.5;
    map.options.zoomDelta = 0.5;

    try {
      if (tileLayerInstance?.options) {
        // Retain extra surrounding tiles so ordinary camera panning is less
        // likely to expose an unloaded edge while the truck is moving.
        tileLayerInstance.options.keepBuffer = Math.max(6, Number(tileLayerInstance.options.keepBuffer) || 0);
        tileLayerInstance.options.updateWhenZooming = false;
      }
    } catch {
      // The selected map layer may still be loading during startup.
    }
  }

  /* This runs once under the startup cover. It does not run again when the
     speed changes, which is the key difference from the flickering camera. */
  function applyFixedMobileZoom(force = false) {
    const map = readMap();
    const center = readVehicleCenter();
    if (!map?.setView || !center || !cameraLockEnabled()) return false;

    prepareMobileTileRendering(map);
    const currentZoom = Number(map.getZoom?.());
    if (force || !state.fixedZoomApplied || !Number.isFinite(currentZoom)) {
      map.setView(center, MOBILE_FIXED_ZOOM, { animate: false });
      state.fixedZoomApplied = true;
    }
    return true;
  }

  /* The mobile recenter button previously restored zoom level 18. Replace
     that helper so recentering keeps the stable wide view instead. */
  function wrapMobileRecenter() {
    if (state.recenterWrapped || typeof window.mobileRecenter !== 'function') return;
    window.mobileRecenter = () => {
      const lock = document.getElementById('chk-camera');
      if (lock) lock.checked = true;
      state.fixedZoomApplied = false;
      applyFixedMobileZoom(true);
    };
    window.mobileRecenter.ptboFixedWideCamera = true;
    state.recenterWrapped = true;
  }

  function replaceLabelText(label, text) {
    if (!label) return;
    const textNode = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (textNode) textNode.textContent = ` ${text}`;
    else label.append(` ${text}`);
  }

  /* The old speed-zoom controls would be misleading on mobile. They remain
     available on desktop, while mobile shows a short explanation of the
     performance camera that is actually active. */
  function decorateMobileSettings() {
    const zoomToggle = document.getElementById('ptbo-arcade-speed-zoom');
    if (!zoomToggle) return;

    zoomToggle.checked = false;
    zoomToggle.disabled = true;
    zoomToggle.setAttribute('aria-describedby', 'ptbo-mobile-camera-note');
    replaceLabelText(zoomToggle.closest('label'), 'Fixed wide camera on mobile (anti-flicker)');

    const zoomRange = document.getElementById('ptbo-arcade-zoomOutLevels');
    const zoomRow = zoomRange?.closest('.control-row');
    if (zoomRow) zoomRow.hidden = true;

    let note = document.getElementById('ptbo-mobile-camera-note');
    if (!note) {
      note = document.createElement('div');
      note.id = 'ptbo-mobile-camera-note';
      note.textContent = 'Mobile uses one fixed, wider zoom while driving. The map no longer reloads zoom levels during acceleration, preventing lag and black flicker.';
      const existingNote = document.getElementById('ptbo-arcade-note');
      (existingNote?.parentNode || zoomToggle.closest('label')?.parentNode)?.insertBefore(note, existingNote || null);
    }

    if (!document.getElementById('ptbo-mobile-camera-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-mobile-camera-style';
      style.textContent = `
        #ptbo-mobile-camera-note{margin:-2px 0 10px;padding:8px 9px;color:#475569;border:1px solid #cbd5e1;border-radius:7px;background:#f8fafc;font-size:10px;line-height:1.35}
        #ptbo-arcade-speed-zoom:disabled{opacity:.7}
        .leaflet-tile{backface-visibility:hidden;-webkit-backface-visibility:hidden}
      `;
      document.head.appendChild(style);
    }
    state.settingsDecorated = true;
  }

  function tick() {
    state.mobile = detectMobileWrapper();
    if (state.mobile) {
      disableDynamicMobileZoom();
      wrapMobileRecenter();
      decorateMobileSettings();
      applyFixedMobileZoom(false);
    }
    requestAnimationFrame(tick);
  }

  window.PTBO_ARCADE_CAMERA_SMOOTHER = Object.freeze({
    version: '1.5.1',
    stabilityVersion: VERSION,
    mobileFixedZoom: MOBILE_FIXED_ZOOM,
    state,
    applyFixedMobileZoom,
  });

  requestAnimationFrame(tick);
})();
