/* Hospital drivable-area + EMS drop-off checkpoint store — v1.6.49. */
(() => {
  'use strict';

  const VERSION = '1.6.49';
  if (window.PTBO_HOSPITAL_DROPOFF?.version === VERSION) return;

  const originalStore = window.PTBO_BASE_STORE;
  if (!originalStore?.getHospital || !originalStore?.saveHospital || !originalStore?.contains || !originalStore?.corners) {
    console.warn('Hospital drop-off store is waiting for the base-location store.');
    return;
  }

  const cityId = originalStore.cityId || window.PTBO_CITY_PACKAGE?.id || 'peterborough';
  const storageKey = `ptboHospitalDropoffAreaV1:${cityId}`;
  const copy = value => JSON.parse(JSON.stringify(value));
  let staged = null;

  function defaultArea(hospital = originalStore.getHospital()) {
    const checkpointLat = Number(hospital?.checkpointLat ?? hospital?.lat);
    const checkpointLng = Number(hospital?.checkpointLng ?? hospital?.lng);
    const checkpointRadius = Number(hospital?.checkpointRadius ?? hospital?.radius ?? 40);
    const defaultSide = Math.max(40, Math.min(240, checkpointRadius * 2));
    return {
      areaLat:Number(hospital?.areaLat ?? checkpointLat),
      areaLng:Number(hospital?.areaLng ?? checkpointLng),
      areaWidth:Number(hospital?.areaWidth ?? defaultSide),
      areaLength:Number(hospital?.areaLength ?? defaultSide),
      areaRotation:Number(hospital?.areaRotation ?? 0),
      checkpointLat,
      checkpointLng,
      checkpointRadius,
    };
  }

  function readSaved() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return saved?.schema === 1 ? saved : null;
    } catch (_) { return null; }
  }

  function normalized(raw = {}, fallback = null) {
    const base = fallback || defaultArea();
    const next = {
      areaLat:Number(raw.areaLat ?? base.areaLat),
      areaLng:Number(raw.areaLng ?? base.areaLng),
      areaWidth:Number(raw.areaWidth ?? base.areaWidth),
      areaLength:Number(raw.areaLength ?? base.areaLength),
      areaRotation:((Number(raw.areaRotation ?? base.areaRotation) % 360) + 360) % 360,
      checkpointLat:Number(raw.checkpointLat ?? raw.lat ?? base.checkpointLat),
      checkpointLng:Number(raw.checkpointLng ?? raw.lng ?? base.checkpointLng),
      checkpointRadius:Number(raw.checkpointRadius ?? raw.radius ?? base.checkpointRadius),
    };
    if (![next.areaLat,next.areaLng,next.areaWidth,next.areaLength,next.areaRotation,next.checkpointLat,next.checkpointLng,next.checkpointRadius].every(Number.isFinite)
      || Math.abs(next.areaLat) > 85 || Math.abs(next.areaLng) > 180
      || Math.abs(next.checkpointLat) > 85 || Math.abs(next.checkpointLng) > 180
      || next.areaWidth < 10 || next.areaWidth > 600 || next.areaLength < 10 || next.areaLength > 600
      || next.checkpointRadius < 10 || next.checkpointRadius > 200) {
      throw new Error('Use a 10–600 m hospital area, valid coordinates, and a 10–200 m checkpoint radius.');
    }
    return next;
  }

  let current;
  try {
    current = normalized(readSaved() || {}, defaultArea());
  } catch (error) {
    console.warn('Unable to restore the hospital drop-off area.', error);
    current = normalized({}, defaultArea());
  }

  function areaRecord(area = staged || current, hospital = originalStore.getHospital()) {
    return {
      id:`__hospital-dropoff-${hospital.id || 'hospital'}`,
      service:'ems',
      number:0,
      name:`${hospital.name || 'Hospital'} drivable area`,
      shortName:'Hospital Drop-off',
      address:hospital.addr || hospital.address || '',
      lat:area.areaLat,
      lng:area.areaLng,
      yardSize:Math.max(area.areaWidth,area.areaLength),
      yardWidth:area.areaWidth,
      yardLength:area.areaLength,
      yardRotation:area.areaRotation,
      _ptboHospitalArea:true,
    };
  }

  function containsArea(area, lat, lng) {
    return originalStore.contains(areaRecord(area), Number(lat), Number(lng));
  }

  function validateCheckpoint(area) {
    if (!containsArea(area, area.checkpointLat, area.checkpointLng)) {
      throw new Error('Keep the ambulance drop-off checkpoint inside the hospital drivable area.');
    }
    return area;
  }

  function mergedHospital(area = staged || current, source = originalStore.getHospital()) {
    return {
      ...source,
      ...area,
      lat:area.checkpointLat,
      lng:area.checkpointLng,
      radius:area.checkpointRadius,
      checkpointLat:area.checkpointLat,
      checkpointLng:area.checkpointLng,
      checkpointRadius:area.checkpointRadius,
    };
  }

  function seedHospital() {
    const seed = originalStore.getHospitalSeed?.() || originalStore.getHospital();
    const area = normalized({}, defaultArea(seed));
    return mergedHospital(area, seed);
  }

  function stage(raw = {}) {
    staged = validateCheckpoint(normalized(raw, staged || current));
    return copy(staged);
  }

  function clearStage() { staged = null; }

  function save(raw = {}) {
    const source = originalStore.getHospital();
    // The editor stages the rectangle before its normal hospital form submit runs.
    // Prefer that staged geometry so older form fields cannot overwrite the new width/length edits.
    const area = staged
      ? validateCheckpoint(normalized(staged,current))
      : validateCheckpoint(normalized(raw,current));
    const name = String(raw.name ?? source.name ?? '').trim();
    const addr = String(raw.addr ?? raw.address ?? source.addr ?? source.address ?? '').trim();
    const baseSaved = originalStore.saveHospital({
      id:source.id,
      main:source.main,
      sub:source.sub,
      name,
      addr,
      lat:area.checkpointLat,
      lng:area.checkpointLng,
      radius:area.checkpointRadius,
    });
    current = area;
    staged = null;
    try {
      localStorage.setItem(storageKey, JSON.stringify({schema:1,cityId,...current}));
    } catch (_) {
      throw new Error('Hospital drop-off area could not be saved. Free browser storage and try again.');
    }
    const detail = {cityId,hospital:mergedHospital(current,baseSaved),area:copy(current)};
    window.dispatchEvent(new CustomEvent('ptbo-hospital-dropoff-updated',{detail}));
    // Road collision caches drivable base polygons. Refresh that cache whenever the hospital area changes.
    window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'hospital-dropoff'}}));
    return detail.hospital;
  }

  function hospitalRoadAccess(roads, area = staged || current) {
    return originalStore.roadAccess(areaRecord(area), roads);
  }

  function emsAreaActive() {
    return window.PTBO_SERVICE?.state?.selected === true && window.PTBO_SERVICE?.state?.mode === 'ems';
  }

  const wrappedStore = Object.freeze({
    ...originalStore,
    version:VERSION,
    getHospital:() => mergedHospital(),
    getHospitalSeed:seedHospital,
    saveHospital:save,
    getAll:() => {
      const list = originalStore.getAll();
      return emsAreaActive() ? [...list, areaRecord(current)] : list;
    },
    roadAccess:(item,roads) => {
      const hospitalId = originalStore.getHospital()?.id;
      if (item?._ptboHospitalArea || item?.id === hospitalId) return hospitalRoadAccess(roads);
      return originalStore.roadAccess(item,roads);
    },
    hospitalCorners:(hospital = mergedHospital()) => originalStore.corners(areaRecord(normalized(hospital,current),hospital)),
    hospitalContains:(hospital,lat,lng) => containsArea(normalized(hospital || {},current),lat,lng),
    hospitalRoadAccess,
    getHospitalAreaRecord:() => copy(areaRecord(current)),
  });

  window.PTBO_BASE_STORE = wrappedStore;
  window.PTBO_BASE_STORE_VERSION = VERSION;

  const api = Object.freeze({
    version:VERSION,
    cityId,
    storageKey,
    get:() => mergedHospital(),
    getArea:() => copy(staged || current),
    getSavedArea:() => copy(current),
    getAreaRecord:() => copy(areaRecord(staged || current)),
    corners:() => originalStore.corners(areaRecord(staged || current)),
    contains:(lat,lng) => containsArea(staged || current,lat,lng),
    roadAccess:hospitalRoadAccess,
    stage,
    clearStage,
    save,
  });
  window.PTBO_HOSPITAL_DROPOFF = api;

  window.addEventListener('ptbo-service-change', () => {
    queueMicrotask(() => window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'hospital-service-change'}})));
  });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey) return;
    try { current = normalized(readSaved() || {}, defaultArea()); }
    catch (_) { current = normalized({},defaultArea()); }
    staged = null;
    window.dispatchEvent(new CustomEvent('ptbo-hospital-dropoff-updated',{detail:{cityId,hospital:mergedHospital(),area:copy(current)}}));
    window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'hospital-storage'}}));
  });

  // If road protection already initialized, immediately refresh its cached drivable polygons.
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('ptbo-bases-updated',{detail:{cityId,source:'hospital-dropoff-install'}})));
})();
