/* City-scoped local location editing. Exports are deltas against published data. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),calls=window.PTBO_DISPATCH_STORE,bases=window.PTBO_BASE_STORE,changes=window.PTBO_LOCATION_CHANGES;
  const city=window.PTBO_CITY_PACKAGE,cityId=city.id,cityName=city.name,isPeterborough=cityId==='peterborough';
  const capabilities=window.PTBO_EDITOR_CAPABILITIES||{bases:false,hospital:false};
  const scenarioFields=isPeterborough;
  const tiers=['easy','medium','hard','unranked'],tierNames={easy:'Easy',medium:'Medium',hard:'Hard',unranked:'Unranked'};
  const tierOf=item=>tiers.includes(item.recognitionDifficulty)?item.recognitionDifficulty:'unranked';
  let mode='calls',locations=[],callSeed=[],selectedId=null,draft=null,placing=null,preview=null,roads=null,ready=false,selectionBusy=false;
  let cleanSnapshot='',formTouched=false,newDraft=false,leavingCity=false;
  const deployment=window.PTBO_DEPLOYMENT||{},mapConfig={...(deployment.map||{}),...(window.PTBO_MAP_CONFIG||{})},deploymentMode=String(deployment.mode||'').toLowerCase();
  const commercial=deployment.commercial===true||deployment.private===true||['department','commercial','private'].includes(deploymentMode);
  const blankTile='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const streetUrl=String(mapConfig.osmTileUrl||'').trim()||(commercial?blankTile:'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  const arcgisToken=String(mapConfig.arcgisAccessToken||'').trim();
  const satelliteUrl=arcgisToken?`https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(arcgisToken)}`:(commercial?blankTile:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');
  const map=L.map('map',{preferCanvas:true}).setView(city.map?.defaultCenter||[44.302,-78.326],city.map?.defaultZoom||13);
  const street=L.tileLayer(streetUrl,{maxZoom:19,attribution:streetUrl===blankTile?'':'&copy; OpenStreetMap contributors'});
  const satellite=L.tileLayer(satelliteUrl,{maxZoom:19,attribution:satelliteUrl===blankTile?'':'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'}).addTo(map);
  if(commercial&&!mapConfig.osmTileUrl)console.warn('Dispatch Editor street map disabled: configure a licensed/self-hosted osmTileUrl for department deployments.');
  if(commercial&&!arcgisToken)console.warn('Dispatch Editor satellite map disabled: configure an ArcGIS Location Platform access token or another licensed provider before sale.');
  L.control.layers({'Satellite':satellite,'Street map':street},null,{position:'bottomright'}).addTo(map);
  L.control.scale({metric:true,imperial:false,position:'bottomleft'}).addTo(map);
  const layer=L.layerGroup().addTo(map);
  const subcategories={Fire:['Water & Ice Rescue','Structure Fire','Motor Vehicle Collision','Auto Alarm / Vehicle Fire','Burning Complaint','Alarms No Apparent Problem'],Medical:['Chest Pain / Cardiac Emergency','Difficulty Breathing','Unconscious Patient / Substance Overdose','Rectal Bleed / Gastrointestinal Emergency','Lift Assist / Public Service','Request for Access / Wellness Check']};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=message=>{$('save-status').textContent=message;};
  const nearestDistrict=(lat,lng)=>[...(window.PTBO_STATIONS||[])].sort((a,b)=>map.distance([lat,lng],[a.lat,a.lng])-map.distance([lat,lng],[b.lat,b.lng]))[0]?.number;
  // Familiarity is source metadata; a reference base never assigns a Geo district.
  const normalizeCalls=list=>list.map(item=>({...item,confirmed:Boolean(item.confirmed),...(isPeterborough?{district:item.district||nearestDistrict(item.lat,item.lng)}:{})}));
  const baseWidth=x=>Number(x.yardWidth??x.yardSize??160),baseLength=x=>Number(x.yardLength??x.yardSize??160);
  const editableMode=()=>mode==='calls'||(mode==='bases'?capabilities.bases:capabilities.hospital);
  function formSnapshot(){const form=mode==='calls'?$('editor'):$('base-editor');return JSON.stringify([...form.querySelectorAll('input,select')].filter(x=>!x.disabled).map(x=>[x.id,x.type==='checkbox'?x.checked:x.value]));}
  function rememberClean(){cleanSnapshot=formSnapshot();formTouched=false;const current=draft;requestAnimationFrame(()=>requestAnimationFrame(()=>{if(draft===current&&!formTouched)cleanSnapshot=formSnapshot();}));}
  function hasUnsavedChanges(){return Boolean(placing||draft&&(newDraft||formSnapshot()!==cleanSnapshot));}
  function canDiscard(){return !hasUnsavedChanges()||confirm(`Discard unsaved ${cityName} changes? Saved edits will stay on this device.`);}
  function updateSubs(select,main,value){
    const values=main?subcategories[main]:[...new Set(locations.map(x=>x.sub).filter(Boolean))].sort();
    select.innerHTML=(select.id==='sub-filter'?'<option value="">All call types</option>':'')+(values||[]).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if(values?.includes(value))select.value=value;
  }
  function allItems(){return mode==='calls'?locations:mode==='bases'?bases.getAll():[bases.getHospital()].filter(Boolean);}
  function filtered(){
    const q=$('search').value.trim().toLowerCase(),tier=$('difficulty-filter').value;
    return allItems().filter(x=>(!q||`${x.name} ${x.addr||x.address||''} ${(x.crossStreets||[]).join(' ')} ${x.service||''} ${scenarioFields?x.sub||'':''}`.toLowerCase().includes(q))&&(mode!=='calls'||((!tier||tierOf(x)===tier)&&(!$('hide-confirmed').checked||!x.confirmed)&&(!scenarioFields||((!$('main-filter').value||x.main===$('main-filter').value)&&(!$('sub-filter').value||x.sub===$('sub-filter').value))))));
  }
  function icon(item){return L.divIcon({className:'',html:`<div class="dot ${mode==='bases'?'base-dot':''} ${mode==='calls'&&!scenarioFields?'shared':item.service==='ems'||item.main==='Medical'?'medical':'fire'}"></div>`,iconSize:[18,18],iconAnchor:[9,9]});}
  function updateCounts(){
    const registry=window.PTBO_CITIES||[],published=isPeterborough?200:registry.find(x=>x.id===cityId)?.modes?.geo?20:0;
    $('city-summary').textContent=`${locations.length} calls on this device · ${published} published`;
    const value=$('difficulty-filter').value;
    $('difficulty-filter').innerHTML=`<option value="">All difficulties (${locations.length})</option>`+tiers.map(tier=>`<option value="${tier}">${tierNames[tier]} (${locations.filter(x=>tierOf(x)===tier).length})</option>`).join('');
    $('difficulty-filter').value=value;
  }
  function callRow(x){
    const call=mode==='calls',tier=tierOf(x),address=x.addr||x.address||'';
    const detail=call?`<span class="badges"><small>${escapeHtml(cityName)}</small><small class="difficulty-${tier}">${tierNames[tier]}</small><small class="shared">Shared address · Fire / EMS</small><small class="${x.confirmed?'verified':'pending'}">${x.confirmed?'Confirmed':'Needs review'}</small></span>${scenarioFields?`<span class="scenario">${escapeHtml(x.main)} · ${escapeHtml(x.sub)}</span>`:''}${x.crossStreets?.length?`<span class="cross-streets">Cross streets: ${x.crossStreets.map(escapeHtml).join(' · ')}</span>`:''}`:`<span>${escapeHtml(cityName)} · ${mode==='bases'?`${x.service==='ems'?'EMS':'Fire'}${capabilities.bases?` · ${Math.round(baseWidth(x))} × ${Math.round(baseLength(x))} m area`:' · Reference only'}`:`${x.radius} m arrival radius`}</span>`;
    return `<button type="button" class="call-item ${x.id===selectedId?'active':''} ${x.confirmed?'confirmed':''}" data-id="${escapeHtml(x.id)}"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(address)}</span>${detail}</button>`;
  }
  function render(){
    layer.clearLayers();const list=filtered();updateCounts();
    $('visible-count').textContent=`${list.length} of ${allItems().length} ${mode==='calls'?'calls':mode==='bases'?'bases':'destinations'}`;
    $('review-count').textContent=mode==='calls'?`${locations.filter(x=>!x.confirmed).length} awaiting review`:mode==='bases'?(capabilities.bases?'Box = drivable area':'Reference locations'):'EMS destination';
    if(!list.length){const message=allItems().length?'No matching locations. Clear filters to see this city.':mode==='calls'?`${cityName} has no published calls. You can add a local call on the map.`:`No ${mode==='bases'?'bases':'hospital destination'} available for ${cityName}.`;$('call-list').innerHTML=`<p id="empty-state" class="empty-state">${escapeHtml(message)}</p>`;}
    else if(mode==='calls')$('call-list').innerHTML=tiers.map(tier=>{const items=list.filter(x=>tierOf(x)===tier);return items.length?`<section class="difficulty-group" aria-label="${tierNames[tier]} calls"><h3 class="difficulty-heading">${tierNames[tier]} · ${items.length}</h3>${items.map(callRow).join('')}</section>`:'';}).join('');
    else $('call-list').innerHTML=list.map(callRow).join('');
    if(selectedId&&!newDraft&&!list.some(x=>x.id===selectedId))clearPreview();
    for(const x of list){
      if(mode==='bases'&&capabilities.bases)L.polygon(bases.corners(x),{color:x.service==='ems'?'#38bdf8':'#fb7185',weight:2,fillOpacity:.15}).addTo(layer);
      const marker=L.marker([x.lat,x.lng],{draggable:editableMode(),icon:icon(x)}).bindTooltip(escapeHtml(`${cityName} · ${x.name}`)).addTo(layer);
      marker.on('click',()=>select(x.id));
      if(editableMode())marker.on('dragend',event=>{const p=event.target.getLatLng();if(selectedId!==x.id&&!select(x.id,false)){render();return;}formTouched=true;if(mode==='calls'){$('f-lat').value=p.lat.toFixed(6);$('f-lng').value=p.lng.toFixed(6);$('f-confirmed').checked=false;previewCall();}else{$('b-lat').value=p.lat.toFixed(6);$('b-lng').value=p.lng.toFixed(6);previewBase();}status('Position moved. Save on This Device to keep it.');});
    }
    $('call-list').querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>select(button.dataset.id));
  }
  function clearPreview(){if(preview)preview.remove();preview=null;}
  function closeEditor(renderNow=true){selectedId=null;draft=null;newDraft=false;placing=null;cleanSnapshot='';formTouched=false;clearPreview();$('editor').classList.add('hidden');$('base-editor').classList.add('hidden');$('base-editor').classList.remove('placing');$('placement-banner').classList.add('hidden');$('add-map').classList.remove('active');if(renderNow)render();}
  function updateModeControls(){
    $('main-filter').hidden=mode!=='calls'||!scenarioFields;$('sub-filter').hidden=mode!=='calls'||!scenarioFields;$('difficulty-filter').hidden=mode!=='calls';$('hide-confirmed').closest('label').hidden=mode!=='calls';
    const add=mode!=='hospital'&&editableMode();$('add-call').hidden=!add;$('add-map').hidden=!add;$('add-call').textContent=mode==='bases'?'Add Base':'Add Call';
    const hospitalButton=document.querySelector('[data-mode="hospital"]');hospitalButton.disabled=!capabilities.hospital;hospitalButton.title=capabilities.hospital?'Edit this city’s hospital drop-off':'Hospital editing is unavailable for this city';
    document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
    $('editor-notice').textContent=mode==='calls'?`${cityName} calls share addresses between Fire and EMS. Verify positions, choose familiarity difficulty and save on this device.`:mode==='bases'?capabilities.bases?'Edit Fire and EMS bases. Drag and resize the drivable area box, then place the vehicle spawn inside it.':`${cityName} bases are reference locations. Select a base to view it on the map. Base editing requires verified road data.`:'Move the EMS hospital drop-off and adjust its arrival radius. Keep it on a reachable road.';
  }
  function clearFilters(){ $('search').value='';$('difficulty-filter').value='';$('main-filter').value='';$('sub-filter').value='';$('hide-confirmed').checked=false;updateSubs($('sub-filter'),'');render(); }
  function setMode(next){if(!ready||next===mode||next==='hospital'&&!capabilities.hospital||!canDiscard())return;closeEditor(false);mode=next;clearFilters();updateModeControls();fit();}
  function fit(){const list=filtered();if(list.length)map.fitBounds(L.latLngBounds(list.flatMap(x=>mode==='bases'&&capabilities.bases?bases.corners(x):[[x.lat,x.lng]])).pad(.15),{maxZoom:18});else if(city.map?.bounds)map.fitBounds(city.map.bounds,{maxZoom:city.map.defaultZoom||15});}
  function fillCall(x){
    $('editor-title').textContent=newDraft?'Add shared address':'Edit shared address';$('editor-id').textContent=`${cityName} · ${x.id}`;
    $('f-main').value=x.main||'Fire';updateSubs($('f-sub'),x.main||'Fire',x.sub);
    for(const field of ['name','addr','lat','lng','radius','district'])$('f-'+field).value=x[field]??'';
    $('f-recognition').value=x.recognitionDifficulty||'';$('f-cross-1').value=x.crossStreets?.[0]||'';$('f-cross-2').value=x.crossStreets?.[1]||'';$('f-confirmed').checked=Boolean(x.confirmed);
    for(const id of ['f-main','f-sub','f-district']){$(id).closest('label').hidden=!scenarioFields;$(id).disabled=!scenarioFields;}
    $('delete-call').hidden=newDraft;$('editor').classList.remove('hidden');previewCall();
  }
  function select(id,pan=true){
    if(selectionBusy)return false;const x=allItems().find(item=>item.id===id);if(!x||!canDiscard())return false;
    selectionBusy=true;
    try{
      closeEditor(false);selectedId=id;
      if(mode==='bases'&&!capabilities.bases){if(pan)map.setView([x.lat,x.lng],18);render();status(`${cityName} · ${x.name} · Reference only`);return true;}
      draft={...x};if(mode==='calls')fillCall(x);else openBase(x);rememberClean();
      if(pan)map.setView([x.lat,x.lng],18);render();return true;
    }finally{selectionBusy=false;}
  }
  function openBase(x){
    if(!editableMode())return;
    const hospital=mode==='hospital';$('base-title').textContent=hospital?'Hospital drop-off':selectedId?'Edit base':'Add base';$('base-id').textContent=x.id;
    $('base-help').textContent=hospital?'Move the drop-off marker or enter coordinates. The arrival circle must meet a drivable road.':'Drag the amber drivable-area box to move it. Drag its side/corner handles to change width and length, then place the vehicle spawn inside it.';
    document.querySelectorAll('.base-only,.hospital-only').forEach(label=>{const hidden=label.classList.contains('base-only')?hospital:!hospital;label.hidden=hidden;label.querySelectorAll('input,select').forEach(input=>input.disabled=hidden);});
    for(const [id,value] of Object.entries({'b-service':x.service||'ems','b-number':x.number||1,'b-name':x.name,'b-short':x.shortName||'','b-address':x.address||x.addr,'b-lat':x.lat,'b-lng':x.lng,'b-size':Math.max(baseWidth(x),baseLength(x)),'b-rotation':x.yardRotation||0,'b-radius':x.radius||30}))$(id).value=value;
    if($('b-area-width'))$('b-area-width').value=Math.round(baseWidth(x));if($('b-area-length'))$('b-area-length').value=Math.round(baseLength(x));
    $('base-editor').classList.remove('hidden');previewBase();
  }
  function baseFromForm(){const legacy=+$('b-size').value||160,width=+$('b-area-width')?.value||legacy,length=+$('b-area-length')?.value||legacy;return {...draft,service:$('b-service').value,number:+$('b-number').value,name:$('b-name').value.trim(),shortName:$('b-short').value.trim(),address:$('b-address').value.trim(),lat:+$('b-lat').value,lng:+$('b-lng').value,yardSize:Math.max(width,length),yardWidth:width,yardLength:length,yardRotation:+$('b-rotation').value};}
  function hospitalFromForm(){return {...draft,name:$('b-name').value.trim(),addr:$('b-address').value.trim(),lat:+$('b-lat').value,lng:+$('b-lng').value,radius:+$('b-radius').value};}
  function accessText(x){if(!roads)return 'Road access check is loading…';return 'Road access is checked when you save the base.';}
  function previewBase(){if(!editableMode())return;clearPreview();const hospital=mode==='hospital',x=hospital?hospitalFromForm():baseFromForm();if(hospital){if(![x.lat,x.lng,x.radius].every(Number.isFinite))return;}else if(![x.lat,x.lng,x.yardWidth,x.yardLength,x.yardRotation].every(Number.isFinite))return;preview=hospital?L.circle([x.lat,x.lng],{radius:x.radius,color:'#c084fc',fillOpacity:.2}).addTo(map):null;$('access-check').textContent=accessText(x);}
  function previewCall(){clearPreview();const lat=+$('f-lat').value,lng=+$('f-lng').value;if(Number.isFinite(lat)&&Number.isFinite(lng))preview=L.circle([lat,lng],{radius:+$('f-radius').value||50,color:'#38bdf8',fillOpacity:.15}).addTo(map);}
  function beginPlacement(kind){if(!ready||!editableMode()||kind!=='move'&&!canDiscard())return;if(kind!=='move')closeEditor(false);placing=kind;$('placement-banner').textContent=kind==='move'?'Tap the new position · Escape cancels':`Tap the map to place a new ${mode==='bases'?'base':'call'} in ${cityName} · Escape cancels`;$('placement-banner').classList.remove('hidden');$('add-map').classList.add('active');if(kind==='move')$('base-editor').classList.add('placing');}
  map.on('click',event=>{
    if(!placing||!editableMode())return;const p={lat:+event.latlng.lat.toFixed(6),lng:+event.latlng.lng.toFixed(6)},kind=placing;placing=null;$('placement-banner').classList.add('hidden');$('add-map').classList.remove('active');
    if(kind==='move'){formTouched=true;$('b-lat').value=p.lat;$('b-lng').value=p.lng;$('base-editor').classList.remove('placing');previewBase();return;}
    newDraft=true;
    if(mode==='bases'){draft={id:`base-${crypto.randomUUID()}`,service:'fire',number:Math.max(0,...bases.getBases('fire').map(x=>x.number))+1,name:'New Base',shortName:'New Base',address:'Enter address',...p,yardSize:160,yardWidth:160,yardLength:160,yardRotation:0};openBase(draft);return;}
    draft={main:'Fire',sub:'Structure Fire',name:'New Dispatch Location',addr:'Enter address',...p,radius:50,...(isPeterborough?{district:nearestDistrict(p.lat,p.lng)}:{}),recognitionDifficulty:null,crossStreets:[],cityTen:false,confirmed:false,custom:true,sources:['shared-editor','geo-guesser']};draft.id=calls.createId(draft);fillCall(draft);status('New call draft. Save on This Device to keep it.');
  });
  $('editor').onsubmit=event=>{
    event.preventDefault();if(!ready||!draft)return;
    const x={...draft,...(scenarioFields?{main:$('f-main').value,sub:$('f-sub').value,district:$('f-district').value?+$('f-district').value:undefined}:{}),name:$('f-name').value.trim(),addr:$('f-addr').value.trim(),lat:+$('f-lat').value,lng:+$('f-lng').value,radius:+$('f-radius').value,recognitionDifficulty:$('f-recognition').value||null,crossStreets:[$('f-cross-1').value.trim(),$('f-cross-2').value.trim()].filter(Boolean),confirmed:$('f-confirmed').checked};
    if(scenarioFields&&x.incidentProfiles)x.incidentProfiles={...x.incidentProfiles,[x.main==='Medical'?'ems':'fire']:{sub:x.sub}};
    if(!Number.isFinite(x.lat)||!Number.isFinite(x.lng)||Math.abs(x.lat)>90||Math.abs(x.lng)>180){status('Enter valid coordinates.');return;}
    try{locations=normalizeCalls(calls.replaceAll(locations.some(item=>item.id===x.id)?locations.map(item=>item.id===x.id?x:item):[...locations,x]));closeEditor(false);if(!$('hide-confirmed').checked||!x.confirmed)select(x.id,false);else render();status(`${cityName} call saved on this device.`);}catch(error){status(error.message);}
  };
  $('base-editor').onsubmit=event=>{
    event.preventDefault();if(!ready||!draft||!editableMode()||mode==='calls')return;
    const x=mode==='hospital'?hospitalFromForm():baseFromForm();if(!roads){status('Road access is still loading. Please try again.');return;}if(!bases.roadAccess(x,roads)){$('access-check').textContent=accessText(x);status('Move or resize the area to meet a mapped road.');return;}
    try{if(mode==='hospital')bases.saveHospital(x);else{const list=bases.getAll(),index=list.findIndex(item=>item.id===x.id);if(index<0)list.push(x);else list[index]=x;bases.replaceAll(list);}closeEditor(false);select(x.id,false);status('Saved on this device. Open the simulator to test, or export your changes.');}catch(error){$('access-check').textContent=error.message;status(error.message);}
  };
  $('delete-call').onclick=()=>{if(!ready||!draft||!confirm(`Delete ${draft.name} in ${cityName} on this device?`))return;try{locations=normalizeCalls(calls.replaceAll(locations.filter(x=>x.id!==selectedId)));closeEditor();status(`${cityName} call deletion saved. It will be included in the export.`);}catch(error){status(error.message);}};
  const emptyDelta=()=>({added:[],updated:[],deleted:[]});
  function exportData(){const hospitalSeed=capabilities.hospital?bases.getHospitalSeed():null,hospital=capabilities.hospital?(bases.getSavedHospital?.()||bases.getHospital()):null;return {format:'ptbo-location-changes',schema:1,cityId,cityName,sourceVersion:window.PTBO_BUILD?.version||'1.6.47',dispatchDataVersion:calls.dataVersion,calls:changes.diff(callSeed,normalizeCalls(locations)),bases:capabilities.bases?changes.diff(bases.getSeed(),bases.getAll()):emptyDelta(),hospital:hospitalSeed&&hospital?changes.diff([hospitalSeed],[hospital]):emptyDelta()};}
  function showExport(){
    if(!ready){status('Wait for locations to finish loading.');return;}
    const data=exportData(),count=changes.count(data.calls)+changes.count(data.bases)+changes.count(data.hospital),dialog=document.createElement('dialog');dialog.className='export-dialog';dialog.setAttribute('aria-labelledby','export-title');dialog.innerHTML='<h2 id="export-title"></h2><p></p><textarea aria-label="Changes code" readonly></textarea><div><button class="primary" type="button" data-download>Download Changes</button><button class="secondary" type="button" data-copy>Copy Changes</button><button class="secondary" type="button" data-close>Close</button></div>';
    const text=JSON.stringify(data,null,2)+'\n';dialog.querySelector('h2').textContent=`${cityName} changes`;dialog.querySelector('p').textContent=`${count} changed record${count===1?'':'s'} in ${cityName}. Includes saved edits only. Send this JSON file or copied code back to update the public game. Unchanged locations are omitted.`;dialog.querySelector('textarea').value=text;dialog.querySelector('[data-download]').disabled=!count;dialog.querySelector('[data-copy]').disabled=!count;
    dialog.querySelector('[data-download]').onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${cityId}-location-changes.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    dialog.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(text);dialog.querySelector('p').textContent=`${cityName} changes copied. Send them back to update the public game.`;}catch{dialog.querySelector('textarea').select();dialog.querySelector('p').textContent='Select and copy the code below.';}};dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();
  }
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
  $('add-call').onclick=$('add-map').onclick=()=>beginPlacement('add');$('move-base').onclick=()=>beginPlacement('move');$('fit-all').onclick=fit;
  $('close-editor').onclick=$('close-base').onclick=$('cancel-base').onclick=()=>{if(canDiscard())closeEditor();};
  $('search').oninput=render;$('main-filter').onchange=()=>{updateSubs($('sub-filter'),$('main-filter').value);render();};$('sub-filter').onchange=render;$('difficulty-filter').onchange=render;$('hide-confirmed').onchange=render;$('clear-filters').onclick=clearFilters;
  $('f-main').onchange=()=>updateSubs($('f-sub'),$('f-main').value);for(const field of ['f-lat','f-lng','f-radius'])$(field).oninput=previewCall;
  for(const field of ['b-lat','b-lng','b-size','b-rotation','b-radius','b-area-width','b-area-length'])if($(field))$(field).oninput=previewBase;
  for(const form of [$('editor'),$('base-editor')])for(const event of ['input','change'])form.addEventListener(event,()=>{formTouched=true;});
  $('b-service').onchange=()=>{if(!selectedId)$('b-number').value=Math.max(0,...bases.getBases($('b-service').value).map(x=>x.number))+1;};
  for(const id of ['download-source','copy-source','export-changes'])$(id).onclick=showExport;
  $('city-select').onchange=()=>{
    const id=$('city-select').value;if(id===cityId)return;
    if(!(window.PTBO_CITIES||[]).some(x=>x.id===id)||!canDiscard()){$('city-select').value=cityId;return;}
    const url=new URL(location.href);url.searchParams.set('city',id);if(!url.searchParams.has('v')&&window.PTBO_BUILD?.version)url.searchParams.set('v',window.PTBO_BUILD.version);leavingCity=true;location.assign(url.href);
  };
  window.addEventListener('beforeunload',event=>{if(!leavingCity&&hasUnsavedChanges()){event.preventDefault();event.returnValue='';}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&placing){placing=null;$('placement-banner').classList.add('hidden');$('base-editor').classList.remove('placing');$('add-map').classList.remove('active');status('Map placement cancelled.');}});
  if(capabilities.bases||capabilities.hospital){
    const roadUrl=city.roads?.dataUrl||'../city-explorer/data/osm-public-roads.geojson';
    fetch(roadUrl).then(response=>{if(!response.ok)throw new Error('Road data unavailable');return response.json();}).then(data=>{roads=data;if(draft&&mode!=='calls')previewBase();}).catch(error=>status(error.message+'; reload to check base access.'));
  }
  window.PTBO_EDITOR_UI_READY=calls.ready().then(()=>{
    locations=normalizeCalls(calls.getAll());callSeed=normalizeCalls(calls.getSeed?.()||locations);
    $('city-title').textContent=`${cityName} · Dispatch Editor`;document.title=`${cityName} Dispatch Editor`;
    const registry=[...(window.PTBO_CITIES||[])].sort((a,b)=>a.id==='peterborough'?-1:b.id==='peterborough'?1:a.name.localeCompare(b.name));
    $('city-select').innerHTML=registry.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)} · ${x.id==='peterborough'?200:x.modes?.geo?20:0} published calls</option>`).join('');$('city-select').value=cityId;
    ready=true;document.querySelectorAll('[data-editor-control]').forEach(control=>control.disabled=false);updateSubs($('sub-filter'),'');updateModeControls();render();fit();status(`${cityName} ready · Edits stay on this device`);return city;
  }).catch(error=>{status(error.message);$('editor-load-retry').hidden=false;throw error;});
  window.PTBO_EDITOR_UI_READY.catch(()=>{});
})();
