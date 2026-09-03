/* Shared production build marker and response-simulator enhancement loader. */
(() => {
  'use strict';

  const VERSION = '1.6.4';
  const LABEL = `v${VERSION}`;
  const SCRIPT_URL = document.currentScript?.src || new URL('shared/build-version.js', location.href).href;

  if (window.PTBO_BUILD?.version === VERSION) return;

  window.PTBO_BUILD = Object.freeze({
    version: VERSION,
    label: LABEL,
    channel: 'production',
  });

  window.PTBO_BUILD_ERRORS = window.PTBO_BUILD_ERRORS || [];
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'production';

  if (!document.documentElement.dataset.ptboBuildErrorListeners) {
    document.documentElement.dataset.ptboBuildErrorListeners = 'true';
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
  }

  function installBadge() {
    let style = document.getElementById('ptbo-build-style');
    if (!style) {
      style = document.createElement('style');
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
      document.head.appendChild(style);
    }

    let badge = document.getElementById('ptbo-build-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ptbo-build-badge';
      badge.setAttribute('role', 'status');
      document.body.appendChild(badge);
    }
    badge.setAttribute('aria-label', `Production version ${VERSION}`);
    badge.textContent = LABEL;
  }

  function injectIntoFrame(doc, id, relativeUrl) {
    const existing = doc.getElementById(id);
    if (existing) return existing;
    const script = doc.createElement('script');
    script.id = id;
    script.src = new URL(relativeUrl, SCRIPT_URL).href;
    (doc.body || doc.documentElement).appendChild(script);
    return script;
  }

  function injectPageScript(id, relativeUrl) {
    return new Promise((resolve, reject) => {
      const existing = document.getElementById(id);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') return resolve(existing);
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', () => reject(new Error(`Unable to load ${relativeUrl}.`)), { once:true });
        return;
      }
      const script = document.createElement('script');
      script.id = id;
      script.src = new URL(relativeUrl, SCRIPT_URL).href;
      script.onload = () => { script.dataset.ptboLoaded = 'true'; resolve(script); };
      script.onerror = () => reject(new Error(`Unable to load ${relativeUrl}.`));
      document.head.appendChild(script);
    });
  }

  function installCitySelector() {
    if (!document.getElementById('dispatch-game-link')) return;
    injectPageScript('ptbo-city-registry-loader', `../cities/city-registry.js?v=${VERSION}`)
      .then(() => injectPageScript('ptbo-city-selector-loader', `city-selector.js?v=${VERSION}`))
      .catch(error => console.error('City selector failed to initialize.', error));
  }

  function installResponseEnhancements() {
    const isDesktop = /\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname);
    const isMobile = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if (!isDesktop && !isMobile) return;

    const frame = document.getElementById('simulator');
    if (!frame || frame.dataset.ptboEnhancementLoader === VERSION) return;
    frame.dataset.ptboEnhancementLoader = VERSION;

    let cover = null;
    let coverStyle = null;
    let completed = false;

    const finishSatelliteCover = () => {
      if (completed) return;
      completed = true;
      if (!cover) return;
      cover.classList.add('hidden');
      setTimeout(() => {
        cover?.remove();
        coverStyle?.remove();
      }, 240);
    };

    const installCover = () => {
      if (document.getElementById('ptbo-satellite-startup-cover')) return;
      coverStyle = document.createElement('style');
      coverStyle.id = 'ptbo-satellite-startup-style';
      coverStyle.textContent = `
        #ptbo-satellite-startup-cover{
          position:fixed;inset:0;z-index:5950;display:grid;place-items:center;padding:24px;
          color:#f8fafc;background:#111827;text-align:center;transition:opacity .2s ease;
          font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
        }
        #ptbo-satellite-startup-cover.hidden{opacity:0;pointer-events:none}
        #ptbo-satellite-startup-cover strong{display:block;font-size:1.15rem}
        #ptbo-satellite-startup-cover span{display:block;margin-top:7px;color:#cbd5e1;font-size:.9rem;line-height:1.45}
      `;
      cover = document.createElement('div');
      cover.id = 'ptbo-satellite-startup-cover';
      cover.innerHTML = '<div><strong>Loading satellite map</strong><span>Preparing Esri imagery, north-up camera, gear driving, and mobile layout…</span></div>';
      document.head.appendChild(coverStyle);
      document.body.appendChild(cover);
    };

    installCover();

    const installInsideFrame = () => {
      const doc = frame.contentDocument;
      const game = frame.contentWindow;
      if (!doc || !game) {
        finishSatelliteCover();
        return;
      }

      if (isMobile) {
        injectIntoFrame(
          doc,
          'ptbo-directional-drive-zoom-loader',
          `../response-simulator/directional-drive-zoom-1.5.8.js?v=${VERSION}`,
        );
        injectIntoFrame(
          doc,
          'ptbo-mobile-ui-layout-loader',
          `../response-simulator/mobile-ui-layout-1.5.9.js?v=${VERSION}`,
        );
      }

      let satellite = doc.getElementById('ptbo-satellite-map-loader');
      if (!satellite) {
        satellite = injectIntoFrame(
          doc,
          'ptbo-satellite-map-loader',
          `../response-simulator/satellite-map-1.5.6.js?v=${VERSION}`,
        );
      }

      const finishWhenReady = () => {
        Promise.resolve(game.PTBO_SATELLITE_MAP_READY).then(
          finishSatelliteCover,
          finishSatelliteCover,
        );
      };

      if (game.PTBO_SATELLITE_MAP_READY) finishWhenReady();
      else {
        satellite.addEventListener('load', finishWhenReady, { once: true });
        satellite.addEventListener('error', finishSatelliteCover, { once: true });
      }
    };

    frame.addEventListener('load', installInsideFrame);
    if (frame.contentDocument?.readyState === 'complete') installInsideFrame();
    setTimeout(finishSatelliteCover, 12000);
  }

  function installPageEnhancements() {
    const isMobile = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if (isMobile && !document.getElementById('ptbo-mobile-dispatch-hud-loader')) {
      const script = document.createElement('script');
      script.id = 'ptbo-mobile-dispatch-hud-loader';
      script.src = new URL(`mobile-dispatch-hud-1.5.5.js?v=${VERSION}`, SCRIPT_URL).href;
      script.async = true;
      document.head.appendChild(script);
    }
    installCitySelector();
    installResponseEnhancements();
  }

  function install() {
    installBadge();
    installPageEnhancements();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }

  console.info(`Production build ${LABEL} initialized.`);
})();