/* =========================================================
   BEGINNER CODE GUIDE — MOBILE DISPATCH CARD COLLAPSE

   PURPOSE:
   On the mobile driving simulator, keep the full dispatch card visible for five
   seconds after a dispatch starts, then reduce it to a small timer card.

   WHAT THE PLAYER EXPERIENCES:
   - Starting a call opens the full dispatch card.
   - Exactly five seconds after the call enters Responding mode, it minimizes.
   - The minimized card keeps the live response timer visible.
   - Tapping the arrow restores the full card.
   - Tapping the small X minimizes the restored card again.

   This file runs in the outer mobile wrapper and controls the same-origin
   simulator iframe. Desktop gameplay and desktop layout are not changed.
   ========================================================= */
(() => {
  'use strict';

  const VERSION = '1.5.5';
  const AUTO_COLLAPSE_DELAY_MS = 5000;
  const frame = document.getElementById('simulator');

  if (!frame || window.PTBO_MOBILE_DISPATCH_HUD_VERSION === VERSION) return;
  window.PTBO_MOBILE_DISPATCH_HUD_VERSION = VERSION;

  let installRetryTimer = 0;

  function installIntoSimulator() {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return false;

    const hud = doc.getElementById('dispatch-hud');
    const timerBlock = doc.querySelector('.hud-timer-block');
    if (!hud || !timerBlock) return false;

    if (doc.documentElement.dataset.ptboMobileDispatchHud === VERSION) return true;
    doc.documentElement.dataset.ptboMobileDispatchHud = VERSION;

    /* Remove controls left by an older cached release before installing v1.5.5. */
    doc.getElementById('ptbo-mobile-dispatch-hud-style')?.remove();
    doc.getElementById('ptbo-mobile-dispatch-close')?.remove();
    doc.getElementById('ptbo-mobile-dispatch-expand')?.remove();
    hud.classList.remove('ptbo-mobile-dispatch-collapsed');

    const style = doc.createElement('style');
    style.id = 'ptbo-mobile-dispatch-hud-style';
    style.textContent = `
      #dispatch-hud.ptbo-mobile-dispatch-ready{
        overflow:visible!important;
        transition:width .2s ease,max-width .2s ease,left .2s ease,right .2s ease,padding .2s ease,box-shadow .2s ease!important;
      }
      #ptbo-mobile-dispatch-close,
      #ptbo-mobile-dispatch-expand{
        appearance:none;
        -webkit-appearance:none;
        display:grid;
        place-items:center;
        color:#fff;
        border:1px solid rgba(255,255,255,.28);
        background:rgba(15,23,42,.92);
        box-shadow:0 4px 12px rgba(0,0,0,.32);
        font:900 18px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
        touch-action:manipulation;
        -webkit-tap-highlight-color:transparent;
        cursor:pointer;
      }
      #ptbo-mobile-dispatch-close{
        position:absolute;
        top:5px;
        right:116px;
        z-index:4;
        width:25px;
        height:25px;
        padding:0 0 2px;
        border-radius:50%;
      }
      #ptbo-mobile-dispatch-expand{
        display:none;
        width:100%;
        min-height:30px;
        margin-top:6px;
        padding:0;
        border-radius:9px;
      }
      #ptbo-mobile-dispatch-expand svg{
        width:18px;
        height:18px;
        fill:none;
        stroke:currentColor;
        stroke-width:2.4;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      #ptbo-mobile-dispatch-close:active,
      #ptbo-mobile-dispatch-expand:active{transform:scale(.94)}
      #dispatch-hud:not(.incident-active) #ptbo-mobile-dispatch-close{display:none!important}
      #dispatch-hud.incident-active:not(.ptbo-mobile-dispatch-collapsed) .hud-main{padding-right:28px!important}

      #dispatch-hud.ptbo-mobile-dispatch-collapsed{
        left:auto!important;
        right:10px!important;
        width:108px!important;
        max-width:108px!important;
        min-height:0!important;
        padding:9px!important;
        grid-template-columns:1fr!important;
        gap:0!important;
        border-left-width:3px!important;
        border-radius:14px!important;
        box-shadow:0 7px 22px rgba(0,0,0,.42)!important;
      }
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-main{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-timer-block{
        width:100%!important;
        min-width:0!important;
        margin:0!important;
        text-align:center!important;
      }
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-clock-display{
        margin:0!important;
        font-size:24px!important;
        line-height:1.05!important;
      }
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-timer-block > .hud-btn{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed #ptbo-mobile-dispatch-close{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed #ptbo-mobile-dispatch-expand{display:grid!important}

      @media(max-width:360px){
        #dispatch-hud.ptbo-mobile-dispatch-collapsed{
          right:7px!important;
          width:100px!important;
          max-width:100px!important;
          padding:8px!important;
        }
      }
    `;
    doc.head.appendChild(style);

    const closeButton = doc.createElement('button');
    closeButton.id = 'ptbo-mobile-dispatch-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Minimize dispatch details');
    closeButton.textContent = '×';
    hud.appendChild(closeButton);

    const expandButton = doc.createElement('button');
    expandButton.id = 'ptbo-mobile-dispatch-expand';
    expandButton.type = 'button';
    expandButton.setAttribute('aria-label', 'Show full dispatch details');
    expandButton.setAttribute('aria-expanded', 'false');
    expandButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
    timerBlock.appendChild(expandButton);

    hud.classList.add('ptbo-mobile-dispatch-ready');

    let collapseTimer = 0;
    let wasDispatchActive = false;

    function clearCollapseTimer() {
      if (!collapseTimer) return;
      clearTimeout(collapseTimer);
      collapseTimer = 0;
    }

    function setCollapsed(collapsed) {
      hud.classList.toggle('ptbo-mobile-dispatch-collapsed', collapsed);
      expandButton.setAttribute('aria-expanded', String(!collapsed));
    }

    function scheduleAutoCollapse() {
      clearCollapseTimer();
      collapseTimer = window.setTimeout(() => {
        collapseTimer = 0;
        /* Only minimize if the crew is still actively responding to this call. */
        if (hud.classList.contains('incident-active')) setCollapsed(true);
      }, AUTO_COLLAPSE_DELAY_MS);
    }

    /*
    The simulator marks a newly started dispatch by changing the HUD to the
    incident-active class. Watching that exact state transition is more reliable
    than watching changing text and starts one five-second timer per dispatch.
    */
    function synchronizeHudState() {
      const dispatchActive = hud.classList.contains('incident-active');

      if (dispatchActive && !wasDispatchActive) {
        setCollapsed(false);
        scheduleAutoCollapse();
      } else if (!dispatchActive && wasDispatchActive) {
        clearCollapseTimer();
        setCollapsed(false);
      }

      wasDispatchActive = dispatchActive;
    }

    closeButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      clearCollapseTimer();
      setCollapsed(true);
    });

    expandButton.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      clearCollapseTimer();
      setCollapsed(false);
    });

    const observer = new MutationObserver(synchronizeHudState);
    observer.observe(hud, { attributes:true, attributeFilter:['class'] });

    /* If installation finishes during an active call, begin the five-second timer. */
    synchronizeHudState();

    frame.addEventListener('load', () => observer.disconnect(), { once:true });
    return true;
  }

  function tryInstall() {
    if (installIntoSimulator()) {
      if (installRetryTimer) clearInterval(installRetryTimer);
      installRetryTimer = 0;
      return;
    }
    if (!installRetryTimer) installRetryTimer = window.setInterval(installIntoSimulator, 150);
  }

  frame.addEventListener('load', tryInstall);
  tryInstall();
})();
