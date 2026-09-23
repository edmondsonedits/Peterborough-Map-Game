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


test('shared build version is the single production release authority', () => {
  const releaseBootstrap = read('shared/release-bootstrap.js');
  const cityRelease = read('city-explorer/release.js');
  const tablet = read('response-simulator/response-tablet-1.6.48.js');
  const normalizer = read('scripts/normalize-release.cjs');

  assert.match(releaseBootstrap, /const VERSION = window\.PTBO_BUILD\?\.version/);
  assert.match(cityRelease, /const VERSION = window\.PTBO_BUILD\?\.version/);
  assert.match(tablet, /const VERSION = window\.PTBO_BUILD\?\.version/);
  assert.doesNotMatch(releaseBootstrap, /const VERSION = '\d+\.\d+\.\d+'/);
  assert.doesNotMatch(cityRelease, /const VERSION = '\d+\.\d+\.\d+'/);
  assert.doesNotMatch(tablet, /const VERSION = '\d+\.\d+\.\d+'/);
  assert.match(normalizer, /const versionMatch = build\.match/);
  assert.doesNotMatch(normalizer, /const VERSION = '\d+\.\d+\.\d+'/);
});

test('live release entry points use stable filenames and the canonical cache version', () => {
  const rootHtml = read('index.html');
  const desktopHtml = read('response-simulator/play/index.html');
  const explorerHtml = read('city-explorer/index.html');

  assert.match(rootHtml, new RegExp(`shared/release-bootstrap\\.js\\?v=${releaseVersion}`));
  assert.match(desktopHtml, new RegExp(`shared/release-bootstrap\\.js\\?v=${releaseVersion}`));
  assert.match(explorerHtml, new RegExp(`release\\.js\\?v=${releaseVersion}`));
  assert.match(explorerHtml, new RegExp(`Peterborough 3D Simulator — v${releaseVersion}`));
  assert.doesNotMatch(rootHtml, /release-bootstrap-\d+\.\d+\.\d+\.js/);
  assert.doesNotMatch(desktopHtml, /release-bootstrap-\d+\.\d+\.\d+\.js/);
  assert.doesNotMatch(explorerHtml, /release-\d+\.\d+\.\d+\.js/);
});

test('deployment and browser QA use the stable release-management entry points', () => {
  assert.match(read('.github/workflows/deploy-pages.yml'), /node scripts\/normalize-release\.cjs/);
  assert.match(read('.github/workflows/city-explorer-browser-qa.yml'), /city-explorer\/release\.js/);
});


test('numbered release bootstraps are compatibility-only forwarders', () => {
  const sharedDir = path.join(root, 'shared');
  const files = fs.readdirSync(sharedDir)
    .filter(file => /^release-bootstrap-\d+\.\d+\.\d+\.js$/.test(file))
    .sort();
  assert.equal(files.length, 9);
  for (const file of files) {
    const source = read(`shared/${file}`);
    assert.match(source, /legacy-release-forwarder\.js/);
    assert.doesNotMatch(source, /window\.PTBO_RELEASE\s*=/);
    assert.doesNotMatch(source, /const VERSION\s*=/);
    assert.ok(source.length < 900, `${file} should remain a tiny compatibility stub`);
  }
});

test('legacy compatibility bridge resolves through canonical build and stable release', () => {
  const source = read('shared/legacy-release-forwarder.js');
  assert.match(source, /build-version\.js\?legacy=current/);
  assert.match(source, /window\.PTBO_BUILD\?\.version/);
  assert.match(source, /release-bootstrap\.js\?v=\$\{version\}/);
  assert.doesNotMatch(source, /const VERSION\s*=\s*'\d+\.\d+\.\d+'/);
});
