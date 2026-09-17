/* =========================================================
   RESPONSE SIMULATOR — MOBILE UI LAYOUT FIXES v1.6.68

   Keeps map controls clear of the dispatch HUD, places the live street name
   below the speedometer, and keeps required map attribution unobtrusive.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.6.68';
  if (window.PTBO_MOBILE_UI_LAYOUT?.version === VERSION) return;

  const state = {
    installed: false,
    hudObserver: null,
    bodyObserver: null,
    lastTop: null,
  };

  function parentControlsTop() {
    try {
      const controls = window.parent.document.querySelector('.mobile-controls');
      const top = controls?.getBoundingClientRect?.().top;
      return Number.isFinite(top) ? top : innerHeight - 185;
    } catch {
      return innerHeight - 185;
    }
  }

  function installStyle() {
    if (document.getElementById('ptbo-mobile-ui-layout-style')) return;

    const style = document.createElement('style');
    style.id = 'ptbo-mobile-ui-layout-style';
    style.textContent = `
      #ptbo-speedometer{
        bottom:auto!important;
        left:10px!important;
        z-index:1450!important;
        margin:0!important;
      }
      #ptbo-map-toggle{
        bottom:auto!important;
        left:auto!important;
        right:10px!important;
        z-index:1450!important;
        max-width:min(46vw,190px)!important;
        min-height:40px!important;
        margin:0!important;
        padding:8px 11px!important;
      }
      #ptbo-map-toggle [data-map-label]{
        min-width:0!important;
        overflow:hidden!important;
        text-overflow:ellipsis!important;
        white-space:nowrap!important;
      }
      #ptbo-current-street-hud{
        bottom:auto!important;
        left:10px!important;
        z-index:1460!important;
        min-width:0!important;
        max-width:min(43vw,170px)!important;
        padding:7px 9px!important;
        transform:none!important;
        text-align:left!important;
        border:1px solid rgba(255,255,255,.18)!important;
        border-left:3px solid #38bdf8!important;
        border-radius:10px!important;
        background:rgba(8,13,24,.91)!important;
        box-shadow:0 5px 16px rgba(0,0,0,.28)!important;
      }
      #ptbo-current-street-hud .street-kicker{
        font-size:6px!important;
        letter-spacing:.13em!important;
      }
      #ptbo-current-street-name{
        font-size:10px!important;
        line-height:1.18!important;
      }

      .leaflet-control-scale{
        margin:0 0 0 8px!important;
        overflow:hidden!important;
        border:1px solid rgba(255,255,255,.12)!important;
        border-radius:7px!important;
        background:rgba(8,13,24,.58)!important;
        box-shadow:0 3px 10px rgba(0,0,0,.18)!important;
      }
      .leaflet-control-scale-line{
        min-width:48px!important;
        padding:2px 5px!important;
        color:rgba(248,250,252,.88)!important;
        border-color:rgba(255,255,255,.35)!important;
        border-top:0!important;
        background:transparent!important;
        font-size:9px!important;
        line-height:1.1!important;
        text-shadow:none!important;
      }
      .leaflet-control-attribution{
        margin:0 7px 1px 0!important;
        max-width:min(43vw,250px)!important;
        padding:1px 3px!important;
        color:rgba(248,250,252,.58)!important;
        border:0!important;
        border-radius:3px!important;
        background:rgba(8,13,24,.24)!important;
        box-shadow:none!important;
        font-size:5px!important;
        font-weight:600!important;
        line-height:1.08!important;
        text-align:right!important;
        white-space:normal!important;
      }
      .leaflet-control-attribution a{color:inherit!important;text-decoration:none!important;}

      @media(max-width:420px){
        #ptbo-speedometer{left:8px!important;}
        #ptbo-map-toggle{right:8px!important;max-width:min(45vw,172px)!important;}
        #ptbo-current-street-hud{left:8px!important;max-width:min(44vw,160px)!important;}
        .leaflet-control-attribution{max-width:42vw!important;font-size:4.75px!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function safeDispatchBottom() {
    const hud = document.getElementById('dispatch-hud');
    if (!hud || hud.hidden || getComputedStyle(hud).display === 'none') return 118;
    const rect = hud.getBoundingClientRect();
    if (!Number.isFinite(rect.bottom) || rect.bottom <= 0) return 118;
    return Math.ceil(rect.bottom);
  }

  function placeLeafletFooter() {
    const controlsTop = parentControlsTop();
    const bottomOffset = Math.max(138, Math.ceil(innerHeight - controlsTop + 8));
    document.querySelectorAll('.leaflet-bottom').forEach(corner => {
      corner.style.setProperty('bottom', `${bottomOffset}px`, 'important');
    });
  }

  function placeMapButtons() {
    installStyle();
    const speed = document.getElementById('ptbo-speedometer');
    const mapToggle = document.getElementById('ptbo-map-toggle');
    const street = document.getElementById('ptbo-current-street-hud');

    const desiredTop = Math.max(118, safeDispatchBottom() + 12);
    const controlsTop = parentControlsTop();
    const speedRect = speed?.getBoundingClientRect?.();
    const tallestControl = Math.max(
      Number(speedRect?.height) || 72,
      Number(mapToggle?.getBoundingClientRect?.().height) || 44,
    );
    const latestSafeTop = Math.max(118, Math.floor(controlsTop - tallestControl - 14));
    const top = Math.min(desiredTop, latestSafeTop);
    state.lastTop = top;

    const mobileLeft = matchMedia('(max-width:420px)').matches ? 8 : 10;
    if (speed) {
      speed.style.setProperty('top', `${top}px`, 'important');
      speed.style.setProperty('bottom', 'auto', 'important');
      speed.style.setProperty('left', `${mobileLeft}px`, 'important');
    }
    if (mapToggle) {
      mapToggle.style.setProperty('top', `${top}px`, 'important');
      mapToggle.style.setProperty('bottom', 'auto', 'important');
      mapToggle.style.setProperty('left', 'auto', 'important');
      mapToggle.style.setProperty('right', matchMedia('(max-width:420px)').matches ? '8px' : '10px', 'important');
    }
    if (street) {
      const actualSpeedRect = speed?.getBoundingClientRect?.();
      const streetTop = Math.round(top + (Number(actualSpeedRect?.height) || 72) + 10);
      const speedWidth = Math.round(Number(actualSpeedRect?.width) || 158);
      street.style.setProperty('top', `${streetTop}px`, 'important');
      street.style.setProperty('bottom', 'auto', 'important');
      street.style.setProperty('left', `${mobileLeft}px`, 'important');
      street.style.setProperty('width', `${speedWidth}px`, 'important');
      street.style.setProperty('max-width', `min(44vw, ${Math.max(140, speedWidth)}px)`, 'important');
      street.style.setProperty('transform', 'none', 'important');
    }

    placeLeafletFooter();
  }

  function observeHud() {
    const hud = document.getElementById('dispatch-hud');
    if (hud && !state.hudObserver && window.ResizeObserver) {
      state.hudObserver = new ResizeObserver(() => requestAnimationFrame(placeMapButtons));
      state.hudObserver.observe(hud);
    }

    if (!state.bodyObserver && window.MutationObserver) {
      state.bodyObserver = new MutationObserver(() => requestAnimationFrame(() => {
        if (!state.hudObserver) observeHud();
        placeMapButtons();
      }));
      state.bodyObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    installStyle();
    observeHud();
    placeMapButtons();
    addEventListener('resize', placeMapButtons, { passive: true });
    try { window.parent.addEventListener('resize', placeMapButtons, { passive: true }); } catch {}
    [100, 350, 900, 1800, 5200].forEach(delay => setTimeout(placeMapButtons, delay));
  }

  window.PTBO_MOBILE_UI_LAYOUT = Object.freeze({
    version: VERSION,
    state,
    refresh: placeMapButtons,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
