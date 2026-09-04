/* Simulator readiness gate — protected roads for full-dispatch cities, intentional free-drive for base-training cities. */
(() => {
  'use strict';
  const VERSION = '1.6.12';
  if (window.PTBO_SIMULATOR_READY_VERSION === VERSION && window.PTBO_SIMULATOR_READY) return;
  window.PTBO_SIMULATOR_READY_VERSION = VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const isMobileWrapper = (() => {
    try { return window.parent !== window && Boolean(window.parent.document.getElementById('steering')); }
    catch (_) { return false; }
  })();

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
    style.textContent = '#ptbo-version-badge{margin-top:18px!important;color:#9ca3af!important;font-size:8px!important;font-weight:700!important;letter-spacing:.08em!important;text-align:right!important;opacity:.58!important}';
    return true;
  }

  function injectScript(filename, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[${marker}]`);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') return resolve(existing);
        existing.addEventListener('load', () => resolve(existing), { once:true });
        existing.addEventListener('error', () => reject(new Error(`Unable to load ${filename}.`)), { once:true });
        return;
      }
      const script = document.createElement('script');
      const url = new URL(filename, document.baseURI);
      url.searchParams.set('v', VERSION);
      script.src = url.href;
      script.setAttribute(marker, 'true');
      script.onload = () => { script.dataset.ptboLoaded = 'true'; resolve(script); };
      script.onerror = () => reject(new Error(`Unable to load ${filename}.`));
      document.body.appendChild(script);
    });
  }

  async function waitForValue(readValue, label, timeoutMilliseconds = 20000) {
    const startedAt = performance.now();
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) throw new Error(`${label} did not become ready in time.`);
      await sleep(50);
    }
  }

  function installFreeDriveRoadApi(cityId) {
    if (!window.PTBO_ROAD_COLLISION) {
      const state = { status:'ready', enabled:false, originalLoop:true, segments:[], grid:new Map(), stationExit:null };
      const api = {
        state,
        config:Object.freeze({ cityId, available:false, freeDrive:true }),
        isPointDrivable:() => true,
        resolveMovement:(aLat, aLng, bLat, bLng) => ({ lat:bLat, lng:bLng, blocked:false, snapped:false }),
        snapVehicleToRoad:() => false,
        beginStationExit:() => false,
        nearestRoad:() => null,
      };
      api.ready = Promise.resolve(api);
      window.PTBO_ROAD_COLLISION = Object.freeze(api);
      window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY = Promise.resolve(window.PTBO_ROAD_COLLISION);
    }
    if (!window.PTBO_HARD_ROAD_BOUNDARY) {
      const state = { installed:true, disabled:true, corrections:0, lastCorrectionAt:0 };
      const hard = { version:VERSION, state };
      hard.ready = Promise.resolve(hard);
      window.PTBO_HARD_ROAD_BOUNDARY = Object.freeze(hard);
    }
  }

  async function waitForCityData(city) {
    if (!city?.features?.baseTraining) return city;
    const ready = window.PTBO_CITY_PACKAGE_READY;
    if (ready && typeof ready.then === 'function') await ready;
    if (window.PTBO_CITY_PACKAGE_LOAD_ERROR) throw window.PTBO_CITY_PACKAGE_LOAD_ERROR;
    const fire = window.PTBO_SERVICE_CONFIG?.profiles?.fire?.bases || [];
    const ems = window.PTBO_SERVICE_CONFIG?.profiles?.ems?.bases || [];
    if (!fire.length || !ems.length) throw new Error(`${city.name} Fire/EMS base data did not finish loading.`);
    return city;
  }

  async function waitForAuthoritativeRuntime() {
    const expected = window.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION;
    if (!expected) return null;
    const ready = await waitForValue(
      () => window.PTBO_CITY_RUNTIME_READY_VERSION === expected && window.PTBO_CITY_RUNTIME_READY,
      `City runtime ${expected}`,
      20000,
    );
    const detail = await ready;
    if (window.PTBO_CITY_RUNTIME_ERROR) throw window.PTBO_CITY_RUNTIME_ERROR;
    return detail;
  }

  async function initialize() {
    installVersionBadge();

    // The wrapper installs the current deterministic city bootstrap first.
    // Waiting here prevents older inner-frame files from being accepted as the
    // selected city's runtime on devices with stale simulator files cached.
    await waitForAuthoritativeRuntime();

    const city = await waitForValue(() => window.PTBO_CITY_PACKAGE, 'City package', 10000);
    if (!city.id || !city.map || !city.serviceConfig || !city.roads) throw new Error('The selected city package is incomplete.');
    await waitForCityData(city);

    await waitForValue(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof simulationLoop === 'function',
      'Base simulator',
    );

    const roadRequired = city.features?.roadBoundaries !== false && city.roads?.available !== false;
    document.documentElement.dataset.roadMode = roadRequired ? 'protected' : 'free-drive';

    const requiredScripts = [
      injectScript('vehicle-instruments.js', 'data-ptbo-readiness-vehicle'),
      injectScript('settings-menu-compact-1.5.3.js', 'data-ptbo-readiness-compact-settings'),
    ];
    if (roadRequired) {
      requiredScripts.push(
        injectScript('road-collision.js', 'data-ptbo-readiness-road'),
        injectScript('road-hard-boundary-1.6.6.js', 'data-ptbo-readiness-hard-road-boundary'),
      );
    } else {
      installFreeDriveRoadApi(city.id);
    }
    await Promise.all(requiredScripts);

    const instruments = await (window.PTBO_VEHICLE_INSTRUMENTS_READY
      || waitForValue(() => window.PTBO_VEHICLE_INSTRUMENTS, 'Vehicle steering system'));
    if (!instruments?.setAnalogSteering) throw new Error('Vehicle steering API is incomplete.');

    let roads = window.PTBO_ROAD_COLLISION || null;
    let hardBoundary = window.PTBO_HARD_ROAD_BOUNDARY || null;
    if (roadRequired) {
      roads = await (window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY || (async () => {
        const roadApi = await waitForValue(() => window.PTBO_ROAD_COLLISION, 'Road-boundary system');
        await roadApi.ready;
        return roadApi;
      })());
      hardBoundary = await (async () => {
        const hard = await waitForValue(() => window.PTBO_HARD_ROAD_BOUNDARY, 'Hard road-boundary guard');
        await hard.ready;
        return hard;
      })();
      if (roads?.state?.status !== 'ready' || !roads?.state?.originalLoop) throw new Error('Road boundaries are not attached to vehicle movement.');
      if (!hardBoundary?.state?.installed) throw new Error('Hard road-boundary guard is not attached to vehicle movement.');
      if (roads?.config?.cityId && roads.config.cityId !== city.id) throw new Error(`Road package mismatch: expected ${city.id}, received ${roads.config.cityId}.`);
    }

    await waitForValue(() => window.PTBO_COMPACT_SETTINGS?.state?.installed, 'Compact settings menu', 10000);

    const arcadeHandling = window.PTBO_ARCADE_HANDLING?.version || null;
    const stableCamera = window.PTBO_STABLE_MOBILE_CAMERA?.version || null;

    installVersionBadge();
    [250, 750, 1500].forEach(delay => setTimeout(installVersionBadge, delay));

    const detail = {
      version:VERSION,
      cityId:city.id,
      cityPackageVersion:city.version || null,
      mode:roadRequired ? 'protected-dispatch' : 'base-training-free-drive',
      dispatchAvailable:city.dispatch?.available !== false,
      roadProtection:roadRequired,
      mobile:isMobileWrapper,
      roadSegments:roads?.state?.segments?.length || 0,
      hardRoadBoundary:roadRequired ? Boolean(hardBoundary?.state?.installed) : false,
      steeringConnected:Boolean(instruments?.setAnalogSteering),
      arcadeHandlingCore:arcadeHandling,
      stableCamera,
      compactSettings:window.PTBO_COMPACT_SETTINGS?.version || null,
      cityRuntime:window.PTBO_CITY_RUNTIME_READY_VERSION || null,
    };
    window.dispatchEvent(new CustomEvent('ptbo-simulator-ready', { detail }));
    return detail;
  }

  const ready = initialize();
  window.PTBO_SIMULATOR_READY = ready;
  ready.catch(error => {
    window.dispatchEvent(new CustomEvent('ptbo-simulator-startup-error', { detail:{ version:VERSION, cityId:window.PTBO_CITY_PACKAGE?.id || null, error } }));
    console.error('Simulator startup verification failed.', error);
  });
})();
