(() => {
  'use strict';

  const VERSION = '1.4.5';
  if (window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY) return;

  window.PTBO_ROAD_COLLISION_BOOTSTRAP = true;
  const sourceUrl = new URL(document.currentScript?.src || document.baseURI, document.baseURI);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function loadScript(filename, version, attempt = 1) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const url = new URL(filename, sourceUrl);
      url.searchParams.set('v', version);
      url.searchParams.set('attempt', String(attempt));
      script.src = url.href;
      script.dataset.ptboBootstrapFile = filename;
      script.onload = () => resolve(script);
      script.onerror = () => {
        script.remove();
        reject(new Error(`Unable to load ${filename}.`));
      };
      document.body.appendChild(script);
    });
  }

  async function waitForApi(timeoutMilliseconds = 5000) {
    const startedAt = performance.now();
    while (!window.PTBO_ROAD_COLLISION) {
      if (performance.now() - startedAt > timeoutMilliseconds) {
        throw new Error('Road-boundary API did not become ready.');
      }
      await sleep(50);
    }
    return window.PTBO_ROAD_COLLISION;
  }

  async function loadCoreWithRetry() {
    if (window.PTBO_ROAD_COLLISION) return window.PTBO_ROAD_COLLISION;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await loadScript('road-collision-core.js', `${VERSION}-core`, attempt);
        return await waitForApi(5000);
      } catch (error) {
        lastError = error;
        await sleep(250 * attempt);
      }
    }
    throw lastError || new Error('Road-boundary system failed to load.');
  }

  const ready = (async () => {
    const api = await loadCoreWithRetry();
    await api.ready;
    if (api.state?.status !== 'ready' || !api.state?.originalLoop) {
      throw new Error('Road boundaries loaded without attaching to vehicle physics.');
    }

    Promise.allSettled([
      loadScript('road-intersection-softener.js', `${VERSION}-intersections`),
      loadScript('dispatch-voice-bridge-1.4.2.js', `${VERSION}-voice`),
      loadScript('route-compare-1.4.2.js', `${VERSION}-route-compare`),
    ]).then(results => {
      results.forEach(result => {
        if (result.status === 'rejected') console.warn(result.reason);
      });
    });

    window.dispatchEvent(new CustomEvent('ptbo-road-collision-bootstrap-ready', {
      detail: { version: VERSION, segmentCount: api.state.segments.length },
    }));
    return api;
  })();

  window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY = ready;
  ready.catch(error => console.error('Road-boundary system could not start.', error));
})();
