/* Anonymous aggregate analytics for Emergency Games v1.6.25.
   Records gameplay/session totals only. Exact routes/coordinates, names, emails,
   prompts, room codes, and individual activity histories are never stored. */
(() => {
  'use strict';

  const VERSION = '1.6.25';
  if (window.top !== window || window.PTBO_SITE_ANALYTICS?.version === VERSION) return;

  const PROJECT_ID = 'geo-guesser-scoreboard';
  const API_KEY = 'AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I';
  const PRIMARY_COLLECTION = 'siteAnalytics';
  const FALLBACK_COLLECTION = 'scores';
  const ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

  const COLLECTION_KEY = 'ptbo-site-analytics-collection-v3';
  const VISITOR_ID_KEY = 'ptbo-site-visitor-id-v1';
  const VISITOR_FIRST_KEY = 'ptbo-site-visitor-first-v2';
  const VISITOR_SESSIONS_KEY = 'ptbo-site-visitor-sessions-v2';
  const SESSION_ID_KEY = 'ptbo-site-session-id-v3';
  const SESSION_STATE_KEY = 'ptbo-site-session-state-v3';
  const SESSION_LAST_KEY = 'ptbo-site-session-last-v3';
  const EDITOR_ACCESS_KEY = 'ptbo-emergency-developer-mode';
  const STATS_ACCESS_KEY = 'ptbo-emergency-stats-mode';
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

  const nowIso = () => new Date().toISOString();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const round = value => Math.round(num(value) * 10) / 10;
  const slug = value => String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'unknown';
  const safeGet = (storage, key) => { try { return storage.getItem(key); } catch (_) { return null; } };
  const safeSet = (storage, key, value) => { try { storage.setItem(key, String(value)); return true; } catch (_) { return false; } };
  const safeRemove = (storage, key) => { try { storage.removeItem(key); } catch (_) {} };
  const readJson = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key) || 'null') ?? fallback; } catch (_) { return fallback; } };
  const writeJson = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } };
  const randomId = () => { try { return crypto.randomUUID().replace(/-/g, ''); } catch (_) { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`; } };

  function privilegedPage() {
    return /\/(?:dispatch-editor|site-stats)\//.test(location.pathname);
  }

  function trackingAllowed() {
    if (privilegedPage()) return false;
    // The owner/editor and hidden stats dashboard are intentionally excluded so
    // testing the site does not inflate public gameplay numbers.
    return safeGet(localStorage, EDITOR_ACCESS_KEY) !== 'enabled' &&
      safeGet(localStorage, STATS_ACCESS_KEY) !== 'enabled';
  }

  function isMobile() {
    if (window.PTBO_DEVICE_SURFACE?.isMobile?.() === true) return true;
    const ua = String(navigator.userAgent || '');
    return navigator.userAgentData?.mobile === true ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
      (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
  }

  function browserFamily() {
    const ua = String(navigator.userAgent || '');
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Firefox\//i.test(ua)) return 'Firefox';
    if (/Chrome\//i.test(ua)) return 'Chrome';
    if (/Safari\//i.test(ua)) return 'Safari';
    return 'Other';
  }

  function screenBucket() {
    const width = Math.min(Number(screen?.width) || 9999, Number(screen?.height) || 9999);
    return width <= 480 ? 'small' : width <= 900 ? 'medium' : 'large';
  }

  function pageType() {
    const path = location.pathname;
    if (/\/response-simulator\/(?:play|mobile)\/(?:index\.html)?$/.test(path) || /\/response-simulator\/(?:index\.html)?$/.test(path)) return 'dispatch';
    if (/\/geo-guesser\/(?:desktop|mobile)\/(?:index\.html)?$/.test(path) || /\/geo-guesser\/(?:index\.html)?$/.test(path)) return 'geoguesser';
    if (/\/city-explorer\/(?:index\.html)?$/.test(path)) return 'explorer';
    if (/\/dispatch-editor\/(?:index\.html)?$/.test(path)) return 'editor';
    if (/\/site-stats\/(?:index\.html)?$/.test(path)) return 'stats';
    if (/Peterborough-Map-Game\/?$/.test(path)) return 'menu';
    return 'other';
  }

  function encodeValue(value) {
    if (typeof value === 'boolean') return { booleanValue:value };
    if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue:String(value) } : { doubleValue:value };
    return { stringValue:String(value ?? '') };
  }

  function encodeFields(record) {
    return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, encodeValue(value)]));
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
    Object.entries(documentValue?.fields || {}).forEach(([key, value]) => { result[key] = decodeValue(value); });
    return result;
  }

  async function firestoreRequest(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const hasBody = Boolean(options.body);
      const response = await fetch(url, {
        cache:'no-store',
        credentials:'omit',
        referrerPolicy:'no-referrer',
        signal:controller.signal,
        keepalive:hasBody,
        ...options,
        headers:{ Accept:'application/json', ...(hasBody ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || `Firestore request failed (${response.status})`);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  const collectionUrl = (collection, documentId = '') => `${ROOT}/${collection}${documentId ? `/${encodeURIComponent(documentId)}` : ''}?key=${encodeURIComponent(API_KEY)}`;

  async function writeToCollection(collection, record, documentId = '') {
    const body = JSON.stringify({ fields:encodeFields(record) });
    await firestoreRequest(collectionUrl(collection, documentId), { method:documentId ? 'PATCH' : 'POST', body, keepalive:true });
    safeSet(sessionStorage, COLLECTION_KEY, collection);
    return true;
  }

  async function writeRecord(record, documentId = '') {
    if (!trackingAllowed()) return false;
    const preferred = safeGet(sessionStorage, COLLECTION_KEY);
    const collections = preferred === FALLBACK_COLLECTION ? [FALLBACK_COLLECTION, PRIMARY_COLLECTION] : [PRIMARY_COLLECTION, FALLBACK_COLLECTION];
    for (const collection of collections) {
      try { return await writeToCollection(collection, record, documentId); }
      catch (_) {}
    }
    return false;
  }

  let visitorId = safeGet(localStorage, VISITOR_ID_KEY);
  if (!visitorId) {
    visitorId = randomId();
    safeSet(localStorage, VISITOR_ID_KEY, visitorId);
  }

  let firstSeen = safeGet(localStorage, VISITOR_FIRST_KEY);
  if (!firstSeen) {
    firstSeen = nowIso();
    safeSet(localStorage, VISITOR_FIRST_KEY, firstSeen);
  }

  let sessionId = safeGet(sessionStorage, SESSION_ID_KEY);
  const previousLastSeen = num(safeGet(sessionStorage, SESSION_LAST_KEY));
  const sessionExpired = Boolean(sessionId && previousLastSeen && Date.now() - previousLastSeen > SESSION_TIMEOUT_MS);
  const newSession = !sessionId || sessionExpired;
  if (newSession) {
    sessionId = randomId();
    safeSet(sessionStorage, SESSION_ID_KEY, sessionId);
    safeRemove(sessionStorage, SESSION_STATE_KEY);
    safeSet(localStorage, VISITOR_SESSIONS_KEY, num(safeGet(localStorage, VISITOR_SESSIONS_KEY)) + 1);
  }
  const touchSession = () => safeSet(sessionStorage, SESSION_LAST_KEY, Date.now());
  touchSession();

  const defaults = {
    recordType:'session_summary', build:VERSION, sessionId, visitorId, startedAt:nowIso(), updatedAt:nowIso(),
    surface:isMobile() ? 'mobile' : 'desktop', browser:browserFamily(), screenBucket:screenBucket(), orientation:innerWidth >= innerHeight ? 'landscape' : 'portrait',
    activeSeconds:0, menuSeconds:0, dispatchSeconds:0, geoguesserSeconds:0, explorerSeconds:0, otherSeconds:0,
    simulatorSeconds:0, drivingSeconds:0, stationarySeconds:0, distanceMeters:0, fireSeconds:0, emsSeconds:0,
    callsStarted:0, callsCompleted:0, callsAbandoned:0, fireCalls:0, emsCalls:0, fireCallsCompleted:0, emsCallsCompleted:0, responseMsTotal:0, transportMsTotal:0,
    optionsOpens:0, settingsChanges:0, serviceChanges:0, baseSelections:0, sirenToggles:0, recenterUses:0, reverseUses:0, acceleratorUses:0, steeringUses:0, gearShifts:0, mapToggles:0, audioToggles:0,
    geoDrillsStarted:0, geoGuesses:0, geoNextCalls:0, geoDrillsEnded:0, geoInteractions:0,
    explorerPlayUses:0, explorerFlyUses:0, explorerMapUses:0, explorerSearchUses:0, explorerLandmarkUses:0, explorerTimeUses:0, explorerSoundUses:0,
    startupSuccesses:0, startupFailures:0, startupTimeouts:0, startupMsTotal:0,
    jsErrors:0, assetErrors:0, unhandledRejections:0, eventSequence:0,
  };

  let state = { ...defaults, ...readJson(sessionStorage, SESSION_STATE_KEY, {}) };
  state.sessionId = sessionId;
  state.visitorId = visitorId;
  state.build = VERSION;
  state.updatedAt = nowIso();
  state.surface = isMobile() ? 'mobile' : 'desktop';
  state.browser = browserFamily();
  state.screenBucket = screenBucket();
  state.orientation = innerWidth >= innerHeight ? 'landscape' : 'portrait';

  const persistState = () => {
    state.updatedAt = nowIso();
    touchSession();
    writeJson(sessionStorage, SESSION_STATE_KEY, state);
  };
  persistState();

  const bump = (key, amount = 1) => {
    state[key] = round(num(state[key]) + num(amount));
    persistState();
  };
  const bumpNamed = (prefix, name, amount = 1) => bump(`${prefix}_${slug(name)}`, amount);

  let flushTimer = 0;
  let flushing = false;
  let flushAgain = false;
  function scheduleFlush(delay = 1200) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { void flushSummary(); }, delay);
  }

  async function flushSummary() {
    if (!trackingAllowed()) return false;
    if (flushing) {
      flushAgain = true;
      return false;
    }
    flushing = true;
    let ok = false;
    try {
      do {
        flushAgain = false;
        persistState();
        const snapshot = { ...state, recordType:'session_summary', updatedAt:nowIso() };
        ok = await writeRecord(snapshot, `activity_${sessionId}`);
      } while (flushAgain && trackingAllowed());
      return ok;
    } finally {
      flushing = false;
    }
  }

  const mark = (key, amount = 1) => { bump(key, amount); scheduleFlush(); };
  const markNamed = (prefix, name, amount = 1) => { bumpNamed(prefix, name, amount); scheduleFlush(); };

  function allocateEventId(recordType) {
    state.eventSequence = Math.max(0, Math.floor(num(state.eventSequence))) + 1;
    persistState();
    return `${slug(recordType)}_${sessionId}_${state.eventSequence}`;
  }

  function baseEvent(recordType, eventId) {
    return { recordType, eventId, build:VERSION, surface:state.surface, sessionId, visitorId, createdAt:nowIso() };
  }

  function recordEvent(recordType, details = {}) {
    if (!trackingAllowed()) return Promise.resolve(false);
    const eventId = allocateEventId(recordType);
    return writeRecord({ ...baseEvent(recordType, eventId), ...details }, `event_${eventId}`);
  }

  async function ensureVisitor() {
    if (!trackingAllowed()) return false;
    const sessionCount = Math.max(1, num(safeGet(localStorage, VISITOR_SESSIONS_KEY)));
    const visitorOk = await writeRecord({
      recordType:'visitor', build:VERSION, visitorId, firstSeenAt:firstSeen, lastSeenAt:nowIso(), sessionCount,
      surface:state.surface, createdAt:firstSeen,
    }, `visitor_${visitorId}`);
    if (newSession) {
      await writeRecord({
        recordType:'session', build:VERSION, sessionId, visitorId, surface:state.surface, browser:state.browser,
        screenBucket:state.screenBucket, orientation:state.orientation, createdAt:state.startedAt,
      }, `session_${sessionId}`);
    }
    return visitorOk;
  }

  const recordMenuView = () => recordEvent('menu_view', { path:location.pathname });
  const recordLaunch = target => {
    const value = String(target || 'unknown');
    markNamed('launch', value);
    return recordEvent('launch', { target:value });
  };
  const recordCity = city => {
    const value = slug(city);
    markNamed('city_select', value);
    return recordEvent('city_select', { city:value });
  };

  let lastTick = performance.now();
  let wasVisible = document.visibilityState === 'visible';
  function accountPageTime() {
    const now = performance.now();
    const delta = Math.max(0, Math.min(10, (now - lastTick) / 1000));
    if (wasVisible && trackingAllowed()) {
      bump('activeSeconds', delta);
      bump(`${pageType()}Seconds`, delta);
      scheduleFlush(5000);
    }
    lastTick = now;
    wasVisible = document.visibilityState === 'visible';
    touchSession();
  }
  const pageTimer = setInterval(accountPageTime, 5000);
  document.addEventListener('visibilitychange', () => {
    accountPageTime();
    if (document.hidden) void flushSummary();
  });

  function haversine(a, b) {
    const R = 6371000;
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  const simulatorBindings = new WeakMap();
  const finalizers = new Set();

  function cleanupSimulatorBinding(frame) {
    const binding = simulatorBindings.get(frame);
    if (!binding) return;
    clearInterval(binding.interval);
    clearTimeout(binding.retryTimer);
    if (binding.finalize) finalizers.delete(binding.finalize);
    simulatorBindings.delete(frame);
  }

  function attachSimulatorFrame(frame) {
    if (!frame) return;

    const install = () => {
      cleanupSimulatorBinding(frame);
      let doc;
      let game;
      try { doc = frame.contentDocument; game = frame.contentWindow; } catch (_) { return; }
      if (!doc || !game) return;
      if (!doc.getElementById('tel-lat')) {
        const retryTimer = setTimeout(install, 700);
        simulatorBindings.set(frame, { retryTimer, interval:0, finalize:null });
        return;
      }

      doc.documentElement.dataset.ptboAnalytics25 = '1';
      mark('simulatorEntries');
      const city = slug(game.PTBO_CITY_PACKAGE?.id || new URLSearchParams(location.search).get('city') || frame.dataset.ptboCity || 'peterborough');
      markNamed('city_entry', city);

      let previous = null;
      let lastSample = performance.now();
      let callActive = false;
      let callService = '';

      const currentService = () => String(game.PTBO_SERVICE?.state?.mode || doc.getElementById('service-select')?.value || '').toLowerCase();
      const serviceSelected = () => game.PTBO_SERVICE?.state?.selected !== false;

      const finishCallAsAbandoned = () => {
        if (!callActive) return;
        callActive = false;
        mark('callsAbandoned');
      };

      const finalize = () => {
        finishCallAsAbandoned();
        scheduleFlush(0);
      };
      finalizers.add(finalize);

      doc.addEventListener('click', event => {
        if (!event.isTrusted || !trackingAllowed()) return;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button) return;
        if (button.id === 'menu-toggle') mark('optionsOpens');
        if (button.id === 'ptbo-map-toggle') mark('mapToggles');
        if (button.closest('#service-spawns')) {
          mark('baseSelections');
          markNamed('base', button.textContent.trim());
        }
      }, true);

      doc.addEventListener('change', event => {
        if (!event.isTrusted || !trackingAllowed()) return;
        const target = event.target;
        if (target?.id === 'service-select') {
          mark('serviceChanges');
          markNamed('service_select', target.value);
        }
        if (target?.id === 'layer-select') mark('mapToggles');
        if (target?.matches?.('input,select')) {
          mark('settingsChanges');
          markNamed('setting', target.id || target.name || target.dataset?.sub || 'control');
        }
      }, true);

      doc.addEventListener('keydown', event => {
        if (!event.isTrusted || event.repeat || !trackingAllowed()) return;
        if (event.target?.closest?.('input,textarea,select,[contenteditable="true"]')) return;
        const key = String(event.key || '').toLowerCase();
        if (key === 'arrowup' || key === 'w') mark('acceleratorUses');
        else if (key === 'arrowdown' || key === 's') mark('reverseUses');
        else if (key === 'arrowleft' || key === 'arrowright' || key === 'a' || key === 'd') mark('steeringUses');
      }, true);

      const sample = () => {
        const now = performance.now();
        const delta = Math.max(0, Math.min(5, (now - lastSample) / 1000));
        lastSample = now;
        if (document.visibilityState !== 'visible' || !trackingAllowed()) return;

        bump('simulatorSeconds', delta);
        bumpNamed('city_seconds', city, delta);

        const service = currentService();
        const selected = serviceSelected();
        if (selected && service === 'fire') bump('fireSeconds', delta);
        if (selected && service === 'ems') bump('emsSeconds', delta);

        const lat = Number(doc.getElementById('tel-lat')?.textContent);
        const lng = Number(doc.getElementById('tel-lng')?.textContent);
        if (selected && Number.isFinite(lat) && Number.isFinite(lng)) {
          const current = { lat, lng };
          if (previous) {
            const distance = haversine(previous, current);
            if (distance >= 0.4 && distance < 300) {
              bump('drivingSeconds', delta);
              bump('distanceMeters', distance);
            } else {
              bump('stationarySeconds', delta);
            }
          }
          previous = current;
        }

        const hud = doc.getElementById('dispatch-hud');
        const action = doc.getElementById('hud-action-btn');
        const title = doc.querySelector('#hud-content .hud-title')?.textContent || '';
        const meta = doc.querySelector('#hud-content .hud-meta')?.textContent || '';
        const active = Boolean(hud?.classList.contains('incident-active'));
        const completed = /Next Call/i.test(action?.textContent || '');

        if (active && !callActive) {
          callActive = true;
          callService = service === 'ems' ? 'ems' : 'fire';
          mark('callsStarted');
          mark(callService === 'ems' ? 'emsCalls' : 'fireCalls');
          const incident = title.includes(':') ? title.split(':').slice(1).join(':').trim() : title.replace(/^.*DISPATCH\s*/i, '').trim();
          markNamed('incident', incident || 'unknown');
        }

        if (callActive && completed) {
          callActive = false;
          mark('callsCompleted');
          mark(callService === 'ems' ? 'emsCallsCompleted' : 'fireCallsCompleted');
          const response = Number(meta.match(/Response:\s*([\d.]+)\s*s/i)?.[1]);
          const transport = Number(meta.match(/Transport:\s*([\d.]+)\s*s/i)?.[1]);
          if (Number.isFinite(response)) mark('responseMsTotal', response * 1000);
          if (Number.isFinite(transport)) mark('transportMsTotal', transport * 1000);
        } else if (callActive && !active && !hud?.classList.contains('incident-success')) {
          finishCallAsAbandoned();
        }

        scheduleFlush(5000);
      };

      const interval = setInterval(sample, 2000);
      simulatorBindings.set(frame, { interval, retryTimer:0, finalize });
    };

    frame.addEventListener('load', () => setTimeout(install, 350));
    setTimeout(install, 350);
  }

  function attachDirectSimulatorDocument() {
    if (document.getElementById('simulator') || !document.getElementById('tel-lat')) return;
    // Direct opening of response-simulator/index.html is uncommon, but still
    // records active simulator time through a lightweight virtual frame wrapper.
    const virtualFrame = {
      contentDocument:document,
      contentWindow:window,
      dataset:{ ptboCity:new URLSearchParams(location.search).get('city') || 'peterborough' },
      addEventListener() {},
    };
    attachSimulatorFrame(virtualFrame);
  }

  const geoFrames = new WeakSet();
  function attachGeoFrame(frame) {
    if (!frame || geoFrames.has(frame)) return;
    geoFrames.add(frame);
    const install = () => {
      let doc;
      try { doc = frame.contentDocument; } catch (_) { return; }
      if (!doc || doc.documentElement.dataset.ptboGeoAnalytics25 === '1') return;
      doc.documentElement.dataset.ptboGeoAnalytics25 = '1';
      doc.addEventListener('click', event => {
        if (!event.isTrusted || !trackingAllowed()) return;
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button) return;
        mark('geoInteractions');
        if (button.id === 'dispatch-start') mark('geoDrillsStarted');
        if (button.id === 'confirm') mark('geoGuesses');
        if (button.id === 'next-call') mark('geoNextCalls');
        if (button.id === 'end-drill') mark('geoDrillsEnded');
      }, true);
    };
    frame.addEventListener('load', () => setTimeout(install, 300));
    setTimeout(install, 300);
  }

  document.addEventListener('click', event => {
    if (!event.isTrusted || !trackingAllowed()) return;
    const target = event.target instanceof Element ? event.target.closest('[data-analytics-target]') : null;
    if (target) void recordLaunch(target.dataset.analyticsTarget);
    const city = event.target instanceof Element ? event.target.closest('.city-option[data-city]') : null;
    if (city) void recordCity(city.dataset.city);

    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const id = button.id;
    if (id === 'options-button' || id === 'menu-toggle') mark('optionsOpens');
    if (id === 'audio-button') mark('audioToggles');
    if (id === 'siren-button') mark('sirenToggles');
    if (id === 'recenter-button') mark('recenterUses');
    if (id === 'gear-down') mark('gearShifts');
    if (button.matches('.station-button')) {
      mark('baseSelections');
      markNamed('base', button.textContent.trim());
    }

    if (pageType() === 'explorer') {
      const actions = {
        'play-mode':'explorerPlayUses',
        'fly-mode':'explorerFlyUses',
        'map-mode':'explorerMapUses',
        'search-button':'explorerSearchUses',
        'landmarks-button':'explorerLandmarkUses',
        'time-button':'explorerTimeUses',
        'sound-button':'explorerSoundUses',
      };
      if (actions[id]) mark(actions[id]);
    }
  }, true);

  document.addEventListener('pointerdown', event => {
    if (!event.isTrusted || !trackingAllowed()) return;
    const target = event.target instanceof Element ? event.target.closest('#gas-pedal,#reverse-pedal,#steering') : null;
    if (!target) return;
    if (target.id === 'gas-pedal') mark('acceleratorUses');
    if (target.id === 'reverse-pedal') mark('reverseUses');
    if (target.id === 'steering') mark('steeringUses');
  }, true);

  addEventListener('error', event => {
    if (!trackingAllowed()) return;
    const resource = event.target && event.target !== window && (event.target.src || event.target.href);
    mark(resource ? 'assetErrors' : 'jsErrors');
  }, true);
  addEventListener('unhandledrejection', () => { if (trackingAllowed()) mark('unhandledRejections'); });

  function watchStartup() {
    const type = pageType();
    if (type !== 'dispatch' && type !== 'explorer') return;
    const timeoutMs = type === 'explorer' ? 90000 : 45000;
    const startedAt = performance.now();
    let done = false;
    const timer = setInterval(() => {
      if (done || !trackingAllowed()) { clearInterval(timer); return; }
      const elapsed = performance.now() - startedAt;
      if (type === 'dispatch') {
        const stage = window.PTBO_ENHANCEMENT_STAGE?.stage;
        if (stage === 'complete' || stage === 'failed') {
          done = true;
          clearInterval(timer);
          mark(stage === 'complete' ? 'startupSuccesses' : 'startupFailures');
          mark('startupMsTotal', elapsed);
          return;
        }
      } else {
        const phase = window.__PTBO_EXPLORER_BOOTSTRAP__?.phase;
        if (phase === 'ready' || phase === 'failed') {
          done = true;
          clearInterval(timer);
          mark(phase === 'ready' ? 'startupSuccesses' : 'startupFailures');
          mark('startupMsTotal', elapsed);
          return;
        }
      }
      if (elapsed >= timeoutMs) {
        done = true;
        clearInterval(timer);
        mark('startupFailures');
        mark('startupTimeouts');
        mark('startupMsTotal', elapsed);
      }
    }, 500);
  }

  async function fetchCollection(collection) {
    const records = [];
    let pageToken = '';
    for (let page = 0; page < 10; page += 1) {
      const params = new URLSearchParams({ key:API_KEY, pageSize:'1000' });
      if (pageToken) params.set('pageToken', pageToken);
      const payload = await firestoreRequest(`${ROOT}/${collection}?${params}`);
      records.push(...(payload.documents || []).map(item => decodeDocument(item, collection)));
      pageToken = payload.nextPageToken || '';
      if (!pageToken) break;
    }
    return records;
  }

  const sum = (records, key) => records.reduce((total, item) => total + num(item[key]), 0);
  function collectDynamic(records, prefix) {
    const out = {};
    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length);
        out[name] = (out[name] || 0) + num(value);
      }
    }
    return out;
  }

  function versionAtLeast(value, minimum) {
    const parse = input => String(input || '0').split('.').map(part => Number(part) || 0);
    const left = parse(value), right = parse(minimum);
    for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
      const a = left[index] || 0, b = right[index] || 0;
      if (a !== b) return a > b;
    }
    return true;
  }

  function dedupeEvents(records) {
    const seen = new Set();
    return records.filter(record => {
      const key = record.eventId ? `event:${record.eventId}` : `${record.collection}:${record.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mergeLegacyAndDetailedCounts(events, summaries, recordType, detailPrefix, valueKey) {
    const legacy = {}, detailedEvents = {};
    for (const record of dedupeEvents(events.filter(item => item.recordType === recordType))) {
      const key = String(record[valueKey] || 'unknown');
      const bucket = versionAtLeast(record.build, '1.6.24') ? detailedEvents : legacy;
      bucket[key] = (bucket[key] || 0) + 1;
    }
    const detailedSummary = collectDynamic(summaries, detailPrefix);
    const keys = new Set([...Object.keys(legacy), ...Object.keys(detailedEvents), ...Object.keys(detailedSummary)]);
    const result = {};
    keys.forEach(key => { result[key] = num(legacy[key]) + Math.max(num(detailedEvents[key]), num(detailedSummary[key])); });
    return result;
  }

  async function loadStats() {
    const settled = await Promise.allSettled([fetchCollection(PRIMARY_COLLECTION), fetchCollection(FALLBACK_COLLECTION)]);
    const all = [];
    settled.forEach(result => { if (result.status === 'fulfilled') all.push(...result.value); });
    if (!all.length && settled.every(result => result.status === 'rejected')) throw new Error('Analytics database is unavailable.');

    const analyticsRecords = all.filter(record => ['visitor','session','session_summary','menu_view','launch','city_select'].includes(record.recordType));
    const summaryMap = new Map();
    analyticsRecords.filter(record => record.recordType === 'session_summary').forEach(record => {
      const key = record.sessionId || record.id;
      const existing = summaryMap.get(key);
      if (!existing || Date.parse(record.updatedAt || 0) >= Date.parse(existing.updatedAt || 0)) summaryMap.set(key, record);
    });
    const summaries = [...summaryMap.values()];

    const visitorRows = new Map();
    analyticsRecords.filter(record => record.recordType === 'visitor').forEach(record => {
      const key = record.visitorId || record.id;
      const existing = visitorRows.get(key);
      if (!existing || Date.parse(record.lastSeenAt || record.createdAt || 0) >= Date.parse(existing.lastSeenAt || existing.createdAt || 0)) visitorRows.set(key, record);
    });

    const sessionRows = new Map();
    analyticsRecords.filter(record => record.recordType === 'session').forEach(record => sessionRows.set(record.sessionId || record.id, record));
    summaries.forEach(record => sessionRows.set(record.sessionId || record.id, record));

    const visitors = new Set(visitorRows.keys());
    summaries.forEach(record => { if (record.visitorId) visitors.add(record.visitorId); });

    const visitorSessionSets = new Map();
    sessionRows.forEach(record => {
      if (!record.visitorId) return;
      if (!visitorSessionSets.has(record.visitorId)) visitorSessionSets.set(record.visitorId, new Set());
      visitorSessionSets.get(record.visitorId).add(record.sessionId || record.id);
    });
    const returningIds = new Set();
    visitorSessionSets.forEach((sessions, visitor) => { if (sessions.size > 1) returningIds.add(visitor); });
    visitorRows.forEach((record, visitor) => { if (num(record.sessionCount) > 1) returningIds.add(visitor); });

    const launches = mergeLegacyAndDetailedCounts(analyticsRecords, summaries, 'launch', 'launch_', 'target');
    const cities = mergeLegacyAndDetailedCounts(analyticsRecords, summaries, 'city_select', 'city_select_', 'city');

    const devices = { mobile:0, desktop:0, unknown:0 };
    const browsers = {};
    sessionRows.forEach(record => {
      const device = ['mobile','desktop'].includes(record.surface) ? record.surface : 'unknown';
      devices[device] += 1;
      const browser = record.browser || 'Unknown';
      browsers[browser] = (browsers[browser] || 0) + 1;
    });

    const dates = analyticsRecords.map(record => Date.parse(record.updatedAt || record.lastSeenAt || record.createdAt || record.firstSeenAt)).filter(Number.isFinite).sort((a, b) => a - b);
    const activeSeconds = sum(summaries, 'activeSeconds');
    const callsStarted = sum(summaries, 'callsStarted');
    const callsCompleted = sum(summaries, 'callsCompleted');
    const emsCalls = sum(summaries, 'emsCalls');
    const emsCallsCompleted = sum(summaries, 'emsCallsCompleted') || Math.min(emsCalls, callsCompleted);
    const startupSuccesses = sum(summaries, 'startupSuccesses');
    const startupFailures = sum(summaries, 'startupFailures');

    return Object.freeze({
      version:VERSION,
      uniqueBrowsers:visitors.size,
      sessions:sessionRows.size,
      returningBrowsers:returningIds.size,
      menuViews:dedupeEvents(analyticsRecords.filter(record => record.recordType === 'menu_view')).length,
      launchesTotal:Object.values(launches).reduce((total, value) => total + num(value), 0),
      activeSeconds,
      avgActiveSeconds:summaries.length ? activeSeconds / summaries.length : 0,
      pageSeconds:{ menu:sum(summaries,'menuSeconds'), dispatch:sum(summaries,'dispatchSeconds'), geoguesser:sum(summaries,'geoguesserSeconds'), explorer:sum(summaries,'explorerSeconds') },
      launches,
      cities,
      citySeconds:collectDynamic(summaries, 'city_seconds_'),
      devices,
      browsers,
      callsStarted,
      callsCompleted,
      callsAbandoned:sum(summaries, 'callsAbandoned'),
      fireCalls:sum(summaries, 'fireCalls'),
      emsCalls,
      completionRate:callsStarted ? callsCompleted / callsStarted * 100 : 0,
      avgResponseSeconds:callsCompleted ? sum(summaries, 'responseMsTotal') / 1000 / callsCompleted : 0,
      avgTransportSeconds:emsCallsCompleted ? sum(summaries, 'transportMsTotal') / 1000 / emsCallsCompleted : 0,
      drivingSeconds:sum(summaries, 'drivingSeconds'),
      stationarySeconds:sum(summaries, 'stationarySeconds'),
      distanceMeters:sum(summaries, 'distanceMeters'),
      fireSeconds:sum(summaries, 'fireSeconds'),
      emsSeconds:sum(summaries, 'emsSeconds'),
      controls:{
        options:sum(summaries,'optionsOpens'), settings:sum(summaries,'settingsChanges'), bases:sum(summaries,'baseSelections'), service:sum(summaries,'serviceChanges'),
        siren:sum(summaries,'sirenToggles'), recenter:sum(summaries,'recenterUses'), reverse:sum(summaries,'reverseUses'), accelerator:sum(summaries,'acceleratorUses'),
        steering:sum(summaries,'steeringUses'), gear:sum(summaries,'gearShifts'), map:sum(summaries,'mapToggles'), audio:sum(summaries,'audioToggles'),
      },
      incidents:collectDynamic(summaries, 'incident_'),
      bases:collectDynamic(summaries, 'base_'),
      geo:{ starts:sum(summaries,'geoDrillsStarted'), guesses:sum(summaries,'geoGuesses'), next:sum(summaries,'geoNextCalls'), ended:sum(summaries,'geoDrillsEnded'), interactions:sum(summaries,'geoInteractions') },
      explorer:{ play:sum(summaries,'explorerPlayUses'), fly:sum(summaries,'explorerFlyUses'), map:sum(summaries,'explorerMapUses'), search:sum(summaries,'explorerSearchUses'), landmarks:sum(summaries,'explorerLandmarkUses'), time:sum(summaries,'explorerTimeUses'), sound:sum(summaries,'explorerSoundUses') },
      startupSuccesses,
      startupFailures,
      startupSuccessRate:(startupSuccesses + startupFailures) ? startupSuccesses / (startupSuccesses + startupFailures) * 100 : 0,
      avgStartupSeconds:(startupSuccesses + startupFailures) ? sum(summaries,'startupMsTotal') / 1000 / (startupSuccesses + startupFailures) : 0,
      errors:{ javascript:sum(summaries,'jsErrors'), assets:sum(summaries,'assetErrors'), rejections:sum(summaries,'unhandledRejections'), startupTimeouts:sum(summaries,'startupTimeouts') },
      firstActivity:dates.length ? new Date(dates[0]).toISOString() : null,
      latestActivity:dates.length ? new Date(dates[dates.length - 1]).toISOString() : null,
      recordCount:analyticsRecords.length,
      detailedSessions:summaries.length,
    });
  }

  window.PTBO_SITE_ANALYTICS = Object.freeze({
    version:VERSION,
    loadStats,
    recordLaunch,
    recordCity,
    trackingAllowed,
    flush:flushSummary,
    health:() => Object.freeze({ version:VERSION, tracking:trackingAllowed(), sessionId, page:pageType() }),
  });
  document.documentElement.dataset.ptboAnalytics = VERSION;

  if (!trackingAllowed()) return;

  window.PTBO_ANALYTICS_READY = Promise.resolve(ensureVisitor()).then(() => true).catch(() => false);
  if (pageType() === 'menu') void recordMenuView();
  attachSimulatorFrame(document.getElementById('simulator'));
  attachDirectSimulatorDocument();
  attachGeoFrame(document.getElementById('game-frame'));
  watchStartup();
  scheduleFlush(1500);

  addEventListener('pagehide', () => {
    accountPageTime();
    finalizers.forEach(finalize => { try { finalize(); } catch (_) {} });
    clearInterval(pageTimer);
    persistState();
    void flushSummary();
  }, { once:true });
  addEventListener('beforeunload', persistState);
})();