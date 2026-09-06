/* Simulator readiness gate — v1.6.17. Core startup uses bounded script loading so a missed load event cannot freeze the simulator. */
(() => {
  'use strict';
  const VERSION = '1.6.17';
  const SCRIPT_TIMEOUT_MS = 15000;
  if (window.PTBO_SIMULATOR_READY_VERSION === VERSION && window.PTBO_SIMULATOR_READY) return;

  window.PTBO_SIMULATOR_READY_VERSION = VERSION;
  window.PTBO_SIMULATOR_READY_ERROR = null;
  document.documentElement.dataset.simulatorReadinessVersion = VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const isMobileWrapper = (() => {
    try { return window.parent !== window && Boolean(window.parent.document.getElementById('steering')); }
    catch (_) { return false; }
  })();

  function stage(name, detail = '') {
    window.PTBO_STARTUP_STAGE = Object.freeze({source:'simulator-readiness',stage:name,detail:String(detail || ''),at:performance.now(),version:VERSION});
    window.dispatchEvent(new CustomEvent('ptbo-startup-stage', {detail:window.PTBO_STARTUP_STAGE}));
  }

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
    let style = document.getElementById('ptbo-version-readiness-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-version-readiness-style';
      document.head.appendChild(style);
    }
    style.textContent = '#ptbo-version-badge{margin-top:18px!important;color:#9ca3af!important;font-size:8px!important;font-weight:700!important;letter-spacing:.08em!important;text-align:right!important;opacity:.58!important}';
    return true;
  }

  function injectScript(filename, marker, timeoutMilliseconds = SCRIPT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = 0;
      const finish = (error, script) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error); else resolve(script);
      };

      const existing = document.querySelector(`script[${marker}]`);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') {
          finish(null, existing);
          return;
        }
        // A stale/unmarked script may have already fired its load event. Never wait on it.
        existing.remove();
      }

      const script = document.createElement('script');
      const url = new URL(filename, document.baseURI);
      url.searchParams.set('v', VERSION);
      script.src = url.href;
      script.setAttribute(marker, 'true');
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

  async function waitForValue(readValue, label, timeoutMilliseconds = 15000) {
    const startedAt = performance.now();
    stage(`waiting-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`, label);
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) throw new Error(`${label} did not become ready in time.`);
      await sleep(50);
    }
  }

  function findLoader(filename) {
    return [...document.scripts].find(script => {
      try { return new URL(script.src).pathname.endsWith(`/${filename}`); }
      catch (_) { return false; }
    });
  }

  async function ensureVehicleInstruments() {
    if (window.PTBO_VEHICLE_INSTRUMENTS) return window.PTBO_VEHICLE_INSTRUMENTS;
    if (window.PTBO_VEHICLE_INSTRUMENTS_READY) {
      try { return await window.PTBO_VEHICLE_INSTRUMENTS_READY; }
      catch (error) {
        findLoader('vehicle-instruments.js')?.remove();
        window.PTBO_VEHICLE_INSTRUMENTS_READY = null;
        window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = false;
        console.warn('The first vehicle-instrument bootstrap failed; retrying once.', error);
      }
    }

    // shared/stations.js normally starts this loader first. Reuse that request
    // instead of issuing a duplicate request with a separate timeout clock.
    const existingLoader = findLoader('vehicle-instruments.js');
    if (existingLoader) {
      try {
        return await waitForValue(
          () => window.PTBO_VEHICLE_INSTRUMENTS_READY || window.PTBO_VEHICLE_INSTRUMENTS,
          'Existing vehicle instrument loader',
          SCRIPT_TIMEOUT_MS,
        );
      } catch (error) {
        existingLoader.remove();
        if (!window.PTBO_VEHICLE_INSTRUMENTS) {
          window.PTBO_VEHICLE_INSTRUMENTS_READY = null;
          window.PTBO_VEHICLE_INSTRUMENTS_BOOTSTRAP = false;
        }
        console.warn('The first vehicle-instrument request stalled; retrying once.', error);
      }
    }

    await injectScript('vehicle-instruments.js', 'data-ptbo-readiness-vehicle', SCRIPT_TIMEOUT_MS);
    return window.PTBO_VEHICLE_INSTRUMENTS_READY || window.PTBO_VEHICLE_INSTRUMENTS;
  }

  async function ensureRoadCollision() {
    let retryRequired = false;
    if (window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY) {
      try { return await window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY; }
      catch (error) {
        findLoader('road-collision.js')?.remove();
        window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY = null;
        window.PTBO_ROAD_COLLISION_BOOTSTRAP = false;
        retryRequired = true;
        console.warn('The first road-boundary bootstrap failed; retrying once.', error);
      }
    }
    if (!retryRequired && window.PTBO_ROAD_COLLISION) return window.PTBO_ROAD_COLLISION;

    // The dispatch store may already be loading this bootstrap. Reusing it also
    // lets that single bootstrap own the hard-boundary module it loads next.
    const existingLoader = findLoader('road-collision.js');
    if (existingLoader) {
      try {
        return await waitForValue(
          () => window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY || window.PTBO_ROAD_COLLISION,
          'Existing road-boundary loader',
          SCRIPT_TIMEOUT_MS,
        );
      } catch (error) {
        existingLoader.remove();
        if (!window.PTBO_ROAD_COLLISION) {
          window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY = null;
          window.PTBO_ROAD_COLLISION_BOOTSTRAP = false;
        }
        console.warn('The first road-boundary request stalled; retrying once.', error);
      }
    }

    await injectScript('road-collision.js', 'data-ptbo-readiness-road', SCRIPT_TIMEOUT_MS);
    return window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY || window.PTBO_ROAD_COLLISION;
  }

  function installFreeDriveRoadApi(cityId) {
    stage('installing-free-drive-road-api', cityId);
    if (!window.PTBO_ROAD_COLLISION) {
      const state = {status:'ready',enabled:false,originalLoop:true,segments:[],grid:new Map(),stationExit:null};
      const api = {
        state,
        config:Object.freeze({cityId,available:false,freeDrive:true}),
        isPointDrivable:() => true,
        resolveMovement:(aLat,aLng,bLat,bLng) => ({lat:bLat,lng:bLng,blocked:false,snapped:false}),
        snapVehicleToRoad:() => false,
        beginStationExit:() => false,
        nearestRoad:() => null,
      };
      api.ready = Promise.resolve(api);
      window.PTBO_ROAD_COLLISION = Object.freeze(api);
      window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY = Promise.resolve(window.PTBO_ROAD_COLLISION);
    }
    if (!window.PTBO_HARD_ROAD_BOUNDARY) {
      const state = {installed:true,disabled:true,corrections:0,lastCorrectionAt:0};
      const hard = {version:VERSION,state};
      hard.ready = Promise.resolve(hard);
      window.PTBO_HARD_ROAD_BOUNDARY = Object.freeze(hard);
    }
  }

  async function waitForCityData(city) {
    if (!city?.features?.baseTraining && city?.dispatch?.available !== false) return city;
    stage('waiting-city-base-data', city.name || city.id);
    if (window.PTBO_CITY_PACKAGE_READY?.then) await window.PTBO_CITY_PACKAGE_READY;
    if (window.PTBO_CITY_PACKAGE_LOAD_ERROR) throw window.PTBO_CITY_PACKAGE_LOAD_ERROR;
    window.PTBO_BASE_STORE?.refreshFromCityPackage?.();
    const fire = window.PTBO_BASE_STORE?.getBases?.('fire') || window.PTBO_SERVICE_CONFIG?.profiles?.fire?.bases || [];
    const ems = window.PTBO_BASE_STORE?.getBases?.('ems') || window.PTBO_SERVICE_CONFIG?.profiles?.ems?.bases || [];
    if (!fire.length || !ems.length) throw new Error(`${city.name} Fire/EMS base data did not finish loading.`);
    return city;
  }

  async function waitForAuthoritativeRuntime() {
    const expected = window.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION;
    if (!expected) return null;
    stage('waiting-authoritative-city-runtime', `expected v${expected}`);
    const ready = await waitForValue(
      () => window.PTBO_CITY_RUNTIME_READY_VERSION === expected && window.PTBO_CITY_RUNTIME_READY,
      `City runtime ${expected}`,
      15000,
    );
    const detail = await ready;
    if (window.PTBO_CITY_RUNTIME_ERROR) throw window.PTBO_CITY_RUNTIME_ERROR;
    return detail;
  }

  async function initialize() {
    stage('starting', isMobileWrapper ? 'mobile wrapper' : 'desktop wrapper');
    installVersionBadge();

    await waitForAuthoritativeRuntime();

    const city = await waitForValue(() => window.PTBO_CITY_PACKAGE, 'City package', 10000);
    stage('validating-city-package', city.id || 'unknown');
    if (!city.id || !city.map || !city.serviceConfig || !city.roads) throw new Error('The selected city package is incomplete.');
    await waitForCityData(city);

    stage('waiting-base-simulator', 'mapInstance + simulationLoop');
    await waitForValue(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof simulationLoop === 'function',
      'Base simulator',
      15000,
    );

    const roadRequired = city.features?.roadBoundaries !== false && city.roads?.available !== false;
    document.documentElement.dataset.roadMode = roadRequired ? 'protected' : 'free-drive';

    stage('loading-required-modules', roadRequired ? 'vehicle + settings + protected roads' : 'vehicle + settings + free-drive roads');
    const requiredScripts = [
      ensureVehicleInstruments(),
      injectScript('settings-menu-compact-1.5.3.js', 'data-ptbo-readiness-compact-settings'),
    ];
    if (roadRequired) {
      requiredScripts.push(ensureRoadCollision());
    } else {
      installFreeDriveRoadApi(city.id);
    }
    await Promise.all(requiredScripts);

    stage('waiting-vehicle-steering', 'PTBO_VEHICLE_INSTRUMENTS_READY');
    const instruments = await (window.PTBO_VEHICLE_INSTRUMENTS_READY
      || waitForValue(() => window.PTBO_VEHICLE_INSTRUMENTS, 'Vehicle steering system', 10000));
    if (!instruments?.setAnalogSteering) throw new Error('Vehicle steering API is incomplete.');

    let roads = window.PTBO_ROAD_COLLISION || null;
    let hardBoundary = window.PTBO_HARD_ROAD_BOUNDARY || null;
    if (roadRequired) {
      stage('waiting-road-boundaries', city.id);
      roads = await (window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY || (async () => {
        const roadApi = await waitForValue(() => window.PTBO_ROAD_COLLISION, 'Road-boundary system', 10000);
        await roadApi.ready;
        return roadApi;
      })());
      stage('waiting-hard-road-boundary', city.id);
      hardBoundary = await (async () => {
        const hard = await waitForValue(() => window.PTBO_HARD_ROAD_BOUNDARY, 'Hard road-boundary guard', 10000);
        await hard.ready;
        return hard;
      })();
      if (roads?.state?.status !== 'ready' || !roads?.state?.originalLoop) throw new Error('Road boundaries are not attached to vehicle movement.');
      if (!hardBoundary?.state?.installed) throw new Error('Hard road-boundary guard is not attached to vehicle movement.');
      if (roads?.config?.cityId && roads.config.cityId !== city.id) throw new Error(`Road package mismatch: expected ${city.id}, received ${roads.config.cityId}.`);
    }

    stage('waiting-compact-settings', 'PTBO_COMPACT_SETTINGS.state.installed');
    await waitForValue(() => window.PTBO_COMPACT_SETTINGS?.state?.installed, 'Compact settings menu', 10000);

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
      arcadeHandlingCore:window.PTBO_ARCADE_HANDLING?.version || null,
      stableCamera:window.PTBO_STABLE_MOBILE_CAMERA?.version || null,
      compactSettings:window.PTBO_COMPACT_SETTINGS?.version || null,
      cityRuntime:window.PTBO_CITY_RUNTIME_READY_VERSION || null,
    };

    installVersionBadge();
    [250,750,1500].forEach(delay => setTimeout(installVersionBadge, delay));
    stage('ready', `${city.name || city.id}; ${detail.mode}`);
    window.dispatchEvent(new CustomEvent('ptbo-simulator-ready', {detail}));
    return detail;
  }

  const ready = initialize();
  window.PTBO_SIMULATOR_READY = ready;
  ready.catch(error => {
    window.PTBO_SIMULATOR_READY_ERROR = error;
    stage('error', error?.message || String(error));
    window.dispatchEvent(new CustomEvent('ptbo-simulator-startup-error', {detail:{version:VERSION,cityId:window.PTBO_CITY_PACKAGE?.id || null,error}}));
    console.error('Simulator startup verification failed.', error);
  });
})();
