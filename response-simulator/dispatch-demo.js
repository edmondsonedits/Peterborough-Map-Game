/* Five-call session UI around the shared Fire/EMS mission lifecycle. */
(() => {
  'use strict';
  const city = window.PTBO_CITY_PACKAGE;
  if (!city?.dispatchDemo || window.PTBO_DISPATCH_DEMO) return;
  let session, setupError, dialog;
  try {
    if (city.features?.dispatch !== true || city.dispatch?.available !== true || city.roads?.available !== true || city.features?.sceneResponseDrills) {
      throw new Error('The selected city’s Dispatch demo is unavailable.');
    }
    session = window.PTBO_DISPATCH_DEMO_CORE.createSession({cityId:city.id,callLimit:city.dispatchDemo.callLimit});
  } catch (error) { setupError = error; }

  const host = (() => {try {return window.parent?.document?.body ? window.parent : window;} catch (_) {return window;}})();
  const hostDocument = host.document;
  const home = new URL('../',location.href);
  home.searchParams.set('city',city.id);
  const request = new URL(home.href);
  request.searchParams.set('request','dispatch');
  const state = () => session?.state || {cityId:city.id,callLimit:5,completed:0,remaining:5,finished:false,blocked:true};

  function sync() {
    const progress = document.getElementById('ptbo-dispatch-demo-progress');
    if (progress) {
      progress.hidden = false;
      progress.textContent = setupError ? 'Demo unavailable' : `Demo · ${state().completed}/5 complete`;
    }
    if (state().finished || setupError) {
      const button = document.getElementById('hud-action-btn');
      if (button) {
        button.innerText = setupError ? 'Demo Unavailable' : 'Demo Complete';
        button.disabled = true;
        button.style.opacity = '0.5';
      }
    }
  }

  function releaseInput() {
    window.releaseDrivingInput?.();
    // The outer mobile controls also keep pointer/pressed state; clear it before replay.
    if (host !== window) host.dispatchEvent(new Event('blur'));
  }

  function replay() {
    if (!session) return false;
    session.reset();
    dialog?.close();
    dialog?.remove();
    dialog = null;
    releaseInput();
    window.resetDispatchWorkflow?.();
    const base = window.PTBO_SERVICE?.getBase?.();
    if (base) window.PTBO_SERVICE.spawn(base.number);
    sync();
    hostDocument.getElementById('simulator')?.focus();
    return true;
  }

  function showFinish() {
    if (!state().finished || dialog?.open) return;
    releaseInput();
    if (!hostDocument.getElementById('ptbo-dispatch-demo-style')) {
      const style = hostDocument.createElement('style');
      style.id = 'ptbo-dispatch-demo-style';
      style.textContent = `
        #ptbo-dispatch-demo-finish{box-sizing:border-box;width:min(490px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;margin:auto;padding:28px;border:1px solid #ffffff30;border-radius:22px;background:#101b2b;color:#f8fafc;box-shadow:0 28px 100px #0009;font:14px/1.5 Inter,system-ui,sans-serif}
        #ptbo-dispatch-demo-finish::backdrop{background:#030b18b8;backdrop-filter:blur(4px)}
        #ptbo-dispatch-demo-finish .demo-eyebrow{color:#7dd3fc;font-size:11px;font-weight:850;letter-spacing:.1em;text-transform:uppercase}
        #ptbo-dispatch-demo-finish h2{margin:8px 0;font-size:28px;line-height:1.15;letter-spacing:-.03em}
        #ptbo-dispatch-demo-finish p{color:#cbd5e1;margin:12px 0 22px}
        #ptbo-dispatch-demo-finish .demo-actions{display:grid;gap:9px}
        #ptbo-dispatch-demo-finish button,#ptbo-dispatch-demo-finish a{box-sizing:border-box;display:block;min-height:46px;padding:12px 16px;border:1px solid #ffffff30;border-radius:11px;background:#213248;color:#fff;font:750 14px/1.4 Inter,system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer;touch-action:manipulation}
        #ptbo-dispatch-demo-finish #ptbo-dispatch-demo-replay{background:#0284c7;border-color:#38bdf8}
        #ptbo-dispatch-demo-finish button:focus-visible,#ptbo-dispatch-demo-finish a:focus-visible{outline:3px solid #facc15;outline-offset:3px}
      `;
      hostDocument.head.appendChild(style);
    }
    dialog = hostDocument.createElement('dialog');
    dialog.id = 'ptbo-dispatch-demo-finish';
    dialog.setAttribute('aria-labelledby','ptbo-dispatch-demo-title');
    dialog.setAttribute('aria-describedby','ptbo-dispatch-demo-description');
    const eyebrow = hostDocument.createElement('div');
    eyebrow.className = 'demo-eyebrow';
    eyebrow.textContent = `${city.name} · 5 of 5 calls completed`;
    const title = hostDocument.createElement('h2');
    title.id = 'ptbo-dispatch-demo-title';
    title.textContent = 'Demo complete';
    const description = hostDocument.createElement('p');
    description.id = 'ptbo-dispatch-demo-description';
    description.textContent = 'You’ve completed this five-call session. Replay the demo, choose another city, or request the full version.';
    const actions = hostDocument.createElement('div');
    actions.className = 'demo-actions';
    const replayButton = hostDocument.createElement('button');
    replayButton.id = 'ptbo-dispatch-demo-replay';
    replayButton.type = 'button';
    replayButton.textContent = 'Replay Demo';
    replayButton.addEventListener('click',replay);
    const returnLink = hostDocument.createElement('a');
    returnLink.id = 'ptbo-dispatch-demo-return';
    returnLink.textContent = 'Return to Cities';
    returnLink.href = home.href;
    const requestLink = hostDocument.createElement('a');
    requestLink.id = 'ptbo-dispatch-demo-request';
    requestLink.textContent = 'Request full version';
    requestLink.href = request.href;
    actions.append(replayButton,returnLink,requestLink);
    dialog.append(eyebrow,title,description,actions);
    dialog.addEventListener('cancel',event=>event.preventDefault());
    hostDocument.body.appendChild(dialog);
    dialog.showModal();
    replayButton.focus();
  }

  function pool(includeCompleted=false) {
    if (!session) throw setupError;
    const store = window.parent?.PTBO_DISPATCH_STORE || window.PTBO_DISPATCH_STORE;
    const service = window.PTBO_SERVICE?.state.mode;
    const base = window.PTBO_SERVICE?.getBase?.();
    if (store?.cityId !== city.id || !base || !window.PTBO_LOCAL_RESPONSE_POOL) throw new Error('The city’s demo call data is still loading.');
    const original = city.serviceConfig?.profiles?.[service]?.bases?.find(item=>item.id===base.id);
    if (!original || Number(base.lat)!==Number(original.lat) || Number(base.lng)!==Number(original.lng) ||
        Number(base.spawnLat)!==Number(original.spawnLat ?? original.lat) || Number(base.spawnLng)!==Number(original.spawnLng ?? original.lng)) {
      throw new Error('The selected base has moved. Restore its original location before starting this demo.');
    }
    const training = store.getTrainingData();
    const calls = window.PTBO_LOCAL_RESPONSE_POOL.localPool(training,store.getAll(),{cityId:city.id,id:base.id,service});
    return session.candidates(training,calls,{cityId:city.id,baseId:base.id,service},{includeCompleted});
  }

  window.PTBO_DISPATCH_DEMO = Object.freeze({
    get state() {return state();},
    sync,pool,replay,
    canDispatch:() => {
      if (setupError) {alert(setupError.message);return false;}
      if (state().finished) {sync();showFinish();return false;}
      return session.canStart();
    },
    started:mission => session?.start({...mission,cityId:city.id,baseId:window.PTBO_SERVICE.getBase().id,callId:mission.scene.id}) || false,
    cancel:() => {session?.cancel();sync();},
    completed:mission => {
      if (!session?.complete({cityId:city.id,generation:mission.generation})) return false;
      sync();
      showFinish();
      return true;
    },
  });
  window.addEventListener('ptbo-service-change',sync);
  window.addEventListener('ptbo-service-base-change',sync);
  sync();
})();
