/* Incident filter controls for station-local response exercises. */
(() => {
  'use strict';
  if (!window.PTBO_CITY_PACKAGE?.features?.sceneResponseDrills) return;
  const preferences=new Map();
  function update() {
    const store=parent.PTBO_DISPATCH_STORE, service=window.PTBO_SERVICE?.state.mode;
    const data=store?.getTrainingData?.();
    if(!data || !service) return;
    const base=window.PTBO_SERVICE?.getBase?.();
    const calls=window.PTBO_LOCAL_RESPONSE_POOL?.localPool(data,store.getAll(),{cityId:store.cityId,id:base?.id,service}) || [];
    const types=new Set(calls.map(c=>c.incidentProfiles?.[service]?.sub || c.sub));
    const groups=[...document.querySelectorAll('.sub-cat-group')];
    const target=groups[service==='fire'?0:1];
    for(const type of types){
      if([...document.querySelectorAll('.filter-chk')].some(box=>box.dataset.sub===type)) continue;
      const label=document.createElement('label'),box=document.createElement('input');
      label.className='checkbox-row';box.type='checkbox';box.className='filter-chk';box.dataset.sub=type;box.checked=true;label.append(box,document.createTextNode(' '+type));target?.append(label);
    }
    document.querySelectorAll('.filter-chk').forEach(box=>{
      const visible=types.has(box.dataset.sub); const label=box.closest('label');
      if(label)label.hidden=!visible;
      box.disabled=!visible;
      if(visible)box.checked=preferences.has(service+':'+box.dataset.sub)?preferences.get(service+':'+box.dataset.sub):true;
      else box.checked=false;
      if(!box.dataset.sceneFilterListener){box.dataset.sceneFilterListener='true';box.addEventListener('change',()=>{if(!box.disabled)preferences.set(window.PTBO_SERVICE.state.mode+':'+box.dataset.sub,box.checked);});}
    });
    groups.forEach(group=>{const header=group.previousElementSibling;if(header)header.hidden=!group.querySelector('.filter-chk:not(:disabled)');});
  }
  window.addEventListener('ptbo-service-change',update);
  window.addEventListener('ptbo-service-base-change',update);
  parent.PTBO_DISPATCH_STORE?.ready?.().then(update).catch(()=>{});
  update();
})();
