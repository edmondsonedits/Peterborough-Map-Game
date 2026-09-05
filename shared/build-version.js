/* Shared production build marker and response-simulator enhancement loader. */
(() => {
  'use strict';

  const VERSION = '1.6.23';
  const CITY_RUNTIME_VERSION = '1.6.17';
  const LABEL = `v${VERSION}`;
  const SCRIPT_URL = document.currentScript?.src || new URL('shared/build-version.js', location.href).href;
  const SCRIPT_TIMEOUT_MS = 12000;
  if (window.PTBO_BUILD?.version === VERSION) return;

  window.PTBO_BUILD = Object.freeze({
    version:VERSION,
    label:LABEL,
    channel:'production',
    cityRuntimeVersion:CITY_RUNTIME_VERSION,
  });
  window.PTBO_BUILD_ERRORS = window.PTBO_BUILD_ERRORS || [];
  document.documentElement.dataset.ptboBuild = VERSION;
  document.documentElement.dataset.ptboChannel = 'production';
  document.documentElement.dataset.ptboCityRuntimeProtocol = CITY_RUNTIME_VERSION;

  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
  const trace = (message, detail = '') => window.PTBO_STARTUP_TRACE?.mark?.(message, detail);
  const traceOk = (message, detail = '') => window.PTBO_STARTUP_TRACE?.ok?.(message, detail);
  const traceWarn = (message, detail = '') => window.PTBO_STARTUP_TRACE?.warn?.(message, detail);

  function enhancementStage(stage, detail = '') {
    window.PTBO_ENHANCEMENT_STAGE = Object.freeze({
      stage,
      detail:String(detail || ''),
      at:performance.now(),
      version:VERSION,
      cityRuntimeVersion:CITY_RUNTIME_VERSION,
    });
    trace(`Enhancement loader: ${stage}`, detail);
  }

  if (!document.documentElement.dataset.ptboBuildErrorListeners) {
    document.documentElement.dataset.ptboBuildErrorListeners = 'true';
    addEventListener('error', event => {
      window.PTBO_BUILD_ERRORS.push({
        message:String(event.message || event.error || 'Unknown error'),
        source:String(event.filename || event.target?.src || event.target?.href || ''),
        line:Number(event.lineno || 0),
        column:Number(event.colno || 0),
        stack:String(event.error?.stack || ''),
      });
      document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
    }, true);
    addEventListener('unhandledrejection', event => {
      window.PTBO_BUILD_ERRORS.push({
        message:String(event.reason?.message || event.reason || 'Unhandled promise rejection'),
        source:'unhandledrejection',
        line:0,
        column:0,
        stack:String(event.reason?.stack || ''),
      });
      document.documentElement.dataset.ptboBuildErrors = JSON.stringify(window.PTBO_BUILD_ERRORS);
    });
  }

  function installBadge() {
    if (!document.body) return;
    let style = document.getElementById('ptbo-build-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ptbo-build-style';
      style.textContent = '#ptbo-build-badge{position:fixed;top:max(4px,env(safe-area-inset-top));left:50%;z-index:2147483647;padding:3px 8px;color:#e2e8f0;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(15,23,42,.82);box-shadow:0 3px 10px rgba(0,0,0,.25);font:800 9px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.05em;white-space:nowrap;transform:translateX(-50%);pointer-events:none}@media(max-width:420px){#ptbo-build-badge{top:max(2px,env(safe-area-inset-top));padding:2px 6px;font-size:7px}}';
      document.head.appendChild(style);
    }
    let badge = document.getElementById('ptbo-build-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'ptbo-build-badge';
      badge.setAttribute('role','status');
      document.body.appendChild(badge);
    }
    badge.textContent = LABEL;
    badge.setAttribute('aria-label', `Production version ${VERSION}`);
  }

  function injectScript(targetDocument, id, relativeUrl, marker = '', timeoutMs = SCRIPT_TIMEOUT_MS) {
    const expected = new URL(relativeUrl, SCRIPT_URL).href;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, script) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        error ? reject(error) : resolve(script);
      };
      const timer = setTimeout(
        () => finish(new Error(`Timed out loading ${relativeUrl} after ${timeoutMs} ms.`)),
        timeoutMs,
      );

      const existing = targetDocument.getElementById(id);
      if (existing) {
        if (existing.src === expected && existing.dataset.ptboLoaded === 'true') {
          finish(null, existing);
          return;
        }
        existing.remove();
      }

      const script = targetDocument.createElement('script');
      script.id = id;
      script.src = expected;
      script.dataset.ptboVersion = VERSION;
      script.dataset.ptboLoading = 'true';
      if (marker) script.setAttribute(marker, 'true');
      script.onload = () => {
        script.dataset.ptboLoading = 'false';
        script.dataset.ptboLoaded = 'true';
        finish(null, script);
      };
      script.onerror = () => {
        script.remove();
        finish(new Error(`Unable to load ${relativeUrl}.`));
      };
      (targetDocument.body || targetDocument.head || targetDocument.documentElement).appendChild(script);
    });
  }

  const injectPageScript = (id, relativeUrl, timeoutMs = SCRIPT_TIMEOUT_MS) =>
    injectScript(document, id, relativeUrl, '', timeoutMs);

  function injectIntoFrame(doc, id, relativeUrl, marker = '', timeoutMs = SCRIPT_TIMEOUT_MS) {
    enhancementStage('injecting-inner-module', relativeUrl);
    return injectScript(doc, id, relativeUrl, marker, timeoutMs).then(script => {
      traceOk('Enhancement loader: inner module loaded', relativeUrl);
      return script;
    });
  }

  async function optionalInnerModule(doc, id, relativeUrl, marker = '', timeoutMs = SCRIPT_TIMEOUT_MS) {
    try {
      return await injectIntoFrame(doc, id, relativeUrl, marker, timeoutMs);
    } catch (error) {
      traceWarn('Enhancement loader: optional module skipped', `${relativeUrl} — ${error?.message || error}`);
      return null;
    }
  }

  function selectedCityId() {
    const params = new URLSearchParams(location.search);
    let stored = null;
    try { stored = localStorage.getItem('ptboSelectedCity'); } catch (_) {}
    const requested = String(params.get('city') || stored || 'peterborough').toLowerCase();
    return /^[a-z0-9-]+$/.test(requested) ? requested : 'peterborough';
  }

  function prefersMobileSurface() {
    const ua = String(navigator?.userAgent || '');
    const touchPoints = Number(navigator?.maxTouchPoints || 0);
    const uaDataMobile = navigator?.userAgentData?.mobile === true;
    const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
    const iPadDesktopUa = /Macintosh/i.test(ua) && touchPoints > 1;
    let coarsePointer = false;
    try { coarsePointer = window.matchMedia?.('(pointer: coarse)').matches === true; } catch (_) {}
    const screenWidth = typeof screen !== 'undefined' ? Number(screen.width) || Infinity : Infinity;
    const screenHeight = typeof screen !== 'undefined' ? Number(screen.height) || Infinity : Infinity;
    const compactTouchDevice = coarsePointer && touchPoints > 0 && Math.min(screenWidth, screenHeight) <= 900;
    return uaDataMobile || mobileUa || iPadDesktopUa || compactTouchDevice;
  }

  function installDeviceSurfaceApi() {
    if (window.PTBO_DEVICE_SURFACE?.version === VERSION) return window.PTBO_DEVICE_SURFACE;
    window.PTBO_DEVICE_SURFACE = Object.freeze({
      version:VERSION,
      isMobile:prefersMobileSurface,
      preferred:() => prefersMobileSurface() ? 'mobile' : 'desktop',
    });
    return window.PTBO_DEVICE_SURFACE;
  }

  function redirectWrongSimulatorSurface() {
    const isDesktop = /\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname);
    const isMobile = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if (!isDesktop && !isMobile) return false;

    const wantsMobile = prefersMobileSurface();
    if ((wantsMobile && isMobile) || (!wantsMobile && isDesktop)) return false;

    const target = new URL(wantsMobile ? '../mobile/' : '../play/', location.href);
    target.search = location.search;
    target.searchParams.set('city', selectedCityId());
    target.searchParams.set('v', VERSION);
    target.searchParams.set('fresh', String(Date.now()));
    enhancementStage('redirecting-simulator-surface', `${isDesktop ? 'desktop' : 'mobile'} → ${wantsMobile ? 'mobile' : 'desktop'}`);
    location.replace(target.href);
    return true;
  }

  function installCitySelector() {
    if (!document.getElementById('dispatch-game-link')) return;
    injectPageScript('ptbo-city-registry-loader', `../cities/city-registry.js?v=${VERSION}`)
      .then(() => injectPageScript('ptbo-city-selector-loader', `city-selector.js?v=${VERSION}`))
      .catch(error => console.error('City selector failed to initialize.', error));
  }

  function normalizeSimulatorFrameUrl(frame) {
    if (!frame) return;
    const isWrapper = /\/response-simulator\/(?:play|mobile)\/(?:index\.html)?$/.test(location.pathname);
    if (!isWrapper) return;
    try {
      const url = new URL(frame.getAttribute('src') || '../index.html', location.href);
      const cityId = selectedCityId();
      const changed = url.searchParams.get('city') !== cityId || url.searchParams.get('v') !== VERSION;
      url.searchParams.set('city', cityId);
      url.searchParams.set('v', VERSION);
      frame.dataset.ptboCityUrlVersion = VERSION;
      frame.dataset.ptboCity = cityId;
      if (changed) {
        enhancementStage('normalizing-iframe-url', url.href);
        frame.src = url.href;
      }
    } catch (error) {
      traceWarn('Enhancement loader: iframe URL normalization failed', error);
    }
  }

  function setCityLoadingCopy() {
    if (selectedCityId() === 'peterborough') return;
    const title = document.getElementById('loading-title');
    const status = document.getElementById('loading-status');
    if (title) title.textContent = 'Loading simulator';
    if (status) status.textContent = 'Loading city map, Fire/EMS bases, and Peterborough driving controls…';
  }

  function installResponseEnhancements() {
    const isDesktop = /\/response-simulator\/play\/(?:index\.html)?$/.test(location.pathname);
    const isMobile = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if (!isDesktop && !isMobile) return;
    if (redirectWrongSimulatorSurface()) return;

    const frame = document.getElementById('simulator');
    if (!frame) return;
    enhancementStage('response-simulator-detected', isMobile ? 'mobile' : 'desktop');
    normalizeSimulatorFrameUrl(frame);
    setCityLoadingCopy();

    if (frame.dataset.ptboEnhancementLoader === VERSION) return;
    frame.dataset.ptboEnhancementLoader = VERSION;

    let installPromise = null;
    let installedDocument = null;

    const installInsideFrame = () => {
      const doc = frame.contentDocument;
      const game = frame.contentWindow;
      if (!doc || !game) return Promise.resolve();
      if (installPromise && installedDocument === doc) return installPromise;
      installedDocument = doc;

      installPromise = (async () => {
        try {
          enhancementStage('iframe-attached', selectedCityId());

          // Production builds may advance independently from the stable city-runtime
          // protocol. Readiness must wait for the protocol actually reported by the
          // current city-runtime file, not for the marketing/build version.
          game.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION = CITY_RUNTIME_VERSION;

          await injectIntoFrame(
            doc,
            'ptbo-simulator-readiness',
            `../response-simulator/simulator-readiness-1.6.17.js?v=${VERSION}`,
            'data-ptbo-simulator-readiness',
            15000,
          );
          await injectIntoFrame(
            doc,
            'ptbo-city-runtime-bootstrap',
            `../response-simulator/city-runtime-bootstrap-1.6.17.js?v=${VERSION}`,
          );

          enhancementStage('waiting-city-runtime', `protocol v${CITY_RUNTIME_VERSION}`);
          await Promise.race([
            Promise.resolve(game.PTBO_CITY_RUNTIME_READY),
            sleep(15000).then(() => { throw new Error('City runtime readiness timed out after 15000 ms.'); }),
          ]);
          if (game.PTBO_CITY_RUNTIME_ERROR) throw game.PTBO_CITY_RUNTIME_ERROR;

          const city = game.PTBO_CITY_PACKAGE;
          const baseTraining = Boolean(city?.features?.baseTraining || city?.dispatch?.available === false);
          traceOk('Enhancement loader: city runtime accepted', city?.name || selectedCityId());

          // Base training only removes dispatch missions. It deliberately keeps the
          // Peterborough simulator wrappers and their vehicle/camera/control stack.
          if (baseTraining) {
            void optionalInnerModule(
              doc,
              'ptbo-base-training-mode',
              `../response-simulator/base-training-mode-1.6.8.js?v=${VERSION}`,
              '',
              6000,
            );
          }

          if (isMobile) {
            void optionalInnerModule(
              doc,
              'ptbo-directional-drive-zoom-loader',
              `../response-simulator/directional-drive-zoom-1.5.8.js?v=${VERSION}`,
              '',
              6000,
            );
            void optionalInnerModule(
              doc,
              'ptbo-mobile-ui-layout-loader',
              `../response-simulator/mobile-ui-layout-1.5.9.js?v=${VERSION}`,
              '',
              6000,
            );
          }

          await optionalInnerModule(
            doc,
            'ptbo-satellite-map-loader',
            `../response-simulator/satellite-map-1.5.6.js?v=${VERSION}`,
            '',
            10000,
          );

          if (game.PTBO_SATELLITE_MAP_READY) {
            await Promise.race([
              Promise.resolve(game.PTBO_SATELLITE_MAP_READY).catch(error => traceWarn('Satellite map readiness rejected', error)),
              sleep(10000).then(() => traceWarn('Satellite map readiness timed out; continuing')),
            ]);
          }

          enhancementStage('complete', city?.name || selectedCityId());
          traceOk('Enhancement loader complete');
        } catch (error) {
          enhancementStage('failed', error?.message || String(error));
          traceWarn('Response enhancement bootstrap failed', error);
          console.error('Response enhancement bootstrap failed.', error);
        }
      })();
      return installPromise;
    };

    frame.addEventListener('load', () => {
      installPromise = null;
      installedDocument = null;
      installInsideFrame();
    });
    if (frame.contentDocument?.readyState === 'complete') setTimeout(installInsideFrame, 0);
  }

  function installPageEnhancements() {
    installDeviceSurfaceApi();
    installBadge();
    const isMobile = /\/response-simulator\/mobile\/(?:index\.html)?$/.test(location.pathname);
    if (isMobile && !document.getElementById('ptbo-mobile-dispatch-hud-loader')) {
      const script = document.createElement('script');
      script.id = 'ptbo-mobile-dispatch-hud-loader';
      script.src = new URL(`mobile-dispatch-hud-1.5.5.js?v=${VERSION}`, SCRIPT_URL).href;
      script.async = true;
      document.head.appendChild(script);
    }
    installCitySelector();
    installResponseEnhancements();
  }

  enhancementStage('started', LABEL);
  if (document.body) installPageEnhancements();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installPageEnhancements, {once:true});
  } else if (!document.body) {
    installPageEnhancements();
  }
  console.info(`Production build ${LABEL} initialized with city runtime protocol v${CITY_RUNTIME_VERSION}.`);
})();