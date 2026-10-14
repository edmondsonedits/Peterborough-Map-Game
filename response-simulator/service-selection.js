/* Shared Fire/EMS chooser. Waits for the selected city's authoritative runtime and base data. */
(() => {
  'use strict';
  const VERSION = '1.6.16-hotfix1';
  if (window.PTBO_SERVICE_SELECTION?.version === VERSION) return;

  let dialog = null;
  let opening = null;
  const sourceUrl = new URL(document.currentScript?.src || document.baseURI, document.baseURI);

  function exitToLauncher(game, chooseCity = true) {
    game.releaseDrivingInput?.();
    const url = new URL('../', sourceUrl);
    url.searchParams.set(chooseCity ? 'chooseCity' : 'focus', chooseCity ? '1' : 'dispatch');
    url.hash = 'dispatch-start';
    // Keep the required chooser open and service unselected until navigation.
    // The launcher restores focus or reopens the city chooser for every entry URL.
    try { window.top.location.assign(url.href); }
    catch (_) { window.location.assign(url.href); }
  }
  const sleep = milliseconds => new Promise(resolve => setTimeout(resolve,milliseconds));
  const trace = (message, detail = '') => window.PTBO_STARTUP_TRACE?.mark?.(message, detail);
  const traceOk = (message, detail = '') => window.PTBO_STARTUP_TRACE?.ok?.(message, detail);
  const traceWarn = (message, detail = '') => window.PTBO_STARTUP_TRACE?.warn?.(message, detail);

  async function runtimeReady(game) {
    const expected = game.PTBO_CITY_RUNTIME_BOOTSTRAP_EXPECTED_VERSION;
    if (!expected) return null;
    trace('Service chooser: waiting for city runtime', `v${expected}`);
    const started = performance.now();
    while (game.PTBO_CITY_RUNTIME_READY_VERSION !== expected || !game.PTBO_CITY_RUNTIME_READY) {
      if (performance.now() - started > 20000) throw new Error(`City runtime ${expected} did not start.`);
      await sleep(40);
    }
    const detail = await game.PTBO_CITY_RUNTIME_READY;
    if (game.PTBO_CITY_RUNTIME_ERROR) throw game.PTBO_CITY_RUNTIME_ERROR;
    traceOk('Service chooser: city runtime ready', detail?.cityId || 'unknown city');
    return detail;
  }

  async function cityBasesReady(game) {
    await runtimeReady(game);
    const city = game.PTBO_CITY_PACKAGE;
    if (!city) throw new Error('The selected city package did not load.');
    trace('Service chooser: validating Fire/EMS bases', city.name || city.id);
    const packageReady = game.PTBO_CITY_PACKAGE_READY;
    if (packageReady && typeof packageReady.then === 'function') await packageReady;
    if (game.PTBO_CITY_PACKAGE_LOAD_ERROR) throw game.PTBO_CITY_PACKAGE_LOAD_ERROR;
    game.PTBO_BASE_STORE?.refreshFromCityPackage?.();
    const fire = game.PTBO_BASE_STORE?.getBases?.('fire') || game.PTBO_SERVICE_CONFIG?.profiles?.fire?.bases || [];
    const ems = game.PTBO_BASE_STORE?.getBases?.('ems') || game.PTBO_SERVICE_CONFIG?.profiles?.ems?.bases || [];
    if (!fire.length || !ems.length) throw new Error(`${city.name} Fire/EMS base locations are unavailable.`);
    traceOk('Service chooser: base data ready', `${fire.length} fire / ${ems.length} EMS`);
    return {city,fire,ems};
  }

  function ready(game) {
    trace('Service chooser: readiness started');
    // The chooser only needs authoritative city/base data. Satellite imagery is an
    // optional enhancement and has its own independent startup/fallback path.
    // Waiting for it here made base-training startup wait twice (ready + open),
    // leaving the loading cover on screen even though the simulator was usable.
    return cityBasesReady(game);
  }

  async function open(game) {
    if (dialog?.open || game.PTBO_SERVICE?.state.selected) return;
    if (opening) return opening;

    game.releaseDrivingInput?.();
    trace('Service chooser: opening');
    opening = (async () => {
      const {city,fire,ems} = await ready(game);
      if (dialog?.open || game.PTBO_SERVICE?.state.selected) return;
      if (!game.PTBO_SERVICE) throw new Error('Fire / EMS controls did not load.');

      const baseTraining = city.features?.baseTraining === true || city.dispatch?.available === false;
      const style = document.getElementById('ptbo-service-choice-style') || document.createElement('style');
      style.id = 'ptbo-service-choice-style';
      style.textContent = `
        #service-choice{box-sizing:border-box;width:min(600px,calc(100vw - 28px));max-height:calc(100dvh - 32px);overflow:auto;margin:auto;padding:28px;border:1px solid #ffffff2b;border-radius:22px;background:#101b2bf5;color:#f8fafc;box-shadow:0 28px 100px #0009;font-family:var(--ptbo-font,system-ui,sans-serif)}
        #service-choice::backdrop{background:#030b1859;backdrop-filter:blur(2px)}
        #service-choice h1{font-size:clamp(24px,5vw,32px);margin:5px 0 10px;letter-spacing:-.035em}
        #service-choice p{color:#cbd5e1;line-height:1.5;margin:0 0 22px;font-size:16px}
        #service-choice .service-eyebrow{color:#8eacc9;font-size:13px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
        #service-choice .service-mode-note{margin:-9px 0 18px;padding:9px 11px;color:#fde68a;border:1px solid #facc1538;border-radius:10px;background:#713f121f;font-size:14px;font-weight:750}
        #service-choice .service-choices{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        #service-choice button{min-height:148px;padding:20px;text-align:left;border:1px solid #ffffff30;border-radius:16px;color:#fff;background:#213248;font:inherit;cursor:pointer;touch-action:manipulation}
        #service-choice button[data-service=fire]{background:linear-gradient(140deg,#5b2630,#251c2c)}
        #service-choice button[data-service=ems]{background:linear-gradient(140deg,#164b66,#142737)}
        #service-choice button:focus-visible{outline:3px solid #facc15;outline-offset:3px}
        #service-choice button:hover{border-color:#ffffffa0}
        #service-choice button strong{display:block;font-size:26px;margin:8px 0}
        #service-choice button span{display:block;color:#e2e8f0;font-size:14px;line-height:1.55}
        #service-choice .service-footnote{margin:20px 0 0;font-size:14px;color:#b4c3d4}
        #service-choice .service-exits{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
        #service-choice .service-exits button{min-height:48px;padding:10px 16px;background:var(--ptbo-elevated,#1b2c44);border-radius:10px;text-align:center;font-size:16px}
        .station-button[hidden]{display:none!important}
        html[data-service=ems] .station-button.active{border-color:#38bdf8;background:#075985}
        @media(max-width:380px){#service-choice{padding:20px}#service-choice button{padding:14px}}
        @media(max-height:420px){#service-choice{padding:18px}#service-choice button{min-height:100px;padding:12px}#service-choice p{margin-bottom:10px}#service-choice .service-footnote{margin-top:10px}}
      `;
      if (!style.isConnected) document.head.appendChild(style);

      dialog?.remove();
      dialog = document.createElement('dialog');
      dialog.id = 'service-choice';
      dialog.setAttribute('aria-labelledby','service-choice-title');
      dialog.setAttribute('aria-describedby','service-choice-description');
      dialog.innerHTML = `<div class="service-eyebrow">${city.name} ${baseTraining ? 'Free driving' : 'Dispatch Simulator'}</div>
        <h1 id="service-choice-title">Choose your service</h1>
        <p id="service-choice-description">Choose the vehicle and response base you want to start from.</p>
        ${baseTraining ? '<div class="service-mode-note">Free driving is available from Fire and EMS bases. Dispatch scenarios are coming later.</div>' : ''}
        <div class="service-choices">
          <button type="button" data-service="fire" aria-label="Fire"><strong>Fire</strong><span>Fire truck · ${fire.length} station${fire.length===1?'':'s'}<br>${baseTraining ? 'Free-drive base training' : 'Respond to the scene'}</span></button>
          <button type="button" data-service="ems" aria-label="EMS"><strong>EMS</strong><span>Ambulance · ${ems.length} base${ems.length===1?'':'s'}<br>${baseTraining ? 'Free-drive base training' : 'Scene → hospital'}</span></button>
        </div><p class="service-footnote">You can change services or bases in Options at any time.</p>
        <nav class="service-exits" aria-label="Leave service selection"><button type="button" id="service-back-cities">← Back to cities</button><button type="button" id="service-all-games">All games</button></nav>`;
      dialog.addEventListener('cancel',event => { event.preventDefault(); exitToLauncher(game); });
      dialog.querySelector('#service-back-cities').addEventListener('click',() => exitToLauncher(game));
      dialog.querySelector('#service-all-games').addEventListener('click',() => exitToLauncher(game,false));
      dialog.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click',() => {
        if (!game.PTBO_SERVICE.select(button.dataset.service)) return;
        dialog.close();
        dialog.remove();
        (document.getElementById('simulator') || document.getElementById('map'))?.focus();
      }));
      document.body.appendChild(dialog);
      dialog.showModal();
      traceOk('Service chooser opened', `${city.name}; ${baseTraining ? 'base training' : 'dispatch'}`);
    })().finally(() => { opening = null; });
    return opening;
  }

  window.PTBO_SERVICE_SELECTION = Object.freeze({version:VERSION,open,ready,cityBasesReady,runtimeReady});
})();
