'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../shared/site-analytics-1.6.25.js'), 'utf8');
const transport = source.slice(0, source.indexOf('  let visitorId =')) +
  'window.testTransport = { writeRecord, firestoreRequest }; })();';

function harness(statuses = []) {
  const requests = [], timers = new Map(), local = new Map(), session = new Map();
  let timerId = 0;
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)) });
  const context = vm.createContext({
    AbortController, URL, localStorage: storage(local), sessionStorage: storage(session),
    location: { pathname: '/city-explorer/' },
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch(url, options) {
      const request = { path: new URL(url).pathname, method: options.method };
      requests.push(request);
      const status = statuses.shift() ?? 200;
      if (status === 'pending') return new Promise(resolve => { request.resolve = code => resolve(response(code)); });
      return Promise.resolve(response(status));
    },
  });
  function response(status) { return { ok: status >= 200 && status < 300, status, json: async () => ({ error: { message: 'fixture response' } }) }; }
  context.window = context; context.top = context;
  vm.runInContext(transport, context);
  return { api: context.testTransport, requests, timers, local, session };
}

for (const status of [401, 403]) test('HTTP ' + status + ' disables further analytics writes for this page', async () => {
  const h = harness([status]);
  assert.equal(await h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture'), false);
  assert.equal(await h.api.writeRecord({ recordType: 'session_summary' }, 'activity_fixture'), false);
  assert.equal(h.requests.length, 1);
  assert.ok(h.requests[0].path.includes('/siteAnalytics/'));
  assert.equal(h.timers.size, 0);
});

test('concurrent cold-start writes share the initial access probe and stop after denial', async () => {
  const h = harness(['pending']);
  const writes = ['visitor', 'launch', 'session_summary'].map(recordType => h.api.writeRecord({ recordType }, recordType + '_fixture'));
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(403);
  assert.deepEqual(await Promise.all(writes), [false, false, false]);
  assert.equal(h.requests.length, 1);
});

test('an allowed access probe releases concurrent records without losing writes', async () => {
  const h = harness(['pending', 200, 200]);
  const writes = ['visitor', 'launch', 'session_summary'].map(recordType => h.api.writeRecord({ recordType }, recordType + '_fixture'));
  assert.equal(h.requests.length, 1);
  h.requests[0].resolve(200);
  assert.deepEqual(await Promise.all(writes), [true, true, true]);
  assert.equal(h.requests.length, 3);
  assert.ok(h.requests.every(request => request.path.includes('/siteAnalytics/')));
  assert.equal(h.timers.size, 0);
});

test('a transient server failure can retry later without using the leaderboard collection', async () => {
  const h = harness([500, 200]);
  assert.equal(await h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture'), false);
  assert.equal(await h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture'), true);
  assert.equal(h.requests.length, 2);
  assert.ok(h.requests.every(request => request.path.includes('/siteAnalytics/')));
});

test('a stale legacy collection preference cannot redirect new analytics into scores', async () => {
  const h = harness();
  h.session.set('ptbo-site-analytics-collection-v3', 'scores');
  assert.equal(await h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture'), true);
  assert.ok(h.requests[0].path.includes('/siteAnalytics/'));
});

test('owner opt-out while an access probe is pending prevents waiting writes', async () => {
  const h = harness(['pending']);
  const first = h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture');
  const waiting = h.api.writeRecord({ recordType: 'launch' }, 'launch_fixture');
  h.local.set('ptbo-emergency-developer-mode', 'enabled');
  h.requests[0].resolve(200);
  assert.equal(await first, true); assert.equal(await waiting, false);
  assert.equal(h.requests.length, 1);
});

test('request errors retain their HTTP status without leaking pending deadlines', async () => {
  const h = harness([403]);
  await assert.rejects(h.api.firestoreRequest('https://example.test/fixture'), error => error.status === 403);
  assert.equal(h.timers.size, 0);
});

test('access denial after a successful probe blocks all later writes', async () => {
  const h = harness([200, 403, 200]);
  assert.equal(await h.api.writeRecord({ recordType: 'visitor' }, 'visitor_fixture'), true);
  assert.equal(await h.api.writeRecord({ recordType: 'launch' }, 'launch_fixture'), false);
  assert.equal(await h.api.writeRecord({ recordType: 'session_summary' }, 'activity_fixture'), false);
  assert.equal(h.requests.length, 2);
});

test('waiting records are released after a transient failed probe without queued retries', async () => {
  const h = harness(['pending', 200]);
  const writes = ['visitor', 'launch', 'session_summary'].map(recordType => h.api.writeRecord({ recordType }, recordType + '_fixture'));
  h.requests[0].resolve(500);
  assert.deepEqual(await Promise.all(writes), [false, false, false]);
  assert.equal(h.requests.length, 1);
  assert.equal(await h.api.writeRecord({ recordType: 'session_summary' }, 'activity_fixture'), true);
  assert.equal(h.requests.length, 2);
});
