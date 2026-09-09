'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const patch = read('response-simulator/tablet-button-stability-1.6.54.js');
const release = read('shared/release-bootstrap-1.6.54.js');

test('tablet button uses a CSS-owned label so legacy Reveal Route text cannot flash on screen', () => {
  assert.match(patch, /#route-answer-btn\.ptbo-tablet-owned-label\{/);
  assert.match(patch, /font-size:0!important/);
  assert.match(patch, /content:'Open Tablet'/);
  assert.match(patch, /button\.classList\.add\('ptbo-tablet-owned-label'\)/);
  assert.match(patch, /MutationObserver/);
});

test('v1.6.54 desktop release loads the tablet button stability patch', () => {
  assert.match(release, /const VERSION = '1\.6\.54'/);
  assert.match(release, /tablet-button-stability-1\.6\.54\.js\?v=1\.6\.54/);
  assert.match(release, /PTBO_TABLET_BUTTON_STABILITY\?\.version !== VERSION/);
  assert.match(release, /PTBO_TABLET_CLOSE_DISPATCH\?\.version !== '1\.6\.53'/);
});
