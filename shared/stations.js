(() => {
  const stations = Object.freeze([
    Object.freeze({ id: 'station-1', number: 1, name: 'Station 1', address: '210 Sherbrooke St', lat: 44.300871, lng: -78.322206 }),
    Object.freeze({ id: 'station-2', number: 2, name: 'Station 2', address: '100 Marina Blvd', lat: 44.335266, lng: -78.316657 }),
    Object.freeze({ id: 'station-3', number: 3, name: 'Station 3', address: '839 Clonsilla Ave', lat: 44.284867, lng: -78.350902 })
  ]);

  window.PTBO_STATIONS = stations;
  window.getPtboStation = number => stations.find(station => station.number === Number(number));

  const sourceUrl = document.currentScript?.src;
  if (!sourceUrl) return;

  function loadDispatchStore() {
    if (window.PTBO_DISPATCH_STORE) return Promise.resolve(window.PTBO_DISPATCH_STORE);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ptbo-dispatch-store]');
      if (existing) {
        existing.addEventListener('load', () => resolve(window.PTBO_DISPATCH_STORE), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = new URL('./dispatch-locations.js', sourceUrl).href;
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
      if (!next || next.classList.contains('section-title')) break;
      node = next;
    }
  }

  function loadSimulatorTool(doc, filename, dataAttribute, errorMessage) {
    if (doc.querySelector(`script[${dataAttribute}]`)) return;
    const script = doc.createElement('script');
    script.src = new URL(`../response-simulator/${filename}`, sourceUrl).href;
    script.setAttribute(dataAttribute, 'true');
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
          .mobile-controls {
            grid-template-columns:126px 48px 142px !important;
            gap:7px !important;
            padding-left:max(14px,env(safe-area-inset-left)) !important;
            padding-right:max(14px,env(safe-area-inset-right)) !important;
          }
          .joystick { width:126px !important; height:126px !important; }
          .joystick-thumb { width:59px !important; height:59px !important; }
          .utility-zone { gap:8px !important; padding-bottom:6px !important; }
          .pedal-zone { min-width:0 !important; gap:6px !important; padding-right:0 !important; transform:none !important; }
          .pedal { width:68px !important; height:108px !important; border-radius:22px !important; }
          .pedal.reverse { height:84px !important; }
        }
        @media (max-width:350px) and (orientation:portrait) {
          .mobile-controls {
            grid-template-columns:116px 44px 128px !important;
            gap:5px !important;
            padding-left:max(10px,env(safe-area-inset-left)) !important;
            padding-right:max(10px,env(safe-area-inset-right)) !important;
          }
          .joystick { width:116px !important; height:116px !important; }
          .joystick-thumb { width:54px !important; height:54px !important; }
          .utility-button { width:44px !important; height:44px !important; }
          .pedal-zone { gap:6px !important; }
          .pedal { width:61px !important; height:102px !important; font-size:10px !important; }
          .pedal.reverse { height:80px !important; }
        }
      `;
      document.head.appendChild(parentStyle);
    }

    if (doc && !doc.getElementById('ptbo-mobile-map-polish')) {
      const childStyle = doc.createElement('style');
      childStyle.id = 'ptbo-mobile-map-polish';
      childStyle.textContent = `
        #ptbo-speedometer {
          top:calc(164px + env(safe-area-inset-top)) !important;
          left:10px !important;
          z-index:1260 !important;
        }
        #map-orientation-controls {
          right:14px !important;
          bottom:calc(190px + env(safe-area-inset-bottom)) !important;
          z-index:1265 !important;
          gap:7px !important;
        }
        #compass { overflow:visible !important; }
        @media (max-width:350px) {
          #ptbo-speedometer { top:calc(160px + env(safe-area-inset-top)) !important; }
          #map-orientation-controls {
            right:10px !important;
            bottom:calc(184px + env(safe-area-inset-bottom)) !important;
          }
        }
        @media (orientation:landscape) and (max-height:560px) {
          #ptbo-speedometer { top:calc(137px + env(safe-area-inset-top)) !important; }
          #map-orientation-controls {
            right:12px !important;
            bottom:calc(146px + env(safe-area-inset-bottom)) !important;
          }
        }
      `;
      doc.head.appendChild(childStyle);
    }
  }

  function patchSimulator(frame, store) {
    const doc = frame.contentDocument;
    if (!doc) return;
    installMobileLayoutPolish(doc);
    if (doc.documentElement.dataset.sharedDispatchPatched === 'true') return;
    doc.documentElement.dataset.sharedDispatchPatched = 'true';
    removeLegacyEditorControls(doc);
    loadSimulatorTool(doc, 'road-collision.js', 'data-ptbo-road-collision', 'Unable to load the Peterborough road boundary system.');
    loadSimulatorTool(doc, 'speed-streak.js', 'data-ptbo-speed-streak', 'Unable to load the collision speed streak system.');
    loadSimulatorTool(doc, 'vehicle-instruments.js?v=20260718-1', 'data-ptbo-vehicle-instruments', 'Unable to load the speedometer and analog steering system.');
    loadSimulatorTool(doc, 'max-speed.js?v=20260718-1', 'data-ptbo-max-speed', 'Unable to load the max speed tracker.');
    loadSimulatorTool(doc, 'route-reveal.js', 'data-ptbo-route-reveal', 'Unable to load the Peterborough route answer system.');

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
          const result = originalToggle.apply(this, args);
          if (allLocationsVisible && allLocationsLayerGroup) {
            allLocationsLayerGroup.eachLayer(layer => layer.on?.('dragend', sync));
          }
          return result;
        };
        window.toggleAllLocations = toggleAllLocations;

        window.addEventListener('ptbo-shared-dispatch-refresh', () => {
          const fresh = parent.PTBO_DISPATCH_STORE.getAll();
          dispatchDatabase.splice(0, dispatchDatabase.length, ...fresh.map(item => ({ ...item })));
          if (allLocationsVisible) {
            allLocationsVisible = false;
            toggleAllLocations();
          }
        });
      })();`;
      doc.body.appendChild(helper);
    };

    apply().catch(error => console.error('Unable to apply shared dispatch locations to simulator.', error));
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
      window.showPersonalScores=()=>loadingMessage('scores');
      window.showCityTenScores=()=>loadingMessage('city-ten-scores');
      window.saveScore=()=>alert('The online scoreboard is still connecting. Please try Save again in a moment.');
      window.geoScoreboardLoadFailed=()=>{
        window.showPersonalScores=()=>failureMessage('scores');
        window.showCityTenScores=()=>failureMessage('city-ten-scores');
        window.saveScore=()=>alert('The scoreboard code could not load. Refresh the game and try again.');
      };
    })();`;
    doc.body.appendChild(bridge);

    const scoreboard = doc.createElement('script');
    scoreboard.src = new URL('../geo-guesser/firebase-scoreboard.js?v=20260718-2', sourceUrl).href;
    scoreboard.onload = () => {
      if (!frame.contentWindow?.__geoScoreboardReady) frame.contentWindow?.geoScoreboardLoadFailed?.();
    };
    scoreboard.onerror = () => {
      frame.contentWindow?.geoScoreboardLoadFailed?.();
      console.error('Unable to load the Geo Guesser scoreboard.');
    };
    doc.body.appendChild(scoreboard);
  }

  installMobileLayoutPolish(null);

  const simulatorFrame = document.getElementById('simulator');
  if (simulatorFrame) {
    loadDispatchStore()
      .then(store => {
        if (simulatorFrame.contentDocument?.readyState === 'complete') patchSimulator(simulatorFrame, store);
        simulatorFrame.addEventListener('load', () => patchSimulator(simulatorFrame, store));
      })
      .catch(error => console.error('Unable to load shared dispatch store.', error));
  }

  const geoFrame = document.getElementById('game-frame');
  if (geoFrame) {
    if (geoFrame.contentDocument?.readyState === 'complete') patchGeoScoreboard(geoFrame);
    geoFrame.addEventListener('load', () => patchGeoScoreboard(geoFrame));
  }
})();