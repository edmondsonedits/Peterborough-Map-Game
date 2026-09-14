(() => {
  'use strict';

  const VERSION = '1.6.69';
  if (window.PTBO_ROUTE_OPACITY_VERSION === VERSION) return;
  window.PTBO_ROUTE_OPACITY_VERSION = VERSION;

  function isVisible(entry) {
    const button = document.querySelector(`[data-line="${entry.key}"]`);
    return !button || button.getAttribute('aria-pressed') !== 'false';
  }

  function applyFallback(line, visible) {
    if (!line?.setStyle) return;
    line.setStyle({ opacity: visible ? (line._ptboVisibleOpacity ?? .8) : 0 });
    line._ptboCasing?.setStyle?.({ opacity: visible ? (line._ptboCasingVisibleOpacity ?? .65) : 0 });
    line._ptboShadowCasing?.setStyle?.({ opacity: visible ? (line._ptboShadowVisibleOpacity ?? .28) : 0 });
  }

  function sync() {
    const api = window.PTBO_ROUTE_COMPARE;
    const state = api?.state;
    if (!state?.reviewOpen) return;
    for (const entry of state.lineEntries || []) {
      if (!entry?.line) continue;
      const visible = isVisible(entry);
      if (window.PTBO_ROUTE_REVIEW_UI?.setLineVisible) window.PTBO_ROUTE_REVIEW_UI.setLineVisible(entry.line, visible);
      else applyFallback(entry.line, visible);
    }
  }

  sync();
  const timer = setInterval(sync, 120);
  window.PTBO_ROUTE_OPACITY = Object.freeze({ version: VERSION, sync, timer });
})();