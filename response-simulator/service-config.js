/* Generic service-config compatibility loader.
   City-specific Fire/EMS bases, hospital and map data now live under cities/<id>/. */
(() => {
  'use strict';
  const VERSION = '1.6.5';
  if (window.PTBO_SERVICE_CONFIG && window.PTBO_CITY_PACKAGE) return;

  const params = new URLSearchParams(location.search);
  const stored = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
  const cityId = /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';
  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  const packageUrl = new URL(`../cities/${cityId}/package.js?v=${VERSION}`, sourceUrl).href;

  window.PTBO_REQUESTED_CITY = cityId;

  // During normal parser execution this keeps package.js ahead of base-locations.js.
  if (document.readyState === 'loading') {
    document.write(`<script src="${packageUrl.replace(/&/g,'&amp;')}"><\/script>`);
    return;
  }

  // Fallback for late/manual loading outside the normal simulator boot sequence.
  const script = document.createElement('script');
  script.src = packageUrl;
  script.dataset.ptboCityPackage = cityId;
  script.onerror = () => console.error(`Unable to load city package: ${cityId}`);
  document.head.appendChild(script);
})();
