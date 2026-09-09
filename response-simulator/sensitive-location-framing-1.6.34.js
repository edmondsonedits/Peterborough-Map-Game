/* Sensitive incident location framing for Emergency Games v1.6.34.
   Preserves real geographic landmarks while avoiding unnecessary implication
   that a fictional sensitive incident occurred inside a named business/place. */
(() => {
  'use strict';
  const VERSION = '1.6.34';
  if (window.PTBO_SENSITIVE_LOCATION_FRAMING?.version === VERSION) return;

  const SENSITIVE = /overdose|substance|rectal|gastrointestinal|wellness check|lift assist|chest pain|cardiac|difficulty breathing/i;
  const RESIDENTIAL = /residential|residence|detached|bungalow|apartment|suite|triplex|multi-family|multi-unit|single-family|subdivision home|housing unit|high-density housing|residential lot|residential structure|residential home|residential area|residential unit|split-level home|core apartment/i;
  const LANDMARK = /pizza|tim hortons|subway|restaurant|diner|cafe|coffee|motel|hotel|clinic|medical hub|terminal|park|pavilion|greenspace|commercial|store|mall|plaza|school|college|university|arena|library|church|facility|rail corridor|industrial|downtown transit/i;
  let lastSensitiveLabel = '';

  function cleanLandmark(value) {
    return String(value || '')
      .replace(/\s+(Dining Facility|Commercial Unit|Restroom|Property|Public Pavilion|Medical Hub|Corridor Unit|Interface)$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeLocationLabel(original) {
    const value = String(original || '').trim();
    if (!value) return value;
    if (RESIDENTIAL.test(value)) return 'Residential address';
    const cleaned = cleanLandmark(value);
    if (LANDMARK.test(value)) return `Outside / near ${cleaned}`;
    return `Near ${cleaned}`;
  }

  function markMeta(content) {
    const meta = content?.querySelector('.hud-meta');
    if (!meta || meta.dataset.ptboLandmarkNotice === '1') return;
    meta.dataset.ptboLandmarkNotice = '1';
    meta.append(document.createTextNode(' · Landmark/location reference only'));
  }

  function frameHud() {
    const content = document.getElementById('hud-content');
    if (!content) return;
    const title = content.querySelector('.hud-title')?.textContent || '';
    const address = content.querySelector('.hud-address');
    if (!address) return;

    if (/ACTIVE ENROUTE DISPATCH/i.test(title) && SENSITIVE.test(title)) {
      if (address.dataset.ptboSensitiveFramed !== '1') {
        const label = safeLocationLabel(address.textContent);
        if (label) {
          address.textContent = label;
          address.dataset.ptboSensitiveFramed = '1';
          lastSensitiveLabel = label;
          markMeta(content);
        }
      }
      return;
    }

    if (/ON SCENE/i.test(title) && lastSensitiveLabel && address.dataset.ptboSensitiveFramed !== '1') {
      address.textContent = lastSensitiveLabel;
      address.dataset.ptboSensitiveFramed = '1';
      markMeta(content);
      return;
    }

    if (/AVAILABLE|TRANSPORT TO HOSPITAL|ARRIVED AT HOSPITAL|SYSTEM READINESS/i.test(title)) lastSensitiveLabel = '';
  }

  function framePopup(popup) {
    if (!popup || popup.dataset.ptboSensitiveFramed === '1') return;
    const text = popup.textContent || '';
    if (!SENSITIVE.test(text)) return;
    const name = popup.querySelector('b');
    if (!name) return;
    name.textContent = safeLocationLabel(name.textContent);
    popup.dataset.ptboSensitiveFramed = '1';
    const note = document.createElement('div');
    note.style.cssText = 'margin-top:4px;font-size:10px;opacity:.78';
    note.textContent = 'Simulated incident · landmark/location reference only';
    popup.appendChild(note);
  }

  function scan() {
    frameHud();
    document.querySelectorAll('.leaflet-popup-content').forEach(framePopup);
  }

  const observer = new MutationObserver(scan);
  function install() {
    if (!document.body) return false;
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    scan();
    return true;
  }

  window.PTBO_SENSITIVE_LOCATION_FRAMING = Object.freeze({
    version:VERSION,
    safeLocationLabel,
    sensitivePattern:SENSITIVE.source,
    policy:'Preserve real landmarks; neutralize sensitive residential labels and frame named places as outside/near references.',
  });

  if (document.body) install();
  else document.addEventListener('DOMContentLoaded', install, { once:true });
  addEventListener('pagehide', () => observer.disconnect(), { once:true });
})();
