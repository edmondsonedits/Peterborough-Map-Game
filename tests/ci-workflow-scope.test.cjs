'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(file, 'utf8');

test('release metadata changes do not trigger heavy City Explorer workflows', () => {
  const geospatial = read('.github/workflows/build-peterborough-assets.yml');
  const browser = read('.github/workflows/city-explorer-browser-qa.yml');

  assert.doesNotMatch(geospatial, /^\s*-\s*'city-explorer\/index\.html'\s*$/m);
  assert.doesNotMatch(browser, /^\s*-\s*'city-explorer\/index\.html'\s*$/m);
});

test('heavy workflows still watch their real functional inputs', () => {
  const geospatial = read('.github/workflows/build-peterborough-assets.yml');
  const browser = read('.github/workflows/city-explorer-browser-qa.yml');

  assert.match(geospatial, /^\s*-\s*'tools\/geospatial\/\*\*'\s*$/m);
  assert.match(geospatial, /^\s*-\s*'city-explorer\/data\/terrain\/peterborough-dtm-2025\*'\s*$/m);
  assert.match(browser, /^\s*-\s*'city-explorer\/app\.js'\s*$/m);
  assert.match(browser, /^\s*-\s*'city-explorer\/feature-utils\.js'\s*$/m);
  assert.match(browser, /^\s*-\s*'city-explorer\/mobile-controls\*\.js'\s*$/m);
});

test('all workflows remain independent of OpenAI or Codex API calls', () => {
  for (const file of fs.readdirSync('.github/workflows')) {
    if (!/\.ya?ml$/.test(file)) continue;
    const source = read(`.github/workflows/${file}`);
    assert.doesNotMatch(source, /\b(?:openai|codex|chatgpt)\b/i, `${file} unexpectedly invokes AI tooling`);
  }
});


test('production CI does not silently skip named tests', () => {
  const deploy = read('.github/workflows/deploy-pages.yml');
  assert.doesNotMatch(deploy, /--test-skip-pattern/);
});
