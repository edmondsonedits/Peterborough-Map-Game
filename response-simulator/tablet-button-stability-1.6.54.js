/* v1.6.54 tablet button stability: prevent the legacy route module from flashing its old label. */
(() => {
  'use strict';

  const VERSION = '1.6.54';
  if (window.PTBO_TABLET_BUTTON_STABILITY?.version === VERSION) return;

  const state = { installed:false, observer:null, button:null };

  function installStyle() {
    if (document.getElementById('ptbo-tablet-button-stability-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-tablet-button-stability-style';
    style.textContent = `
      #route-answer-btn.ptbo-tablet-owned-label{
        font-size:0!important;
        line-height:1.15!important;
      }
      #route-answer-btn.ptbo-tablet-owned-label::after{
        content:'Open Tablet';
        display:inline-block;
        font:800 12px/1.15 system-ui,-apple-system,"Segoe UI",sans-serif;
        letter-spacing:0;
        white-space:nowrap;
        vertical-align:middle;
      }
      @media(max-width:900px),(pointer:coarse){
        #route-answer-btn.ptbo-tablet-owned-label::after{font-size:10px}
      }
    `;
    document.head.appendChild(style);
  }

  function ownButton() {
    const button = document.getElementById('route-answer-btn');
    if (!button) return false;
    if (state.button === button && button.classList.contains('ptbo-tablet-owned-label')) return true;
    state.button = button;
    button.classList.add('ptbo-tablet-owned-label');
    button.dataset.ptboTabletButtonOwner = VERSION;
    button.title = 'Open the response tablet to view the active destination';
    button.setAttribute('aria-label', 'Open response tablet');
    return true;
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    installStyle();
    ownButton();
    state.observer = new MutationObserver(() => ownButton());
    state.observer.observe(document.body, { childList:true, subtree:true });
  }

  window.PTBO_TABLET_BUTTON_STABILITY = Object.freeze({ version:VERSION, state, refresh:ownButton });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
