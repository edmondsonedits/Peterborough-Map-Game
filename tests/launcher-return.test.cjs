'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function launcher(search, ready = false) {
  const listeners = new Map();
  const state = { opens:0, focuses:0, replaced:null };
  const dispatch = { focus:() => { state.focuses += 1; } };
  const context = {
    URL, console,
    location:{ href:'https://example.com/Peterborough-Map-Game/' + search },
    history:{ replaceState:(_a,_b,url) => { state.replaced = String(url); } },
    document:{ getElementById:id => id === 'dispatch-game-link' ? dispatch : null },
    addEventListener:(name, listener) => listeners.set(name, listener),
  };
  context.window = context;
  if (ready) context.PTBO_CITY_SELECTOR = { open:() => { state.opens += 1; } };
  const file = path.resolve(__dirname, '../shared/training-ui.js');
  vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', context);
  return { context, state, listeners };
}

test('Back to cities waits for selector readiness and opens only once', () => {
  const app = launcher('?chooseCity=1&keep=yes#dispatch-start');
  assert.equal(app.state.opens, 0);
  app.context.PTBO_CITY_SELECTOR = { open:() => { app.state.opens += 1; } };
  app.listeners.get('ptbo:city-selector-ready')?.();
  app.listeners.get('pageshow')?.();
  assert.equal(app.state.opens, 1);
  assert.equal(app.state.replaced, '/Peterborough-Map-Game/?keep=yes#dispatch-start');
});

test('All games restores Dispatch focus without opening city selection', () => {
  const app = launcher('?focus=dispatch#dispatch-start', true);
  assert.equal(app.state.focuses, 1);
  assert.equal(app.state.opens, 0);
  assert.equal(app.state.replaced, '/Peterborough-Map-Game/#dispatch-start');
});

test('ordinary launcher visits leave navigation and focus unchanged', () => {
  const app = launcher('?city=oshawa', true);
  assert.equal(app.state.opens, 0);
  assert.equal(app.state.focuses, 0);
  assert.equal(app.state.replaced, null);
});
