(() => {
  'use strict';

  const VERSION = '1.6.69';
  if (window.PTBO_ROUTE_REVIEW_UI_VERSION === VERSION) return;
  window.PTBO_ROUTE_REVIEW_UI_VERSION = VERSION;

  const COLORS = Object.freeze({
    player:'#2563eb', suggested:'#22c55e', hospitalPlayer:'#f97316', hospitalSuggested:'#a855f7'
  });
  const STYLES = Object.freeze({
    player:{weight:7,opacity:.94,casingWeight:11,casingOpacity:.78},
    suggested:{weight:11,opacity:.72,casingWeight:15,casingOpacity:.66}
  });
  const isMobileHost = (() => {
    try { return window.parent !== window && Boolean(window.parent.document.querySelector('.mobile-controls')); }
    catch (_) { return false; }
  })();

  function formatDistance(value) {
    const meters = Number(value);
    if (!Number.isFinite(meters)) return 'N/A';
    const absolute = Math.abs(meters);
    return absolute < 1000 ? `${Math.round(absolute)} m` : `${(absolute / 1000).toFixed(absolute < 10000 ? 1 : 0)} km`;
  }
  function formatTime(milliseconds) {
    const total = Math.max(0, Number(milliseconds) || 0) / 1000;
    const minutes = Math.floor(total / 60), seconds = total - minutes * 60;
    return minutes ? `${minutes}:${seconds.toFixed(1).padStart(4,'0')}` : `${seconds.toFixed(1)} s`;
  }
  function assessment(leg) {
    const ideal = Number(leg?.suggestedRoute?.distance), driven = Number(leg?.playerDistance);
    if (!(ideal > 0) || !(driven > 0)) return {label:'Comparison unavailable',tone:'',efficiency:'N/A',detail:''};
    const delta = driven - ideal, percent = delta / ideal * 100, efficiency = Math.min(100, ideal / driven * 100);
    if (Math.abs(delta) <= 75 || Math.abs(percent) <= 2.5) return {label:'Near-optimal route',tone:'good',efficiency:`${Math.round(efficiency)}%`,detail:'Very close to the recommended distance.'};
    return {
      label: delta > 0 ? `${formatDistance(delta)} longer` : `${formatDistance(delta)} shorter`,
      tone: delta > 0 && percent > 18 ? 'warn' : delta < 0 ? 'good' : '',
      efficiency:`${Math.round(efficiency)}%`,
      detail: delta > 0 ? `${Math.round(percent)}% over the recommended distance.` : `${Math.abs(Math.round(percent))}% under the recommended distance.`
    };
  }

  function installStyles() {
    let style = document.getElementById('ptbo-route-review-polish');
    if (!style) { style = document.createElement('style'); style.id = 'ptbo-route-review-polish'; document.head.appendChild(style); }
    style.textContent = `
      #ptbo-route-legend{width:min(336px,calc(100vw - 32px))!important;padding:14px!important;border:1px solid rgba(148,163,184,.34)!important;border-radius:16px!important;background:linear-gradient(165deg,rgba(8,18,34,.98),rgba(15,23,42,.96))!important;box-shadow:0 14px 42px rgba(2,6,23,.48),inset 0 1px rgba(255,255,255,.05)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important}
      #ptbo-route-legend .ptbo-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      #ptbo-route-legend .ptbo-review-title{color:#f8fafc;font-size:12px;font-weight:950;letter-spacing:.105em;text-transform:uppercase}
      #ptbo-route-legend .ptbo-review-copy{margin-top:4px;color:#aebdd0;font-size:9.5px;line-height:1.4}
      #ptbo-route-legend .ptbo-review-leg{margin-top:10px;padding:10px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(255,255,255,.035)}
      #ptbo-route-legend .ptbo-review-leg-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #ptbo-route-legend .ptbo-review-leg-title{color:#e2e8f0;font-size:9px;font-weight:900;letter-spacing:.075em;text-transform:uppercase}
      #ptbo-route-legend .ptbo-review-time{color:#94a3b8;font:800 9px/1 ui-monospace,SFMono-Regular,Consolas,monospace}
      #ptbo-route-legend .ptbo-review-routes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:8px}
      #ptbo-route-legend .ptbo-review-route{min-width:0;padding:8px;color:#f8fafc;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(15,23,42,.72);cursor:pointer;text-align:left;transition:opacity .15s,transform .15s,border-color .15s,background .15s}
      #ptbo-route-legend .ptbo-review-route:hover{border-color:rgba(255,255,255,.28);background:rgba(30,41,59,.86)}
      #ptbo-route-legend .ptbo-review-route:active{transform:scale(.985)}
      #ptbo-route-legend .ptbo-review-route[aria-pressed='false']{opacity:.42}
      #ptbo-route-legend .ptbo-review-route:disabled{cursor:default;opacity:.35}
      #ptbo-route-legend .ptbo-review-route-top{display:flex;align-items:center;gap:7px}
      #ptbo-route-legend .ptbo-review-swatch{flex:0 0 auto;width:26px;height:6px;border:2px solid rgba(248,250,252,.92);border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.46)}
      #ptbo-route-legend .ptbo-review-name{min-width:0;overflow:hidden;color:#cbd5e1;font-size:9px;font-weight:850;text-overflow:ellipsis;white-space:nowrap}
      #ptbo-route-legend .ptbo-review-distance{display:block;margin-top:5px;color:#fff;font-size:14px;font-weight:950;line-height:1}
      #ptbo-route-legend .ptbo-review-action{display:block;margin-top:5px;color:#7dd3fc;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
      #ptbo-route-legend .ptbo-review-summary{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:6px;margin-top:8px}
      #ptbo-route-legend .ptbo-review-pill{min-width:0;padding:7px 8px;color:#cbd5e1;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:rgba(2,6,23,.36);font-size:8.5px;font-weight:800;line-height:1.25}
      #ptbo-route-legend .ptbo-review-pill strong{display:block;margin-top:2px;color:#f8fafc;font-size:10px;font-weight:950}
      #ptbo-route-legend .ptbo-review-pill.good strong{color:#86efac}#ptbo-route-legend .ptbo-review-pill.warn strong{color:#fdba74}
      #ptbo-route-legend .ptbo-review-detail{margin-top:6px;color:#94a3b8;font-size:8.5px;line-height:1.35}
      #ptbo-route-legend .ptbo-review-status{margin-top:7px;color:#fbbf24;font-size:8.5px;line-height:1.35}
      #ptbo-route-legend .ptbo-review-tip{margin-top:10px;padding-top:9px;color:#94a3b8;border-top:1px solid rgba(148,163,184,.14);font-size:8.5px;line-height:1.4}
      #ptbo-route-legend .ptbo-review-done{width:100%;margin-top:10px;padding:9px;color:#fff;border:1px solid rgba(148,163,184,.3);border-radius:10px;background:#334155;font:inherit;font-size:9px;font-weight:900;cursor:pointer}
      #ptbo-route-legend .ptbo-review-done:hover{background:#475569}
      .ptbo-route-marker-label{padding:3px 6px!important;color:#f8fafc!important;border:1px solid rgba(255,255,255,.28)!important;border-radius:6px!important;background:rgba(15,23,42,.9)!important;box-shadow:0 4px 12px rgba(0,0,0,.3)!important;font-size:8px!important;font-weight:850!important}.ptbo-route-marker-label:before{display:none!important}
      #ptbo-version-badge{font-size:0!important}#ptbo-version-badge::after{content:'v${VERSION}';font-size:8px;font-weight:700;letter-spacing:.08em}
      @media(max-width:900px),(pointer:coarse){
        html.ptbo-mobile-route-review #dispatch-hud,html.ptbo-mobile-route-review #game-home,html.ptbo-mobile-route-review #menu-toggle,html.ptbo-mobile-route-review #map-orientation-controls,html.ptbo-mobile-route-review #ptbo-speedometer,html.ptbo-mobile-route-review .leaflet-control-zoom,html.ptbo-mobile-route-review .leaflet-control-scale{opacity:0!important;visibility:hidden!important;pointer-events:none!important}
        html.ptbo-mobile-route-review #ptbo-route-legend{position:fixed!important;top:max(8px,env(safe-area-inset-top))!important;left:8px!important;right:8px!important;width:auto!important;max-width:520px!important;max-height:calc(100dvh - 18px - env(safe-area-inset-top))!important;margin:0 auto!important;padding:11px!important;overflow:auto!important;border-radius:14px!important}
        #ptbo-route-legend .ptbo-review-leg{padding:8px;margin-top:8px}#ptbo-route-legend .ptbo-review-route{padding:7px}#ptbo-route-legend .ptbo-review-distance{font-size:12px}#ptbo-route-legend .ptbo-review-tip{display:none}
      }
      @media(max-width:360px){html.ptbo-mobile-route-review #ptbo-route-legend{left:5px!important;right:5px!important;padding:8px!important}#ptbo-route-legend .ptbo-review-routes{gap:5px}#ptbo-route-legend .ptbo-review-name{font-size:8px}#ptbo-route-legend .ptbo-review-summary{grid-template-columns:1fr 82px}}
    `;
    if (!isMobileHost) return;
    try {
      const parentDoc = window.parent.document;
      let parentStyle = parentDoc.getElementById('ptbo-parent-review-style');
      if (!parentStyle) { parentStyle = parentDoc.createElement('style'); parentStyle.id = 'ptbo-parent-review-style'; parentDoc.head.appendChild(parentStyle); }
      parentStyle.textContent = `html.ptbo-mobile-route-review-active .mobile-topbar,html.ptbo-mobile-route-review-active .mobile-controls,html.ptbo-mobile-route-review-active .control-hint{opacity:0!important;visibility:hidden!important;pointer-events:none!important}`;
    } catch (_) {}
  }

  function setLayerVisible(line, visible) {
    if (!line?.setStyle) return;
    line.setStyle({opacity:visible ? (line._ptboVisibleOpacity ?? .8) : 0});
    line._ptboCasing?.setStyle?.({opacity:visible ? (line._ptboCasingVisibleOpacity ?? .7) : 0});
    line._ptboShadowCasing?.setStyle?.({opacity:visible ? (line._ptboShadowVisibleOpacity ?? .28) : 0});
  }

  function ensureCasing(entry) {
    const line = entry?.line;
    if (!line?.setStyle || !line.getLatLngs || !window.L || !window.mapInstance) return;
    const kind = entry.suggested ? 'suggested' : 'player', spec = STYLES[kind];
    line.setStyle({color:entry.color,weight:spec.weight,opacity:spec.opacity,lineCap:'round',lineJoin:'round'});
    line._ptboVisibleOpacity = spec.opacity;
    if (!line._ptboShadowCasing) {
      line._ptboShadowCasing = L.polyline(line.getLatLngs(),{color:'#0f172a',weight:spec.casingWeight+3,opacity:.3,lineCap:'round',lineJoin:'round',interactive:false}).addTo(mapInstance);
      line._ptboShadowVisibleOpacity = .3;
      window.PTBO_ROUTE_COMPARE?.state?.layers?.push?.(line._ptboShadowCasing);
    }
    if (!line._ptboCasing) {
      line._ptboCasing = L.polyline(line.getLatLngs(),{color:'#f8fafc',weight:spec.casingWeight,opacity:spec.casingOpacity,lineCap:'round',lineJoin:'round',interactive:false}).addTo(mapInstance);
      line._ptboCasingVisibleOpacity = spec.casingOpacity;
      window.PTBO_ROUTE_COMPARE?.state?.layers?.push?.(line._ptboCasing);
    }
    line._ptboShadowCasing?.bringToBack?.();
    line._ptboCasing?.bringToBack?.();
  }

  function improveMarkers(state) {
    const routeLines = new Set((state.lineEntries || []).map(entry => entry.line).filter(Boolean));
    for (const layer of state.layers || []) {
      if (!layer?.getRadius || routeLines.has(layer)) continue;
      try {
        layer.setStyle?.({radius:8,weight:3,opacity:.98,fillOpacity:1});
        const tooltip = layer.getTooltip?.(), label = tooltip?.getContent?.();
        if (label) { layer.unbindTooltip?.(); layer.bindTooltip(label,{permanent:true,direction:'top',offset:[0,-7],className:'ptbo-route-marker-label'}); }
      } catch (_) {}
    }
  }

  function legsFor(state) {
    return state.responseLeg ? [
      {leg:state.responseLeg,label:'Start → Call'},
      {leg:state,label:'Call → Hospital'}
    ] : [{leg:state,label:'Start → Call'}];
  }

  function rebuildLegend(api) {
    const state = api?.state, legend = document.getElementById('ptbo-route-legend');
    if (!state?.reviewOpen || !legend || legend.classList.contains('hidden')) return false;
    const generation = String(state.reviewGeneration ?? '0');
    if (legend.dataset.ptboPolishedGeneration === generation) return true;

    const entries = state.lineEntries || [];
    for (const entry of entries) ensureCasing(entry);
    const firstPlayer = entries.find(entry => entry.index === 0 && !entry.suggested)?.line || null;
    const firstSuggested = entries.find(entry => entry.index === 0 && entry.suggested)?.line || null;
    state.playerLine = firstPlayer; state.suggestedLine = firstSuggested;
    for (const entry of entries.filter(entry => entry.suggested)) entry.line?.bringToFront?.();
    for (const entry of entries.filter(entry => !entry.suggested)) entry.line?.bringToFront?.();
    improveMarkers(state);

    legend.innerHTML = `
      <div class="ptbo-review-head"><div><div class="ptbo-review-title">${state.responseLeg?'EMS Route Review':'Route Review'}</div><div class="ptbo-review-copy">Blue/orange shows what you drove. The wider green/purple route sits underneath, so shared streets and different choices are easier to see.</div></div></div>
      ${legsFor(state).map(({leg,label},index)=>{
        const result = assessment(leg), rows = entries.filter(entry=>entry.index===index);
        return `<section class="ptbo-review-leg">
          <div class="ptbo-review-leg-head"><span class="ptbo-review-leg-title">${label}</span><span class="ptbo-review-time">${formatTime(leg.elapsedMs)}</span></div>
          <div class="ptbo-review-routes">${rows.map(entry=>`<button class="ptbo-review-route" type="button" data-line="${entry.key}" aria-pressed="${Boolean(entry.line)}" ${entry.line?'':'disabled'}><span class="ptbo-review-route-top"><span class="ptbo-review-swatch" style="background:${entry.color}"></span><span class="ptbo-review-name">${entry.suggested?'Recommended':'Your route'}</span></span><strong class="ptbo-review-distance">${entry.suggested?formatDistance(leg.suggestedRoute?.distance):formatDistance(leg.playerDistance)}</strong><span class="ptbo-review-action">${entry.line?'Tap to hide':'Unavailable'}</span></button>`).join('')}</div>
          <div class="ptbo-review-summary"><div class="ptbo-review-pill ${result.tone}">Route result<strong>${result.label}</strong></div><div class="ptbo-review-pill">Efficiency<strong>${result.efficiency}</strong></div></div>
          ${result.detail?`<div class="ptbo-review-detail">${result.detail}</div>`:''}${leg.suggestedRoute?'':'<div class="ptbo-review-status">Recommended route unavailable for this leg. Your completed drive is still shown.</div>'}
        </section>`;
      }).join('')}
      <div class="ptbo-review-tip">Tip: tap either route card to hide it and inspect exactly where your street choices diverged.</div><button class="ptbo-review-done" type="button">Done</button>`;

    legend.querySelectorAll('[data-line]').forEach(button=>button.addEventListener('click',()=>{
      const entry = entries.find(item=>item.key===button.dataset.line); if (!entry?.line) return;
      const visible = button.getAttribute('aria-pressed') !== 'false'; setLayerVisible(entry.line,!visible);
      button.setAttribute('aria-pressed',String(!visible)); const action=button.querySelector('.ptbo-review-action'); if(action) action.textContent=visible?'Tap to show':'Tap to hide';
    }));
    legend.querySelector('.ptbo-review-done')?.addEventListener('click',()=>api.close?.());
    legend.dataset.ptboPolishedGeneration = generation;

    setTimeout(()=>{
      try {
        if(!state.reviewOpen||!state.layers?.length||!window.L||!window.mapInstance)return;
        const bounds=L.featureGroup(state.layers).getBounds(); if(!bounds.isValid())return;
        const mobile=matchMedia('(max-width:900px),(pointer:coarse)').matches, cardHeight=Math.ceil(legend.getBoundingClientRect().height);
        mapInstance.fitBounds(bounds,mobile?{paddingTopLeft:[24,Math.min(cardHeight+24,Math.round(innerHeight*.52))],paddingBottomRight:[24,36],maxZoom:16,animate:false}:{paddingTopLeft:[374,55],paddingBottomRight:[70,55],maxZoom:16,animate:false});
      } catch(_){}
    },60);
    return true;
  }

  let previousOpen = null;
  function sync() {
    installStyles();
    const api = window.PTBO_ROUTE_COMPARE, open = Boolean(api?.state?.reviewOpen);
    if (open !== previousOpen) {
      previousOpen = open;
      document.documentElement.classList.toggle('ptbo-mobile-route-review',Boolean(isMobileHost&&open));
      try { window.parent.document.documentElement.classList.toggle('ptbo-mobile-route-review-active',Boolean(isMobileHost&&open)); } catch(_){}
    }
    if (open) rebuildLegend(api);
  }

  window.addEventListener('pagehide',()=>{document.documentElement.classList.remove('ptbo-mobile-route-review');try{window.parent.document.documentElement.classList.remove('ptbo-mobile-route-review-active')}catch(_){}});
  installStyles(); sync(); const timer=setInterval(sync,80);
  window.PTBO_ROUTE_REVIEW_UI=Object.freeze({version:VERSION,mobile:isMobileHost,sync,rebuild:()=>rebuildLegend(window.PTBO_ROUTE_COMPARE),setLineVisible:setLayerVisible,timer});
})();