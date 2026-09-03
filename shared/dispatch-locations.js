/* =========================================================
   BEGINNER CODE GUIDE — SHARED DISPATCH LOCATION STORE

   PURPOSE:
   The response simulator, Geo Guesser, and dispatch editor need one consistent
   list of emergency-call locations. This module loads the source records,
   normalizes them, restores compatible saved edits, and exposes safe read/write
   functions through window.PTBO_DISPATCH_STORE.

   WHAT THE PLAYER EXPERIENCES:
   Both games use the same names, addresses, coordinates, target radii, districts,
   and call types. Edits made through the shared editor can persist on the device.

   IMPORTANT DESIGN IDEAS:
   - Source data is the clean starting point.
   - localStorage can override it with compatible saved edits.
   - Every record is normalized before entering the store.
   - Callers receive clones, not the store's private objects.
   - Updates announce an event so other interfaces can refresh.

   Comments are ignored by the browser and do not affect data.
   ========================================================= */
(() => {
  'use strict';

  /* =========================================================
     VERSION AND STORAGE SETTINGS

     DATA_FILE_VERSION:
     Version embedded in the physical dispatch-data filename.

     DATA_VERSION:
     Logical revision of the location dataset. It is used for cache refreshes,
     saved-data compatibility, messages, and public diagnostics.

     STORE_VERSION:
     Shape/version of the localStorage wrapper itself. Increase it only when the
     saved object structure changes incompatibly.

     STORAGE_KEY:
     Browser-storage name. Changing it makes old device edits appear missing
     unless migration code reads the previous key.
     ========================================================= */
  const DATA_FILE_VERSION = '1.4.4';
  const DATA_VERSION = '1.4.20';
  const STORE_VERSION = 2;
  const STORAGE_KEY = 'ptboSharedDispatchLocationsV2';

  // Build the data-file URL relative to this script, not the current page folder.
  const scriptUrl = document.currentScript?.src || window.location.href;
  const dataUrl = new URL(`./dispatch-data-${DATA_FILE_VERSION}.js?v=${DATA_VERSION}`, scriptUrl).href;

  /*
  PRIVATE LIVE STATE:
  seed = normalized source records used by Reset.
  items = current working records, possibly restored from saved edits.
  readyPromise = one shared startup Promise so initialization runs only once.
  */
  let seed = [];
  let items = [];
  let readyPromise;

  /*
  FUNCTION: normalizeText

  WHAT THE CODE DOES:
  Converts null/undefined to empty text, trims edges, and reduces repeated spaces
  to one space.

  WHY IT EXISTS:
  Names and addresses from different files/editors should compare and display
  consistently despite accidental spacing differences.
  */
  const normalizeText = value => String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');

  /*
  FUNCTION: keyText

  WHAT THE CODE DOES:
  Creates a comparison/id-friendly form: lowercase, apostrophes removed,
  punctuation replaced with spaces, and whitespace cleaned.

  EXAMPLE:
  “St. Joseph’s  Home” becomes similar to “st josephs home”.

  IMPORTANT:
  This is for identity keys, not player-facing display text.
  */
  const keyText = value => normalizeText(value)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  /*
  FUNCTION: hash

  WHAT THE CODE DOES:
  Runs a small deterministic FNV-style hash over text and returns a short base-36
  string.

  WHY IT EXISTS:
  Similar location names need stable ids that also include call/address identity
  without placing the complete long text into every id.
  */
  const hash = text => {
    let value = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return (value >>> 0).toString(36);
  };

  /*
  FUNCTION: slug
  Converts identity text into a short URL/id-friendly name fragment.
  */
  const slug = text => keyText(text).replace(/\s+/g, '-').slice(0, 48) || 'location';

  /*
  FUNCTION: makeId

  WHAT THE CODE DOES:
  Combines division, subcategory, name, and address into normalized identity text,
  then returns a readable name slug plus a stable hash.

  WHY COORDINATES ARE NOT INCLUDED:
  A marker can be corrected/moved without automatically becoming a completely new
  record id.
  */
  function makeId(location) {
    const identity = [location.main, location.sub, location.name, location.addr]
      .map(keyText)
      .join('|');
    return `call-${slug(location.name)}-${hash(identity)}`;
  }

  /*
  FUNCTION: normalizeLocation

  WHAT THE CODE DOES:
  Converts one raw object into the exact record shape expected by all games.
  It accepts a few alternate field names, supplies defaults, converts numbers and
  Booleans, clamps radius to 10–500 metres, validates district, removes
  duplicate source labels, validates coordinates, and creates a missing id.

  RETURN VALUE:
  A normalized location, or null when latitude/longitude are invalid.

  FIELD EFFECTS:
  main/sub = filtering and visual category.
  name/addr = HUD, dispatch, lists, and speech.
  lat/lng = map target and distance.
  radius = arrival and Geo Guesser tolerance/visual circle.
  district = station-local call selection.
  cityTen = featured ten-call mode.
  confirmed = editor verification workflow.
  custom/sources = data origin and editor information.
  */
  function normalizeLocation(raw, source) {
    const location = {
      id: normalizeText(raw?.id),
      main: normalizeText(raw?.main) || 'Fire',
      sub: normalizeText(raw?.sub) || 'Structure Fire',
      name: normalizeText(raw?.name) || 'Unnamed Location',
      addr: normalizeText(raw?.addr ?? raw?.address) || 'Unknown Address',
      lat: Number(raw?.lat ?? raw?.latitude),
      lng: Number(raw?.lng ?? raw?.longitude),
      radius: Math.max(10, Math.min(500, Number(raw?.radius ?? raw?.targetRadiusMeters) || 50)),
      district: [1, 2, 3].includes(Number(raw?.district)) ? Number(raw.district) : undefined,
      cityTen: Boolean(raw?.cityTen),
      confirmed: Boolean(raw?.confirmed),
      sources: Array.isArray(raw?.sources)
        ? [...new Set(raw.sources.map(normalizeText).filter(Boolean))]
        : [source].filter(Boolean),
      custom: Boolean(raw?.custom),
    };

    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || Math.abs(location.lat) > 90 || Math.abs(location.lng) > 180) return null;
    if (!location.id) location.id = makeId(location);
    return location;
  }

  /*
  FUNCTION: clone

  WHAT THE CODE DOES:
  Creates new record objects and new source arrays.

  WHY IT EXISTS:
  Without cloning, a game/editor could accidentally change the store's private
  data simply by modifying an object returned by getAll().
  */
  function clone(list) {
    return list.map(location => ({
      ...location,
      sources: [...(location.sources || [])],
    }));
  }

  /*
  FUNCTION: normalizeList

  WHAT THE CODE DOES:
  Normalizes every valid record and guarantees unique ids. When two records
  produce the same id, numeric suffixes -2, -3, and so on are added.

  WHY UNIQUE IDS:
  Marker maps, editing, updates, and deletion all depend on one id identifying
  exactly one record.
  */
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

  /*
  FUNCTION: loadData

  WHAT THE CODE DOES:
  Returns an existing global data-ready Promise when available. Otherwise it
  creates a versioned script element for the source data, waits for that file to
  create PTBO_DISPATCH_DATA_READY, and forwards its resolved records.

  WHY DYNAMIC LOADING:
  Different game pages can all load this store without repeating the large data
  file manually in their HTML.

  ERROR BEHAVIOUR:
  Missing script or missing ready Promise rejects startup with a clear versioned
  message instead of silently returning an empty database.
  */
  function loadData() {
    if (window.PTBO_DISPATCH_DATA_READY) return window.PTBO_DISPATCH_DATA_READY;

    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script =>
        script.src && script.src.includes(`dispatch-data-${DATA_FILE_VERSION}.js`)
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

  /*
  FUNCTION: readSaved

  WHAT THE CODE DOES:
  Reads localStorage and accepts it only when store version, data version, and
  items array all match current expectations. Accepted records are normalized
  again before use.

  WHY REQUIRE DATA_VERSION:
  A substantially changed source dataset should not be silently replaced by an
  older full saved copy with missing/corrected calls.
  */
  function readSaved() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!parsed
          || parsed.version !== STORE_VERSION
          || parsed.dataVersion !== DATA_VERSION
          || !Array.isArray(parsed.items)) return null;
      return normalizeList(parsed.items, 'saved');
    } catch (error) {
      console.warn('Shared dispatch database could not read saved edits.', error);
      return null;
    }
  }

  /*
  FUNCTION: persist

  WHAT THE CODE DOES:
  Saves store/data versions, timestamp, and current items to localStorage.

  FAILURE:
  Storage failures throw before live records change. The editor keeps its draft
  available for retry or export and shows the error to the user.
  */
  function persist(nextItems = items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: STORE_VERSION,
        dataVersion: DATA_VERSION,
        savedAt: new Date().toISOString(),
        items: nextItems,
      }));
    } catch (error) {
      throw new Error('Changes could not be saved on this device. Free browser storage and try again, or export your edits.', { cause: error });
    }
  }

  /*
  FUNCTION: announce

  WHAT THE CODE DOES:
  Dispatches a ptbo-dispatch-updated event containing count and data version.

  WHY EVENTS:
  Other interfaces can refresh after edits without this store knowing their
  element ids or importing their code.
  */
  function announce() {
    window.dispatchEvent(new CustomEvent('ptbo-dispatch-updated', {
      detail: { count: items.length, version: DATA_VERSION },
    }));
  }

  /*
  FUNCTION: initialize

  WHAT THE CODE DOES:
  Loads/normalizes source data into seed, then uses compatible saved edits or a
  clone of seed as current items. It returns a clone for the first caller.
  */
  async function initialize() {
    const supplied = await loadData();
    seed = normalizeList(supplied, 'source');
    items = readSaved() || clone(seed);
    console.info(`Shared dispatch database v${DATA_VERSION} loaded: ${items.length} calls.`);
    return clone(items);
  }

  /*
  FUNCTION: ready

  WHAT THE CODE DOES:
  Starts initialize() once and returns the same Promise to every caller.

  TECHNICAL TERM — MEMOIZED PROMISE:
  Remembering the first Promise prevents duplicate data scripts and conflicting
  initialization when multiple systems ask for readiness together.
  */
  function ready() {
    if (!readyPromise) readyPromise = initialize();
    return readyPromise;
  }

  // Returns safe copies of all current records.
  function getAll() {
    return clone(items);
  }

  /*
  FUNCTION: replaceAll

  WHAT THE CODE DOES:
  Replaces the complete store with a normalized list, saves, announces, and
  returns safe copies. The shared editor uses this as its central commit path.
  */
  function replaceAll(nextItems) {
    const next = normalizeList(nextItems, 'editor');
    persist(next);
    items = next;
    announce();
    return getAll();
  }

  /*
  FUNCTION: upsert

  WHAT THE CODE DOES:
  Normalizes one record, updates the matching id or appends a new record, saves,
  announces, and returns a clone.

  TECHNICAL TERM — UPSERT:
  “Update if present, insert if absent.”
  */
  function upsert(raw) {
    const location = normalizeLocation(raw, 'editor');
    if (!location) throw new Error('A dispatch location needs valid latitude and longitude values.');
    const index = items.findIndex(item => item.id === location.id);
    const next = clone(items);
    if (index >= 0) next[index] = location;
    else next.push(location);
    persist(next);
    items = next;
    announce();
    return { ...location, sources: [...location.sources] };
  }

  /*
  FUNCTION: remove

  WHAT THE CODE DOES:
  Keeps every item except the matching id, then saves and announces.
  */
  function remove(id) {
    const next = items.filter(item => item.id !== id);
    persist(next);
    items = next;
    announce();
    return getAll();
  }

  /*
  FUNCTION: createId

  WHAT THE CODE DOES:
  Creates a normal stable base id and adds suffixes until it does not collide with
  any current item. Invalid incomplete raw data receives a time-based custom id.
  */
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

  /*
  FUNCTION: reset

  WHAT THE CODE DOES:
  Restores a clone of source seed, saves that restored copy,
  announces, and returns it.

  EDITING WARNING:
  This intentionally discards all local unexported edits on the device.
  */
  function reset() {
    const next = clone(seed);
    persist(next);
    items = next;
    announce();
    return getAll();
  }

  /*
  FUNCTION: exportText

  WHAT THE CODE DOES:
  Formats current items as a JavaScript assignment suitable for a source file.
  Pretty-print indentation improves human review in GitHub.
  */
  function exportText(exportItems = items) {
    const data = normalizeList(exportItems, 'editor');
    return `window.PTBO_DISPATCH_DATA_VERSION = ${JSON.stringify(DATA_VERSION)};\nwindow.PTBO_DISPATCH_LOCATIONS = ${JSON.stringify(data, null, 2)};\nwindow.PTBO_DISPATCH_DATA_READY = Promise.resolve(window.PTBO_DISPATCH_LOCATIONS);\n`;
  }

  /*
  PUBLIC API:
  Object.freeze prevents callers from replacing store methods or metadata.
  The item arrays themselves remain private and are accessed through clones.
  */
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
    dataVersion: DATA_VERSION,
  });
})();
