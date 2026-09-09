/* Central simulated-incident presentation policy for Emergency Games v1.6.44.
   Canonical dispatch geography remains unchanged. This module owns the wording
   shown/spoken to players and exported to future history-facing presentation. */
(() => {
  'use strict';

  const VERSION = '1.6.44';
  if (window.PTBO_INCIDENT_FORMAT?.version === VERSION) return;

  const SENSITIVE = /overdose|substance|rectal|gastrointestinal|wellness check|lift assist|chest pain|cardiac|difficulty breathing/i;
  const RESIDENTIAL = /residential|residence|detached|bungalow|apartment|suite|triplex|multi-family|multi-unit|single-family|subdivision home|housing unit|high-density housing|residential lot|residential structure|residential home|residential area|residential unit|split-level home|core apartment/i;
  const LANDMARK = /pizza|tim hortons|subway|restaurant|diner|cafe|coffee|motel|hotel|clinic|medical hub|terminal|park|pavilion|greenspace|commercial|store|mall|plaza|school|college|university|arena|library|church|facility|rail corridor|industrial|downtown transit/i;
  const SUFFIX = /\s+(Dining Facility|Commercial Unit|Restroom|Property|Public Pavilion|Medical Hub|Corridor Unit|Interface)$/i;

  const state = {
    installed: false,
    lastIncident: null,
    lastDisplay: null,
    speechWrapped: false,
  };

  const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function subtypeOf(incident) {
    if (typeof incident === 'string') return text(incident);
    return text(incident?.sub || incident?.subtype || incident?.type || incident?.callType);
  }

  function isSensitive(incident) {
    return SENSITIVE.test(subtypeOf(incident));
  }

  function cleanLandmark(value) {
    return text(value).replace(SUFFIX, '').trim();
  }

  function displayLocation(name, incident) {
    const original = text(name);
    if (!original || !isSensitive(incident)) return original;
    if (RESIDENTIAL.test(original)) return 'Residential address';
    const cleaned = cleanLandmark(original);
    if (LANDMARK.test(original)) return `Outside / near ${cleaned}`;
    return `Near ${cleaned}`;
  }

  function formatIncident(incident = {}) {
    const sourceName = text(incident.name || incident.location || incident.label);
    const subtype = subtypeOf(incident);
    const sensitive = isSensitive({ sub: subtype });
    const displayName = displayLocation(sourceName, { sub: subtype });
    const residential = sensitive && RESIDENTIAL.test(sourceName);
    const landmarkReference = sensitive && !residential && displayName !== sourceName;
    return Object.freeze({
      sourceName,
      displayName,
      address: text(incident.addr || incident.address),
      category: text(incident.main || incident.category),
      subtype,
      sensitive,
      residential,
      landmarkReference,
      simulated: true,
    });
  }

  function speechLocation(formatted) {
    return formatted.displayName
      .replace(/^Outside\s*\/\s*near\s+/i, 'outside or near ')
      .replace(/^Near\s+/i, 'near ');
  }

  function formatSpeech(phrase, incident) {
    const original = String(phrase ?? '');
    const formatted = formatIncident(incident || currentIncident());
    if (!formatted.sensitive || !formatted.sourceName || !original.includes(formatted.sourceName)) return original;
    return original.split(formatted.sourceName).join(speechLocation(formatted));
  }

  function formatForHistory(incident = {}) {
    const formatted = formatIncident(incident);
    return Object.freeze({
      displayName: formatted.displayName,
      address: formatted.address,
      category: formatted.category,
      subtype: formatted.subtype,
      simulated: true,
      landmarkReference: formatted.landmarkReference,
    });
  }

  function currentIncident() {
    try {
      if (typeof activeIncident !== 'undefined' && activeIncident) return activeIncident;
    } catch (_) {}
    try {
      if (typeof mission !== 'undefined' && mission?.scene) return mission.scene;
    } catch (_) {}
    return state.lastIncident;
  }

  function markMeta(content, formatted) {
    const meta = content?.querySelector?.('.hud-meta');
    if (!meta || !formatted.sensitive || meta.dataset.ptboLandmarkNotice === '1') return;
    meta.dataset.ptboLandmarkNotice = '1';
    meta.append(document.createTextNode(' · Landmark/location reference only'));
  }

  function frameHud() {
    const content = document.getElementById('hud-content');
    if (!content) return;
    const title = content.querySelector('.hud-title')?.textContent || '';
    const address = content.querySelector('.hud-address');
    if (!address) return;

    if (/AVAILABLE|TRANSPORT TO HOSPITAL|ARRIVED AT HOSPITAL|SYSTEM READINESS/i.test(title)) {
      state.lastIncident = null;
      state.lastDisplay = null;
      return;
    }

    if (!/ACTIVE ENROUTE DISPATCH|ON SCENE/i.test(title)) return;
    const incident = currentIncident();
    const formatted = formatIncident(incident || {});
    if (!formatted.sensitive) return;

    state.lastIncident = incident || state.lastIncident;
    state.lastDisplay = formatted;
    if (formatted.displayName && address.textContent !== formatted.displayName) address.textContent = formatted.displayName;
    address.dataset.ptboIncidentFormatted = VERSION;
    markMeta(content, formatted);
  }

  function framePopup(popup) {
    if (!popup || popup.dataset.ptboIncidentFormatted === VERSION) return;
    const popupText = popup.textContent || '';
    if (!SENSITIVE.test(popupText)) return;
    const name = popup.querySelector('b');
    if (!name) return;
    const formatted = formatIncident({ name: name.textContent, sub: popupText });
    if (!formatted.sensitive) return;
    name.textContent = formatted.displayName;
    popup.dataset.ptboIncidentFormatted = VERSION;
    if (!popup.querySelector('.ptbo-simulated-landmark-note')) {
      const note = document.createElement('div');
      note.className = 'ptbo-simulated-landmark-note';
      note.style.cssText = 'margin-top:4px;font-size:10px;opacity:.78';
      note.textContent = 'Simulated incident · landmark/location reference only';
      popup.appendChild(note);
    }
  }

  function replaceTextNodes(root, from, to) {
    if (!root || !from || from === to) return;
    for (const node of Array.from(root.childNodes || [])) {
      if (node.nodeType === 3) {
        if (String(node.nodeValue || '').includes(from)) node.nodeValue = String(node.nodeValue).split(from).join(to);
      } else {
        replaceTextNodes(node, from, to);
      }
    }
  }

  function frameRouteReview() {
    const card = document.getElementById('route-answer-card');
    const incident = currentIncident() || state.lastIncident;
    if (!card || !incident) return;
    const formatted = formatIncident(incident);
    if (!formatted.sensitive || !formatted.sourceName) return;
    replaceTextNodes(card, formatted.sourceName, formatted.displayName);
    card.dataset.ptboIncidentFormatted = VERSION;
  }

  function wrapSpeech() {
    if (state.speechWrapped) return true;
    const original = window.playDispatchAudioText;
    if (typeof original !== 'function' || original.__ptboIncidentFormatter === VERSION) return false;
    function wrapped(phrase) {
      return original.call(this, formatSpeech(phrase, currentIncident()));
    }
    Object.defineProperty(wrapped, '__ptboIncidentFormatter', { value: VERSION });
    window.playDispatchAudioText = wrapped;
    state.speechWrapped = true;
    return true;
  }

  function scan() {
    frameHud();
    document.querySelectorAll?.('.leaflet-popup-content').forEach(framePopup);
    frameRouteReview();
    wrapSpeech();
  }

  let observer = null;
  function install() {
    if (state.installed || !document.body) return state.installed;
    observer = new MutationObserver(scan);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    state.installed = true;
    scan();
    return true;
  }

  const api = Object.freeze({
    version: VERSION,
    state,
    isSensitive,
    cleanLandmark,
    displayLocation,
    formatIncident,
    formatSpeech,
    formatForHistory,
    currentIncident,
    scan,
    install,
    policy: 'Keep canonical dispatch geography intact; centralize simulated incident wording for display, speech, route review, popups, and history-facing presentation.',
  });

  window.PTBO_INCIDENT_FORMAT = api;
  window.PTBO_SENSITIVE_LOCATION_FRAMING = api;

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once:true });

  let speechAttempts = 0;
  const speechTimer = setInterval(() => {
    speechAttempts += 1;
    if (wrapSpeech() || speechAttempts >= 40) clearInterval(speechTimer);
  }, 250);

  addEventListener('pagehide', () => {
    observer?.disconnect();
    clearInterval(speechTimer);
  }, { once:true });
})();
