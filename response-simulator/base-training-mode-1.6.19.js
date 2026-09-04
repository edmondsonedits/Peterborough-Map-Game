/* Base-training mode for cities that have Fire/EMS bases but no dispatch-call database yet. */
(() => {
  'use strict';
  const VERSION = '1.6.19';
  if (window.PTBO_BASE_TRAINING_MODE?.version === VERSION) return;

  const city = window.PTBO_CITY_PACKAGE;
  const active = Boolean(city?.features?.baseTraining || city?.dispatch?.available === false);
  const state = {active,ready:false,cityId:city?.id || null};
  if (!active) {
    window.PTBO_BASE_TRAINING_MODE = Object.freeze({version:VERSION,state,apply:()=>false});
    return;
  }

  document.documentElement.dataset.baseTraining = 'true';
  document.documentElement.dataset.dispatchAvailable = 'false';

  const escapeText = value => {
    const span=document.createElement('span');
    span.textContent=String(value ?? '');
    return span.innerHTML;
  };

  function disableDispatchControls() {
    const action=document.getElementById('hud-action-btn');
    if(action){
      action.textContent='Calls Unavailable';
      action.disabled=true;
      action.className='hud-btn';
      action.style.opacity='0.55';
      action.title=`Dispatch calls are not available for ${city.name} yet.`;
      action.setAttribute('aria-disabled','true');
    }

    document.querySelectorAll('.filter-chk').forEach(box=>{
      box.checked=false;
      box.disabled=true;
      box.closest('label')?.setAttribute('title',`${city.name} dispatch calls are unavailable.`);
    });

    const unavailableButtons=[
      document.getElementById('btn-toggle-locations'),
      ...document.querySelectorAll('button[onclick*="recordCurrentLocation"],button[onclick*="exportUpdatedDatabase"]'),
    ].filter(Boolean);
    unavailableButtons.forEach(button=>{
      button.disabled=true;
      button.style.opacity='0.45';
      button.title=`Dispatch-call editing is unavailable in ${city.name} base training.`;
      button.setAttribute('aria-disabled','true');
    });
  }

  function updateCallSectionLabels() {
    const incidentHeading=[...document.querySelectorAll('.section-title')].find(node=>node.textContent.trim()==='Incident Types');
    if(incidentHeading) incidentHeading.textContent='Incident Types — Calls Unavailable';
    const customHeading=[...document.querySelectorAll('.section-title')].find(node=>node.textContent.trim()==='Custom Dispatch Logging');
    if(customHeading) customHeading.textContent='Dispatch Logging — Unavailable';
  }

  function showHud() {
    const content=document.getElementById('hud-content');
    if(!content)return;
    const service=window.PTBO_SERVICE;
    const selected=Boolean(service?.state?.selected);
    const profile=selected?service.getProfile?.():null;
    const base=selected?service.getBase?.():null;
    if(selected&&profile&&base){
      content.innerHTML=`
        <div class="hud-title">${escapeText(profile.label.toUpperCase())} / BASE TRAINING · ${escapeText(city.name.toUpperCase())}</div>
        <p class="hud-address">${escapeText(base.name)}</p>
        <div class="hud-meta">${escapeText(base.address)} · Dispatch calls unavailable · Free driving enabled.</div>`;
    } else {
      content.innerHTML=`
        <div class="hud-title">BASE TRAINING · ${escapeText(city.name.toUpperCase())}</div>
        <p class="hud-address">Choose Fire or EMS</p>
        <div class="hud-meta">All available response bases can be used for spawning and free driving. Dispatch calls are not available yet.</div>`;
    }
    const hud=document.getElementById('dispatch-hud');
    if(hud)hud.className='';
    const clock=document.getElementById('hud-clock');
    if(clock)clock.textContent='--';
    const distance=document.getElementById('tel-dist');
    if(distance)distance.textContent='--';
  }

  // UI-only application. Do not refresh the base store here: refreshFromCityPackage()
  // emits ptbo-bases-updated, and this module also listens for that event. Refreshing
  // inside apply() therefore created an infinite microtask loop in v1.6.18.
  let applying=false;
  function apply() {
    if(!active || applying)return false;
    applying=true;
    try {
      window.PTBO_SERVICE?.updateControls?.();
      disableDispatchControls();
      updateCallSectionLabels();
      showHud();
      state.ready=true;
      return true;
    } finally {
      applying=false;
    }
  }

  const blockedDispatch=()=>{apply();return false;};
  window.triggerDispatchWorkflow=blockedDispatch;
  window.fireRandomIncidentDispatch=blockedDispatch;
  window.toggleAllLocations=blockedDispatch;
  window.recordCurrentLocation=blockedDispatch;
  window.exportUpdatedDatabase=blockedDispatch;

  const originalSetDispatchAction=window.setDispatchAction;
  if(typeof originalSetDispatchAction==='function'){
    window.setDispatchAction=function baseTrainingDispatchAction(){
      const result=originalSetDispatchAction.call(this,'Calls Unavailable',true);
      disableDispatchControls();
      return result;
    };
  }

  const originalReset=window.resetDispatchWorkflow;
  if(typeof originalReset==='function'){
    window.resetDispatchWorkflow=function baseTrainingReset(...args){
      const result=originalReset.apply(this,args);
      queueMicrotask(apply);
      return result;
    };
  }

  function queueApply(){queueMicrotask(apply);}
  window.addEventListener('ptbo-city-package-data-ready',queueApply);
  window.addEventListener('ptbo-bases-updated',queueApply);
  window.addEventListener('ptbo-service-change',queueApply);
  document.addEventListener('change',event=>{
    if(event.target?.id==='service-select')queueApply();
  });
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#service-spawns,.station-spawn-box'))queueApply();
  });
  try {
    parent.document.addEventListener('click',event=>{
      if(event.target?.closest?.('.station-shortcuts'))queueApply();
    });
  } catch (_) {}

  const ready=(async()=>{
    if(window.PTBO_CITY_PACKAGE_READY?.then)await window.PTBO_CITY_PACKAGE_READY;
    window.PTBO_BASE_STORE?.refreshFromCityPackage?.();
    apply();
    window.dispatchEvent(new CustomEvent('ptbo-base-training-ready',{detail:{version:VERSION,cityId:city.id,fireBases:window.PTBO_BASE_STORE?.getBases?.('fire')?.length||0,emsBases:window.PTBO_BASE_STORE?.getBases?.('ems')?.length||0}}));
    return window.PTBO_BASE_TRAINING_MODE;
  })();

  window.PTBO_BASE_TRAINING_MODE=Object.freeze({version:VERSION,state,apply,ready});
  ready.catch(error=>console.error(`${city.name} base-training mode failed to initialize.`,error));
})();
