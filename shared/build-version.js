/* =========================================================
   BEGINNER CODE GUIDE — SHARED BUILD VERSION AND ERROR LOG

   PURPOSE:
   Every game page loads this small shared file. It identifies the production
   release, records uncaught browser errors, displays a tiny version badge, and
   loads small page-specific production enhancements when required.

   WHAT THE PLAYER EXPERIENCES:
   A small “v1.5.6” label confirms which release is running. The response
   simulator now starts with Esri satellite imagery and hybrid labels, includes
   a one-tap Normal Map / Satellite switch, and preloads upcoming zoom tiles to
   reduce mobile flicker. The mobile dispatch card still minimizes five seconds
   after a call begins while leaving its timer and expand control visible.

   HOW TO READ THIS FILE:
   - VERSION and LABEL identify the release.
   - PTBO_BUILD exposes that information to other files.
   - Two event listeners capture different kinds of JavaScript errors.
   - install() creates the visible badge after the page body is ready.
   - installPageEnhancements() loads features used only by matching pages.

   Comments are hidden from players and ignored by the browser.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE SETTING:
  Updating VERSION changes the label and shared build identity. The version is
  also used elsewhere as a cache value so browsers request current source files.
  */
  const VERSION = '1.5.6';
  const LABEL = `v${VERSION}`;
  const SCRIPT_URL = document.currentScript?.src || new URL('shared/build-version.js', location.href).href;

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
  FUNCTION: installResponseSimulatorSatellite

  WHAT THE CODE DOES:
  Detects the desktop or mobile response-simulator wrapper, adds a temporary map
  loading cover, and injects the release-specific satellite module into the
  simulator iframe as soon as its shared Leaflet page finishes loading.

  WHY IT LIVES HERE:
  Both wrappers already load build-version.js before their own startup scripts.
  One shared loader therefore enables the same map on desktop and mobile without
  duplicating the large simulator HTML file or touching vehicle physics.
  */
  function installResponseSimulatorSatellite() {
    const isResponseWrapper = /\/response-simulator\/(?:play|mobile)\/(?:index\.html)?$/.test(location.pathname);
    if (!isResponseWrapper) return;

    const frame = document.getElementById('simulator');
    if (!frame || frame.dataset.ptboSatelliteLoader === VERSION) return;
    frame.dataset.ptboSatelliteLoader = VERSION;

    const style = document.createElement('style');
    style.id = 'ptbo-satellite-startup-style';
    style.textContent = `
      #ptbo-satellite-startup-cover{
        position:fixed;inset:0;z-index:5950;display:grid;place-items:center;padding:24px;
        color:#f8fafc;background:#111827;text-align:center;transition:opacity .2s ease;
        font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #ptbo-satellite-startup-cover.hidden{opacity:0;pointer-events:none}
      #ptbo-satellite-startup-cover strong{display:block;font-size:1.15rem}
      #ptbo-satellite-startup-cover span{display:block;margin-top:7px;color:#cbd5e1;font-size:.9rem;line-height:1.45}
    `;

    const cover = document.createElement('div');
    cover.id = 'ptbo-satellite-startup-cover';
    cover.innerHTML = '<div><strong>Loading satellite map</strong><span>Preparing Esri imagery, road labels, and smooth zoom tiles…</span></div>';
    document.head.appendChild(style);
    document.body.appendChild(cover);

    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      cover.classList.add('hidden');
      setTimeout(() => {
        cover.remove();
        style.remove();
      }, 240);
    };

    const failOpen = error => {
      if (error) console.error('Satellite map enhancement did not finish; continuing with the normal map.', error);
      finish();
    };

    const installInsideFrame = () => {
      const doc = frame.contentDocument;
      const game = frame.contentWindow;
      if (!doc || !game) {
        failOpen(new Error('Simulator frame was not accessible.'));
        return;
      }

      const existing = doc.getElementById('ptbo-satellite-map-loader');
      if (existing) {
        Promise.resolve(game.PTBO_SATELLITE_MAP_READY).then(finish, failOpen);
        return;
      }

      const script = doc.createElement('script');
      script.id = 'ptbo-satellite-map-loader';
      script.src = new URL(`../response-simulator/satellite-map-1.5.6.js?v=${VERSION}`, SCRIPT_URL).href;
      script.onload = () => {
        Promise.resolve(game.PTBO_SATELLITE_MAP_READY).then(finish, failOpen);
      };
      script.onerror = () => failOpen(new Error('Unable to load the satellite map module.'));
      (doc.body || doc.documentElement).appendChild(script);
    };

    frame.addEventListener('load', installInsideFrame);
    if (frame.contentDocument?.readyState === 'complete') installInsideFrame();

    // A map-service outage must not permanently block access to the game.
    setTimeout(() => failOpen(new Error('Satellite startup safety timeout reached.')), 12000);
  }

  /*
  FUNCTION: installPageEnhancements

  WHAT THE CODE DOES:
  Loads the existing mobile dispatch-card controller on the mobile response page
  and installs the satellite map loader on both mobile and desktop wrappers.
  Other game pages do not download these simulator-only modules.
  */
  function installPageEnhancements() {
    const isMobileSimulator = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);

    if (isMobileSimulator && !document.getElementById('ptbo-mobile-dispatch-hud-loader')) {
      const script = document.createElement('script');
      script.id = 'ptbo-mobile-dispatch-hud-loader';
      script.src = new URL(`mobile-dispatch-hud-1.5.5.js?v=${VERSION}`, SCRIPT_URL).href;
      script.async = true;
      document.head.appendChild(script);
    }

    installResponseSimulatorSatellite();
  }

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

  installPageEnhancements();
  console.info(`Production build ${LABEL} initialized.`);
})();
