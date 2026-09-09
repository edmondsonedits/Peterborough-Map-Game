'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/analytics-privacy-upgrade-1.6.33.js'), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem:key => values.has(key) ? values.get(key) : null,
    setItem:(key,value) => values.set(key, String(value)),
    removeItem:key => values.delete(key),
    snapshot:() => Object.fromEntries(values),
  };
}

function privacyContext({ search = '', deployment = undefined, analyticsConfig = undefined, local = {} } = {}) {
  const localStorage = storage(local);
  const sessionStorage = storage();
  const context = vm.createContext({
    console,
    URLSearchParams,
    location:{ search },
    localStorage,
    sessionStorage,
    setInterval:() => 1,
    clearInterval:() => {},
    addEventListener:() => {},
    PTBO_DEPLOYMENT:deployment,
    PTBO_ANALYTICS_CONFIG:analyticsConfig,
  });
  context.window = context;
  context.top = context;
  vm.runInContext(source, context, { filename:'analytics-privacy-upgrade-1.6.33.js' });
  return { context, api:context.PTBO_ANALYTICS_PRIVACY, localStorage, sessionStorage };
}

test('browser department query cannot override trusted department deployment identity', () => {
  const { api, localStorage } = privacyContext({
    search:'?dept=toronto_fire&department=ottawa_fire',
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:true },
    local:{ 'ptbo-deployment-department-v1':'old_spoofed_department' },
  });

  assert.equal(api.department(), 'peterborough_fire');
  assert.equal(api.browserCanOverrideDepartment, false);
  assert.equal(localStorage.getItem('ptbo-deployment-department-v1'), null);
});

test('department analytics disabled by deployment cannot be enabled by query or runtime request', () => {
  const { api } = privacyContext({
    search:'?analytics=on&dept=toronto_fire',
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:false },
  });

  assert.equal(api.deploymentAnalyticsPermitted(), false);
  assert.equal(api.analyticsEnabled(), false);
  assert.equal(api.setEnabled(true), false);
  assert.equal(api.analyticsEnabled(), false);
  assert.equal(api.browserCanEnableAnalytics, false);
});

test('browser opt-out may reduce analytics when deployment permits collection', () => {
  const { api } = privacyContext({
    search:'?analytics=off',
    deployment:{ mode:'department', department:'peterborough_fire', analyticsEnabled:true },
  });

  assert.equal(api.deploymentAnalyticsPermitted(), true);
  assert.equal(api.analyticsEnabled(), false);
});

test('public demo remains public_demo even when browser supplies a department name', () => {
  const { api } = privacyContext({ search:'?dept=toronto_fire&analytics=on' });

  assert.equal(api.department(), 'public_demo');
  assert.equal(api.deploymentAnalyticsPermitted(), true);
  assert.equal(api.analyticsEnabled(), true);
});
