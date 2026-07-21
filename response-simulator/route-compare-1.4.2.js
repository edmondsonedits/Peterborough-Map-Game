(() => {
  'use strict';

  const VERSION = '1.4.20';
  if (window.PTBO_ROUTE_COMPARE_BOOT_VERSION === VERSION) return;
  window.PTBO_ROUTE_COMPARE_BOOT_VERSION = VERSION;

  const COLORS = Object.freeze({
    player: '#2563eb',
    suggested: '#22c55e',
    casing: '#ffffff',
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
    lastPoint: null,
    playerDistance: 0,
    elapsedMs: 0,
    suggestedRoute: null,
    routePromise: null,
    button: null,
    legend: null,
    layers: [],
    playerLine: null,
    suggestedLine: null,
    previousCameraLock: null,
    cameraReviewActive: false,
    timer: null,
  };

  function globalsReady() {
    return typeof mapInstance !== 'undefined' && Boolean(mapInstance) &&
      typeof simulationState !== 'undefined' && typeof STATES !== 'undefined';
  }

  function pointNow() {
    const lat = Number(typeof simLat !== 'undefined' ? simLat : NaN);
    const lng = Number(typeof simLng !== 'undefined' ? simLng : NaN);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }

  function incidentKey(incident) {
    if (!incident) return null;
    return incident.id || `${incident.name}|${incident.addr}|${incident.lat}|${incident.lng}`;
  }

  function distanceMeters(a, b) {
    if (!a || !b) return 0;
    try {
      if (mapInstance?.distance) return mapInstance.distance([a.lat, a.lng], [b.lat, b.lng]);
    } catch (_) {}
    const radius = 6371000;
    const toRad = value => value * Math.PI / 180;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const dLat = lat2 - lat1;
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return 'Unavailable';
    if (Math.abs(meters) < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(Math.abs(meters) < 10000 ? 1 : 0)} km`;
  }

  function formatTime(milliseconds) {
    const total = Math.max(0, Number(milliseconds) || 0) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4, '0')}` : `${seconds.toFixed(1)} s`;
  }

  function installStyles() {
    if (document.getElementById('ptbo-route-compare-styles')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-route-compare-styles';
    style.textContent = `
      #ptbo-compare-route-btn{display:none;margin-top:6px;background:#1d4ed8;border:1px solid #60a5fa;color:#fff}
      #ptbo-compare-route-btn:hover{background:#1e40af}
      #ptbo-compare-route-btn.is-open{background:#374151;border-color:#9ca3af}
      #ptbo-route-legend{position:absolute;left:15px;top:118px;z-index:1400;width:min(280px,calc(100vw - 30px));padding:12px;color:#f8fafc;border:1px solid rgba(255,255,255,.24);border-radius:11px;background:rgba(7,17,31,.95);box-shadow:0 8px 28px rgba(0,0,0,.42);backdrop-filter:blur(6px)}
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
      #ptbo-version-badge{margin-top:18px;color:#9ca3af;font-size:8px;font-weight:700;letter-spacing:.08em;text-align:right;opacity:.58}
      @media(max-width:900px),(pointer:coarse){
        #ptbo-route-legend{top:calc(158px + env(safe-area-inset-top));left:10px;width:min(260px,calc(100vw - 20px));padding:10px}
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
    const nextText = `v${VERSION}`;
    if (badge.textContent !== nextText) badge.textContent = nextText;
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

  function setButtonVisible(visible, label) {
    if (!state.button?.isConnected) installUi();
    if (!state.button) return;
    state.button.style.display = visible ? 'block' : 'none';
    state.button.disabled = !visible;
    state.button.classList.toggle('is-open', state.reviewOpen);
    state.button.textContent = label || (state.reviewOpen ? 'Close Comparison' : 'Compare Route');
  }

  function clearLayers() {
    if (mapInstance) {
      state.layers.forEach(layer => {
        try { mapInstance.removeLayer(layer); } catch (_) {}
      });
    }
    state.layers = [];
    state.playerLine = null;
    state.suggestedLine = null;
  }

  function addLayer(layer) {
    state.layers.push(layer);
    return layer.addTo(mapInstance);
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
    state.lastPoint = null;
    state.playerDistance = 0;
    state.elapsedMs = 0;
    state.suggestedRoute = null;
    state.routePromise = null;
    setButtonVisible(false);
  }

  function startRun() {
    if (!activeIncident) return;
    const start = pointNow();
    if (!start) return;
    closeReview({ silent: true });
    state.runKey = incidentKey(activeIncident);
    state.recording = true;
    state.completed = false;
    state.start = start;
    state.destination = { lat: Number(activeIncident.lat), lng: Number(activeIncident.lng) };
    state.incident = { ...activeIncident };
    state.points = [start];
    state.lastPoint = start;
    state.playerDistance = 0;
    state.elapsedMs = 0;
    state.suggestedRoute = null;
    state.routePromise = null;
    setButtonVisible(false);
  }

  function sampleRun() {
    if (!state.recording) return;
    const point = pointNow();
    if (!point) return;
    state.elapsedMs = Number(typeof elapsedMilliseconds !== 'undefined' ? elapsedMilliseconds : state.elapsedMs) || state.elapsedMs;
    const moved = distanceMeters(state.lastPoint, point);
    if (moved < 4) return;
    state.playerDistance += moved;
    state.points.push(point);
    state.lastPoint = point;
  }

  function completeRun() {
    if (!state.recording || state.completed) return;
    const finalPoint = pointNow();
    if (finalPoint) {
      const moved = distanceMeters(state.lastPoint, finalPoint);
      if (moved > 1) {
        state.playerDistance += moved;
        state.points.push(finalPoint);
        state.lastPoint = finalPoint;
      }
    }
    state.elapsedMs = Number(typeof elapsedMilliseconds !== 'undefined' ? elapsedMilliseconds : state.elapsedMs) || state.elapsedMs;
    state.recording = false;
    state.completed = true;
  }

  async function getSuggestedRoute() {
    if (state.suggestedRoute) return state.suggestedRoute;
    if (state.routePromise) return state.routePromise;
    state.routePromise = (async () => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const router = window.PTBO_ROUTE_REVEAL;
        if (router?.calculateRoute) {
          try { await router.ready; } catch (_) {}
          try {
            state.suggestedRoute = router.calculateRoute(
              state.start.lat,
              state.start.lng,
              state.destination.lat,
              state.destination.lng,
            ) || null;
          } catch (error) {
            console.error('Suggested route comparison failed.', error);
            state.suggestedRoute = null;
          }
          return state.suggestedRoute;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return null;
    })();
    return state.routePromise;
  }

  function simplify(points, toleranceMeters = 2.5) {
    if (!Array.isArray(points) || points.length < 3) return points || [];
    const startLat = state.start?.lat || points[0].lat;
    const scaleX = 111320 * Math.cos(startLat * Math.PI / 180);
    const source = points.map(point => ({ x: point.lng * scaleX, y: point.lat * 110540, point }));
    const keep = new Uint8Array(source.length);
    keep[0] = 1;
    keep[source.length - 1] = 1;
    const stack = [[0, source.length - 1]];
    const toleranceSq = toleranceMeters * toleranceMeters;
    while (stack.length) {
      const [first, last] = stack.pop();
      const a = source[first];
      const b = source[last];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      let maxDistanceSq = 0;
      let maxIndex = -1;
      for (let index = first + 1; index < last; index += 1) {
        const p = source[index];
        const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
        const px = a.x + dx * t;
        const py = a.y + dy * t;
        const distanceSq = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (distanceSq > maxDistanceSq) {
          maxDistanceSq = distanceSq;
          maxIndex = index;
        }
      }
      if (maxIndex > 0 && maxDistanceSq > toleranceSq) {
        keep[maxIndex] = 1;
        stack.push([first, maxIndex], [maxIndex, last]);
      }
    }
    return source.filter((_, index) => keep[index]).map(item => item.point);
  }

  function drawPolyline(points, color) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const line = addLayer(L.polyline(points, {
      color,
      weight: 14,
      opacity: .34,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
    }));
    line._ptboVisibleOpacity = .34;
    return line;
  }

  function setLineVisible(line, visible) {
    if (!line) return;
    line.setStyle({ opacity: visible ? (line._ptboVisibleOpacity ?? .34) : 0 });
  }

  function buildLegend() {
    if (!state.legend) return;
    const suggestedDistance = Number(state.suggestedRoute?.distance);
    const difference = Number.isFinite(suggestedDistance) ? state.playerDistance - suggestedDistance : NaN;
    const efficiency = Number.isFinite(suggestedDistance) && state.playerDistance > 0
      ? Math.min(999, suggestedDistance / state.playerDistance * 100)
      : NaN;
    state.legend.innerHTML = `
      <div class="compare-title">Route Comparison</div>
      <div class="compare-subtitle">Blue is your route · green is suggested · teal is shared. Street names remain visible beneath the highlights.</div>
      <div class="compare-row">
        <div class="compare-label"><span class="compare-swatch" style="background:${COLORS.player}"></span>Your Route</div>
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
      ${state.suggestedRoute ? '' : '<div class="compare-status">Suggested route unavailable. Your completed route is still shown.</div>'}
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
      if (controls) {
        controls.style.pointerEvents = disabled ? 'none' : '';
        controls.style.opacity = disabled ? '.34' : '';
      }
      if (topbar) topbar.style.opacity = disabled ? '.45' : '';
    } catch (_) {}
  }

  function stopVehicleInput(event) {
    if (!state.reviewOpen) return;
    if (event.key?.startsWith('Arrow') || ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function forceVehicleStopped() {
    if (!state.reviewOpen) return;
    try {
      velocity = 0;
      Object.keys(keys || {}).forEach(key => { keys[key] = false; });
    } catch (_) {}
  }

  async function openReview() {
    if (!state.completed || !state.start || !state.destination || !mapInstance) return;
    state.reviewOpen = true;
    setButtonVisible(true, 'Loading…');
    try { window.PTBO_ROUTE_REVEAL?.hideRoute?.(); } catch (_) {}
    await Promise.race([getSuggestedRoute(), new Promise(resolve => setTimeout(resolve, 2200))]);

    clearLayers();
    const playerPoints = simplify(state.points);
    state.playerLine = drawPolyline(playerPoints, COLORS.player);
    if (state.suggestedRoute?.coordinates?.length) {
      state.suggestedLine = drawPolyline(state.suggestedRoute.coordinates, COLORS.suggested);
    }
    addLayer(L.circleMarker([state.start.lat, state.start.lng], {
      radius: 7,
      color: '#fff',
      weight: 3,
      fillColor: '#0f172a',
      fillOpacity: 1,
    }).bindTooltip('Dispatch Start', { direction: 'top' }));
    addLayer(L.circleMarker([state.destination.lat, state.destination.lng], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#dc2626',
      fillOpacity: 1,
    }).bindTooltip('Incident', { direction: 'top' }));

    const drivingCamera = window.PTBO_DRIVING_CAMERA;
    if (drivingCamera?.setReviewMode) {
      state.cameraReviewActive = Boolean(drivingCamera.setReviewMode(true));
    }
    const camera = document.getElementById('chk-camera');
    if (!state.cameraReviewActive && camera) {
      state.previousCameraLock = camera.checked;
      camera.checked = false;
    }
    setMobileControlsDisabled(true);
    buildLegend();
    state.legend?.classList.remove('hidden');
    setButtonVisible(true);

    const group = L.featureGroup(state.layers);
    if (group.getBounds().isValid()) {
      mapInstance.invalidateSize({ pan: false });
      mapInstance.fitBounds(group.getBounds(), { padding: [55, 55], maxZoom: 16, animate: false });
    }
  }

  function closeReview({ silent = false } = {}) {
    state.reviewOpen = false;
    clearLayers();
    state.legend?.classList.add('hidden');
    setMobileControlsDisabled(false);
    if (state.cameraReviewActive) {
      window.PTBO_DRIVING_CAMERA?.setReviewMode?.(false);
      state.cameraReviewActive = false;
    }
    const camera = document.getElementById('chk-camera');
    if (camera && state.previousCameraLock !== null) camera.checked = state.previousCameraLock;
    state.previousCameraLock = null;
    if (!silent) {
      setButtonVisible(state.completed);
      const point = pointNow();
      if (point && mapInstance) mapInstance.setView([point.lat, point.lng], mapInstance.getZoom(), { animate: true });
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
    const nextCallReady = Boolean(actionButton && /next call/i.test(actionButton.textContent || ''));
    setButtonVisible(Boolean(state.completed && nextCallReady));
  }

  function initialize() {
    installUi();
    window.addEventListener('ptbo-route-review-close', () => closeReview());
    window.addEventListener('keydown', stopVehicleInput, true);
    window.addEventListener('keyup', stopVehicleInput, true);
    state.timer = setInterval(sync, 150);
    sync();
    window.PTBO_ROUTE_COMPARE = Object.freeze({
      version: VERSION,
      state,
      open: openReview,
      close: closeReview,
      reset: resetRun,
    });
    window.dispatchEvent(new CustomEvent('ptbo-route-compare-ready', { detail: { version: VERSION } }));
  }

  initialize();
})();
