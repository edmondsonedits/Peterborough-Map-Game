/* Route reveal review bundle loader — core v1.6.26, bundle v1.6.39. */
(() => {
  'use strict';

  const VERSION = '1.6.26';
  const BUNDLE_REVISION = '1.6.39';
  if (window.PTBO_ROUTE_REVEAL_REVIEW_LOADER?.version === BUNDLE_REVISION) return;

  const source = document.currentScript?.src || location.href;
  const base = new URL('.', source);

  function load(id, filename) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
      const script = document.createElement('script');
      script.id = id;
      script.async = false;
      script.src = new URL(`${filename}?v=${BUNDLE_REVISION}`, base).href;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Unable to load ${filename}.`));
      (document.body || document.head || document.documentElement).appendChild(script);
    });
  }

  const ready = load('ptbo-desktop-fixed-map-default', 'desktop-fixed-map-default-1.6.35.js')
    .then(() => load('ptbo-desktop-map-follow-toggle', 'desktop-map-follow-toggle-1.6.36.js'))
    .then(() => load('ptbo-route-reveal-review-core', `route-reveal-review-core-${VERSION}.js`))
    .then(() => load('ptbo-tutorial-route-grid', 'tutorial-route-grid-1.6.33.js'))
    .catch(error => {
      console.error('Route reveal review bundle failed to initialize.', error);
      throw error;
    });

  window.PTBO_ROUTE_REVEAL_REVIEW_LOADER = Object.freeze({
    version: BUNDLE_REVISION,
    coreVersion: VERSION,
    ready,
  });
})();