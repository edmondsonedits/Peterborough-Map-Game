/* v1.6.53 response tablet close behavior: minimize the active dispatch HUD after the tablet closes. */
(() => {
  'use strict';

  const VERSION = '1.6.53';
  if (window.PTBO_TABLET_CLOSE_DISPATCH?.version === VERSION) return;

  const state = {
    installed: false,
    observer: null,
    bodyObserver: null,
    wasTabletOpen: false,
  };

  function installStyle() {
    if (document.getElementById('ptbo-tablet-dispatch-minimize-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-tablet-dispatch-minimize-style';
    style.textContent = `
      #ptbo-tablet-dispatch-expand{
        display:none;width:100%;min-height:29px;margin-top:6px;padding:0;
        place-items:center;color:#fff;border:1px solid rgba(255,255,255,.24);
        border-radius:8px;background:rgba(15,23,42,.94);box-shadow:0 4px 12px rgba(0,0,0,.28);
        cursor:pointer;
      }
      #ptbo-tablet-dispatch-expand svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
      #ptbo-tablet-dispatch-expand:hover{background:#243246}
      #ptbo-tablet-dispatch-expand:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}
      #dispatch-hud.ptbo-tablet-dispatch-collapsed{
        top:15px!important;left:50%!important;right:auto!important;width:122px!important;max-width:122px!important;
        min-height:0!important;padding:9px 10px!important;display:grid!important;grid-template-columns:1fr!important;
        gap:0!important;align-items:center!important;transform:translateX(-50%)!important;border-left-width:4px!important;
        border-radius:12px!important;box-shadow:0 7px 22px rgba(0,0,0,.42)!important;
      }
      #dispatch-hud.ptbo-tablet-dispatch-collapsed .hud-main{display:none!important}
      #dispatch-hud.ptbo-tablet-dispatch-collapsed .hud-timer-block{width:100%!important;min-width:0!important;margin:0!important;text-align:center!important}
      #dispatch-hud.ptbo-tablet-dispatch-collapsed .hud-clock-display{margin:0!important;font-size:23px!important;line-height:1!important}
      #dispatch-hud.ptbo-tablet-dispatch-collapsed .hud-timer-block>.hud-btn{display:none!important}
      #dispatch-hud.ptbo-tablet-dispatch-collapsed #ptbo-tablet-dispatch-expand{display:grid!important}
    `;
    document.head.appendChild(style);
  }

  function ensureExpandButton() {
    const hud = document.getElementById('dispatch-hud');
    const timerBlock = hud?.querySelector('.hud-timer-block');
    if (!hud || !timerBlock) return null;
    let button = document.getElementById('ptbo-tablet-dispatch-expand');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'ptbo-tablet-dispatch-expand';
    button.type = 'button';
    button.setAttribute('aria-label', 'Show full dispatch details');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      hud.classList.remove('ptbo-tablet-dispatch-collapsed');
      button.setAttribute('aria-expanded', 'true');
    });
    timerBlock.appendChild(button);
    return button;
  }

  function minimizeDispatchHud() {
    const hud = document.getElementById('dispatch-hud');
    if (!hud || !hud.classList.contains('incident-active')) return false;

    const mobileClose = document.getElementById('ptbo-mobile-dispatch-close');
    if (mobileClose && !hud.classList.contains('ptbo-mobile-dispatch-collapsed')) {
      mobileClose.click();
      return true;
    }

    installStyle();
    const expand = ensureExpandButton();
    if (!expand) return false;
    hud.classList.add('ptbo-tablet-dispatch-collapsed');
    expand.setAttribute('aria-expanded', 'false');
    return true;
  }

  function attachTabletObserver() {
    const overlay = document.getElementById('ptbo-response-tablet-overlay');
    if (!overlay) return false;
    if (state.observer) state.observer.disconnect();
    state.wasTabletOpen = !overlay.hidden;
    state.observer = new MutationObserver(() => {
      const open = !overlay.hidden;
      if (state.wasTabletOpen && !open) minimizeDispatchHud();
      state.wasTabletOpen = open;
    });
    state.observer.observe(overlay, { attributes:true, attributeFilter:['hidden'] });
    return true;
  }

  function install() {
    if (state.installed) return;
    state.installed = true;
    installStyle();
    ensureExpandButton();
    if (attachTabletObserver()) return;
    state.bodyObserver = new MutationObserver(() => {
      if (!attachTabletObserver()) return;
      state.bodyObserver?.disconnect();
      state.bodyObserver = null;
    });
    state.bodyObserver.observe(document.body, { childList:true, subtree:true });
  }

  window.PTBO_TABLET_CLOSE_DISPATCH = Object.freeze({
    version: VERSION,
    state,
    minimize: minimizeDispatchHud,
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();
