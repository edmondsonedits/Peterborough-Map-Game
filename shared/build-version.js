/* =========================================================
   BEGINNER CODE GUIDE — SHARED BUILD VERSION AND ERROR LOG

   PURPOSE:
   Every game page loads this small shared file. It identifies the production
   release, records uncaught browser errors, and displays a tiny version badge.

   WHAT THE PLAYER EXPERIENCES:
   A small “v1.5.3” label confirms which release is running. Normal gameplay is
   unchanged unless an error occurs; errors are stored silently for debugging.

   HOW TO READ THIS FILE:
   - VERSION and LABEL identify the release.
   - PTBO_BUILD exposes that information to other files.
   - Two event listeners capture different kinds of JavaScript errors.
   - install() creates the visible badge after the page body is ready.

   Comments are hidden from players and ignored by the browser.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE SETTING:
  Updating VERSION changes the label and shared build identity. The version is
  also used elsewhere as a cache value so browsers request current source files.
  */
  const VERSION = '1.5.3';
  const LABEL = `v${VERSION}`;

  // Do not install the same production marker twice on one page.
  if (window.PTBO_BUILD?.version === VERSION) return;

  /*
  PUBLIC BUILD INFORMATION:
  Object.freeze prevents accidental changes after creation. Other modules and
  tests can read this object without owning it.
  */
  window.PTBO_BUILD = Object.freeze({
    version: VERSION,
    label: LABEL,
    channel: 'production',
  });

  /*
  RUNTIME ERROR MEMORY:
  This array stores information about errors that escaped normal try/catch
  handling. It helps diagnose a broken device or cached module after the fact.
  */
  window.PTBO_BUILD_ERRORS = [];

  /*
  BROWSER ERROR LISTENER:
  Captures script errors and resource-loading errors. The final true enables
  capture phase so failed script/style/image loads can be noticed early.
  */
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

  /*
  UNHANDLED PROMISE LISTENER:
  Async startup work reports failures through Promises. This catches a rejected
  Promise that no caller handled and stores the same useful debugging fields.
  */
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

  // Data attributes make version/channel easy to inspect from the page element.
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'production';

  /*
  FUNCTION: install

  WHAT THE CODE DOES:
  Builds one small, non-clickable badge and the CSS used to position it at the
  top centre of the screen, including safe-area spacing on mobile devices.

  WHY IT EXISTS:
  A visible version is the fastest way to tell whether a deployment or browser
  cache is showing the expected code during testing.
  */
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

  /*
  DOM READY CHECK:
  HTML is built from top to bottom. If the body does not exist yet, wait for the
  DOMContentLoaded event; otherwise install immediately.
  */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  console.info(`Production build ${LABEL} initialized.`);
})();
