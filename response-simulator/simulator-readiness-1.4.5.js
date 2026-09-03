/* =========================================================
   BEGINNER CODE GUIDE — SIMULATOR READINESS GATE

   PURPOSE:
   This file keeps the simulator's loading screen active until the map,
   steering, road boundaries, compact settings, and mobile camera are ready.

   WHAT THE PLAYER EXPERIENCES:
   The game opens only after essential systems are connected. If something
   fails, the mobile wrapper can show a clear startup error and Refresh button
   instead of allowing a partly working truck onto the map.

   WHY THIS FILE EXISTS:
   Browser files load asynchronously, meaning their completion order can change
   with connection speed and caching. A readiness gate removes that guesswork.

   HOW TO READ THIS FILE:
   - installVersionBadge() handles the small Options version label.
   - injectScript() loads feature modules.
   - waitForValue() waits for a required object or condition.
   - initialize() describes the complete startup order.
   - PTBO_SIMULATOR_READY is the Promise other pages wait for.

   Comments are ignored by the browser and do not change startup timing.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE VERSION:
  This is the overall simulator release being verified. The filename remains
  simulator-readiness-1.4.5.js for compatibility, but its internal release and
  cache identifiers advance with the production build.
  */
  const VERSION = '1.6.0';

  // Reuse an existing Promise if this exact release was already started.
  if (window.PTBO_SIMULATOR_READY_VERSION === VERSION && window.PTBO_SIMULATOR_READY) return;
  window.PTBO_SIMULATOR_READY_VERSION = VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  /*
  MOBILE-WRAPPER DETECTION:
  The dedicated mobile page places the full simulator inside an iframe and owns
  a touch control with id="steering". Access can fail across different web
  origins, so the check safely returns false when the browser blocks it.
  */
  const isMobileWrapper = (() => {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch (_) {
      return false;
    }
  })();

  /*
  FUNCTION: installVersionBadge

  WHAT THE CODE DOES:
  Adds or updates a very small v1.5.3 label at the bottom of the Options panel.

  WHY IT EXISTS:
  Testers can confirm which release actually loaded, which is especially useful
  when a phone still has older files in its cache.

  RETURN VALUE:
  true means the panel existed and the badge was handled; false means the panel
  is not ready yet and setup should try again later.
  */
  function installVersionBadge() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;
    let badge = document.getElementById('ptbo-version-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ptbo-version-badge';
      panel.appendChild(badge);
    }
    badge.textContent = `v${VERSION}`;

    let style = document.getElementById('ptbo-version-148-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-version-148-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #ptbo-version-badge{margin-top:18px!important;color:#9ca3af!important;font-size:8px!important;font-weight:700!important;letter-spacing:.08em!important;text-align:right!important;opacity:.58!important}
      #ptbo-version-badge::after{content:''!important}
    `;
    return true;
  }

  /*
  FUNCTION: injectScript

  WHAT THE CODE DOES:
  Loads one supporting JavaScript file and returns a Promise that settles when
  the browser reports load or error.

  DUPLICATE PROTECTION:
  marker is stored as a custom data attribute. If another caller already added
  that module, this function waits for the same element instead of adding it
  twice.

  CACHE CONTROL:
  ?v=1.5.3 gives the release a distinct URL so the browser asks for the current
  source instead of silently reusing a previous version.
  */
  function injectScript(filename, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[${marker}]`);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') {
          resolve(existing);
          return;
        }
        existing.addEventListener('load', () => resolve(existing), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Unable to load ${filename}.`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      const url = new URL(filename, document.baseURI);
      url.searchParams.set('v', VERSION);
      script.src = url.href;
      script.setAttribute(marker, 'true');
      script.onload = () => {
        script.dataset.ptboLoaded = 'true';
        resolve(script);
      };
      script.onerror = () => reject(new Error(`Unable to load ${filename}.`));
      document.body.appendChild(script);
    });
  }

  /*
  FUNCTION: waitForValue

  WHAT THE CODE DOES:
  Repeatedly calls readValue until it returns something truthy. It checks every
  50 milliseconds and throws a named timeout error if readiness never arrives.

  WHY POLLING IS USED HERE:
  Some older simulator systems expose global variables rather than ready events.
  This small polling helper lets modern startup code wait for them predictably.
  */
  async function waitForValue(readValue, label, timeoutMilliseconds = 20000) {
    const startedAt = performance.now();
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) {
        throw new Error(`${label} did not become ready in time.`);
      }
      await sleep(50);
    }
  }

  /*
  FUNCTION: initialize

  WHAT THE PLAYER EXPERIENCES:
  The loading cover disappears only after this full sequence succeeds.

  STARTUP ORDER:
  1. Attempt to show the release badge.
  2. Wait for the base Leaflet map and simulation loop.
  3. Load steering, road collision, and compact incident settings together.
  4. Wait for steering and road APIs and validate their required capabilities.
  5. Wait for arcade handling and compact-menu installation.
  6. On mobile, also wait for touch steering and the stable camera.
  7. Dispatch a ready event and return a diagnostic summary.

  WHY VALIDATE CAPABILITIES:
  A file can technically load while still failing during setup. Checking methods,
  status, and connected loop references catches that incomplete state.
  */
  async function initialize() {
    installVersionBadge();

    await waitForValue(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof simulationLoop === 'function',
      'Base simulator',
    );

    // These independent modules can download and initialize in parallel.
    await Promise.all([
      injectScript('vehicle-instruments.js', 'data-ptbo-readiness-vehicle'),
      injectScript('road-collision.js', 'data-ptbo-readiness-road'),
      injectScript('settings-menu-compact-1.5.3.js', 'data-ptbo-readiness-compact-settings'),
    ]);

    const instrumentsReady = window.PTBO_VEHICLE_INSTRUMENTS_READY
      || waitForValue(() => window.PTBO_VEHICLE_INSTRUMENTS, 'Vehicle steering system');

    const roadsReady = window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY
      || (async () => {
        const roadApi = await waitForValue(() => window.PTBO_ROAD_COLLISION, 'Road-boundary system');
        await roadApi.ready;
        return roadApi;
      })();

    const [instruments, roads] = await Promise.all([instrumentsReady, roadsReady]);

    if (!instruments?.setAnalogSteering) {
      throw new Error('Vehicle steering API is incomplete.');
    }
    if (roads?.state?.status !== 'ready' || !roads?.state?.originalLoop) {
      throw new Error('Road boundaries are not attached to vehicle movement.');
    }

    await waitForValue(
      () => window.PTBO_ARCADE_HANDLING,
      'Arcade handling system',
      10000,
    );
    await waitForValue(
      () => window.PTBO_COMPACT_SETTINGS?.state?.installed,
      'Compact settings menu',
      10000,
    );

    // Mobile requires two extra connections that desktop does not use.
    if (isMobileWrapper) {
      await waitForValue(
        () => instruments.state?.mobileSteeringConnected,
        'Mobile steering connection',
        10000,
      );
      await waitForValue(
        () => window.PTBO_STABLE_MOBILE_CAMERA?.state?.installed,
        'Stable mobile camera',
        10000,
      );
    }

    // The panel can be rebuilt by other modules, so refresh its badge a few times.
    installVersionBadge();
    [250, 750, 1500].forEach(delay => setTimeout(installVersionBadge, delay));

    /*
    READINESS DETAIL:
    This object is diagnostic information, not gameplay state. It makes startup
    problems easier to inspect in browser tools and automated tests.
    */
    const detail = {
      version: VERSION,
      mobile: isMobileWrapper,
      roadSegments: roads.state.segments.length,
      steeringConnected: Boolean(instruments.state?.mobileSteeringConnected),
      arcadeHandlingCore: window.PTBO_ARCADE_HANDLING?.version || null,
      stableCamera: window.PTBO_STABLE_MOBILE_CAMERA?.version || null,
      compactSettings: window.PTBO_COMPACT_SETTINGS?.version || null,
    };

    window.dispatchEvent(new CustomEvent('ptbo-simulator-ready', { detail }));
    return detail;
  }

  /*
  PUBLIC STARTUP PROMISE:
  The mobile wrapper and tests wait for this Promise. Resolving means the game
  can safely begin; rejecting means startup should show recovery controls.
  */
  const ready = initialize();
  window.PTBO_SIMULATOR_READY = ready;

  ready.catch(error => {
    window.dispatchEvent(new CustomEvent('ptbo-simulator-startup-error', {
      detail: { version: VERSION, error },
    }));
    console.error('Simulator startup verification failed.', error);
  });
})();
