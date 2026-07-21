(() => {
  'use strict';

  const VERSION = '1.5.0';
  const LABEL = `v${VERSION}`;
  if (window.PTBO_BUILD?.version === VERSION) return;

  window.PTBO_BUILD = Object.freeze({ version: VERSION, label: LABEL, channel: 'production' });
  window.PTBO_BUILD_ERRORS = [];
  addEventListener('error', event => {
    window.PTBO_BUILD_ERRORS.push({
      message: String(event.message || event.error || 'Unknown error'),
      source: String(event.filename || event.target?.src || event.target?.href || ''),
      line: Number(event.lineno || 0),
      column: Number(event.colno || 0),
      stack: String(event.error?.stack || ''),
    });
    document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
  }, true);
  addEventListener('unhandledrejection', event => {
    window.PTBO_BUILD_ERRORS.push({
      message: String(event.reason?.message || event.reason || 'Unhandled promise rejection'),
      source: 'unhandledrejection',
      line: 0,
      column: 0,
      stack: String(event.reason?.stack || ''),
    });
    document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
  });
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'production';

  function install() {
    if (document.getElementById('ptbo-build-badge')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-build-style';
    style.textContent = `
      #ptbo-build-badge{
        position:fixed;top:max(4px,env(safe-area-inset-top));left:50%;z-index:2147483647;
        padding:3px 8px;color:#e2e8f0;border:1px solid rgba(255,255,255,.28);border-radius:999px;
        background:rgba(15,23,42,.82);box-shadow:0 3px 10px rgba(0,0,0,.25);
        font:800 9px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.05em;
        white-space:nowrap;transform:translateX(-50%);pointer-events:none;
      }
      @media(max-width:420px){#ptbo-build-badge{top:max(2px,env(safe-area-inset-top));padding:2px 6px;font-size:7px}}
    `;
    const badge = document.createElement('div');
    badge.id = 'ptbo-build-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', `Production version ${VERSION}`);
    badge.textContent = LABEL;
    document.head.appendChild(style);
    document.body.appendChild(badge);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  console.info(`Production build ${LABEL} initialized.`);
})();
