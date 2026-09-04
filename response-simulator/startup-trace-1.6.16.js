/* Live startup trace panel for Dispatch Simulator loading screens — v1.6.16. */
(() => {
  'use strict';

  const VERSION = '1.6.16';
  if (window.PTBO_STARTUP_TRACE?.version === VERSION) return;

  const frame = document.getElementById('simulator');
  const loading = document.getElementById('loading') || document.getElementById('loading-cover');
  if (!frame || !loading) return;

  const startedAt = performance.now();
  const entries = [];
  const seenErrors = new Set();
  let lastStateKey = '';
  let lastEnhancementKey = '';
  let lastStateChangedAt = performance.now();
  let monitorTimer = 0;
  let attachedGame = null;
  let stopped = false;

  const shell = loading.firstElementChild || loading.appendChild(document.createElement('div'));
  shell.classList.add('ptbo-startup-shell');

  const style = document.createElement('style');
  style.id = 'ptbo-startup-trace-style';
  style.textContent = `
    .ptbo-startup-shell{width:min(760px,calc(100vw - 32px));max-width:100%;display:flex;flex-direction:column;align-items:stretch;text-align:center}
    #ptbo-startup-trace{margin:16px auto 0;width:100%;overflow:hidden;text-align:left;border:1px solid rgba(148,163,184,.36);border-radius:12px;background:#050b14;color:#dbeafe;box-shadow:inset 0 1px rgba(255,255,255,.04);font-family:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}
    #ptbo-startup-trace .trace-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px;border-bottom:1px solid rgba(148,163,184,.22);background:#0b1523;color:#e2e8f0;font-size:10px;font-weight:850;letter-spacing:.06em;text-transform:uppercase}
    #ptbo-startup-trace .trace-version{color:#94a3b8;font-weight:700;letter-spacing:0;text-transform:none}
    #ptbo-startup-current{padding:9px 11px;border-bottom:1px solid rgba(148,163,184,.16);color:#fde68a;font-size:10px;font-weight:800;line-height:1.45;overflow-wrap:anywhere}
    #ptbo-startup-current[data-level="ok"]{color:#86efac}
    #ptbo-startup-current[data-level="error"]{color:#fca5a5}
    #ptbo-startup-log{height:min(190px,28vh);margin:0;padding:9px 11px;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;word-break:break-word;color:#cbd5e1;background:#020711;font:600 9px/1.5 ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace}
    #ptbo-startup-log .trace-error{color:#fca5a5}.trace-warn{color:#fde68a}.trace-ok{color:#86efac}.trace-info{color:#bfdbfe}
    @media(max-width:540px){.ptbo-startup-shell{width:min(100%,calc(100vw - 20px))}#ptbo-startup-trace{margin-top:12px}#ptbo-startup-log{height:min(160px,24vh);font-size:8px}.ptbo-startup-shell>strong{font-size:1rem!important}.ptbo-startup-shell>span{font-size:.8rem!important}}
    @media(orientation:landscape) and (max-height:560px){#ptbo-startup-trace{margin-top:8px}#ptbo-startup-log{height:105px}.ptbo-startup-shell>span{margin-top:3px!important}}
  `;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'ptbo-startup-trace';
  panel.setAttribute('aria-label', 'Live startup trace');
  panel.innerHTML = `
    <div class="trace-head"><span>Live startup trace</span><span class="trace-version">v${VERSION}</span></div>
    <div id="ptbo-startup-current" data-level="wait">Starting diagnostic monitor…</div>
    <pre id="ptbo-startup-log" aria-live="polite"></pre>
  `;
  shell.appendChild(panel);

  const currentNode = panel.querySelector('#ptbo-startup-current');
  const logNode = panel.querySelector('#ptbo-startup-log');

  function elapsed() {
    return ((performance.now() - startedAt) / 1000).toFixed(2).padStart(6, ' ');
  }

  function stringifyDetail(detail) {
    if (detail == null || detail === '') return '';
    if (typeof detail === 'string') return detail;
    if (detail instanceof Error || (typeof detail === 'object' && typeof detail?.message === 'string')) return detail.message || String(detail);
    if (typeof detail === 'object' && detail?.error) {
      const nested = stringifyDetail(detail.error);
      if (nested) return nested;
    }
    try { return JSON.stringify(detail); } catch (_) { return String(detail); }
  }

  function append(message, level = 'info', detail = '') {
    const suffix = stringifyDetail(detail);
    const text = `[+${elapsed()}s] ${message}${suffix ? ` — ${suffix}` : ''}`;
    const entry = document.createElement('span');
    entry.className = `trace-${level}`;
    entry.textContent = `${text}\n`;
    logNode.appendChild(entry);
    entries.push({time:performance.now(),message,level,detail:suffix});
    while (logNode.childNodes.length > 80) logNode.firstChild.remove();
    logNode.scrollTop = logNode.scrollHeight;
    return text;
  }

  function setCurrent(message, level = 'wait') {
    currentNode.dataset.level = level;
    currentNode.textContent = message;
  }

  function mark(message, detail = '') { append(message, 'info', detail); }
  function ok(message, detail = '') { append(message, 'ok', detail); }
  function warn(message, detail = '') { append(message, 'warn', detail); }
  function fail(message, error) {
    const reason = stringifyDetail(error);
    const key = `${message}|${reason}`;
    if (!seenErrors.has(key)) {
      seenErrors.add(key);
      append(message, 'error', reason);
    }
    setCurrent(`ERROR: ${message}${reason ? ` — ${reason}` : ''}`, 'error');
  }

  function safe(readValue, fallback = null) {
    try { return readValue(); } catch (_) { return fallback; }
  }

  function baseCount(game, mode) {
    return safe(() => game.PTBO_BASE_STORE?.getBases?.(mode)?.length, 0)
      || safe(() => game.PTBO_SERVICE_CONFIG?.profiles?.[mode]?.bases?.length, 0)
      || 0;
  }

  function captureBuildErrors(game) {
    const buildErrors = safe(() => game.PTBO_BUILD_ERRORS, []) || [];
    buildErrors.slice(-8).forEach(item => {
      const message = String(item?.message || item || 'Unknown inner-frame error');
      const source = String(item?.source || 'inner frame');
      const key = `build|${message}|${source}`;
      if (seenErrors.has(key)) return;
      seenErrors.add(key);
      append('Inner-frame build error', 'error', `${message} @ ${source}`);
    });
  }

  function describe(game, doc) {
    if (!doc) return {key:'frame-document-missing',text:'WAITING: iframe document is not available yet.'};
    if (doc.readyState !== 'complete') return {key:`frame-${doc.readyState}`,text:`WAITING: iframe document (${doc.readyState}).`};
    if (!game) return {key:'frame-window-missing',text:'WAITING: iframe window is not available.'};

    const stage = safe(() => game.PTBO_STARTUP_STAGE, null);
    const packageError = safe(() => game.PTBO_CITY_PACKAGE_LOAD_ERROR, null);
    const runtimeError = safe(() => game.PTBO_CITY_RUNTIME_ERROR, null);
    if (packageError) return {key:`package-error:${stringifyDetail(packageError)}`,text:`ERROR: city package failed — ${stringifyDetail(packageError)}`,level:'error'};
    if (runtimeError) return {key:`runtime-error:${stringifyDetail(runtimeError)}`,text:`ERROR: city runtime failed — ${stringifyDetail(runtimeError)}`,level:'error'};

    if (typeof safe(() => game.initializeSimulator, undefined) !== 'function') return {key:'initializeSimulator-missing',text:'WAITING: initializeSimulator() is not defined inside the iframe.'};

    const city = safe(() => game.PTBO_CITY_PACKAGE, null);
    if (!city) return {key:'city-package',text:'WAITING: PTBO_CITY_PACKAGE from service-config.js.'};

    const fireBases = baseCount(game, 'fire');
    const emsBases = baseCount(game, 'ems');
    if (!safe(() => game.PTBO_BASE_STORE, null)) return {key:'base-store',text:`WAITING: PTBO_BASE_STORE for ${city.name || city.id}.`};
    if (!fireBases || !emsBases) return {key:`bases:${fireBases}:${emsBases}`,text:`WAITING: Fire/EMS base data (${fireBases} fire, ${emsBases} EMS).`};
    if (!safe(() => game.PTBO_SERVICE, null)) return {key:'service-runtime',text:'WAITING: PTBO_SERVICE Fire/EMS runtime.'};

    const expected = safe(() => game.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION, null);
    const runtimeVersion = safe(() => game.PTBO_CITY_RUNTIME_READY_VERSION, null);
    const runtimeReady = safe(() => game.PTBO_CITY_RUNTIME_READY, null);
    if (expected && runtimeVersion !== expected) return {key:`runtime-version:${expected}:${runtimeVersion}`,text:`WAITING: city runtime v${expected}; current=${runtimeVersion || 'not started'}.`};
    if (expected && !runtimeReady) return {key:'runtime-promise',text:`WAITING: PTBO_CITY_RUNTIME_READY v${expected}.`};

    if (!safe(() => game.PTBO_SIMULATOR_READY, null)) {
      if (stage?.stage) return {key:`stage:${stage.source || 'inner'}:${stage.stage}:${stage.detail || ''}`,text:`RUNNING: ${stage.source || 'inner'} → ${stage.stage}${stage.detail ? ` — ${stage.detail}` : ''}.`};
      return {key:'simulator-readiness-script',text:'WAITING: simulator-readiness startup gate.'};
    }

    if (stage?.stage && stage.stage !== 'ready') return {key:`stage:${stage.source || 'inner'}:${stage.stage}:${stage.detail || ''}`,text:`RUNNING: ${stage.source || 'inner'} → ${stage.stage}${stage.detail ? ` — ${stage.detail}` : ''}.`};
    if (!safe(() => game.PTBO_VEHICLE_INSTRUMENTS, null)) return {key:'vehicle-instruments',text:'WAITING: vehicle steering API.'};
    if (!safe(() => game.PTBO_COMPACT_SETTINGS?.state?.installed, false)) return {key:'compact-settings',text:'WAITING: compact settings menu installation.'};

    const selected = safe(() => game.PTBO_SERVICE?.state?.selected, false);
    const chooser = document.getElementById('service-choice');
    if (!selected && !chooser?.open) return {key:'service-choice',text:'WAITING: Fire / EMS service chooser.'};
    return {key:'ready',text:selected ? 'READY: simulator startup completed.' : 'READY: service chooser is open.',level:'ok'};
  }

  function attachInnerListeners(game) {
    if (!game || game === attachedGame) return;
    attachedGame = game;
    mark('Iframe window attached');
    try {
      game.addEventListener('error', event => fail('Inner-frame JavaScript error', event?.error || event?.message || 'Unknown script error'), true);
      game.addEventListener('unhandledrejection', event => fail('Inner-frame unhandled rejection', event?.reason || 'Unknown promise rejection'));
      game.addEventListener('ptbo-city-runtime-ready', event => ok('City runtime ready', event.detail));
      game.addEventListener('ptbo-city-runtime-error', event => fail('City runtime error event', event.detail?.error || event.detail));
      game.addEventListener('ptbo-simulator-ready', event => ok('Simulator readiness passed', event.detail));
      game.addEventListener('ptbo-simulator-startup-error', event => fail('Simulator readiness error', event.detail?.error || event.detail));
      game.addEventListener('ptbo-satellite-map-ready', () => ok('Satellite map ready'));
      game.addEventListener('ptbo-satellite-map-error', event => warn('Satellite map reported an error', event.detail?.error || event.detail || 'fallback will be used'));
    } catch (error) {
      warn('Could not attach all inner-frame diagnostic listeners', error);
    }
  }

  function captureEnhancementStage() {
    const stage = safe(() => window.PTBO_ENHANCEMENT_STAGE, null);
    if (!stage?.stage) return;
    const key = `${stage.version || ''}|${stage.stage}|${stage.detail || ''}`;
    if (key === lastEnhancementKey) return;
    lastEnhancementKey = key;
    const level = stage.stage === 'failed' ? 'warn' : stage.stage === 'complete' ? 'ok' : 'info';
    append(`Enhancement loader → ${stage.stage}`, level, stage.detail || '');
  }

  function monitor() {
    if (stopped) return;
    if (!loading.isConnected) {
      stopped = true;
      clearTimeout(monitorTimer);
      return;
    }
    const doc = safe(() => frame.contentDocument, null);
    const game = safe(() => frame.contentWindow, null);
    attachInnerListeners(game);
    captureBuildErrors(game);
    captureEnhancementStage();
    const state = describe(game, doc);
    if (state.key !== lastStateKey) {
      lastStateKey = state.key;
      lastStateChangedAt = performance.now();
      append(state.text, state.level === 'error' ? 'error' : state.level === 'ok' ? 'ok' : 'info');
    }
    const age = ((performance.now() - lastStateChangedAt) / 1000).toFixed(1);
    setCurrent(`${state.text} · unchanged for ${age}s`, state.level || (state.key === 'ready' ? 'ok' : 'wait'));
    monitorTimer = window.setTimeout(monitor, 250);
  }

  frame.addEventListener('load', () => {
    clearTimeout(monitorTimer);
    mark('Iframe load event fired', frame.src);
    attachedGame = null;
    lastStateKey = '';
    monitor();
  });
  window.addEventListener('error', event => fail('Wrapper JavaScript error', event?.error || event?.message || 'Unknown script error'));
  window.addEventListener('unhandledrejection', event => fail('Wrapper unhandled rejection', event?.reason || 'Unknown promise rejection'));
  window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(monitorTimer);
  }, {once:true});

  mark('Startup trace initialized', `city=${frame.dataset.ptboCity || 'unknown'}; frame=${frame.src || 'not assigned'}`);
  monitor();

  window.PTBO_STARTUP_TRACE = Object.freeze({version:VERSION,entries,mark,ok,warn,fail,setCurrent,snapshot:() => ({entries:[...entries],current:currentNode.textContent,frame:frame.src})});
})();
