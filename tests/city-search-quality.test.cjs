'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../city-explorer/app.js'), 'utf8');
const searchStart = source.indexOf('let citySearchGeneration');
const start = searchStart < 0 ? source.indexOf('async function searchLocations(') : searchStart;
const search = source.slice(start, source.indexOf('function addSearchResult(', start));

function harness(landmarks = []) {
  const rows = [], requests = [], timers = new Map();
  let timerId = 0, message = '';
  const results = {
    children: [],
    set innerHTML(value) { message = value; rows.length = 0; this.children.length = 0; },
    get innerHTML() { return message; },
  };
  const context = vm.createContext({
    URL, AbortController, console: { warn() {} },
    LANDMARKS: landmarks, state: { localPlaces: [] },
    els: { searchResults: results, searchDialog: { open: true } },
    addSearchResult(row) { rows.push(row); results.children.push(row); },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      return new Promise((resolve, reject) => {
        const request = {
          options,
          resolve(body, pendingBody) { resolve({ ok: true, json: async () => pendingBody ?? body }); },
          reject,
        };
        requests.push(request);
        options.signal?.addEventListener('abort', () => {
          const error = new Error('Aborted'); error.name = 'AbortError'; reject(error);
        }, { once: true });
      });
    },
  });
  vm.runInContext(search, context);
  return { context, rows, requests, timers, results,
    close() { context.els.searchDialog.open = false; context.cancelCitySearch?.(); } };
}

const result = (name, lat = '44.303', lon = '-78.32') => ({ display_name: name, type: 'street', lat, lon });

test('a superseded address search never appends into the newer result list', async () => {
  const h = harness(), old = h.context.searchLocations('old query'), newer = h.context.searchLocations('new query');
  h.requests[1].resolve([result('New result')]); await newer;
  h.requests[0].resolve([result('Old result')]); await old;
  assert.deepEqual(h.rows.map(row => row.name), ['New result']);
});

test('closing search discards pending results and aborts the request', async () => {
  const h = harness(), pending = h.context.searchLocations('closing query');
  h.close(); h.requests[0].resolve([result('Closed result')]); await pending;
  assert.equal(h.rows.length, 0);
  assert.equal(h.requests[0].options.signal?.aborted, true);
});

test('a local-only query cancels an older remote search', async () => {
  const local = Array.from({ length: 4 }, (_, i) => ({ name: 'Station local ' + i, lat: 44.3 + i / 1000, lon: -78.32 }));
  const h = harness(local), pending = h.context.searchLocations('remote query');
  await h.context.searchLocations('station local');
  h.requests[0].resolve([result('Old remote')]); await pending;
  assert.equal(h.rows.length, 4);
  assert.equal(h.requests[0].options.signal?.aborted, true);
});

test('remote results validate coordinates and remove exact duplicate records', async () => {
  const h = harness(), pending = h.context.searchLocations('coordinate query');
  h.requests[0].resolve([result('Valid'), result('Valid'), result('Invalid', 'NaN'), result('Outside', '91'), null]);
  await pending;
  assert.deepEqual(h.rows.map(row => row.name), ['Valid']);
});

test('a search deadline preserves the existing unavailable message and clears ownership', async () => {
  const h = harness(), pending = h.context.searchLocations('timeout query');
  assert.equal(h.timers.size, 1);
  [...h.timers.values()][0](); await pending;
  assert.match(h.results.innerHTML, /temporarily unavailable/);
  assert.equal(h.timers.size, 0);
});

test('local search deduplication is linear while preserving first-record semantics', async () => {
  let reads = 0;
  const local = Array.from({ length: 800 }, (_, i) => ({
    get name() { reads++; return 'Place ' + i; }, lat: 44.3 + i / 100000, lon: -78.32,
  }));
  const h = harness(local), pending = h.context.searchLocations('no matching name');
  h.requests[0].resolve([]); await pending;
  assert.ok(reads <= local.length * 4, 'name reads: ' + reads);
});

test('malformed remote response retains local search results and releases its deadline', async () => {
  const h = harness([{ name: 'Local park', lat: 44.3, lon: -78.32 }]);
  const pending = h.context.searchLocations('park');
  h.requests[0].resolve({ error: 'Unexpected response' }); await pending;
  assert.deepEqual(h.rows.map(row => row.name), ['Local park']);
  assert.equal(h.timers.size, 0);
});

test('a superseded JSON body cannot append after newer response headers', async () => {
  const h = harness(); let deliverBody;
  const body = new Promise(resolve => { deliverBody = resolve; });
  const old = h.context.searchLocations('old body');
  h.requests[0].resolve(undefined, body);
  await Promise.resolve(); await Promise.resolve();
  const newer = h.context.searchLocations('new body');
  h.requests[1].resolve([result('Current result')]); await newer;
  deliverBody([result('Late body')]); await old;
  assert.deepEqual(h.rows.map(row => row.name), ['Current result']);
  assert.equal(h.timers.size, 0);
});

test('identity deduplication preserves the first local record and distinct coordinates', async () => {
  const first = { name: 'Local park', lat: 44.3, lon: -78.32, category: 'First identity' };
  const h = harness([first, { ...first, category: 'Duplicate identity' }, { ...first, lat: 44.31 }]);
  const pending = h.context.searchLocations('park');
  h.requests[0].resolve([]); await pending;
  assert.equal(h.rows.length, 2);
  assert.equal(h.rows[0], first);
  assert.equal(h.rows[1].lat, 44.31);
  assert.equal(h.timers.size, 0);
});

test('the city bootstrap requests app.js with the active build token', async () => {
  const loader = fs.readFileSync(path.join(__dirname, '../city-explorer/road-orientation-fix.js'), 'utf8');
  const imports = [], failures = [];
  const context = vm.createContext({
    console, PTBO_BUILD: { version: '9.8.7' },
    __PTBO_EXPLORER_BOOTSTRAP__: { touch() {}, fail: error => failures.push(error) },
    loadModule: async url => { imports.push(url); },
  });
  await vm.runInContext('(async () => {' + loader.replace(/\bimport\(/g, 'loadModule(') + '})()', context);
  assert.equal(imports.at(-1), './app.js?v=9.8.7');
  assert.equal(failures.length, 0);
});

test('the active city HTML versions its bootstrap module with the canonical build', () => {
  const build = fs.readFileSync(path.join(__dirname, '../shared/build-version.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];
  const html = fs.readFileSync(path.join(__dirname, '../city-explorer/index.html'), 'utf8');
  assert.ok(html.includes('road-orientation-fix.js?v=' + build));
});
