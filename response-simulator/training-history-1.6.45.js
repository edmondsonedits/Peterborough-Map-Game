/* Local training-session history for Emergency Games v1.6.45.
   Stores only training-useful completion summaries in this browser. No cloud sync. */
(() => {
  'use strict';

  const VERSION = '1.6.45';
  const STORAGE_KEY = 'ptbo.trainingHistory.v1';
  const SESSION_KEY = 'ptbo.trainingHistory.session.v1';
  const SESSION_STARTED_KEY = 'ptbo.trainingHistory.sessionStarted.v1';
  const MAX_ENTRIES = 150;
  if (window.PTBO_TRAINING_HISTORY?.version === VERSION) return;

  const memory = [];
  const state = {
    storageAvailable: true,
    pending: [],
    installed: false,
    drainTimer: 0,
  };

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;

  function readJson(storage, key, fallback) {
    try {
      const raw = storage?.getItem?.(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function randomId() {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function currentSessionId() {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = randomId();
        sessionStorage.setItem(SESSION_KEY, id);
        sessionStorage.setItem(SESSION_STARTED_KEY, new Date().toISOString());
      }
      return id;
    } catch (_) {
      return 'page-session';
    }
  }

  function sessionStartedAt() {
    try { return sessionStorage.getItem(SESSION_STARTED_KEY) || new Date().toISOString(); }
    catch (_) { return new Date().toISOString(); }
  }

  function loadEntries() {
    if (!state.storageAvailable && memory.length) return memory.slice();
    try {
      const raw = localStorage?.getItem?.(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      const clean = parsed.slice(0, MAX_ENTRIES);
      state.storageAvailable = true;
      memory.splice(0, memory.length, ...clean);
      return clean;
    } catch (_) {
      state.storageAvailable = false;
      return memory.slice();
    }
  }

  function saveEntries(entries) {
    const clean = Array.isArray(entries) ? entries.slice(0, MAX_ENTRIES) : [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      state.storageAvailable = true;
      memory.splice(0, memory.length, ...clean);
      return true;
    } catch (_) {
      state.storageAvailable = false;
      memory.splice(0, memory.length, ...clean);
      return false;
    }
  }

  function selectedBaseLabel() {
    try {
      const selected = document.querySelector('#service-spawns [aria-pressed="true"]');
      return text(selected?.textContent || '');
    } catch (_) {
      return '';
    }
  }

  function cityContext() {
    const city = window.PTBO_CITY_PACKAGE || {};
    let queryId = '';
    try { queryId = new URL(location.href).searchParams.get('city') || ''; } catch (_) {}
    return {
      id: text(city.id || city.cityId || queryId || 'peterborough'),
      name: text(city.name || city.cityName || 'Peterborough'),
    };
  }

  function formatterReady() {
    return Boolean(window.PTBO_INCIDENT_FORMAT && typeof window.PTBO_INCIDENT_FORMAT.formatForHistory === 'function');
  }

  function normalizeCompletion(snapshot = {}) {
    if (!formatterReady()) return null;
    const scene = snapshot.scene || {};
    const presented = window.PTBO_INCIDENT_FORMAT.formatForHistory(scene);
    const city = cityContext();
    const service = text(snapshot.service || 'fire').toLowerCase() === 'ems' ? 'ems' : 'fire';
    const responseMs = Math.max(0, finite(snapshot.responseMs));
    const transportMs = service === 'ems' ? Math.max(0, finite(snapshot.transportMs)) : 0;
    const sessionId = currentSessionId();
    const generation = text(snapshot.generation || 'unknown');
    const completedAt = snapshot.completedAt ? new Date(snapshot.completedAt).toISOString() : new Date().toISOString();
    const completionKey = `${sessionId}:${generation}:${service}`;

    return Object.freeze({
      id: completionKey,
      sessionId,
      sessionStartedAt: sessionStartedAt(),
      completedAt,
      buildVersion: text(window.PTBO_BUILD?.version || VERSION),
      cityId: city.id,
      cityName: city.name,
      service,
      base: selectedBaseLabel(),
      category: text(presented.category),
      subtype: text(presented.subtype),
      location: text(presented.displayName),
      address: text(presented.address),
      simulated: presented.simulated !== false,
      landmarkReference: Boolean(presented.landmarkReference),
      responseSeconds: Number((responseMs / 1000).toFixed(1)),
      transportSeconds: Number((transportMs / 1000).toFixed(1)),
      totalSeconds: Number(((responseMs + transportMs) / 1000).toFixed(1)),
      hospital: service === 'ems' ? text(snapshot.hospital?.name || '') : '',
    });
  }

  function refreshUi() {
    const button = document.getElementById('ptbo-training-history-button');
    if (button) button.textContent = `Training History (${loadEntries().length})`;
    const modal = document.getElementById('ptbo-training-history-modal');
    if (modal && !modal.hidden) renderHistory();
  }

  function recordCompletion(snapshot) {
    if (!snapshot) return null;
    const normalized = normalizeCompletion(snapshot);
    if (!normalized) {
      state.pending.push(snapshot);
      scheduleDrain();
      return null;
    }
    const current = loadEntries();
    const next = [normalized, ...current.filter(entry => entry?.id !== normalized.id)].slice(0, MAX_ENTRIES);
    saveEntries(next);
    refreshUi();
    return normalized;
  }

  function drainPending() {
    if (!formatterReady()) return false;
    const queued = state.pending.splice(0);
    const globalPending = Array.isArray(window.PTBO_PENDING_TRAINING_HISTORY)
      ? window.PTBO_PENDING_TRAINING_HISTORY.splice(0)
      : [];
    [...globalPending, ...queued].forEach(recordCompletion);
    return true;
  }

  function scheduleDrain() {
    if (state.drainTimer) return;
    let attempts = 0;
    state.drainTimer = setInterval(() => {
      attempts += 1;
      if (drainPending() || attempts >= 60) {
        clearInterval(state.drainTimer);
        state.drainTimer = 0;
      }
    }, 100);
  }

  function summary(entries = loadEntries()) {
    const calls = entries.length;
    const responseValues = entries.map(entry => finite(entry.responseSeconds)).filter(value => value >= 0);
    const averageResponse = responseValues.length
      ? responseValues.reduce((sum, value) => sum + value, 0) / responseValues.length
      : 0;
    const emsTransports = entries.filter(entry => entry.service === 'ems').length;
    const sessions = new Set(entries.map(entry => entry.sessionId).filter(Boolean)).size;
    return Object.freeze({
      calls,
      sessions,
      emsTransports,
      averageResponseSeconds: Number(averageResponse.toFixed(1)),
    });
  }

  function formatWhen(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function ensureUi() {
    if (!document.body || state.installed) return state.installed;
    const panel = document.querySelector('#control-panel .panel-scroll');
    if (panel && !document.getElementById('ptbo-training-history-button')) {
      const heading = document.createElement('div');
      heading.className = 'section-title';
      heading.textContent = 'Training History';
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'ptbo-training-history-button';
      button.className = 'station-spawn-box';
      button.style.borderColor = '#6366f1';
      button.addEventListener('click', openHistory);
      panel.append(heading, button);
    }

    if (!document.getElementById('ptbo-training-history-style')) {
      const style = document.createElement('style');
      style.id = 'ptbo-training-history-style';
      style.textContent = `
        #ptbo-training-history-modal{position:fixed;inset:0;z-index:5000;background:rgba(2,6,23,.88);padding:20px;overflow:auto;color:#e5e7eb;font:13px/1.45 system-ui,sans-serif}
        #ptbo-training-history-modal[hidden]{display:none}
        .ptbo-history-card{max-width:820px;margin:3vh auto;background:#111827;border:1px solid #334155;border-radius:16px;padding:18px;box-shadow:0 24px 70px #0008}
        .ptbo-history-head{display:flex;gap:12px;justify-content:space-between;align-items:flex-start}.ptbo-history-head h2{margin:0;color:#fff;font-size:21px}.ptbo-history-sub{color:#94a3b8;font-size:12px}
        .ptbo-history-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.ptbo-history-actions button{border:1px solid #475569;border-radius:9px;background:#1e293b;color:#fff;padding:8px 11px;font-weight:700;cursor:pointer}
        .ptbo-history-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.ptbo-history-stat{background:#0f172a;border:1px solid #273449;border-radius:10px;padding:10px}.ptbo-history-stat strong{display:block;color:#fff;font-size:18px}.ptbo-history-list{display:grid;gap:8px}.ptbo-history-entry{background:#0b1220;border:1px solid #243047;border-radius:11px;padding:11px}.ptbo-history-entry strong{color:#fff}.ptbo-history-meta{color:#94a3b8;font-size:11px;margin-top:4px}.ptbo-history-empty{padding:30px 10px;text-align:center;color:#94a3b8}
        @media(max-width:600px){#ptbo-training-history-modal{padding:8px}.ptbo-history-card{margin:1vh auto;padding:13px}.ptbo-history-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `;
      document.head.appendChild(style);
    }

    if (!document.getElementById('ptbo-training-history-modal')) {
      const modal = document.createElement('div');
      modal.id = 'ptbo-training-history-modal';
      modal.hidden = true;
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-label', 'Training History');
      modal.innerHTML = '<div class="ptbo-history-card" id="ptbo-training-history-card"></div>';
      modal.addEventListener('click', event => { if (event.target === modal) closeHistory(); });
      document.body.appendChild(modal);
    }

    state.installed = true;
    refreshUi();
    return true;
  }

  function renderHistory() {
    const card = document.getElementById('ptbo-training-history-card');
    if (!card) return;
    const entries = loadEntries();
    const stats = summary(entries);
    const storageNote = state.storageAvailable
      ? 'Saved only in this browser.'
      : 'Browser storage is unavailable; history will last only for this page.';
    const rows = entries.map(entry => {
      const service = entry.service === 'ems' ? 'EMS' : 'Fire';
      const times = entry.service === 'ems'
        ? `Response ${finite(entry.responseSeconds).toFixed(1)}s · Transport ${finite(entry.transportSeconds).toFixed(1)}s`
        : `Response ${finite(entry.responseSeconds).toFixed(1)}s`;
      const place = [entry.location, entry.address].filter(Boolean).map(escapeHtml).join(' · ');
      const base = entry.base ? ` · ${escapeHtml(entry.base)}` : '';
      const hospital = entry.hospital ? ` · Hospital: ${escapeHtml(entry.hospital)}` : '';
      return `<article class="ptbo-history-entry"><strong>${escapeHtml(service)} · ${escapeHtml(entry.subtype || entry.category || 'Training call')}</strong><div>${place || 'Location unavailable'}</div><div class="ptbo-history-meta">${escapeHtml(formatWhen(entry.completedAt))} · ${escapeHtml(times)}${base}${hospital}</div></article>`;
    }).join('');

    card.innerHTML = `
      <div class="ptbo-history-head"><div><h2>Training History</h2><div class="ptbo-history-sub">${escapeHtml(storageNote)} No route traces, account identifiers, or cloud analytics are stored here.</div></div><button type="button" id="ptbo-history-close" aria-label="Close history">✕</button></div>
      <div class="ptbo-history-stats"><div class="ptbo-history-stat"><strong>${stats.calls}</strong>Calls</div><div class="ptbo-history-stat"><strong>${stats.sessions}</strong>Sessions</div><div class="ptbo-history-stat"><strong>${stats.averageResponseSeconds.toFixed(1)}s</strong>Avg response</div><div class="ptbo-history-stat"><strong>${stats.emsTransports}</strong>EMS transports</div></div>
      <div class="ptbo-history-actions"><button type="button" id="ptbo-history-export">Export JSON</button><button type="button" id="ptbo-history-clear">Clear History</button></div>
      <div class="ptbo-history-list">${rows || '<div class="ptbo-history-empty">Complete a Fire or EMS assignment to add it here.</div>'}</div>`;

    document.getElementById('ptbo-history-close')?.addEventListener('click', closeHistory);
    document.getElementById('ptbo-history-export')?.addEventListener('click', exportHistory);
    document.getElementById('ptbo-history-clear')?.addEventListener('click', () => {
      if (confirm('Clear all locally saved training history from this browser?')) clear();
    });
  }

  function openHistory() {
    ensureUi();
    const modal = document.getElementById('ptbo-training-history-modal');
    if (!modal) return;
    renderHistory();
    modal.hidden = false;
  }

  function closeHistory() {
    const modal = document.getElementById('ptbo-training-history-modal');
    if (modal) modal.hidden = true;
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); state.storageAvailable = true; } catch (_) { state.storageAvailable = false; }
    memory.length = 0;
    refreshUi();
  }

  function exportHistory() {
    const payload = {
      schema: 'ptbo-training-history-v1',
      exportedAt: new Date().toISOString(),
      buildVersion: text(window.PTBO_BUILD?.version || VERSION),
      entries: loadEntries(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `emergency-games-training-history-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return payload;
  }

  const api = Object.freeze({
    version: VERSION,
    storageKey: STORAGE_KEY,
    maxEntries: MAX_ENTRIES,
    state,
    list: () => loadEntries().map(entry => ({ ...entry })),
    summary,
    recordCompletion,
    normalizeCompletion,
    clear,
    open: openHistory,
    close: closeHistory,
    exportData: () => ({ schema:'ptbo-training-history-v1', entries:loadEntries() }),
    storageMode: () => state.storageAvailable ? 'localStorage' : 'memory',
    policy: 'Local-only training completion summaries; no route traces, account identifiers, or cloud synchronization.',
  });

  window.PTBO_TRAINING_HISTORY = api;
  drainPending();
  if (!formatterReady()) scheduleDrain();
  if (document.body) ensureUi();
  else document.addEventListener('DOMContentLoaded', ensureUi, { once:true });

  addEventListener('pagehide', () => {
    if (state.drainTimer) clearInterval(state.drainTimer);
  }, { once:true });
})();
