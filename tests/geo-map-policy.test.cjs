'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const providerSource = fs.readFileSync(path.join(root, 'geo-guesser/map-provider-1.6.46.js'), 'utf8');
const coreSource = () => fs.readFileSync(path.join(root, 'geo-guesser/index.html'), 'utf8');

function providerHarness({ deployment = {}, mapConfig = {} } = {}) {
  const calls = [];
  const bodyChildren = [];
  const nodes = new Map();
  const body = {
    appendChild(node) { bodyChildren.push(node); if (node.id) nodes.set(node.id, node); return node; },
  };
  const document = {
    body,
    createElement(tag) {
      return {
        tagName:String(tag).toUpperCase(),
        id:'',
        style:{ cssText:'' },
        children:[],
        firstElementChild:null,
        setAttribute() {},
        appendChild(child) { this.children.push(child); if (!this.firstElementChild) this.firstElementChild = child; return child; },
        remove() { if (this.id) nodes.delete(this.id); },
        textContent:'',
      };
    },
    getElementById(id) { return nodes.get(id) || null; },
  };
  const context = vm.createContext({
    console,
    document,
    PTBO_DEPLOYMENT:deployment,
    PTBO_MAP_CONFIG:mapConfig,
    L:{ tileLayer(url, options) { calls.push({ url, options }); return { url, options, addTo() { return this; } }; } },
  });
  context.window = context;
  vm.runInContext(providerSource, context, { filename:'map-provider-1.6.46.js' });
  return { api:context.PTBO_GEO_MAP_PROVIDER, calls, document };
}

test('public demo uses the exact OSM community endpoint without legacy subdomains', () => {
  const { api, calls } = providerHarness();
  assert.equal(api.requireReady(), true);
  api.createStreetLayer();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.doesNotMatch(calls[0].url, /\{s\}\.tile\.openstreetmap\.org/);
});

test('department mode fails closed when no licensed/self-hosted street provider is configured', () => {
  const { api, calls, document } = providerHarness({ deployment:{ mode:'department' } });
  assert.equal(api.requireReady(), false);
  const status = api.readiness();
  assert.equal(status.ready, false);
  assert.equal(status.streetTiles, 'required-before-use');
  assert.ok(document.getElementById('ptbo-geo-core-map-blocker'));
  api.createStreetLayer();
  assert.equal(calls[0].url.startsWith('data:image/gif'), true);
});

test('department mode uses the configured production street provider', () => {
  const { api, calls } = providerHarness({
    deployment:{ mode:'department', map:{ osmTileUrl:'https://tiles.example.test/{z}/{x}/{y}.png', osmAttribution:'Tiles © Example Maps · © OpenStreetMap contributors' } },
  });
  assert.equal(api.requireReady(), true);
  api.createStreetLayer({ maxZoom:20 });
  assert.equal(calls[0].url, 'https://tiles.example.test/{z}/{x}/{y}.png');
  assert.equal(calls[0].options.attribution, 'Tiles © Example Maps · © OpenStreetMap contributors');
  assert.equal(calls[0].options.maxZoom, 20);
});

test('Geo Guesser core loads shared commercial policy and core provider before game code', () => {
  const html = coreSource();
  const leaflet = html.indexOf('leaflet.js');
  const policy = html.indexOf('carto-basemap-policy-1.6.36.js');
  const provider = html.indexOf('map-provider-1.6.46.js');
  const stations = html.indexOf('const stations=');
  assert.ok(leaflet >= 0, 'Leaflet script must exist');
  assert.ok(policy > leaflet, 'commercial map policy must load after Leaflet');
  assert.ok(provider > policy, 'Geo core provider must load after commercial map policy');
  assert.ok(stations > provider, 'game code must execute after the provider boundary');
});

test('Geo Guesser gameplay and editor maps use the provider boundary instead of direct OSM tile creation', () => {
  const html = coreSource();
  assert.doesNotMatch(html, /L\.tileLayer\(['\"]https:\/\/\{s\}\.tile\.openstreetmap\.org/);
  assert.ok(html.includes('PTBO_GEO_MAP_PROVIDER.createStreetLayer'), 'Geo Guesser maps must be created through PTBO_GEO_MAP_PROVIDER');
  assert.ok(html.includes('PTBO_GEO_MAP_PROVIDER?.requireReady'), 'Geo Guesser entry paths must require provider readiness before map use');
  const uses = [...html.matchAll(/PTBO_GEO_MAP_PROVIDER\.createStreetLayer/g)];
  assert.ok(uses.length >= 2, 'both gameplay and editor maps must use the shared provider boundary');
});
