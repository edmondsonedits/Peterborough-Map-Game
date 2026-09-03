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
   - waitForApi() waits for that file to create its shared control object.
   - loadCoreWithRetry() retries the essential steering core.
   - ready is a Promise representing the entire startup sequence.

   TECHNICAL TERM — BOOTSTRAP:
   A bootstrap is a small starter that prepares and connects larger systems.
   Comments are ignored by the browser and do not alter the game.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE VERSION:
  Added to script URLs as a cache value so v1.5.3 files are requested instead
  of an older browser copy. It is also included in the ready event.
  */
  const VERSION = '1.5.10';

  // A page needs only one startup Promise. A second copy exits immediately.
  if (window.PTBO_VEHICLE_INSTRUMENTS_READY) return;

  // Other startup code can see that the control bootstrap has begun.
  window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = true;

  // document.currentScript is this file; its folder becomes the base for modules.
  const sourceUrl = new URL(document.currentScript?.src || document.baseURI, document.baseURI);

  // Converts a timeout into a Promise so async functions can pause cleanly.
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  /*
  FUNCTION: loadScript

  WHAT THE CODE DOES:
  Creates a <script> element, builds a URL relative to this loader, adds version
  and attempt values, and resolves when the browser finishes loading it.

  WHY IT EXISTS:
  The simulator is divided into smaller modules. Loading them here keeps the
  base HTML simpler and allows optional systems to fail independently.

  PARAMETERS:
  filename = module to load.
  version = cache identifier placed in the URL.
  attempt = retry number, which also creates a fresh URL after a failure.
  */
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

  /*
  FUNCTION: waitForApi

  WHAT THE CODE DOES:
  Checks every 50 milliseconds for PTBO_VEHICLE_INSTRUMENTS, the shared object
  created by vehicle-instruments-core.js. It stops with an error after 5 seconds.

  WHY IT EXISTS:
  A script's network download can finish before all asynchronous setup is ready.
  The timeout prevents the loading screen from waiting forever on a broken file.
  */
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

  /*
  FUNCTION: loadCoreWithRetry

  WHAT THE CODE DOES:
  Loads the essential steering core up to three times. The wait becomes slightly
  longer after each failure, a simple technique called retry backoff.

  WHY THE CORE IS DIFFERENT:
  Basic steering is required for play, so a failure is retried and ultimately
  rejected. Directional steering, arcade tuning, and camera improvements below
  are optional enhancements and instead fall back gracefully.
  */
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

  /*
  COMPLETE STARTUP SEQUENCE:
  The immediately started async function below becomes a Promise named ready.
  Other files can await that one Promise instead of knowing every module detail.
  */
  const ready = (async () => {
    const api = await loadCoreWithRetry();

    // Optional: lets the mobile thumbstick point toward a desired heading.
    try {
      await loadScript('directional-steering-tuning.js', `${VERSION}-tuning`, 1);
    } catch (error) {
      console.warn('Directional steering tuning did not load; standard steering remains available.', error);
    }

    // Optional: arcade handling changes vehicle feel; the v1.5.3 camera controls
    // stable mobile zoom. Basic controls remain usable if either enhancement fails.
    try {
      await loadScript('arcade-handling-1.5.1.js', `${VERSION}-arcade-core`, 1);
      await loadScript('arcade-mobile-camera-1.5.3.js', `${VERSION}-stable-camera`, 1);
    } catch (error) {
      console.warn('Arcade handling or stable camera controls did not load; base steering remains available.', error);
    }

    // Announce readiness without tightly coupling listeners to this file.
    window.dispatchEvent(new CustomEvent('ptbo-vehicle-instruments-ready', {
      detail: { version: VERSION, mobileConnected: Boolean(api.state?.mobileSteeringConnected) },
    }));
    return api;
  })();

  // Public Promise used by simulator-readiness to hold the loading screen.
  window.PTBO_VEHICLE_INSTRUMENTS_READY = ready;

  // Errors are logged once here so a startup problem is visible during debugging.
  ready.catch(error => console.error('Vehicle steering system could not start.', error));
})();
