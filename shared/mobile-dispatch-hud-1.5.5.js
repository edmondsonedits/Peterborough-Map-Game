/* Mobile dispatch HUD + compact phone layout — v1.6.6 */
(() => {
  'use strict';

  const VERSION = '1.6.6';
  const AUTO_COLLAPSE_DELAY_MS = 10000;
  const frame = document.getElementById('simulator');
  if (!frame || window.PTBO_MOBILE_DISPATCH_HUD_VERSION === VERSION) return;
  window.PTBO_MOBILE_DISPATCH_HUD_VERSION = VERSION;

  function installOuterPolish() {
    if (document.getElementById('ptbo-mobile-ui-polish-166')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-mobile-ui-polish-166';
    style.textContent = `
      @media (max-width:900px),(pointer:coarse){
        .mobile-topbar{top:calc(8px + env(safe-area-inset-top))!important;left:8px!important;right:8px!important;grid-template-columns:42px minmax(0,1fr) 92px!important;gap:6px!important}
        .top-actions{gap:5px!important}.top-button{width:42px!important;height:42px!important;border-radius:13px!important}
        .station-shortcuts{width:100%!important;max-width:238px!important;gap:5px!important;overflow:hidden!important}
        .station-button{height:38px!important;padding:0 5px!important;border-radius:10px!important;font-size:9px!important;letter-spacing:-.01em!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .mobile-controls{min-height:158px!important;padding-top:8px!important;grid-template-columns:120px 46px 136px!important;gap:7px!important}
        .joystick{width:120px!important;height:120px!important}.joystick-thumb{width:56px!important;height:56px!important}
        .utility-zone{gap:8px!important;padding-bottom:4px!important}.utility-button{width:46px!important;height:46px!important}
        .pedal-zone{gap:6px!important}.pedal{width:65px!important;border-radius:19px!important}.pedal.reverse{height:82px!important}.gear-stack .pedal.gear-up{height:62px!important}.gear-stack .pedal.shift-down{height:46px!important}
        .control-hint{display:none!important}
      }
      @media (max-width:380px){
        .mobile-topbar{grid-template-columns:40px minmax(0,1fr) 84px!important;gap:4px!important}.top-button{width:40px!important;height:40px!important}.top-actions{gap:4px!important}
        .station-shortcuts{gap:3px!important}.station-button{height:36px!important;font-size:8px!important;padding:0 3px!important}
        .mobile-controls{grid-template-columns:112px 42px 126px!important;gap:5px!important}.joystick{width:112px!important;height:112px!important}.utility-button{width:42px!important;height:42px!important}.pedal{width:60px!important}
      }
    `;
    document.head.appendChild(style);
  }

  let installRetryTimer = 0;

  function installIntoSimulator() {
    const doc = frame.contentDocument;
    if (!doc?.head || !doc.body) return false;
    const hud = doc.getElementById('dispatch-hud');
    const timerBlock = doc.querySelector('.hud-timer-block');
    if (!hud || !timerBlock) return false;
    if (doc.documentElement.dataset.ptboMobileDispatchHud === VERSION) return true;
    doc.documentElement.dataset.ptboMobileDispatchHud = VERSION;

    doc.getElementById('ptbo-mobile-dispatch-hud-style')?.remove();
    doc.getElementById('ptbo-mobile-dispatch-close')?.remove();
    doc.getElementById('ptbo-mobile-dispatch-expand')?.remove();
    hud.classList.remove('ptbo-mobile-dispatch-collapsed');

    const style = doc.createElement('style');
    style.id = 'ptbo-mobile-dispatch-hud-style';
    style.textContent = `
      #dispatch-hud.ptbo-mobile-dispatch-ready{overflow:visible!important;transition:width .18s ease,max-width .18s ease,left .18s ease,right .18s ease,padding .18s ease,opacity .18s ease!important}
      #dispatch-hud.incident-active:not(.ptbo-mobile-dispatch-collapsed){top:calc(60px + env(safe-area-inset-top))!important;left:8px!important;right:8px!important;width:auto!important;max-width:none!important;min-height:0!important;padding:10px 10px 10px 13px!important;grid-template-columns:minmax(0,1fr) 94px!important;gap:8px!important;border-radius:15px!important}
      #dispatch-hud.incident-active:not(.ptbo-mobile-dispatch-collapsed) .hud-main{padding-right:24px!important}
      #dispatch-hud .hud-title{font-size:9px!important;line-height:1.15!important;letter-spacing:.12em!important}
      #dispatch-hud .hud-address{margin:5px 0 4px!important;font-size:16px!important;line-height:1.1!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      #dispatch-hud .hud-meta{font-size:10px!important;line-height:1.25!important}
      #dispatch-hud .hud-timer-block{min-width:0!important;margin:0!important}
      #dispatch-hud .hud-clock-display{font-size:24px!important;line-height:1!important}
      #dispatch-hud #hud-action-btn:disabled{display:none!important}
      #dispatch-hud .hud-btn{min-height:34px!important;padding:6px 7px!important;border-radius:10px!important;font-size:10px!important}
      #ptbo-map-toggle{min-height:36px!important;padding:7px 9px!important;font-size:10px!important;border-radius:10px!important}
      #ptbo-map-toggle svg{width:18px!important;height:18px!important}
      #ptbo-speedometer{transform:scale(.9)!important;transform-origin:top left!important}

      #ptbo-mobile-dispatch-close,#ptbo-mobile-dispatch-expand{appearance:none;-webkit-appearance:none;display:grid;place-items:center;color:#fff;border:1px solid rgba(255,255,255,.24);background:rgba(15,23,42,.94);box-shadow:0 4px 12px rgba(0,0,0,.3);font:900 18px/1 system-ui,-apple-system,"Segoe UI",sans-serif;touch-action:manipulation;-webkit-tap-highlight-color:transparent;cursor:pointer}
      #ptbo-mobile-dispatch-close{position:absolute;top:7px;right:7px;z-index:5;width:26px;height:26px;padding:0 0 2px;border-radius:50%}
      #ptbo-mobile-dispatch-expand{display:none;width:100%;min-height:28px;margin-top:5px;padding:0;border-radius:8px}
      #ptbo-mobile-dispatch-expand svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
      #ptbo-mobile-dispatch-close:active,#ptbo-mobile-dispatch-expand:active{transform:scale(.94)}
      #dispatch-hud:not(.incident-active) #ptbo-mobile-dispatch-close{display:none!important}

      #dispatch-hud.ptbo-mobile-dispatch-collapsed{top:calc(60px + env(safe-area-inset-top))!important;left:auto!important;right:8px!important;width:108px!important;max-width:108px!important;min-height:0!important;padding:8px!important;grid-template-columns:1fr!important;gap:0!important;border-left-width:3px!important;border-radius:13px!important;box-shadow:0 7px 22px rgba(0,0,0,.42)!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-main{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-timer-block{width:100%!important;min-width:0!important;margin:0!important;text-align:center!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-clock-display{margin:0!important;font-size:23px!important;line-height:1!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed .hud-timer-block>.hud-btn{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed #ptbo-mobile-dispatch-close{display:none!important}
      #dispatch-hud.ptbo-mobile-dispatch-collapsed #ptbo-mobile-dispatch-expand{display:grid!important}
    `;
    doc.head.appendChild(style);

    const closeButton = doc.createElement('button');
    closeButton.id = 'ptbo-mobile-dispatch-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label','Minimize dispatch details');
    closeButton.textContent = '×';
    hud.appendChild(closeButton);

    const expandButton = doc.createElement('button');
    expandButton.id = 'ptbo-mobile-dispatch-expand';
    expandButton.type = 'button';
    expandButton.setAttribute('aria-label','Show full dispatch details');
    expandButton.setAttribute('aria-expanded','false');
    expandButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
    timerBlock.appendChild(expandButton);
    hud.classList.add('ptbo-mobile-dispatch-ready');

    let wasDispatchActive = false;
    let collapseDeadline = 0;
    let manuallyExpanded = false;

    const responseSeconds = () => {
      const value = Number.parseFloat(doc.querySelector('.hud-clock-display')?.textContent || '0');
      return Number.isFinite(value) ? value : 0;
    };

    function setCollapsed(collapsed) {
      hud.classList.toggle('ptbo-mobile-dispatch-collapsed',collapsed);
      expandButton.setAttribute('aria-expanded',String(!collapsed));
    }

    function compactDispatchCopy() {
      const title = hud.querySelector('.hud-title');
      if (!title) return;
      const text = title.textContent || '';
      const match = text.match(/^🚨\s*ACTIVE ENROUTE DISPATCH:\s*(.+)$/i);
      if (match) title.textContent = `🚨 EN ROUTE · ${match[1]}`;
    }

    function beginCollapseCountdown() {
      manuallyExpanded = false;
      setCollapsed(false);
      const elapsed = responseSeconds() * 1000;
      collapseDeadline = performance.now() + Math.max(0,AUTO_COLLAPSE_DELAY_MS - elapsed);
    }

    function synchronizeHudState() {
      compactDispatchCopy();
      const active = hud.classList.contains('incident-active');
      if (active && !wasDispatchActive) beginCollapseCountdown();
      if (!active && wasDispatchActive) {
        collapseDeadline = 0;
        manuallyExpanded = false;
        setCollapsed(false);
      }
      wasDispatchActive = active;
    }

    function enforceAutoCollapse() {
      synchronizeHudState();
      if (!hud.classList.contains('incident-active') || manuallyExpanded || hud.classList.contains('ptbo-mobile-dispatch-collapsed')) return;
      if (!collapseDeadline) {
        const elapsed = responseSeconds() * 1000;
        collapseDeadline = performance.now() + Math.max(0,AUTO_COLLAPSE_DELAY_MS - elapsed);
      }
      if (performance.now() >= collapseDeadline || responseSeconds() >= AUTO_COLLAPSE_DELAY_MS / 1000) setCollapsed(true);
    }

    closeButton.addEventListener('click',event => {event.preventDefault();event.stopPropagation();manuallyExpanded=false;collapseDeadline=0;setCollapsed(true);});
    expandButton.addEventListener('click',event => {event.preventDefault();event.stopPropagation();manuallyExpanded=true;collapseDeadline=0;setCollapsed(false);});

    const observer = new MutationObserver(synchronizeHudState);
    observer.observe(hud,{attributes:true,attributeFilter:['class'],childList:true,subtree:true});
    const watchdog = window.setInterval(enforceAutoCollapse,250);
    synchronizeHudState();
    enforceAutoCollapse();

    frame.addEventListener('load',() => {observer.disconnect();clearInterval(watchdog);},{once:true});
    return true;
  }

  function tryInstall() {
    installOuterPolish();
    if (installIntoSimulator()) {
      if (installRetryTimer) clearInterval(installRetryTimer);
      installRetryTimer = 0;
      return;
    }
    if (!installRetryTimer) installRetryTimer = window.setInterval(installIntoSimulator,150);
  }

  installOuterPolish();
  frame.addEventListener('load',tryInstall);
  tryInstall();
})();
