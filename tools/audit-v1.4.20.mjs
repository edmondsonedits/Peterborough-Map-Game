import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
const checks = [];
const pass = (name, detail) => checks.push({ name, detail });
const fail = (name, detail) => failures.push({ name, detail });
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const entryPoints = [
  'index.html',
  'response-simulator/index.html',
  'response-simulator/play/index.html',
  'response-simulator/mobile/index.html',
  'response-simulator/camera-game-test/index.html',
  'geo-guesser/index.html',
  'geo-guesser/desktop/index.html',
  'geo-guesser/mobile/index.html',
  'geo-guesser/online/index.html',
  'city-explorer/index.html',
  'dispatch-editor/index.html',
];

for (const entry of entryPoints) {
  const source = read(entry);
  if (!source.includes('test-build.js?v=1.4.20')) fail('test-build-label', `${entry} does not load the v1.4.20 test label.`);
  const refs = [...source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(match => match[1]);
  for (const ref of refs) {
    if (/^(?:https?:|data:|#|mailto:|javascript:)/i.test(ref)) continue;
    const pathname = ref.split(/[?#]/, 1)[0];
    if (!pathname || pathname.endsWith('/')) continue;
    const resolved = path.resolve(path.dirname(path.join(root, entry)), pathname);
    if (!fs.existsSync(resolved)) fail('local-reference', `${entry} references missing ${ref}.`);
  }
}
pass('entry-points', `${entryPoints.length} HTML entry points have local asset and test-label coverage.`);

const sourceFiles = [];
function walk(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    if (item.isDirectory()) {
      if (relative.startsWith('test-artifacts') || relative.startsWith('city-explorer/data')) continue;
      walk(absolute);
    } else if (/\.(?:html|js|css|md)$/.test(item.name) && relative !== 'geo-guesser/text-fix.js') {
      sourceFiles.push(relative);
    }
  }
}
walk(root);
const mojibake = /(?:â.|Ã.|Â.|ð.|ï.)/;
for (const relative of sourceFiles) {
  if (mojibake.test(read(relative))) fail('encoding', `${relative} contains a likely double-encoded character.`);
}
pass('encoding', `${sourceFiles.length} source files scanned for mojibake.`);

const dispatchSource = read('shared/dispatch-data-1.4.4.js');
const payload = dispatchSource.match(/const PAYLOAD = '([^']+)'/)?.[1];
if (!payload) {
  fail('dispatch-data', 'Compressed dispatch payload was not found.');
} else {
  const locations = JSON.parse(zlib.gunzipSync(Buffer.from(payload, 'base64')));
  const ids = new Set();
  const signatures = new Set();
  for (const location of locations) {
    if (!location.id || ids.has(location.id)) fail('dispatch-id', `Missing or duplicate ID: ${location.id || '(missing)'}.`);
    ids.add(location.id);
    const signature = [location.main, location.sub, location.name, location.addr, location.lat, location.lng].join('|').toLowerCase();
    if (signatures.has(signature)) fail('dispatch-duplicate', `Duplicate dispatch: ${location.name} — ${location.addr}.`);
    signatures.add(signature);
    if (!location.main || !location.sub || !location.name || !location.addr) fail('dispatch-fields', `Incomplete dispatch: ${location.id}.`);
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || location.lat < 44.20 || location.lat > 44.45 || location.lng < -78.45 || location.lng > -78.20) {
      fail('dispatch-coordinates', `Out-of-bounds dispatch: ${location.id}.`);
    }
    if (![1, 2, 3].includes(location.district)) fail('dispatch-district', `Invalid station district: ${location.id}.`);
  }
  if (locations.filter(location => location.cityTen).length !== 10) fail('city-ten', 'The City Ten must contain exactly ten locations.');
  pass('dispatch-data', `${locations.length} calls, ${ids.size} unique IDs, 10 City Ten locations.`);
}

const roadCore = read('response-simulator/road-collision-core.js');
if (!roadCore.includes('defaultLaneAssist: 0.60') || !roadCore.includes('value="60"')) fail('lane-assist', 'Lane centering does not default to 60%.');
else pass('lane-assist', 'Lane centering defaults to 60%.');

const camera = read('response-simulator/smooth-driving-camera-1.4.19.js');
if (!camera.includes("const VERSION = '1.4.20'") || !camera.includes("if (mobileUi)") || !camera.includes("ptbo-camera-settings-toggle")) {
  fail('mobile-camera', 'The v1.4.20 mobile camera setting was not found.');
} else {
  pass('mobile-camera', 'Mobile camera control remains inside the Options panel; desktop retains map controls.');
}

const mainMenu = read('index.html');
if (/KM\/H/i.test(mainMenu)) fail('main-menu', 'The main menu contains KM/H.');
if (!mainMenu.includes('dispatch-editor-link') || !mainMenu.includes('developerLinks')) fail('developer-tools', 'Developer tools are not gated from the normal menu.');
else pass('developer-tools', 'City Explorer and Dispatch Editor are developer-mode gated.');

const report = { version: '1.4.20', passed: failures.length === 0, checks, failures };
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
