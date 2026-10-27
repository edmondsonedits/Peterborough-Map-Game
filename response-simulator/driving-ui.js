/* Shared compact driving interface. Gameplay and input targets stay authoritative. */
(() => {
  'use strict';

  function createFocusState(enabled = true) {
    let compact = false, movingSince = null, attention, revealUntil = 0;
    return {
      update({now, speed, attention: next, urgent = false}) {
        if (attention !== undefined && next !== attention) { compact = false; revealUntil = now + 6000; movingSince = null; }
        attention = next;
        if (!enabled || urgent) { compact = false; movingSince = null; return compact; }
        if (Number.isFinite(speed) && Math.abs(speed) >= 5) {
          movingSince ??= now;
          if (now >= revealUntil && now - movingSince >= 600) compact = true;
        } else movingSince = null;
        return compact;
      },
      reveal(now) { compact = false; revealUntil = now + 8000; movingSince = null; },
      setEnabled(value) { enabled = Boolean(value); compact = false; movingSince = null; },
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {createFocusState};
  if (typeof window === 'undefined' || !window.document || window.PTBO_DRIVING_UI) return;

  const KEY = 'ptboAutoMinimizeUI';
  window.PTBO_LEGACY_MOBILE_HUD?.destroy();
  const root = document.documentElement;
  let host = window;
  try { if (window.parent?.document) host = window.parent; } catch (_) {}
  const hostDoc = host.document;
  let enabled = true;
  try { enabled = host.localStorage.getItem(KEY) !== 'false'; } catch (_) {}
  const focus = createFocusState(enabled);
  let compact = false, toolsOpen = false, keyboardActive = false;
  [document,hostDoc].forEach(doc=>{
    doc.addEventListener('pointerdown',()=>{keyboardActive=false;},{passive:true});
    doc.addEventListener('keydown',event=>{if(event.key==='Tab')keyboardActive=true;});
  });
  const icon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14"/></svg>';

  function addStyle(doc, id, text) {
    if (doc.getElementById(id)) return;
    const node = doc.createElement('style'); node.id = id; node.textContent = text; doc.head.appendChild(node);
  }
  addStyle(document, 'ptbo-driving-ui-style', `
    html.ptbo-driving-ui{--ptbo-ui-time:550ms;--ptbo-ui-ease:cubic-bezier(.22,.7,.18,1);--ptbo-ui-hud-top:68px;--ptbo-ui-hud-height:76px;--ptbo-ui-tools-top:calc(var(--ptbo-ui-hud-top) + var(--ptbo-ui-hud-height) + 8px)}
    html.ptbo-driving-ui.ptbo-ui-compact{--ptbo-ui-tools-top:67px}
    html.ptbo-driving-ui body #dispatch-hud{box-sizing:border-box;position:fixed;top:var(--ptbo-ui-hud-top)!important;left:15px!important;right:70px!important;transform:none!important;width:auto!important;max-width:600px!important;height:var(--ptbo-ui-hud-height)!important;min-height:52px;padding:8px 10px!important;display:grid!important;grid-template-columns:minmax(0,1fr) 110px!important;grid-template-rows:minmax(0,1fr)!important;gap:8px!important;border-radius:12px!important;overflow:hidden;transition:top var(--ptbo-ui-time) var(--ptbo-ui-ease),height var(--ptbo-ui-time) var(--ptbo-ui-ease),padding var(--ptbo-ui-time) var(--ptbo-ui-ease),border-color .3s,background .3s}
    html.ptbo-driving-ui #hud-content{min-width:0;max-height:100%;overflow-y:auto;scrollbar-width:thin;transition:opacity 220ms ease,transform var(--ptbo-ui-time) var(--ptbo-ui-ease),visibility 0s linear}
    html.ptbo-driving-ui .hud-title{font-size:10px!important;letter-spacing:.06em;line-height:1.3}
    html.ptbo-driving-ui .hud-address{font-size:15px!important;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    html.ptbo-driving-ui .hud-meta{font-size:12px!important;line-height:1.35!important}
    html.ptbo-driving-ui .hud-timer-block{min-width:0!important;margin:0!important;transition:opacity 220ms ease,transform var(--ptbo-ui-time) var(--ptbo-ui-ease),visibility 0s linear}
    html.ptbo-driving-ui .hud-clock-display{font-size:17px!important;line-height:1.3!important;margin-bottom:3px!important}
    html.ptbo-driving-ui .hud-btn{min-height:44px!important;padding:6px 8px!important;font-size:12px!important;border-radius:9px!important}
    html.ptbo-driving-ui[data-ui-idle="true"] #hud-clock{display:none}
    #ptbo-driving-summary{position:absolute;inset:0;display:flex;align-items:center;gap:8px;width:100%;padding:0 10px;color:#f8fafc;background:transparent;border:0;text-align:left;font:750 14px/1.2 system-ui;opacity:0;visibility:hidden;pointer-events:none;transition:opacity 250ms ease 120ms}
    #ptbo-driving-summary span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
    #ptbo-driving-summary small{flex:none;color:#cbd5e1;font:650 11px/1 system-ui}
    html.ptbo-driving-ui.ptbo-ui-compact body #dispatch-hud{top:calc(10px + env(safe-area-inset-top))!important;height:44px!important;min-height:44px;padding:0!important}
    html.ptbo-ui-compact #hud-content,html.ptbo-ui-compact .hud-timer-block{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-8px);transition-delay:0s,0s,var(--ptbo-ui-time)}
    html.ptbo-ui-compact #ptbo-driving-summary{opacity:1;visibility:visible;pointer-events:auto}
    html.ptbo-driving-ui #ptbo-speedometer,html.ptbo-driving-ui #ptbo-current-street-hud{display:none!important}
    #ptbo-driving-instruments{position:fixed;z-index:1460;top:var(--ptbo-ui-tools-top);left:15px;right:160px;max-width:450px;height:32px;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:0 10px;border:1px solid #ffffff30;border-radius:9px;background:#081018e8;color:#f8fafc;font:750 12px/1.2 system-ui;pointer-events:none;transition:top var(--ptbo-ui-time) var(--ptbo-ui-ease),right var(--ptbo-ui-time) var(--ptbo-ui-ease),background var(--ptbo-ui-time) ease}
    #ptbo-driving-street{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0;flex:1}
    #ptbo-driving-speed{flex:none;font-variant-numeric:tabular-nums;font-size:11px;color:#e2e8f0}
    html.ptbo-driving-ui.ptbo-ui-compact #ptbo-driving-instruments{right:68px}
    html.ptbo-driving-ui body #ptbo-map-toggle{box-sizing:border-box;position:fixed;top:var(--ptbo-ui-tools-top)!important;left:auto!important;right:15px!important;bottom:auto!important;width:132px!important;min-width:44px;max-width:none!important;height:44px;min-height:44px!important;padding:0 11px!important;gap:8px;overflow:hidden;white-space:nowrap;transition:top var(--ptbo-ui-time) var(--ptbo-ui-ease),width var(--ptbo-ui-time) var(--ptbo-ui-ease),padding var(--ptbo-ui-time) ease}
    html.ptbo-driving-ui #ptbo-map-toggle [data-map-label]{max-width:90px;opacity:1;transition:max-width var(--ptbo-ui-time) ease,opacity 200ms ease}
    html.ptbo-driving-ui.ptbo-ui-compact body #ptbo-map-toggle{width:44px!important;padding:0 11px!important;gap:0}
    html.ptbo-ui-compact #ptbo-map-toggle [data-map-label]{max-width:0;opacity:0}
    html.ptbo-ui-compact:not(.ptbo-ui-tools-open) #game-home,html.ptbo-ui-compact:not(.ptbo-ui-tools-open) #menu-toggle{opacity:0;visibility:hidden;pointer-events:none}
    html.ptbo-driving-ui #game-home,html.ptbo-driving-ui #menu-toggle{transition:opacity 220ms ease,transform var(--ptbo-ui-time) ease}
    html.ptbo-ui-compact.ptbo-ui-tools-open #menu-toggle{top:62px;right:15px}
    html.ptbo-ui-compact.ptbo-ui-tools-open #game-home{top:62px;left:195px}
    html.ptbo-ui-tools-open #ptbo-driving-instruments,html.ptbo-ui-tools-open #ptbo-map-toggle{opacity:0;visibility:hidden;pointer-events:none}
    .ptbo-ui-preference{display:flex;align-items:center;gap:10px;margin:16px 0;font:650 13px/1.4 system-ui}
    .ptbo-ui-preference input{width:20px;height:20px;flex:none}
    .ptbo-ui-version{font:600 11px/1.4 system-ui;color:#64748b;margin:12px 0}
    @media(max-width:900px),(pointer:coarse){
      html.ptbo-driving-ui{--ptbo-ui-hud-top:calc(62px + env(safe-area-inset-top))}
      html.ptbo-driving-ui.ptbo-ui-compact{--ptbo-ui-tools-top:calc(62px + env(safe-area-inset-top))}
      html.ptbo-driving-ui body #dispatch-hud{left:8px!important;right:8px!important;max-width:none!important}
      html.ptbo-driving-ui.ptbo-ui-compact body #dispatch-hud{right:62px!important}
      html.ptbo-driving-ui #ptbo-driving-instruments{left:8px;right:150px}
      html.ptbo-driving-ui.ptbo-ui-compact #ptbo-driving-instruments{right:62px}
      html.ptbo-driving-ui body #ptbo-map-toggle{right:8px!important}
    }
    @media(orientation:landscape) and (max-height:520px){
      html.ptbo-driving-ui body #dispatch-hud{right:70px!important;max-width:440px!important}
      html.ptbo-driving-ui #ptbo-driving-instruments{max-width:330px}
    }
    @media(prefers-reduced-motion:reduce){html.ptbo-driving-ui{--ptbo-ui-time:0ms}html.ptbo-driving-ui *,html.ptbo-driving-ui *::before{transition:none!important}}
  `);
  addStyle(hostDoc, 'ptbo-driving-host-style', `
    html.ptbo-driving-ui{--ptbo-ui-time:550ms;--ptbo-ui-ease:cubic-bezier(.22,.7,.18,1)}
    html.ptbo-driving-ui .station-shortcuts{top:15px;left:140px}
    html.ptbo-driving-ui .desktop-action#audio-button{right:175px}
    html.ptbo-driving-ui .desktop-action#siren-button{right:225px}
    html.ptbo-driving-ui #ptbo-build-badge{display:none!important}
    html.ptbo-driving-ui .mobile-topbar,html.ptbo-driving-ui .station-shortcuts,html.ptbo-driving-ui #audio-button{transition:opacity 220ms ease,transform var(--ptbo-ui-time) var(--ptbo-ui-ease),background var(--ptbo-ui-time) ease,visibility 0s linear}
    html.ptbo-ui-compact:not(.ptbo-ui-tools-open) .mobile-topbar,html.ptbo-ui-compact:not(.ptbo-ui-tools-open) .station-shortcuts,html.ptbo-ui-compact:not(.ptbo-ui-tools-open) #audio-button{opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-12px);transition-delay:0s,0s,0s,var(--ptbo-ui-time)}
    html.ptbo-ui-compact .mobile-topbar{top:calc(62px + env(safe-area-inset-top))!important;padding:6px;border-radius:12px;background:#081018}
    html.ptbo-ui-compact.ptbo-ui-tools-open .station-shortcuts{top:62px}
    html.ptbo-ui-compact.ptbo-ui-tools-open #audio-button{top:62px;right:175px}
    html.ptbo-driving-ui .mobile-controls{background:none!important;isolation:isolate}
    html.ptbo-driving-ui .mobile-controls::before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,rgba(5,10,20,.65),transparent);opacity:.8;pointer-events:none;transition:opacity var(--ptbo-ui-time) ease}
    html.ptbo-ui-compact .mobile-controls::before{opacity:.22}
    html.ptbo-driving-ui .joystick{background:rgba(8,13,24,.65);transition:background var(--ptbo-ui-time) ease,box-shadow var(--ptbo-ui-time) ease,border-color var(--ptbo-ui-time) ease}
    html.ptbo-ui-compact .joystick{background:rgba(8,13,24,.2);box-shadow:inset 0 0 0 1px #ffffff10;border-color:#ffffff40}
    #ptbo-driving-menu{position:fixed;top:calc(10px + env(safe-area-inset-top));right:8px;z-index:5001;display:grid;place-items:center;width:44px;height:44px;padding:0;border:1px solid #ffffff40;border-radius:12px;background:#111827;color:#f8fafc;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(-8px);transition:opacity 220ms ease 120ms,transform var(--ptbo-ui-time) var(--ptbo-ui-ease);cursor:pointer;touch-action:manipulation}
    html.ptbo-ui-compact #ptbo-driving-menu{opacity:1;visibility:visible;pointer-events:auto;transform:none}
    html.ptbo-response-tablet-open #ptbo-driving-menu,html.ptbo-tutorial-open #ptbo-driving-menu{display:none}
    html.ptbo-driving-ui.ptbo-response-tablet-open .mobile-topbar{opacity:0!important;visibility:hidden!important;pointer-events:none!important;transition:none}
    #ptbo-driving-menu:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px}
    @media(prefers-reduced-motion:reduce){html.ptbo-driving-ui{--ptbo-ui-time:0ms}html.ptbo-driving-ui *,html.ptbo-driving-ui *::before{transition:none!important}}
  `);

  const hud = document.getElementById('dispatch-hud');
  if (!hud) return;
  hud.classList.remove('ptbo-tablet-dispatch-collapsed');
  document.getElementById('ptbo-tablet-dispatch-expand')?.remove();
  const summary = document.createElement('button');
  summary.type = 'button'; summary.id = 'ptbo-driving-summary';
  summary.setAttribute('aria-label','Show dispatch details');
  summary.innerHTML = '<span></span><small>⌄</small>';
  hud.appendChild(summary);
  const instruments = document.createElement('div'); instruments.id = 'ptbo-driving-instruments';
  instruments.innerHTML = '<span id="ptbo-driving-street"></span><span id="ptbo-driving-speed"></span>';
  document.body.appendChild(instruments);
  let menu = hostDoc.getElementById('ptbo-driving-menu');
  if (!menu) { menu=hostDoc.createElement('button'); menu.id='ptbo-driving-menu';menu.type='button';menu.innerHTML=icon;hostDoc.body.appendChild(menu); }
  menu.setAttribute('aria-label','Show station, sound and settings');menu.setAttribute('aria-expanded','false');

  function setTools(value) {
    toolsOpen = value;
    [root,hostDoc.documentElement].forEach(el=>el.classList.toggle('ptbo-ui-tools-open',value));
    menu.setAttribute('aria-expanded',String(value));
    menu.setAttribute('aria-label',value?'Hide simulator tools':'Show station, sound and settings');
  }
  menu.onclick=()=>setTools(!toolsOpen);
  summary.addEventListener('click',()=>{
    focus.reveal(performance.now());refresh();
    const action=document.getElementById('hud-action-btn'),content=document.getElementById('hud-content');
    content.tabIndex=-1;(action&&!action.disabled?action:content).focus({preventScroll:true});
  });
  document.addEventListener('pointerdown',event=>{if(toolsOpen && !event.target.closest('#game-home,#menu-toggle,#control-panel'))setTools(false);},{passive:true});

  const preference=document.createElement('label');preference.className='ptbo-ui-preference';
  const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=enabled;
  preference.append(checkbox,document.createTextNode('Auto-minimize UI while driving'));
  checkbox.addEventListener('change',()=>{enabled=checkbox.checked;focus.setEnabled(enabled);try{host.localStorage.setItem(KEY,String(enabled));}catch(_){}refresh();});
  const panel=document.querySelector('.panel-scroll');
  if(panel){panel.appendChild(preference);const version=document.createElement('div');version.className='ptbo-ui-version';version.textContent=`Version ${window.PTBO_BUILD?.version||host.PTBO_BUILD?.version||''}`;panel.appendChild(version);}

  function snapshot() {
    let currentMission=null,incident=null,phase='idle';
    try { if(typeof mission!=='undefined')currentMission=mission;if(typeof activeIncident!=='undefined')incident=activeIncident; } catch(_){}
    phase=currentMission?.phase||phase;
    const service=window.PTBO_SERVICE;
    const base=service?.getBase?.();
    const speed=Number(window.PTBO_VEHICLE_INSTRUMENTS?.state?.speedKmh)||0;
    let motionSpeed=speed;
    try { if(typeof velocity==='number')motionSpeed=Math.abs(velocity)*111195*60*3.6; } catch(_){}
    const panelOpen=document.getElementById('control-panel')?.classList.contains('minimized')===false;
    const active=hostDoc.activeElement;
    const interacting=keyboardActive && !compact && Boolean(active?.closest?.('.mobile-topbar,.station-shortcuts') || document.activeElement?.closest?.('#dispatch-hud'));
    return {speed,motionSpeed,attention:`${service?.state.mode}:${base?.number}:${currentMission?.generation||0}:${phase}`,
      urgent:!service?.state.selected||['pickup','handover','on-scene','complete'].includes(phase)||panelOpen||interacting||Boolean(window.PTBO_QUICK_TUTORIAL?.state?.open),
      idle:!currentMission||phase==='complete',
      destination:['response','transport'].includes(phase)?String(incident?.addr||incident?.name||'Responding'):String(base?.name||'Available')};
  }
  const text=(el,value)=>{if(el.textContent!==value)el.textContent=value;};
  function refresh() {
    const data=snapshot();
    const next=focus.update({now:performance.now(),...data,speed:data.motionSpeed});
    // Keep keyboard focus visible if a player is using controls as the UI compacts.
    if(next!==compact){
      if(next && document.activeElement?.closest?.('#dispatch-hud'))document.activeElement.blur();
      compact=next;if(!compact)setTools(false);
      [root,hostDoc.documentElement].forEach(el=>el.classList.toggle('ptbo-ui-compact',compact));
      document.getElementById('hud-content').inert=compact;
      document.querySelector('.hud-timer-block').inert=compact;
      summary.tabIndex=compact?0:-1;
    }
    root.dataset.uiIdle=String(data.idle);
    text(summary.querySelector('span'),data.destination);
    summary.title=data.destination;
    summary.setAttribute('aria-label',`Show dispatch details: ${data.destination}`);
    text(summary.querySelector('small'),`${data.idle?'':`${document.getElementById('hud-clock')?.textContent||'0.0'}s `}⌄`);
    text(instruments.querySelector('#ptbo-driving-speed'),`${Math.round(data.speed)} km/h`);
    const street=window.PTBO_CURRENT_STREET_HUD?.streetName?.()||document.getElementById('ptbo-current-street-name')?.textContent||'Street unavailable';
    text(instruments.querySelector('#ptbo-driving-street'),street);
    instruments.title=`${street} · ${Math.round(data.speed)} km/h`;
    const content=document.getElementById('hud-content'),actions=document.querySelector('.hud-timer-block');
    // Measure natural content, not the currently animated panel, so transitions do not chase themselves.
    let height=Math.max(52,Math.max(content.scrollHeight,actions.scrollHeight)+16);
    const controls=hostDoc.querySelector('.mobile-controls');
    if(host.innerHeight<=520 && controls && host.getComputedStyle(controls).display!=='none') {
      // Leave a clear row for the map tools above the fixed driving touch targets.
      height=Math.min(height,Math.max(52,controls.getBoundingClientRect().top-62-44-16));
    }
    root.style.setProperty('--ptbo-ui-hud-height',`${height}px`);
    ['ptbo-map-toggle','ptbo-speedometer','ptbo-current-street-hud'].forEach(id=>{
      const el=document.getElementById(id);if(!el)return;
      ['top','left','right','bottom','width','max-width','transform'].forEach(name=>{if(el.style.getPropertyValue(name))el.style.removeProperty(name);});
    });
  }
  window.PTBO_DRIVING_UI=Object.freeze({managesLayout:true,refresh,setEnabled(value){checkbox.checked=Boolean(value);checkbox.dispatchEvent(new Event('change'));}});
  [root,hostDoc.documentElement].forEach(el=>{el.classList.add('ptbo-driving-ui');el.classList.remove('ptbo-ui-compact','ptbo-ui-tools-open');});
  refresh();
  const timer=setInterval(refresh,160);
  addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
