(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const store = window.PTBO_DISPATCH_STORE;
  const stationStore = window.PTBO_STATION_STORE;
  if (!store || !stationStore || !window.L) {
    console.error('Dispatch Editor could not start because its shared data stores are unavailable.');
    return;
  }

  const styles = document.createElement('style');
  styles.textContent = `
    .zone-heading{grid-column:1/-1;margin:5px 0 -2px;color:#dbeafe;font-size:.74rem;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
    .zone-note{grid-column:1/-1;margin:-2px 0 1px;color:var(--muted);font-size:.7rem;line-height:1.35}
    .zone-action{min-height:38px;padding:7px 9px;color:#fff;border:1px solid var(--border);border-radius:9px;background:#17253b;font:800 .7rem/1 system-ui;cursor:pointer}
    .zone-action.geo{border-color:#38bdf8;background:#075985}.zone-action.road{border-color:#fb923c;background:#9a3412}
    .station-dot{width:23px;height:23px;display:grid;place-items:center;color:#06111f;border:2px solid #fff;border-radius:50%;background:#fbbf24;box-shadow:0 2px 9px rgba(0,0,0,.7);font:900 11px/1 system-ui}
    .target-dot{width:16px;height:16px;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.75)}.target-dot.geo{background:#38bdf8}.target-dot.road{background:#fb923c}
    .station-editor .editor-actions{grid-template-columns:1fr}.station-editor .primary{background:#a16207;border-color:#fbbf24}
  `;
  document.head.appendChild(styles);

  const subcategories = {
    Fire: ['Water & Ice Rescue', 'Structure Fire', 'Motor Vehicle Collision', 'Auto Alarm / Vehicle Fire', 'Burning Complaint', 'Alarms No Apparent Problem'],
    Medical: ['Chest Pain / Cardiac Emergency', 'Difficulty Breathing', 'Unconscious Patient / Substance Overdose', 'Rectal Bleed / Gastrointestinal Emergency', 'Lift Assist / Public Service', 'Request for Access / Wellness Check']
  };
  const map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([44.302, -78.326], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
  L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map);
  const callLayer = L.layerGroup().addTo(map);
  const stationLayer = L.layerGroup().addTo(map);
  const previewLayer = L.layerGroup().addTo(map);

  let locations = [];
  let stations = [];
  let selectedCallId = null;
  let selectedStationNumber = null;
  let placementMode = null;
  let saveTimer = null;

  function clean(value) { return String(value ?? '').trim().replace(/\s+/g, ' '); }
  function escapeHtml(value) { const node = document.createElement('div'); node.textContent = value ?? ''; return node.innerHTML; }
  function asNumber(value, fallback) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
  function target(location, kind) {
    const fallback = { lat: asNumber(location.lat, 44.302), lng: asNumber(location.lng, -78.326), radius: Math.max(10, asNumber(location.radius, 50)) };
    const supplied = kind === 'simulator' ? location.simulatorTarget : location.geoTarget;
    return {
      lat: asNumber(supplied?.lat, fallback.lat),
      lng: asNumber(supplied?.lng, fallback.lng),
      radius: Math.max(10, asNumber(supplied?.radius, fallback.radius)),
      roadName: clean(supplied?.roadName),
      source: clean(supplied?.source)
    };
  }
  function syncGeoTarget(location) {
    const geo = target(location, 'geo');
    location.geoTarget = { lat: geo.lat, lng: geo.lng, radius: geo.radius };
    location.lat = geo.lat;
    location.lng = geo.lng;
    location.radius = geo.radius;
    location.simulatorTarget = target(location, 'simulator');
    return location;
  }
  function distance(a, b, c, d) {
    const radius = 6371000;
    const radians = Math.PI / 180;
    const latDelta = (c - a) * radians;
    const lngDelta = (d - b) * radians;
    const h = Math.sin(latDelta / 2) ** 2 + Math.cos(a * radians) * Math.cos(c * radians) * Math.sin(lngDelta / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function nearestDistrict(lat, lng) {
    return stations.reduce((best, station) => distance(lat, lng, station.lat, station.lng) < best.distance ? { number: station.number, distance: distance(lat, lng, station.lat, station.lng) } : best, { number: 1, distance: Infinity }).number;
  }
  function status(message) {
    $('save-status').textContent = message;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const pending = locations.filter(location => !location.confirmed).length;
      $('save-status').textContent = `${pending} calls awaiting confirmation`;
    }, 2500);
  }
  function callIcon(kind, item) {
    const className = kind === 'geo' ? `target-dot geo ${item.confirmed ? 'confirmed' : ''}` : 'target-dot road';
    return L.divIcon({ className: '', html: `<div class="${className}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
  }
  function stationIcon(number) {
    return L.divIcon({ className: '', html: `<div class="station-dot">${number}</div>`, iconSize: [23, 23], iconAnchor: [12, 12] });
  }
  function filtered() {
    const query = $('search').value.trim().toLowerCase();
    const main = $('main-filter').value;
    const sub = $('sub-filter').value;
    const hideConfirmed = $('hide-confirmed').checked;
    return locations.filter(location => (!hideConfirmed || !location.confirmed) && (!main || location.main === main) && (!sub || location.sub === sub) && (!query || `${location.name} ${location.addr} ${location.main} ${location.sub}`.toLowerCase().includes(query)));
  }
  function activeSubs(main) { return main ? subcategories[main] || [] : [...new Set(locations.map(location => location.sub))].sort(); }
  function refreshFilters() {
    const selected = $('sub-filter').value;
    const values = activeSubs($('main-filter').value);
    $('sub-filter').innerHTML = '<option value="">All call types</option>' + values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    if (values.includes(selected)) $('sub-filter').value = selected;
  }
  function renderList() {
    const list = filtered();
    const pending = locations.filter(location => !location.confirmed).length;
    $('visible-count').textContent = `${list.length} visible`;
    $('review-count').textContent = `${pending} awaiting · ${locations.length - pending} confirmed`;
    $('call-list').innerHTML = list.map(location => `<button class="call-item ${location.id === selectedCallId ? 'active' : ''} ${location.confirmed ? 'confirmed' : ''}" data-id="${escapeHtml(location.id)}"><strong>${escapeHtml(location.name)}</strong><span>${escapeHtml(location.addr)}</span><span class="badges"><small>${escapeHtml(location.main)} · ${escapeHtml(location.sub)}</small><small class="${location.confirmed ? 'verified' : 'pending'}">${location.confirmed ? '✓ Confirmed' : 'Needs review'}</small></span></button>`).join('');
    document.querySelectorAll('.call-item').forEach(button => { button.onclick = () => selectCall(button.dataset.id); });
  }
  function renderMap() {
    callLayer.clearLayers();
    stationLayer.clearLayers();
    filtered().forEach(location => {
      const geo = target(location, 'geo');
      const simulator = target(location, 'simulator');
      const buildingMarker = L.marker([geo.lat, geo.lng], { draggable: true, icon: callIcon('geo', location) }).bindTooltip(`${escapeHtml(location.name)} · Geo Guesser building target`);
      buildingMarker.on('click', () => selectCall(location.id));
      buildingMarker.on('dragend', event => {
        const point = event.target.getLatLng();
        location.geoTarget = { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: geo.radius };
        syncGeoTarget(location);
        location.district = nearestDistrict(location.lat, location.lng);
        location.confirmed = false;
        saveCalls('Building target moved; confirmation reset');
        selectCall(location.id, false);
      });
      buildingMarker.addTo(callLayer);
      const roadMarker = L.marker([simulator.lat, simulator.lng], { draggable: true, icon: callIcon('road', location) }).bindTooltip(`${escapeHtml(location.name)} · Driving simulator road target`);
      roadMarker.on('click', () => selectCall(location.id));
      roadMarker.on('dragend', event => {
        const point = event.target.getLatLng();
        location.simulatorTarget = { ...simulator, lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), source: 'dispatch-editor' };
        saveCalls('Driving target moved');
        selectCall(location.id, false);
      });
      roadMarker.addTo(callLayer);
    });
    stations.forEach(station => {
      const marker = L.marker([station.lat, station.lng], { draggable: true, icon: stationIcon(station.number) }).bindTooltip(`${escapeHtml(station.name)} · truck spawn`);
      marker.on('click', () => selectStation(station.number));
      marker.on('dragend', event => {
        const point = event.target.getLatLng();
        station.lat = +point.lat.toFixed(6);
        station.lng = +point.lng.toFixed(6);
        saveStations(`${station.name} spawn moved`);
        selectStation(station.number, false);
      });
      marker.addTo(stationLayer);
    });
  }
  function render() { renderList(); renderMap(); renderPreview(); }
  function renderPreview() {
    previewLayer.clearLayers();
    const location = locations.find(item => item.id === selectedCallId);
    if (location) {
      const geo = target(location, 'geo');
      const simulator = target(location, 'simulator');
      L.circle([geo.lat, geo.lng], { radius: geo.radius, color: '#38bdf8', fillColor: '#38bdf8', fillOpacity: .12, weight: 2 }).bindTooltip('Geo Guesser building zone').addTo(previewLayer);
      L.circle([simulator.lat, simulator.lng], { radius: simulator.radius, color: '#fb923c', fillColor: '#fb923c', fillOpacity: .12, weight: 2 }).bindTooltip(`Driving road zone${simulator.roadName ? ` · ${simulator.roadName}` : ''}`).addTo(previewLayer);
    }
  }
  function callFormMarkup() {
    return `<div class="editor-head"><div><h2 id="editor-title">Edit dispatch call</h2><p id="editor-id"></p></div><button class="close" id="close-editor" type="button" aria-label="Close editor">×</button></div><div class="form-grid"><label><span>Division</span><select id="f-main" class="field-control"><option>Fire</option><option>Medical</option></select></label><label><span>Call type</span><select id="f-sub" class="field-control"></select></label><label class="full"><span>Location name</span><input id="f-name" class="field-control" required></label><label class="full"><span>Address / intersection</span><input id="f-addr" class="field-control" required></label><div class="zone-heading">Blue — Geo Guesser building target</div><p class="zone-note">This remains the original location used when players place their map guess.</p><label><span>Building latitude</span><input id="f-geo-lat" class="field-control" type="number" step="0.000001" required></label><label><span>Building longitude</span><input id="f-geo-lng" class="field-control" type="number" step="0.000001" required></label><label><span>Building radius (m)</span><input id="f-geo-radius" class="field-control" type="number" min="10" max="500" required></label><button class="zone-action geo" id="place-geo-target" type="button">Place building zone on map</button><div class="zone-heading">Orange — Driving simulator road target</div><p class="zone-note">Place this on a road or driveway the fire truck can reach. The orange circle is used for arrival and routing.</p><label><span>Road latitude</span><input id="f-sim-lat" class="field-control" type="number" step="0.000001" required></label><label><span>Road longitude</span><input id="f-sim-lng" class="field-control" type="number" step="0.000001" required></label><label><span>Road arrival radius (m)</span><input id="f-sim-radius" class="field-control" type="number" min="10" max="500" required></label><label><span>Road / driveway name</span><input id="f-sim-road" class="field-control" placeholder="Optional"></label><button class="zone-action road full" id="place-sim-target" type="button">Place driving zone on map</button><label><span>Station district</span><select id="f-district" class="field-control"><option value="1">Station 1</option><option value="2">Station 2</option><option value="3">Station 3</option></select></label><label class="check"><input id="f-city-ten" type="checkbox"> Included in The City Ten</label><label class="check confirm-check full"><input id="f-confirmed" type="checkbox"> Location confirmed accurate</label></div><div class="editor-actions"><button class="primary" type="submit">Save both target zones</button><button class="danger" id="delete-call" type="button">Delete Call</button></div>`;
  }
  function stationFormMarkup() {
    return `<div class="editor-head"><div><h2 id="station-editor-title">Edit station spawn</h2><p id="station-editor-id"></p></div><button class="close" id="close-station-editor" type="button" aria-label="Close station editor">×</button></div><div class="form-grid"><p class="zone-note full">Gold pins are where the truck starts when Station 1, 2, or 3 is selected.</p><label class="full"><span>Station name</span><input id="s-name" class="field-control" required></label><label class="full"><span>Station address</span><input id="s-address" class="field-control" required></label><label><span>Spawn latitude</span><input id="s-lat" class="field-control" type="number" step="0.000001" required></label><label><span>Spawn longitude</span><input id="s-lng" class="field-control" type="number" step="0.000001" required></label></div><div class="editor-actions"><button class="primary" type="submit">Save station spawn</button></div>`;
  }
  const callForm = $('editor');
  callForm.innerHTML = callFormMarkup();
  const stationForm = document.createElement('form');
  stationForm.id = 'station-editor';
  stationForm.className = 'editor station-editor hidden';
  stationForm.innerHTML = stationFormMarkup();
  document.querySelector('.map-wrap').appendChild(stationForm);

  function selectCall(id, pan = true) {
    const location = locations.find(item => item.id === id);
    if (!location) return;
    selectedCallId = id;
    selectedStationNumber = null;
    const geo = target(location, 'geo');
    const simulator = target(location, 'simulator');
    $('editor-title').textContent = location.custom ? 'Edit custom call' : 'Edit dispatch call';
    $('editor-id').textContent = location.id;
    $('f-main').value = location.main;
    populateSubcategories(location.main, location.sub);
    $('f-name').value = location.name;
    $('f-addr').value = location.addr;
    $('f-geo-lat').value = geo.lat;
    $('f-geo-lng').value = geo.lng;
    $('f-geo-radius').value = geo.radius;
    $('f-sim-lat').value = simulator.lat;
    $('f-sim-lng').value = simulator.lng;
    $('f-sim-radius').value = simulator.radius;
    $('f-sim-road').value = simulator.roadName || '';
    $('f-district').value = location.district || nearestDistrict(geo.lat, geo.lng);
    $('f-city-ten').checked = Boolean(location.cityTen);
    $('f-confirmed').checked = Boolean(location.confirmed);
    callForm.classList.remove('hidden');
    stationForm.classList.add('hidden');
    if (pan) map.setView([geo.lat, geo.lng], Math.max(map.getZoom(), 16));
    render();
  }
  function selectStation(number, pan = true) {
    const station = stations.find(item => item.number === number);
    if (!station) return;
    selectedStationNumber = number;
    selectedCallId = null;
    $('station-editor-title').textContent = `Edit ${station.name} spawn`;
    $('station-editor-id').textContent = station.id;
    $('s-name').value = station.name;
    $('s-address').value = station.address;
    $('s-lat').value = station.lat;
    $('s-lng').value = station.lng;
    stationForm.classList.remove('hidden');
    callForm.classList.add('hidden');
    if (pan) map.setView([station.lat, station.lng], Math.max(map.getZoom(), 16));
    render();
  }
  function closeEditors() { selectedCallId = null; selectedStationNumber = null; placementMode = null; callForm.classList.add('hidden'); stationForm.classList.add('hidden'); $('placement-banner').classList.add('hidden'); $('add-map').classList.remove('active'); render(); }
  function populateSubcategories(main, selected) {
    const values = subcategories[main] || [];
    $('f-sub').innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    $('f-sub').value = values.includes(selected) ? selected : values[0];
  }
  function saveCalls(message) { locations = store.replaceAll(locations.map(syncGeoTarget)); render(); status(message || 'Call changes saved'); }
  function saveStations(message) { stations = stationStore.replaceAll(stations); render(); status(message || 'Station spawn saved'); }
  function beginPlacement(mode) { placementMode = mode; $('placement-banner').textContent = mode === 'geo' ? 'Tap the map to place the blue Geo Guesser building zone' : mode === 'simulator' ? 'Tap the map to place the orange driving road zone' : 'Tap the map to place the new call'; $('placement-banner').classList.remove('hidden'); $('add-map').classList.add('active'); status('Tap the map to set the target'); }
  function addCall(point) {
    const location = syncGeoTarget({ id: '', main: 'Fire', sub: 'Structure Fire', name: 'New Dispatch Location', addr: 'Enter address', lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: 50, geoTarget: { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: 50 }, simulatorTarget: { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: 50, source: 'dispatch-editor' }, district: nearestDistrict(point.lat, point.lng), cityTen: false, confirmed: false, custom: true, sources: ['shared-editor'] });
    location.id = store.createId(location);
    locations.push(location);
    saveCalls('New call added with both targets at the selected point');
    selectCall(location.id);
  }

  map.on('click', event => {
    const point = event.latlng;
    const location = locations.find(item => item.id === selectedCallId);
    if (placementMode === 'new') addCall(point);
    else if (location && placementMode === 'geo') {
      const geo = target(location, 'geo');
      location.geoTarget = { lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), radius: geo.radius };
      syncGeoTarget(location);
      location.district = nearestDistrict(location.lat, location.lng);
      location.confirmed = false;
      saveCalls('Building target moved; confirmation reset');
      selectCall(location.id, false);
    } else if (location && placementMode === 'simulator') {
      const simulator = target(location, 'simulator');
      location.simulatorTarget = { ...simulator, lat: +point.lat.toFixed(6), lng: +point.lng.toFixed(6), source: 'dispatch-editor' };
      saveCalls('Driving target moved');
      selectCall(location.id, false);
    }
    placementMode = null;
    $('placement-banner').classList.add('hidden');
    $('add-map').classList.remove('active');
  });

  $('add-call').onclick = () => beginPlacement('new');
  $('add-map').onclick = () => beginPlacement('new');
  $('fit-all').onclick = () => { const list = filtered(); if (list.length) map.fitBounds(L.latLngBounds(list.flatMap(location => { const geo = target(location, 'geo'); const simulator = target(location, 'simulator'); return [[geo.lat, geo.lng], [simulator.lat, simulator.lng]]; })).pad(.08)); };
  $('search').oninput = render;
  $('main-filter').onchange = () => { refreshFilters(); render(); };
  $('sub-filter').onchange = render;
  $('hide-confirmed').onchange = render;
  $('close-editor').onclick = closeEditors;
  $('close-station-editor').onclick = closeEditors;
  $('f-main').onchange = () => populateSubcategories($('f-main').value, '');
  $('place-geo-target').onclick = () => beginPlacement('geo');
  $('place-sim-target').onclick = () => beginPlacement('simulator');
  $('delete-call').onclick = () => {
    const location = locations.find(item => item.id === selectedCallId);
    if (!location || !confirm(`Delete ${location.name} from both games?`)) return;
    locations = locations.filter(item => item.id !== location.id);
    saveCalls('Call deleted from both games');
    closeEditors();
  };
  callForm.addEventListener('submit', event => {
    event.preventDefault();
    const location = locations.find(item => item.id === selectedCallId);
    if (!location) return;
    const geo = { lat: asNumber($('f-geo-lat').value, NaN), lng: asNumber($('f-geo-lng').value, NaN), radius: Math.max(10, asNumber($('f-geo-radius').value, NaN)) };
    const simulator = { lat: asNumber($('f-sim-lat').value, NaN), lng: asNumber($('f-sim-lng').value, NaN), radius: Math.max(10, asNumber($('f-sim-radius').value, NaN)), roadName: clean($('f-sim-road').value), source: 'dispatch-editor' };
    if (![geo.lat, geo.lng, geo.radius, simulator.lat, simulator.lng, simulator.radius].every(Number.isFinite)) { alert('Enter valid latitude, longitude, and radius values for both target zones.'); return; }
    location.main = $('f-main').value;
    location.sub = $('f-sub').value;
    location.name = clean($('f-name').value);
    location.addr = clean($('f-addr').value);
    location.geoTarget = geo;
    location.simulatorTarget = simulator;
    syncGeoTarget(location);
    location.district = Number($('f-district').value);
    location.cityTen = $('f-city-ten').checked;
    location.confirmed = $('f-confirmed').checked;
    saveCalls(location.confirmed ? 'Both target zones saved and confirmed' : 'Both target zones saved; call still needs confirmation');
    selectCall(location.id, false);
  });
  stationForm.addEventListener('submit', event => {
    event.preventDefault();
    const station = stations.find(item => item.number === selectedStationNumber);
    if (!station) return;
    const lat = asNumber($('s-lat').value, NaN);
    const lng = asNumber($('s-lng').value, NaN);
    if (![lat, lng].every(Number.isFinite)) { alert('Enter a valid station spawn latitude and longitude.'); return; }
    station.name = clean($('s-name').value) || `Station ${station.number}`;
    station.address = clean($('s-address').value) || 'Address pending';
    station.lat = lat;
    station.lng = lng;
    saveStations(`${station.name} spawn saved`);
    selectStation(station.number, false);
  });
  $('download-source').onclick = () => {
    const content = `${store.exportText()}\n${stationStore.exportText()}`;
    const blob = new Blob([content], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'peterborough-dispatch-and-stations.js';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    status('Calls and station spawns downloaded');
  };
  $('copy-source').onclick = async () => {
    const content = `${store.exportText()}\n${stationStore.exportText()}`;
    try { await navigator.clipboard.writeText(content); status('Calls and station spawns copied'); } catch { prompt('Copy the permanent shared database:', content); }
  };
  window.addEventListener('ptbo-dispatch-updated', () => { locations = store.getAll().map(syncGeoTarget); render(); });
  window.addEventListener('ptbo-stations-updated', () => { stations = stationStore.getAll(); render(); });

  Promise.all([store.ready(), stationStore.ready()]).then(() => {
    locations = store.getAll().map(syncGeoTarget);
    stations = stationStore.getAll();
    refreshFilters();
    render();
    status(`${locations.filter(location => !location.confirmed).length} calls awaiting confirmation`);
    setTimeout(() => $('fit-all').click(), 100);
  }).catch(error => {
    console.error(error);
    status(`Database error: ${error.message}`);
  });
})();
