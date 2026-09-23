/* Historical release URL retained for compatibility. */
(() => {
  'use strict';
  if (document.getElementById('ptbo-legacy-release-forwarder-loader')) return;
  const script = document.createElement('script');
  script.id = 'ptbo-legacy-release-forwarder-loader';
  script.src = new URL('legacy-release-forwarder.js', document.currentScript?.src || location.href).href;
  script.onerror = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
})();
