/* Geo Guesser street-map provider boundary for Emergency Games v1.6.46.
   The Geo Guesser core uses this module for both gameplay and editor maps so
   direct entry cannot bypass department/commercial map-provider policy. */
(() => {
  'use strict';

  const VERSION = '1.6.46';
  const PUBLIC_DEMO_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const PUBLIC_DEMO_ATTRIBUTION = '&copy; OpenStreetMap contributors';
  const BLANK_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  if (window.PTBO_GEO_MAP_PROVIDER?.version === VERSION) return;

  const clean = value => typeof value === 'string' ? value.trim() : '';

  function fallbackCommercialMode() {
    const deployment = window.PTBO_DEPLOYMENT || {};
    const mode = clean(deployment.mode).toLowerCase();
    return deployment.commercial === true || deployment.private === true || mode === 'department' || mode === 'commercial' || mode === 'private';
  }

  function mergedConfig() {
    const policy = window.PTBO_COMMERCIAL_MAP_POLICY;
    if (policy?.config) return policy.config();
    return Object.freeze({
      ...(window.PTBO_DEPLOYMENT?.map || {}),
      ...(window.PTBO_MAP_CONFIG || {}),
    });
  }

  function commercialMode() {
    return window.PTBO_COMMERCIAL_MAP_POLICY?.commercialMode?.() ?? fallbackCommercialMode();
  }

  function streetSpec() {
    window.PTBO_COMMERCIAL_MAP_POLICY?.enforce?.();
    const config = mergedConfig();
    const commercial = commercialMode();
    const configuredUrl = clean(config.osmTileUrl);
    const configuredAttribution = clean(config.osmAttribution);

    if (commercial && !configuredUrl) {
      return Object.freeze({
        available:false,
        commercial:true,
        source:'blocked-missing-provider',
        url:BLANK_TILE,
        attribution:'',
        reason:'Department Geo Guesser requires a licensed/self-hosted street-map tile provider.',
      });
    }

    return Object.freeze({
      available:true,
      commercial,
      source:configuredUrl ? 'configured-provider' : 'osm-community-demo',
      url:configuredUrl || PUBLIC_DEMO_URL,
      attribution:configuredAttribution || PUBLIC_DEMO_ATTRIBUTION,
      reason:'',
    });
  }

  function showBlocked(message) {
    if (!document.body) return;
    let blocker = document.getElementById('ptbo-geo-core-map-blocker');
    if (!blocker) {
      blocker = document.createElement('div');
      blocker.id = 'ptbo-geo-core-map-blocker';
      blocker.setAttribute('role', 'alert');
      blocker.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;padding:24px;background:rgba(2,6,23,.94);color:#fff;font:700 14px/1.5 system-ui,sans-serif;text-align:center';
      const card = document.createElement('div');
      card.style.cssText = 'max-width:560px;padding:18px 20px;border:1px solid #f59e0b;border-radius:14px;background:#451a03;box-shadow:0 18px 60px #0009';
      blocker.appendChild(card);
      document.body.appendChild(blocker);
    }
    blocker.firstElementChild.textContent = String(message || 'Geo Guesser map-provider configuration is incomplete.');
  }

  function clearBlocked() {
    document.getElementById('ptbo-geo-core-map-blocker')?.remove();
  }

  function readiness() {
    const spec = streetSpec();
    return Object.freeze({
      version:VERSION,
      commercial:spec.commercial,
      streetTiles:spec.available ? spec.source : 'required-before-use',
      ready:spec.available,
      reason:spec.reason,
    });
  }

  function requireReady() {
    const status = readiness();
    if (!status.ready) {
      showBlocked(status.reason);
      return false;
    }
    clearBlocked();
    return true;
  }

  function createStreetLayer(options = {}) {
    const spec = streetSpec();
    if (!spec.available) showBlocked(spec.reason);
    if (!window.L?.tileLayer) throw new Error('Leaflet is not ready for Geo Guesser map creation.');
    return window.L.tileLayer(spec.url, {
      maxZoom:19,
      ...options,
      subdomains:undefined,
      attribution:spec.attribution,
    });
  }

  window.PTBO_GEO_MAP_PROVIDER = Object.freeze({
    version:VERSION,
    streetSpec,
    readiness,
    requireReady,
    createStreetLayer,
    commercialMode,
    policy:'Every Geo Guesser map, including direct core and developer editor entry, must pass through this provider boundary.',
  });
})();
