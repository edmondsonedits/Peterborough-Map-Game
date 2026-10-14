'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const appPath = path.join(root, 'homepage/app.js');
const source = fs.existsSync(appPath) ? fs.readFileSync(appPath, 'utf8') : '';
const selectorSource = fs.readFileSync(path.join(root, 'shared/city-selector.js'), 'utf8');
const registrySource = fs.readFileSync(path.join(root, 'cities/city-registry.js'), 'utf8');

// Browser surfaces are stubbed; every test executes the complete production controller.
class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  emit(type, detail = {}) { const event = { type, target: this, ...detail }; for (const fn of this.listeners.get(type) || []) fn(event); return event; }
}
class Element extends Target {
  constructor(id = '') {
    super(); this.id = id; this.dataset = {}; this.attributes = {}; this.hidden = false; this.inert = false;
    this.value = ''; this.href = ''; this.textContent = ''; this.children = []; this.classes = new Set();
    this.classList = { toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name), contains: name => this.classes.has(name) };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(selector) { if (selector === '[data-motion-label]') return this.motionLabel || null; if (!this.parts) this.parts = new Map(); if (!this.parts.has(selector)) this.parts.set(selector, new Element()); return this.parts.get(selector); }
  contains(node) { return node === this || this.children.includes(node); }
  focus() { this.focused = true; }
}
function fixture({ stored, requested = '', mobile = false, reduced = false, denied = false, motion, initialize = true, cinematic = true, analytics } = {}) {
  const document = new Target(), window = new Target(), elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
  document.body = new Element('body'); document.body.dataset = { homepage: cinematic ? 'cinematic' : '', homeMotion: 'off' };
  document.head = new Element('head'); document.hidden = false; document.activeElement = null;
  document.currentScript = { src: 'https://example.test/game/shared/city-selector.js?v=1.6.105' };
  document.getElementById = id => elements.get(id) || null;
  document.createElement = tag => { const node = new Element(); node.tagName = tag.toUpperCase(); return node; };
  const choices = ['geo', 'route', 'dispatch'].map(mode => { const node = get(mode + '-game-link'); node.dataset.preview = mode; return node; });
  choices[0].href = 'https://example.test/game/geo-guesser/desktop/';
  choices[1].href = 'https://example.test/game/route-mapping/?v=1.6.105';
  choices[2].href = 'https://example.test/game/response-simulator/play/';
  get('city-explorer-link').href = 'https://example.test/game/city-explorer/';
  const launches = ['geo', 'route', 'dispatch'].map(mode => { const node = new Element(); node.dataset.previewLaunch = mode; return node; });
  const panels = ['geo', 'route', 'dispatch'].map((mode, i) => { const node = new Element(); node.dataset.previewPanel = mode; node.appendChild(launches[i]); node.hidden = i > 0; return node; });
  const badges = [new Element(), new Element()]; badges.forEach(node => { node.dataset.peterboroughOnly = ''; node.hidden = true; });
  const cityNames = [new Element()], dispatchNames = [new Element()];
  const dispatchPreviewTitles = [new Element()], dispatchPreviewDescriptions = [new Element()], dispatchModeLabels = [new Element()];
  panels[2].querySelector('img').alt = 'Peterborough Dispatch Simulator gameplay';
  ['home-city-select', 'home-city-status', 'home-dispatch-title', 'home-dispatch-description', 'home-motion-toggle', 'home-preview'].forEach(get);
  get('home-motion-toggle').motionLabel = new Element();
  const groups = { '[data-preview]': choices, '[data-preview-panel]': panels, '[data-preview-launch]': launches,
    '[data-peterborough-only]': badges, '[data-selected-city-name]': cityNames, '[data-dispatch-city]': dispatchNames,
    '[data-dispatch-preview-title]': dispatchPreviewTitles, '[data-dispatch-preview-description]': dispatchPreviewDescriptions,
    '[data-dispatch-mode-label]': dispatchModeLabels };
  document.querySelectorAll = query => groups[query] || [];
  const storage = new Map(); if (stored != null) storage.set('ptboSelectedCity', stored); if (motion != null) storage.set('ptboHomepageMotion', motion);
  let writes = 0;
  const localStorage = { getItem(key) { if (denied) throw Error('denied'); return storage.get(key) ?? null; }, setItem(key, value) { if (denied) throw Error('denied'); writes++; storage.set(key, String(value)); } };
  const media = new Target(); media.matches = reduced;
  window.matchMedia = () => media;
  window.PTBO_SITE_ANALYTICS = analytics;
  window.PTBO_BUILD = { version: '1.6.105' }; window.PTBO_DEVICE_SURFACE = { isMobile: () => mobile };
  const location = { href: 'https://example.test/game/' + requested, search: requested, pathname: '/game/' };
  Object.assign(window, { document, location, localStorage });
  const context = vm.createContext({ window, document, location, localStorage, URL, URLSearchParams, navigator: { userAgent: 'Desktop', maxTouchPoints: 0 }, Date: { now: () => 123456789 }, console });
  vm.runInContext(registrySource, context);
  vm.runInContext(source, context);
  if (initialize) window.PTBO_HOMEPAGE?.init({ cities: window.PTBO_CITIES });
  return { window, document, context, get, choices, launches, panels, badges, cityNames, dispatchNames, dispatchPreviewTitles, dispatchPreviewDescriptions, dispatchModeLabels, storage, media, writes: () => writes,
    changeCity(id, event = {}) { get('home-city-select').value = id; get('home-city-select').emit('change', event); },
    runSelector() { vm.runInContext(selectorSource, context); } };
}
function dispatchURL(h, preview = false) { return new URL(preview ? h.launches[2].href : h.get('dispatch-game-link').href); }

test('defaults to Peterborough and keeps the three games and 3D entry reachable', () => {
  const h = fixture();
  assert.equal(h.get('home-city-select').value, 'peterborough');
  assert.match(h.get('home-dispatch-title').textContent, /Dispatch/);
  assert.equal(dispatchURL(h).searchParams.get('city'), 'peterborough');
  assert.equal(h.choices.filter(node => !node.hidden).length, 3);
  assert.ok(h.get('city-explorer-link').href.includes('city-explorer/'));
  assert.ok(h.badges.every(node => node.hidden));
});

test('restores a valid city and describes non-Peterborough mode as free driving', () => {
  const h = fixture({ stored: 'oshawa' });
  assert.equal(h.get('home-city-select').value, 'oshawa');
  assert.equal(h.get('home-dispatch-title').textContent, 'Free Driving');
  assert.match(h.get('home-dispatch-description').textContent, /Oshawa/);
  assert.match(h.get('home-city-status').textContent, /Peterborough/);
  assert.ok(h.badges.every(node => !node.hidden));
  assert.equal(h.panels.find(node => !node.hidden).dataset.previewPanel, 'dispatch');
  assert.equal(h.get('geo-game-link').href, 'https://example.test/game/geo-guesser/desktop/');
  assert.equal(h.get('route-game-link').href, 'https://example.test/game/route-mapping/?v=1.6.105');
});

test('explicit valid city wins; corrupt IDs fall back to a valid stored city or Peterborough', () => {
  assert.equal(fixture({ stored: 'oshawa', requested: '?city=toronto' }).get('home-city-select').value, 'toronto');
  assert.equal(fixture({ stored: 'oshawa', requested: '?city=made-up' }).get('home-city-select').value, 'oshawa');
  assert.equal(fixture({ stored: 'bad<script>' }).get('home-city-select').value, 'peterborough');
});

test('city changes persist, update both real Dispatch hrefs, and restore Peterborough defaults', () => {
  const h = fixture(); h.changeCity('belleville');
  assert.equal(h.storage.get('ptboSelectedCity'), 'belleville');
  assert.equal(dispatchURL(h).searchParams.get('city'), 'belleville');
  assert.equal(h.launches[2].href, h.choices[2].href);
  assert.equal(h.dispatchNames[0].textContent, 'Belleville');
  h.changeCity('peterborough');
  assert.equal(h.get('home-dispatch-title').textContent, 'Dispatch Simulator');
  assert.equal(h.panels.find(node => !node.hidden).dataset.previewPanel, 'geo');
  h.changeCity('invalid');
  assert.equal(dispatchURL(h).searchParams.get('city'), 'peterborough');
});

test('storage denial never prevents a city selection or launching', () => {
  const h = fixture({ denied: true }); h.changeCity('markham');
  assert.equal(h.get('home-city-select').value, 'markham');
  assert.equal(dispatchURL(h).searchParams.get('city'), 'markham');
});

test('Dispatch anchors use the device API and canonical build before any normal or modified click', () => {
  for (const mobile of [false, true]) {
    const h = fixture({ mobile, stored: 'pickering' }), url = dispatchURL(h);
    assert.equal(url.pathname, '/game/response-simulator/' + (mobile ? 'mobile/' : 'play/'));
    assert.equal(url.searchParams.get('surface'), mobile ? 'mobile' : 'desktop');
    assert.equal(url.searchParams.get('v'), '1.6.105');
    assert.equal(url.searchParams.get('fresh'), '123456789');
    assert.equal(h.launches[2].href, url.href);
    let prevented = false;
    h.choices[2].emit('click', { button: 0, ctrlKey: true, preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    assert.equal(dispatchURL(h).searchParams.get('city'), 'pickering');
  }
});

test('mouse and keyboard preview selection reveal one panel and remove hidden panels from focus', () => {
  const h = fixture();
  h.choices[1].emit('mouseenter');
  assert.ok(h.choices[1].classes.has('is-active'));
  assert.deepEqual(h.panels.map(node => node.hidden), [true, false, true]);
  assert.deepEqual(h.panels.map(node => node.inert), [true, false, true]);
  h.choices[2].emit('focus');
  assert.deepEqual(h.panels.map(node => node.hidden), [true, true, false]);
  assert.ok(h.choices[2].classes.has('is-active'));
  assert.equal(h.choices[1].classes.has('is-active'), false);
});

test('manual motion pause persists and hidden documents pause without changing the saved preference', () => {
  const h = fixture(), button = h.get('home-motion-toggle');
  assert.equal(h.document.body.dataset.homeMotion, 'on');
  button.emit('click');
  assert.equal(h.document.body.dataset.homeMotion, 'off');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(h.storage.get('ptboHomepageMotion'), 'off');
  button.emit('click');
  h.document.hidden = true; h.document.emit('visibilitychange');
  assert.equal(h.document.body.dataset.homeMotion, 'off');
  assert.equal(h.storage.get('ptboHomepageMotion'), 'on');
  h.document.hidden = false; h.document.emit('visibilitychange');
  assert.equal(h.document.body.dataset.homeMotion, 'on');
  assert.equal(fixture({ motion: 'off' }).document.body.dataset.homeMotion, 'off');
});

test('reduced motion always pauses and preference changes safely resume only permitted motion', () => {
  const h = fixture({ reduced: true });
  assert.equal(h.document.body.dataset.homeMotion, 'off');
  h.get('home-motion-toggle').emit('click');
  assert.equal(h.document.body.dataset.homeMotion, 'off');
  h.media.matches = false; h.media.emit('change');
  assert.equal(h.document.body.dataset.homeMotion, 'on');
  h.media.matches = true; h.media.emit('change');
  assert.equal(h.document.body.dataset.homeMotion, 'off');
});

test('late city-registry initialization and repeat pageshow do not duplicate listeners or reset a preview', () => {
  const h = fixture({ initialize: false });
  assert.ok(h.window.PTBO_HOMEPAGE?.init);
  h.runSelector(); h.runSelector();
  h.window.PTBO_HOMEPAGE.init({ cities: h.window.PTBO_CITIES });
  h.choices[1].emit('focus');
  h.window.emit('pageshow'); h.window.emit('pageshow');
  assert.equal(h.get('home-city-select').listeners.get('change').length, 1);
  assert.equal(h.get('home-motion-toggle').listeners.get('click').length, 1);
  assert.equal(h.panels.find(node => !node.hidden).dataset.previewPanel, 'route');
  assert.equal(h.document.listeners.get('click'), undefined, 'homepage must bypass the legacy city-dialog click interception');
  assert.ok(h.document.head.children.some(node => node.id === 'ptbo-launcher-access-1-6-47'), 'editor gate still loads');
});

test('valid storage events update city context without navigation or focus changes', () => {
  const h = fixture(); const focused = h.get('home-city-select'); h.document.activeElement = focused;
  h.window.emit('storage', { key: 'ptboSelectedCity', newValue: 'toronto' });
  assert.equal(h.get('home-city-select').value, 'toronto');
  assert.equal(dispatchURL(h).searchParams.get('city'), 'toronto');
  assert.equal(h.document.activeElement, focused);
  h.window.emit('storage', { key: 'ptboSelectedCity', newValue: 'bad-city' });
  assert.equal(dispatchURL(h).searchParams.get('city'), 'toronto');
});

test('existing launcher keeps its city dialog when the new homepage controller is unavailable', () => {
  const h = fixture({ initialize: false }); h.window.PTBO_HOMEPAGE = undefined;
  h.runSelector();
  assert.ok(h.document.body.children.some(node => node.id === 'ptbo-city-dialog'));
  assert.equal(h.document.listeners.get('click')?.length, 1);
});

test('returning from a game refreshes city and motion preferences changed while the homepage was frozen', () => {
  const h = fixture();
  h.storage.set('ptboSelectedCity', 'scarborough');
  h.storage.set('ptboHomepageMotion', 'off');
  h.window.emit('pageshow');
  assert.equal(h.get('home-city-select').value, 'scarborough');
  assert.equal(dispatchURL(h).searchParams.get('city'), 'scarborough');
  assert.equal(h.document.body.dataset.homeMotion, 'off');
});

test('background city updates keep a focused preview link visible', () => {
  const h = fixture(); h.choices[1].emit('focus'); h.document.activeElement = h.launches[1];
  h.window.emit('storage', { key: 'ptboSelectedCity', newValue: 'toronto' });
  assert.equal(h.panels[1].hidden, false);
  assert.equal(h.document.activeElement, h.launches[1]);
  assert.equal(dispatchURL(h).searchParams.get('city'), 'toronto');
});

test('initialization waits safely for a usable registry', () => {
  const h = fixture({ initialize: false });
  assert.equal(h.window.PTBO_HOMEPAGE.init({ cities: [] }), false);
  assert.equal(h.window.PTBO_HOMEPAGE.init({ cities: h.window.PTBO_CITIES }), true);
  assert.equal(h.get('home-city-select').listeners.get('change').length, 1);
});


test('Dispatch preview distinguishes calls from free driving and keeps screenshot geography truthful', () => {
  const h = fixture();
  assert.equal(h.get('home-dispatch-description').textContent, 'Drive Fire & EMS responses.');
  assert.equal(h.dispatchPreviewTitles[0].textContent, 'Take the next call.');
  assert.equal(h.dispatchModeLabels[0].textContent, 'Dispatch Simulator');
  assert.equal(h.dispatchPreviewDescriptions[0].textContent, 'Choose Fire or EMS and practise your response.');
  assert.equal(h.launches[2].querySelector('[data-launch-label]').textContent, 'Play Dispatch Simulator');
  h.changeCity('toronto');
  assert.equal(h.get('home-dispatch-description').textContent, 'Drive Fire & EMS in Toronto.');
  assert.equal(h.dispatchPreviewTitles[0].textContent, 'Get to know the streets.');
  assert.equal(h.dispatchModeLabels[0].textContent, 'Free Driving');
  assert.equal(h.dispatchPreviewDescriptions[0].textContent, 'Choose Fire or EMS for free driving. Dispatch calls are in Peterborough.');
  assert.equal(h.launches[2].querySelector('[data-launch-label]').textContent, 'Start free driving');
  assert.equal(h.panels[2].querySelector('img').alt, 'Peterborough Dispatch Simulator gameplay');
  h.changeCity('peterborough');
  assert.equal(h.dispatchPreviewTitles[0].textContent, 'Take the next call.');
  assert.equal(h.launches[2].querySelector('[data-launch-label]').textContent, 'Play Dispatch Simulator');
});


test('only trusted valid user selections record one city analytics event', () => {
  const recorded = [];
  const h = fixture({ stored: 'oshawa', requested: '?city=pickering', analytics: { recordCity(id) { recorded.push(id); } } });
  assert.deepEqual(recorded, [], 'restore and query selection are not user interactions');
  h.window.PTBO_HOMEPAGE.init({ cities: h.window.PTBO_CITIES });
  h.window.emit('pageshow');
  h.window.emit('storage', { key: 'ptboSelectedCity', newValue: 'markham' });
  h.changeCity('belleville');
  h.changeCity('invalid', { isTrusted: true });
  assert.deepEqual(recorded, [], 'background and synthetic changes are not user interactions');
  h.changeCity('toronto', { isTrusted: true });
  assert.deepEqual(recorded, ['toronto']);
  assert.equal(dispatchURL(h).searchParams.get('city'), 'toronto');
  assert.equal(h.storage.get('ptboSelectedCity'), 'toronto');
});

test('city analytics respects the existing tracking exclusion', () => {
  const recorded = [];
  const h = fixture({ analytics: { trackingAllowed: () => false, recordCity: id => recorded.push(id) } });
  h.changeCity('toronto', { isTrusted: true });
  assert.deepEqual(recorded, []);
  assert.equal(dispatchURL(h).searchParams.get('city'), 'toronto');
});

test('missing, throwing or rejected analytics cannot block city preference or canonical launch links', async () => {
  for (const analytics of [undefined,
    { recordCity() { throw Error('analytics unavailable'); } },
    { recordCity() { return Promise.reject(Error('analytics rejected')); } },
    { trackingAllowed() { throw Error('analytics unavailable'); }, recordCity() {} },
  ]) {
    const h = fixture({ analytics });
    assert.doesNotThrow(() => h.changeCity('oshawa', { isTrusted: true }));
    assert.equal(h.storage.get('ptboSelectedCity'), 'oshawa');
    assert.equal(dispatchURL(h).searchParams.get('city'), 'oshawa');
    await Promise.resolve();
  }
});

function launcherAccessFixture(version) {
  const document = new Target(), window = new Target(), elements = new Map(), timers = [];
  const ids = ['dispatch-editor-link', 'ptbo-build-badge', 'ptbo-editor-unlock-form', 'ptbo-editor-password',
    'ptbo-editor-unlock-error', 'ptbo-editor-unlock-cancel', 'ptbo-editor-unlock-submit'];
  ids.forEach(id => elements.set(id, new Element(id)));
  document.getElementById = id => elements.get(id) || null;
  document.documentElement = new Element(); document.head = new Element(); document.body = new Element();
  document.createElement = () => new Element();
  if (version) window.PTBO_BUILD = { version };
  const badge = elements.get('ptbo-build-badge');
  // The canonical release listener is installed first; the access patch runs afterward on browser back.
  window.addEventListener('pageshow', () => { if (window.PTBO_BUILD) badge.textContent = 'v' + window.PTBO_BUILD.version; });
  const context = vm.createContext({ window, document, Element,
    addEventListener: window.addEventListener.bind(window), setTimeout: fn => timers.push(fn), console });
  vm.runInContext(fs.readFileSync(path.join(root, 'shared/launcher-access-1.6.47.js'), 'utf8'), context);
  return { window, document, badge, timers };
}

test('launcher access preserves the canonical release badge initially, after its timer and on browser back', () => {
  const h = launcherAccessFixture('1.6.107');
  assert.equal(h.badge.textContent, 'v1.6.107');
  assert.equal(h.badge.getAttribute('aria-label'), 'Production launcher version 1.6.107');
  h.timers.forEach(fn => fn());
  assert.equal(h.badge.textContent, 'v1.6.107');
  h.window.PTBO_BUILD = { version: '1.6.108' };
  h.window.emit('pageshow');
  assert.equal(h.badge.textContent, 'v1.6.108');
  assert.equal(h.badge.getAttribute('aria-label'), 'Production launcher version 1.6.108');
  assert.equal(h.window.PTBO_LAUNCHER_PATCH.version, '1.6.47');
  assert.equal(h.document.documentElement.dataset.ptboLauncherVersion, '1.6.47');
});

test('launcher access falls back to its module version only when no canonical authority is loaded', () => {
  const h = launcherAccessFixture();
  assert.equal(h.badge.textContent, 'v1.6.47');
  h.window.emit('pageshow');
  assert.equal(h.badge.textContent, 'v1.6.47');
  h.window.PTBO_BUILD = { version: '1.6.107' };
  h.window.emit('pageshow');
  assert.equal(h.badge.textContent, 'v1.6.107');
});

test('city selector cache-busts the stable access patch with the canonical release', () => {
  const h = fixture({ initialize: false });
  h.window.PTBO_BUILD = { version: '1.6.107' };
  h.runSelector();
  const script = h.document.head.children.find(node => node.id === 'ptbo-launcher-access-1-6-47');
  const url = new URL(script.src);
  assert.equal(url.pathname, '/game/shared/launcher-access-1.6.47.js');
  assert.equal(url.searchParams.get('v'), '1.6.107');
  assert.equal(h.window.PTBO_CITY_SELECTOR.version, '1.6.47');
});

test('city selector retains the access patch module cache token without canonical release authority', () => {
  const h = fixture({ initialize: false });
  delete h.window.PTBO_BUILD;
  h.runSelector();
  const script = h.document.head.children.find(node => node.id === 'ptbo-launcher-access-1-6-47');
  const url = new URL(script.src);
  assert.equal(url.pathname, '/game/shared/launcher-access-1.6.47.js');
  assert.equal(url.searchParams.get('v'), '1.6.47');
});
