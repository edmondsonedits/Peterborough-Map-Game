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

  function patchSimulator(frame, store) {
    const doc = frame.contentDocument;
    if (!doc || doc.documentElement.dataset.sharedDispatchPatched === 'true') return;
    doc.documentElement.dataset.sharedDispatchPatched = 'true';

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

        const originalRecord = recordCurrentLocation;
        recordCurrentLocation = function(...args) {
          const before = dispatchDatabase.length;
          const result = originalRecord.apply(this, args);
          if (dispatchDatabase.length > before) {
            const item = dispatchDatabase[dispatchDatabase.length - 1];
            item.id = parent.PTBO_DISPATCH_STORE.createId(item);
            item.radius = 50;
            item.cityTen = false;
            item.custom = true;
            item.sources = ['editor', 'driving-simulator'];
            sync();
          }
          return result;
        };
        window.recordCurrentLocation = recordCurrentLocation;

        const originalToggle = toggleAllLocations;
        toggleAllLocations = function(...args) {
          const result = originalToggle.apply(this, args);
          if (allLocationsVisible && allLocationsLayerGroup) {
            allLocationsLayerGroup.eachLayer(layer => layer.on?.('dragend', sync));
          }
          return result;
        };
        window.toggleAllLocations = toggleAllLocations;

        exportUpdatedDatabase = function() {
          sync();
          displayExportModal(parent.PTBO_DISPATCH_STORE.exportText());
        };
        window.exportUpdatedDatabase = exportUpdatedDatabase;

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

  const simulatorFrame = document.getElementById('simulator');
  if (simulatorFrame) {
    loadDispatchStore()
      .then(store => {
        if (simulatorFrame.contentDocument?.readyState === 'complete') patchSimulator(simulatorFrame, store);
        simulatorFrame.addEventListener('load', () => patchSimulator(simulatorFrame, store));
      })
      .catch(error => console.error('Unable to load shared dispatch store.', error));
  }
})();
