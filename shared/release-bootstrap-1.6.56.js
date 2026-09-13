/* Compatibility loader: v1.6.56 entry point forwards to production v1.6.57. */
(() => {
  'use strict';
  const VERSION = '1.6.57';
  if (window.PTBO_RELEASE?.version === VERSION || document.getElementById('ptbo-release-bootstrap-v1657')) return;
  const script = document.createElement('script');
  script.id = 'ptbo-release-bootstrap-v1657';
  script.src = new URL(`release-bootstrap-1.6.57.js?v=${VERSION}`, document.currentScript?.src || location.href).href;
  script.dataset.ptboRelease = VERSION;
  script.onerror = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
})();
