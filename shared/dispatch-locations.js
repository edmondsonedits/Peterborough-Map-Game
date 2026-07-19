(() => {
  'use strict';

  const DATA_VERSION = '1.4.4';
  const STORE_VERSION = 2;
  const STORAGE_KEY = 'ptboSharedDispatchLocationsV2';
  const scriptUrl = document.currentScript?.src || window.location.href;
  const dataUrl = new URL(`./dispatch-data-${DATA_VERSION}.js?v=${DATA_VERSION}`, scriptUrl).href;

  let seed = [];
  let items = [];
  let readyPromise;

  const normalizeText = value => String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  const keyText = value => normalizeText(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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
    const identity = [location.main, location.sub, location.name, location.addr]
      .map(keyText)
      .join('|');
    return `call-${slug(location.name)}-${hash(identity)}`;
  }

  function normalizeLocation(raw, source) {
    const location = {
      id: normalizeText(raw?.id),
      main: normalizeText(raw?.main) || 'Fire',
      sub: normalizeText(raw?.sub) || 'Structure Fire',
      name: normalizeText(raw?.name) || 'Unnamed Location',
      addr: normalizeText(raw?.addr ?? raw?.address) || 'Unknown Address',
      lat: Number(raw?.lat ?? raw?.latitude),
      lng: Number(raw?.lng ?? raw?.longitude),
      radius: Math.max(10, Number(raw?.radius ?? raw?.targetRadiusMeters) || 50),
      district: [1, 2, 3].includes(Number(raw?.district)) ? Number(raw.district) : undefined,
      cityTen: Boolean(raw?.cityTen),
      confirmed: Boolean(raw?.confirmed),
      sources: Array.isArray(raw?.sources) ? [...new Set(raw.sources.map(normalizeText).filter(Boolean))] : [source].filter(Boolean),
      custom: Boolean(raw?.custom)
    };

    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
    if (!location.id) location.id = makeId(location);
    return location;
  }

  function clone(list) {
    return list.map(location => ({ ...location, sources: [...(location.sources || [])] }));
  }

  function normalizeList(list, source) {
    const usedIds = new Set();
    return (Array.isArray(list) ? list : [])
      .map(item => normalizeLocation(item, source))
      .filter(Boolean)
      .map(location => {
        const base = location.id || makeId(location);
        let candidate = base;
        let suffix = 2;
        while (usedIds.has(candidate)) {
          candidate = `${base}-${suffix}`;
          suffix += 1;
        }
        location.id = candidate;
        usedIds.add(candidate);
        return location;
      });
  }

  function loadData() {
    if (window.PTBO_DISPATCH_DATA_READY) return window.PTBO_DISPATCH_DATA_READY;

    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script =>
        script.src && script.src.includes(`dispatch-data-${DATA_VERSION}.js`)
      );

      const finish = () => {
        if (!window.PTBO_DISPATCH_DATA_READY) {
          reject(new Error(`Dispatch data v${DATA_VERSION} did not initialize.`));
          return;
        }
        window.PTBO_DISPATCH_DATA_READY.then(resolve, reject);
      };

      if (existing) {
        if (window.PTBO_DISPATCH_DATA_READY) finish();
        else {
          existing.addEventListener('load', finish, { once: true });
          existing.addEventListener('error', () => reject(new Error(`Unable to load dispatch data v${DATA_VERSION}.`)), { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = dataUrl;
      script.dataset.ptboDispatchData = DATA_VERSION;
      script.onload = finish;
      script.onerror = () => reject(new Error(`Unable to load dispatch data v${DATA_VERSION}.`));
      document.head.appendChild(script);
    });
  }

  function readSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== STORE_VERSION || parsed.dataVersion !== DATA_VERSION || !Array.isArray(parsed.items)) return null;
      return normalizeList(parsed.items, 'saved');
    } catch (error) {
      console.warn('Shared dispatch database could not read saved edits.', error);
      return null;
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        dataVersion: DATA_VERSION,
        savedAt: new Date().toISOString(),
        items
      }));
    } catch (error) {
      console.warn('Shared dispatch database could not save edits.', error);
    }
  }

  function announce() {
    window.dispatchEvent(new CustomEvent('ptbo-dispatch-updated', {
      detail: { count: items.length, version: DATA_VERSION }
    }));
  }

  async function initialize() {
    const supplied = await loadData();
    seed = normalizeList(supplied, 'source');
    items = readSaved() || clone(seed);
    console.info(`Shared dispatch database v${DATA_VERSION} loaded: ${items.length} calls.`);
    return clone(items);
  }

  function ready() {
    if (!readyPromise) readyPromise = initialize();
    return readyPromise;
  }

  function getAll() {
    return clone(items);
  }

  function replaceAll(nextItems) {
    items = normalizeList(nextItems, 'editor');
    persist();
    announce();
    return getAll();
  }

  function upsert(raw) {
    const location = normalizeLocation(raw, 'editor');
    if (!location) throw new Error('A dispatch location needs valid latitude and longitude values.');
    const index = items.findIndex(item => item.id === location.id);
    if (index >= 0) items[index] = location;
    else items.push(location);
    persist();
    announce();
    return { ...location, sources: [...location.sources] };
  }

  function remove(id) {
    items = items.filter(item => item.id !== id);
    persist();
    announce();
    return getAll();
  }

  function createId(raw) {
    const normalized = normalizeLocation({ ...raw, id: '' }, 'editor');
    const base = normalized ? makeId(normalized) : `call-custom-${Date.now().toString(36)}`;
    let candidate = base;
    let suffix = 2;
    while (items.some(item => item.id === candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    items = clone(seed);
    persist();
    announce();
    return getAll();
  }

  function exportText() {
    return `window.PTBO_DISPATCH_LOCATIONS = ${JSON.stringify(items, null, 2)};\n`;
  }

  window.PTBO_DISPATCH_STORE = Object.freeze({
    ready,
    getAll,
    replaceAll,
    upsert,
    remove,
    createId,
    reset,
    exportText,
    storageKey: STORAGE_KEY,
    dataVersion: DATA_VERSION
  });
})();
