(() => {
  'use strict';

  const VERSION = '1.4.20';
  const ROUTE_OPACITY = .34;
  if (window.PTBO_ROUTE_REVIEW_UI_VERSION === VERSION) return;
  window.PTBO_ROUTE_REVIEW_UI_VERSION = VERSION;

  const isMobileHost = (() => {
    try {
      return window.parent !== window && Boolean(window.parent.document.querySelector('.mobile-controls'));
    } catch (_) {
      return false;
    }
  })();

  function installVersionStyle() {
    if (document.getElementById('ptbo-version-143-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-version-143-style';
    style.textContent = `
      #ptbo-version-badge{font-size:0!important}
      #ptbo-version-badge::after{content:'v${VERSION}';font-size:8px;font-weight:700;letter-spacing:.08em}
    `;
    document.head.appendChild(style);
  }

  function installMobileStyles() {
    if (!isMobileHost || document.getElementById('ptbo-mobile-route-review-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-mobile-route-review-style';
    style.textContent = `
      html.ptbo-mobile-route-review #dispatch-hud,
      html.ptbo-mobile-route-review #game-home,
      html.ptbo-mobile-route-review #menu-toggle,
      html.ptbo-mobile-route-review #map-orientation-controls,
      html.ptbo-mobile-route-review .leaflet-control-zoom,
      html.ptbo-mobile-route-review .leaflet-control-scale{
        opacity:0!important;
        visibility:hidden!important;
        pointer-events:none!important;
      }
      html.ptbo-mobile-route-review .leaflet-control-attribution{
        opacity:.58!important;
        font-size:8px!important;
      }
      html.ptbo-mobile-route-review #ptbo-route-legend{
        position:fixed!important;
        top:max(8px,env(safe-area-inset-top))!important;
        left:8px!important;
        right:8px!important;
        width:auto!important;
        max-width:480px!important;
        max-height:none!important;
        margin:0 auto!important;
        padding:10px 11px!important;
        overflow:visible!important;
        border-radius:14px!important;
        background:rgba(7,17,31,.96)!important;
        box-shadow:0 8px 26px rgba(0,0,0,.38)!important;
        backdrop-filter:blur(10px)!important;
      }
      #ptbo-route-legend .ptbo-mobile-compact{display:block}
      #ptbo-route-legend .ptbo-compact-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
      #ptbo-route-legend .ptbo-compact-heading{min-width:0}
      #ptbo-route-legend .ptbo-compact-title{color:#fff;font-size:11px;font-weight:900;letter-spacing:.09em;line-height:1.15;text-transform:uppercase}
      #ptbo-route-legend .ptbo-compact-key{margin-top:2px;color:#9fb0c7;font-size:8.5px;line-height:1.2}
      #ptbo-route-legend .ptbo-compact-done{flex:0 0 auto;padding:6px 9px!important;color:#fff!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:8px!important;background:#374151!important;font-size:9px!important;font-weight:900!important}
      #ptbo-route-legend .ptbo-compact-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}
      #ptbo-route-legend .ptbo-route-chip{min-width:0;display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:6px;padding:7px!important;color:#f8fafc!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:10px!important;background:rgba(255,255,255,.065)!important;text-align:left!important}
      #ptbo-route-legend .ptbo-route-chip[aria-pressed='false']{opacity:.52!important}
      #ptbo-route-legend .ptbo-route-swatch{width:20px;height:5px;border:1px solid rgba(255,255,255,.9);border-radius:999px}
      #ptbo-route-legend .ptbo-route-name{min-width:0;overflow:hidden;color:#eef2ff;font-size:9px;font-weight:800;line-height:1.1;text-overflow:ellipsis;white-space:nowrap}
      #ptbo-route-legend .ptbo-route-distance{display:block;margin-top:2px;color:#fff;font-size:10.5px;font-weight:900}
      #ptbo-route-legend .ptbo-route-toggle{color:#aebbd0;font-size:8px;font-weight:900;text-transform:uppercase}
      #ptbo-route-legend .ptbo-compact-stats{display:flex;align-items:center;gap:5px;margin-top:7px;overflow-x:auto;scrollbar-width:none}
      #ptbo-route-legend .ptbo-compact-stats::-webkit-scrollbar{display:none}
      #ptbo-route-legend .ptbo-stat-pill{flex:0 0 auto;padding:4px 7px;color:#dbeafe;border:1px solid rgba(148,163,184,.2);border-radius:999px;background:rgba(15,23,42,.72);font-size:8.5px;font-weight:800;white-space:nowrap}
      #ptbo-route-legend .ptbo-compact-status{margin-top:6px;color:#fbbf24;font-size:8.5px;line-height:1.25}
      @media(max-width:360px){
        html.ptbo-mobile-route-review #ptbo-route-legend{left:6px!important;right:6px!important;padding:8px!important}
        #ptbo-route-legend .ptbo-route-chip{grid-template-columns:16px minmax(0,1fr);padding:6px!important}
        #ptbo-route-legend .ptbo-route-toggle{display:none}
        #ptbo-route-legend .ptbo-route-swatch{width:16px}
      }
    `;
    document.head.appendChild(style);

    try {
      const parentDoc = window.parent.document;
      if (!parentDoc.getElementById('ptbo-parent-review-style')) {
        const parentStyle = parentDoc.createElement('style');
        parentStyle.id = 'ptbo-parent-review-style';
        parentStyle.textContent = `
          html.ptbo-mobile-route-review-active .mobile-topbar,
          html.ptbo-mobile-route-review-active .mobile-controls,
          html.ptbo-mobile-route-review-active .control-hint{
            opacity:0!important;
            visibility:hidden!important;
            pointer-events:none!important;
          }
        `;
        parentDoc.head.appendChild(parentStyle);
      }
    } catch (_) {}
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return 'N/A';
    if (Math.abs(meters) < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(Math.abs(meters) < 10000 ? 1 : 0)} km`;
  }

  function formatTime(milliseconds) {
    const total = Math.max(0, Number(milliseconds) || 0) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}` : `${seconds.toFixed(1)} s`;
  }

  function setLineVisible(line, visible) {
    if (!line?.setStyle) return;
    line.setStyle({ opacity: visible ? (line._ptboVisibleOpacity ?? ROUTE_OPACITY) : 0 });
  }

  function bindRouteChip(button, line) {
    if (!button) return;
    if (!line) {
      button.disabled = true;
      button.setAttribute('aria-pressed', 'false');
      const toggle = button.querySelector('.ptbo-route-toggle');
      if (toggle) toggle.textContent = 'N/A';
      return;
    }
    button.addEventListener('click', () => {
      const showing = button.getAttribute('aria-pressed') !== 'false';
      setLineVisible(line, !showing);
      button.setAttribute('aria-pressed', String(!showing));
      const toggle = button.querySelector('.ptbo-route-toggle');
      if (toggle) toggle.textContent = showing ? 'Show' : 'Hide';
    });
  }

  function compactLegend(api) {
    if (!isMobileHost || !api?.state?.reviewOpen) return false;
    const legend = document.getElementById('ptbo-route-legend');
    if (!legend || legend.classList.contains('hidden')) return false;
    if (legend.querySelector('.ptbo-mobile-compact')) {
      const state = api.state;
      const playerVisible = legend.querySelector('[data-route="player"]')?.getAttribute('aria-pressed') !== 'false';
      const suggestedVisible = legend.querySelector('[data-route="suggested"]')?.getAttribute('aria-pressed') !== 'false';
      setLineVisible(state.playerLine, playerVisible);
      setLineVisible(state.suggestedLine, suggestedVisible);
      return true;
    }

    const state = api.state;
    const suggestedDistance = Number(state.suggestedRoute?.distance);
    const difference = Number.isFinite(suggestedDistance) ? state.playerDistance - suggestedDistance : NaN;
    const efficiency = Number.isFinite(suggestedDistance) && state.playerDistance > 0
      ? Math.min(999, suggestedDistance / state.playerDistance * 100)
      : NaN;

    legend.innerHTML = `
      <div class="ptbo-mobile-compact">
        <div class="ptbo-compact-head">
          <div class="ptbo-compact-heading">
            <div class="ptbo-compact-title">Route Comparison</div>
            <div class="ptbo-compact-key">Blue: yours · Green: suggested · Teal: shared</div>
          </div>
          <button class="ptbo-compact-done" type="button">Done</button>
        </div>
        <div class="ptbo-compact-routes">
          <button class="ptbo-route-chip" type="button" data-route="player" aria-pressed="true">
            <span class="ptbo-route-swatch" style="background:#2563eb"></span>
            <span class="ptbo-route-name">Your route<strong class="ptbo-route-distance">${formatDistance(state.playerDistance)}</strong></span>
            <span class="ptbo-route-toggle">Hide</span>
          </button>
          <button class="ptbo-route-chip" type="button" data-route="suggested" aria-pressed="${state.suggestedLine ? 'true' : 'false'}">
            <span class="ptbo-route-swatch" style="background:#22c55e"></span>
            <span class="ptbo-route-name">Suggested<strong class="ptbo-route-distance">${formatDistance(suggestedDistance)}</strong></span>
            <span class="ptbo-route-toggle">${state.suggestedLine ? 'Hide' : 'N/A'}</span>
          </button>
        </div>
        <div class="ptbo-compact-stats">
          <span class="ptbo-stat-pill">${Number.isFinite(difference) ? `${difference >= 0 ? '+' : ''}${formatDistance(difference)} difference` : 'Difference N/A'}</span>
          <span class="ptbo-stat-pill">${Number.isFinite(efficiency) ? `${Math.round(efficiency)}% efficient` : 'Efficiency N/A'}</span>
          <span class="ptbo-stat-pill">${formatTime(state.elapsedMs)}</span>
        </div>
        ${state.suggestedRoute ? '' : '<div class="ptbo-compact-status">Suggested route unavailable; your completed route is still shown.</div>'}
      </div>
    `;

    legend.querySelector('.ptbo-compact-done')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ptbo-route-review-close'));
    });
    bindRouteChip(legend.querySelector('[data-route="player"]'), state.playerLine);
    bindRouteChip(legend.querySelector('[data-route="suggested"]'), state.suggestedLine);
    setLineVisible(state.playerLine, true);
    setLineVisible(state.suggestedLine, Boolean(state.suggestedLine));

    setTimeout(() => {
      try {
        if (!state.reviewOpen || !state.layers?.length || !window.L || !mapInstance) return;
        const bounds = L.featureGroup(state.layers).getBounds();
        if (!bounds.isValid()) return;
        const cardHeight = Math.ceil(legend.getBoundingClientRect().height);
        mapInstance.fitBounds(bounds, {
          paddingTopLeft: [18, cardHeight + 20],
          paddingBottomRight: [18, 24],
          maxZoom: 16,
          animate: false,
        });
      } catch (_) {}
    }, 40);
    return true;
  }

  let previousOpen = false;
  function sync() {
    installVersionStyle();
    installMobileStyles();
    const api = window.PTBO_ROUTE_COMPARE;
    const open = Boolean(isMobileHost && api?.state?.reviewOpen);

    if (open !== previousOpen) {
      document.documentElement.classList.toggle('ptbo-mobile-route-review', open);
      try {
        window.parent.document.documentElement.classList.toggle('ptbo-mobile-route-review-active', open);
      } catch (_) {}
      previousOpen = open;
    }

    if (open) compactLegend(api);
  }

  window.addEventListener('pagehide', () => {
    try { window.parent.document.documentElement.classList.remove('ptbo-mobile-route-review-active'); } catch (_) {}
  });

  installVersionStyle();
  installMobileStyles();
  sync();
  setInterval(sync, 100);
})();
