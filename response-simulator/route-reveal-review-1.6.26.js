/* Mobile route-reveal presentation and exact pre-reveal view restoration. */
(() => {
  'use strict';

  const VERSION = '1.6.26';
  if (window.PTBO_ROUTE_REVEAL_REVIEW?.version === VERSION) return;

  const state = {
    installed: false,
    mobileHost: false,
    previousVisible: false,
    savedView: null,
    restorePending: false,
    refitTimer: 0,
  };

  function getMap() {
    try {
      if (typeof mapInstance !== 'undefined' && mapInstance) return mapInstance;
    } catch (_) {}
    return window.PTBO_ROUTE_REVEAL?.state?.routeLine?._map || null;
  }

  function detectMobileHost() {
    try {
      return window.parent !== window && Boolean(window.parent.document.querySelector('.mobile-controls'));
    } catch (_) {
      return false;
    }
  }

  function installStyles() {
    if (!document.getElementById('ptbo-route-reveal-review-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-route-reveal-review-style';
      style.textContent = `
        html.ptbo-route-reveal-review #route-answer-card{
          z-index:1600!important;
        }
        @media(max-width:900px),(pointer:coarse){
          html.ptbo-route-reveal-review #route-answer-card{
            position:fixed!important;
            left:10px!important;
            right:10px!important;
            bottom:calc(12px + env(safe-area-inset-bottom))!important;
            width:auto!important;
            max-width:none!important;
            padding:12px 13px!important;
            border-radius:14px!important;
            background:rgba(7,17,31,.96)!important;
            box-shadow:0 10px 30px rgba(0,0,0,.45)!important;
          }
        }
        @media(orientation:landscape) and (max-height:560px){
          html.ptbo-route-reveal-review #route-answer-card{
            left:12px!important;
            right:auto!important;
            bottom:calc(10px + env(safe-area-inset-bottom))!important;
            width:min(420px,55vw)!important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    if (!state.mobileHost) return;
    try {
      const parentDoc = window.parent.document;
      if (parentDoc.getElementById('ptbo-route-reveal-parent-style')) return;
      const style = parentDoc.createElement('style');
      style.id = 'ptbo-route-reveal-parent-style';
      style.textContent = `
        html.ptbo-route-reveal-active .mobile-controls,
        html.ptbo-route-reveal-active .control-hint{
          opacity:0!important;
          visibility:hidden!important;
          pointer-events:none!important;
        }
      `;
      parentDoc.head.appendChild(style);
    } catch (_) {}
  }

  function setReviewActive(active) {
    document.documentElement.classList.toggle('ptbo-route-reveal-review', Boolean(active));
    if (!state.mobileHost) return;
    try {
      window.parent.document.documentElement.classList.toggle('ptbo-route-reveal-active', Boolean(active));
      if (active) window.parent.dispatchEvent(new window.parent.Event('blur'));
    } catch (_) {}
  }

  function captureView() {
    const map = getMap();
    if (!map?.getCenter || !map?.getZoom) return;
    const center = map.getCenter();
    const zoom = Number(map.getZoom());
    if (!center || !Number.isFinite(zoom)) return;
    state.savedView = {
      center: [Number(center.lat), Number(center.lng)],
      zoom,
    };
  }

  function restoreView() {
    const map = getMap();
    const saved = state.savedView;
    state.savedView = null;
    state.restorePending = false;
    if (!map?.setView || !saved || !Number.isFinite(saved.zoom)) return;
    map.setView(saved.center, saved.zoom, { animate: true });
  }

  function fitRouteAroundReviewUi() {
    if (!state.mobileHost) return;
    const api = window.PTBO_ROUTE_REVEAL;
    const line = api?.state?.routeLine;
    const map = line?._map || getMap();
    if (!api?.state?.routeVisible || !line?.getBounds || !map?.fitBounds) return;

    const bounds = line.getBounds();
    if (!bounds?.isValid?.()) return;
    const card = document.getElementById('route-answer-card');
    const cardHeight = Math.max(100, Math.ceil(card?.getBoundingClientRect?.().height || 0));
    const topInset = Math.min(205, Math.max(145, Math.round(innerHeight * 0.18)));
    map.fitBounds(bounds, {
      paddingTopLeft: [28, topInset],
      paddingBottomRight: [28, cardHeight + 30],
      maxZoom: 16,
      animate: true,
    });
  }

  function scheduleRefit() {
    clearTimeout(state.refitTimer);
    state.refitTimer = setTimeout(fitRouteAroundReviewUi, 80);
  }

  function syncVisibility() {
    const visible = Boolean(window.PTBO_ROUTE_REVEAL?.state?.routeVisible);
    if (visible === state.previousVisible) return;
    state.previousVisible = visible;
    setReviewActive(visible);
    if (visible) {
      scheduleRefit();
      return;
    }
    if (!state.restorePending) state.savedView = null;
  }

  function handleRouteButtonCapture(event) {
    const button = event.target instanceof Element ? event.target.closest('#route-answer-btn') : null;
    if (!button) return;
    const api = window.PTBO_ROUTE_REVEAL;
    if (!api?.state) return;

    const wasVisible = Boolean(api.state.routeVisible);
    if (!wasVisible) {
      captureView();
      state.restorePending = false;
    } else {
      state.restorePending = true;
    }

    setTimeout(() => {
      const isVisible = Boolean(window.PTBO_ROUTE_REVEAL?.state?.routeVisible);
      if (!wasVisible && isVisible) {
        state.previousVisible = true;
        setReviewActive(true);
        scheduleRefit();
        return;
      }
      if (!wasVisible && !isVisible) {
        state.savedView = null;
        state.restorePending = false;
        return;
      }
      if (wasVisible && !isVisible) {
        state.previousVisible = false;
        setReviewActive(false);
        restoreView();
      }
    }, 0);
  }

  function install() {
    if (state.installed) return;
    state.mobileHost = detectMobileHost();
    installStyles();
    document.addEventListener('click', handleRouteButtonCapture, true);
    setInterval(syncVisibility, 100);
    addEventListener('pagehide', () => {
      clearTimeout(state.refitTimer);
      setReviewActive(false);
    });
    state.installed = true;
  }

  window.PTBO_ROUTE_REVEAL_REVIEW = Object.freeze({
    version: VERSION,
    state,
    captureView,
    restoreView,
    fitRouteAroundReviewUi,
  });

  install();
})();