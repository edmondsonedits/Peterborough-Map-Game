(() => {
  'use strict';

  const STORAGE_KEY = 'ptboSharedDispatchLocationsV1';
  const STORE_VERSION = 1;
  const scriptUrl = document.currentScript?.src || window.location.href;
  const simulatorUrl = new URL('../response-simulator/index.html', scriptUrl).href;
  const geoGuesserUrl = new URL('../geo-guesser/index.html', scriptUrl).href;
  const cityTenNames = new Set([
    'Lansdowne Place Mall',
    'Costco Wholesale Parking Lot',
    'Peterborough Memorial Centre',
    'Peterborough Public Library',
    'Peterborough Police Station',
    'The Peterborough Clinic Medical Hub',
    'Peterborough Downtown Transit Terminal',
    'Galaxy Cinemas Theater Complex',
    'Real Canadian Superstore Lot',
    'FreshCo'
  ]);

  let seed = [];
  let items = [];
  let deletedIds = new Set();
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
      id: normalizeText(raw.id),
      main: normalizeText(raw.main) || 'Fire',
      sub: normalizeText(raw.sub) || 'Structure Fire',
      name: normalizeText(raw.name) || 'Unnamed Location',
      addr: normalizeText(raw.addr ?? raw.address) || 'Unknown Address',
      lat: Number(raw.lat ?? raw.latitude),
      lng: Number(raw.lng ?? raw.longitude),
      radius: Math.max(10, Number(raw.radius ?? raw.targetRadiusMeters) || 50),
      district: [1, 2, 3].includes(Number(raw.district)) ? Number(raw.district) : undefined,
      cityTen: typeof raw.cityTen === 'boolean' ? raw.cityTen : cityTenNames.has(normalizeText(raw.name)),
      confirmed: Boolean(raw.confirmed),
      sources: Array.isArray(raw.sources) ? [...new Set(raw.sources)] : [source].filter(Boolean),
      custom: Boolean(raw.custom)
    };

    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
    if (!location.id) location.id = makeId(location);
    return location;
  }

  function clone(list) {
    return list.map(location => ({ ...location, sources: [...(location.sources || [])] }));
  }

  function findMatchingArrayEnd(source, startIndex) {
    let depth = 0;
    let quote = null;
    let escaped = false;
    let lineComment = false;
    let blockComment = false;

    for (let index = startIndex; index < source.length; index += 1) {
      const char = source[index];
      const next = source[index + 1];

      if (lineComment) {
        if (char === '\n') lineComment = false;
        continue;
      }

      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === quote) quote = null;
        continue;
      }

      if (char === '/' && next === '/') {
        lineComment = true;
        index += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        blockComment = true;
        index += 1;
        continue;
      }

      if (char === '\'' || char === '"' || char === '`') {
        quote = char;
        continue;
      }

      if (char === '[') depth += 1;
      if (char === ']') {
        depth -= 1;
        if (depth === 0) return index;
      }
    }

    return -1;
  }

  function extractLargestArray(source, assignmentPattern, label) {
    const candidates = [];
    const pattern = new RegExp(assignmentPattern.source, assignmentPattern.flags);
    let match;

    while ((match = pattern.exec(source))) {
      const arrayStart = source.indexOf('[', match.index);
      if (arrayStart < 0) continue;
      const arrayEnd = findMatchingArrayEnd(source, arrayStart);
      if (arrayEnd < 0) continue;

      const literal = source.slice(arrayStart, arrayEnd + 1);
      try {
        const parsed = Function(`"use strict"; return (${literal});`)();
        if (Array.isArray(parsed)) candidates.push(parsed);
      } catch (error) {
        console.warn(`Skipped malformed ${label} candidate.`, error);
      }

      pattern.lastIndex = arrayEnd + 1;
    }

    if (!candidates.length) throw new Error(`Could not find a valid ${label} array in its legacy game file.`);
    return candidates.sort((a, b) => b.length - a.length)[0];
  }

  async function readLegacyLists() {
    const [simulatorHtml, geoHtml] = await Promise.all([
      fetch(simulatorUrl, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Simulator database request failed: ${response.status}`);
        return response.text();
      }),
      fetch(geoGuesserUrl, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`Geo Guesser database request failed: ${response.status}`);
        return response.text();
      })
    ]);

    const simulator = extractLargestArray(
      simulatorHtml,
      /^[\t ]*const\s+dispatchDatabase\s*=\s*\[/gm,
      'dispatchDatabase'
    );

    const geo = extractLargestArray(
      geoHtml,
      /^[\t ]*(?:let\s+)?locations\s*=\s*\[/gm,
      'locations'
    );

    return { simulator, geo };
  }

  function buildUnion(simulatorList, geoList) {
    const union = [];
    const exactIndex = new Map();

    const add = (raw, source) => {
      const location = normalizeLocation(raw, source);
      if (!location) return;
      const exactKey = [location.main, location.sub, location.name, location.addr]
        .map(keyText)
        .join('|');
      const existingIndex = exactIndex.get(exactKey);

      if (existingIndex === undefined) {
        exactIndex.set(exactKey, union.length);
        union.push(location);
        return;
      }

      const existing = union[existingIndex];
      existing.sources = [...new Set([...(existing.sources || []), source])];
      existing.cityTen = existing.cityTen || location.cityTen;
      existing.confirmed = existing.confirmed || location.confirmed;
      if (source === 'geo-guesser') {
        existing.lat = location.lat;
        existing.lng = location.lng;
        existing.radius = location.radius;
      }
    };

    simulatorList.forEach(location => add(location, 'driving-simulator'));
    geoList.forEach(location => add(location, 'geo-guesser'));

    const usedIds = new Set();
    union.forEach(location => {
      let candidate = location.id || makeId(location);
      let suffix = 2;
      while (usedIds.has(candidate)) {
        candidate = `${location.id || makeId(location)}-${suffix}`;
        suffix += 1;
      }
      location.id = candidate;
      usedIds.add(candidate);
    });

    return union;
  }

  function readSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.items)) return null;
      return parsed;
    } catch (error) {
      console.warn('Shared dispatch database could not read saved edits.', error);
      return null;
    }
  }

  function hydrate(saved) {
    const savedMap = new Map(
      (saved?.items || [])
        .map(item => normalizeLocation(item, null))
        .filter(Boolean)
        .map(item => [item.id, item])
    );
    deletedIds = new Set(saved?.deletedIds || []);

    const combined = seed
      .filter(item => !deletedIds.has(item.id))
      .map(item => savedMap.get(item.id) || item);

    savedMap.forEach((item, id) => {
      if (!seed.some(seedItem => seedItem.id === id) && !deletedIds.has(id)) combined.push(item);
    });

    items = combined;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORE_VERSION,
      savedAt: new Date().toISOString(),
      deletedIds: [...deletedIds],
      items
    }));
  }

  async function initialize() {
    const legacy = await readLegacyLists();
    seed = buildUnion(legacy.simulator, legacy.geo);
    hydrate(readSaved());
    console.info(`Shared dispatch database loaded: ${legacy.simulator.length} simulator calls, ${legacy.geo.length} Geo Guesser calls, ${items.length} combined calls.`);
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
    const normalized = nextItems
      .map(item => normalizeLocation(item, item.sources?.[0] || 'editor'))
      .filter(Boolean);
    const nextIds = new Set(normalized.map(item => item.id));
    deletedIds = new Set(seed.filter(item => !nextIds.has(item.id)).map(item => item.id));
    items = normalized;
    persist();
    window.dispatchEvent(new CustomEvent('ptbo-dispatch-updated', { detail: { count: items.length } }));
    return getAll();
  }

  function upsert(raw) {
    const location = normalizeLocation(raw, 'editor');
    if (!location) throw new Error('A dispatch location needs valid latitude and longitude values.');
    const index = items.findIndex(item => item.id === location.id);
    if (index >= 0) items[index] = location;
    else items.push(location);
    deletedIds.delete(location.id);
    persist();
    return { ...location, sources: [...location.sources] };
  }

  function remove(id) {
    items = items.filter(item => item.id !== id);
    if (seed.some(item => item.id === id)) deletedIds.add(id);
    persist();
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
    deletedIds = new Set();
    items = clone(seed);
    persist();
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
    storageKey: STORAGE_KEY
  });
})();
