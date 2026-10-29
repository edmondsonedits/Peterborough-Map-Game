/* Generic city-aware dispatch location store.
   Each city owns a small dispatch descriptor under cities/<id>/; the store keeps
   normalization/editing behaviour shared and namespaces browser edits by city. */
(() => {
  'use strict';
  const STORE_VERSION = 3;
  const scriptUrl = new URL(document.currentScript?.src || location.href, location.href);
  const BUILD_VERSION = String(window.PTBO_BUILD?.version || scriptUrl.searchParams.get('v') || '1.6.112');
  const currentUrl = new URL(typeof location !== 'undefined' && location.href ? location.href : scriptUrl.href);
  const storedCity = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requestedCity = String(scriptUrl.searchParams.get('city') || currentUrl.searchParams.get('city') || storedCity || 'peterborough').toLowerCase();
  const CITY_ID = /^[a-z0-9-]+$/.test(requestedCity) ? requestedCity : 'peterborough';
  const STORAGE_KEY = `ptboSharedDispatchLocationsV3:${CITY_ID}`;
  const LEGACY_STORAGE_KEY = CITY_ID === 'peterborough' ? 'ptboSharedDispatchLocationsV2' : null;
  const descriptorUrl = new URL(`../cities/${CITY_ID}/dispatch-data.js?v=${BUILD_VERSION}`, scriptUrl).href;

  let dataVersion = 'unloaded';
  let seed = [];
  let items = [];
  let readyPromise;
  let trainingDataPromise;
  let trainingData = null;
  let trainingCareHomeIds = [];
  let savedTrainingCareHomeIds = null;
  let trainingSharedLocationIds = [];
  let savedTrainingSharedLocationIds = null;
  let migrationCanonicalIds = new Set();
  let legacyPreviewMigration = false;

  const normalizeText = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const keyText = value => normalizeText(value).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const hash = text => {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(36);
  };
  const slug = text => keyText(text).replace(/\s+/g, '-').slice(0, 48) || 'location';

  function makeId(location) {
    const identity = [location.main,location.sub,location.name,location.addr].map(keyText).join('|');
    return `call-${slug(location.name)}-${hash(identity)}`;
  }

  function validPoint(point) {
    return point && !Array.isArray(point) && ['lat','lng'].every(key =>
      point[key] != null && typeof point[key] !== 'boolean' && String(point[key]).trim() !== '' && Number.isFinite(Number(point[key]))) &&
      Math.abs(Number(point.lat)) <= 90 && Math.abs(Number(point.lng)) <= 180;
  }

  function normalizeLocation(raw, source) {
    if (raw?.routeAccess !== undefined && !validPoint(raw.routeAccess)) return null;
    const latValue=raw?.lat ?? raw?.latitude, lngValue=raw?.lng ?? raw?.longitude;
    if (latValue == null || lngValue == null || String(latValue).trim() === '' || String(lngValue).trim() === '') return null;
    const districtValue = Number(raw?.district);
    const location = {
      id:normalizeText(raw?.id),
      main:normalizeText(raw?.main) || 'Fire',
      sub:normalizeText(raw?.sub) || 'Structure Fire',
      name:normalizeText(raw?.name),
      addr:normalizeText(raw?.addr ?? raw?.address) || 'Unknown Address',
      lat:Number(raw?.lat ?? raw?.latitude),
      lng:Number(raw?.lng ?? raw?.longitude),
      radius:Math.max(10,Math.min(500,Number(raw?.radius ?? raw?.targetRadiusMeters) || 50)),
      district:Number.isInteger(districtValue) && districtValue > 0 ? districtValue : undefined,
      cityTen:Boolean(raw?.cityTen),
      confirmed:Boolean(raw?.confirmed),
      sources:Array.isArray(raw?.sources) ? [...new Set(raw.sources.map(normalizeText).filter(Boolean))] : [source].filter(Boolean),
      custom:Boolean(raw?.custom),
      recognitionDifficulty:['easy','medium','hard'].includes(raw?.recognitionDifficulty) ? raw.recognitionDifficulty : null,
      crossStreets:Array.isArray(raw?.crossStreets) ? [...new Set(raw.crossStreets.map(normalizeText).filter(Boolean))].slice(0,2) : [],
      sourceCallIds:Array.isArray(raw?.sourceCallIds) ? raw.sourceCallIds.map(normalizeText).filter(Boolean) : [],
      incidentProfiles:raw?.incidentProfiles ? JSON.parse(JSON.stringify(raw.incidentProfiles)) : undefined,
      facilityType:normalizeText(raw?.facilityType) || undefined,
      trainingServices:Array.isArray(raw?.trainingServices) ? [...new Set(raw.trainingServices.map(value=>normalizeText(value).toLowerCase()).filter(value=>['fire','ems'].includes(value)))] : undefined,
      providerId:normalizeText(raw?.providerId) || undefined,
      community:normalizeText(raw?.community) || undefined,
      cityId:normalizeText(raw?.cityId) || undefined,
      locationKind:normalizeText(raw?.locationKind) || undefined,
      difficultyReason:normalizeText(raw?.difficultyReason) || undefined,
      routeAccess:raw?.routeAccess ? {...JSON.parse(JSON.stringify(raw.routeAccess)),lat:Number(raw.routeAccess.lat),lng:Number(raw.routeAccess.lng)} : undefined,
      geographicVerificationRef:normalizeText(raw?.geographicVerificationRef) || undefined,
    };
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat)>90 || Math.abs(location.lng)>180) return null;
    if (!location.id) location.id = makeId(location);
    return location;
  }

  function clone(list) { return JSON.parse(JSON.stringify(list)); }

  function distanceMetres(a,b) {
    const radians=value=>value*Math.PI/180;
    const latDelta=radians(b.lat-a.lat),lngDelta=radians(b.lng-a.lng);
    const h=Math.sin(latDelta/2)**2+Math.cos(radians(a.lat))*Math.cos(radians(b.lat))*Math.sin(lngDelta/2)**2;
    return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
  }

  function mergeTrainingLocations(locations, descriptor) {
    if (descriptor.sharedLocations !== undefined && !Array.isArray(descriptor.sharedLocations)) {
      throw new Error(`Training data for ${CITY_ID} has an invalid sharedLocations array.`);
    }
    const canonical=normalizeList(locations,'source');
    const byId=new Map(canonical.map(item=>[item.id,item]));
    const seen=new Set(), supplemental=[];
    for (const raw of descriptor.sharedLocations || []) {
      const item=normalizeLocation(raw,'training');
      if (!item || !validPoint({lat:raw.lat ?? raw.latitude,lng:raw.lng ?? raw.longitude}) || typeof raw.id !== 'string' || !raw.id.trim() || !normalizeText(raw.name) ||
          !normalizeText(raw.addr ?? raw.address) || (raw.cityId !== undefined && raw.cityId !== descriptor.id)) {
        throw new Error(`Training data for ${CITY_ID} contains an invalid shared location or city id.`);
      }
      if (seen.has(item.id)) throw new Error(`Training data for ${CITY_ID} repeats shared location id ${item.id}.`);
      seen.add(item.id);
      const existing=byId.get(item.id);
      if (existing) {
        if (keyText(existing.addr)!==keyText(item.addr) || distanceMetres(existing,item)>=20) {
          throw new Error(`Training shared location id ${item.id} conflicts with a dispatch location.`);
        }
        // The original canonical seed remains authoritative for its coordinates and labels.
        continue;
      }
      if (!item.recognitionDifficulty) {
        throw new Error(`Training shared location ${item.id} has an invalid recognition difficulty.`);
      }
      if ([...canonical,...supplemental].some(other=>keyText(other.addr)===keyText(item.addr) && distanceMetres(other,item)<20)) {
        throw new Error(`Training shared location ${item.id} conflicts with an existing address and point.`);
      }
      item.incidentProfiles={
        fire:{sub:'Structure Fire'},ems:{sub:'Medical Assistance'},...item.incidentProfiles,
      };
      for (const service of ['fire','ems']) {
        if (!normalizeText(item.incidentProfiles[service]?.sub)) {
          throw new Error(`Training shared location ${item.id} has an invalid ${service} incident profile.`);
        }
      }
      item.trainingServices=['fire','ems'];
      supplemental.push(item);
    }
    trainingSharedLocationIds=supplemental.map(item=>item.id);
    return [...canonical,...supplemental];
  }

  function mergeTrainingHomes(locations, descriptor) {
    if (!descriptor || descriptor.schemaVersion!==1 || descriptor.id!==CITY_ID || !Array.isArray(descriptor.careHomes)) {
      throw new Error(`Training data for ${CITY_ID} has an invalid schema or city id.`);
    }
    const canonical=mergeTrainingLocations(locations,descriptor);
    const byAddress=new Map();
    for (const item of canonical) {
      const address=keyText(item.addr);
      if(!byAddress.has(address))byAddress.set(address,[]);
      byAddress.get(address).push(item);
    }
    const seenHomes=new Set(),matchedCanonical=new Set(),supplemental=[];
    for(const raw of descriptor.careHomes){
      const home=normalizeLocation(raw,'MOHSERLO');
      if(!home||!home.id.startsWith('moh-ltc-')||!home.name||!home.addr)throw new Error(`Training data for ${CITY_ID} contains an invalid care-home record.`);
      if(seenHomes.has(home.id))throw new Error(`Training data for ${CITY_ID} repeats care-home id ${home.id}.`);
      seenHomes.add(home.id);
      const matches=(byAddress.get(keyText(home.addr))||[])
        .map(item=>({item,distance:distanceMetres(item,home)}))
        .filter(match=>match.distance<100&&!matchedCanonical.has(match.item.id))
        .sort((a,b)=>a.distance-b.distance);
      const match=matches[0]?.item;
      if(match){
        match.facilityType='long-term-care';
        match.providerId=home.providerId;
        match.community=home.community;
        match.sources=[...new Set([...match.sources,...home.sources])];
        matchedCanonical.add(match.id);
      }else{
        if(canonical.some(item=>item.id===home.id)||supplemental.some(item=>item.id===home.id))throw new Error(`Training data care-home id ${home.id} conflicts with a dispatch location.`);
        supplemental.push({...home,facilityType:'long-term-care',trainingServices:['ems']});
      }
    }
    trainingCareHomeIds=supplemental.map(home=>home.id);
    return [...canonical,...supplemental];
  }

  function loadTrainingData() {
    if(!trainingDataPromise){
      const url=new URL(`../cities/${CITY_ID}/training-data.json?v=${encodeURIComponent(BUILD_VERSION)}`,scriptUrl).href;
      trainingDataPromise=Promise.resolve().then(async()=>{
        if(typeof window.fetch!=='function')throw new Error(`Training data for ${CITY_ID} cannot load because fetch is unavailable.`);
        const timeoutMs=Math.max(1,Number(window.PTBO_TRAINING_DATA_TIMEOUT_MS)||12000);
        const controller=typeof AbortController==='function'?new AbortController():null;
        let timer;
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(new Error(`Training data for ${CITY_ID} timed out after ${timeoutMs} ms.`));},timeoutMs);});
        try{
          const request=(async()=>{
            const response=await window.fetch(url,controller?{signal:controller.signal}:undefined);
            if(!response?.ok)throw new Error(`Training data for ${CITY_ID} could not load (HTTP ${response?.status||'unknown'}).`);
            return response.json();
          })();
          return await Promise.race([request,timeout]);
        }finally{clearTimeout(timer);}
      }).then(value=>{
        if(!value||value.schemaVersion!==1||value.id!==CITY_ID||!Array.isArray(value.careHomes))throw new Error(`Training data for ${CITY_ID} has an invalid schema or city id.`);
        trainingData=value;
        return value;
      }).catch(error=>{trainingDataPromise=null;throw error;});
    }
    return trainingDataPromise;
  }

  async function requireEmsPriority() {
    if(window.PTBO_EMS_PRIORITY)return window.PTBO_EMS_PRIORITY;
    const url=new URL(`./ems-priority.js?v=${encodeURIComponent(BUILD_VERSION)}`,scriptUrl).href;
    await injectScript(url,'ptboEmsPriority');
    if(!window.PTBO_EMS_PRIORITY)throw new Error('Shared EMS care-home priority policy did not initialize.');
    return window.PTBO_EMS_PRIORITY;
  }

  function restoreTrainingMetadata(savedItems) {
    if(!Array.isArray(savedItems))return clone(seed);
    const seedById=new Map(seed.map(item=>[item.id,item]));
    const savedById=new Map(savedItems.map(item=>[item.id,item]));
    const restored=savedItems.map(item=>{
      const original=seedById.get(item.id);
      if(!original)return item;
      const metadata={};
      for(const key of ['locationKind','difficultyReason','routeAccess','geographicVerificationRef','cityId']) {
        if(item[key] == null && original[key] != null)metadata[key]=original[key];
      }
      if(original.facilityType)Object.assign(metadata,{facilityType:original.facilityType,providerId:original.providerId,community:original.community,
        ...(original.trainingServices?{trainingServices:original.trainingServices}:{}),
        sources:[...new Set([...(item.sources||[]),...(original.sources||[])])]});
      return {...item,...metadata};
    });
    const priorIds=new Set([...(savedTrainingCareHomeIds||[]),...(savedTrainingSharedLocationIds||[])]);
    const supplementalIds=new Set([...trainingCareHomeIds,...trainingSharedLocationIds]);
    if (legacyPreviewMigration) {
      // A pre-Geo preview had no Geo seed locations. Add those newly published
      // records, but respect any IDs recorded in the old supplemental history.
      if (!savedTrainingSharedLocationIds) trainingSharedLocationIds.forEach(id=>priorIds.add(id));
      if (!savedTrainingCareHomeIds) trainingCareHomeIds.forEach(id=>priorIds.add(id));
      for (const item of seed) if (migrationCanonicalIds.has(item.id) && !savedById.has(item.id) && !priorIds.has(item.id)) restored.push(item);
    }
    for(const home of seed.filter(item=>supplementalIds.has(item.id))){
      if(savedById.has(home.id)||priorIds.has(home.id))continue;
      restored.push(home);
    }
    return normalizeList(restored,'saved');
  }

  // Addresses are shared; scenario labels belong to the selected simulator service.
  function forService(service) {
    return getAll().map(item => {
      if(Array.isArray(item.trainingServices)&&!item.trainingServices.includes(service))return null;
      const profile=item.incidentProfiles?.[service];
      return profile ? {...item,main:service==='ems'?'Medical':'Fire',sub:profile.sub} : item;
    }).filter(Boolean);
  }

  function normalizeList(list, source) {
    const usedIds = new Set();
    return (Array.isArray(list) ? list : []).map(item => normalizeLocation(item,source)).filter(Boolean).map(location => {
      const base = location.id || makeId(location);
      let candidate = base;
      let suffix = 2;
      while (usedIds.has(candidate)) candidate = `${base}-${suffix++}`;
      location.id = candidate;
      usedIds.add(candidate);
      return location;
    });
  }

  function injectScript(url, marker) {
    return new Promise((resolve,reject) => {
      const scripts = document.scripts ? [...document.scripts] : [];
      const existing = scripts.find(script => script.dataset?.[marker] === CITY_ID || script.src === url);
      const script = existing || document.createElement('script');
      let settled=false;
      const timeoutMs=Math.max(1,Number(window.PTBO_TRAINING_DATA_TIMEOUT_MS)||12000);
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error){script.remove?.();reject(error);}else{script.dataset.ptboLoaded='true';resolve(script);}};
      const timer=setTimeout(()=>finish(new Error(`Loading ${url} timed out after ${timeoutMs} ms.`)),timeoutMs);
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') return finish();
        existing.addEventListener('load',() => finish(),{once:true});
        existing.addEventListener('error',() => finish(new Error(`Unable to load ${url}.`)),{once:true});
        return;
      }
      script.src = url;
      script.dataset[marker] = CITY_ID;
      script.onload = () => finish();
      script.onerror = () => finish(new Error(`Unable to load ${url}.`));
      (document.head || document.body || document.documentElement).appendChild(script);
    });
  }

  async function loadData() {
    // Simulator wrappers start this store before the city package parser script.
    // Wait for non-Peterborough packages to choose the canonical source once.
    if (CITY_ID !== 'peterborough' && /\/response-simulator\/(?:play|mobile)\//.test(currentUrl.pathname)) {
      const start=Date.now();
      while (!window.PTBO_CITY_PACKAGE || window.PTBO_CITY_PACKAGE.id!==CITY_ID || !window.PTBO_CITY_PACKAGE_READY) {
        if(window.PTBO_CITY_PACKAGE_LOAD_ERROR) throw window.PTBO_CITY_PACKAGE_LOAD_ERROR;
        if(Date.now()-start>15000) throw new Error(`City package for ${CITY_ID} did not become ready.`);
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      await window.PTBO_CITY_PACKAGE_READY;
    }
    if (window.PTBO_CITY_PACKAGE?.features?.sceneResponseDrills === true) {
      await window.PTBO_CITY_PACKAGE_READY;
      if (window.PTBO_CITY_PACKAGE?.id !== CITY_ID || !window.PTBO_DISPATCH_DATA_READY) throw new Error(`Canonical dispatch locations for ${CITY_ID} did not initialize.`);
      dataVersion=String(window.PTBO_DISPATCH_DATA_VERSION || 'ontario-geo-1');
      return window.PTBO_DISPATCH_DATA_READY;
    }
    // Tests and legacy standalone embeds may already supply a resolved payload.
    if (window.PTBO_DISPATCH_DATA_READY && !window.PTBO_CITY_DISPATCH_SOURCE) {
      dataVersion = String(window.PTBO_DISPATCH_DATA_VERSION || (CITY_ID === 'peterborough' ? '1.4.20' : '1'));
      return window.PTBO_DISPATCH_DATA_READY;
    }
    if (!window.PTBO_CITY_DISPATCH_SOURCE || window.PTBO_CITY_DISPATCH_SOURCE.cityId !== CITY_ID) await injectScript(descriptorUrl,'ptboCityDispatchDescriptor');
    const descriptor = window.PTBO_CITY_DISPATCH_SOURCE;
    if (!descriptor || descriptor.cityId !== CITY_ID || !descriptor.url) throw new Error(`Dispatch descriptor for ${CITY_ID} did not initialize.`);
    dataVersion = String(descriptor.version || '1');
    if (!window.PTBO_DISPATCH_DATA_READY) await injectScript(descriptor.url,'ptboCityDispatchPayload');
    if (!window.PTBO_DISPATCH_DATA_READY) throw new Error(`Dispatch data for ${CITY_ID} did not initialize.`);
    return window.PTBO_DISPATCH_DATA_READY;
  }

  function readSaved() {
    const candidates = [];
    try {
      const current = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (current) candidates.push(current);
      if (LEGACY_STORAGE_KEY) {
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null');
        if (legacy) candidates.push(legacy);
      }
    } catch (error) { console.warn(`Dispatch edits for ${CITY_ID} could not be read.`,error); }
    for (const parsed of candidates) {
      const compatibleVersion = parsed.version === STORE_VERSION || (CITY_ID === 'peterborough' && parsed.version === 2);
      if (!compatibleVersion || !Array.isArray(parsed.items) || (parsed.cityId != null && parsed.cityId !== CITY_ID)) continue;
      const oldPreview = ['oshawa','pickering','markham','toronto'].includes(CITY_ID) && dataVersion === 'ontario-geo-1' && parsed.dataVersion === '1.6.8';
      if (parsed.dataVersion === dataVersion || oldPreview) {
        legacyPreviewMigration=oldPreview;
        savedTrainingCareHomeIds=Array.isArray(parsed.trainingCareHomeIds)?parsed.trainingCareHomeIds.map(normalizeText):null;
        savedTrainingSharedLocationIds=Array.isArray(parsed.trainingSharedLocationIds)?parsed.trainingSharedLocationIds.map(normalizeText):null;
        return normalizeList(parsed.items,'saved');
      }
      if (CITY_ID === 'peterborough' && parsed.dataVersion === '1.4.20' && window.PTBO_DISPATCH_LEGACY_LOCATIONS) {
        return migrateLegacy(parsed);
      }
    }
    return null;
  }

  function migrateLegacy(saved) {
    const baseline=normalizeList(window.PTBO_DISPATCH_LEGACY_LOCATIONS,'source');
    const originals=new Map(baseline.map(item=>[item.id,item]));
    const previous=normalizeList(saved.items,'saved'), byId=new Map(previous.map(item=>[item.id,item]));
    const next=clone(seed), byAlias=new Map();
    for(const item of next)for(const alias of item.sourceCallIds)byAlias.set(alias,item);
    const deleted=new Set();
    for(const original of baseline){
      const edited=byId.get(original.id), destination=byAlias.get(original.id);
      if(!edited){if(destination&&destination.sourceCallIds.every(alias=>!byId.has(alias)))deleted.add(destination.id);continue;}
      const changes=Object.fromEntries(Object.keys(edited).filter(key=>!['id','sourceCallIds','sources'].includes(key)&&JSON.stringify(edited[key])!==JSON.stringify(original[key])).map(key=>[key,edited[key]]));
      if(!Object.keys(changes).length)continue;
      if(destination){
        Object.assign(destination,changes);
        if(changes.main||changes.sub){
          const service=destination.main==='Medical'?'ems':'fire';
          destination.incidentProfiles={...destination.incidentProfiles,[service]:{sub:destination.sub}};
        }
      }
      else next.push({...edited,custom:true});
    }
    for(const edited of previous)if(!originals.has(edited.id))next.push(edited);
    // Original snapshot remains recoverable before the first subsequent save.
    try{localStorage.setItem(`${STORAGE_KEY}:before-${dataVersion}`,JSON.stringify(saved));}catch(_){/* The original key is still untouched. */}
    return normalizeList(next.filter(item=>!deleted.has(item.id)),'saved');
  }

  function persist(nextItems = items) {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({version:STORE_VERSION,cityId:CITY_ID,dataVersion,trainingCareHomeIds,trainingSharedLocationIds:[...new Set([...(savedTrainingSharedLocationIds||[]),...trainingSharedLocationIds])],savedAt:new Date().toISOString(),items:nextItems}));
    } catch (error) {
      throw new Error('Changes could not be saved on this device. Free browser storage and try again, or export your edits.',{cause:error});
    }
  }

  function announce() { window.dispatchEvent(new CustomEvent('ptbo-dispatch-updated',{detail:{cityId:CITY_ID,count:items.length,version:dataVersion}})); }

  async function initialize() {
    const supplied = await loadData();
    const [rawLocations,descriptor]=await Promise.all([supplied,loadTrainingData()]);
    await requireEmsPriority();
    migrationCanonicalIds=new Set(normalizeList(rawLocations,'source').map(item=>item.id));
    seed = normalizeList(mergeTrainingHomes(rawLocations,descriptor),'source');
    items = restoreTrainingMetadata(readSaved());
    console.info(`${CITY_ID} dispatch database v${dataVersion} loaded: ${items.length} calls.`);
    return clone(items);
  }

  function ready() { if (!readyPromise) readyPromise = initialize().catch(error=>{readyPromise=null;throw error;}); return readyPromise; }
  function getAll() { return clone(items); }
  function replaceAll(nextItems) { const next=normalizeList(nextItems,'editor');persist(next);items=next;announce();return getAll(); }
  function upsert(raw) { const location=normalizeLocation(raw,'editor');if(!location)throw new Error('A dispatch location needs valid latitude and longitude values.');const index=items.findIndex(item=>item.id===location.id),next=clone(items);if(index>=0)next[index]=location;else next.push(location);persist(next);items=next;announce();return clone([location])[0]; }
  function remove(id) { const next=items.filter(item=>item.id!==id);persist(next);items=next;announce();return getAll(); }
  function createId(raw) { const normalized=normalizeLocation({...raw,id:''},'editor');const base=normalized?makeId(normalized):`call-custom-${Date.now().toString(36)}`;let candidate=base,suffix=2;while(items.some(item=>item.id===candidate))candidate=`${base}-${suffix++}`;return candidate; }
  function reset() { const next=clone(seed);persist(next);items=next;announce();return getAll(); }
  function exportText(exportItems=items) { const data=normalizeList(exportItems,'editor');return `window.PTBO_DISPATCH_DATA_VERSION = ${JSON.stringify(dataVersion)};\nwindow.PTBO_DISPATCH_DATA_READY = Promise.resolve(${JSON.stringify(data,null,2)});\n`; }

  window.PTBO_DISPATCH_STORE = Object.freeze({cityId:CITY_ID,ready,getAll,getSeed:()=>clone(seed),getTrainingData:()=>trainingData?clone(trainingData):null,forService,replaceAll,upsert,remove,createId,reset,exportText,storageKey:STORAGE_KEY,get dataVersion(){return dataVersion;}});
  window.PTBO_DISPATCH_STORE_READY = ready();
})();
