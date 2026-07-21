(() => {
  'use strict';

  const VERSION = '1.4.20';
  if (window.PTBO_SIMULATOR_READY_VERSION === VERSION && window.PTBO_SIMULATOR_READY) return;
  window.PTBO_SIMULATOR_READY_VERSION = VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const isMobileWrapper = (() => {
    try {
      return window.parent !== window && Boolean(window.parent.document.getElementById('steering'));
    } catch (_) {
      return false;
    }
  })();

  function installVersionBadge() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;
    let badge = document.getElementById('ptbo-version-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ptbo-version-badge';
      panel.appendChild(badge);
    }
    badge.textContent = `v${VERSION}`;

    let style = document.getElementById('ptbo-version-148-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-version-148-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      #ptbo-version-badge{margin-top:18px!important;color:#9ca3af!important;font-size:8px!important;font-weight:700!important;letter-spacing:.08em!important;text-align:right!important;opacity:.58!important}
      #ptbo-version-badge::after{content:''!important}
    `;
    return true;
  }

  function injectScript(filename, marker) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[${marker}]`);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') {
          resolve(existing);
          return;
        }
        existing.addEventListener('load', () => resolve(existing), { once: true });
        existing.addEventListener('error', () => reject(new Error(`Unable to load ${filename}.`)), { once: true });
        return;
      }

      const script = document.createElement('script');
      const url = new URL(filename, document.baseURI);
      url.searchParams.set('v', VERSION);
      script.src = url.href;
      script.setAttribute(marker, 'true');
      script.onload = () => {
        script.dataset.ptboLoaded = 'true';
        resolve(script);
      };
      script.onerror = () => reject(new Error(`Unable to load ${filename}.`));
      document.body.appendChild(script);
    });
  }

  async function waitForValue(readValue, label, timeoutMilliseconds = 20000) {
    const startedAt = performance.now();
    while (true) {
      const value = readValue();
      if (value) return value;
      if (performance.now() - startedAt > timeoutMilliseconds) {
        throw new Error(`${label} did not become ready in time.`);
      }
      await sleep(50);
    }
  }

  async function initialize() {
    installVersionBadge();
    await waitForValue(
      () => typeof mapInstance !== 'undefined' && mapInstance && typeof simulationLoop === 'function',
      'Base simulator',
    );

    await Promise.all([
      injectScript('vehicle-instruments.js', 'data-ptbo-readiness-vehicle'),
      injectScript('road-collision.js', 'data-ptbo-readiness-road'),
    ]);

    const instrumentsReady = window.PTBO_VEHICLE_INSTRUMENTS_READY
      || waitForValue(() => window.PTBO_VEHICLE_INSTRUMENTS, 'Vehicle steering system');
    const roadsReady = window.PTBO_ROAD_COLLISION_BOOTSTRAP_READY
      || (async () => {
        const roadApi = await waitForValue(() => window.PTBO_ROAD_COLLISION, 'Road-boundary system');
        await roadApi.ready;
        return roadApi;
      })();

    const [instruments, roads] = await Promise.all([instrumentsReady, roadsReady]);
    if (!instruments?.setAnalogSteering) {
      throw new Error('Vehicle steering API is incomplete.');
    }
    if (roads?.state?.status !== 'ready' || !roads?.state?.originalLoop) {
      throw new Error('Road boundaries are not attached to vehicle movement.');
    }

    if (isMobileWrapper) {
      await waitForValue(
        () => instruments.state?.mobileSteeringConnected,
        'Mobile steering connection',
        10000,
      );
    }

    installVersionBadge();
    [250, 750, 1500].forEach(delay => setTimeout(installVersionBadge, delay));
    const detail = {
      version: VERSION,
      mobile: isMobileWrapper,
      roadSegments: roads.state.segments.length,
      steeringConnected: Boolean(instruments.state?.mobileSteeringConnected),
    };
    window.dispatchEvent(new CustomEvent('ptbo-simulator-ready', { detail }));
    return detail;
  }

  const ready = initialize();
  window.PTBO_SIMULATOR_READY = ready;
  ready.catch(error => {
    window.dispatchEvent(new CustomEvent('ptbo-simulator-startup-error', { detail: { version: VERSION, error } }));
    console.error('Simulator startup verification failed.', error);
  });
})();
