#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const warnings = [];

const requiredFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'firestore.rules',
  'firebase.json',
  'docs/ANALYTICS-PRIVACY-SECURITY.md',
  'docs/COMMERCIAL-MAP-SETUP.md',
  'docs/COMMERCIAL-LICENSING.md',
  'docs/COMMERCIAL-READINESS.md',
  'shared/build-version.js',
  'shared/map-attribution-1.6.35.js',
  'shared/analytics-privacy-upgrade-1.6.33.js',
  'response-simulator/carto-basemap-policy-1.6.36.js',
];

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, file))) failures.push(`Missing required commercial-readiness file: ${file}`);
}

const textExtensions = new Set(['.js', '.mjs', '.html', '.css', '.json', '.md', '.yml', '.yaml', '.txt', '.rules']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage']);

function walk(directory, prefix = '') {
  const items = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes:true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) items.push(...walk(absolute, relative));
    else if (textExtensions.has(path.extname(entry.name).toLowerCase()) || entry.name === 'LICENSE') items.push(relative);
  }
  return items;
}

const files = walk(ROOT);
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const normalize = file => file.replaceAll('\\', '/');

// Canonical version must exist and remain semver-like.
if (fs.existsSync(path.join(ROOT, 'shared/build-version.js'))) {
  const build = read('shared/build-version.js');
  const match = build.match(/const\s+VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/);
  if (!match) failures.push('shared/build-version.js does not expose a canonical x.y.z VERSION.');
  else console.log(`Commercial readiness audit: build v${match[1]}`);
}

// The admin stats page must not regress to client-side pseudo-auth or direct Firestore reads.
if (fs.existsSync(path.join(ROOT, 'site-stats/index.html'))) {
  const stats = read('site-stats/index.html');
  if (/localStorage\.getItem\(['"]ptbo-emergency-stats-mode['"]\)/.test(stats)) failures.push('site-stats still uses localStorage as an access-control gate.');
  if (/firestore\.googleapis\.com|site-analytics-1\.6\.25\.js/.test(stats)) failures.push('site-stats directly accesses/loads the browser Firestore analytics path.');
  if (!/PTBO_SECURE_ANALYTICS/.test(stats)) failures.push('site-stats does not require the secure analytics interface.');
}

// Firestore rules must never contain an unrestricted wildcard rule.
if (fs.existsSync(path.join(ROOT, 'firestore.rules'))) {
  const rules = read('firestore.rules');
  if (/allow\s+(?:read|write|read\s*,\s*write|read\s*,\s*create|create\s*,\s*read)[^;]*:\s*if\s+true\s*;/i.test(rules)) failures.push('firestore.rules contains an unconditional allow rule.');
  if (!/siteAnalytics/.test(rules)) failures.push('firestore.rules does not define explicit siteAnalytics protection.');
  if (!/request\.auth/.test(rules)) warnings.push('firestore.rules does not appear to reference authenticated access.');
}

const guardedLegacy = new Set([
  'response-simulator/satellite-map-1.5.6.js',
  'response-simulator/carto-basemap-policy-1.6.36.js',
  'response-simulator/index.html',
]);

const patterns = [
  {
    label:'legacy OSM subdomain tile URL',
    regex:/https:\/\/\{s\}\.tile\.openstreetmap\.org/gi,
    note:'Use exact OSM community URL for demos or configured production provider for commercial mode.',
  },
  {
    label:'anonymous CARTO CDN URL',
    regex:/https:\/\/\{s\}\.basemaps\.cartocdn\.com/gi,
    note:'CARTO must remain runtime-guarded or use current authenticated configuration.',
  },
  {
    label:'direct public Esri World Imagery endpoint',
    regex:/https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/World_Imagery/gi,
    note:'Commercial mode must route through configured authenticated provider.',
  },
  {
    label:'direct public Esri reference-label endpoint',
    regex:/https:\/\/services\.arcgisonline\.com\/ArcGIS\/rest\/services\/Reference\/World_Boundaries_and_Places/gi,
    note:'Commercial mode must route through configured authenticated provider.',
  },
];

for (const file of files) {
  const normalized = normalize(file);
  const content = read(file);

  for (const rule of patterns) {
    rule.regex.lastIndex = 0;
    if (!rule.regex.test(content)) continue;
    if (guardedLegacy.has(normalized)) warnings.push(`${rule.label} retained in guarded legacy file ${normalized}. ${rule.note}`);
    else failures.push(`${rule.label} found outside the guarded migration layer: ${normalized}. ${rule.note}`);
  }

  // Obvious high-risk secrets. Firebase browser API keys are intentionally not included here.
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
    /\bghp_[A-Za-z0-9]{30,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
  ];
  if (secretPatterns.some(regex => regex.test(content))) failures.push(`Possible committed secret/private key detected in ${normalized}.`);
}

// Confirm the runtime privacy policy keeps department deployments opt-in.
if (fs.existsSync(path.join(ROOT, 'shared/analytics-privacy-upgrade-1.6.33.js'))) {
  const privacy = read('shared/analytics-privacy-upgrade-1.6.33.js');
  if (!/departmentDeployment/.test(privacy) || !/analyticsEnabled/.test(privacy)) failures.push('Analytics privacy wrapper is missing department deployment controls.');
  if (!/persistentCrossVisitPlayerId:false/.test(privacy)) failures.push('Analytics privacy wrapper no longer declares cross-visit player identity disabled.');
}

// Confirm commercial maps fail closed when credentials/providers are absent.
if (fs.existsSync(path.join(ROOT, 'response-simulator/carto-basemap-policy-1.6.36.js'))) {
  const maps = read('response-simulator/carto-basemap-policy-1.6.36.js');
  for (const term of ['arcgisAccessToken', 'osmTileUrl', 'readyForCommercialMaps', 'commercialMode']) {
    if (!maps.includes(term)) failures.push(`Commercial map policy is missing expected control: ${term}`);
  }
}

if (warnings.length) {
  console.warn('\nWarnings:');
  warnings.forEach(item => console.warn(`  - ${item}`));
}

if (failures.length) {
  console.error('\nCommercial readiness audit FAILED:');
  failures.forEach(item => console.error(`  - ${item}`));
  process.exitCode = 1;
} else {
  console.log(`\nCommercial readiness audit passed with ${warnings.length} warning(s).`);
}
