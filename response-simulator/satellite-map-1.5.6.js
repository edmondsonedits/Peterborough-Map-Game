/* =========================================================
   BEGINNER CODE GUIDE — SATELLITE HYBRID MAP AND ZOOM PRELOADER

   PURPOSE:
   Makes Esri World Imagery with hybrid labels the default response-simulator
   map, adds a one-tap Normal Map / Satellite button, and warms the next zoom
   level before Leaflet changes scale.

   WHAT THE PLAYER EXPERIENCES:
   - The simulator opens on satellite imagery with road and place labels.
   - A visible button switches between Satellite and the normal street map.
   - Speed-based camera zooms wait briefly for the required imagery and label
     tiles, reducing black flashes and partially rendered map frames on phones.

   SAFE EDITING:
   This module does not replace truck movement, road collision, dispatch data,
   route comparison, or mobile steering. It only manages Leaflet basemap layers
   and zoom requests.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.6.0';
  if (window.PTBO_SATELLITE_MAP?.version === VERSION) return;

  const ESRI_IMAGERY_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const ESRI_LABELS_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';
  const ESRI_ATTRIBUTION = 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community';
  const LABEL_ATTRIBUTION = 'Reference labels &copy; Esri';

  const NORMAL_MAPS = Object.freeze({
    osm: {
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      subdomains: 'abc',
      attribution: '&copy; OpenStreetMap contributors',
    },
    positron: {
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
    dark: {
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    },
  });

  const state = {
    installed: false,
    mode: 'satellite',
    normalStyle: 'osm',
    imageryLayer: null,
    labelsLayer: null,
    normalLayer: null,
    switchToken: 0,
    pendingZoom: null,
    bypassZoomGuard: false,
    cache: new Set(),
    inFlight: new Map(),
    warmTimer: 0,
    originalChangeBasemap: null,
    originalZoomMethods: null,
  };

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

  function getMap() {
    try {
      return typeof mapInstance !== 'undefined' ? mapInstance : null;
    } catch (_) {
      return null;
    }
  }

  async function waitForMap(timeoutMilliseconds = 20000) {
    const startedAt = performance.now();
    while (true) {
      const map = getMap();
      if (map && window.L?.tileLayer) return map;
      if (performance.now() - startedAt > timeoutMilliseconds) {
        throw new Error('Leaflet map did not become ready for satellite mode.');
      }
      await sleep(50);
    }
  }

  function installPanes(map) {
    const imageryPane = map.getPane('ptbo-satellite-imagery') || map.createPane('ptbo-satellite-imagery');
    const labelsPane = map.getPane('ptbo-satellite-labels') || map.createPane('ptbo-satellite-labels');
    imageryPane.style.zIndex = '200';
    labelsPane.style.zIndex = '210';
    imageryPane.style.pointerEvents = 'none';
    labelsPane.style.pointerEvents = 'none';
    imageryPane.style.transition = 'opacity 220ms ease';
    labelsPane.style.transition = 'opacity 220ms ease';
  }

  function commonTileOptions() {
    return {
      minZoom: 10,
      maxZoom: 19,
      maxNativeZoom: 19,
      tileSize: 256,
      updateWhenIdle: false,
      updateWhenZooming: false,
      keepBuffer: 6,
      crossOrigin: false,
    };
  }

  function createSatelliteLayers(opacity = 1) {
    return {
      imagery: L.tileLayer(ESRI_IMAGERY_URL, {
        ...commonTileOptions(),
        pane: 'ptbo-satellite-imagery',
        opacity,
        attribution: ESRI_ATTRIBUTION,
      }),
      labels: L.tileLayer(ESRI_LABELS_URL, {
        ...commonTileOptions(),
        pane: 'ptbo-satellite-labels',
        opacity,
        attribution: LABEL_ATTRIBUTION,
      }),
    };
  }

  function createNormalLayer(styleKey = 'osm', opacity = 1) {
    const provider = NORMAL_MAPS[styleKey] || NORMAL_MAPS.osm;
    return L.tileLayer(provider.url, {
      ...commonTileOptions(),
      subdomains: provider.subdomains,
      opacity,
      attribution: provider.attribution,
    });
  }

  function waitForLayer(layer, timeoutMilliseconds = 4200) {
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        layer.off('load', finish);
        resolve(layer);
      };
      const timeout = setTimeout(finish, timeoutMilliseconds);
      layer.once('load', finish);
    });
  }

  function safelyRemove(map, layer) {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  }

  function removeLegacyLayer(map) {
    try {
      if (typeof tileLayerInstance !== 'undefined' && tileLayerInstance) {
        safelyRemove(map, tileLayerInstance);
      }
    } catch (_) {
      // Older simulator builds may not expose the legacy tile binding.
    }
  }

  function setLegacyLayerReference(layer) {
    try {
      if (typeof tileLayerInstance !== 'undefined') tileLayerInstance = layer;
    } catch (_) {
      // The modern module can still operate if the old binding is unavailable.
    }
  }

  function updateControls() {
    const select = document.getElementById('layer-select');
    if (select) {
      const expected = state.mode === 'satellite' ? 'satellite' : state.normalStyle;
      if (select.value !== expected) select.value = expected;
    }

    const button = document.getElementById('ptbo-map-toggle');
    if (!button) return;
    const satelliteActive = state.mode === 'satellite';
    button.classList.toggle('satellite-active', satelliteActive);
    button.setAttribute('aria-pressed', String(satelliteActive));
    button.setAttribute('aria-label', satelliteActive ? 'Switch to normal street map' : 'Switch to satellite map');
    button.querySelector('[data-map-label]').textContent = satelliteActive ? 'Normal Map' : 'Satellite';
  }

  function setButtonBusy(isBusy) {
    const button = document.getElementById('ptbo-map-toggle');
    if (!button) return;
    button.classList.toggle('loading', Boolean(isBusy));
    button.disabled = Boolean(isBusy);
  }

  async function showSatellite({ initial = false } = {}) {
    const map = getMap();
    if (!map) return;
    const token = ++state.switchToken;
    setButtonBusy(true);

    const next = createSatelliteLayers(initial ? 1 : 0);
    next.imagery.addTo(map);
    next.labels.addTo(map);

    await Promise.all([
      waitForLayer(next.imagery),
      waitForLayer(next.labels),
    ]);

    if (token !== state.switchToken) {
      safelyRemove(map, next.imagery);
      safelyRemove(map, next.labels);
      return;
    }

    if (!initial) {
      next.imagery.setOpacity(1);
      next.labels.setOpacity(1);
      await sleep(230);
    }

    safelyRemove(map, state.imageryLayer);
    safelyRemove(map, state.labelsLayer);
    safelyRemove(map, state.normalLayer);
    removeLegacyLayer(map);

    state.imageryLayer = next.imagery;
    state.labelsLayer = next.labels;
    state.normalLayer = null;
    state.mode = 'satellite';
    setLegacyLayerReference(next.imagery);
    updateControls();
    setButtonBusy(false);
    scheduleAdjacentWarm();
  }

  async function showNormal(styleKey = 'osm') {
    const map = getMap();
    if (!map) return;
    const resolvedStyle = NORMAL_MAPS[styleKey] ? styleKey : 'osm';
    const token = ++state.switchToken;
    setButtonBusy(true);

    const next = createNormalLayer(resolvedStyle, 0);
    next.addTo(map);
    await waitForLayer(next);

    if (token !== state.switchToken) {
      safelyRemove(map, next);
      return;
    }

    next.setOpacity(1);
    await sleep(230);

    safelyRemove(map, state.normalLayer);
    safelyRemove(map, state.imageryLayer);
    safelyRemove(map, state.labelsLayer);
    removeLegacyLayer(map);

    state.normalLayer = next;
    state.imageryLayer = null;
    state.labelsLayer = null;
    state.mode = 'normal';
    state.normalStyle = resolvedStyle;
    setLegacyLayerReference(next);
    updateControls();
    setButtonBusy(false);
  }

  function installLayerSelect() {
    const select = document.getElementById('layer-select');
    if (!select) return;

    if (!select.querySelector('option[value="satellite"]')) {
      const option = document.createElement('option');
      option.value = 'satellite';
      option.textContent = 'Esri Satellite Hybrid (Default)';
      select.insertBefore(option, select.firstChild);
    }

    state.originalChangeBasemap = window.changeBasemap;
    window.changeBasemap = () => {
      const selected = select.value;
      if (selected === 'satellite') return showSatellite();
      return showNormal(selected);
    };
    select.value = 'satellite';
  }

  function installToggleButton() {
    if (document.getElementById('ptbo-map-toggle')) return;

    const style = document.createElement('style');
    style.id = 'ptbo-map-toggle-style';
    style.textContent = `
      #ptbo-map-toggle{
        position:absolute;top:66px;left:15px;z-index:1450;min-height:42px;padding:9px 12px;
        display:flex;align-items:center;gap:8px;color:#fff;border:1px solid rgba(255,255,255,.28);
        border-radius:11px;background:rgba(17,24,39,.94);box-shadow:0 6px 18px rgba(0,0,0,.4);
        font:800 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;
        touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .14s,opacity .14s,background .14s;
      }
      #ptbo-map-toggle:hover{background:rgba(31,41,55,.98)}
      #ptbo-map-toggle:active{transform:scale(.96)}
      #ptbo-map-toggle:focus-visible{outline:3px solid #38bdf8;outline-offset:2px}
      #ptbo-map-toggle:disabled{cursor:wait;opacity:.78}
      #ptbo-map-toggle svg{width:20px;height:20px;stroke:currentColor;flex:0 0 auto}
      #ptbo-map-toggle.loading svg{animation:ptbo-map-spin .85s linear infinite}
      @keyframes ptbo-map-spin{to{transform:rotate(360deg)}}
      @media(max-width:900px),(pointer:coarse){
        #ptbo-map-toggle{top:66px;left:10px;min-height:40px;padding:8px 10px;border-radius:12px;font-size:11px}
      }
      @media(max-width:370px){#ptbo-map-toggle{padding:8px 9px}#ptbo-map-toggle svg{width:18px;height:18px}}
    `;

    const button = document.createElement('button');
    button.id = 'ptbo-map-toggle';
    button.type = 'button';
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m3 6 9-4 9 4-9 4-9-4Z"/><path d="m3 12 9 4 9-4"/><path d="m3 17 9 4 9-4"/>
      </svg>
      <span data-map-label>Normal Map</span>
    `;
    button.addEventListener('click', () => {
      if (state.mode === 'satellite') showNormal('osm');
      else showSatellite();
    });

    document.head.appendChild(style);
    document.body.appendChild(button);
    updateControls();
  }

  function replaceTileTemplate(template, zoom, x, y) {
    return template
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
  }

  function tileUrlsForView(center, zoom, ring = 1) {
    const map = getMap();
    if (!map || state.mode !== 'satellite') return [];

    const normalizedZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(Number(zoom))));
    const size = map.getSize();
    const centerPoint = map.project(center, normalizedZoom);
    const tileSize = 256;
    const minimumX = Math.floor((centerPoint.x - size.x / 2) / tileSize) - ring;
    const maximumX = Math.floor((centerPoint.x + size.x / 2) / tileSize) + ring;
    const minimumY = Math.floor((centerPoint.y - size.y / 2) / tileSize) - ring;
    const maximumY = Math.floor((centerPoint.y + size.y / 2) / tileSize) + ring;
    const tileCount = 2 ** normalizedZoom;
    const urls = [];

    for (let x = minimumX; x <= maximumX; x += 1) {
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      for (let y = minimumY; y <= maximumY; y += 1) {
        if (y < 0 || y >= tileCount) continue;
        urls.push(replaceTileTemplate(ESRI_IMAGERY_URL, normalizedZoom, wrappedX, y));
        urls.push(replaceTileTemplate(ESRI_LABELS_URL, normalizedZoom, wrappedX, y));
      }
    }
    return urls;
  }

  function trimCache(maximumEntries = 700) {
    while (state.cache.size > maximumEntries) {
      const oldest = state.cache.values().next().value;
      state.cache.delete(oldest);
    }
  }

  function preloadUrl(url) {
    if (state.cache.has(url)) return Promise.resolve({ url, cached: true });
    if (state.inFlight.has(url)) return state.inFlight.get(url);

    const promise = new Promise(resolve => {
      const image = new Image();
      const finish = loaded => {
        image.onload = null;
        image.onerror = null;
        state.inFlight.delete(url);
        if (loaded) {
          state.cache.add(url);
          trimCache();
        }
        resolve({ url, loaded });
      };
      image.decoding = 'async';
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });

    state.inFlight.set(url, promise);
    return promise;
  }

  async function preloadZoom(center, zoom, { ring = 1, timeout = 1650 } = {}) {
    if (state.mode !== 'satellite') return;
    const urls = tileUrlsForView(center, zoom, ring);
    if (!urls.length) return;

    await Promise.race([
      Promise.allSettled(urls.map(preloadUrl)),
      sleep(timeout),
    ]);
  }

  function scheduleAdjacentWarm() {
    clearTimeout(state.warmTimer);
    state.warmTimer = setTimeout(() => {
      const map = getMap();
      if (!map || state.mode !== 'satellite') return;
      const center = map.getCenter();
      const zoom = map.getZoom();
      const run = () => {
        if (zoom > map.getMinZoom()) preloadZoom(center, zoom - 1, { ring: 1, timeout: 2400 });
        if (zoom < map.getMaxZoom()) setTimeout(() => preloadZoom(center, zoom + 1, { ring: 0, timeout: 2400 }), 250);
      };
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 900 });
      else setTimeout(run, 100);
    }, 180);
  }

  function cancelPendingZoom(expectedZoom) {
    if (!state.pendingZoom || state.pendingZoom.zoom !== expectedZoom) return false;
    state.pendingZoom = null;
    setButtonBusy(false);
    return true;
  }

  function queueZoom(center, zoom, perform) {
    const map = getMap();
    if (!map || state.bypassZoomGuard || state.mode !== 'satellite') {
      return perform();
    }

    const targetZoom = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), Math.round(Number(zoom))));
    if (!Number.isFinite(targetZoom) || targetZoom === map.getZoom()) return perform();

    if (state.pendingZoom?.zoom === targetZoom) {
      state.pendingZoom.perform = perform;
      state.pendingZoom.center = L.latLng(center);
      return map;
    }

    const request = {
      id: Symbol('zoom-request'),
      zoom: targetZoom,
      center: L.latLng(center),
      perform,
    };
    state.pendingZoom = request;
    setButtonBusy(true);

    preloadZoom(request.center, request.zoom, { ring: 1, timeout: 1650 })
      .catch(() => undefined)
      .finally(() => {
        if (state.pendingZoom !== request) return;
        const latestPerform = request.perform;
        state.pendingZoom = null;
        state.bypassZoomGuard = true;
        try {
          latestPerform();
        } finally {
          state.bypassZoomGuard = false;
          setButtonBusy(false);
          scheduleAdjacentWarm();
        }
      });

    return map;
  }

  function installZoomGuard(map) {
    if (state.originalZoomMethods) return;
    state.originalZoomMethods = {
      setZoom: map.setZoom,
      setView: map.setView,
      flyTo: map.flyTo,
      setZoomAround: map.setZoomAround,
    };

    map.setZoom = function guardedSetZoom(zoom, options) {
      const perform = () => state.originalZoomMethods.setZoom.call(this, zoom, options);
      return queueZoom(this.getCenter(), zoom, perform);
    };

    map.setView = function guardedSetView(center, zoom, options) {
      const perform = () => state.originalZoomMethods.setView.call(this, center, zoom, options);
      if (typeof zoom !== 'number') return perform();
      return queueZoom(center, zoom, perform);
    };

    map.flyTo = function guardedFlyTo(center, zoom, options) {
      const perform = () => state.originalZoomMethods.flyTo.call(this, center, zoom, options);
      if (typeof zoom !== 'number') return perform();
      return queueZoom(center, zoom, perform);
    };

    map.setZoomAround = function guardedSetZoomAround(latlngOrPoint, zoom, options) {
      const center = latlngOrPoint instanceof L.LatLng ? latlngOrPoint : this.getCenter();
      const perform = () => state.originalZoomMethods.setZoomAround.call(this, latlngOrPoint, zoom, options);
      return queueZoom(center, zoom, perform);
    };

    map.on('moveend zoomend resize', scheduleAdjacentWarm);
  }

  function keepVersionBadgeCurrent() {
    const update = () => {
      const badge = document.getElementById('ptbo-version-badge');
      if (badge) badge.textContent = `v${VERSION}`;
    };
    update();
    [250, 750, 1500, 3000].forEach(delay => setTimeout(update, delay));
  }

  async function initialize() {
    const map = await waitForMap();
    installPanes(map);
    installLayerSelect();
    installToggleButton();
    installZoomGuard(map);

    map.options.zoomAnimation = true;
    map.options.fadeAnimation = true;
    await showSatellite({ initial: true });

    keepVersionBadgeCurrent();
    state.installed = true;
    const detail = {
      version: VERSION,
      provider: 'Esri World Imagery with hybrid labels',
      mode: state.mode,
      preload: true,
    };
    window.dispatchEvent(new CustomEvent('ptbo-satellite-map-ready', { detail }));
    try {
      window.parent?.postMessage({ type: 'ptbo-satellite-map-ready', detail }, location.origin);
    } catch (_) {
      // Parent notification is optional; the map is already ready locally.
    }
    return detail;
  }

  const ready = initialize().catch(async error => {
    console.error('Satellite map initialization failed; normal map retained.', error);
    state.mode = 'normal';
    state.normalStyle = 'osm';
    updateControls();
    setButtonBusy(false);
    window.dispatchEvent(new CustomEvent('ptbo-satellite-map-error', { detail: { version: VERSION, error } }));
    throw error;
  });

  window.PTBO_SATELLITE_MAP = Object.freeze({
    version: VERSION,
    state,
    ready,
    showSatellite,
    showNormal,
    preloadZoom,
    cancelPendingZoom,
  });
  window.PTBO_SATELLITE_MAP_READY = ready;
})();
