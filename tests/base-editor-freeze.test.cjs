'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const editor = read('dispatch-editor/spawn-box-editor-1.6.55.js');
const normalizer = read('scripts/normalize-release-1.6.55.cjs');

test('base editor sync is frame-coalesced instead of self-triggering through microtasks', () => {
  assert.match(editor, /const VERSION = '1\.6\.55'/);
  assert.match(editor, /function scheduleSync\(\)/);
  assert.match(editor, /requestAnimationFrame\(\(\) =>/);
  assert.doesNotMatch(editor, /observer\.observe\(form,\{attributes:true,subtree:true,childList:true,characterData:true\}\)/);
  assert.match(editor, /observer\.observe\(form,\{attributes:true,attributeFilter:\['class'\]\}\)/);
  assert.match(editor, /observer\.observe\(baseId,\{childList:true,characterData:true,subtree:true\}\)/);
});

test('editor text writes are idempotent so observer callbacks cannot form a feedback loop', () => {
  assert.match(editor, /setTextIfChanged/);
  assert.match(editor, /element\.textContent !== value/);
  assert.match(editor, /setTextIfChanged\(\$\('base-help'\)/);
});

test('v1.6.55 deployment normalizes Dispatch Editor to the fixed spawn-box module', () => {
  assert.match(normalizer, /'dispatch-editor\/index\.html'/);
  assert.match(normalizer, /spawn-box-editor-/);
  assert.match(normalizer, /spawn-box-editor-\$\{VERSION\}\.js\?v=\$\{VERSION\}/);
});
