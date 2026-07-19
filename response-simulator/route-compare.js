(() => {
  'use strict';

  const VERSION = '1.4.1';
  if (window.PTBO_ROUTE_COMPARE_VERSION === VERSION) return;
  window.PTBO_ROUTE_COMPARE_VERSION = VERSION;

  const COLORS = Object.freeze({
    user: '#2563eb',
    suggested: '#22c55e',
    casing: '#ffffff',
    dark: '#07111f',
  });

  const state = {
    runKey: null,
    recording: false,
    completed: false,
    reviewOpen: false,
    start: null,
    destination: null,
    incident: null,
    points: [],
    suggestedRoute: null,
    suggestedPromise: null,
    elapsedMs: 0,
    lastSampleAt: 0,
    lastPoint: null,
    playerDistance: 0,
    previousCameraLock: null,
    layers: [],
    playerLine: null,
    suggestedLine: null,
    button: null,
    legend: null,
    statusTimer: null,
  };

  function globalsReady() {
    return typeof mapInstance !== 'undefined' && mapInstance &&
      typeof simulationState !== 'undefined' && typeof STATES !== 'undefined';
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    try {
      if (mapInstance?.distance) return mapInstance.distance([a.lat, a.lng], [b.lat, b.lng]);
    } catch (_) {}
    const radius = 6371000;
    const toRad = value => value * Math.PI / 180;
    const p1 = toRad(a.lat);
    const p2 = toRad(b.lat);
    const dLat = p2 - p1;
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return 'Unavailable';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  }

  function formatTime(milliseconds) {
    const total = Math.max(0, Number(milliseconds) || 0) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}` : `${seconds.toFixed(1)} s`;
  }

  function incidentKey(incident) {
    if (!incident) return null;
    return incident.id || `${incident.name}|${incident.addr}|${incident.lat}|${incident.lng}`;
  }

  function installStyles() {
    if (document.getElementById('ptbo-route-compare-styles')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-route-compare-styles';
    style.textContent = `
      #ptbo-compare-route-btn{display:none;margin-top:6px;background:#1d4ed8;border:1px solid #60a5fa;color:#fff}
      #ptbo-compare-route-btn:hover{background:#1e40af}
      #ptbo-compare-route-btn.is-open{background:#374151;border-color:#9ca3af}
      #ptbo-route-legend{position:absolute;left:15px;top:118px;z-index:1400;width:min(270px,calc(100vw - 30px));padding:12px;color:#f8fafc;border:1px solid rgba(255,255,255,.22);border-radius:11px;background:rgba(7,17,31,.94);box-shadow:0 8px 28px rgba(0,0,0,.42);backdrop-filter:blur(6px)}
      #ptbo-route-legend.hidden{display:none}
      #ptbo-route-legend .compare-title{font-size:11px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}
      #ptbo-route-legend .compare-subtitle{margin-top:3px;color:#cbd5e1;font-size:10px;line-height:1.35}
      #ptbo-route-legend .compare-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:9px;font-size:11px;font-weight:800}
      #ptbo-route-legend .compare-label{display:flex;align-items:center;gap:8px;min-width:0}
      #ptbo-route-legend .compare-swatch{width:28px;height:5px;border:1px solid rgba(255,255,255,.9);border-radius:999px;box-shadow:0 1px 3px rgba(0,0,0,.5)}
      #ptbo-route-legend button{padding:5px 7px;color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:7px;background:rgba(255,255,255,.08);font:inherit;font-size:9px;font-weight:850;cursor:pointer}
      #ptbo-route-legend button[aria-pressed="false"]{opacity:.48}
      #ptbo-route-legend .compare-stats{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.14);color:#dbeafe;font-size:10px;line-height:1.55}
      #ptbo-route-legend .compare-status{margin-top:8px;color:#fbbf24;font-size:10px;line-height:1.35}
      #ptbo-route-legend .compare-close{width:100%;margin-top:10px;padding:8px;background:#374151}
      .ptbo-review-dimmed{opacity:.38!important;pointer-events:none!important}
      #ptbo-version-badge{margin-top:18px;color:#9ca3af;font-size:8px;font-weight:700;letter-spacing:.08em;text-align:right;opacity:.58}
      @media(max-width:900px),(pointer:coarse){
        #ptbo-route-legend{top:calc(158px + env(safe-area-inset-top));left:10px;width:min(255px,calc(100vw - 20px));padding:10px}
        #ptbo-compare-route-btn{min-height:36px!important;padding:6px 5px!important;font-size:10px!important}
      }
      @media(orientation:landscape) and (max-height:560px){
        #ptbo-route-legend{top:calc(132px + env(safe-area-inset-top));max-height:calc(100vh - 155px);overflow:auto}
      }
    `;
    document.head.appendChild(style);
  }

  function installVersionBadge() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return;
    let badge = document.getElementById('ptbo-version-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ptbo-version-badge';
      panel.appendChild(badge);
    }
    badge.textContent = `v${VERSION}`;
  }

  function installUi() {
    installStyles();
    installVersionBadge();
    const timerBlock = document.querySelector('.hud-timer-block');
    if (!timerBlock) return false;

    let button = document.getElementById('ptbo-compare-route-btn');
    if (!button) {
      button = document.createElement('button');
      button.id = 'ptbo-compare-route-btn';
      button.className = 'hud-btn';
      button.type = 'button';
      button.textContent = 'Compare Route';
      button.addEventListener('click', () => state.reviewOpen ? closeReview() : openReview());
      timerBlock.appendChild(button);
    }
    state.button = button;

    let legend = document.getElementById('ptbo-route-legend');
    if (!legend) {
      legend = document.createElement('section');
      legend.id = 'ptbo-route-legend';
      legend.className = 'hidden';
      legend.setAttribute('aria-live', 'polite');
      document.body.appendChild(legend);
    }
    state.legend = legend;
    return true;
  }

  function setButtonVisible(visible) {
    if (!state.button) return;
    state.button.style.display = visible ? 'block' : 'none';
    state.button.disabled = !visible;
    state.button.classList.toggle('is-open', state.reviewOpen);
    state.button.textContent = state.reviewOpen ? 'Close Comparison' : 'Compare Route';
  }

  function resetRun() {
    closeReview({ silent: true });
    state.runKey = null;
    state.recording = false;
    state.completed = false;
    state.start = null;
    state.destination = null;
    state.incident = null;
    state.points = [];
    state.suggestedRoute = null;
    state.suggestedPromise = null;
    state.elapsedMs = 0;
    state.lastSampleAt = 0;
    state.lastPoint = null;
    state.playerDistance = 0;
    setButtonVisible(false);
  }

  function startRun() {
    if (!activeIncident) return;
    const key = incidentKey(activeIncident);
    if (state.recording && state.runKey === key) return;
    closeReview({ silent: true });
    state.runKey = key;
    state.recording = true;
    state.completed = false;
    state.start = { lat: Number(simLat), lng: Number(simLng) };
    state.destination = { lat: Number(activeIncident.lat), lng: Number(activeIncident.lng) };
    state.incident = { ...activeIncident };
    state.points = [state.start];
    state.lastPoint = state.start;
    state.playerDistance = 0;
    state.elapsedMs = 0;
    state.lastSampleAt = performance.now();
    state.suggestedRoute = null;
    state.suggestedPromise = calculateSuggestedRoute();
    setButtonVisible(false);
  }

  function sampleRun(now = performance.now()) {
    if (!state.recording || simulationState !== STATES.ENROUTE) return;
    const point = { lat: Number(simLat), lng: Number(simLng) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    state.elapsedMs = Number(elapsedMilliseconds) || Math.max(0, now - state.lastSampleAt);
    if (!state.lastPoint) {
      state.lastPoint = point;
      state.points.push(point);
      return;
    }
    const moved = distanceMeters(state.lastPoint, point);
    if (moved < 4) return;
    state.playerDistance += moved;
    state.points.push(point);
    state.lastPoint = point;
  }

  function completeRun() {
    if (!state.recording || state.completed) return;
    const finalPoint = { lat: Number(simLat), lng: Number(simLng) };
    if (state.lastPoint && Number.isFinite(finalPoint.lat) && distanceMeters(state.lastPoint, finalPoint) > 1) {
      state.playerDistance += distanceMeters(state.lastPoint, finalPoint);
      state.points.push(finalPoint);
      state.lastPoint = finalPoint;
    }
    state.elapsedMs = Number(elapsedMilliseconds) || state.elapsedMs;
    state.recording = false;
    state.completed = true;
  }

  async function calculateSuggestedRoute() {
    if (!state.start || !state.destination) return null;
    const waitUntilReady = async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (window.PTBO_ROUTE_REVEAL?.calculateRoute) {
          try { await window.PTBO_ROUTE_REVEAL.ready; } catch (_) {}
          return window.PTBO_ROUTE_REVEAL;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    };
    const router = await waitUntilReady();
    if (!router?.calculateRoute) return null;
    try {
      const route = router.calculateRoute(state.start.lat, state.start.lng, state.destination.lat, state.destination.lng);
      state.suggestedRoute = route || null;
      return state.suggestedRoute;
    } catch (error) {
      console.error('Suggested route comparison failed.', error);
      return null;
    }
  }

  function simplify(points, toleranceMeters = 2.5) {
    if (!Array.isArray(points) || points.length < 3) return points || [];
    const sqTolerance = toleranceMeters * toleranceMeters;
    const project = point => {
      const scale = 111320 * Math.cos((state.start?.lat || point.lat) * Math.PI / 180);
      return { x: point.lng * scale, y: point.lat * 110540 };
    };
    const source = points.map((point, index) => ({ ...project(point), point, index }));
    const keep = new Uint8Array(source.length);
    keep[0] = keep[source.length - 1] = 1;
    const stack = [[0, source.length - 1]];
    while (stack.length) {
      const [first, last] = stack.pop();
      const a = source[first];
      const b = source[last];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      let maxSq = 0;
      let maxIndex = -1;
      for (let i = first + 1; i < last; i += 1) {
        const p = source[i];
        let t = lengthSq ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq : 0;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const distSq = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (distSq > maxSq) { maxSq = distSq; maxIndex = i; }
      }
      if (maxIndex > 0 && maxSq > sqTolerance) {
        keep[maxIndex] = 1;
        stack.push([first, maxIndex], [maxIndex, last]);
      }
    }
    return source.filter((_, index) => keep[index]).map(item => item.point);
  }

  function addLayer(layer) {
    state.layers.push(layer);
    return layer.addTo(mapInstance);
  }

  function clearLayers() {
    if (mapInstance) state.layers.forEach(layer => {
      try { mapInstance.removeLayer(layer); } catch (_) {}
    });
    state.layers = [];
    state.playerLine = null;
    state.suggestedLine = null;
  }

  function drawPolyline(points, color) {
    const casing = addLayer(L.polyline(points, {
      color: COLORS.casing,
      weight: 10,
      opacity: .88,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }));
    const line = addLayer(L.polyline(points, {
      color,
      weight: 6,
      opacity: .98,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }));
    line._ptboCasing = casing;
    return line;
  }

  function setLineVisible(line, visible) {
    if (!line) return;
    const opacity = visible ? .98 : 0;
    line.setStyle({ opacity });
    line._ptboCasing?.setStyle({ opacity: visible ? .88 : 0 });
  }

  function buildLegend() {
    if (!state.legend) return;
    const suggestedDistance = Number(state.suggestedRoute?.distance);
    const difference = Number.isFinite(suggestedDistance) ? state.playerDistance - suggestedDistance : NaN;
    const efficiency = Number.isFinite(suggestedDistance) && state.playerDistance > 0
      ? Math.min(999, suggestedDistance / state.playerDistance * 100)
      : NaN;
    const suggestedStatus = state.suggestedRoute
      ? ''
      : '<div class="compare-status">Suggested route unavailable. Your completed route is still shown.</div>';
    state.legend.innerHTML = `
      <div class="compare-title">Route Comparison</div>
      <div class="compare-subtitle">Move and zoom the map to review the completed response.</div>
      <div class="compare-row">
        <div class="compare-label"><span class="compare-swatch" style="background:${COLORS.user}"></span>Your Route</div>
        <button type="button" data-toggle="player" aria-pressed="true">Hide</button>
      </div>
      <div class="compare-row">
        <div class="compare-label"><span class="compare-swatch" style="background:${COLORS.suggested}"></span>Suggested Route</div>
        <button type="button" data-toggle="suggested" aria-pressed="${state.suggestedRoute ? 'true' : 'false'}" ${state.suggestedRoute ? '' : 'disabled'}>Hide</button>
      </div>
      <div class="compare-stats">
        Your distance: <strong>${formatDistance(state.playerDistance)}</strong><br>
        Suggested distance: <strong>${formatDistance(suggestedDistance)}</strong><br>
        Difference: <strong>${Number.isFinite(difference) ? `${difference >= 0 ? '+' : ''}${formatDistance(difference)}` : 'Unavailable'}</strong><br>
        Efficiency: <strong>${Number.isFinite(efficiency) ? `${Math.round(efficiency)}%` : 'Unavailable'}</strong><br>
        Response time: <strong>${formatTime(state.elapsedMs)}</strong>
      </div>
      ${suggestedStatus}
      <button class="compare-close" type="button">Close Comparison</button>
    `;
    state.legend.querySelector('[data-toggle="player"]')?.addEventListener('click', event => {
      const showing = event.currentTarget.getAttribute('aria-pressed') !== 'false';
      setLineVisible(state.playerLine, !showing);
      event.currentTarget.setAttribute('aria-pressed', String(!showing));
      event.currentTarget.textContent = showing ? 'Show' : 'Hide';
    });
    state.legend.querySelector('[data-toggle="suggested"]')?.addEventListener('click', event => {
      const showing = event.currentTarget.getAttribute('aria-pressed') !== 'false';
      setLineVisible(state.suggestedLine, !showing);
      event.currentTarget.setAttribute('aria-pressed', String(!showing));
      event.currentTarget.textContent = showing ? 'Show' : 'Hide';
    });
    state.legend.querySelector('.compare-close')?.addEventListener('click', () => closeReview());
  }

  function setMobileControlsDisabled(disabled) {
    try {
      if (window.parent === window) return;
      const parentDoc = window.parent.document;
      const controls = parentDoc.querySelector('.mobile-controls');
      const topbar = parentDoc.querySelector('.mobile-topbar');
      controls?.classList.toggle('ptbo-review-dimmed', disabled);
      if (controls) controls.style.pointerEvents = disabled ? 'none' : '';
      topbar?.classList.toggle('ptbo-review-dimmed', disabled);
    } catch (_) {}
  }

  function stopVehicleInput(event) {
    if (!state.reviewOpen) return;
    if (event.key?.startsWith('Arrow') || ['w','a','s','d','W','A','S','D'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  window.addEventListener('keydown', stopVehicleInput, true);
  window.addEventListener('keyup', stopVehicleInput, true);

  function forceVehicleStopped() {
    if (!state.reviewOpen) return;
    try {
      velocity = 0;
      Object.keys(keys || {}).forEach(key => { keys[key] = false; });
    } catch (_) {}
  }

  async function openReview() {
    if (!state.completed || !state.start || state.points.length < 2 || !mapInstance) return;
    state.reviewOpen = true;
    setButtonVisible(true);
    if (window.PTBO_ROUTE_REVEAL?.hideRoute) window.PTBO_ROUTE_REVEAL.hideRoute();
    if (!state.suggestedRoute) {
      state.suggestedPromise ||= calculateSuggestedRoute();
      await Promise.race([state.suggestedPromise, new Promise(resolve => setTimeout(resolve, 1800))]);
    }

    clearLayers();
    const playerPoints = simplify(state.points);
    state.playerLine = drawPolyline(playerPoints, COLORS.user);
    if (state.suggestedRoute?.coordinates?.length) {
      state.suggestedLine = drawPolyline(state.suggestedRoute.coordinates, COLORS.suggested);
    }
    addLayer(L.circleMarker([state.start.lat, state.start.lng], {
      radius: 7, color: '#fff', weight: 3, fillColor: '#0f172a', fillOpacity: 1,
    }).bindTooltip('Dispatch Start', { permanent: false, direction: 'top' }));
    addLayer(L.circleMarker([state.destination.lat, state.destination.lng], {
      radius: 8, color: '#fff', weight: 3, fillColor: '#dc2626', fillOpacity: 1,
    }).bindTooltip('Incident', { permanent: false, direction: 'top' }));

    const camera = document.getElementById('chk-camera');
    if (camera) {
      state.previousCameraLock = camera.checked;
      camera.checked = false;
    }
    try { headingUpMode = false; updateMapOrientation?.(); } catch (_) {}
    setMobileControlsDisabled(true);
    buildLegend();
    state.legend?.classList.remove('hidden');

    const group = L.featureGroup(state.layers);
    if (group.getBounds().isValid()) mapInstance.fitBounds(group.getBounds(), { padding: [55, 55], maxZoom: 16, animate: true });
  }

  function closeReview({ silent = false } = {}) {
    if (!state.reviewOpen && !state.layers.length) {
      if (!silent) setButtonVisible(state.completed);
      return;
    }
    state.reviewOpen = false;
    clearLayers();
    state.legend?.classList.add('hidden');
    setMobileControlsDisabled(false);
    const camera = document.getElementById('chk-camera');
    if (camera && state.previousCameraLock !== null) camera.checked = state.previousCameraLock;
    state.previousCameraLock = null;
    if (!silent) {
      setButtonVisible(state.completed);
      if (mapInstance && Number.isFinite(Number(simLat))) mapInstance.setView([simLat, simLng], mapInstance.getZoom(), { animate: true });
    }
  }

  function sync() {
    if (!globalsReady()) return;
    installUi();
    forceVehicleStopped();

    if (simulationState === STATES.ENROUTE && activeIncident) {
      const key = incidentKey(activeIncident);
      if (!state.recording || state.runKey !== key) startRun();
      sampleRun();
      return;
    }

    if (state.recording && (simulationState === STATES.ONSCENE || simulationState === STATES.INSERVICE)) {
      completeRun();
    }

    const actionButton = document.getElementById('hud-action-btn');
    const isFinished = state.completed && simulationState === STATES.INSERVICE;
    const nextCallReady = actionButton && /next call/i.test(actionButton.textContent || '');
    setButtonVisible(Boolean(isFinished && nextCallReady));

    if (state.completed && simulationState === STATES.INACTIVE) resetRun();
  }

  function initialize() {
    installStyles();
    const observer = new MutationObserver(() => {
      installUi();
      installVersionBadge();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    state.statusTimer = setInterval(sync, 120);
    sync();
    window.dispatchEvent(new CustomEvent('ptbo-route-compare-ready', { detail: { version: VERSION } }));
  }

  window.PTBO_ROUTE_COMPARE = Object.freeze({
    version: VERSION,
    state,
    open: openReview,
    close: closeReview,
    reset: resetRun,
  });

  initialize();
})();