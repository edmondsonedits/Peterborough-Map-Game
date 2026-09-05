/* Anonymous aggregate website analytics for the Emergency Games launcher.
   Uses the existing Firestore project already used by the Geo Guesser scoreboard.
   No names, email addresses, precise locations, prompts, routes, or gameplay data are recorded. */
(() => {
  'use strict';

  const VERSION = '1.6.23';
  if (window.PTBO_SITE_ANALYTICS?.version === VERSION) return;

  const PROJECT_ID = 'geo-guesser-scoreboard';
  const API_KEY = 'AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I';
  const PRIMARY_COLLECTION = 'siteAnalytics';
  const FALLBACK_COLLECTION = 'scores';
  const COLLECTION_KEY = 'ptbo-site-analytics-collection-v1';
  const VISITOR_ID_KEY = 'ptbo-site-visitor-id-v1';
  const VISITOR_SENT_KEY = 'ptbo-site-visitor-sent-v1';
  const SESSION_ID_KEY = 'ptbo-site-session-id-v1';
  const SESSION_SENT_KEY = 'ptbo-site-session-sent-v1';
  const EDITOR_ACCESS_KEY = 'ptbo-emergency-developer-mode';
  const STATS_ACCESS_KEY = 'ptbo-emergency-stats-mode';
  const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  const safeStorage = (storage, method, key, value) => {
    try {
      return method === 'get' ? storage.getItem(key) : storage.setItem(key, value);
    } catch (_) {
      return method === 'get' ? null : undefined;
    }
  };

  const randomId = () => {
    try { return crypto.randomUUID().replace(/-/g, ''); }
    catch (_) { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; }
  };

  const surface = () => window.PTBO_DEVICE_SURFACE?.isMobile?.() === true ? 'mobile' : 'desktop';
  const nowIso = () => new Date().toISOString();
  const trackingAllowed = () => {
    const developer = safeStorage(localStorage, 'get', EDITOR_ACCESS_KEY) === 'enabled';
    const stats = safeStorage(localStorage, 'get', STATS_ACCESS_KEY) === 'enabled';
    return !developer && !stats;
  };

  function encodeValue(value) {
    if (typeof value === 'boolean') return { booleanValue:value };
    if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue:String(value) } : { doubleValue:value };
    return { stringValue:String(value ?? '') };
  }

  function encodeFields(record) {
    return Object.fromEntries(Object.entries(record).filter(([,value]) => value !== undefined && value !== null).map(([key,value]) => [key,encodeValue(value)]));
  }

  function decodeValue(value = {}) {
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('timestampValue' in value) return value.timestampValue;
    return null;
  }

  function decodeDocument(documentValue, collection) {
    const result = { id:String(documentValue?.name || '').split('/').pop(), collection };
    Object.entries(documentValue?.fields || {}).forEach(([key,value]) => { result[key] = decodeValue(value); });
    return result;
  }

  async function firestoreRequest(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal,
        ...options,
        headers:{ Accept:'application/json', ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Firestore request failed (${response.status})`);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  const collectionUrl = (collection, documentId = '') => {
    const suffix = documentId ? `/${encodeURIComponent(documentId)}` : '';
    return `${ROOT}/${collection}${suffix}?key=${encodeURIComponent(API_KEY)}`;
  };

  async function writeToCollection(collection, record, documentId = '') {
    const body = JSON.stringify({ fields:encodeFields(record) });
    if (documentId) {
      await firestoreRequest(collectionUrl(collection, documentId), { method:'PATCH', body });
    } else {
      await firestoreRequest(collectionUrl(collection), { method:'POST', body });
    }
    safeStorage(sessionStorage, 'set', COLLECTION_KEY, collection);
    return true;
  }

  async function writeRecord(record, documentId = '') {
    if (!trackingAllowed()) return false;
    const preferred = safeStorage(sessionStorage, 'get', COLLECTION_KEY);
    const collections = preferred === FALLBACK_COLLECTION
      ? [FALLBACK_COLLECTION, PRIMARY_COLLECTION]
      : [PRIMARY_COLLECTION, FALLBACK_COLLECTION];
    for (const collection of collections) {
      try { return await writeToCollection(collection, record, documentId); }
      catch (_) {}
    }
    return false;
  }

  function baseRecord(recordType) {
    return {
      recordType,
      build:VERSION,
      surface:surface(),
      createdAt:nowIso(),
    };
  }

  async function ensureVisitor() {
    if (!trackingAllowed()) return;
    let id = safeStorage(localStorage, 'get', VISITOR_ID_KEY);
    if (!id) {
      id = randomId();
      safeStorage(localStorage, 'set', VISITOR_ID_KEY, id);
    }
    if (safeStorage(localStorage, 'get', VISITOR_SENT_KEY) === '1') return;
    const ok = await writeRecord({ ...baseRecord('visitor'), visitorId:id }, `visitor_${id}`);
    if (ok) safeStorage(localStorage, 'set', VISITOR_SENT_KEY, '1');
  }

  async function ensureSession() {
    if (!trackingAllowed()) return;
    let id = safeStorage(sessionStorage, 'get', SESSION_ID_KEY);
    if (!id) {
      id = randomId();
      safeStorage(sessionStorage, 'set', SESSION_ID_KEY, id);
    }
    if (safeStorage(sessionStorage, 'get', SESSION_SENT_KEY) === '1') return;
    const ok = await writeRecord({ ...baseRecord('session'), sessionId:id }, `session_${id}`);
    if (ok) safeStorage(sessionStorage, 'set', SESSION_SENT_KEY, '1');
  }

  const recordMenuView = () => writeRecord({ ...baseRecord('menu_view'), path:location.pathname });
  const recordLaunch = target => writeRecord({ ...baseRecord('launch'), target:String(target || 'unknown') });
  const recordCity = city => writeRecord({ ...baseRecord('city_select'), city:String(city || 'unknown') });

  async function fetchCollection(collection) {
    const records = [];
    let pageToken = '';
    for (let page = 0; page < 8; page += 1) {
      const params = new URLSearchParams({ key:API_KEY, pageSize:'1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await firestoreRequest(`${ROOT}/${collection}?${params}`);
      records.push(...(payload.documents || []).map(item => decodeDocument(item, collection)));
      pageToken = payload.nextPageToken || '';
      if (!pageToken) break;
    }
    return records;
  }

  async function loadStats() {
    const settled = await Promise.allSettled([fetchCollection(PRIMARY_COLLECTION), fetchCollection(FALLBACK_COLLECTION)]);
    const records = [];
    settled.forEach(result => { if (result.status === 'fulfilled') records.push(...result.value); });
    if (!records.length && settled.every(result => result.status === 'rejected')) throw new Error('Analytics database is unavailable.');

    const analytics = records.filter(record => ['visitor','session','menu_view','launch','city_select'].includes(record.recordType));
    const byType = type => analytics.filter(record => record.recordType === type);
    const launches = {};
    byType('launch').forEach(record => { const key=record.target || 'unknown'; launches[key]=(launches[key]||0)+1; });
    const cities = {};
    byType('city_select').forEach(record => { const key=record.city || 'unknown'; cities[key]=(cities[key]||0)+1; });
    const devices = { mobile:0, desktop:0, unknown:0 };
    byType('session').forEach(record => { const key=record.surface === 'mobile' || record.surface === 'desktop' ? record.surface : 'unknown'; devices[key]+=1; });
    const dates = analytics.map(record => Date.parse(record.createdAt)).filter(Number.isFinite).sort((a,b) => a-b);

    return Object.freeze({
      version:VERSION,
      uniqueBrowsers:byType('visitor').length,
      sessions:byType('session').length,
      menuViews:byType('menu_view').length,
      launchesTotal:byType('launch').length,
      citySelections:byType('city_select').length,
      launches:Object.freeze(launches),
      cities:Object.freeze(cities),
      devices:Object.freeze(devices),
      firstActivity:dates.length ? new Date(dates[0]).toISOString() : null,
      latestActivity:dates.length ? new Date(dates[dates.length-1]).toISOString() : null,
      recordCount:analytics.length,
    });
  }

  document.addEventListener('click', event => {
    if (!event.isTrusted || !trackingAllowed()) return;
    const target = event.target instanceof Element ? event.target.closest('[data-analytics-target]') : null;
    if (target) void recordLaunch(target.dataset.analyticsTarget);
    const city = event.target instanceof Element ? event.target.closest('.city-option[data-city]') : null;
    if (city) void recordCity(city.dataset.city);
  }, true);

  window.PTBO_SITE_ANALYTICS = Object.freeze({
    version:VERSION,
    loadStats,
    recordLaunch,
    recordCity,
    trackingAllowed,
  });

  if (trackingAllowed()) {
    void ensureVisitor();
    void ensureSession();
    void recordMenuView();
  }
})();