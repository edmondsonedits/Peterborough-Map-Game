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


test('Pages deployment stages only the production-facing artifact', () => {
  const deploy = read('.github/workflows/deploy-pages.yml');
  assert.match(deploy, /name: Stage production Pages artifact/);
  assert.match(deploy, /path: _site/);
  assert.doesNotMatch(deploy, /path: \./);
  for (const excluded of ['.git/','.github/','tests/','tools/','scripts/','test-artifacts/','artifacts/']) {
    assert.match(deploy, new RegExp(`--exclude '${excluded.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&')}'`), excluded);
  }
  assert.match(deploy, /test -f _site\/docs\/ANALYTICS-PRIVACY-SECURITY\.md/);
});


test('successful main geospatial refresh deploys its final bot commit',()=>{
 const deploy=read('.github/workflows/deploy-pages.yml');
 const build=read('.github/workflows/build-peterborough-assets.yml');
 const name=build.match(/^name: (.+)$/m)[1];
 assert.match(deploy,/workflow_run:/);
 assert.ok(deploy.includes(`workflows: ['${name}']`));
 assert.match(deploy,/types: \[completed\]/);
 assert.match(deploy,/github\.event\.workflow_run\.conclusion == 'success'/);
 assert.match(deploy,/github\.event\.workflow_run\.event != 'pull_request'/);
 assert.match(deploy,/github\.event_name == 'workflow_run' && 'main' \|\| github\.ref/);
});


test('every fingerprinted road source triggers the geospatial rebuild',()=>{
 const workflow=read('.github/workflows/build-peterborough-assets.yml');
 const push=workflow.slice(workflow.indexOf('  push:'),workflow.indexOf('  pull_request:'));
 const patterns=[...push.matchAll(/^\s*-\s*'([^']+)'\s*$/gm)].map(match=>match[1]);
 const sources=Object.keys(JSON.parse(read('city-explorer/data/road-pack/manifest.json')).sources);
 const matches=(pattern,file)=>new RegExp('^'+pattern.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('**','\0').replaceAll('*','[^/]*').replaceAll('\0','.*')+'$').test(file);
 for(const file of sources)assert.ok(patterns.some(pattern=>matches(pattern,file)),`Road source does not trigger rebuild: ${file}`);
});
test('browser-dependent workflows pin a supported runner and the tested Playwright version', () => {
  const files = [
    '.github/workflows/city-explorer-browser-qa.yml',
    '.github/workflows/build-peterborough-assets.yml',
  ];
  for (const file of files) {
    const source = read(file);
    const runners = [...source.matchAll(/^\s+runs-on:\s*(\S+)\s*$/gm)].map(match => match[1]);
    assert.ok(runners.length > 0, `${file} has no runner declaration`);
    assert.deepEqual([...new Set(runners)], ['ubuntu-24.04'], `${file} must pin every job to ubuntu-24.04`);

    const versions = [...source.matchAll(/\bplaywright@(\d+\.\d+\.\d+)/g)].map(match => match[1]);
    assert.ok(versions.length > 0, `${file} must pin Playwright`);
    assert.deepEqual([...new Set(versions)], ['1.62.1'], `${file} must use the tested Playwright version`);
    assert.match(source, /playwright@1\.62\.1 install --with-deps chromium/, `${file} must install Chromium and runner dependencies`);
  }
});

test('ignored asset workflow completions cannot cancel real Pages deployments', () => {
  const deploy = read('.github/workflows/deploy-pages.yml');
  const expression = deploy.match(/^  group: \$\{\{ (.+) \}\}$/m)?.[1];
  assert.ok(expression, 'Pages concurrency must classify workflow completion before scheduling');
  const group = (eventName, conclusion = '', event = 'push', runId = 1) =>
    require('node:vm').runInNewContext(expression, {
      github: { event_name: eventName, event: { workflow_run: { conclusion, event } }, run_id: runId },
      format: (template, value) => template.replace('{0}', String(value)),
    });
  assert.equal(group('push'), 'pages');
  assert.equal(group('workflow_dispatch'), 'pages');
  assert.equal(group('workflow_run', 'success'), 'pages');
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped']) {
    const first = group('workflow_run', conclusion, 'push', 123);
    assert.notEqual(first, 'pages', `${conclusion} must not join the live deployment group`);
    assert.notEqual(first, group('workflow_run', conclusion, 'push', 124), 'ignored completions use unique groups');
  }
  assert.notEqual(group('workflow_run', 'success', 'pull_request'), 'pages', 'pull-request completions stay isolated');
});
