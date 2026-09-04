/* Generic Fire/EMS base store. Supports synchronous Peterborough data and asynchronous base-training city packages. */
(() => {
  'use strict';
  const VERSION = '1.6.11';
  if (window.PTBO_BASE_STORE_VERSION === VERSION && window.PTBO_BASE_STORE) return;

  const config = window.PTBO_SERVICE_CONFIG;
  const city = window.PTBO_CITY_PACKAGE;
  const diff = window.PTBO_LOCATION_CHANGES?.diff;
  if (!config || !city || !diff) throw new Error('City service configuration did not load before the base store.');

  const cityId = city.id;
  const storageKey = `ptboBaseLocationChangesV1:${cityId}`;
  const hospitalKey = `ptboHospitalChangesV1:${cityId}`;
  const legacyStorageKey = cityId === 'peterborough' ? 'ptboBaseLocationChangesV1' : null;
  const legacyHospitalKey = cityId === 'peterborough' ? 'ptboHospitalChangesV1' : null;
  const copy = value => JSON.parse(JSON.stringify(value));
  const referenceLat = Number(city.roads?.center?.[0] ?? city.map?.defaultCenter?.[0] ?? 44.3091);
  const metresLat = 110540;
  const metresLng = 111320 * Math.cos(referenceLat * Math.PI / 180);

  function buildSeed() {
    const usedIds = new Set();
    const usedNumbers = new Set();
    return Object.values(config.profiles || {}).flatMap(profile => (profile.bases || []).map((base,index) => {
      const service = String(profile.id);
      let number = Number(base.number);
      if (!Number.isInteger(number) || number < 1 || usedNumbers.has(`${service}:${number}`)) number = index + 1;
      while (usedNumbers.has(`${service}:${number}`)) number += 1;
      usedNumbers.add(`${service}:${number}`);

      const rawId = String(base.id || `${service}-base-${number}`).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
      const root = rawId.startsWith(`${service}-`) ? rawId : `${service}-${rawId || `base-${number}`}`;
      let id = root;
      if (usedIds.has(id)) id = `${root}-${number}`;
      let suffix = 2;
      while (usedIds.has(id)) id = `${root}-${number}-${suffix++}`;
      usedIds.add(id);

      return {yardSize:160,yardRotation:0,...base,id,number,service};
    }));
  }

  function validate(list) {
    const ids = new Set();
    const numbers = new Set();
    return list.map(raw => {
      const base = {
        id:String(raw.id),
        service:String(raw.service),
        number:Number(raw.number),
        name:String(raw.name ?? '').trim(),
        shortName:String(raw.shortName ?? raw.name ?? '').trim(),
        address:String(raw.address ?? '').trim(),
        lat:Number(raw.lat),
        lng:Number(raw.lng),
        yardSize:Number(raw.yardSize ?? 160),
        yardRotation:Number(raw.yardRotation ?? 0),
      };
      if (!/^[a-z0-9-]+$/.test(base.id) || ids.has(base.id)) throw new Error('Base IDs must be unique.');
      if (!['fire','ems'].includes(base.service) || !Number.isInteger(base.number) || base.number < 1 || numbers.has(`${base.service}:${base.number}`)) throw new Error('Base numbers must be unique within each service.');
      if (!base.name || !base.shortName || !base.address) throw new Error('Enter a base name, short name and address.');
      if (![base.lat,base.lng,base.yardSize,base.yardRotation].every(Number.isFinite) || Math.abs(base.lat)>85 || Math.abs(base.lng)>180 || base.yardSize<10 || base.yardSize>400 || base.yardRotation<0 || base.yardRotation>=360) throw new Error('Use valid coordinates, a square size of 10–400 m, and rotation of 0–359°.');
      ids.add(base.id);
      numbers.add(`${base.service}:${base.number}`);
      return base;
    });
  }

  function readJson(primaryKey, legacyKey) {
    try {
      const primary = localStorage.getItem(primaryKey);
      if (primary) return JSON.parse(primary);
      const legacy = legacyKey ? localStorage.getItem(legacyKey) : null;
      return legacy ? JSON.parse(legacy) : null;
    } catch (_) { return null; }
  }

  let seed = buildSeed();

  function readSaved() {
    try {
      const delta = readJson(storageKey, legacyStorageKey);
      if (!delta || delta.schema !== 1) return validate(copy(seed));
      const records = new Map(seed.map(base => [base.id,{...base}]));
      for (const update of delta.updated || []) if (records.has(update.id)) Object.assign(records.get(update.id), update.changes, {id:update.id});
      for (const base of delta.added || []) if (!records.has(base.id)) records.set(base.id, base);
      for (const entry of delta.deleted || []) records.delete(entry.id);
      return validate([...records.values()]);
    } catch (error) {
      console.warn(`Unable to restore ${cityId} base edits.`, error);
      return validate(copy(seed));
    }
  }

  let items = readSaved();

  function validateHospital(raw) {
    const source = raw || {};
    const h = {...config.hospital,...source,id:config.hospital.id,name:String(source.name ?? config.hospital.name).trim(),addr:String(source.addr ?? config.hospital.addr).trim(),lat:Number(source.lat ?? config.hospital.lat),lng:Number(source.lng ?? config.hospital.lng),radius:Number(source.radius ?? config.hospital.radius)};
    if (!h.name || !h.addr || ![h.lat,h.lng,h.radius].every(Number.isFinite) || Math.abs(h.lat)>85 || Math.abs(h.lng)>180 || h.radius<10 || h.radius>200) throw new Error('Enter a hospital name, address, valid coordinates, and arrival radius of 10–200 m.');
    return h;
  }

  function readHospital() {
    try {
      const saved = readJson(hospitalKey, legacyHospitalKey) || {};
      return validateHospital({...config.hospital,...saved.changes});
    } catch (error) {
      console.warn(`Unable to restore ${cityId} hospital edits.`, error);
      return {...config.hospital};
    }
  }

  let hospital = readHospital();

  function saveHospital(raw) {
    const next = validateHospital(raw);
    const delta = diff([config.hospital],[next]);
    try { localStorage.setItem(hospitalKey, JSON.stringify(delta.updated[0] || {})); }
    catch { throw new Error('Hospital changes could not be saved. Free browser storage and try again.'); }
    hospital = next;
    window.dispatchEvent(new CustomEvent('ptbo-hospital-updated',{detail:{cityId}}));
    return {...hospital};
  }

  function requireLoadedServices(list) {
    const expected = Object.keys(config.profiles || {});
    if (!seed.length && city.features?.baseTraining) throw new Error(`${city.name} base data is still loading.`);
    for (const service of expected) if (!list.some(base => base.service === service)) throw new Error(`Keep at least one ${service.toUpperCase()} base.`);
  }

  function replaceAll(list) {
    const next = validate(list);
    requireLoadedServices(next);
    try { localStorage.setItem(storageKey, JSON.stringify({schema:1,cityId,...diff(seed,next)})); }
    catch { throw new Error('Base changes could not be saved. Free browser storage and try again.'); }
    items = next;
    window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'editor'}}));
    return copy(items);
  }

  function refreshFromCityPackage() {
    const nextSeed = buildSeed();
    if (!nextSeed.length) return false;
    seed = nextSeed;
    items = readSaved();
    hospital = readHospital();
    window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'city-package',count:items.length}}));
    return true;
  }

  function corners(base) {
    const half=Number(base.yardSize || 160)/2,angle=Number(base.yardRotation || 0)*Math.PI/180;
    return [[-half,-half],[half,-half],[half,half],[-half,half]].map(([x,y]) => {
      const east=x*Math.cos(angle)-y*Math.sin(angle),north=x*Math.sin(angle)+y*Math.cos(angle);
      return [base.lat+north/metresLat,base.lng+east/metresLng];
    });
  }

  function contains(base,lat,lng) {
    const east=(lng-base.lng)*metresLng,north=(lat-base.lat)*metresLat,angle=Number(base.yardRotation || 0)*Math.PI/180;
    return Math.abs(east*Math.cos(angle)+north*Math.sin(angle))<=Number(base.yardSize || 160)/2+1e-7 && Math.abs(-east*Math.sin(angle)+north*Math.cos(angle))<=Number(base.yardSize || 160)/2+1e-7;
  }

  function roadAccess(base, roads) {
    const angle=Number(base.yardRotation||0)*Math.PI/180,half=Number(base.yardSize||160)/2;
    const local=point=>{const e=(point[0]-base.lng)*metresLng,n=(point[1]-base.lat)*metresLat;return [e*Math.cos(angle)+n*Math.sin(angle),-e*Math.sin(angle)+n*Math.cos(angle)];};
    for (const feature of roads?.features || []) {
      const lines=feature.geometry?.type==='LineString'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiLineString'?feature.geometry.coordinates:[];
      for (const line of lines) for(let i=1;i<line.length;i++) {
        const a=local(line[i-1]),b=local(line[i]);let lo=0,hi=1;
        for(let axis=0;axis<2;axis++) {const d=b[axis]-a[axis];if(Math.abs(d)<1e-10){if(Math.abs(a[axis])>half){hi=-1;break;}}else{const p=(-half-a[axis])/d,q=(half-a[axis])/d;lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));}}
        if(lo<=hi)return true;
      }
    }
    return false;
  }

  const api = Object.freeze({version:VERSION,cityId,getAll:()=>copy(items),getSeed:()=>copy(seed),getHospital:()=>({...hospital}),getHospitalSeed:()=>({...config.hospital}),saveHospital,getBases:service=>copy(items.filter(base=>base.service===service).sort((a,b)=>a.number-b.number)),replaceAll,refreshFromCityPackage,corners,contains,roadAccess,storageKey,hospitalKey});
  window.PTBO_BASE_STORE = api;
  window.PTBO_BASE_STORE_VERSION = VERSION;

  window.addEventListener('ptbo-city-package-data-ready', event => {if (event.detail?.id && event.detail.id !== cityId) return;refreshFromCityPackage();});
  window.addEventListener('storage',event=>{if(event.key===hospitalKey || event.key===legacyHospitalKey){hospital=readHospital();return;}if(event.key!==storageKey && event.key!==legacyStorageKey)return;items=readSaved();window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'storage'}}));});
  if (city.features?.baseTraining && (config.profiles?.fire?.bases?.length || config.profiles?.ems?.bases?.length)) refreshFromCityPackage();
})();
