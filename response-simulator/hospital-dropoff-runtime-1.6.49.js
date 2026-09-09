/* EMS hospital drop-off runtime bridge — v1.6.49. */
(() => {
  'use strict';

  const VERSION = '1.6.49';
  if (window.PTBO_HOSPITAL_DROPOFF_RUNTIME?.version === VERSION) return;
  const source = new URL(document.currentScript?.src || location.href,location.href);

  function loadStore() {
    if (window.PTBO_HOSPITAL_DROPOFF?.version === VERSION) return Promise.resolve(window.PTBO_HOSPITAL_DROPOFF);
    return new Promise((resolve,reject) => {
      const id = 'ptbo-hospital-dropoff-store-v1649';
      const existing = document.getElementById(id);
      if (existing) {
        existing.addEventListener('load',() => resolve(window.PTBO_HOSPITAL_DROPOFF),{once:true});
        existing.addEventListener('error',() => reject(new Error('Hospital drop-off store failed to load.')),{once:true});
        if (window.PTBO_HOSPITAL_DROPOFF) resolve(window.PTBO_HOSPITAL_DROPOFF);
        return;
      }
      const script = document.createElement('script');
      script.id = id;
      script.src = new URL(`../shared/hospital-dropoff-store-1.6.49.js?v=${VERSION}`,source).href;
      script.onload = () => window.PTBO_HOSPITAL_DROPOFF ? resolve(window.PTBO_HOSPITAL_DROPOFF) : reject(new Error('Hospital drop-off store did not initialize.'));
      script.onerror = () => reject(new Error('Hospital drop-off store failed to load.'));
      (document.body || document.head || document.documentElement).appendChild(script);
    });
  }

  function installArrivalOverride(store) {
    const original = window.resolveIncidentArrival;
    if (typeof original !== 'function' || original._ptboHospitalDropoff === VERSION) return false;

    function hospitalAwareArrival(incident) {
      const hospital = store.get();
      const isHospital = Boolean(incident && hospital && (
        incident.id === hospital.id ||
        incident._ptboHospitalDropoff === true ||
        (incident.sub === 'Hospital Transport' && incident.name === hospital.name)
      ));
      if (!isHospital) return original.call(this,incident);
      return {
        radius:Math.max(10,Math.min(200,Number(hospital.checkpointRadius ?? hospital.radius) || 40)),
        lat:Number(hospital.checkpointLat ?? hospital.lat),
        lng:Number(hospital.checkpointLng ?? hospital.lng),
        accessPoint:false,
        hospitalDropoff:true,
      };
    }
    hospitalAwareArrival._ptboHospitalDropoff = VERSION;
    hospitalAwareArrival._original = original;
    window.resolveIncidentArrival = hospitalAwareArrival;
    try { resolveIncidentArrival = hospitalAwareArrival; } catch (_) {}
    return true;
  }

  function refreshDrivableArea() {
    const cityId = window.PTBO_CITY_PACKAGE?.id || 'peterborough';
    window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'hospital-dropoff-runtime'}}));
  }

  const ready = loadStore().then(store => {
    installArrivalOverride(store);
    refreshDrivableArea();
    window.addEventListener('ptbo-hospital-dropoff-updated',refreshDrivableArea);
    return store;
  }).catch(error => {
    console.warn('Hospital drop-off runtime could not initialize.',error);
    throw error;
  });

  window.PTBO_HOSPITAL_DROPOFF_RUNTIME = Object.freeze({version:VERSION,ready,refresh:refreshDrivableArea});
})();
