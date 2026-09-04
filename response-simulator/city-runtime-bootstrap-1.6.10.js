/* Deterministic city runtime bootstrap — v1.6.12.
   Repairs stale inner-frame modules before the simulator readiness gate runs. */
(() => {
  'use strict';
  const VERSION = '1.6.12';
  if (window.PTBO_CITY_RUNTIME_READY_VERSION === VERSION && window.PTBO_CITY_RUNTIME_READY) return;
  window.PTBO_CITY_RUNTIME_READY_VERSION = VERSION;

  const sourceUrl = new URL(document.currentScript?.src || location.href, location.href);
  const repoRoot = new URL('../', sourceUrl);
  const params = new URLSearchParams(location.search);
  const stored = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
  const cityId = /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';
  window.PTBO_REQUESTED_CITY = cityId;

  function loadScript(id, relativeUrl) {
    return new Promise((resolve, reject) => {
      const expected = new URL(relativeUrl, repoRoot).href;
      const existing = document.getElementById(id);
      if (existing && existing.src === expected && existing.dataset.ptboLoaded === 'true') return resolve(existing);
      existing?.remove();
      const script = document.createElement('script');
      script.id = id;
      script.src = expected;
      script.dataset.ptboRuntimeVersion = VERSION;
      script.onload = () => { script.dataset.ptboLoaded = 'true'; resolve(script); };
      script.onerror = () => reject(new Error(`Unable to load ${relativeUrl}.`));
      (document.body || document.documentElement).appendChild(script);
    });
  }

  async function boot() {
    document.documentElement.dataset.requestedCity = cityId;
    document.documentElement.dataset.cityRuntimeVersion = VERSION;
    window.PTBO_CITY_PACKAGE_LOAD_ERROR = null;
    window.PTBO_CITY_RUNTIME_ERROR = null;

    if (cityId !== 'peterborough') {
      await loadScript('ptbo-runtime-preview-factory', `cities/preview-package-factory.js?v=${VERSION}`);
    }
    await loadScript('ptbo-runtime-city-package', `cities/${cityId}/package.js?v=${VERSION}`);

    if (window.PTBO_CITY_PACKAGE_READY && typeof window.PTBO_CITY_PACKAGE_READY.then === 'function') {
      await window.PTBO_CITY_PACKAGE_READY;
    }
    if (window.PTBO_CITY_PACKAGE_LOAD_ERROR) throw window.PTBO_CITY_PACKAGE_LOAD_ERROR;
    const city = window.PTBO_CITY_PACKAGE;
    if (!city || city.id !== cityId) {
      throw new Error(`City package mismatch: requested ${cityId}, loaded ${city?.id || 'none'}.`);
    }
    if (!window.PTBO_SERVICE_CONFIG?.profiles?.fire || !window.PTBO_SERVICE_CONFIG?.profiles?.ems) {
      throw new Error(`${city.name} Fire/EMS service data did not initialize.`);
    }

    await loadScript('ptbo-runtime-base-store', `shared/base-locations.js?v=${VERSION}`);
    window.PTBO_BASE_STORE?.refreshFromCityPackage?.();

    const fire = window.PTBO_BASE_STORE?.getBases?.('fire') || window.PTBO_SERVICE_CONFIG.profiles.fire.bases || [];
    const ems = window.PTBO_BASE_STORE?.getBases?.('ems') || window.PTBO_SERVICE_CONFIG.profiles.ems.bases || [];
    if (!fire.length || !ems.length) throw new Error(`${city.name} Fire/EMS bases are unavailable.`);

    await loadScript('ptbo-runtime-service-mode', `response-simulator/service-mode.js?v=${VERSION}`);

    const baseTraining = city.features?.baseTraining === true || city.dispatch?.available === false;
    if (baseTraining) {
      await loadScript('ptbo-runtime-base-training-mode', `response-simulator/base-training-mode-1.6.8.js?v=${VERSION}`);
    }

    window.PTBO_SERVICE?.applyCityMap?.(true);
    document.documentElement.dataset.cityRuntimeReady = 'true';
    window.dispatchEvent(new CustomEvent('ptbo-city-runtime-ready', {
      detail:{version:VERSION, cityId, baseTraining, fireBases:fire.length, emsBases:ems.length},
    }));
    return {version:VERSION, cityId, city, baseTraining, fireBases:fire.length, emsBases:ems.length};
  }

  const ready = boot();
  window.PTBO_CITY_RUNTIME_READY = ready;
  ready.catch(error => {
    window.PTBO_CITY_RUNTIME_ERROR = error;
    document.documentElement.dataset.cityRuntimeReady = 'false';
    window.dispatchEvent(new CustomEvent('ptbo-city-runtime-error', {detail:{version:VERSION,cityId,error}}));
    console.error('City runtime bootstrap failed.', error);
  });
})();
