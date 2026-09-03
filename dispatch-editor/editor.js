/* Shared location editor. Saved records feed local gameplay; export is a delta
   against published data, never a replacement of the whole database. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),calls=window.PTBO_DISPATCH_STORE,bases=window.PTBO_BASE_STORE,changes=window.PTBO_LOCATION_CHANGES;
  let mode='calls',locations=[],callSeed=[],selectedId=null,draft=null,placing=null,preview=null,roads=null,ready=false;
  const map=L.map('map',{preferCanvas:true}).setView([44.302,-78.326],13);
  const street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'});
  const satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri, Maxar, Earthstar Geographics'}).addTo(map);
  L.control.layers({'Satellite':satellite,'Street map':street},null,{position:'bottomright'}).addTo(map);
  L.control.scale({metric:true,imperial:false,position:'bottomleft'}).addTo(map);
  const layer=L.layerGroup().addTo(map);
  const subcategories={Fire:['Water & Ice Rescue','Structure Fire','Motor Vehicle Collision','Auto Alarm / Vehicle Fire','Burning Complaint','Alarms No Apparent Problem'],Medical:['Chest Pain / Cardiac Emergency','Difficulty Breathing','Unconscious Patient / Substance Overdose','Rectal Bleed / Gastrointestinal Emergency','Lift Assist / Public Service','Request for Access / Wellness Check']};
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const status=message=>{$('save-status').textContent=message;};
  const nearestDistrict=(lat,lng)=>[...window.PTBO_STATIONS].sort((a,b)=>map.distance([lat,lng],[a.lat,a.lng])-map.distance([lat,lng],[b.lat,b.lng]))[0].number;
  const normalizeCalls=list=>list.map(item=>({...item,confirmed:Boolean(item.confirmed),district:item.district||nearestDistrict(item.lat,item.lng)}));
  function updateSubs(select,main,value) {
    const values=main?subcategories[main]:[...new Set(locations.map(x=>x.sub))].sort();
    select.innerHTML=(select.id==='sub-filter'?'<option value="">All call types</option>':'')+(values||[]).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if(values?.includes(value))select.value=value;
  }
  function allItems(){return mode==='calls'?locations:mode==='bases'?bases.getAll():[bases.getHospital()];}
  function filtered(){const q=$('search').value.trim().toLowerCase();return allItems().filter(x=>(!q||`${x.name} ${x.addr||x.address} ${x.service||''} ${x.sub||''}`.toLowerCase().includes(q))&&(mode!=='calls'||((!$('hide-confirmed').checked||!x.confirmed)&&(!$('main-filter').value||x.main===$('main-filter').value)&&(!$('sub-filter').value||x.sub===$('sub-filter').value))));}
  function icon(item){return L.divIcon({className:'',html:`<div class="dot ${mode==='bases'?'base-dot':''} ${item.service==='ems'||item.main==='Medical'?'medical':'fire'}"></div>`,iconSize:[18,18],iconAnchor:[9,9]});}
  function render() {
    layer.clearLayers();const list=filtered();$('visible-count').textContent=`${list.length} visible`;
    $('review-count').textContent=mode==='calls'?`${locations.filter(x=>!x.confirmed).length} awaiting review`:mode==='bases'?'Square = drivable area':'EMS destination';
    $('call-list').innerHTML=list.map(x=>`<button type="button" class="call-item ${x.id===selectedId?'active':''}" data-id="${escapeHtml(x.id)}"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.addr||x.address)}</span><span>${mode==='calls'?`${escapeHtml(x.sub)} · ${x.confirmed?'Confirmed':'Needs review'}`:mode==='bases'?`${x.service==='ems'?'EMS':'Fire'} · ${x.yardSize} m square`:`${x.radius} m arrival radius`}</span></button>`).join('');
    for(const x of list){
      if(mode==='bases')L.polygon(bases.corners(x),{color:x.service==='ems'?'#38bdf8':'#fb7185',weight:2,fillOpacity:.15}).addTo(layer);
      const marker=L.marker([x.lat,x.lng],{draggable:true,icon:icon(x)}).bindTooltip(escapeHtml(x.name)).addTo(layer);
      marker.on('click',()=>select(x.id));
      marker.on('dragend',event=>{const p=event.target.getLatLng();select(x.id,false);if(mode==='calls'){$('f-lat').value=p.lat.toFixed(6);$('f-lng').value=p.lng.toFixed(6);$('f-confirmed').checked=false;previewCall();}else{$('b-lat').value=p.lat.toFixed(6);$('b-lng').value=p.lng.toFixed(6);previewBase();}status('Position moved. Save on This Device to keep it.');});
    }
    $('call-list').querySelectorAll('[data-id]').forEach(button=>button.onclick=()=>select(button.dataset.id));
  }
  function clearPreview(){if(preview)preview.remove();preview=null;}
  function closeEditor(){selectedId=null;draft=null;placing=null;clearPreview();$('editor').classList.add('hidden');$('base-editor').classList.add('hidden');$('base-editor').classList.remove('placing');$('placement-banner').classList.add('hidden');$('add-map').classList.remove('active');render();}
  function setMode(next){closeEditor();mode=next;$('search').value='';document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));$('main-filter').hidden=mode!=='calls';$('sub-filter').hidden=mode!=='calls';$('hide-confirmed').closest('label').hidden=mode!=='calls';$('add-call').hidden=mode==='hospital';$('add-map').hidden=mode==='hospital';$('add-call').textContent=mode==='bases'?'Add Base':'Add Call';$('editor-notice').textContent=mode==='calls'?'Verify call positions and mark accurate locations as confirmed.':mode==='bases'?'Edit Fire and EMS bases. The square is drivable in the simulator, including when returning to base.':'Move the EMS hospital drop-off and adjust its arrival radius. Keep it on a reachable road.';render();fit();}
  function fit(){const list=filtered();if(list.length)map.fitBounds(L.latLngBounds(list.flatMap(x=>mode==='bases'?bases.corners(x):[[x.lat,x.lng]])).pad(.15),{maxZoom:18});}
  function select(id,pan=true){
    const x=allItems().find(item=>item.id===id);if(!x)return;
    closeEditor();selectedId=id;draft={...x};
    if(mode==='calls'){
      $('editor-title').textContent='Edit call';$('editor-id').textContent=x.id;
      $('f-main').value=x.main;updateSubs($('f-sub'),x.main,x.sub);
      for(const field of ['name','addr','lat','lng','radius','district'])$('f-'+field).value=x[field];
      $('f-city-ten').checked=Boolean(x.cityTen);$('f-confirmed').checked=Boolean(x.confirmed);$('editor').classList.remove('hidden');previewCall();
    }else{openBase(x);}
    if(pan)map.setView([x.lat,x.lng],18);render();
  }
  function openBase(x){
    const hospital=mode==='hospital';$('base-title').textContent=hospital?'Hospital drop-off':selectedId?'Edit base':'Add base';$('base-id').textContent=x.id;
    $('base-help').textContent=hospital?'Move the drop-off marker or enter coordinates. The arrival circle must meet a drivable road.':'The marker is the spawn and square centre. Move it, then size and rotate the square to overlap a road.';
    document.querySelectorAll('.base-only,.hospital-only').forEach(label=>{const hidden=label.classList.contains('base-only')?hospital:!hospital;label.hidden=hidden;label.querySelectorAll('input,select').forEach(input=>input.disabled=hidden);});
    for(const [id,value] of Object.entries({'b-service':x.service||'ems','b-number':x.number||1,'b-name':x.name,'b-short':x.shortName||'','b-address':x.address||x.addr,'b-lat':x.lat,'b-lng':x.lng,'b-size':x.yardSize||160,'b-rotation':x.yardRotation||0,'b-radius':x.radius||30}))$(id).value=value;
    $('base-editor').classList.remove('hidden');previewBase();
  }
  function baseFromForm(){return {...draft,service:$('b-service').value,number:+$('b-number').value,name:$('b-name').value.trim(),shortName:$('b-short').value.trim(),address:$('b-address').value.trim(),lat:+$('b-lat').value,lng:+$('b-lng').value,yardSize:+$('b-size').value,yardRotation:+$('b-rotation').value};}
  function hospitalFromForm(){return {...draft,name:$('b-name').value.trim(),addr:$('b-address').value.trim(),lat:+$('b-lat').value,lng:+$('b-lng').value,radius:+$('b-radius').value};}
  function accessText(x){if(!roads)return 'Road access check is loading…';return bases.roadAccess(x,roads)?'✓ Area connects to the mapped road network.':'Area does not meet a mapped road. Move it or increase its size before saving.';}
  function previewBase(){clearPreview();const hospital=mode==='hospital',x=hospital?hospitalFromForm():baseFromForm();if(![x.lat,x.lng,hospital?x.radius:x.yardSize].every(Number.isFinite))return;preview=hospital?L.circle([x.lat,x.lng],{radius:x.radius,color:'#c084fc',fillOpacity:.2}).addTo(map):L.polygon(bases.corners(x),{color:'#fbbf24',weight:3,fillOpacity:.18}).addTo(map);$('access-check').textContent=accessText(x);}
  function previewCall(){clearPreview();const lat=+$('f-lat').value,lng=+$('f-lng').value;if(Number.isFinite(lat)&&Number.isFinite(lng))preview=L.circle([lat,lng],{radius:+$('f-radius').value||50,color:'#38bdf8',fillOpacity:.15}).addTo(map);}
  function beginPlacement(kind){if(!ready)return;placing=kind;$('placement-banner').textContent=kind==='move'?'Tap the new position · Escape cancels':`Tap the map to place a new ${mode==='bases'?'base':'call'} · Escape cancels`;$('placement-banner').classList.remove('hidden');$('add-map').classList.add('active');if(kind==='move')$('base-editor').classList.add('placing');else closeFormForPlacement();}
  function closeFormForPlacement(){selectedId=null;draft=null;clearPreview();$('editor').classList.add('hidden');$('base-editor').classList.add('hidden');}
  map.on('click',event=>{
    if(!placing)return;const p={lat:+event.latlng.lat.toFixed(6),lng:+event.latlng.lng.toFixed(6)};const kind=placing;placing=null;$('placement-banner').classList.add('hidden');$('add-map').classList.remove('active');
    if(kind==='move'){$('b-lat').value=p.lat;$('b-lng').value=p.lng;$('base-editor').classList.remove('placing');previewBase();return;}
    if(mode==='bases'){draft={id:`base-${crypto.randomUUID()}`,service:'fire',number:Math.max(...bases.getBases('fire').map(x=>x.number))+1,name:'New Base',shortName:'New Base',address:'Enter address',...p,yardSize:160,yardRotation:0};openBase(draft);return;}
    const x={main:'Fire',sub:'Structure Fire',name:'New Dispatch Location',addr:'Enter address',...p,radius:50,district:nearestDistrict(p.lat,p.lng),cityTen:false,confirmed:false,custom:true,sources:['shared-editor','geo-guesser','driving-simulator']};x.id=calls.createId(x);
    try{locations=calls.replaceAll([...locations,x]);select(x.id);status('New call saved on this device. Edit its details.');}catch(error){status(error.message);}
  });
  $('editor').onsubmit=event=>{event.preventDefault();if(!draft)return;const x={...draft,main:$('f-main').value,sub:$('f-sub').value,name:$('f-name').value.trim(),addr:$('f-addr').value.trim(),lat:+$('f-lat').value,lng:+$('f-lng').value,radius:+$('f-radius').value,district:+$('f-district').value,cityTen:$('f-city-ten').checked,confirmed:$('f-confirmed').checked};if(!Number.isFinite(x.lat)||!Number.isFinite(x.lng)||Math.abs(x.lat)>90||Math.abs(x.lng)>180){status('Enter valid coordinates.');return;}try{locations=calls.replaceAll(locations.map(item=>item.id===x.id?x:item));if($('hide-confirmed').checked&&x.confirmed)closeEditor();else select(x.id,false);status('Call saved on this device.');}catch(error){status(error.message);}};
  $('base-editor').onsubmit=event=>{event.preventDefault();const x=mode==='hospital'?hospitalFromForm():baseFromForm();if(!roads){status('Road access is still loading. Please try again.');return;}if(!bases.roadAccess(x,roads)){$('access-check').textContent=accessText(x);status('Move or resize the area to meet a mapped road.');return;}try{if(mode==='hospital')bases.saveHospital(x);else{const list=bases.getAll(),index=list.findIndex(item=>item.id===x.id);if(index<0)list.push(x);else list[index]=x;bases.replaceAll(list);}selectedId=x.id;select(x.id,false);status('Saved on this device. Open the simulator to test, or export your changes.');}catch(error){$('access-check').textContent=error.message;status(error.message);}};
  $('delete-call').onclick=()=>{if(!draft||!confirm(`Delete ${draft.name} on this device?`))return;try{locations=calls.replaceAll(locations.filter(x=>x.id!==selectedId));closeEditor();status('Call deletion saved. It will be included in the export.');}catch(error){status(error.message);}};
  function exportData(){return {format:'ptbo-location-changes',schema:1,sourceVersion:window.PTBO_BUILD?.version||'1.6.2',dispatchDataVersion:calls.dataVersion,calls:changes.diff(callSeed,normalizeCalls(locations)),bases:changes.diff(bases.getSeed(),bases.getAll()),hospital:changes.diff([bases.getHospitalSeed()],[bases.getHospital()])};}
  function showExport(){if(!ready){status('Wait for locations to finish loading.');return;}const data=exportData(),count=changes.count(data.calls)+changes.count(data.bases)+changes.count(data.hospital);const dialog=document.createElement('dialog');dialog.className='export-dialog';dialog.setAttribute('aria-labelledby','export-title');dialog.innerHTML='<h2 id="export-title">Export changes</h2><p></p><textarea aria-label="Changes code" readonly></textarea><div><button class="primary" type="button" data-download>Download Changes</button><button class="secondary" type="button" data-copy>Copy Changes</button><button class="secondary" type="button" data-close>Close</button></div>';const text=JSON.stringify(data,null,2)+'\n';dialog.querySelector('p').textContent=`${count} changed record${count===1?'':'s'}. Includes saved edits only. Send this JSON file or copied code back to update the public game. Unchanged locations are omitted.`;dialog.querySelector('textarea').value=text;dialog.querySelector('[data-download]').disabled=!count;dialog.querySelector('[data-copy]').disabled=!count;dialog.querySelector('[data-download]').onclick=()=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='peterborough-location-changes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};dialog.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(text);dialog.querySelector('p').textContent='Changes copied. Send them back to update the public game.';}catch{dialog.querySelector('textarea').select();dialog.querySelector('p').textContent='Select and copy the code below.';}};dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());document.body.appendChild(dialog);dialog.showModal();}
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>setMode(button.dataset.mode));
  $('add-call').onclick=$('add-map').onclick=()=>beginPlacement('add');$('move-base').onclick=()=>beginPlacement('move');$('fit-all').onclick=fit;$('close-editor').onclick=$('close-base').onclick=$('cancel-base').onclick=closeEditor;
  $('search').oninput=render;$('main-filter').onchange=()=>{updateSubs($('sub-filter'),$('main-filter').value);render();};$('sub-filter').onchange=render;$('hide-confirmed').onchange=render;
  $('f-main').onchange=()=>updateSubs($('f-sub'),$('f-main').value);for(const field of ['f-lat','f-lng','f-radius'])$(field).oninput=previewCall;
  for(const field of ['b-lat','b-lng','b-size','b-rotation','b-radius'])$(field).oninput=previewBase;
  $('b-service').onchange=()=>{if(!selectedId)$('b-number').value=Math.max(0,...bases.getBases($('b-service').value).map(x=>x.number))+1;};
  for(const id of ['download-source','copy-source','export-changes'])$(id).onclick=showExport;
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&placing){placing=null;$('placement-banner').classList.add('hidden');$('base-editor').classList.remove('placing');$('add-map').classList.remove('active');status('Map placement cancelled.');}});
  fetch('../city-explorer/data/osm-public-roads.geojson').then(response=>{if(!response.ok)throw new Error('Road data unavailable');return response.json();}).then(data=>{roads=data;if(draft&&mode!=='calls')previewBase();}).catch(error=>status(error.message+'; reload to check base access.'));
  calls.ready().then(()=>{locations=normalizeCalls(calls.getAll());callSeed=normalizeCalls(calls.getSeed());ready=true;updateSubs($('sub-filter'),'');render();fit();status('Ready. Saved edits apply on this device; exports contain changes only.');}).catch(error=>status(error.message));
})();
