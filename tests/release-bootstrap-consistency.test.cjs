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
  'route-mapping/index.html',
  'route-mapping/play.html',
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

function enhancementLifecycleHarness({blank=false,holdFirst=false,failCurrent=false}={}) {
  const vm=require('node:vm'),source=bootstrap.slice(bootstrap.indexOf('  function installResponseEnhancements()'),bootstrap.indexOf('  function installPageEnhancements()'));
  const calls=[],errors=[],stages=[],listeners=new Map(),root={appendChild(){}},url='https://example.test/response-simulator/index.html?city=richmond-hill&v='+releaseVersion;
  const makeDoc=()=>({URL:url,readyState:'complete',body:root,head:root,documentElement:root});
  const original=makeDoc();if(blank)original.URL='about:blank';
  const game={PTBO_CITY_PACKAGE:{name:'Richmond Hill',features:{hospitalTransport:true}},PTBO_CITY_RUNTIME_READY:Promise.resolve()};
  const frame={src:url,dataset:{},contentDocument:original,contentWindow:game,addEventListener:(name,fn)=>listeners.set(name,fn)};
  let settle,rejectFirst;const first=new Promise((resolve,reject)=>{settle=resolve;rejectFirst=reject;});
  const inject=(doc,id)=>{calls.push({doc,id});if(failCurrent&&id==='ptbo-simulator-readiness')return Promise.reject(Error('active module failed'));if(holdFirst&&doc===original&&id==='ptbo-simulator-readiness')return first;return Promise.resolve({});};
  const context=vm.createContext({VERSION:releaseVersion,CITY_RUNTIME_VERSION:'1.6.17',Promise,URL,location:{pathname:'/response-simulator/play/',href:'https://example.test/response-simulator/play/'},document:{getElementById:()=>frame},redirectWrongSimulatorSurface:()=>false,normalizeSimulatorFrameUrl(){},setCityLoadingCopy(){},removeNestedBuildBadge(){},selectedCityId:()=> 'richmond-hill',enhancementStage:(stage,detail)=>stages.push({stage,detail}),traceOk(){},traceWarn(){},console:{error:(...args)=>errors.push(args)},setTimeout:fn=>queueMicrotask(fn),sleep:()=>new Promise(()=>{}),injectIntoFrame:inject,optionalInnerModule:inject});
  vm.runInContext(source+'\ninstallResponseEnhancements();',context);
  return {calls,errors,stages,original,frame,settle,rejectFirst,replace(){frame.contentDocument=makeDoc();listeners.get('load')();return frame.contentDocument;},flush:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('enhancement loader waits for the simulator document instead of initial about:blank',async()=>{
  const h=enhancementLifecycleHarness({blank:true});await h.flush();assert.equal(h.calls.length,0);const doc=h.replace();await h.flush();assert.ok(h.calls.length>0);assert.ok(h.calls.every(c=>c.doc===doc));assert.equal(h.stages.at(-1).stage,'complete');
});
test('replaced iframe cannot continue injecting modules or overwrite the new completion state',async()=>{
  const h=enhancementLifecycleHarness({holdFirst:true});await h.flush();assert.equal(h.calls.length,1);const doc=h.replace();await h.flush();assert.equal(h.stages.at(-1).stage,'complete');h.settle({});await h.flush();assert.equal(h.calls.filter(c=>c.doc===h.original).length,1);assert.ok(h.calls.some(c=>c.doc===doc));assert.equal(h.stages.at(-1).stage,'complete');assert.equal(h.errors.length,0);
});
test('rejected obsolete iframe injection does not report an active bootstrap failure',async()=>{
  const h=enhancementLifecycleHarness({holdFirst:true});await h.flush();h.replace();await h.flush();h.rejectFirst(Error('old document removed'));await h.flush();assert.equal(h.errors.length,0);assert.equal(h.stages.at(-1).stage,'complete');
});
test('current iframe injection failures remain visible',async()=>{
  const h=enhancementLifecycleHarness({failCurrent:true});await h.flush();assert.equal(h.stages.at(-1).stage,'failed');assert.match(h.stages.at(-1).detail,/active module failed/);assert.equal(h.errors.length,1);
});

test('enhancement loader ignores a pre-normalization city document until the requested frame loads',async()=>{
  const h=enhancementLifecycleHarness();h.original.URL=h.original.URL.replace('city=richmond-hill','city=toronto');await h.flush();assert.equal(h.calls.length,0);const current=h.replace();await h.flush();assert.ok(h.calls.length>0);assert.ok(h.calls.every(c=>c.doc===current));assert.equal(h.stages.at(-1).stage,'complete');
});
