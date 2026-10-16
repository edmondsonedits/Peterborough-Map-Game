'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'route-mapping/index.html'), 'utf8');

test('plain Route Mapping URLs pin this mode to Peterborough before shared city loaders run', () => {
  const match = html.match(/<script\s+data-route-city-bootstrap>([\s\S]*?)<\/script>/i);
  assert.ok(match, 'Route Mapping needs a scoped early city bootstrap');
  const location = { href: 'https://example.test/route-mapping/?mode=practice&city=toronto#map' };
  const historyWrites = [];
  const context = {
    location,
    URL,
    history: { replaceState: (...args) => { historyWrites.push(args); location.href = new URL(args[2], location.href).href; } },
  };
  vm.runInNewContext(match[1], context);
  const finalUrl = new URL(location.href);
  assert.equal(finalUrl.searchParams.get('city'), 'peterborough');
  assert.equal(finalUrl.searchParams.get('mode'), 'practice');
  assert.equal(finalUrl.hash, '#map');
  assert.equal(historyWrites.length, 1);
  assert.ok(html.indexOf(match[0]) < html.indexOf('response-simulator/service-config.js'), 'city pin must run before service and base loaders');
});
