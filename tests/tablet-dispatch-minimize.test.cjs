'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('dispatch tablet uses normal street maps with a backup provider', () => {
  const tablet = read('response-simulator/response-tablet-1.6.48.js');
  const mapPolicy = read('response-simulator/carto-basemap-policy-1.6.36.js');
  assert.doesNotMatch(tablet, /World_Imagery|World_Boundaries_and_Places/);
  assert.match(tablet, /function currentSimulatorStreetProvider\(\)/);
  assert.match(tablet, /function createStreetLayer\(style = 'simulator'\)/);
  assert.match(tablet, /tileLayerInstance\._url/);
  assert.match(tablet, /subdomains:provider\.subdomains \|\| 'abc'/);
  assert.match(tablet, /primary\.on\('tileerror', markPrimaryFailed\)/);
  assert.match(tablet, /setTimeout\(markPrimaryFailed, 3500\)/);
  assert.doesNotMatch(mapPolicy, /subdomains:undefined/);
  assert.match(mapPolicy, /subdomains:'abc'/);
  assert.match(tablet, /createStreetLayer\('positron'\)/);
  assert.match(tablet, /data-state="loading"/);
  assert.match(read('shared/release-bootstrap-1.6.57.js'), /response-tablet-1\.6\.48\.js\?v=1\.6\.66&map=street/);
});

const bridge = read('response-simulator/tablet-close-dispatch-1.6.53.js');
const release = read('shared/release-bootstrap-1.6.53.js');

test('closing the response tablet minimizes the active dispatch HUD', () => {
  assert.match(bridge, /if \(state\.wasTabletOpen && !open\) minimizeDispatchHud\(\)/);
  assert.match(bridge, /hud\.classList\.contains\('incident-active'\)/);
  assert.match(bridge, /hud\.classList\.add\('ptbo-tablet-dispatch-collapsed'\)/);
  assert.match(bridge, /ptbo-tablet-dispatch-expand/);
  assert.match(bridge, /hud\.classList\.remove\('ptbo-tablet-dispatch-collapsed'\)/);
});

test('v1.6.53 desktop release loads both the tablet and its dispatch minimizer', () => {
  assert.match(release, /const VERSION = '1\.6\.53'/);
  assert.match(release, /response-tablet-1\.6\.48\.js\?v=1\.6\.53/);
  assert.match(release, /tablet-close-dispatch-1\.6\.53\.js\?v=1\.6\.53/);
  assert.match(release, /PTBO_TABLET_CLOSE_DISPATCH\?\.version !== VERSION/);
});
