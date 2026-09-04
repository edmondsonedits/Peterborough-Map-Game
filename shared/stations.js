(() => {
  'use strict';
  const VERSION = '1.6.13';
  const sourceUrl = document.currentScript?.src;
  if (!sourceUrl) return;

  const params = new URLSearchParams(location.search);
  const stored = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
  const cityId = /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';

  // package.js owns PTBO_STATIONS/getPtboStation. Insert it synchronously so the
  // wrapper's following inline script can consume station data immediately.
  if (!window.PTBO_CITY_PACKAGE || window.PTBO_CITY_PACKAGE.id !== cityId) {
    const packageUrl = new URL(`../cities/${cityId}/package.js?v=${VERSION}`, sourceUrl).href;
    if (document.readyState === 'loading') document.write(`<script src="${packageUrl.replace(/&/g,'&amp;')}"><\/script>`);
    else {
      const script = document.createElement('script');
      script.src = packageUrl;
      script.dataset.ptboCityPackage = cityId;
      document.head.appendChild(script);
    }
  }

  function loadDispatchStore() {
    if (window.PTBO_DISPATCH_STORE) return Promise.resolve(window.PTBO_DISPATCH_STORE);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ptbo-dispatch-store]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.PTBO_DISPATCH_STORE), { once:true });
        existing.addEventListener('error', reject, { once:true });
        return;
      }
      const script = document.createElement('script');
      const url = new URL('./dispatch-locations.js', sourceUrl);
      url.searchParams.set('city',cityId);
      url.searchParams.set('v',VERSION);
      script.src = url.href;
      script.dataset.ptboDispatchStore = 'true';
      script.onload = () => resolve(window.PTBO_DISPATCH_STORE);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function removeLegacyEditorControls(doc) {
    const panel = doc.querySelector('.panel-scroll');
    if (!panel) return;
    const titles = [...panel.querySelectorAll('.section-title')];
    const customTitle = titles.find(title => title.textContent.trim() === 'Custom Dispatch Logging');
    if (!customTitle) return;
    let node = customTitle;
    while (node) {
      const next = node.nextElementSibling;
      node.remove();
      if (!next || next.classList.contains('section-title') || next.classList.contains('category-heading')) break;
      node = next;
    }
  }

  function loadSimulatorTool(doc, filename, dataAttribute, errorMessage) {
    if (doc.querySelector(`script[${dataAttribute}]`)) return;
    const script = doc.createElement('script');
    const url = new URL(`../response-simulator/${filename}`, sourceUrl);
    if (!url.searchParams.has('v')) url.searchParams.set('v',VERSION);
    script.src = url.href;
    script.setAttribute(dataAttribute,'true');
    script.onerror = () => console.error(errorMessage);
    doc.body.appendChild(script);
  }

  function installMobileLayoutPolish(doc) {
    if (!document.querySelector('.mobile-controls')) return;
    if (!document.getElementById('ptbo-mobile-layout-polish')) {
      const parentStyle = document.createElement('style');
      parentStyle.id = 'ptbo-mobile-layout-polish';
      parentStyle.textContent = `
        @media (max-width:900px) and (orientation:portrait) {
          .mobile-controls {grid-template-columns:126px 48px 142px!important;gap:7px!important;padding-left:max(14px,env(safe-area-inset-left))!important;padding-right:max(14px,env(safe-area-inset-right))!important}
          .joystick{width:126px!important;height:126px!important}.joystick-thumb{width:59px!important;height:59px!important}.utility-zone{gap:8px!important;padding-bottom:6px!important}.pedal-zone{min-width:0!important;gap:6px!important;padding-right:0!important;transform:none!important}.pedal{width:68px!important;height:108px!important;border-radius:22px!important}.pedal.reverse{height:84px!important}
        }
        @media (max-width:350px) and (orientation:portrait) {
          .mobile-controls{grid-template-columns:116px 44px 128px!important;gap:5px!important;padding-left:max(10px,env(safe-area-inset-left))!important;padding-right:max(10px,env(safe-area-inset-right))!important}.joystick{width:116px!important;height:116px!important}.joystick-thumb{width:54px!important;height:54px!important}.utility-button{width:44px!important;height:44px!important}.pedal-zone{gap:6px!important}.pedal{width:61px!important;height:102px!important;font-size:10px!important}.pedal.reverse{height:80px!important}
        }`;
      document.head.appendChild(parentStyle);
    }
    if (doc && !doc.getElementById('ptbo-mobile-map-polish')) {
      const childStyle = doc.createElement('style');
      childStyle.id = 'ptbo-mobile-map-polish';
      childStyle.textContent = `
        #map-orientation-controls{display:none!important}
        #ptbo-speedometer{top:calc(164px + env(safe-area-inset-top))!important;left:10px!important;z-index:1260!important}
        @media(max-width:350px){#ptbo-speedometer{top:calc(160px + env(safe-area-inset-top))!important}}
        @media(orientation:landscape) and (max-height:560px){#ptbo-speedometer{top:calc(137px + env(safe-area-inset-top))!important}}`;
      doc.head.appendChild(childStyle);
    }
  }

  function patchSimulator(frame, store) {
    const doc = frame.contentDocument;
    const game = frame.contentWindow;
    if (!doc || !game || typeof game.initializeSimulator !== 'function' || typeof game.toggleAllLocations !== 'function') return;
    installMobileLayoutPolish(doc);
    if (doc.documentElement.dataset.sharedDispatchPatched === VERSION) return;
    doc.documentElement.dataset.sharedDispatchPatched = VERSION;
    removeLegacyEditorControls(doc);
    loadSimulatorTool(doc,'camera-fix.js?v=1.5.10','data-ptbo-smooth-camera','Unable to load the stable simulator camera base.');
    loadSimulatorTool(doc,'smooth-driving-camera-1.4.19.js?v=1.5.10','data-ptbo-driving-camera','Unable to load the Fixed Map and Driving View camera.');
    loadSimulatorTool(doc,`road-collision.js?v=${VERSION}`,'data-ptbo-road-collision','Unable to load the selected city road boundary system.');
    loadSimulatorTool(doc,'speed-streak.js?v=1.5.10','data-ptbo-speed-streak','Unable to load the collision speed streak system.');
    loadSimulatorTool(doc,`vehicle-instruments.js?v=${VERSION}`,'data-ptbo-vehicle-instruments','Unable to load the speedometer and mobile steering systems.');
    loadSimulatorTool(doc,'max-speed.js?v=1.5.10','data-ptbo-max-speed','Unable to load the max speed tracker.');
    loadSimulatorTool(doc,`route-reveal.js?v=${VERSION}`,'data-ptbo-route-reveal','Unable to load the route answer system.');
    loadSimulatorTool(doc,`route-compare.js?v=${VERSION}`,'data-ptbo-route-compare','Unable to load the post-call route comparison system.');

    const apply = async () => {
      await store.ready();
      const shared = store.getAll();
      const helper = doc.createElement('script');
      helper.textContent = `(() => {
        const shared = ${JSON.stringify(shared)};
        dispatchDatabase.splice(0, dispatchDatabase.length, ...shared.map(item => ({ ...item })));
        const sync = () => {
          dispatchDatabase.forEach(item => {
            if (!item.id) item.id = parent.PTBO_DISPATCH_STORE.createId(item);
            if (!item.radius) item.radius = 50;
            if (!Array.isArray(item.sources)) item.sources = ['driving-simulator'];
          });
          parent.PTBO_DISPATCH_STORE.replaceAll(dispatchDatabase);
        };
        const originalToggle = toggleAllLocations;
        toggleAllLocations = function(...args) {
          const result = originalToggle.apply(this,args);
          if (allLocationsVisible && allLocationsLayerGroup) allLocationsLayerGroup.eachLayer(layer => layer.on?.('dragend',sync));
          return result;
        };
        window.toggleAllLocations = toggleAllLocations;
        window.addEventListener('ptbo-shared-dispatch-refresh',() => {
          const fresh = parent.PTBO_DISPATCH_STORE.getAll();
          dispatchDatabase.splice(0,dispatchDatabase.length,...fresh.map(item => ({...item})));
          if (allLocationsVisible) {allLocationsVisible=false;toggleAllLocations();}
        });
      })();`;
      doc.body.appendChild(helper);
    };
    apply().catch(error => console.error('Unable to apply city dispatch locations to simulator.',error));
  }

  function patchGeoScoreboard(frame) {
    const doc = frame.contentDocument;
    if (!doc || doc.documentElement.dataset.firebaseScoreboardPatched === 'true') return;
    doc.documentElement.dataset.firebaseScoreboardPatched = 'true';
    const bridge = doc.createElement('script');
    bridge.textContent = `(() => {
      window.geoScoreContext=()=>({responseTimeSeconds:Number(elapsed.toFixed(1)),station:station&&station.name?station.name:'Unknown Station',callType:typeof modeName==='function'?modeName():'Random Shift'});
      const loadingMessage=id=>{show(id);const list=document.querySelector('#'+id+' .list');if(list)list.innerHTML='<p class="muted" style="text-align:center">Connecting to the online scoreboard…</p>'};
      const failureMessage=id=>{show(id);const list=document.querySelector('#'+id+' .list');if(list)list.innerHTML='<p class="muted" style="text-align:center">The scoreboard code could not load. Refresh the game and try again.</p>'};
      window.showPersonalScores=()=>loadingMessage('scores');window.showCityTenScores=()=>loadingMessage('city-ten-scores');window.saveScore=()=>alert('The online scoreboard is still connecting. Please try Save again in a moment.');
      window.geoScoreboardLoadFailed=()=>{window.showPersonalScores=()=>failureMessage('scores');window.showCityTenScores=()=>failureMessage('city-ten-scores');window.saveScore=()=>alert('The scoreboard code could not load. Refresh the game and try again.');};
    })();`;
    doc.body.appendChild(bridge);
    const scoreboard = doc.createElement('script');
    scoreboard.src = new URL('../geo-guesser/firebase-scoreboard.js?v=1.5.10',sourceUrl).href;
    scoreboard.onload = () => {if (!frame.contentWindow?.__geoScoreboardReady) frame.contentWindow?.geoScoreboardLoadFailed?.();};
    scoreboard.onerror = () => {frame.contentWindow?.geoScoreboardLoadFailed?.();console.error('Unable to load the Geo Guesser scoreboard.');};
    doc.body.appendChild(scoreboard);
  }

  installMobileLayoutPolish(null);
  const simulatorFrame = document.getElementById('simulator');
  if (simulatorFrame) {
    loadDispatchStore().then(store => {
      if (simulatorFrame.contentDocument?.readyState === 'complete') patchSimulator(simulatorFrame,store);
      simulatorFrame.addEventListener('load',() => patchSimulator(simulatorFrame,store));
    }).catch(error => console.error('Unable to load city dispatch store.',error));
  }
  const geoFrame = document.getElementById('game-frame');
  if (geoFrame) {
    if (geoFrame.contentDocument?.readyState === 'complete') patchGeoScoreboard(geoFrame);
    geoFrame.addEventListener('load',() => patchGeoScoreboard(geoFrame));
  }
})();
