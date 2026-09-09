/* Commercial basemap policy for Emergency Games v1.6.37.
   Keeps the public demo working while making department/commercial deployments
   fail closed unless production map services are explicitly configured. */
(() => {
  'use strict';

  const VERSION = '1.6.37';
  const OSM_COMMUNITY_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const BLANK_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const CARTO_VALUES = new Set(['positron', 'dark']);
  const CARTO_HOST = /(?:^|\.)basemaps\.cartocdn\.com$/i;
  const OSM_HOST = /(?:^|\.)tile\.openstreetmap\.org$/i;
  const ESRI_IMAGERY = /(?:server\.arcgisonline\.com|ibasemaps-api\.arcgis\.com)\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile/i;
  const ESRI_LABELS = /services\.arcgisonline\.com\/ArcGIS\/rest\/services\/Reference\/World_Boundaries_and_Places\/MapServer\/tile/i;

  if (window.PTBO_COMMERCIAL_MAP_POLICY?.version === VERSION) return;

  const stringValue = value => typeof value === 'string' ? value.trim() : '';
  function config() {
    return Object.freeze({
      ...(window.PTBO_DEPLOYMENT?.map || {}),
      ...(window.PTBO_MAP_CONFIG || {}),
      cartoApiKey:stringValue(window.PTBO_MAP_CONFIG?.cartoApiKey || window.PTBO_CARTO_CONFIG?.apiKey),
    });
  }

  function commercialMode() {
    const deployment = window.PTBO_DEPLOYMENT || {};
    const mode = String(deployment.mode || '').toLowerCase();
    return deployment.commercial === true || deployment.private === true || mode === 'department' || mode === 'commercial' || mode === 'private';
  }

  const cartoConfigured = () => Boolean(config().cartoApiKey && stringValue(config().cartoTileUrl));
  const arcgisConfigured = () => Boolean(stringValue(config().arcgisAccessToken));
  const productionOsmConfigured = () => Boolean(stringValue(config().osmTileUrl));

  function sampleUrl(template) {
    return String(template || '')
      .replace('{s}', 'a').replace('{z}', '1').replace('{x}', '1').replace('{y}', '1')
      .replace('{apiKey}', 'key').replace('{token}', 'token');
  }

  function hostname(template) {
    try { return new URL(sampleUrl(template), location.href).hostname; } catch (_) { return ''; }
  }

  function isCartoUrl(template) { return CARTO_HOST.test(hostname(template)) || /cartocdn\.com/i.test(String(template || '')); }
  function isOsmCommunityUrl(template) { return OSM_HOST.test(hostname(template)) || /(?:\{s\}\.)?tile\.openstreetmap\.org/i.test(String(template || '')); }
  function isEsriImageryUrl(template) { return ESRI_IMAGERY.test(String(template || '')); }
  function isEsriLabelsUrl(template) { return ESRI_LABELS.test(String(template || '')); }

  function warnOnce(key, message) {
    const id = `ptbo-map-warning-${key}`;
    if (document.getElementById(id)) return;
    console.warn(message);
    const box = document.createElement('div');
    box.id = id;
    box.setAttribute('role', 'status');
    box.style.cssText = 'position:fixed;left:10px;bottom:32px;z-index:2147483000;max-width:330px;padding:7px 9px;border:1px solid #f59e0b;border-radius:8px;background:rgba(69,26,3,.94);color:#fff;font:700 10px/1.35 system-ui,sans-serif;box-shadow:0 5px 18px #0008';
    box.textContent = message;
    document.body?.appendChild(box);
  }

  function removeUnavailableOptions() {
    const select = document.getElementById('layer-select');
    if (!select) return;
    if (!cartoConfigured()) {
      [...select.options].forEach(option => {
        if (CARTO_VALUES.has(String(option.value || '').toLowerCase())) option.remove();
      });
      if (CARTO_VALUES.has(String(select.value || '').toLowerCase())) select.value = 'osm';
    }
    if (commercialMode() && !productionOsmConfigured()) {
      const osm = select.querySelector('option[value="osm"]');
      if (osm) {
        osm.textContent = 'Street map — production provider required';
        osm.disabled = true;
      }
    }
  }

  function configuredCartoUrl() {
    const c = config();
    return stringValue(c.cartoTileUrl)
      .replaceAll('{apiKey}', encodeURIComponent(c.cartoApiKey))
      .replaceAll('{token}', encodeURIComponent(c.cartoApiKey));
  }

  function configuredOsmUrl() {
    return stringValue(config().osmTileUrl) || OSM_COMMUNITY_URL;
  }

  function arcgisImageryUrl() {
    const token = encodeURIComponent(config().arcgisAccessToken);
    return `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${token}`;
  }

  function arcgisLabelsUrl() {
    const token = encodeURIComponent(config().arcgisAccessToken);
    return `https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1/arcgis/imagery/labels/static/tile/{z}/{y}/{x}?token=${token}`;
  }

  function authenticatedImageryTile(url) {
    const match = String(url || '').match(/World_Imagery\/MapServer\/tile\/(\d+)\/(\d+)\/(\d+)/i);
    if (!match || !arcgisConfigured()) return BLANK_TILE;
    const token = encodeURIComponent(config().arcgisAccessToken);
    return `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${match[1]}/${match[2]}/${match[3]}?token=${token}`;
  }

  function guardLeafletTileLayer() {
    if (!window.L?.tileLayer || window.L.tileLayer.__ptboCommercialMapPolicyVersion === VERSION) return;
    const original = window.L.tileLayer;
    const guarded = function guardedTileLayer(url, options = {}) {
      let nextUrl = String(url || '');
      let nextOptions = { ...options };

      if (isCartoUrl(nextUrl)) {
        if (cartoConfigured()) {
          nextUrl = configuredCartoUrl();
        } else {
          console.warn('CARTO request blocked because a current CARTO tile template/API key is not configured.');
          nextUrl = commercialMode() && !productionOsmConfigured() ? BLANK_TILE : configuredOsmUrl();
          nextOptions = { ...nextOptions, subdomains:undefined, attribution:'&copy; OpenStreetMap contributors' };
        }
      }

      if (isOsmCommunityUrl(nextUrl)) {
        if (productionOsmConfigured()) {
          nextUrl = configuredOsmUrl();
          nextOptions = { ...nextOptions, subdomains:undefined };
        } else if (commercialMode()) {
          warnOnce('osm', 'Department deployment needs a licensed/self-hosted street-map tile service before sale.');
          nextUrl = BLANK_TILE;
          nextOptions = { ...nextOptions, subdomains:undefined, attribution:'' };
        } else {
          nextUrl = OSM_COMMUNITY_URL;
          nextOptions = { ...nextOptions, subdomains:undefined, attribution:'&copy; OpenStreetMap contributors' };
        }
      }

      if (isEsriImageryUrl(nextUrl)) {
        if (arcgisConfigured()) {
          nextUrl = arcgisImageryUrl();
          nextOptions = { ...nextOptions, attribution:'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community' };
        } else if (commercialMode()) {
          warnOnce('satellite', 'Department deployment needs an ArcGIS Location Platform access token or another licensed satellite provider before sale.');
          nextUrl = BLANK_TILE;
          nextOptions = { ...nextOptions, attribution:'' };
        }
      }

      if (isEsriLabelsUrl(nextUrl)) {
        if (arcgisConfigured()) {
          nextUrl = arcgisLabelsUrl();
          nextOptions = {
            ...nextOptions,
            tileSize:512,
            zoomOffset:-1,
            maxNativeZoom:22,
            attribution:'Reference labels &copy; Esri',
          };
        } else if (commercialMode()) {
          nextUrl = BLANK_TILE;
          nextOptions = { ...nextOptions, attribution:'' };
        }
      }

      return original.call(this, nextUrl, nextOptions);
    };

    Object.assign(guarded, original);
    Object.defineProperty(guarded, '__ptboCommercialMapPolicyVersion', { value:VERSION });
    window.L.tileLayer = guarded;
  }

  // The satellite zoom warmer uses new Image().src directly, bypassing Leaflet.
  // Guard those preload requests too so commercial mode cannot silently fetch
  // the legacy public Esri endpoints after the visible layers were secured.
  function guardImagePreloads() {
    if (!commercialMode() || !window.Image || window.Image.__ptboCommercialMapPolicyVersion === VERSION) return;
    const NativeImage = window.Image;
    const descriptor = window.HTMLImageElement && Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!descriptor?.get || !descriptor?.set) return;

    function GuardedImage(width, height) {
      const image = new NativeImage(width, height);
      Object.defineProperty(image, 'src', {
        configurable:true,
        enumerable:true,
        get() { return descriptor.get.call(image); },
        set(value) {
          let next = String(value || '');
          if (isEsriImageryUrl(next)) next = authenticatedImageryTile(next);
          else if (isEsriLabelsUrl(next)) next = BLANK_TILE; // Labels still load normally through the authenticated Leaflet layer.
          descriptor.set.call(image, next);
        },
      });
      return image;
    }

    GuardedImage.prototype = NativeImage.prototype;
    Object.setPrototypeOf(GuardedImage, NativeImage);
    Object.defineProperty(GuardedImage, '__ptboCommercialMapPolicyVersion', { value:VERSION });
    window.Image = GuardedImage;
  }

  function guardLegacySelector() {
    const select = document.getElementById('layer-select');
    if (!select || select.dataset.ptboCommercialMapGuard === VERSION) return;
    select.dataset.ptboCommercialMapGuard = VERSION;
    select.addEventListener('change', () => {
      const value = String(select.value || '').toLowerCase();
      if (CARTO_VALUES.has(value) && !cartoConfigured()) {
        select.value = 'osm';
        window.PTBO_SATELLITE_MAP?.showNormal?.('osm');
      }
      if (value === 'osm' && commercialMode() && !productionOsmConfigured()) {
        select.value = 'satellite';
        window.PTBO_SATELLITE_MAP?.showSatellite?.();
      }
    }, true);
  }

  function readiness() {
    return Object.freeze({
      version:VERSION,
      commercial:commercialMode(),
      arcgisSatellite:arcgisConfigured() ? 'configured' : commercialMode() ? 'required-before-sale' : 'development-public-service',
      streetTiles:productionOsmConfigured() ? 'configured' : commercialMode() ? 'required-before-sale' : 'osm-community-demo',
      carto:cartoConfigured() ? 'configured' : 'disabled',
      readyForCommercialMaps:!commercialMode() || (arcgisConfigured() && productionOsmConfigured()),
    });
  }

  function enforce() {
    removeUnavailableOptions();
    guardLeafletTileLayer();
    guardImagePreloads();
    guardLegacySelector();
    window.PTBO_MAP_READINESS = readiness();
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enforce(); });
  });

  function install() {
    enforce();
    if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.PTBO_COMMERCIAL_MAP_POLICY = Object.freeze({ version:VERSION, config, commercialMode, readiness, enforce });
  window.PTBO_CARTO_BASEMAP_POLICY = Object.freeze({
    version:VERSION,
    enabled:cartoConfigured,
    status:() => cartoConfigured() ? 'configured' : 'disabled-until-current-api-configuration',
    enforce,
    reason:'CARTO remains disabled unless a current CARTO tile template and API key are explicitly configured.',
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
