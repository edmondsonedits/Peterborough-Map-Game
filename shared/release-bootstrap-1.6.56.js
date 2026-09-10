/* v1.6.56 production release bootstrap: preserve response tablet fixes while publishing the dispatch editor base-area fix. */
(() => {
  'use strict';

  const VERSION = '1.6.56';
  if (window.PTBO_RELEASE?.version === VERSION) return;

  const release = Object.freeze({
    version: VERSION,
    label: `v${VERSION}`,
    channel: 'production',
  });
  window.PTBO_RELEASE = release;
  document.documentElement.dataset.ptboRelease = VERSION;

  function syncBuildMarker() {
    const badge = document.getElementById('ptbo-build-badge');
    if (badge) {
      badge.textContent = release.label;
      badge.setAttribute('aria-label', `Production version ${VERSION}`);
    }
    document.documentElement.dataset.ptboRelease = VERSION;

    const current = window.PTBO_BUILD;
    if (current && current.version !== VERSION) {
      try {
        Object.defineProperty(window, 'PTBO_BUILD', {
          configurable: true,
          writable: true,
          value: Object.freeze({
            ...current,
            baseBuildVersion: current.version,
            version: VERSION,
            label: release.label,
          }),
        });
      } catch (_) {}
    }
  }

  [0, 50, 250, 750, 1500, 3000].forEach(delay => setTimeout(syncBuildMarker, delay));
  addEventListener('pageshow', syncBuildMarker);

  function installDesktopTabletBridge() {
    if (!/\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname)) return;
    const frame = document.getElementById('simulator');
    if (!frame) return;

    let attempts = 0;
    let timer = 0;

    const ensureScript = (doc, id, src) => {
      if (doc.getElementById(id)) return;
      const script = doc.createElement('script');
      script.id = id;
      script.src = src;
      script.dataset.ptboRelease = VERSION;
      script.onload = () => {
        script.dataset.ptboLoaded = 'true';
        syncBuildMarker();
      };
      script.onerror = () => script.remove();
      doc.body.appendChild(script);
    };

    const inject = () => {
      attempts += 1;
      const doc = frame.contentDocument;
      const game = frame.contentWindow;
      if (!doc || !game || !doc.body) return false;

      if (game.PTBO_RESPONSE_TABLET?.version !== '1.6.48') {
        ensureScript(
          doc,
          'ptbo-release-tablet-v1655',
          new URL('../response-tablet-1.6.48.js?v=1.6.56', location.href).href
        );
      }

      if (game.PTBO_TABLET_CLOSE_DISPATCH?.version !== '1.6.53') {
        ensureScript(
          doc,
          'ptbo-tablet-close-dispatch-v1655',
          new URL('../tablet-close-dispatch-1.6.53.js?v=1.6.56', location.href).href
        );
      }

      if (game.PTBO_TABLET_BUTTON_STABILITY?.version !== '1.6.54') {
        ensureScript(
          doc,
          'ptbo-tablet-button-stability-v1655',
          new URL('../tablet-button-stability-1.6.54.js?v=1.6.56', location.href).href
        );
      }

      return game.PTBO_RESPONSE_TABLET?.version === '1.6.48'
        && game.PTBO_TABLET_CLOSE_DISPATCH?.version === '1.6.53'
        && game.PTBO_TABLET_BUTTON_STABILITY?.version === '1.6.54';
    };

    const startPolling = () => {
      clearInterval(timer);
      attempts = 0;
      inject();
      timer = setInterval(() => {
        if (inject() || attempts >= 60) clearInterval(timer);
      }, 250);
    };

    frame.addEventListener('load', startPolling);
    if (frame.contentDocument?.readyState === 'complete') startPolling();
    addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }

  installDesktopTabletBridge();
  syncBuildMarker();
})();
