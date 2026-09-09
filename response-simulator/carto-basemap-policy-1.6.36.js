/* CARTO basemap commercial-readiness policy for Emergency Games v1.6.36.
   CARTO basemaps are disabled unless an explicit project API-key configuration
   is provided. This prevents legacy public CARTO tile URLs from being used by
   the simulator while preserving an easy path to re-enable CARTO later. */
(() => {
  'use strict';

  const VERSION = '1.6.36';
  const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const CARTO_VALUES = new Set(['positron', 'dark']);
  const CARTO_HOST = /(?:^|\.)basemaps\.cartocdn\.com$/i;

  if (window.PTBO_CARTO_BASEMAP_POLICY?.version === VERSION) return;

  const configured = () => {
    const config = window.PTBO_CARTO_CONFIG;
    return Boolean(config && typeof config.apiKey === 'string' && config.apiKey.trim());
  };

  function removeUnavailableOptions() {
    if (configured()) return;
    const select = document.getElementById('layer-select');
    if (!select) return;

    [...select.options].forEach(option => {
      if (CARTO_VALUES.has(String(option.value || '').toLowerCase())) option.remove();
    });

    if (CARTO_VALUES.has(String(select.value || '').toLowerCase())) select.value = 'osm';
  }

  function isCartoUrl(template) {
    try {
      const sample = String(template || '')
        .replace('{s}', 'a')
        .replace('{z}', '1')
        .replace('{x}', '1')
        .replace('{y}', '1');
      return CARTO_HOST.test(new URL(sample, location.href).hostname);
    } catch (_) {
      return /cartocdn\.com/i.test(String(template || ''));
    }
  }

  function guardLeafletTileLayer() {
    if (configured() || !window.L?.tileLayer || window.L.tileLayer.__ptboCartoPolicyVersion === VERSION) return;

    const original = window.L.tileLayer;
    const guarded = function guardedTileLayer(url, options = {}) {
      if (!configured() && isCartoUrl(url)) {
        console.warn('CARTO basemap request blocked: no CARTO API key is configured. Falling back to OpenStreetMap.');
        return original.call(this, OSM_URL, {
          ...options,
          subdomains:'abc',
          attribution:'&copy; OpenStreetMap contributors',
        });
      }
      return original.call(this, url, options);
    };

    Object.assign(guarded, original);
    Object.defineProperty(guarded, '__ptboCartoPolicyVersion', { value:VERSION });
    window.L.tileLayer = guarded;
  }

  function guardLegacySelector() {
    if (configured()) return;
    const select = document.getElementById('layer-select');
    if (!select || select.dataset.ptboCartoGuard === VERSION) return;
    select.dataset.ptboCartoGuard = VERSION;
    select.addEventListener('change', () => {
      if (!CARTO_VALUES.has(String(select.value || '').toLowerCase())) return;
      select.value = 'osm';
      window.PTBO_SATELLITE_MAP?.showNormal?.('osm');
    }, true);
  }

  function enforce() {
    removeUnavailableOptions();
    guardLeafletTileLayer();
    guardLegacySelector();
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enforce();
    });
  });

  function install() {
    enforce();
    if (document.documentElement) observer.observe(document.documentElement, { childList:true, subtree:true });
  }

  window.PTBO_CARTO_BASEMAP_POLICY = Object.freeze({
    version:VERSION,
    enabled:configured,
    status:() => configured() ? 'configured' : 'disabled-until-api-key',
    enforce,
    reason:'CARTO basemaps require an explicit CARTO-issued API key configuration before use.',
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();