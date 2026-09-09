'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const privacySource = fs.readFileSync(path.join(root, 'shared/analytics-privacy-upgrade-1.6.33.js'), 'utf8');

function storage({ throwReads = false, throwWrites = false, initial = {} } = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      if (throwReads) throw new Error('storage read blocked');
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (throwWrites) throw new Error('storage write blocked');
      values.set(key, String(value));
    },
    removeItem(key) {
      if (throwWrites) throw new Error('storage remove blocked');
      values.delete(key);
    },
    snapshot:() => Object.fromEntries(values),
  };
}

function makeContext({ search = '', deployment, localStorage, sessionStorage } = {}) {
  const intervalCallbacks = [];
  const context = vm.createContext({
    console,
    URLSearchParams,
    location:{ search },
    localStorage:localStorage || storage(),
    sessionStorage:sessionStorage || storage(),
    PTBO_DEPLOYMENT:deployment,
    setInterval(callback) {
      intervalCallbacks.push(callback);
      return intervalCallbacks.length;
    },
    clearInterval() {},
    addEventListener() {},
  });
  context.window = context;
  context.top = context;
  vm.runInContext(privacySource, context, { filename:'analytics-privacy-upgrade-1.6.33.js' });
  return { context, intervalCallbacks };
}

test('privacy policy survives blocked/corrupt browser storage and still obeys deployment authority', () => {
  const brokenLocal = storage({ throwReads:true, throwWrites:true });
  const brokenSession = storage({ throwReads:true, throwWrites:true });
  const { context } = makeContext({
    search:'?analytics=on&dept=spoofed_department',
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:false },
    localStorage:brokenLocal,
    sessionStorage:brokenSession,
  });

  assert.equal(context.PTBO_ANALYTICS_PRIVACY.department(), 'peterborough_fire');
  assert.equal(context.PTBO_ANALYTICS_PRIVACY.deploymentAnalyticsPermitted(), false);
  assert.equal(context.PTBO_ANALYTICS_PRIVACY.analyticsEnabled(), false);
});

test('privacy policy wraps a base analytics client that arrives later and blocks tracking when disabled', () => {
  const { context, intervalCallbacks } = makeContext({
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:false },
  });

  let recordCalls = 0;
  context.PTBO_SITE_ANALYTICS = {
    trackingAllowed:() => true,
    recordLaunch:() => { recordCalls += 1; return true; },
    health:() => ({ sessionId:'session-1' }),
  };

  assert.ok(intervalCallbacks.length > 0, 'privacy policy should wait for a delayed base client');
  intervalCallbacks[0]();

  assert.equal(context.PTBO_SITE_ANALYTICS.privacyUpgradeVersion, context.PTBO_ANALYTICS_PRIVACY.version);
  assert.equal(context.PTBO_SITE_ANALYTICS.trackingAllowed(), false);
  assert.equal(context.PTBO_SITE_ANALYTICS.recordLaunch('should_not_write'), false);
  assert.equal(recordCalls, 0);
});

test('running the privacy policy twice is idempotent', () => {
  const { context } = makeContext({ deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:true } });
  const firstApi = context.PTBO_ANALYTICS_PRIVACY;
  vm.runInContext(privacySource, context, { filename:'analytics-privacy-upgrade-1.6.33.js' });
  assert.equal(context.PTBO_ANALYTICS_PRIVACY, firstApi);
});

test('browser-controlled inputs can only reduce collection, never re-enable a disabled deployment', () => {
  const local = storage({ initial:{
    'ptbo-deployment-department-v1':'spoofed_department',
    'ptbo-site-visitor-id-v1':'legacy-id',
    'ptbo-site-visitor-first-v2':'legacy-first',
    'ptbo-site-visitor-sessions-v2':'999',
  }});
  const { context } = makeContext({
    search:'?analytics=on&department=spoofed_department',
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:false },
    localStorage:local,
  });

  assert.equal(context.PTBO_ANALYTICS_PRIVACY.analyticsEnabled(), false);
  assert.equal(context.PTBO_ANALYTICS_PRIVACY.setEnabled(true), false);
  assert.equal(context.PTBO_ANALYTICS_PRIVACY.department(), 'peterborough_fire');
  const snapshot = local.snapshot();
  assert.equal(snapshot['ptbo-deployment-department-v1'], undefined);
  assert.equal(snapshot['ptbo-site-visitor-id-v1'], undefined);
  assert.equal(snapshot['ptbo-site-visitor-first-v2'], undefined);
  assert.equal(snapshot['ptbo-site-visitor-sessions-v2'], undefined);
});
