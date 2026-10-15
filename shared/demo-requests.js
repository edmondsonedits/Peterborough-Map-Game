/* Explicit demo requests: device aggregate storage plus optional shared analytics. */
(() => {
  'use strict';
  if (window.PTBO_DEMO_REQUESTS) return;
  const KEY = 'ptbo-demo-requests-v1';
  const MODES = ['geo', 'route', 'dispatch', 'explorer'];
  const pending = new Map(), statuses = new Map();
  let fallbackSession = '';
  const get = (storage, key) => { try { return storage.getItem(key); } catch (_) { return null; } };
  const set = (storage, key, value) => { try { storage.setItem(key, value); return true; } catch (_) { return false; } };
  const cityValid = city => typeof city === 'string' && city.length <= 60 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(city) && !Object.prototype.hasOwnProperty.call(Object.prototype, city);
  const session = () => {
    // Device deduplication must not change when the optional analytics client loads later.
    if (!fallbackSession) {
      fallbackSession = get(sessionStorage, 'ptbo-demo-request-session-v1') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
      set(sessionStorage, 'ptbo-demo-request-session-v1', fallbackSession);
    }
    return fallbackSession;
  };
  const requestKey = (city, mode) => `${session()}:${city}:${mode}`;
  const markerKey = key => `ptbo-device-demo-request-v1:${key}`;
  function loadLocalStats() {
    let stored = {};
    try { stored = JSON.parse(get(localStorage, KEY) || '{}') || {}; } catch (_) {}
    const demand = { total:0, byCity:{}, byMode:{}, byCityMode:{} };
    for (const [city, modes] of Object.entries(stored.byCityMode || {})) {
      if (!cityValid(city) || !modes || typeof modes !== 'object') continue;
      for (const mode of MODES) {
        const count = Number(modes[mode]);
        if (!Number.isSafeInteger(count) || count <= 0) continue;
        (demand.byCityMode[city] ||= {})[mode] = count;
        demand.byCity[city] = (demand.byCity[city] || 0) + count;
        demand.byMode[mode] = (demand.byMode[mode] || 0) + count;
        demand.total += count;
      }
    }
    return { demoRequests:demand };
  }
  function requestStatus(city, mode) {
    const key = requestKey(city, mode);
    const marker = get(sessionStorage, markerKey(key));
    const current = statuses.get(key) || {};
    return Object.freeze({ localSaved:current.localSaved === true || marker === 'local' || marker === 'both', remoteSaved:current.remoteSaved === true || marker === 'remote' || marker === 'both' });
  }
  async function recordDemoRequest(city, mode) {
    if (!cityValid(city) || !MODES.includes(mode) || !window.PTBO_CITIES?.some(item => item.id === city)) return false;
    const key = requestKey(city, mode);
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      let { localSaved, remoteSaved } = requestStatus(city, mode);
      if (!localSaved) {
        const demand = loadLocalStats().demoRequests;
        const counts = demand.byCityMode[city] ||= {};
        counts[mode] = (counts[mode] || 0) + 1;
        localSaved = set(localStorage, KEY, JSON.stringify({ byCityMode:demand.byCityMode }));
        // Keep only aggregates persistently; the deduplication marker is session-only.
        statuses.set(key, { localSaved, remoteSaved });
        if (localSaved) set(sessionStorage, markerKey(key), remoteSaved ? 'both' : 'local');
      }
      if (!remoteSaved) {
        try { remoteSaved = await window.PTBO_SITE_ANALYTICS?.recordDemoRequest?.(city, mode) === true; } catch (_) {}
      }
      statuses.set(key, { localSaved, remoteSaved });
      if (localSaved || remoteSaved) set(sessionStorage, markerKey(key), localSaved ? (remoteSaved ? 'both' : 'local') : 'remote');
      return localSaved || remoteSaved;
    })().finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  }
  window.PTBO_DEMO_REQUESTS = Object.freeze({ recordDemoRequest, requestStatus, isRequested:(city, mode) => { const status = requestStatus(city, mode); return status.localSaved || status.remoteSaved; }, loadLocalStats });
})();
