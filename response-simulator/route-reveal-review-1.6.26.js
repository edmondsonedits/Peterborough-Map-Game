/* Route reveal review bundle loader — v1.6.35. */
(() => {
  'use strict';

  const VERSION = '1.6.35';
  if (window.PTBO_ROUTE_REVEAL_REVIEW_LOADER?.version === VERSION) return;

  const source = document.currentScript?.src || location.href;
  const base = new URL('.', source);

  function load(id, filename) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) existing.remove();
      const script = document.createElement('script');
      script.id = id;
      script.async = false;
      script.src = new URL(`${filename}?v=${VERSION}`, base).href;
      script.onload = () => resolve(script);
      script.onerror = () => reject(new Error(`Unable to load ${filename}.`));
      (document.body || document.head || document.documentElement).appendChild(script);
    });
  }

  const ready = load('ptbo-desktop-fixed-map-default', 'desktop-fixed-map-default-1.6.35.js')
    .then(() => load('ptbo-route-reveal-review-core', 'route-reveal-review-core-1.6.26.js'))
    .then(() => load('ptbo-tutorial-route-grid', 'tutorial-route-grid-1.6.33.js'))
    .catch(error => {
      console.error('Route reveal review bundle failed to initialize.', error);
      throw error;
    });

  window.PTBO_ROUTE_REVEAL_REVIEW_LOADER = Object.freeze({version: VERSION, ready});
})();
