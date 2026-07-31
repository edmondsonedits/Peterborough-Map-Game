(() => {
  'use strict';

  const VERSION = '1.5.1';
  if (window.PTBO_VEHICLE_INSTRUMENTS_READY) return;

  window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = true;
  const sourceUrl = new URL(document.currentScript?.src || document.baseURI, document.baseURI);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function loadScript(filename, version, attempt) {
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
    while (!window.PTBO_VEHICLE_INSTRUMENTS) {
      if (performance.now() - startedAt > timeoutMilliseconds) {
        throw new Error('Vehicle steering API did not become ready.');
      }
      await sleep(50);
    }
    return window.PTBO_VEHICLE_INSTRUMENTS;
  }

  async function loadCoreWithRetry() {
    if (window.PTBO_VEHICLE_INSTRUMENTS) return window.PTBO_VEHICLE_INSTRUMENTS;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await loadScript('vehicle-instruments-core.js', `${VERSION}-core`, attempt);
        return await waitForApi(5000);
      } catch (error) {
        lastError = error;
        await sleep(200 * attempt);
      }
    }
    throw lastError || new Error('Vehicle steering system failed to load.');
  }

  const ready = (async () => {
    const api = await loadCoreWithRetry();
    try {
      await loadScript('directional-steering-tuning.js', `${VERSION}-tuning`, 1);
    } catch (error) {
      console.warn('Directional steering tuning did not load; standard steering remains available.', error);
    }
    try {
      await loadScript('arcade-handling-1.5.1.js', `${VERSION}-arcade`, 1);
      await loadScript('arcade-camera-smoother-1.5.1.js', `${VERSION}-camera`, 1);
    } catch (error) {
      console.warn('Arcade handling controls did not load; base steering remains available.', error);
    }
    window.dispatchEvent(new CustomEvent('ptbo-vehicle-instruments-ready', {
      detail: { version: VERSION, mobileConnected: Boolean(api.state?.mobileSteeringConnected) },
    }));
    return api;
  })();

  window.PTBO_VEHICLE_INSTRUMENTS_READY = ready;
  ready.catch(error => console.error('Vehicle steering system could not start.', error));
})();
