(() => {
  'use strict';

  const VERSION = '1.6.6';
  if (window.PTBO_HARD_ROAD_BOUNDARY?.version === VERSION) return;

  const state = { installed:false, corrections:0, lastCorrectionAt:0 };
  const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

  async function waitForRoads(timeoutMs = 20000) {
    const started = performance.now();
    while (!window.PTBO_ROAD_COLLISION) {
      if (performance.now() - started > timeoutMs) throw new Error('Road collision API did not become available.');
      await sleep(50);
    }
    return window.PTBO_ROAD_COLLISION;
  }

  const ready = (async () => {
    const roads = await waitForRoads();
    await roads.ready;
    if (roads.state?.status !== 'ready') throw new Error('Road collision API is not ready.');
    if (typeof simulationStep !== 'function') throw new Error('Simulation step is unavailable.');

    const originalStep = simulationStep;
    if (originalStep._ptboHardRoadBoundary) {
      state.installed = true;
      return window.PTBO_HARD_ROAD_BOUNDARY;
    }

    let lastSafe = null;
    const safe = (lat,lng) => Number.isFinite(lat) && Number.isFinite(lng) && roads.isPointDrivable(lat,lng);
    const remember = (lat,lng) => { if (safe(lat,lng)) lastSafe = {lat,lng}; };
    remember(simLat,simLng);

    function restorePosition(candidate) {
      if (!candidate) return false;
      simLat = candidate.lat;
      simLng = candidate.lng;
      velocity = 0;
      vehicleMarker?.setLatLng?.([simLat,simLng]);
      const latNode = document.getElementById('tel-lat');
      const lngNode = document.getElementById('tel-lng');
      if (latNode) latNode.textContent = simLat.toFixed(6);
      if (lngNode) lngNode.textContent = simLng.toFixed(6);
      if (mapInstance && document.getElementById('chk-camera')?.checked) mapInstance.setView([simLat,simLng],mapInstance.getZoom(),{animate:false});
      state.corrections += 1;
      state.lastCorrectionAt = performance.now();
      return true;
    }

    simulationStep = function hardRoadBoundarySimulationStep(...args) {
      const before = {lat:simLat,lng:simLng};
      const result = originalStep.apply(this,args);

      if (roads.state?.status !== 'ready' || roads.state?.enabled === false || roads.state?.stationExit) return result;
      if (safe(simLat,simLng)) {
        lastSafe = {lat:simLat,lng:simLng};
        return result;
      }
      if (safe(before.lat,before.lng)) {
        restorePosition(before);
        lastSafe = {...before};
        return result;
      }
      if (lastSafe && safe(lastSafe.lat,lastSafe.lng)) {
        restorePosition(lastSafe);
        return result;
      }
      const nearest = roads.nearestRoad(before.lat,before.lng,160) || roads.nearestRoad(simLat,simLng,160);
      if (nearest) {
        restorePosition(nearest);
        lastSafe = {lat:nearest.lat,lng:nearest.lng};
      }
      return result;
    };
    simulationStep._ptboHardRoadBoundary = true;
    window.simulationStep = simulationStep;
    state.installed = true;

    window.dispatchEvent(new CustomEvent('ptbo-hard-road-boundary-ready',{detail:{version:VERSION,cityId:roads.config?.cityId || null}}));
    return window.PTBO_HARD_ROAD_BOUNDARY;
  })();

  window.PTBO_HARD_ROAD_BOUNDARY = Object.freeze({version:VERSION,state,ready});
  ready.catch(error => console.error('Hard road boundary guard could not start.',error));
})();
