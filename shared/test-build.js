(() => {
  'use strict';

  const VERSION = '1.4.20';
  const LABEL = `TEST BUILD — v${VERSION}`;
  if (window.PTBO_TEST_BUILD?.version === VERSION) return;

  window.PTBO_TEST_BUILD = Object.freeze({ version: VERSION, label: LABEL });
  window.PTBO_TEST_ERRORS = [];
  addEventListener('error', event => {
    window.PTBO_TEST_ERRORS.push({
      message: String(event.message || event.error || 'Unknown error'),
      source: String(event.filename || event.target?.src || event.target?.href || ''),
      line: Number(event.lineno || 0),
      column: Number(event.colno || 0),
      stack: String(event.error?.stack || ''),
    });
    document.documentElement.dataset.ptboTestErrors = JSON.stringify(window.PTBO_TEST_ERRORS);
  }, true);
  addEventListener('unhandledrejection', event => {
    window.PTBO_TEST_ERRORS.push({
      message: String(event.reason?.message || event.reason || 'Unhandled promise rejection'),
      source: 'unhandledrejection',
      line: 0,
      column: 0,
      stack: String(event.reason?.stack || ''),
    });
    document.documentElement.dataset.ptboTestErrors = JSON.stringify(window.PTBO_TEST_ERRORS);
  });
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'test';

  function install() {
    if (document.getElementById('ptbo-test-build-badge')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-test-build-style';
    style.textContent = `
      #ptbo-test-build-badge{
        position:fixed;top:max(4px,env(safe-area-inset-top));left:50%;z-index:2147483647;
        padding:4px 9px;color:#fff;border:1px solid rgba(255,255,255,.5);border-radius:999px;
        background:rgba(153,27,27,.94);box-shadow:0 4px 14px rgba(0,0,0,.35);
        font:900 10px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.06em;
        text-transform:uppercase;white-space:nowrap;transform:translateX(-50%);pointer-events:none;
      }
      @media(max-width:420px){#ptbo-test-build-badge{top:max(2px,env(safe-area-inset-top));padding:3px 7px;font-size:8px}}
    `;
    const badge = document.createElement('div');
    badge.id = 'ptbo-test-build-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-label', LABEL);
    badge.textContent = LABEL;
    document.head.appendChild(style);
    document.body.appendChild(badge);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  console.info(`${LABEL} initialized.`);
})();
