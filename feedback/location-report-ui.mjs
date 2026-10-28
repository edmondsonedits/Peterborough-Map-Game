import {normalizeLocationReport} from './location-report.mjs';
import {createCircleDraft} from './location-circle.mjs';

export const reportReasons=Object.freeze({point:'Circle location',radius:'Circle size',address:'Address',name:'Place name',scoring:'Answer or scoring',other:'Something else'});
const node=(tag,text,attrs={})=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;};
const pendingScripts=new WeakMap();
function script(url,globalName){
  if(window[globalName])return Promise.resolve(window[globalName]);
  let cache=pendingScripts.get(document);if(!cache){cache=new Map();pendingScripts.set(document,cache);}
  const key=String(url);if(cache.has(key))return cache.get(key);
  const promise=new Promise((resolve,reject)=>{
    const el=node('script',null,{src:url});
    let settled=false;
    const timer=setTimeout(()=>done(new Error('The report map took too long to load.')),10000);
    const done=error=>{if(settled)return;settled=true;clearTimeout(timer);el.onload=null;el.onerror=null;if(error){el.remove();cache.delete(key);reject(error);}else resolve(window[globalName]);};
    el.onload=()=>done(window[globalName]?null:new Error('The report map could not start.'));
    el.onerror=()=>done(new Error('The report map could not load.'));
    document.head.append(el);
  });
  cache.set(key,promise);return promise;
}
export async function loadReportMap(rootUrl,suppliedSpec){
  const css=new URL('response-simulator/vendor/leaflet-1.9.4/leaflet.css',rootUrl);
  if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(el=>{const url=new URL(el.href);return url.origin===css.origin&&url.pathname===css.pathname;}))document.head.append(node('link',null,{rel:'stylesheet',href:css}));
  const L=await script(new URL('response-simulator/vendor/leaflet-1.9.4/leaflet.js',rootUrl),'L');
  let spec=suppliedSpec;
  if(!spec){
    if(!window.PTBO_GEO_MAP_PROVIDER){
      await script(new URL('response-simulator/carto-basemap-policy-1.6.36.js',rootUrl),'PTBO_COMMERCIAL_MAP_POLICY');
      await script(new URL('geo-guesser/map-provider-1.6.46.js',rootUrl),'PTBO_GEO_MAP_PROVIDER');
    }
    spec=window.PTBO_GEO_MAP_PROVIDER.streetSpec();
  }
  if(!spec?.available||!spec.url)throw new Error(spec?.reason||'A street-map provider is not available.');
  return {L,spec};
}
function eastPoint(center,metres){
  const radians=Math.PI/180,a=metres/6371008.8,lat=center.lat*radians;
  const nextLat=Math.asin(Math.sin(lat)*Math.cos(a));
  const delta=Math.atan2(Math.sin(a)*Math.cos(lat),Math.cos(a)-Math.sin(lat)*Math.sin(nextLat));
  return [nextLat/radians,((center.lng+delta/radians+540)%360)-180];
}
function createMap({host,support,snapshot,draft,onChange,readOnly=false,suggestion=null}){
  const {L,spec}=support,original=snapshot.originalCircle;
  const map=L.map(host,{zoomControl:true,scrollWheelZoom:false,minZoom:2,maxZoom:19}).setView([original.center.lat,original.center.lng],17,{animate:false});
  try {
  L.tileLayer(spec.url,{maxZoom:19,attribution:spec.attribution}).addTo(map);
  const old=L.circle([original.center.lat,original.center.lng],{radius:original.radiusMeters,color:'#a5b9cb',dashArray:'6 5',weight:2,fillOpacity:.07}).addTo(map).bindTooltip('Original circle');
  if(snapshot.guess)L.circleMarker([snapshot.guess.lat,snapshot.guess.lng],{radius:6,color:'#fff',fillColor:'#f4bd59',fillOpacity:1,weight:2}).addTo(map).bindTooltip('Player guess');
  let proposed=null,centre=null,edge=null;
  const icon=type=>L.divIcon({className:'fb-circle-handle '+type,html:'<span></span>',iconSize:[44,44],iconAnchor:[22,22]});
  function sync(){
    const value=readOnly?{center:suggestion?.center||original.center,radiusMeters:suggestion?.radiusMeters??original.radiusMeters}:draft.value();
    const visible=readOnly?Boolean(suggestion):draft.enabled();
    if(!visible){for(const layer of [proposed,centre,edge])if(layer&&map.hasLayer(layer))map.removeLayer(layer);return;}
    const p=[value.center.lat,value.center.lng];
    proposed??=L.circle(p,{radius:value.radiusMeters,color:'#5cddc0',weight:3,fillOpacity:.17}).bindTooltip('Proposed circle');
    proposed.setLatLng(p).setRadius(value.radiusMeters);if(!map.hasLayer(proposed))proposed.addTo(map);
    if(readOnly)return;
    if(!centre){
      centre=L.marker(p,{icon:icon('fb-centre-handle'),draggable:true,keyboard:false,title:'Drag the proposed circle centre'});
      edge=L.marker(eastPoint(value.center,value.radiusMeters),{icon:icon('fb-radius-handle'),draggable:true,keyboard:false,title:'Drag to change the radius'});
      centre.on('drag',()=>{const point=map.wrapLatLng(centre.getLatLng());draft.setCenter({lat:point.lat,lng:point.lng});sync();onChange();});
      edge.on('drag',()=>{draft.setRadius(Math.max(5,Math.min(2000,Math.round(map.distance(centre.getLatLng(),edge.getLatLng())))));sync();onChange();});
    }
    centre.setLatLng(p);edge.setLatLng(eastPoint(value.center,value.radiusMeters));
    for(const layer of [centre,edge])if(!map.hasLayer(layer))layer.addTo(map);
  }
  sync();const bounds=old.getBounds();if(proposed)bounds.extend(proposed.getBounds());if(snapshot.guess)bounds.extend([snapshot.guess.lat,snapshot.guess.lng]);
  map.fitBounds(bounds,{padding:[35,35],maxZoom:18,animate:false});
  const observer=window.ResizeObserver?new window.ResizeObserver(()=>map.invalidateSize()):null;observer?.observe(host);
  return {sync,centre:()=>map.wrapLatLng(map.getCenter()),destroy(){observer?.disconnect();map.remove();}};
  } catch(error) { map.remove(); throw error; }
}

function contextDetails(snapshot,diagnosticsText=""){
  const details=node('details',null,{class:'fb-report-context'});details.append(node('summary','Technical details'));
  const content=node('div',null,{class:'fb-auto-context-body'});
  const values=[['Location ID',snapshot.callId],['Place',`${snapshot.question.name} · ${snapshot.question.address}`],['Cross streets',snapshot.question.crossStreets?.join(' / ')||'not recorded'],['Difficulty',snapshot.question.difficulty||'not recorded'],['City / mode',`${snapshot.city} / Geo Guesser`],['Service / base',`${snapshot.service} / ${snapshot.baseId||'not recorded'}`],['Version',snapshot.version],['Dataset',`${snapshot.datasetId} · ${snapshot.datasetRevision||'revision not recorded'}`],['Original circle',`${snapshot.originalCircle.center.lat}, ${snapshot.originalCircle.center.lng} · ${snapshot.originalCircle.radiusMeters} m`],['Player guess',snapshot.guess?`${snapshot.guess.lat}, ${snapshot.guess.lng}`:'not recorded'],['Result',`${snapshot.result}${snapshot.distanceMeters===null?'':` · ${Math.round(snapshot.distanceMeters)} m from target`}`]];
  const list=node('dl');for(const [label,value]of values)list.append(node('dt',label),node('dd',value));content.append(list);if(diagnosticsText)content.append(node('p',diagnosticsText,{class:'fb-report-coordinates'}));details.append(content);return details;
}

export function mountLocationReportComposer({host,snapshot,rootUrl,mapSpec,mapLoader=loadReportMap,draft={},diagnosticsText='',onSend,onReceived,onCancel=()=>{},onDraft=()=>{}}){
  const original=normalizeLocationReport({schemaVersion:1,kind:'geo-location',reason:'point',snapshot,suggestion:null}).snapshot;
  const circle=createCircleDraft(original.originalCircle);
  if(draft.circle){circle.setCenter(draft.circle.center);if(draft.circle.radiusMeters!==original.originalCircle.radiusMeters)circle.setRadius(draft.circle.radiusMeters);}
  circle.setEnabled(Boolean(draft.correctCircle));
  const form=node('form',null,{class:'fb-report-form',novalidate:''});
  form.innerHTML=`<div class="fb-report-heading"><h3>Report a possible problem</h3><p class="fb-report-place"></p><p class="fb-muted">Your report and any suggested correction go privately to the developer for review.</p></div><label>What seems wrong?<select name="reason"></select></label><label class="fb-check"><input name="correct-circle" type="checkbox">Suggest a different circle location or size</label><div class="fb-correction" hidden><p class="fb-muted">Drag the centre to move the circle. Drag the edge to resize it, or use the fields below.</p><div class="fb-report-map" aria-label="Original and proposed location circles"></div><p class="fb-map-status" role="status">Loading the map…</p><div class="fb-map-legend"><span>◌ Original</span><span class="fb-proposed-key">● Proposed</span><span class="fb-guess-key">● Player guess</span></div><div class="fb-circle-fields"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" inputmode="decimal"></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" inputmode="decimal"></label><label>Radius (metres)<input name="radius" type="number" min="5" max="2000" step="1" inputmode="numeric"></label></div><div class="fb-actions"><button type="button" data-map-centre disabled>Use map centre</button><button type="button" data-reset-circle>Reset circle</button><button type="button" data-map-retry hidden>Retry map</button></div></div><label>Anything else? (optional)<textarea name="note" maxlength="3000" rows="2" placeholder="What should be different?"></textarea></label><div class="fb-report-details"></div><p class="fb-error" role="status" aria-live="polite"></p><div class="fb-report-actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="fb-primary">Send report</button></div>`;
  form.querySelector('.fb-report-place').textContent=[original.question.name,original.question.address].filter(Boolean).join(' · ');
  const reason=form.elements.namedItem('reason'),check=form.elements.namedItem('correct-circle'),note=form.elements.namedItem('note'),send=form.querySelector('[type="submit"]'),error=form.querySelector('.fb-error'),status=form.querySelector('.fb-map-status'),mapHost=form.querySelector('.fb-report-map');
  for(const [value,label]of Object.entries(reportReasons))reason.append(node('option',label,{value}));reason.value=draft.reason||'point';note.value=draft.note||'';check.checked=circle.enabled();
  const details=contextDetails(original,diagnosticsText);
  form.querySelector('.fb-report-details').append(node('p','Game details are attached automatically.',{class:'fb-muted fb-auto-context-hint'}),details);host.replaceChildren(form);
  let alive=true,busy=false,geometry=null,mapPromise=null;
  const save=()=>{Object.assign(draft,{reason:reason.value,note:note.value,correctCircle:circle.enabled(),circle:circle.value()});onDraft(draft);};
  function syncFields(){const value=circle.value();for(const key of ['latitude','longitude','radius'])form.elements.namedItem(key).value=key==='radius'?String(value.radiusMeters):String(value.center[key==='latitude'?'lat':'lng']);save();}
  function enable(){form.querySelector('.fb-correction').hidden=!circle.enabled();syncFields();geometry?.sync();if(circle.enabled())void loadMap();}
  async function loadMap(){
    if(geometry||mapPromise)return;
    status.textContent='Loading the map…';form.querySelector('[data-map-retry]').hidden=true;
    mapPromise=(async()=>{try{
      const support=await mapLoader(rootUrl,mapSpec);if(!alive)return;
      geometry=createMap({host:mapHost,support,snapshot:original,draft:circle,onChange:syncFields});status.textContent='';form.querySelector('[data-map-centre]').disabled=false;
    }catch(e){if(alive){status.textContent=`${e.message} You can still use the coordinate and radius fields.`;form.querySelector('[data-map-retry]').hidden=false;}}
    finally{mapPromise=null;}})();await mapPromise;
  }
  check.onchange=()=>{circle.setEnabled(check.checked);error.textContent='';enable();};
  for(const key of ['latitude','longitude','radius']){
   const input=form.elements.namedItem(key);
   const update=()=>{
    try{const value=form.elements.namedItem(key).value;if(!value.trim())throw new Error('Enter a coordinate or radius.');
      if(key==='radius')circle.setRadius(Number(value));else{const next=circle.value().center;next[key==='latitude'?'lat':'lng']=Number(value);circle.setCenter(next);}
      error.textContent='';geometry?.sync();save();
    }catch(e){error.textContent=e.message;}
   };
   input.oninput=update;input.onchange=update;
  }
  reason.onchange=save;note.oninput=save;
  form.querySelector('[data-reset-circle]').onclick=()=>{circle.reset();syncFields();geometry?.sync();error.textContent='';};
  form.querySelector('[data-map-centre]').onclick=()=>{if(!geometry)return;try{const point=geometry.centre();circle.setCenter({lat:point.lat,lng:point.lng});syncFields();geometry.sync();error.textContent='';}catch(e){error.textContent=e.message;}};
  form.querySelector('[data-map-retry]').onclick=()=>void loadMap();
  form.querySelector('[data-cancel]').onclick=()=>{save();onCancel();};
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;error.textContent='';
    try{
      if(circle.enabled()){
        for(const key of ['latitude','longitude','radius']){const input=form.elements.namedItem(key);if(!input.value.trim()||!input.checkValidity())throw new Error(key==='radius'?'Use a radius from 5 to 2000 metres.':'Enter valid latitude and longitude.');}
        circle.setCenter({lat:Number(form.elements.namedItem('latitude').value),lng:Number(form.elements.namedItem('longitude').value)});circle.setRadius(Number(form.elements.namedItem('radius').value));
      }
      const report=normalizeLocationReport({schemaVersion:1,kind:'geo-location',reason:reason.value,snapshot:original,suggestion:circle.suggestion()});
      save();busy=true;mapHost.inert=true;send.textContent='Sending…';for(const input of form.querySelectorAll('input,select,textarea,button'))input.disabled=true;
      await onSend(report,note.value);if(alive)onReceived(report);
    }catch(e){if(alive){error.textContent=e.message||'Could not send. Please try again.';send.textContent=busy?'Retry report':'Send report';}}
    finally{busy=false;if(alive){mapHost.inert=false;for(const input of form.querySelectorAll('input,select,textarea,button'))input.disabled=false;form.querySelector('[data-map-centre]').disabled=!geometry;}}
  };
  enable();reason.focus({preventScroll:true});
  return {destroy(){save();alive=false;geometry?.destroy();},draft};
}

export function mountLocationReportDetails({host,report,rootUrl,mapLoader=loadReportMap,mapSpec}){
  const value=normalizeLocationReport(report),snapshot=value.snapshot;
  const section=node('section',null,{class:'fb-location-details'});
  section.append(node('strong',`Location report · ${reportReasons[value.reason]}`));
  const detail=value.suggestion?`Proposed radius: ${value.suggestion.radiusMeters??snapshot.originalCircle.radiusMeters} m · ${value.suggestion.center?'centre moved':'original centre'}`:'No circle correction proposed.';
  section.append(node('p',detail),contextDetails(snapshot));
  if(value.suggestion){const centre=value.suggestion.center||snapshot.originalCircle.center;section.append(node('p',`Proposed centre: ${centre.lat}, ${centre.lng} · radius ${value.suggestion.radiusMeters??snapshot.originalCircle.radiusMeters} m`,{class:'fb-report-coordinates'}));}
  const toggle=node('details',null,{class:'fb-report-comparison'});toggle.append(node('summary','View original and proposed circles'));
  const mapHost=node('div',null,{class:'fb-report-map','aria-label':'Reported original and proposed circles'}),status=node('p','',{class:'fb-map-status',role:'status'});toggle.append(mapHost,status);section.append(toggle);host.append(section);
  let alive=true,geometry=null,loading=false;
  toggle.ontoggle=async()=>{if(!toggle.open||geometry||loading)return;loading=true;status.textContent='Loading the map…';try{
    const support=await mapLoader(rootUrl,mapSpec);if(!alive)return;geometry=createMap({host:mapHost,support,snapshot,readOnly:true,suggestion:value.suggestion});status.textContent='';
  }catch(e){if(alive)status.textContent=`${e.message} The exact circle coordinates remain available in the report details.`;}finally{loading=false;}};
  return {destroy(){alive=false;geometry?.destroy();}};
}
