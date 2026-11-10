'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('../tools/location-report-tests/node_modules/jsdom');

test('driving HUD resumes one refresh loop on every cached page restoration', t => {
  const dom = new JSDOM('<div id="dispatch-hud"><div id="hud-content">Call</div><div class="hud-timer-block"><span id="hud-clock">0.0</span><button id="hud-action-btn">Start call</button></div></div><section id="control-panel" class="minimized"><div class="panel-scroll"></div></section>', { url: 'https://example.test/response-simulator/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window, timers = new Map(); let serial = 0;
  w.setInterval = fn => { const id = ++serial; timers.set(id, fn); return id; };
  w.clearInterval = id => timers.delete(id);
  w.PTBO_SERVICE = { state: { mode: 'fire', selected: true }, getBase: () => ({ number: 1, name: 'Station 1' }) };
  w.PTBO_VEHICLE_INSTRUMENTS = { state: { speedKmh: 10 } };
  w.eval(fs.readFileSync('response-simulator/driving-ui.js', 'utf8'));
  const speed = () => w.document.getElementById('ptbo-driving-speed').textContent;
  assert.equal(timers.size, 1); assert.equal(speed(), '10 km/h');
  w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: false }));
  assert.equal(timers.size, 1, 'initial pageshow must not duplicate the existing loop');
  for (const value of [20, 30, 40]) {
    w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
    assert.equal(timers.size, 0);
    w.PTBO_VEHICLE_INSTRUMENTS.state.speedKmh = value;
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(timers.size, 1); assert.equal(speed(), `${value} km/h`, 'restoration refreshes immediately');
    w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
    assert.equal(timers.size, 1);
    w.PTBO_VEHICLE_INSTRUMENTS.state.speedKmh = value + 1;
    for (const fn of timers.values()) fn();
    assert.equal(speed(), `${value + 1} km/h`);
  }
  w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: false }));
  assert.equal(timers.size, 0, 'terminal navigation also stops refreshing');
});
