/* Address-only Geo Guesser. Recognition tiers never depend on a base or distance. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const tiers=['easy','medium','hard'];
  const title=t=>t[0].toUpperCase()+t.slice(1);
  const read=(key,fallback)=>{try{return localStorage.getItem(key)??fallback;}catch(_){return fallback;}};
  const save=(key,value)=>{try{localStorage.setItem(key,String(value));}catch(_){/* Preferences still work for this visit. */}};
  const state={ready:false,peterborough:false,service:null,difficulty:null,base:null,bases:[],locations:[],pool:[],session:null,target:null,map:null,layers:null,review:null,crossStreetsExpanded:null,showCrossStreets:read('geoShowCrossStreets','true')!=='false'};
  const compactPhone=()=>state.peterborough&&Boolean(window.matchMedia?.('(max-width:760px), (pointer:coarse)').matches);
  const isCurrentBase=base=>state.base?.id!=null?base.id===state.base.id:
    base.name===state.base?.name&&base.address===state.base?.address&&base.lat===state.base?.lat&&base.lng===state.base?.lng;
  function screen(id){$('practice-bases').open=false;for(const name of ['station-practice','settings','game'])$(name).hidden=name!==id;$('game-home').hidden=id==='game';$('practice-controls').classList[id==='game'?'remove':'add']('hidden');}
  function focusMap(){state.map?.getContainer?.()?.focus?.({preventScroll:true});}
  function focusBaseOrService(){
    const selectedIndex=state.bases.findIndex(isCurrentBase);
    const selected=selectedIndex>=0?$(`practice-base-${selectedIndex}`):null;
    (selected&&!selected.disabled?selected:$('service-'+state.service))?.focus?.();
  }
  function bases(){return window.PTBO_BASE_STORE?.getBases(state.service)||window.PTBO_CITY_PACKAGE?.serviceConfig?.profiles?.[state.service]?.bases||[];}
  function renderBaseMenu(){
    if(!state.peterborough)return;
    $('practice-base-options').replaceChildren(...state.bases.map((base,index)=>{
      const button=document.createElement('button');button.className='base-option';button.setAttribute('aria-pressed',String(isCurrentBase(base)));
      const name=document.createElement('strong');name.textContent=base.name;
      const address=document.createElement('span');address.textContent=base.address;
      button.appendChild(name);button.appendChild(address);button.addEventListener('click',()=>chooseBase(index));return button;
    }));
  }
  function chooseBase(index){
    if(!state.peterborough||!state.session||!Number.isInteger(index))return false;
    const available=bases(),chosen=available[index];if(!chosen)return false;
    state.base=chosen;state.bases=available;renderBaseMenu();$('practice-bases').open=false;returnToBase();return true;
  }
  function updateDifficultyCounts(){
    if(!state.ready)return;
    for(const tier of tiers)$('count-'+tier).textContent=String(window.PTBO_STATION_PRACTICE.serviceLocations(state.locations,state.service||'fire',tier).length);
  }
  function chooseService(service){
    if(!['fire','ems'].includes(service))return;
    state.service=service;state.difficulty=null;
    for(const s of ['fire','ems'])$('service-'+s).setAttribute('aria-pressed',String(s===service));
    $('ems-priority-note').hidden=service!=='ems';updateDifficultyCounts();
    for(const tier of tiers)$('difficulty-'+tier).setAttribute('aria-pressed','false');
    $('difficulty-step').hidden=false;$('base-step').hidden=true;
  }
  function chooseDifficulty(tier){
    if(!state.service||!tiers.includes(tier))return;
    state.difficulty=tier;
    for(const t of tiers)$('difficulty-'+t).setAttribute('aria-pressed',String(t===tier));
    renderBases();
  }
  function renderBases(){
    if(!state.difficulty)return;
    state.bases=bases();renderBaseMenu();const host=$('practice-stations');
    host.replaceChildren(...state.bases.map((base,index)=>{
      const button=document.createElement('button');button.id=`practice-base-${index}`;button.className='base-button';button.disabled=!state.ready;
      const name=document.createElement('strong');name.textContent=base.name;
      const address=document.createElement('span');address.textContent=base.address;
      button.appendChild(name);button.appendChild(address);button.addEventListener('click',()=>start(index));return button;
    }));
    const future=(window.PTBO_CITY_PACKAGE?.futureBases||[]).filter(base=>base.service===state.service);
    $('future-base-details').hidden=!future.length;
    $('future-base-list').replaceChildren(...future.map(base=>{
      const row=document.createElement('li'),status=base.status==='planned'?(base.constructionStage||'planned').replace(/-/g,' '):'unconfirmed';
      row.textContent=`${base.name} · ${base.address || 'Address pending'} · ${status}${base.expectedOpening?' · Expected: '+base.expectedOpening:''}`;return row;
    }));
    $('base-step').hidden=false;
    if(state.ready)$('practice-setup-status').textContent=state.bases.length?'':'No bases are available for this service.';
  }
  function clearReview(){
    if(state.layers){state.layers.clearLayers();state.map.removeLayer(state.layers);state.layers=null;}
    state.review=null;$('practice-review').hidden=true;
  }
  function updateCrossStreets(reveal=false){
    const streets=state.target?.crossStreets||[],visible=state.peterborough?
      (state.crossStreetsExpanded??(state.showCrossStreets&&!compactPhone())):state.showCrossStreets||reveal;
    $('call-cross-streets').textContent=streets.length?'Cross streets: '+streets.join(' · '):'Cross streets unavailable';
    $('call-cross-streets').hidden=!visible;
    $('reveal-cross-streets').hidden=!state.peterborough&&(visible||!streets.length);
    $('reveal-cross-streets').textContent=visible?'Hide cross streets':'Show cross streets';
    $('reveal-cross-streets').setAttribute('aria-expanded',String(visible));
  }
  function revealCrossStreets(){
    if(state.peterborough)state.crossStreetsExpanded=$('call-cross-streets').hidden;
    updateCrossStreets(true);
  }
  function setCrossStreets(value){state.crossStreetsExpanded=null;state.showCrossStreets=Boolean(value);save('geoShowCrossStreets',state.showCrossStreets);$('show-cross-streets').checked=state.showCrossStreets;updateCrossStreets();}
  function loadTarget(target){
    clearReview();state.target=target;state.crossStreetsExpanded=null;$('practice-bases').open=false;
    const actualDifficulty=target?.recognitionDifficulty||state.difficulty;
    $('call-type').textContent=target?.facilityType==='long-term-care'?`Care home · ${title(actualDifficulty)}`:title(actualDifficulty);
    $('call-name').textContent=target.name;$('call-name').hidden=!target.name;
    $('call-address').textContent=target.addr;updateCrossStreets();
    $('practice-feedback').textContent=state.peterborough?'':'Pan and zoom to place the crosshair over this address.';
    $('confirm').textContent='Check location';$('confirm').hidden=false;
    $('reticle').hidden=false;$('practice-reveal').hidden=false;$('practice-continue').hidden=false;
    state.map.stop().setView([state.base.lat,state.base.lng],18,{animate:false});focusMap();
  }
  function start(index){
    if(!state.ready||!state.service||!state.difficulty||!window.PTBO_GEO_MAP_PROVIDER?.requireReady?.())return false;
    const chosen=bases()[index];if(!chosen)return false;
    const pool=window.PTBO_STATION_PRACTICE.serviceLocations(state.locations,state.service,state.difficulty);
    if(!pool.length){$('practice-setup-status').textContent='No locations are ranked in this difficulty yet.';return false;}
    state.session?.cancel();clearReview();state.base=chosen;state.pool=pool;renderBaseMenu();
    if(!state.map){
      state.map=L.map('map',{zoomControl:false,inertia:false,minZoom:window.PTBO_CITY_PACKAGE?.map?.minZoom??10,maxZoom:19});state.map.attributionControl.setPrefix(false);
      window.PTBO_GEO_MAP_PROVIDER.createStreetLayer({maxZoom:19}).addTo(state.map);
      state.map.getContainer().addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.repeat){event.preventDefault();check();}});
    }
    state.session=window.PTBO_STATION_PRACTICE.createSession({locations:pool,onNext:loadTarget,service:state.service});
    screen('game');state.map.invalidateSize();loadTarget(state.session.state.target);
    return true;
  }
  function review(outcome,guess,distance){
    const center=state.map.getCenter(),zoom=state.map.getZoom();clearReview();state.review={outcome,center,zoom};
    state.layers=L.layerGroup().addTo(state.map);
    const target=[state.target.lat,state.target.lng],circle=L.circle(target,{radius:state.target.radius,color:'#15a58c',weight:3,fillOpacity:.15}).addTo(state.layers);
    L.circleMarker(target,{radius:8,color:'#fff',weight:3,fillColor:'#15a58c',fillOpacity:1}).bindTooltip('Address location',{permanent:true,direction:'top'}).addTo(state.layers);
    if(guess){L.circleMarker(guess,{radius:8,color:'#fff',weight:3,fillColor:'#dc2626',fillOpacity:1}).bindTooltip('Your guess',{permanent:true,direction:'bottom'}).addTo(state.layers);L.polyline([guess,target],{color:'#334155',weight:3,dashArray:'7 7'}).addTo(state.layers);}
    $('reticle').hidden=true;$('practice-reveal').hidden=true;$('practice-review').hidden=false;
    $('practice-feedback').textContent='';
    $('practice-review-title').textContent=outcome==='correct'?'Location found':outcome==='incorrect'?'Try again':'Location revealed';
    $('practice-review-detail').textContent=guess?`${Math.round(distance)} m from the address · Target radius ${state.target.radius} m`:'Explore the area, then choose Next Call.';
    $('confirm').hidden=outcome!=='incorrect';$('confirm').textContent='Try again';$('practice-continue').hidden=false;
    const bounds=circle.getBounds();if(guess)bounds.extend(guess);
    // Recalculate after the review text changes the header height.
    const currentReview=state.review;
    (window.requestAnimationFrame||setTimeout)(()=>{
      if(state.review!==currentReview)return;
      const rect=$('header').getBoundingClientRect(),area=state.map.getContainer().getBoundingClientRect();
      const bottom=area.height<560?110:175;
      let left=42,top=rect.bottom-area.top+30;
      if(area.height-top-bottom<100&&area.width-rect.right>260){left=rect.right-area.left+30;top=65;}
      top=Math.max(24,Math.min(top,area.height-bottom-100));
      state.map.stop();state.map.invalidateSize();
      state.map.fitBounds(bounds,{paddingTopLeft:[left,top],paddingBottomRight:[42,bottom],maxZoom:17,animate:false});
    });
  }
  function retry(){
    if(state.review?.outcome!=='incorrect')return false;
    const previous=state.review;clearReview();state.map.stop().setView([previous.center.lat,previous.center.lng],previous.zoom,{animate:false});focusMap();
    $('reticle').hidden=false;$('practice-reveal').hidden=false;$('confirm').hidden=false;$('confirm').textContent='Check location';
    $('practice-feedback').textContent='Adjust your guess, then check the location again.';return true;
  }
  function check(){
    if(!state.session)return false;if(state.review?.outcome==='incorrect')return retry();
    const guess=state.map.getCenter(),distance=state.map.distance([guess.lat,guess.lng],[state.target.lat,state.target.lng]);
    const result=state.session.guess(distance,state.target.radius);if(!result.accepted)return false;
    review(result.correct?'correct':'incorrect',[guess.lat,guess.lng],distance);return result.correct;
  }
  function reveal(){if(!state.session?.reveal())return false;review('revealed');return true;}
  function next(){if(!state.session)return false;const advanced=state.session.next();focusMap();return advanced;}
  function returnToBase(){if(!state.session)return;if(state.review?.outcome==='incorrect')retry();state.map.stop().setView([state.base.lat,state.base.lng],18,{animate:false});focusMap();}
  function finish(){state.session?.cancel();state.session=null;clearReview();screen('station-practice');$('practice-setup-status').textContent='Choose a base to practise again.';focusBaseOrService();}
  function openSettings(){$('show-cross-streets').checked=state.showCrossStreets;screen('settings');$('show-cross-streets').focus();}
  function closeSettings(){screen('station-practice');$('settings-link').focus();}
  const api=Object.freeze({state,chooseService,chooseDifficulty,chooseBase,start,check,retry,reveal,next,returnToBase,finish,setCrossStreets,revealCrossStreets,openSettings,closeSettings,zoom:amount=>{if(state.map)state.map.setZoom(Math.max(window.PTBO_CITY_PACKAGE?.map?.minZoom??10,Math.min(19,state.map.getZoom()+amount)));}});
  window.PTBO_GEO=api;
  window.PTBO_GEO_READY=Promise.resolve(window.PTBO_GEO_CITY_READY).then(()=>window.PTBO_DISPATCH_STORE.ready()).then(()=>{
    const city=window.PTBO_CITY_PACKAGE;
    state.peterborough=city?.id==='peterborough';
    if(state.peterborough)document.body.classList.add('ptbo-geo-compact');
    $('practice-return').hidden=state.peterborough;$('practice-bases').hidden=!state.peterborough;
    if(city){
      const demo=city.id!=='peterborough';
      $('geo-city-label').textContent=city.name+' · '+(demo?'Geo Guesser demo':'street practice');
      document.title=city.name+' Geo Guesser'+(demo?' Demo':'');
      const back=new URL('../',location.href);back.searchParams.set('city',city.id);$('game-home').href=back.href;
      $('developer-settings').href='../dispatch-editor/?city='+encodeURIComponent(city.id);
    }
    state.locations=window.PTBO_DISPATCH_STORE.getAll();state.ready=true;
    updateDifficultyCounts();
    $('show-cross-streets').checked=state.showCrossStreets;$('practice-setup-status').textContent='';renderBases();
    $('developer-settings').hidden=read('ptbo-emergency-developer-mode','')!=='enabled';
    return api;
  }).catch(error=>{console.error('Unable to load Geo Guesser locations.',error);$('practice-setup-status').textContent=error?.message || 'Locations could not load. Check your connection and try again.';$('load-retry').hidden=false;return false;});
  window.addEventListener('ptbo-bases-updated',renderBases);
  window.addEventListener('pointerdown',event=>{const menu=$('practice-bases');if(menu.open&&!menu.contains(event.target))menu.open=false;});
  window.addEventListener('keydown',event=>{const menu=$('practice-bases');if(event.key==='Escape'&&menu.open){menu.open=false;$('practice-bases-toggle').focus();event.preventDefault();}});
  window.addEventListener('resize',()=>{if(state.peterborough&&state.target)updateCrossStreets();});
})();
