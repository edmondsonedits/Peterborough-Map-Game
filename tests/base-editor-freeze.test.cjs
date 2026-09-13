'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const editor = read('dispatch-editor/spawn-box-editor-1.6.55.js');
const normalizer = read('scripts/normalize-release-1.6.55.cjs');

test('base store cannot inject an obsolete editor alongside the explicit module', () => {
  assert.doesNotMatch(read('shared/base-locations.js'), /document\.write\s*\(/);
  const html = read('dispatch-editor/index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)src="([^"]+)"[^>]*>/g)];
  const spawn = scripts.filter(match => match[2].includes('spawn-box-editor-'));
  assert.equal(spawn.length, 1);
  assert.doesNotMatch(spawn[0][1], /application\/x-ptbo-disabled/);
  assert.match(spawn[0][2], /spawn-box-editor-1\.6\.55\.js/);
});

test('hospital updates observe selection rather than their own form writes', () => {
  const source = read('dispatch-editor/hospital-dropoff-editor-1.6.49.js');
  assert.doesNotMatch(source, /queueMicrotask\(syncFromEditor\)/);
  assert.match(source, /attributeFilter:\['class'\]/);
  assert.doesNotMatch(source, /observe\(form,\{attributes:true,subtree:true/);
});

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
