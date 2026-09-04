/* =========================================================
   BEGINNER CODE GUIDE — VEHICLE CONTROL STARTUP LOADER

   PURPOSE:
   This small file does not steer the truck itself. It loads the files that do
   the steering work, waits until their public APIs exist, and reports whether
   startup succeeded.

   WHAT THE PLAYER EXPERIENCES:
   Keyboard or touch steering becomes available reliably, even on a slower
   first page load. Optional systems can fail without removing basic steering.

   HOW TO READ THIS FILE:
   - loadScript() adds another JavaScript file to the page.
   - waitForApi() waits until that file creates its shared control object.
   - loadCoreWithRetry() retries the essential steering core.
   - ready is a Promise representing the entire startup sequence.

   TECHNICAL TERM — BOOTSTRAP:
   A bootstrap is a small starter that prepares and connects larger systems.
   Comments are ignored by the browser and do not alter the game.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.6.21';
  const SCRIPT_TIMEOUT_MS = 6000;

  if (window.PTBO_VEHICLE_INSTRUMENTS_READY) return;
  window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = true;

  const sourceUrl = new URL(document.currentScript?.src || document.baseURI, document.baseURI);
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  /* Load one nested steering/camera module with a hard timeout. A browser that
     never emits load/error must not be able to hold the simulator forever. */
  function loadScript(filename, version, attempt, timeoutMilliseconds = SCRIPT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const finish = (error, script) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(script);
      };

      document.querySelectorAll(`script[data-ptbo-bootstrap-file="${filename}"]`).forEach(existing => {
        if (existing.dataset.ptboLoaded !== 'true') existing.remove();
      });

      const script = document.createElement('script');
      const url = new URL(filename, sourceUrl);
      url.searchParams.set('v', version);
      url.searchParams.set('attempt', String(attempt));
      script.src = url.href;
      script.dataset.ptboBootstrapFile = filename;
      script.dataset.ptboLoading = 'true';
      script.onload = () => {
        script.dataset.ptboLoading = 'false';
        script.dataset.ptboLoaded = 'true';
        finish(null, script);
      };
      script.onerror = () => {
        script.remove();
        finish(new Error(`Unable to load ${filename}.`));
      };
      timer = setTimeout(() => {
        script.remove();
        finish(new Error(`Timed out loading ${filename} after ${timeoutMilliseconds} ms.`));
      }, timeoutMilliseconds);
      (document.body || document.head || document.documentElement).appendChild(script);
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
      await loadScript('arcade-handling-1.5.1.js', `${VERSION}-arcade-core`, 1);
      await loadScript('arcade-mobile-camera-1.5.3.js', `${VERSION}-stable-camera`, 1);
    } catch (error) {
      console.warn('Arcade handling or stable camera controls did not load; base steering remains available.', error);
    }

    window.dispatchEvent(new CustomEvent('ptbo-vehicle-instruments-ready', {
      detail: { version: VERSION, mobileConnected: Boolean(api.state?.mobileSteeringConnected) },
    }));
    return api;
  })();

  window.PTBO_VEHICLE_INSTRUMENTS_READY = ready;
  ready.catch(error => console.error('Vehicle steering system could not start.', error));
})();
