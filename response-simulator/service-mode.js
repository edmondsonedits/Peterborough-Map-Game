/* Shared Fire/EMS runtime. The active city package supplies bases, hospital,
   map bounds and labels; dispatch phases remain shared simulator behaviour. */
(() => {
  'use strict';
  const config = window.PTBO_SERVICE_CONFIG;
  const city = window.PTBO_CITY_PACKAGE;
  if (!config || !city) throw new Error('City package/service configuration did not load.');

  const state = {mode:'fire',selected:false,baseNumber:1};
  const savedFilters = new Map();
  const getProfile = () => config.profiles[state.mode];
  const getBases = () => window.PTBO_BASE_STORE?.getBases(state.mode) || getProfile().bases;
  const getBase = () => getBases().find(base => base.number === state.baseNumber) || getBases()[0];

  function applyCityMap(recenter = false) {
    try {
      if (typeof mapInstance === 'undefined' || !mapInstance || !city.map) return false;
      const map = city.map;
      if (Number.isFinite(Number(map.minZoom))) mapInstance.options.minZoom = Number(map.minZoom);
      if (Number.isFinite(Number(map.maxZoom))) mapInstance.options.maxZoom = Number(map.maxZoom);
      if (Array.isArray(map.bounds) && map.bounds.length === 2) mapInstance.setMaxBounds(L.latLngBounds(map.bounds[0],map.bounds[1]));
      if (recenter && Array.isArray(map.defaultCenter)) {
        const zoom = Math.max(Number(map.minZoom)||10,Math.min(Number(map.maxZoom)||19,Number(map.defaultZoom)||15));
        mapInstance.setView(map.defaultCenter,zoom,{animate:false});
      }
      document.documentElement.dataset.city = city.id;
      document.title = `${city.name} Fire & EMS Dispatch Simulator`;
      return true;
    } catch (error) {
      console.warn('Unable to apply city map settings.',error);
      return false;
    }
  }

  function updateControls() {
    const select = document.getElementById('service-select');
    if (select) select.value = state.mode;
    const title = document.getElementById('service-spawns-title');
    if (title) title.textContent = state.mode === 'ems' ? 'Paramedic Bases' : 'Fire Stations';
    const container = document.getElementById('service-spawns');
    if (container) {
      container.replaceChildren(...getBases().map(base => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'station-spawn-box';
        button.textContent = `${base.name} — ${base.address}`;
        button.setAttribute('aria-pressed',String(base.number === state.baseNumber));
        button.addEventListener('click',() => spawn(base.number));
        return button;
      }));
    }
    try {
      parent.ptboSetSelectedStation?.(state.baseNumber);
      parent.document.documentElement.dataset.service = state.mode;
      parent.document.documentElement.dataset.city = city.id;
      const shortcuts = parent.document.querySelector('.station-shortcuts');
      if (shortcuts) {
        shortcuts.style.gridTemplateColumns = `repeat(${getBases().length},minmax(65px,1fr))`;
        shortcuts.style.overflowX = 'auto';
        shortcuts.replaceChildren(...getBases().map(base => {
          const button = parent.document.createElement('button');
          button.type = 'button';
          button.className = 'station-button';
          button.classList.toggle('active',base.number === state.baseNumber);
          button.dataset.station = base.number;
          button.textContent = base.shortName;
          button.title = `${getProfile().label}: ${base.name} — ${base.address}`;
          button.setAttribute('aria-label',`${getProfile().label}: ${base.name}`);
          button.setAttribute('aria-pressed',String(base.number === state.baseNumber));
          button.addEventListener('click',() => {spawn(base.number);window.mobileRecenter?.();});
          return button;
        }));
      }
    } catch (_) {}
    const label = document.getElementById('vehicle-size-label');
    if (label) label.textContent = `${getProfile().vehicle} display size`;
  }

  function showAvailable() {
    document.getElementById('hud-content').innerHTML = `
      <div class="hud-title">${getProfile().label} / AVAILABLE · ${city.name.toUpperCase()}</div>
      <p class="hud-address">${escapeDispatchText(getBase().name)}</p>
      <div class="hud-meta">${state.mode === 'ems' ? 'Respond to the scene, then transport to hospital.' : `Choose a station and respond to calls across ${city.name}.`}</div>`;
  }

  function spawn(number) {
    if (!state.selected) return false;
    const base = getBases().find(item => item.number === Number(number));
    if (!base) return false;
    applyCityMap(false);
    resetDispatchWorkflow();
    state.baseNumber = base.number;
    window.teleportToStation(base.lat,base.lng);
    updateControls();
    showAvailable();
    return true;
  }

  function select(mode) {
    if (!config.profiles[mode]) return false;
    if (state.selected && state.mode === mode) return true;
    const boxes = [...document.querySelectorAll('.filter-chk')];
    if (state.selected) savedFilters.set(state.mode,new Map(boxes.map(box => [box.dataset.sub,box.checked])));
    state.mode = mode;
    state.selected = true;
    const previous = savedFilters.get(mode);
    boxes.forEach(box => {
      box.checked = previous?.has(box.dataset.sub) ? previous.get(box.dataset.sub)
        : mode !== 'ems' || !config.alarmCategories.includes(box.dataset.sub);
      box.dispatchEvent(new Event('change',{bubbles:true}));
    });
    document.documentElement.dataset.service = mode;
    applyCityMap(false);
    updateVehicleChassis();
    spawn(getBases()[0].number);
    window.dispatchEvent(new CustomEvent('ptbo-service-change',{detail:{cityId:city.id,mode}}));
    return true;
  }

  function dispatchPhrase(incident) {
    if (state.mode !== 'ems' || !incident) return null;
    if (incident.sub === 'Hospital Transport') return `Ambulance crew, patient ready for transport. Proceed to ${incident.name}, ${incident.addr}.`;
    return `Ambulance crew from ${getBase().name}, respond to ${incident.name}, ${incident.addr}, for ${incident.sub}.`;
  }

  function ambulanceSvg() {
    return `<rect x="4" y="1" width="64" height="28" rx="3" fill="#f8fafc" stroke="#334155"/>
      <rect x="68" y="4" width="28" height="22" rx="5" fill="#e2e8f0" stroke="#334155"/>
      <rect x="86" y="6" width="6" height="18" rx="2" fill="#164e63"/>
      <path d="M8 4h54M8 26h54" stroke="#eab308" stroke-width="4"/>
      <path d="M8 7h54M8 23h54" stroke="#2563eb" stroke-width="2"/>
      <g transform="translate(36 15)" fill="#2563eb"><rect x="-3" y="-9" width="6" height="18"/><rect x="-3" y="-9" width="6" height="18" transform="rotate(60)"/><rect x="-3" y="-9" width="6" height="18" transform="rotate(-60)"/></g>
      <path d="M36 9v12" stroke="white" stroke-width="1.4"/>
      <rect class="svg-light-blue" x="71" y="2" width="5" height="11" fill="#2563eb"/>
      <rect class="svg-light-red" x="71" y="17" width="5" height="11" fill="#ef4444"/>
      <path d="M4 9v12" stroke="#ef4444" stroke-width="3"/>
      <path d="M94 7v4m0 8v4" stroke="#fef9c3" stroke-width="3"/>`;
  }

  window.PTBO_SERVICE = Object.freeze({state,city,config,getProfile,getBases,getBase,select,spawn,updateControls,applyCityMap,dispatchPhrase,ambulanceSvg});

  let yardLayer;
  function showBaseYards() {
    if (!window.PTBO_BASE_STORE || typeof mapInstance === 'undefined' || !mapInstance || !L.layerGroup) return;
    if (yardLayer) mapInstance.removeLayer(yardLayer);
    yardLayer = L.layerGroup(window.PTBO_BASE_STORE.getAll().map(base =>
      L.polygon(window.PTBO_BASE_STORE.corners(base),{color:base.service==='ems'?'#38bdf8':'#fb7185',weight:1.5,fillOpacity:0.08,interactive:false}))).addTo(mapInstance);
  }

  window.addEventListener('ptbo-road-collision-ready',showBaseYards);
  window.addEventListener('ptbo-bases-updated',() => {showBaseYards();updateControls();});
  [0,100,500].forEach(delay => setTimeout(() => {applyCityMap(false);showBaseYards();},delay));
})();
