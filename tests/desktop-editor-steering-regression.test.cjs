'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('dispatch editor does not require the removed dispatch-store getSeed API', () => {
  assert.match(read('dispatch-editor/editor.js'), /calls\.getSeed\?\.\(\)\|\|locations/);
});

test('desktop keyboard path is loaded by the desktop wrapper and stays out of mobile', () => {
  assert.match(read('response-simulator/play/index.html'), /desktop-keyboard\.js/);
  assert.doesNotMatch(read('response-simulator/mobile/index.html'), /desktop-keyboard\.js/);
});

test('desktop steering mode ignores a persisted mobile directional mode', () => {
  const source = read('response-simulator/vehicle-instruments-core.js');
  assert.match(source, /const initialMode = isMobileWrapper\(\) && storedMode === STEERING_MODES\.DIRECTIONAL/);
  assert.match(source, /const mobile = isMobileWrapper\(\);/);
  assert.match(source, /if \(mobile\) localStorage\.setItem\(STEERING_STORAGE_KEY, nextMode\)/);
});
