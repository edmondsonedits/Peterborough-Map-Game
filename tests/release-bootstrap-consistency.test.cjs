'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const bootstrap = read('shared/build-version.js');
const versionMatch = bootstrap.match(/const VERSION = '(\d+\.\d+\.\d+)'/);

assert.ok(versionMatch, 'shared/build-version.js must expose a semantic release version');
const releaseVersion = versionMatch[1];

const canonicalSurfaces = [
  'index.html',
  'response-simulator/play/index.html',
  'response-simulator/mobile/index.html',
  'geo-guesser/index.html',
  'geo-guesser/desktop/index.html',
  'geo-guesser/mobile/index.html',
  'geo-guesser/online/index.html',
  'city-explorer/index.html',
];

for (const file of canonicalSurfaces) {
  test(`${file} loads exactly one current shared build bootstrap`, () => {
    const html = read(file);
    const matches = [...html.matchAll(/build-version\.js\?v=(\d+\.\d+\.\d+)/g)].map(match => match[1]);
    assert.equal(matches.length, 1, `${file} must contain exactly one versioned build-version.js reference`);
    assert.equal(matches[0], releaseVersion, `${file} bootstrap cache key must match v${releaseVersion}`);
    assert.doesNotMatch(html, /<script[^>]+site-analytics-1\.6\.25\.js/i, `${file} must not bypass the privacy-first analytics bootstrap`);
  });
}

for (const file of [
  'geo-guesser/desktop/index.html',
  'geo-guesser/mobile/index.html',
  'geo-guesser/online/index.html',
]) {
  test(`${file} wrapper release identity matches the canonical build`, () => {
    const html = read(file);
    const match = html.match(/const VERSION\s*=\s*'(\d+\.\d+\.\d+)'/);
    assert.ok(match, `${file} must declare its wrapper VERSION`);
    assert.equal(match[1], releaseVersion, `${file} wrapper VERSION must match v${releaseVersion}`);
  });
}
