/* Resolve the current city before any editor module captures its stores. */
(() => {
  'use strict';
  function loadModule(url) {
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      const timer=setTimeout(()=>{script.remove();reject(new Error('The editor took too long to load.'));},20000);
      script.src=url;script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(new Error('An editor module could not load.'));};document.head.appendChild(script);
    });
  }
  window.PTBO_EDITOR_CITY_READY=window.PTBO_CITY_LOCATION_RUNTIME
    ? window.PTBO_CITY_LOCATION_RUNTIME.load({context:'editor'})
    : Promise.reject(new Error('City data loader could not load. Reload to try again.'));
  window.PTBO_EDITOR_READY=window.PTBO_EDITOR_CITY_READY.then(async city=>{
    const hospital=window.PTBO_BASE_STORE.getHospital();
    const roadEditing=Boolean(city.roads?.available && city.roads.dataUrl);
    window.PTBO_EDITOR_CAPABILITIES=Object.freeze({bases:roadEditing,hospital:roadEditing && Boolean(hospital && !hospital.disabled)});
    for(const module of document.querySelectorAll('script[data-editor-module]')) {
      const capability=module.dataset.editorModule;
      if(capability!=='main'&&!window.PTBO_EDITOR_CAPABILITIES[capability])continue;
      await loadModule(module.src);
    }
    await window.PTBO_EDITOR_UI_READY;
    return city;
  }).catch(error=>{
    console.error('Dispatch Editor could not load.',error);
    document.getElementById('save-status').textContent=error.message || 'City data could not load. Please try again.';
    const retry=document.getElementById('editor-load-retry');if(retry)retry.hidden=false;
    return false;
  });
})();
