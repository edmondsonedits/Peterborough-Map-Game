/* =========================================================
   RESPONSE SIMULATOR — MOBILE UI LAYOUT FIXES v1.5.9

   Keeps map controls clear of the dispatch HUD and makes the Leaflet map
   attribution/scale compact so they no longer stretch across the play area.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.5.9';
  if (window.PTBO_MOBILE_UI_LAYOUT?.version === VERSION) return;

  const state = {
    installed: false,
    hudObserver: null,
    bodyObserver: null,
    lastTop: null,
  };

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

      .leaflet-bottom.leaflet-left,
      .leaflet-bottom.leaflet-right{
        bottom:calc(190px + env(safe-area-inset-bottom))!important;
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
        margin:0 8px 0 0!important;
        max-width:min(58vw,330px)!important;
        padding:3px 6px!important;
        color:rgba(248,250,252,.72)!important;
        border:1px solid rgba(255,255,255,.08)!important;
        border-radius:7px!important;
        background:rgba(8,13,24,.48)!important;
        box-shadow:0 3px 10px rgba(0,0,0,.16)!important;
        font-size:6.5px!important;
        line-height:1.18!important;
        text-align:right!important;
        white-space:normal!important;
      }
      .leaflet-control-attribution a{color:inherit!important;text-decoration:none!important;}

      @media(max-width:420px){
        #ptbo-speedometer{left:8px!important;}
        #ptbo-map-toggle{right:8px!important;max-width:min(45vw,172px)!important;}
        .leaflet-bottom.leaflet-left,
        .leaflet-bottom.leaflet-right{bottom:calc(184px + env(safe-area-inset-bottom))!important;}
        .leaflet-control-attribution{max-width:55vw!important;font-size:6px!important;}
      }
      @media(orientation:landscape) and (max-height:560px){
        .leaflet-bottom.leaflet-left,
        .leaflet-bottom.leaflet-right{bottom:calc(140px + env(safe-area-inset-bottom))!important;}
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

  function placeMapButtons() {
    installStyle();
    const speed = document.getElementById('ptbo-speedometer');
    const mapToggle = document.getElementById('ptbo-map-toggle');
    if (!speed && !mapToggle) return;

    const desiredTop = Math.max(118, safeDispatchBottom() + 12);
    const maxTop = Math.max(118, innerHeight - 430);
    const top = Math.min(desiredTop, maxTop);
    state.lastTop = top;

    if (speed) {
      speed.style.setProperty('top', `${top}px`, 'important');
      speed.style.setProperty('bottom', 'auto', 'important');
    }
    if (mapToggle) {
      mapToggle.style.setProperty('top', `${top}px`, 'important');
      mapToggle.style.setProperty('bottom', 'auto', 'important');
      mapToggle.style.setProperty('left', 'auto', 'important');
      mapToggle.style.setProperty('right', matchMedia('(max-width:420px)').matches ? '8px' : '10px', 'important');
    }
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
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
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
