/* v1.6.50 production release bootstrap: hard cache-bust + desktop tablet delivery. */
(() => {
  'use strict';

  const VERSION = '1.6.50';
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

    const inject = () => {
      attempts += 1;
      const doc = frame.contentDocument;
      const game = frame.contentWindow;
      if (!doc || !game || !doc.body) return false;
      if (game.PTBO_RESPONSE_TABLET?.version === '1.6.48') return true;
      if (doc.getElementById('ptbo-release-tablet-v1650')) return false;

      const script = doc.createElement('script');
      script.id = 'ptbo-release-tablet-v1650';
      script.src = new URL('../response-tablet-1.6.48.js?v=1.6.50', location.href).href;
      script.dataset.ptboRelease = VERSION;
      script.onload = () => {
        script.dataset.ptboLoaded = 'true';
        syncBuildMarker();
      };
      script.onerror = () => script.remove();
      doc.body.appendChild(script);
      return false;
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
