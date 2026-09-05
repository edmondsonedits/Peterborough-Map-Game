/* Anonymous aggregate analytics for Emergency Games v1.6.24.
   Stores aggregate session/gameplay metrics only. Exact routes/coordinates, names,
   emails, prompts, room codes, and individual activity histories are not stored. */
(() => {
  'use strict';
  const VERSION='1.6.24';
  if (window.top !== window || window.PTBO_SITE_ANALYTICS?.version===VERSION) return;

  const PROJECT_ID='geo-guesser-scoreboard';
  const API_KEY='AIzaSyA5_GrKYKporIPhwXF6FN0Gp0iP_k8wb0I';
  const PRIMARY_COLLECTION='siteAnalytics';
  const FALLBACK_COLLECTION='scores';
  const ROOT=`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
  const COLLECTION_KEY='ptbo-site-analytics-collection-v2';
  const VISITOR_ID_KEY='ptbo-site-visitor-id-v1';
  const VISITOR_FIRST_KEY='ptbo-site-visitor-first-v2';
  const VISITOR_SESSIONS_KEY='ptbo-site-visitor-sessions-v2';
  const SESSION_ID_KEY='ptbo-site-session-id-v2';
  const SESSION_STATE_KEY='ptbo-site-session-state-v2';

  const privilegedPage=()=>/\/(?:dispatch-editor|site-stats)\//.test(location.pathname);
  const trackingAllowed=()=>!privilegedPage();
  const nowIso=()=>new Date().toISOString();
  const num=value=>Number.isFinite(Number(value))?Number(value):0;
  const round=value=>Math.round(num(value)*10)/10;
  const slug=value=>String(value||'unknown').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,60)||'unknown';
  const safeGet=(storage,key)=>{try{return storage.getItem(key)}catch{return null}};
  const safeSet=(storage,key,value)=>{try{storage.setItem(key,String(value));return true}catch{return false}};
  const readJson=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key)||'null')??fallback}catch{return fallback}};
  const writeJson=(storage,key,value)=>{try{storage.setItem(key,JSON.stringify(value));return true}catch{return false}};
  const randomId=()=>{try{return crypto.randomUUID().replace(/-/g,'')}catch{return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`}};

  function isMobile(){
    if(window.PTBO_DEVICE_SURFACE?.isMobile?.()===true)return true;
    const ua=String(navigator.userAgent||'');
    return navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod|Mobile/i.test(ua)||(navigator.maxTouchPoints>1&&/Macintosh/i.test(ua));
  }
  function browserFamily(){
    const ua=String(navigator.userAgent||'');
    if(/SamsungBrowser/i.test(ua))return 'Samsung Internet';
    if(/Edg\//i.test(ua))return 'Edge';
    if(/Firefox\//i.test(ua))return 'Firefox';
    if(/Chrome\//i.test(ua))return 'Chrome';
    if(/Safari\//i.test(ua))return 'Safari';
    return 'Other';
  }
  function screenBucket(){
    const width=Math.min(Number(screen?.width)||9999,Number(screen?.height)||9999);
    return width<=480?'small':width<=900?'medium':'large';
  }
  function pageType(){
    const path=location.pathname;
    if(/\/response-simulator\/(?:play|mobile)\//.test(path))return 'dispatch';
    if(/\/geo-guesser\/(?:desktop|mobile)\//.test(path))return 'geoguesser';
    if(/\/city-explorer\//.test(path))return 'explorer';
    if(/\/dispatch-editor\//.test(path))return 'editor';
    if(/\/site-stats\//.test(path))return 'stats';
    if(/Peterborough-Map-Game\/?$/.test(path)||path.endsWith('/'))return 'menu';
    return 'other';
  }

  function encodeValue(value){
    if(typeof value==='boolean')return {booleanValue:value};
    if(typeof value==='number'&&Number.isFinite(value))return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
    return {stringValue:String(value??'')};
  }
  function encodeFields(record){return Object.fromEntries(Object.entries(record).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,encodeValue(v)]))}
  function decodeValue(value={}){
    if('stringValue'in value)return value.stringValue;
    if('integerValue'in value)return Number(value.integerValue);
    if('doubleValue'in value)return Number(value.doubleValue);
    if('booleanValue'in value)return Boolean(value.booleanValue);
    if('timestampValue'in value)return value.timestampValue;
    return null;
  }
  function decodeDocument(doc,collection){const out={id:String(doc?.name||'').split('/').pop(),collection};Object.entries(doc?.fields||{}).forEach(([k,v])=>out[k]=decodeValue(v));return out}

  async function firestoreRequest(url,options={}){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(url,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal,...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(options.headers||{})}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload?.error?.message||`Firestore request failed (${response.status})`);
      return payload;
    }finally{clearTimeout(timer)}
  }
  const collectionUrl=(collection,id='')=>`${ROOT}/${collection}${id?`/${encodeURIComponent(id)}`:''}?key=${encodeURIComponent(API_KEY)}`;
  async function writeToCollection(collection,record,id=''){
    const body=JSON.stringify({fields:encodeFields(record)});
    await firestoreRequest(collectionUrl(collection,id),{method:id?'PATCH':'POST',body});
    safeSet(sessionStorage,COLLECTION_KEY,collection);return true;
  }
  async function writeRecord(record,id=''){
    if(!trackingAllowed())return false;
    const preferred=safeGet(sessionStorage,COLLECTION_KEY);
    const order=preferred===FALLBACK_COLLECTION?[FALLBACK_COLLECTION,PRIMARY_COLLECTION]:[PRIMARY_COLLECTION,FALLBACK_COLLECTION];
    for(const collection of order){try{return await writeToCollection(collection,record,id)}catch(_) {}}
    return false;
  }

  let visitorId=safeGet(localStorage,VISITOR_ID_KEY);
  if(!visitorId){visitorId=randomId();safeSet(localStorage,VISITOR_ID_KEY,visitorId)}
  let sessionId=safeGet(sessionStorage,SESSION_ID_KEY);
  const newSession=!sessionId;
  if(!sessionId){sessionId=randomId();safeSet(sessionStorage,SESSION_ID_KEY,sessionId)}
  let firstSeen=safeGet(localStorage,VISITOR_FIRST_KEY);
  if(!firstSeen){firstSeen=nowIso();safeSet(localStorage,VISITOR_FIRST_KEY,firstSeen)}
  if(newSession)safeSet(localStorage,VISITOR_SESSIONS_KEY,num(safeGet(localStorage,VISITOR_SESSIONS_KEY))+1);

  const defaults={
    recordType:'session_summary',build:VERSION,sessionId,visitorId,startedAt:nowIso(),updatedAt:nowIso(),
    surface:isMobile()?'mobile':'desktop',browser:browserFamily(),screenBucket:screenBucket(),orientation:innerWidth>=innerHeight?'landscape':'portrait',
    activeSeconds:0,menuSeconds:0,dispatchSeconds:0,geoguesserSeconds:0,explorerSeconds:0,otherSeconds:0,
    simulatorSeconds:0,drivingSeconds:0,stationarySeconds:0,distanceMeters:0,fireSeconds:0,emsSeconds:0,
    callsStarted:0,callsCompleted:0,callsAbandoned:0,fireCalls:0,emsCalls:0,responseMsTotal:0,transportMsTotal:0,
    optionsOpens:0,settingsChanges:0,serviceChanges:0,baseSelections:0,sirenToggles:0,recenterUses:0,reverseUses:0,acceleratorUses:0,steeringUses:0,gearShifts:0,mapToggles:0,audioToggles:0,
    geoDrillsStarted:0,geoGuesses:0,geoNextCalls:0,geoDrillsEnded:0,geoInteractions:0,
    explorerPlayUses:0,explorerFlyUses:0,explorerMapUses:0,explorerSearchUses:0,explorerLandmarkUses:0,explorerTimeUses:0,explorerSoundUses:0,
    startupSuccesses:0,startupFailures:0,startupMsTotal:0,
  };
  let state={...defaults,...readJson(sessionStorage,SESSION_STATE_KEY,{})};
  state.sessionId=sessionId;state.visitorId=visitorId;state.build=VERSION;state.updatedAt=nowIso();
  writeJson(sessionStorage,SESSION_STATE_KEY,state);

  const bump=(key,amount=1)=>{state[key]=round(num(state[key])+num(amount));state.updatedAt=nowIso();writeJson(sessionStorage,SESSION_STATE_KEY,state)};
  const bumpNamed=(prefix,name,amount=1)=>bump(`${prefix}_${slug(name)}`,amount);
  let flushTimer=0,flushing=false;
  function scheduleFlush(delay=1200){clearTimeout(flushTimer);flushTimer=setTimeout(flushSummary,delay)}
  async function flushSummary(){
    if(flushing||!trackingAllowed())return;flushing=true;
    try{writeJson(sessionStorage,SESSION_STATE_KEY,state);await writeRecord({...state,recordType:'session_summary',updatedAt:nowIso()},`activity_${sessionId}`)}finally{flushing=false}
  }
  const mark=(key,amount=1)=>{bump(key,amount);scheduleFlush()};
  const markNamed=(prefix,name,amount=1)=>{bumpNamed(prefix,name,amount);scheduleFlush()};

  async function ensureVisitor(){
    if(!trackingAllowed())return;
    const sessions=Math.max(1,num(safeGet(localStorage,VISITOR_SESSIONS_KEY)));
    await writeRecord({recordType:'visitor',build:VERSION,visitorId,firstSeenAt:firstSeen,lastSeenAt:nowIso(),sessionCount:sessions,surface:state.surface,createdAt:firstSeen},`visitor_${visitorId}`);
    if(newSession)await writeRecord({recordType:'session',build:VERSION,sessionId,visitorId,surface:state.surface,browser:state.browser,screenBucket:state.screenBucket,orientation:state.orientation,createdAt:state.startedAt},`session_${sessionId}`);
  }
  const baseEvent=recordType=>({recordType,build:VERSION,surface:state.surface,sessionId,visitorId,createdAt:nowIso()});
  const recordMenuView=()=>writeRecord({...baseEvent('menu_view'),path:location.pathname});
  const recordLaunch=target=>{const value=String(target||'unknown');markNamed('launch',value);return writeRecord({...baseEvent('launch'),target:value})};
  const recordCity=city=>{const value=slug(city);markNamed('city_select',value);return writeRecord({...baseEvent('city_select'),city:value})};

  let lastTick=performance.now();
  setInterval(()=>{
    const now=performance.now();const delta=Math.max(0,Math.min(10,(now-lastTick)/1000));lastTick=now;
    if(document.visibilityState!=='visible'||!trackingAllowed())return;
    bump('activeSeconds',delta);bump(`${pageType()}Seconds`,delta);scheduleFlush(5000);
  },5000);
  document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden)void flushSummary()});
  addEventListener('pagehide',()=>{writeJson(sessionStorage,SESSION_STATE_KEY,state);void flushSummary()});
  addEventListener('beforeunload',()=>writeJson(sessionStorage,SESSION_STATE_KEY,state));

  function haversine(a,b){
    const R=6371000,toRad=v=>v*Math.PI/180,dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);
    const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;
    return 2*R*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
  }

  const attachedFrames=new WeakSet();
  function attachSimulatorFrame(frame){
    if(!frame||attachedFrames.has(frame))return;attachedFrames.add(frame);
    const install=()=>{
      let doc;try{doc=frame.contentDocument}catch{return}
      if(!doc||doc.documentElement.dataset.ptboAnalytics24==='1')return;
      if(!doc.getElementById('tel-lat')){setTimeout(install,700);return}
      doc.documentElement.dataset.ptboAnalytics24='1';
      mark('simulatorEntries');
      let previous=null,last=performance.now(),callActive=false,completedSeen=false,lastIncident='';
      const city=slug(new URLSearchParams(location.search).get('city')||frame.dataset.ptboCity||'peterborough');
      markNamed('city_entry',city);

      doc.addEventListener('click',event=>{
        if(!event.isTrusted)return;const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;
        if(button.id==='menu-toggle')mark('optionsOpens');
        if(button.closest('#service-spawns')){mark('baseSelections');markNamed('base',button.textContent.trim())}
      },true);
      doc.addEventListener('change',event=>{
        if(!event.isTrusted)return;const target=event.target;
        if(target?.id==='service-select'){mark('serviceChanges');markNamed('service_select',target.value)}
        if(target?.matches?.('input,select')){mark('settingsChanges');markNamed('setting',target.id||target.name||target.dataset?.sub||'control')}
      },true);

      setInterval(()=>{
        const now=performance.now(),delta=Math.max(0,Math.min(5,(now-last)/1000));last=now;
        if(document.visibilityState!=='visible')return;
        bump('simulatorSeconds',delta);bumpNamed('city_seconds',city,delta);
        const service=String(doc.getElementById('service-select')?.value||'').toLowerCase();
        if(service==='fire')bump('fireSeconds',delta);if(service==='ems')bump('emsSeconds',delta);
        const lat=Number(doc.getElementById('tel-lat')?.textContent),lng=Number(doc.getElementById('tel-lng')?.textContent);
        if(Number.isFinite(lat)&&Number.isFinite(lng)){
          const current={lat,lng};if(previous){const d=haversine(previous,current);if(d>=0.4&&d<300){bump('drivingSeconds',delta);bump('distanceMeters',d)}else bump('stationarySeconds',delta)}previous=current;
        }
        const hud=doc.getElementById('dispatch-hud'),action=doc.getElementById('hud-action-btn'),title=doc.querySelector('#hud-content .hud-title')?.textContent||'',meta=doc.querySelector('#hud-content .hud-meta')?.textContent||'';
        const active=!!hud?.classList.contains('incident-active');
        const next=/Next Call/i.test(action?.textContent||'');
        if(active&&!callActive){
          callActive=true;completedSeen=false;mark('callsStarted');if(service==='ems')mark('emsCalls');else mark('fireCalls');
          const incident=title.includes(':')?title.split(':').slice(1).join(':').trim():title.replace(/^.*DISPATCH\s*/i,'').trim();lastIncident=incident||'unknown';markNamed('incident',lastIncident);
        }
        if(callActive&&next&&!completedSeen){
          completedSeen=true;callActive=false;mark('callsCompleted');
          const response=Number(meta.match(/Response:\s*([\d.]+)\s*s/i)?.[1]);const transport=Number(meta.match(/Transport:\s*([\d.]+)\s*s/i)?.[1]);
          if(Number.isFinite(response))mark('responseMsTotal',response*1000);if(Number.isFinite(transport))mark('transportMsTotal',transport*1000);
        }else if(callActive&&!active&&!hud?.classList.contains('incident-success')){callActive=false;mark('callsAbandoned')}
        scheduleFlush(5000);
      },2000);
    };
    frame.addEventListener('load',()=>setTimeout(install,400));setTimeout(install,400);
  }

  function attachGeoFrame(frame){
    if(!frame||attachedFrames.has(frame))return;attachedFrames.add(frame);
    const install=()=>{let doc;try{doc=frame.contentDocument}catch{return}if(!doc)return;if(doc.documentElement.dataset.ptboGeoAnalytics24==='1')return;doc.documentElement.dataset.ptboGeoAnalytics24='1';
      doc.addEventListener('click',event=>{if(!event.isTrusted)return;const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;mark('geoInteractions');if(button.id==='dispatch-start')mark('geoDrillsStarted');if(button.id==='confirm')mark('geoGuesses');if(button.id==='next-call')mark('geoNextCalls');if(button.id==='end-drill')mark('geoDrillsEnded')},true);
    };frame.addEventListener('load',()=>setTimeout(install,300));setTimeout(install,300);
  }

  document.addEventListener('click',event=>{
    if(!event.isTrusted||!trackingAllowed())return;
    const target=event.target instanceof Element?event.target.closest('[data-analytics-target]'):null;if(target)void recordLaunch(target.dataset.analyticsTarget);
    const city=event.target instanceof Element?event.target.closest('.city-option[data-city]'):null;if(city)void recordCity(city.dataset.city);
    const button=event.target instanceof Element?event.target.closest('button'):null;if(!button)return;
    const id=button.id;
    if(id==='options-button'||id==='menu-toggle')mark('optionsOpens');
    if(id==='audio-button')mark('audioToggles');if(id==='siren-button')mark('sirenToggles');if(id==='recenter-button')mark('recenterUses');if(id==='gear-down')mark('gearShifts');
    if(button.matches('.station-button')){mark('baseSelections');markNamed('base',button.textContent.trim())}
    if(pageType()==='explorer'){
      const map={ 'play-mode':'explorerPlayUses','fly-mode':'explorerFlyUses','map-mode':'explorerMapUses','search-button':'explorerSearchUses','landmarks-button':'explorerLandmarkUses','time-button':'explorerTimeUses','sound-button':'explorerSoundUses' };
      if(map[id])mark(map[id]);
    }
  },true);
  document.addEventListener('pointerdown',event=>{
    if(!event.isTrusted||!trackingAllowed())return;const target=event.target instanceof Element?event.target.closest('#gas-pedal,#reverse-pedal,#steering'):null;if(!target)return;
    if(target.id==='gas-pedal')mark('acceleratorUses');if(target.id==='reverse-pedal')mark('reverseUses');if(target.id==='steering')mark('steeringUses');
  },true);

  function watchStartup(){
    if(pageType()==='dispatch'){
      let done=false;const timer=setInterval(()=>{if(done)return;const stage=window.PTBO_ENHANCEMENT_STAGE?.stage;if(stage==='complete'||stage==='failed'){done=true;clearInterval(timer);mark(stage==='complete'?'startupSuccesses':'startupFailures');mark('startupMsTotal',performance.now())}},500);
    }
    if(pageType()==='explorer'){
      let done=false;const timer=setInterval(()=>{if(done)return;const phase=window.__PTBO_EXPLORER_BOOTSTRAP__?.phase;if(phase==='ready'||phase==='failed'){done=true;clearInterval(timer);mark(phase==='ready'?'startupSuccesses':'startupFailures');mark('startupMsTotal',performance.now())}},500);
    }
  }

  async function fetchCollection(collection){
    const records=[];let pageToken='';for(let page=0;page<10;page+=1){const params=new URLSearchParams({key:API_KEY,pageSize:'1000'});if(pageToken)params.set('pageToken',pageToken);const payload=await firestoreRequest(`${ROOT}/${collection}?${params}`);records.push(...(payload.documents||[]).map(item=>decodeDocument(item,collection)));pageToken=payload.nextPageToken||'';if(!pageToken)break}return records;
  }
  function sum(records,key){return records.reduce((total,item)=>total+num(item[key]),0)}
  function collectDynamic(records,prefix){const out={};for(const record of records){for(const [key,value] of Object.entries(record)){if(key.startsWith(prefix)){const name=key.slice(prefix.length);out[name]=(out[name]||0)+num(value)}}}return out}
  async function loadStats(){
    const settled=await Promise.allSettled([fetchCollection(PRIMARY_COLLECTION),fetchCollection(FALLBACK_COLLECTION)]),all=[];settled.forEach(r=>{if(r.status==='fulfilled')all.push(...r.value)});if(!all.length&&settled.every(r=>r.status==='rejected'))throw new Error('Analytics database is unavailable.');
    const legacy=all.filter(r=>['visitor','session','menu_view','launch','city_select'].includes(r.recordType));
    const summaryMap=new Map();all.filter(r=>r.recordType==='session_summary').forEach(r=>{const key=r.sessionId||r.id,existing=summaryMap.get(key);if(!existing||Date.parse(r.updatedAt||0)>=Date.parse(existing.updatedAt||0))summaryMap.set(key,r)});const summaries=[...summaryMap.values()];
    const visitors=new Set(),sessionIds=new Set();legacy.filter(r=>r.recordType==='visitor').forEach(r=>visitors.add(r.visitorId||r.id));legacy.filter(r=>r.recordType==='session').forEach(r=>sessionIds.add(r.sessionId||r.id));summaries.forEach(r=>{if(r.visitorId)visitors.add(r.visitorId);if(r.sessionId)sessionIds.add(r.sessionId)});
    const launches={};legacy.filter(r=>r.recordType==='launch').forEach(r=>{const k=r.target||'unknown';launches[k]=(launches[k]||0)+1});
    const cities={};legacy.filter(r=>r.recordType==='city_select').forEach(r=>{const k=r.city||'unknown';cities[k]=(cities[k]||0)+1});
    const devices={mobile:0,desktop:0,unknown:0},browsers={};const sessionRows=new Map();legacy.filter(r=>r.recordType==='session').forEach(r=>sessionRows.set(r.sessionId||r.id,r));summaries.forEach(r=>sessionRows.set(r.sessionId||r.id,r));sessionRows.forEach(r=>{const d=['mobile','desktop'].includes(r.surface)?r.surface:'unknown';devices[d]+=1;const b=r.browser||'Unknown';browsers[b]=(browsers[b]||0)+1});
    const visitorSessions={};summaries.forEach(r=>{if(r.visitorId)visitorSessions[r.visitorId]=(visitorSessions[r.visitorId]||0)+1});const returningBrowsers=Object.values(visitorSessions).filter(v=>v>1).length;
    const dates=all.map(r=>Date.parse(r.updatedAt||r.createdAt||r.firstSeenAt)).filter(Number.isFinite).sort((a,b)=>a-b);
    const activeSeconds=sum(summaries,'activeSeconds'),callsStarted=sum(summaries,'callsStarted'),callsCompleted=sum(summaries,'callsCompleted'),startupSuccesses=sum(summaries,'startupSuccesses'),startupFailures=sum(summaries,'startupFailures');
    return Object.freeze({
      version:VERSION,uniqueBrowsers:visitors.size,sessions:sessionIds.size,returningBrowsers,menuViews:legacy.filter(r=>r.recordType==='menu_view').length,launchesTotal:legacy.filter(r=>r.recordType==='launch').length,
      activeSeconds,avgActiveSeconds:summaries.length?activeSeconds/summaries.length:0,pageSeconds:{menu:sum(summaries,'menuSeconds'),dispatch:sum(summaries,'dispatchSeconds'),geoguesser:sum(summaries,'geoguesserSeconds'),explorer:sum(summaries,'explorerSeconds')},
      launches,cities,citySeconds:collectDynamic(summaries,'city_seconds_'),devices,browsers,
      callsStarted,callsCompleted,callsAbandoned:sum(summaries,'callsAbandoned'),fireCalls:sum(summaries,'fireCalls'),emsCalls:sum(summaries,'emsCalls'),completionRate:callsStarted?callsCompleted/callsStarted*100:0,
      avgResponseSeconds:callsCompleted?sum(summaries,'responseMsTotal')/1000/callsCompleted:0,avgTransportSeconds:sum(summaries,'emsCalls')?sum(summaries,'transportMsTotal')/1000/Math.max(1,callsCompleted):0,
      drivingSeconds:sum(summaries,'drivingSeconds'),stationarySeconds:sum(summaries,'stationarySeconds'),distanceMeters:sum(summaries,'distanceMeters'),fireSeconds:sum(summaries,'fireSeconds'),emsSeconds:sum(summaries,'emsSeconds'),
      controls:{options:sum(summaries,'optionsOpens'),settings:sum(summaries,'settingsChanges'),bases:sum(summaries,'baseSelections'),service:sum(summaries,'serviceChanges'),siren:sum(summaries,'sirenToggles'),recenter:sum(summaries,'recenterUses'),reverse:sum(summaries,'reverseUses'),accelerator:sum(summaries,'acceleratorUses'),steering:sum(summaries,'steeringUses'),gear:sum(summaries,'gearShifts'),audio:sum(summaries,'audioToggles')},
      incidents:collectDynamic(summaries,'incident_'),bases:collectDynamic(summaries,'base_'),
      geo:{starts:sum(summaries,'geoDrillsStarted'),guesses:sum(summaries,'geoGuesses'),next:sum(summaries,'geoNextCalls'),ended:sum(summaries,'geoDrillsEnded'),interactions:sum(summaries,'geoInteractions')},
      explorer:{play:sum(summaries,'explorerPlayUses'),fly:sum(summaries,'explorerFlyUses'),map:sum(summaries,'explorerMapUses'),search:sum(summaries,'explorerSearchUses'),landmarks:sum(summaries,'explorerLandmarkUses'),time:sum(summaries,'explorerTimeUses'),sound:sum(summaries,'explorerSoundUses')},
      startupSuccesses,startupFailures,startupSuccessRate:(startupSuccesses+startupFailures)?startupSuccesses/(startupSuccesses+startupFailures)*100:0,avgStartupSeconds:startupSuccesses?sum(summaries,'startupMsTotal')/1000/Math.max(1,startupSuccesses+startupFailures):0,
      firstActivity:dates.length?new Date(dates[0]).toISOString():null,latestActivity:dates.length?new Date(dates[dates.length-1]).toISOString():null,recordCount:all.length,detailedSessions:summaries.length,
    });
  }

  window.PTBO_SITE_ANALYTICS=Object.freeze({version:VERSION,loadStats,recordLaunch,recordCity,trackingAllowed,flush:flushSummary});
  if(!trackingAllowed())return;
  void ensureVisitor();if(pageType()==='menu')void recordMenuView();
  attachSimulatorFrame(document.getElementById('simulator'));attachGeoFrame(document.getElementById('game-frame'));watchStartup();scheduleFlush(2500);
})();