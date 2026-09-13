/* v1.6.64 incident tablet: resilient street map and responsive phone/desktop UI. */
(() => {
  'use strict';

  const VERSION = '1.6.64';
  if (window.PTBO_RESPONSE_TABLET?.version === VERSION) return;

  const state = {
    installed: false,
    open: false,
    tabletMap: null,
    baseLayers: [],
    destinationMarker: null,
    destinationRadius: null,
    truckMarker: null,
    lastAutoIncidentKey: null,
    lastDestinationKey: null,
    syncTimer: 0,
    freezeFrame: 0,
    basemapToken: 0,
    fallbackUsed: false,
    basemapTimer: 0,
  };

  const NORMAL_MAPS = Object.freeze({
    osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
    positron: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', subdomains: 'abcd' },
    dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', subdomains: 'abcd' },
  });

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function markReleaseVersion() {
    document.documentElement.dataset.ptboRelease = VERSION;
    const localBadge = document.getElementById('ptbo-version-badge');
    if (localBadge) localBadge.textContent = `v${VERSION}`;
    try {
      if (window.parent !== window) {
        const parentDoc = window.parent.document;
        parentDoc.documentElement.dataset.ptboRelease = VERSION;
        const badge = parentDoc.getElementById('ptbo-build-badge');
        if (badge) {
          badge.textContent = `v${VERSION}`;
          badge.setAttribute('aria-label', `Production version ${VERSION}`);
        }
      }
    } catch (_) {}
  }

  function getIncident() {
    try { return typeof activeIncident !== 'undefined' ? activeIncident : null; } catch (_) { return null; }
  }

  function getArrivalPoint() {
    try { return typeof activeArrivalPoint !== 'undefined' ? activeArrivalPoint : null; } catch (_) { return null; }
  }

  function getStateName() {
    try {
      if (typeof simulationState === 'undefined' || typeof STATES === 'undefined') return 'inactive';
      if (simulationState === STATES.ENROUTE) return 'enroute';
      if (simulationState === STATES.TRANSPORTING) return 'transporting';
      return 'inactive';
    } catch (_) { return 'inactive'; }
  }

  function currentTruckPosition() {
    try {
      const lat = Number(simLat);
      const lng = Number(simLng);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch (_) { return null; }
  }

  function destination() {
    const incident = getIncident();
    if (!incident) return null;
    const phase = getStateName();
    const arrival = getArrivalPoint();
    const source = phase === 'transporting' && arrival ? arrival : (arrival || incident);
    const lat = Number(source?.lat);
    const lng = Number(source?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      radius: Math.max(15, Math.min(500, Number(source?.radius ?? incident?.radius) || 45)),
      name: String(source?.name || incident?.name || 'Incident location'),
      address: String(source?.addr || source?.address || incident?.addr || incident?.address || 'Location shown on map'),
      callType: String(incident?.sub || incident?.type || incident?.main || 'Active dispatch'),
      phase,
    };
  }

  function incidentKey() {
    const incident = getIncident();
    if (!incident) return null;
    return String(incident.id || `${incident.name || ''}|${incident.addr || incident.address || ''}|${incident.lat || ''}|${incident.lng || ''}`);
  }

  function destinationKey(value) {
    if (!value) return null;
    return `${value.phase}|${value.lat.toFixed(6)}|${value.lng.toFixed(6)}|${value.name}`;
  }

  function clearDrivingInput() {
    try {
      if (typeof keys !== 'undefined' && keys) Object.keys(keys).forEach(key => { keys[key] = false; });
    } catch (_) {}
    try { if (typeof velocity !== 'undefined') velocity = 0; } catch (_) {}
  }

  function freezeDrivingFrame() {
    if (!state.open) {
      state.freezeFrame = 0;
      return;
    }
    clearDrivingInput();
    state.freezeFrame = requestAnimationFrame(freezeDrivingFrame);
  }

  function setParentTabletMode(active) {
    try {
      if (window.parent === window) return;
      const doc = window.parent.document;
      if (!doc.getElementById('ptbo-response-tablet-parent-style')) {
        const style = doc.createElement('style');
        style.id = 'ptbo-response-tablet-parent-style';
        style.textContent = `
          html.ptbo-response-tablet-open .desktop-action,
          html.ptbo-response-tablet-open .station-shortcuts,
          html.ptbo-response-tablet-open .mobile-controls,
          html.ptbo-response-tablet-open .control-hint,
          html.ptbo-response-tablet-open #ptbo-training-use-notice,
          html.ptbo-response-tablet-open #ptbo-build-badge{
            opacity:0!important;visibility:hidden!important;pointer-events:none!important;
          }
        `;
        doc.head.appendChild(style);
      }
      doc.documentElement.classList.toggle('ptbo-response-tablet-open', Boolean(active));
    } catch (_) {}
  }

  function installStyles() {
    if (document.getElementById('ptbo-response-tablet-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-response-tablet-style';
    style.textContent = `
      #ptbo-response-tablet-overlay[hidden]{display:none!important}
      #ptbo-response-tablet-overlay{
        position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:clamp(14px,3vw,42px);
        background:rgba(2,6,15,.76);-webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
        font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #ptbo-response-tablet{
        width:min(1180px,94vw);height:min(780px,88vh);min-height:460px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;
        overflow:hidden;border:9px solid #080d18;border-radius:26px;background:#0b1220;color:#f8fafc;
        box-shadow:0 34px 110px rgba(0,0,0,.78),0 0 0 1px rgba(255,255,255,.16),inset 0 0 0 1px rgba(255,255,255,.06);
      }
      #ptbo-response-tablet .tablet-topbar{display:flex;align-items:center;gap:14px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);background:linear-gradient(135deg,#111c31,#17243a)}
      #ptbo-response-tablet .tablet-icon{width:36px;height:36px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(56,189,248,.38);border-radius:10px;background:rgba(14,116,144,.18);color:#67e8f9}
      #ptbo-response-tablet .tablet-icon svg{width:21px;height:21px;stroke:currentColor}
      #ptbo-response-tablet .tablet-heading{min-width:0;flex:1}
      #ptbo-response-tablet .tablet-kicker{margin:0 0 2px;color:#67e8f9;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
      #ptbo-response-tablet .tablet-title{margin:0;overflow:hidden;color:#fff;font-size:18px;font-weight:900;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
      #ptbo-response-tablet .tablet-address{margin:3px 0 0;overflow:hidden;color:#cbd5e1;font-size:12px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
      #ptbo-tablet-close{width:44px;height:44px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(255,255,255,.22);border-radius:13px;background:#263248;color:#fff;font-size:24px;line-height:1;cursor:pointer;touch-action:manipulation}
      #ptbo-tablet-close:hover{background:#334155}
      #ptbo-response-tablet-map-wrap{position:relative;min-height:0;background:#152033}
      #ptbo-response-tablet-map{position:absolute;inset:0;background:#152033}
      #ptbo-response-tablet-map .leaflet-control-attribution{font-size:8px!important;opacity:.72}
      #ptbo-tablet-map-status{position:absolute;left:14px;top:14px;z-index:700;max-width:min(440px,76%);padding:9px 11px;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:rgba(7,17,31,.92);box-shadow:0 5px 18px rgba(0,0,0,.35);color:#e2e8f0;font-size:11px;font-weight:750;line-height:1.35;pointer-events:none}
      #ptbo-tablet-map-status[data-state="loading"]::before{content:"";display:inline-block;width:8px;height:8px;margin-right:7px;border:2px solid #7dd3fc;border-right-color:transparent;border-radius:50%;vertical-align:-1px;animation:ptbo-tablet-spin .75s linear infinite}
      #ptbo-tablet-map-status[data-state="error"]{border-color:rgba(251,191,36,.7);color:#fef3c7;background:rgba(69,26,3,.94)}
      @keyframes ptbo-tablet-spin{to{transform:rotate(360deg)}}
      #ptbo-response-tablet .tablet-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;border-top:1px solid rgba(255,255,255,.12);background:#101a2d}
      #ptbo-response-tablet .tablet-help{color:#94a3b8;font-size:11px;line-height:1.35}
      #ptbo-response-tablet .tablet-actions{display:flex;gap:9px;flex:0 0 auto}
      #ptbo-response-tablet .tablet-btn{min-height:44px;padding:10px 15px;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:#243246;color:#f8fafc;font:850 12px/1.15 inherit;cursor:pointer;touch-action:manipulation}
      #ptbo-response-tablet .tablet-btn.primary{border-color:#38bdf8;background:#0369a1}
      #ptbo-response-tablet .tablet-btn:hover{filter:brightness(1.08)}
      #ptbo-response-tablet button:focus-visible{outline:3px solid #fbbf24;outline-offset:2px}
      .ptbo-tablet-destination-marker{width:28px;height:28px;display:grid;place-items:center;border:3px solid #fff;border-radius:50%;background:#dc2626;box-shadow:0 0 0 8px rgba(220,38,38,.2),0 4px 14px rgba(0,0,0,.5);color:#fff;font-size:14px;font-weight:1000}
      .ptbo-tablet-truck-marker{width:18px;height:18px;border:3px solid #fff;border-radius:4px;background:#0284c7;box-shadow:0 3px 10px rgba(0,0,0,.5)}
      #route-answer-btn{background:#0369a1!important;border-color:#38bdf8!important}
      #route-answer-btn.is-visible{background:#0369a1!important;border-color:#38bdf8!important}
      #route-answer-card{display:none!important}
      @media(max-width:720px){
        #ptbo-response-tablet-overlay{place-items:stretch;padding:max(6px,env(safe-area-inset-top)) max(6px,env(safe-area-inset-right)) max(6px,env(safe-area-inset-bottom)) max(6px,env(safe-area-inset-left))}
        #ptbo-response-tablet{width:100%;height:100%;min-height:0;border-width:5px;border-radius:18px;grid-template-rows:auto minmax(0,1fr) auto}
        #ptbo-response-tablet .tablet-topbar{padding:10px 10px 10px 12px;gap:8px}
        #ptbo-response-tablet .tablet-icon{display:none}
        #ptbo-response-tablet .tablet-title{font-size:15px}
        #ptbo-response-tablet .tablet-address{font-size:11px}
        #ptbo-tablet-close{width:42px;height:42px}
        #ptbo-tablet-map-status{left:9px;top:9px;max-width:calc(100% - 66px);padding:7px 9px;font-size:10px}
        #ptbo-response-tablet .tablet-footer{align-items:stretch;flex-direction:column;padding:9px 10px;gap:8px}
        #ptbo-response-tablet .tablet-help{display:none}
        #ptbo-response-tablet .tablet-actions{display:grid;grid-template-columns:1fr 1fr;width:100%}
        #ptbo-response-tablet .tablet-btn{width:100%}
      }
      @media(orientation:landscape) and (max-height:560px){
        #ptbo-response-tablet .tablet-kicker,#ptbo-response-tablet .tablet-address{display:none}
        #ptbo-response-tablet .tablet-topbar{padding:7px 9px}
        #ptbo-response-tablet .tablet-footer{padding:7px 9px;flex-direction:row}
        #ptbo-response-tablet .tablet-actions{margin-left:auto;width:min(340px,56vw)}
      }
    `;
    document.head.appendChild(style);
  }

  function installUi() {
    if (document.getElementById('ptbo-response-tablet-overlay')) return;
    installStyles();
    const overlay = document.createElement('div');
    overlay.id = 'ptbo-response-tablet-overlay';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ptbo-response-tablet-title');
    overlay.innerHTML = `
      <section id="ptbo-response-tablet">
        <header class="tablet-topbar">
          <div class="tablet-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h5M8 15h8"/></svg>
          </div>
          <div class="tablet-heading">
            <p class="tablet-kicker">Response tablet · incident map</p>
            <h2 class="tablet-title" id="ptbo-response-tablet-title">Active incident</h2>
            <p class="tablet-address" id="ptbo-response-tablet-address">Loading incident location…</p>
          </div>
          <button id="ptbo-tablet-close" type="button" aria-label="Close response tablet">×</button>
        </header>
        <div id="ptbo-response-tablet-map-wrap">
          <div id="ptbo-response-tablet-map"></div>
          <div id="ptbo-tablet-map-status" data-state="loading">Loading street map…</div>
        </div>
        <footer class="tablet-footer">
          <div class="tablet-help">Street-map incident view. Use <strong>Show Route Area</strong> to see the vehicle and destination together.</div>
          <div class="tablet-actions">
            <button class="tablet-btn" id="ptbo-tablet-incident-view" type="button">Incident View</button>
            <button class="tablet-btn primary" id="ptbo-tablet-zoom-out" type="button">Show Route Area</button>
          </div>
        </footer>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeTablet(); });
    document.getElementById('ptbo-tablet-close').addEventListener('click', closeTablet);
    document.getElementById('ptbo-tablet-incident-view').addEventListener('click', showIncidentView);
    document.getElementById('ptbo-tablet-zoom-out').addEventListener('click', showOverview);
  }

  function clearMapLayers() {
    if (!state.tabletMap) return;
    state.baseLayers.forEach(layer => { try { state.tabletMap.removeLayer(layer); } catch (_) {} });
    state.baseLayers = [];
  }

  function setMapStatus(message, status = 'ready') {
    const node = document.getElementById('ptbo-tablet-map-status');
    if (!node) return;
    node.textContent = message;
    node.dataset.state = status;
  }

  function currentSimulatorStreetProvider() {
    try {
      if (typeof tileLayerInstance === 'undefined' || !tileLayerInstance?._url) return null;
      const url = String(tileLayerInstance._url);
      if (!/(?:openstreetmap\.org|cartocdn\.com)\//i.test(url)) return null;
      return {
        url,
        subdomains:tileLayerInstance.options?.subdomains,
        maxNativeZoom:tileLayerInstance.options?.maxNativeZoom,
        attribution:tileLayerInstance.options?.attribution,
      };
    } catch (_) { return null; }
  }

  function createStreetLayer(style = 'simulator') {
    const provider = style === 'simulator'
      ? (currentSimulatorStreetProvider() || NORMAL_MAPS.osm)
      : (NORMAL_MAPS[style] || NORMAL_MAPS.osm);
    return L.tileLayer(provider.url, {
      minZoom:10,
      maxZoom:19,
      maxNativeZoom:Number(provider.maxNativeZoom) || 18,
      subdomains:provider.subdomains,
      updateWhenIdle:false,
      keepBuffer:4,
      crossOrigin:false,
      attribution:provider.attribution || (style === 'positron' ? '© OpenStreetMap contributors © CARTO' : '© OpenStreetMap contributors'),
    });
  }

  function installBasemap() {
    if (!state.tabletMap || !window.L?.tileLayer) return;
    clearMapLayers();
    clearTimeout(state.basemapTimer);
    const token = ++state.basemapToken;
    state.fallbackUsed = false;
    setMapStatus('Loading street map…', 'loading');
    const primary = createStreetLayer('simulator');
    let primaryLoaded = 0;
    let primaryFailures = 0;
    const markPrimaryLoaded = () => {
      if (token !== state.basemapToken) return;
      primaryLoaded += 1;
      clearTimeout(state.basemapTimer);
      setMapStatus('Street-map incident view · driving paused');
    };
    const markPrimaryFailed = () => {
      if (token !== state.basemapToken || state.fallbackUsed) return;
      primaryFailures += 1;
      if (primaryFailures < 1 || primaryLoaded > 0) return;
      state.fallbackUsed = true;
      clearMapLayers();
      const fallback = createStreetLayer('positron');
      fallback.once('load', () => setMapStatus('Backup street map · driving paused'));
      fallback.on('tileerror', () => setMapStatus('Map tiles are unavailable. Check your connection and reopen the tablet.', 'error'));
      fallback.addTo(state.tabletMap);
      state.baseLayers.push(fallback);
    };
    primary.on('tileload', markPrimaryLoaded);
    primary.on('tileerror', markPrimaryFailed);
    primary.addTo(state.tabletMap);
    state.baseLayers.push(primary);
    state.basemapTimer = setTimeout(markPrimaryFailed, 3500);
  }

  function ensureMap() {
    if (state.tabletMap || !window.L?.map) return state.tabletMap;
    state.tabletMap = L.map('ptbo-response-tablet-map', {
      zoomControl: true,
      attributionControl: true,
      zoomAnimation: true,
      fadeAnimation: true,
      keyboard: true,
    });
    installBasemap();
    return state.tabletMap;
  }

  function markerIcon(className, html) {
    return L.divIcon({ className:'', html:`<div class="${className}">${html}</div>`, iconSize:[30,30], iconAnchor:[15,15] });
  }

  function updateTabletDetails(dest) {
    const title = document.getElementById('ptbo-response-tablet-title');
    const address = document.getElementById('ptbo-response-tablet-address');
    const status = document.getElementById('ptbo-tablet-map-status');
    if (title) title.textContent = dest?.name || 'Active incident';
    if (address) address.textContent = dest ? `${dest.callType} · ${dest.address}` : 'No active destination';
    if (status && status.dataset.state !== 'loading' && status.dataset.state !== 'error') status.textContent = dest?.phase === 'transporting'
      ? 'Transport destination · driving paused'
      : `${state.fallbackUsed ? 'Backup street map' : 'Street-map incident view'} · driving paused`;
  }

  function drawTabletMarkers(dest) {
    const map = ensureMap();
    if (!map || !dest) return;
    if (state.destinationMarker) map.removeLayer(state.destinationMarker);
    if (state.destinationRadius) map.removeLayer(state.destinationRadius);
    if (state.truckMarker) map.removeLayer(state.truckMarker);
    state.destinationRadius = L.circle([dest.lat, dest.lng], { radius:dest.radius, color:'#fb7185', weight:2, opacity:.95, fillColor:'#ef4444', fillOpacity:.14, interactive:false }).addTo(map);
    state.destinationMarker = L.marker([dest.lat, dest.lng], { icon:markerIcon('ptbo-tablet-destination-marker','!'), interactive:false }).addTo(map);
    const truck = currentTruckPosition();
    if (truck) state.truckMarker = L.marker([truck.lat, truck.lng], { icon:markerIcon('ptbo-tablet-truck-marker',''), interactive:false }).addTo(map);
  }

  function showIncidentView() {
    const dest = destination();
    const map = ensureMap();
    if (!dest || !map) return;
    drawTabletMarkers(dest);
    map.setView([dest.lat, dest.lng], 18, { animate:true });
    setTimeout(() => map.invalidateSize(false), 30);
  }

  function showOverview() {
    const dest = destination();
    const truck = currentTruckPosition();
    const map = ensureMap();
    if (!dest || !map) return;
    drawTabletMarkers(dest);
    if (!truck) {
      map.setView([dest.lat, dest.lng], 15, { animate:true });
      return;
    }
    const bounds = L.latLngBounds([[truck.lat, truck.lng], [dest.lat, dest.lng]]);
    map.fitBounds(bounds, { padding:[70,70], maxZoom:14, animate:true });
  }

  function openTablet({ automatic = false } = {}) {
    const dest = destination();
    if (!dest) return false;
    installUi();
    window.PTBO_ROUTE_REVEAL?.hideRoute?.({ recenter:false });
    const overlay = document.getElementById('ptbo-response-tablet-overlay');
    if (!overlay) return false;
    state.open = true;
    clearDrivingInput();
    cancelAnimationFrame(state.freezeFrame);
    state.freezeFrame = requestAnimationFrame(freezeDrivingFrame);
    overlay.hidden = false;
    document.documentElement.classList.add('ptbo-response-tablet-open');
    setParentTabletMode(true);
    updateTabletDetails(dest);
    drawTabletMarkers(dest);
    const map = ensureMap();
    setTimeout(() => {
      map?.invalidateSize(false);
      showIncidentView();
    }, 50);
    const close = document.getElementById('ptbo-tablet-close');
    if (close) close.focus({ preventScroll:true });
    if (automatic) state.lastAutoIncidentKey = incidentKey();
    return true;
  }

  function closeTablet() {
    if (!state.open) return;
    state.open = false;
    cancelAnimationFrame(state.freezeFrame);
    state.freezeFrame = 0;
    clearDrivingInput();
    const overlay = document.getElementById('ptbo-response-tablet-overlay');
    if (overlay) overlay.hidden = true;
    document.documentElement.classList.remove('ptbo-response-tablet-open');
    setParentTabletMode(false);
    try { window.focus(); } catch (_) {}
  }

  function interceptTabletButton(event) {
    const target = event.target instanceof Element ? event.target.closest('#route-answer-btn') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!state.open) openTablet();
  }

  function blockDrivingKeys(event) {
    if (!state.open) return;
    const drivingKey = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(event.key);
    if (!drivingKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    clearDrivingInput();
  }

  function syncButton() {
    const button = document.getElementById('route-answer-btn');
    const active = Boolean(destination()) && ['enroute','transporting'].includes(getStateName());
    if (!button) return;
    button.textContent = state.open ? 'Tablet Open' : 'Open Tablet';
    button.title = 'Open the response tablet to view the active destination';
    button.setAttribute('aria-label', state.open ? 'Response tablet is open' : 'Open response tablet');
    button.classList.remove('is-visible');
    button.disabled = !active;
    button.style.display = active ? '' : 'none';
  }

  function syncDispatch() {
    markReleaseVersion();
    syncButton();
    const phase = getStateName();
    const key = incidentKey();
    const dest = destination();
    const dKey = destinationKey(dest);

    if (state.open && dKey && dKey !== state.lastDestinationKey) {
      state.lastDestinationKey = dKey;
      updateTabletDetails(dest);
      drawTabletMarkers(dest);
      showIncidentView();
    }

    if (phase === 'enroute' && key && key !== state.lastAutoIncidentKey) {
      state.lastAutoIncidentKey = key;
      state.lastDestinationKey = dKey;
      openTablet({ automatic:true });
    }

    if (phase === 'inactive' && state.open) closeTablet();
    if (!key && phase === 'inactive') state.lastAutoIncidentKey = null;
  }

  async function install() {
    if (state.installed) return;
    installUi();
    markReleaseVersion();
    window.addEventListener('click', interceptTabletButton, true);
    window.addEventListener('keydown', blockDrivingKeys, true);
    window.addEventListener('keyup', blockDrivingKeys, true);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.open) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeTablet();
      }
    }, true);
    await Promise.race([
      Promise.resolve(window.PTBO_SATELLITE_MAP_READY).catch(() => undefined),
      sleep(2500),
    ]);
    state.syncTimer = setInterval(syncDispatch, 100);
    state.installed = true;
    syncDispatch();
  }

  window.PTBO_RESPONSE_TABLET = Object.freeze({
    version: VERSION,
    state,
    open: openTablet,
    close: closeTablet,
    incidentView: showIncidentView,
    overview: showOverview,
  });

  install().catch(error => console.error('Response tablet failed to initialize.', error));
})();
