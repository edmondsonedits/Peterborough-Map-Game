/* Compatibility entry for desktop drivetrain v1.6.68. Kept at the v1.6.67 path so older cached desktop wrappers receive the current gearbox. */
(() => {
  'use strict';
  const VERSION = '1.6.68';
  if (window.PTBO_DESKTOP_DRIVETRAIN?.version === VERSION || document.querySelector('script[data-ptbo-desktop-drivetrain-compat="1.6.68"]')) return;
  const script = document.createElement('script');
  script.src = new URL('./desktop-drivetrain-1.6.68.js?v=1.6.68', document.currentScript?.src || location.href).href;
  script.dataset.ptboDesktopDrivetrainCompat = VERSION;
  script.onerror = () => console.error('Desktop simulator drivetrain v1.6.68 failed to load from compatibility entry.');
  (document.body || document.head || document.documentElement).appendChild(script);
})();
