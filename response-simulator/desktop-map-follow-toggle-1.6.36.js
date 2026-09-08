/* Desktop map follow toggle — v1.6.36. */
(() => {
  'use strict';

  const VERSION = '1.6.36';
  if (window.PTBO_DESKTOP_MAP_FOLLOW_TOGGLE?.version === VERSION) return;

  function isDesktopSimulatorHost() {
    try {
      return window.parent !== window && /\/response-simulator\/play\/(?:index\.html)?$/.test(window.parent.location.pathname);
    } catch (_) {
      return false;
    }
  }

  if (!isDesktopSimulatorHost()) return;

  const state = { following: true };
  let parentDoc = null;
  let button = null;
  let nativeSetView = null;
  let setViewPatched = false;
  let buttonInstalled = false;

  function vehiclePosition() {
    try {
      const lat = Number(simLat);
      const lng = Number(simLng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (_) {
      return null;
    }
  }

  function isAutomaticVehicleCenter(center, options) {
    if (!center || options?.animate !== false) return false;
    const vehicle = vehiclePosition();
    if (!vehicle) return false;
    const lat = Array.isArray(center) ? Number(center[0]) : Number(center.lat);
    const lng = Array.isArray(center) ? Number(center[1]) : Number(center.lng);
    return Number.isFinite(lat) && Number.isFinite(lng)
      && Math.abs(lat - vehicle.lat) < 1e-8
      && Math.abs(lng - vehicle.lng) < 1e-8;
  }

  function patchMapFollow() {
    if (setViewPatched) return true;
    try {
      if (typeof mapInstance === 'undefined' || !mapInstance?.setView) return false;
      nativeSetView = mapInstance.setView;
      mapInstance.setView = function ptboDesktopFollowAwareSetView(center, zoom, options) {
        if (!state.following && isAutomaticVehicleCenter(center, options)) return this;
        return nativeSetView.call(this, center, zoom, options);
      };
      mapInstance.dragging?.enable?.();
      mapInstance.scrollWheelZoom?.enable?.();
      mapInstance.doubleClickZoom?.enable?.();
      mapInstance.boxZoom?.enable?.();
      mapInstance.keyboard?.enable?.();
      setViewPatched = true;
      return true;
    } catch (_) {
      return false;
    }
  }

  function updateButton() {
    if (!button) return;
    button.classList.toggle('ptbo-follow-active', state.following);
    button.classList.toggle('ptbo-follow-off', !state.following);
    button.setAttribute('aria-pressed', String(state.following));
    button.setAttribute('aria-label', state.following ? 'Stop following vehicle' : 'Recenter and follow vehicle');
    button.title = state.following ? 'Following truck — click to unlock map' : 'Map unlocked — click to follow truck';
  }

  function recenterAndFollow() {
    state.following = true;
    updateButton();
    try {
      const lock = document.getElementById('chk-camera');
      if (lock) lock.checked = true;
    } catch (_) {}
    try { window.PTBO_DRIVING_CAMERA?.recenter?.(); } catch (_) {}
    try { window.PTBO_DESKTOP_FOLLOW_CAMERA?.recenter?.(); } catch (_) {}
  }

  function stopFollowing() {
    state.following = false;
    updateButton();
    try {
      const lock = document.getElementById('chk-camera');
      if (lock) lock.checked = false;
    } catch (_) {}
  }

  function installButton() {
    if (buttonInstalled) return true;
    try { parentDoc = window.parent.document; } catch (_) { return false; }
    const oldButton = parentDoc?.getElementById('recenter-button');
    if (!oldButton) return false;

    const replacement = oldButton.cloneNode(true);
    oldButton.replaceWith(replacement);
    button = replacement;

    let style = parentDoc.getElementById('ptbo-desktop-follow-toggle-style');
    if (!style) {
      style = parentDoc.createElement('style');
      style.id = 'ptbo-desktop-follow-toggle-style';
      style.textContent = `
        #recenter-button{right:15px!important;bottom:218px!important}
        #recenter-button.ptbo-follow-active{color:#34d399!important;border-color:rgba(52,211,153,.9)!important;background:rgba(6,78,59,.96)!important;box-shadow:0 0 0 1px rgba(52,211,153,.24),0 0 16px rgba(52,211,153,.24),0 6px 20px #0007!important}
        #recenter-button.ptbo-follow-active:hover{color:#6ee7b7!important;border-color:#6ee7b7!important;background:rgba(6,95,70,.98)!important}
        #recenter-button.ptbo-follow-off{color:#cbd5e1!important;border-color:rgba(255,255,255,.22)!important;background:rgba(8,13,24,.96)!important;box-shadow:0 6px 20px #0006!important}
      `;
      parentDoc.head.appendChild(style);
    }

    button.addEventListener('click', () => {
      if (state.following) stopFollowing();
      else recenterAndFollow();
      try { window.parent.document.getElementById('simulator')?.focus(); } catch (_) {}
    });

    updateButton();
    buttonInstalled = true;
    return true;
  }

  function install() {
    const mapReady = patchMapFollow();
    const uiReady = installButton();
    if (!mapReady || !uiReady) requestAnimationFrame(install);
  }

  window.PTBO_DESKTOP_MAP_FOLLOW_TOGGLE = Object.freeze({
    version: VERSION,
    state,
    follow: recenterAndFollow,
    unlock: stopFollowing,
    isFollowing: () => state.following,
  });

  requestAnimationFrame(install);
})();
