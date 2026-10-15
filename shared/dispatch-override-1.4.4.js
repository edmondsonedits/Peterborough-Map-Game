(() => {
  'use strict';

  const VERSION = '1.6.108';
  const ANALYTICS_VERSION = '1.4.20';
  const baseStore = window.PTBO_DISPATCH_STORE;
  const dataReady = window.PTBO_DISPATCH_DATA_READY;
  const currentScriptUrl = document.currentScript?.src || window.location.href;

  function loadCloudflareAnalytics() {
    if (window.top !== window.self || document.querySelector('script[data-ptbo-cloudflare-analytics]')) return;
    const analytics = document.createElement('script');
    analytics.defer = true;
    analytics.src = new URL(`./cloudflare-web-analytics.js?v=${ANALYTICS_VERSION}`, currentScriptUrl).href;
    analytics.dataset.ptboCloudflareAnalytics = ANALYTICS_VERSION;
    document.head.appendChild(analytics);
  }

  loadCloudflareAnalytics();

  if (!baseStore || !dataReady) {
    console.error('The v1.4.20 dispatch data could not initialize.');
    return;
  }

  const readyPromise = baseStore.ready();
  // The shared store owns migration and metadata. Never replace it with a second API.
  function patchGeoGuesser(frame) {
    const doc = frame?.contentDocument;
    if (frame?.contentWindow?.PTBO_GEO_READY) return;
    if (!doc || doc.documentElement.dataset.dispatchDataVersion === VERSION) return;
    doc.documentElement.dataset.dispatchDataVersion = VERSION;

    readyPromise.then(() => {
      const shared = window.PTBO_DISPATCH_STORE
        .getAll();

      const helper = doc.createElement('script');
      helper.textContent = `(() => {
        const shared = ${JSON.stringify(shared).replace(/</g,'\\u003c')};
        if (typeof locations !== 'undefined' && Array.isArray(locations)) {
          locations.splice(0, locations.length, ...shared.map(location => ({ ...location })));
          if (typeof initializeDistricts === 'function') initializeDistricts();
          window.dispatchEvent(new CustomEvent('ptbo-shared-dispatch-refresh', { detail: { count: locations.length, version: '${VERSION}' } }));
        }
      })();`;
      doc.body.appendChild(helper);
    }).catch(error => console.error('Unable to apply v1.4.20 dispatch data to Geo Guesser.', error));
  }

  const frame = document.getElementById('game-frame');
  if (frame) {
    if (frame.contentDocument?.readyState === 'complete') patchGeoGuesser(frame);
    frame.addEventListener('load', () => patchGeoGuesser(frame));
  }
})();
