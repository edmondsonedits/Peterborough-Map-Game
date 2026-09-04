/* Single-path city runtime verifier — v1.6.16.
   service-config.js remains the only city-package loader. This verifier publishes
   its current startup stage so the loading-screen trace can show where startup stops. */
(() => {
  'use strict';
  const VERSION = '1.6.16';
  if (window.PTBO_CITY_RUNTIME_READY_VERSION === VERSION && window.PTBO_CITY_RUNTIME_READY) return;

  window.PTBO_CITY_RUNTIME_READY_VERSION = VERSION;
  window.PTBO_CITY_RUNTIME_ERROR = null;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function stage(name, detail = '') {
    window.PTBO_STARTUP_STAGE = Object.freeze({source:'city-runtime',stage:name,detail:String(detail || ''),at:performance.now(),version:VERSION});
    window.dispatchEvent(new CustomEvent('ptbo-startup-stage', {detail:window.PTBO_STARTUP_STAGE}));
  }

  function requestedCityId() {
    const params = new URLSearchParams(location.search);
    let stored = null;
    try { stored = localStorage.getItem('ptboSelectedCity'); } catch (_) {}
    const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
    return /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';
  }

  async function waitForValue(readValue, label, timeoutMilliseconds = 10000) {
    const startedAt = performance.now();
    stage(`waiting-${label.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`, label);
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) throw new Error(`${label} did not become ready in time.`);
      await sleep(40);
    }
  }

  function ensureResponseBasesFitMap(city, bases) {
    stage('checking-map-bounds', `${bases.length} response bases`);
    const sourceBounds = city?.map?.bounds;
    if (!Array.isArray(sourceBounds) || sourceBounds.length !== 2) return false;
    let south = Number(sourceBounds[0]?.[0]);
    let west = Number(sourceBounds[0]?.[1]);
    let north = Number(sourceBounds[1]?.[0]);
    let east = Number(sourceBounds[1]?.[1]);
    if (![south, west, north, east].every(Number.isFinite)) return false;

    const margin = 0.005;
    let expanded = false;
    for (const base of bases) {
      const lat = Number(base?.lat), lng = Number(base?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < south) { south = lat - margin; expanded = true; }
      if (lat > north) { north = lat + margin; expanded = true; }
      if (lng < west) { west = lng - margin; expanded = true; }
      if (lng > east) { east = lng + margin; expanded = true; }
    }
    if (!expanded) return false;

    try {
      if (typeof mapInstance !== 'undefined' && mapInstance && typeof L !== 'undefined' && L.latLngBounds) {
        mapInstance.setMaxBounds(L.latLngBounds([south, west], [north, east]));
      }
      document.documentElement.dataset.baseBoundsExpanded = 'true';
      return true;
    } catch (error) {
      console.warn(`Unable to expand ${city.name} map bounds for configured response bases.`, error);
      return false;
    }
  }

  async function boot() {
    const cityId = requestedCityId();
    stage('starting', `requested city=${cityId}`);
    window.PTBO_REQUESTED_CITY = cityId;
    document.documentElement.dataset.requestedCity = cityId;
    document.documentElement.dataset.cityRuntimeVersion = VERSION;
    document.documentElement.dataset.cityRuntimeReady = 'false';

    await waitForValue(() => window.PTBO_CITY_PACKAGE, 'City package');
    stage('waiting-city-package-promise', cityId);
    if (window.PTBO_CITY_PACKAGE_READY?.then) await window.PTBO_CITY_PACKAGE_READY;
    if (window.PTBO_CITY_PACKAGE_LOAD_ERROR) throw window.PTBO_CITY_PACKAGE_LOAD_ERROR;

    const activeCity = window.PTBO_CITY_PACKAGE;
    stage('validating-city-package', activeCity?.id || 'none');
    if (!activeCity || activeCity.id !== cityId) throw new Error(`City package mismatch: requested ${cityId}, loaded ${activeCity?.id || 'none'}.`);

    const config = window.PTBO_SERVICE_CONFIG;
    stage('validating-service-config', activeCity.name);
    if (!config?.profiles?.fire || !config?.profiles?.ems) throw new Error(`${activeCity.name} Fire/EMS service data did not initialize.`);

    const baseStore = await waitForValue(() => window.PTBO_BASE_STORE, 'Base store');
    stage('refreshing-base-store', activeCity.name);
    baseStore.refreshFromCityPackage?.();

    const fire = baseStore.getBases?.('fire') || config.profiles.fire.bases || [];
    const ems = baseStore.getBases?.('ems') || config.profiles.ems.bases || [];
    stage('validating-response-bases', `${fire.length} fire / ${ems.length} EMS`);
    if (!fire.length || !ems.length) throw new Error(`${activeCity.name} Fire/EMS bases are unavailable.`);

    const service = await waitForValue(() => window.PTBO_SERVICE, 'Fire/EMS service runtime');
    stage('applying-city-map', activeCity.name);
    service.applyCityMap?.(true);
    const boundsExpanded = ensureResponseBasesFitMap(activeCity, [...fire, ...ems]);

    const baseTraining = activeCity.features?.baseTraining === true || activeCity.dispatch?.available === false;
    document.documentElement.dataset.city = activeCity.id;
    document.documentElement.dataset.dispatchAvailable = String(!baseTraining);
    document.documentElement.dataset.cityRuntimeReady = 'true';

    const detail = {version:VERSION,cityId:activeCity.id,city:activeCity,baseTraining,fireBases:fire.length,emsBases:ems.length,boundsExpanded,loader:'service-config'};
    stage('city-runtime-ready', `${activeCity.name}; ${fire.length} fire / ${ems.length} EMS`);
    window.dispatchEvent(new CustomEvent('ptbo-city-runtime-ready', {detail}));
    return detail;
  }

  const ready = boot();
  window.PTBO_CITY_RUNTIME_READY = ready;
  ready.catch(error => {
    window.PTBO_CITY_RUNTIME_ERROR = error;
    stage('city-runtime-error', error?.message || String(error));
    document.documentElement.dataset.cityRuntimeReady = 'false';
    window.dispatchEvent(new CustomEvent('ptbo-city-runtime-error', {detail:{version:VERSION,cityId:requestedCityId(),error}}));
    console.error('City runtime verification failed.', error);
  });
})();
