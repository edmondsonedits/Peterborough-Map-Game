/* Compatibility loader for the v1.6.47 vehicle spawn editor. */
(() => {
  'use strict';
  const VERSION = '1.6.47';
  if (window.PTBO_SPAWN_BOX_EDITOR?.version === VERSION) return;
  const source = document.currentScript?.src || location.href;
  const script = document.createElement('script');
  script.src = new URL(`spawn-box-editor-1.6.47.js?v=${VERSION}`, source).href;
  script.async = false;
  script.dataset.ptboSpawnBoxCompat = VERSION;
  (document.body || document.head || document.documentElement).appendChild(script);
})();
