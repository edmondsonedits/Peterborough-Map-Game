/* Compatibility loader: v1.5.7 entry now forwards to the v1.5.8 controls. */
(() => {
  'use strict';
  if (window.PTBO_DIRECTIONAL_DRIVE_ZOOM?.version === '1.5.8') return;
  if (document.getElementById('ptbo-directional-drive-v158-compat')) return;

  const script = document.createElement('script');
  script.id = 'ptbo-directional-drive-v158-compat';
  script.src = new URL(
    'directional-drive-zoom-1.5.8.js?v=1.5.8',
    document.currentScript?.src || document.baseURI,
  ).href;
  script.onerror = () => console.error('Unable to load directional drive controls v1.5.8.');
  (document.body || document.documentElement).appendChild(script);
})();
