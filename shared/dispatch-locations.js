/* Generic city-aware dispatch location store.
   Each city owns a small dispatch descriptor under cities/<id>/; the store keeps
   normalization/editing behaviour shared and namespaces browser edits by city. */
(() => {
  'use strict';
  const BUILD_VERSION = '1.6.11';
  const STORE_VERSION = 3;
  const scriptUrl = new URL(document.currentScript?.src || location.href, location.href);
  const currentUrl = new URL(typeof location !== 'undefined' && location.href ? location.href : scriptUrl.href);
  const storedCity = (() => { try { return localStorage.getItem('ptboSelectedCity'); } catch (_) { return null; } })();
  const requestedCity = String(currentUrl.searchParams.get('city') || storedCity || 'peterborough').toLowerCase();
  const CITY_ID = /^[a-z0-9-]+$/.test(requestedCity) ? requestedCity : 'peterborough';
  const STORAGE_KEY = `ptboSharedDispatchLocationsV3:${CITY_ID}`;
  const LEGACY_STORAGE_KEY = CITY_ID === 'peterborough' ? 'ptboSharedDispatchLocationsV2' : null;
  const descriptorUrl = new URL(`../cities/${CITY_ID}/dispatch-data.js?v=${BUILD_VERSION}`, scriptUrl).href;

  let dataVersion = 'unloaded';
  let seed = [];
  let items = [];
  let readyPromise;

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

  function normalizeLocation(raw, source) {
    const districtValue = Number(raw?.district);
    const location = {
      id:normalizeText(raw?.id),
      main:normalizeText(raw?.main) || 'Fire',
      sub:normalizeText(raw?.sub) || 'Structure Fire',
      name:normalizeText(raw?.name) || 'Unnamed Location',
      addr:normalizeText(raw?.addr ?? raw?.address) || 'Unknown Address',
      lat:Number(raw?.lat ?? raw?.latitude),
      lng:Number(raw?.lng ?? raw?.longitude),
      radius:Math.max(10,Math.min(500,Number(raw?.radius ?? raw?.targetRadiusMeters) || 50)),
      district:Number.isInteger(districtValue) && districtValue > 0 ? districtValue : undefined,
      cityTen:Boolean(raw?.cityTen),
      confirmed:Boolean(raw?.confirmed),
      sources:Array.isArray(raw?.sources) ? [...new Set(raw.sources.map(normalizeText).filter(Boolean))] : [source].filter(Boolean),
      custom:Boolean(raw?.custom),
    };
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat)>90 || Math.abs(location.lng)>180) return null;
    if (!location.id) location.id = makeId(location);
    return location;
  }

  function clone(list) { return list.map(location => ({...location,sources:[...(location.sources || [])]})); }

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
      if (existing) {
        if (existing.dataset.ptboLoaded === 'true') return resolve(existing);
        existing.addEventListener('load',() => resolve(existing),{once:true});
        existing.addEventListener('error',() => reject(new Error(`Unable to load ${url}.`)),{once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = url;
      script.dataset[marker] = CITY_ID;
      script.onload = () => {script.dataset.ptboLoaded='true';resolve(script);};
      script.onerror = () => reject(new Error(`Unable to load ${url}.`));
      (document.head || document.body || document.documentElement).appendChild(script);
    });
  }

  async function loadData() {
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
      if (!compatibleVersion || parsed.dataVersion !== dataVersion || !Array.isArray(parsed.items)) continue;
      return normalizeList(parsed.items,'saved');
    }
    return null;
  }

  function persist(nextItems = items) {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify({version:STORE_VERSION,cityId:CITY_ID,dataVersion,savedAt:new Date().toISOString(),items:nextItems}));
    } catch (error) {
      throw new Error('Changes could not be saved on this device. Free browser storage and try again, or export your edits.',{cause:error});
    }
  }

  function announce() { window.dispatchEvent(new CustomEvent('ptbo-dispatch-updated',{detail:{cityId:CITY_ID,count:items.length,version:dataVersion}})); }

  async function initialize() {
    const supplied = await loadData();
    seed = normalizeList(await supplied,'source');
    items = readSaved() || clone(seed);
    console.info(`${CITY_ID} dispatch database v${dataVersion} loaded: ${items.length} calls.`);
    return clone(items);
  }

  function ready() { if (!readyPromise) readyPromise = initialize(); return readyPromise; }
  function getAll() { return clone(items); }
  function replaceAll(nextItems) { const next=normalizeList(nextItems,'editor');persist(next);items=next;announce();return getAll(); }
  function upsert(raw) { const location=normalizeLocation(raw,'editor');if(!location)throw new Error('A dispatch location needs valid latitude and longitude values.');const index=items.findIndex(item=>item.id===location.id),next=clone(items);if(index>=0)next[index]=location;else next.push(location);persist(next);items=next;announce();return {...location,sources:[...location.sources]}; }
  function remove(id) { const next=items.filter(item=>item.id!==id);persist(next);items=next;announce();return getAll(); }
  function createId(raw) { const normalized=normalizeLocation({...raw,id:''},'editor');const base=normalized?makeId(normalized):`call-custom-${Date.now().toString(36)}`;let candidate=base,suffix=2;while(items.some(item=>item.id===candidate))candidate=`${base}-${suffix++}`;return candidate; }
  function reset() { const next=clone(seed);persist(next);items=next;announce();return getAll(); }
  function exportText(exportItems=items) { const data=normalizeList(exportItems,'editor');return `window.PTBO_DISPATCH_DATA_VERSION = ${JSON.stringify(dataVersion)};\nwindow.PTBO_DISPATCH_DATA_READY = Promise.resolve(${JSON.stringify(data,null,2)});\n`; }

  window.PTBO_DISPATCH_STORE = Object.freeze({cityId:CITY_ID,ready,getAll,replaceAll,upsert,remove,createId,reset,exportText,storageKey:STORAGE_KEY,get dataVersion(){return dataVersion;}});
  window.PTBO_DISPATCH_STORE_READY = ready();
})();
