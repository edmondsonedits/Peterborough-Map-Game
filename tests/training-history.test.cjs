'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const formatterSource = fs.readFileSync(path.join(root, 'response-simulator/incident-formatting-1.6.44.js'), 'utf8');
const historySource = fs.readFileSync(path.join(root, 'response-simulator/training-history-1.6.45.js'), 'utf8');

function storage({ failWrites = false } = {}) {
  const values = new Map();
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) {
      if (failWrites) throw new Error('storage blocked');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (failWrites) throw new Error('storage blocked');
      values.delete(key);
    },
  };
}

function harness({ failWrites = false, pending = [] } = {}) {
  const localStorage = storage({ failWrites });
  const sessionStorage = storage();
  const context = vm.createContext({
    console,
    URL,
    Blob,
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => 'session-test' },
    location: { href: 'https://example.test/response-simulator/index.html?city=peterborough' },
    document: {
      body: null,
      currentScript: { src: 'https://example.test/response-simulator/incident-formatting-1.6.44.js' },
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      createTextNode(value) { return { nodeType: 3, nodeValue: String(value) }; },
    },
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(fn) { fn(); return 1; },
    addEventListener() {},
    confirm() { return true; },
  });
  context.window = context;
  vm.runInContext(formatterSource, context, { filename: 'incident-formatting-1.6.44.js' });
  context.PTBO_BUILD = { version: '1.6.45' };
  context.PTBO_CITY_PACKAGE = { id: 'peterborough', name: 'Peterborough' };
  context.PTBO_PENDING_TRAINING_HISTORY = pending.slice();
  vm.runInContext(historySource, context, { filename: 'training-history-1.6.45.js' });
  return { context, api: context.PTBO_TRAINING_HISTORY, localStorage, sessionStorage };
}

function fireSnapshot(generation = 1, responseMs = 12340) {
  return {
    generation,
    service: 'fire',
    responseMs,
    transportMs: 0,
    completedAt: '2026-09-09T15:00:00.000Z',
    scene: {
      main: 'Medical',
      sub: 'Rectal Bleed / Gastrointestinal Emergency',
      name: 'Boston Pizza Dining Facility',
      addr: '1164 Chemong Rd',
    },
  };
}

test('completed calls persist a history-safe presentation instead of raw mission objects', () => {
  const { api } = harness();
  const saved = api.recordCompletion(fireSnapshot());
  assert.equal(saved.location, 'Outside / near Boston Pizza');
  assert.equal(saved.address, '1164 Chemong Rd');
  assert.equal(saved.responseSeconds, 12.3);
  assert.equal(saved.buildVersion, '1.6.45');
  assert.equal(saved.simulated, true);
  assert.equal(Object.hasOwn(saved, 'scene'), false);
  assert.equal(Object.hasOwn(saved, 'sourceName'), false);
  assert.equal(Object.hasOwn(saved, 'lat'), false);
  assert.equal(Object.hasOwn(saved, 'lng'), false);
});

test('EMS history includes response and transport timing plus the hospital', () => {
  const { api } = harness();
  const saved = api.recordCompletion({
    generation: 2,
    service: 'ems',
    responseMs: 10000,
    transportMs: 22500,
    completedAt: '2026-09-09T15:05:00.000Z',
    scene: { main:'Medical', sub:'Difficulty Breathing', name:'Central City Residential Structure', addr:'612 Stewart St' },
    hospital: { name:'Peterborough Regional Health Centre' },
  });
  assert.equal(saved.location, 'Residential address');
  assert.equal(saved.transportSeconds, 22.5);
  assert.equal(saved.totalSeconds, 32.5);
  assert.equal(saved.hospital, 'Peterborough Regional Health Centre');
});

test('one mission generation produces one history row even if completion is reported twice', () => {
  const { api } = harness();
  api.recordCompletion(fireSnapshot(9, 10000));
  api.recordCompletion(fireSnapshot(9, 11000));
  const entries = api.list();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].responseSeconds, 11);
});

test('history is bounded to the newest 150 completion summaries', () => {
  const { api } = harness();
  for (let generation = 1; generation <= 160; generation += 1) api.recordCompletion(fireSnapshot(generation, generation * 1000));
  const entries = api.list();
  assert.equal(entries.length, 150);
  assert.equal(entries[0].responseSeconds, 160);
  assert.equal(entries.at(-1).responseSeconds, 11);
});

test('pending completions are drained after the history module becomes available', () => {
  const { api, context } = harness({ pending: [fireSnapshot(77, 7000)] });
  assert.equal(api.list().length, 1);
  assert.equal(api.list()[0].responseSeconds, 7);
  assert.equal(context.PTBO_PENDING_TRAINING_HISTORY.length, 0);
});

test('blocked persistent storage falls back to in-memory history without losing the current page record', () => {
  const { api } = harness({ failWrites: true });
  api.recordCompletion(fireSnapshot(88, 8800));
  assert.equal(api.storageMode(), 'memory');
  assert.equal(api.list().length, 1);
  assert.equal(api.list()[0].responseSeconds, 8.8);
});

test('summary reports calls, sessions, EMS transports and average response', () => {
  const { api } = harness();
  api.recordCompletion(fireSnapshot(1, 10000));
  api.recordCompletion({
    generation: 2,
    service: 'ems',
    responseMs: 20000,
    transportMs: 30000,
    scene: { main:'Medical', sub:'Difficulty Breathing', name:'Residential address', addr:'1 Test St' },
    hospital: { name:'PRHC' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(api.summary())), {
    calls: 2,
    sessions: 1,
    emsTransports: 1,
    averageResponseSeconds: 15,
  });
});
