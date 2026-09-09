#!/usr/bin/env node
import fs from 'node:fs';

const VERSION = '1.6.46';

function rewrite(file, transform) {
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${file}: expected v${VERSION} transformation did not change the file`);
  fs.writeFileSync(file, after);
  console.log(`${file}: updated`);
}

rewrite('geo-guesser/index.html', text => {
  let next = text.replace(/build-version\.js\?v=\d+\.\d+\.\d+/g, `build-version.js?v=${VERSION}`);
  const leafletLine = '  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>';
  const policyBlock = [
    leafletLine,
    `  <script src="../response-simulator/carto-basemap-policy-1.6.36.js?v=${VERSION}"></script>`,
    `  <script src="map-provider-1.6.46.js?v=${VERSION}"></script>`,
  ].join('\n');
  if (!next.includes(leafletLine)) throw new Error('Geo Guesser Leaflet anchor changed');
  if (!next.includes('map-provider-1.6.46.js')) next = next.replace(leafletLine, policyBlock);

  const startAnchor = 'function start(s){station=stations[s];';
  if (!next.includes(startAnchor)) throw new Error('Geo Guesser start() anchor changed');
  next = next.replace(startAnchor, 'function start(s){if(!window.PTBO_GEO_MAP_PROVIDER?.requireReady?.())return;station=stations[s];');

  const editorAnchor = 'function openEditor(){let enabled=false;';
  if (!next.includes(editorAnchor)) throw new Error('Geo Guesser openEditor() anchor changed');
  next = next.replace(editorAnchor, 'function openEditor(){if(!window.PTBO_GEO_MAP_PROVIDER?.requireReady?.())return;let enabled=false;');

  const legacyLayer = "L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(";
  const occurrences = next.split(legacyLayer).length - 1;
  if (occurrences !== 2) throw new Error(`Expected two direct legacy Geo Guesser tile layers, found ${occurrences}`);
  next = next.replaceAll(legacyLayer, 'window.PTBO_GEO_MAP_PROVIDER.createStreetLayer({maxZoom:19}).addTo(');
  return next;
});

rewrite('shared/build-version.js', text => {
  let next = text.replace(/const VERSION = '\d+\.\d+\.\d+';/, `const VERSION = '${VERSION}';`);
  const oldCheck = [
    '        const configured = policy?.config?.() || {};',
    "        if (policy?.commercialMode?.() && !String(configured.osmTileUrl || '').trim()) {",
    "          throw new Error('Department Geo Guesser requires a licensed/self-hosted street-map tile provider.');",
    '        }',
  ].join('\n');
  const newCheck = [
    '        const coreStatus = game.PTBO_GEO_MAP_PROVIDER?.readiness?.();',
    '        if (coreStatus && !coreStatus.ready) {',
    "          throw new Error(coreStatus.reason || 'Department Geo Guesser map-provider configuration is incomplete.');",
    '        }',
    '        const configured = policy?.config?.() || {};',
    "        if (!coreStatus && policy?.commercialMode?.() && !String(configured.osmTileUrl || '').trim()) {",
    "          throw new Error('Department Geo Guesser requires a licensed/self-hosted street-map tile provider.');",
    '        }',
  ].join('\n');
  if (!next.includes(oldCheck)) throw new Error('Geo Guesser wrapper map-policy bridge anchor changed');
  next = next.replace(oldCheck, newCheck);
  return next;
});

for (const file of [
  'index.html',
  'response-simulator/play/index.html',
  'response-simulator/mobile/index.html',
  'city-explorer/index.html',
]) {
  rewrite(file, text => text.replace(/build-version\.js\?v=\d+\.\d+\.\d+/g, `build-version.js?v=${VERSION}`));
}

for (const file of [
  'geo-guesser/desktop/index.html',
  'geo-guesser/mobile/index.html',
  'geo-guesser/online/index.html',
]) {
  rewrite(file, text => text
    .replace(/build-version\.js\?v=\d+\.\d+\.\d+/g, `build-version.js?v=${VERSION}`)
    .replace(/const VERSION\s*=\s*'\d+\.\d+\.\d+'/, `const VERSION = '${VERSION}'`));
}

rewrite('tools/commercial-readiness-audit.mjs', text => {
  let next = text;
  const requiredAnchor = "  'response-simulator/carto-basemap-policy-1.6.36.js',";
  if (!next.includes(requiredAnchor)) throw new Error('Commercial audit required-files anchor changed');
  if (!next.includes("'geo-guesser/map-provider-1.6.46.js'")) {
    next = next.replace(requiredAnchor, `${requiredAnchor}\n  'geo-guesser/map-provider-1.6.46.js',`);
  }
  next = next.replace("  'geo-guesser/index.html',\n", '');

  const oldSectionStart = '// Geo Guesser keeps its stable core HTML, but every supported wrapper must install';
  const oldSectionEnd = '// Confirm the runtime privacy policy keeps department deployments opt-in.';
  const start = next.indexOf(oldSectionStart);
  const end = next.indexOf(oldSectionEnd);
  if (start < 0 || end < 0 || end <= start) throw new Error('Commercial audit Geo Guesser section anchor changed');
  const newSection = `// Geo Guesser enforces map-provider policy inside the core itself; wrappers remain defense-in-depth.\nif (fs.existsSync(path.join(ROOT, 'geo-guesser/index.html'))) {\n  const geo = read('geo-guesser/index.html');\n  const provider = fs.existsSync(path.join(ROOT, 'geo-guesser/map-provider-1.6.46.js')) ? read('geo-guesser/map-provider-1.6.46.js') : '';\n  const build = fs.existsSync(path.join(ROOT, 'shared/build-version.js')) ? read('shared/build-version.js') : '';\n  for (const term of ['carto-basemap-policy-1.6.36.js', 'map-provider-1.6.46.js', 'PTBO_GEO_MAP_PROVIDER.createStreetLayer', 'PTBO_GEO_MAP_PROVIDER?.requireReady']) {\n    if (!geo.includes(term)) failures.push(\`Geo Guesser core map-provider enforcement is missing expected control: \${term}\`);\n  }\n  if (/https:\\/\\/\\{s\\}\\.tile\\.openstreetmap\\.org/i.test(geo)) failures.push('Geo Guesser core still constructs the legacy OSM subdomain tile URL directly.');\n  for (const term of ['PUBLIC_DEMO_URL', 'configured-provider', 'blocked-missing-provider', 'requireReady', 'createStreetLayer']) {\n    if (!provider.includes(term)) failures.push(\`Geo Guesser core map-provider module is missing expected control: \${term}\`);\n  }\n  for (const term of ['installGeoGuesserMapPolicy', 'ptbo-geo-commercial-map-policy', "frame.style.pointerEvents = 'none'", 'PTBO_GEO_MAP_PROVIDER?.readiness']) {\n    if (!build.includes(term)) failures.push(\`Geo Guesser wrapper defense-in-depth bridge is missing expected control: \${term}\`);\n  }\n  for (const wrapper of ['geo-guesser/desktop/index.html', 'geo-guesser/mobile/index.html', 'geo-guesser/online/index.html']) {\n    if (!fs.existsSync(path.join(ROOT, wrapper))) failures.push(\`Missing Geo Guesser wrapper protected by the shared map-provider bridge: \${wrapper}\`);\n  }\n}\n\n`;
  next = next.slice(0, start) + newSection + next.slice(end);
  return next;
});

console.log(`Prepared Emergency Games v${VERSION} Geo Guesser core map-provider enforcement.`);
