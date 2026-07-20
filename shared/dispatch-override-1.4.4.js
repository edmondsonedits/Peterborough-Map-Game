(() => {
  'use strict';

  const VERSION = '1.4.20';
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

  const readyPromise = Promise.all([baseStore.ready(), dataReady]).then(([, locations]) => {
    if (baseStore.dataVersion !== VERSION) {
      baseStore.replaceAll(locations.map(location => ({
        ...location,
        sources: [...(location.sources || [])]
      })));
    }
    console.info(`Dispatch database v${VERSION} loaded: ${baseStore.getAll().length} calls.`);
    return baseStore.getAll();
  });

  window.PTBO_DISPATCH_STORE = Object.freeze({
    ready: () => readyPromise,
    getAll: baseStore.getAll.bind(baseStore),
    replaceAll: baseStore.replaceAll.bind(baseStore),
    upsert: baseStore.upsert.bind(baseStore),
    remove: baseStore.remove.bind(baseStore),
    createId: baseStore.createId.bind(baseStore),
    reset: baseStore.reset.bind(baseStore),
    exportText: baseStore.exportText.bind(baseStore),
    storageKey: baseStore.storageKey,
    dataVersion: VERSION
  });

  function patchGeoGuesser(frame) {
    const doc = frame?.contentDocument;
    if (!doc || doc.documentElement.dataset.dispatchDataVersion === VERSION) return;
    doc.documentElement.dataset.dispatchDataVersion = VERSION;

    readyPromise.then(() => {
      const shared = window.PTBO_DISPATCH_STORE
        .getAll()
        .filter(location => (location.sources || []).includes('geo-guesser'));

      const helper = doc.createElement('script');
      helper.textContent = `(() => {
        const shared = ${JSON.stringify(shared)};
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
