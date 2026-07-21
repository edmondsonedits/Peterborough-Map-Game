(() => {
  'use strict';

  const VERSION = '1.4.20';
  const ROUTE_OPACITY = 0.30;
  const CASING_OPACITY = 0.38;
  if (window.PTBO_ROUTE_OPACITY_VERSION === VERSION) return;
  window.PTBO_ROUTE_OPACITY_VERSION = VERSION;

  const style = document.createElement('style');
  style.id = 'ptbo-version-144-style';
  style.textContent = `
    #ptbo-version-badge{font-size:0!important}
    #ptbo-version-badge::after{content:'v${VERSION}';font-size:8px;font-weight:700;letter-spacing:.08em}
  `;
  document.head.appendChild(style);

  function routeIsVisible(name) {
    const compact = document.querySelector(`[data-route="${name}"]`);
    if (compact) return compact.getAttribute('aria-pressed') !== 'false';
    const legacyName = name === 'player' ? 'player' : 'suggested';
    const legacy = document.querySelector(`[data-toggle="${legacyName}"]`);
    return !legacy || legacy.getAttribute('aria-pressed') !== 'false';
  }

  function applyOpacity(line, visible) {
    if (!line?.setStyle) return;
    line.setStyle({ opacity: visible ? ROUTE_OPACITY : 0 });
    line._ptboCasing?.setStyle?.({ opacity: visible ? CASING_OPACITY : 0 });
  }

  function sync() {
    const state = window.PTBO_ROUTE_COMPARE?.state;
    if (!state?.reviewOpen) return;
    applyOpacity(state.playerLine, routeIsVisible('player'));
    applyOpacity(state.suggestedLine, routeIsVisible('suggested'));
  }

  sync();
  setInterval(sync, 100);
})();
