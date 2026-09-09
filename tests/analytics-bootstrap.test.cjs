'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const launcher = read('index.html');
const bootstrap = read('shared/build-version.js');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('root launcher has one analytics entry point and never starts the legacy client directly', () => {
  assert.match(launcher, /shared\/build-version\.js\?v=1\.6\.41/);
  assert.doesNotMatch(launcher, /<script[^>]+site-analytics-1\.6\.25\.js/i);
});

test('v1.6.41 bootstrap confirms privacy API readiness before analytics injection', () => {
  assert.match(bootstrap, /const VERSION = '1\.6\.41'/);
  assert.match(bootstrap, /privacyPolicyReady/);
  assert.match(bootstrap, /PTBO_ANALYTICS_PRIVACY/);
  assert.match(bootstrap, /Analytics privacy policy did not initialize/);

  const privacyInjection = bootstrap.indexOf("injectPageScript('ptbo-analytics-privacy-loader'");
  const analyticsInjection = bootstrap.indexOf("injectPageScript('ptbo-site-analytics-loader'");
  assert.ok(privacyInjection >= 0, 'privacy policy injection must exist');
  assert.ok(analyticsInjection > privacyInjection, 'analytics must be injected only after privacy policy injection');
});

test('concurrent bootstrap calls share one installation promise', () => {
  assert.match(bootstrap, /let analyticsInstallPromise = null/);
  assert.match(bootstrap, /if \(analyticsInstallPromise\) return analyticsInstallPromise/);
  assert.match(bootstrap, /analyticsInstallPromise = \(async \(\) =>/);
});

test('old script-element-presence shortcut cannot bypass privacy readiness', () => {
  assert.doesNotMatch(
    bootstrap,
    /if \(document\.getElementById\('ptbo-analytics-privacy-loader'\)\)\s*\{\s*loadBase\(\);\s*return;\s*\}/
  );
});

test('page enhancement bootstrap cannot run once immediately and again on DOMContentLoaded', () => {
  assert.equal(count(bootstrap, "document.addEventListener('DOMContentLoaded', installPageEnhancements"), 1);
  assert.match(bootstrap, /if \(document\.body\) installPageEnhancements\(\);\s*else document\.addEventListener\('DOMContentLoaded', installPageEnhancements/);
  assert.doesNotMatch(bootstrap, /if \(document\.body\) installPageEnhancements\(\);\s*if \(document\.readyState === 'loading'\)/);
});

test('privacy bootstrap failure is fail-closed instead of starting telemetry anyway', () => {
  assert.match(bootstrap, /Analytics bootstrap failed closed/);
  assert.match(bootstrap, /Analytics remained unavailable because the privacy policy could not be confirmed first/);
  assert.doesNotMatch(bootstrap, /privacy\.onerror\s*=.*loadBase/s);
});
