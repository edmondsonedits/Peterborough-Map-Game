/* Simulated incident disclosure for Emergency Games v1.6.33. */
(() => {
  'use strict';
  const VERSION = '1.6.33';
  if (window.PTBO_SIMULATED_INCIDENT_NOTICE?.version === VERSION) return;

  const NOTICE_URL = new URL('../legal/simulated-incidents.html', document.currentScript?.src || location.href).href;

  function ensureTrainingUi() {
    if (window.PTBO_TRAINING_UI?.version === '1.6.57' || document.getElementById('ptbo-training-ui-v1657-fallback')) return;
    const script = document.createElement('script');
    script.id = 'ptbo-training-ui-v1657-fallback';
    script.src = new URL('training-ui-1.6.57.js?v=1.6.57', document.currentScript?.src || location.href).href;
    script.dataset.ptboRelease = '1.6.57';
    script.onerror = () => script.remove();
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  function ensureStyle() {
    if (document.getElementById('ptbo-simulated-incident-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-simulated-incident-style';
    style.textContent = `
      #ptbo-simulated-incident-disclosure{margin:.55rem 0 .15rem;padding:.42rem .55rem;border:1px solid rgba(251,191,36,.38);border-radius:.55rem;background:rgba(69,26,3,.72);color:#fef3c7;font:700 10px/1.32 system-ui,-apple-system,"Segoe UI",sans-serif}
      #ptbo-simulated-incident-disclosure strong{display:inline-block;margin-right:.35rem;color:#fde68a;font-size:9px;letter-spacing:.08em;text-transform:uppercase}
      #ptbo-simulated-incident-disclosure a{color:#fff;text-decoration:underline;text-underline-offset:2px}
      @media(max-width:520px){#ptbo-simulated-incident-disclosure{margin:.35rem 0 .1rem;padding:.35rem .45rem;font-size:8px}#ptbo-simulated-incident-disclosure strong{font-size:7px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureTrainingUi();
    const hud = document.getElementById('dispatch-hud');
    const content = document.getElementById('hud-content');
    if (!hud || !content) return false;
    ensureStyle();

    let disclosure = document.getElementById('ptbo-simulated-incident-disclosure');
    if (!disclosure) {
      disclosure = document.createElement('div');
      disclosure.id = 'ptbo-simulated-incident-disclosure';
      disclosure.setAttribute('role', 'note');
      disclosure.innerHTML = '<strong>Simulated incident</strong>Business and place names are used as geographic landmarks for training. No actual incident, occupant, affiliation, endorsement, or event is implied. <a href="#">Details</a>';
      const link = disclosure.querySelector('a');
      link?.addEventListener('click', event => {
        event.preventDefault();
        try { window.top.location.href = NOTICE_URL; }
        catch (_) { location.href = NOTICE_URL; }
      });
      content.appendChild(disclosure);
    }

    const sync = () => {
      const active = hud.classList.contains('incident-active') || hud.classList.contains('incident-success') || /Next Call/i.test(document.getElementById('hud-action-btn')?.textContent || '');
      disclosure.hidden = !active;
      if (active && disclosure.parentElement !== content) content.appendChild(disclosure);
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(hud, { attributes:true, attributeFilter:['class'], subtree:true, childList:true, characterData:true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once:true });
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (install() || attempts >= 40) clearInterval(timer);
  }, 250);
  ensureTrainingUi();
  install();

  window.PTBO_SIMULATED_INCIDENT_NOTICE = Object.freeze({ version:VERSION, install });
})();
