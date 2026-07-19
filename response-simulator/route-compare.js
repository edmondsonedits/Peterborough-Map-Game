(() => {
  'use strict';

  const VERSION = '1.4.2';
  if (window.PTBO_ROUTE_COMPARE_BOOT_VERSION === VERSION || document.querySelector('script[data-ptbo-route-compare-core="1.4.2"]')) return;

  const current = document.currentScript;
  const script = document.createElement('script');
  script.src = new URL(`route-compare-1.4.2.js?v=${VERSION}`, current?.src || document.baseURI).href;
  script.dataset.ptboRouteCompareCore = VERSION;
  script.onerror = () => console.error('Unable to load the stable post-call route comparison system.');
  document.body.appendChild(script);
})();
