/* Stable City Explorer release marker. Release identity comes only from shared/build-version.js. */
(() => {
  'use strict';
  const VERSION = window.PTBO_BUILD?.version;
  if (!VERSION) { console.error('City Explorer release marker requires shared/build-version.js first.'); return; }
  const validStationNumbers = ['1', '2', '3'];
  const params = new URLSearchParams(location.search);
  const activeStation = validStationNumbers.includes(params.get('station')) ? params.get('station') : '1';

  window.PTBO_CITY_EXPLORER_BUILD = Object.freeze({ version: VERSION, label: `v${VERSION}` });
  window.PTBO_SELECTED_FIRE_STATION = Number(activeStation);
  document.documentElement.dataset.cityExplorerBuild = VERSION;
  document.documentElement.dataset.fireStation = activeStation;
  document.title = document.title.replace(/v\d+\.\d+\.\d+/i, `v${VERSION}`);

  const syncBadge = () => {
    const badge = document.getElementById('ptbo-build-badge');
    if (!badge) return false;
    badge.textContent = `v${VERSION}`;
    badge.dataset.cityExplorerBuild = VERSION;
    badge.setAttribute('aria-label', `City Explorer version ${VERSION}`);
    return true;
  };

  const installStationSelector=()=>{
    const panel=document.querySelector('.control-panel');if(!panel)return false;
    if(document.getElementById('station-select'))return true;
    const select=document.createElement('select');select.id='station-select';select.className='hud-button';select.setAttribute('aria-label','Vehicle');select.disabled=true;
    for(const [value,name] of [['pump-1','Pump 1'],['pump-2','Pump 2'],['pump-3','Pump 3'],['aerial','Aerial'],['medi','Medi']]){const o=document.createElement('option');o.value=value;o.textContent=name;select.append(o);}
    const status=document.createElement('span');status.id='station-select-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const api=()=>globalThis.__PTBO_GAMEPLAY__;
    function reflect(){const a=api(),s=a?.state();if(!s)return;select.value=s.activeVehicleId||'pump-'+s.stationNumber;select.disabled=!s.canSwitchStations;select.setAttribute('aria-busy',String(Boolean(s.transition?.busy)));}
    select.onchange=async()=>{const id=select.value;select.disabled=true;select.setAttribute('aria-busy','true');status.textContent='Loading vehicle…';try{const result=await api().selectVehicle(id);status.textContent=result?.ok===false?(result.error||'Selection cancelled'):'';}catch(e){status.textContent=e.message;}finally{reflect();}};
    const play=document.getElementById('play-mode');panel.insertBefore(select,play?.nextSibling||null);panel.append(status);
    window.addEventListener('ptbo:gameplay-ready',reflect);window.addEventListener('ptbo:vehicle-selected',reflect);reflect();return true;
  };

  if (!syncBadge() || !installStationSelector()) {
    const observer = new MutationObserver(() => {
      const badgeReady = syncBadge();
      const selectorReady = installStationSelector();
      if (badgeReady && selectorReady) observer.disconnect();
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  }
})();
