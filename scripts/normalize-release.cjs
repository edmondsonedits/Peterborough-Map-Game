'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const canonicalSurfaces = [
  'index.html',
  'feedback/index.html',
  'route-mapping/index.html',
  'route-mapping/play.html',
  'response-simulator/play/index.html',
  'response-simulator/mobile/index.html',
  'response-simulator/index.html',
  'geo-guesser/index.html',
  'geo-guesser/desktop/index.html',
  'geo-guesser/mobile/index.html',
  'geo-guesser/online/index.html',
  'city-explorer/index.html',
  'dispatch-editor/index.html',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function write(file, value) {
  fs.writeFileSync(path.join(root, file), value, 'utf8');
}

function replaceRequired(file, source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error(`${file}: missing ${label}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const build = read('shared/build-version.js');
const versionMatch = build.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
if (!versionMatch) throw new Error('shared/build-version.js: missing canonical VERSION');
const VERSION = versionMatch[1];

for (const file of canonicalSurfaces) {
  let html = read(file);
  html = replaceRequired(
    file,
    html,
    /build-version\.js\?v=\d+\.\d+\.\d+/g,
    `build-version.js?v=${VERSION}`,
    'versioned build bootstrap'
  );

  if (file === 'index.html' || file === 'response-simulator/play/index.html') {
    html = replaceRequired(
      file,
      html,
      /release-bootstrap(?:-\d+\.\d+\.\d+)?\.js\?v=\d+\.\d+\.\d+/g,
      `release-bootstrap.js?v=${VERSION}`,
      'release bootstrap'
    );
  }

  if (file === 'city-explorer/index.html') {
    html = replaceRequired(
      file,
      html,
      /release(?:-\d+\.\d+\.\d+)?\.js\?v=\d+\.\d+\.\d+/g,
      `release.js?v=${VERSION}`,
      'City Explorer release marker'
    );
    html = html.replace(
      /Peterborough 3D Simulator — v\d+\.\d+\.\d+/,
      `Peterborough 3D Simulator — v${VERSION}`
    );
  }

  if (file === 'dispatch-editor/index.html') {
    html = replaceRequired(
      file,
      html,
      /spawn-box-editor-\d+\.\d+\.\d+\.js\?v=\d+\.\d+\.\d+/g,
      `spawn-box-editor-1.6.55.js?v=${VERSION}`,
      'dispatch editor spawn-box module'
    );
    html = html.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${VERSION}`);
  }

  if (file === 'response-simulator/index.html') {
    html = replaceRequired(
      file,
      html,
      /service-config\.js\?v=\d+\.\d+\.\d+/g,
      `service-config.js?v=${VERSION}`,
      'versioned service configuration'
    );
  }

  if ([
    'geo-guesser/desktop/index.html',
    'geo-guesser/mobile/index.html',
    'geo-guesser/online/index.html',
  ].includes(file)) {
    html = replaceRequired(
      file,
      html,
      /const VERSION\s*=\s*'\d+\.\d+\.\d+'/,
      `const VERSION = '${VERSION}'`,
      'wrapper VERSION'
    );
  }

  if(['response-simulator/play/index.html','response-simulator/mobile/index.html'].includes(file))html=html.replace(/const VERSION\s*=\s*'\d+\.\d+\.\d+'/,`const VERSION='${VERSION}'`);

  // Every active surface uses the canonical cache token, including import maps.
  html=html.replace(/([?&](?:amp;)?v=)\d+\.\d+\.\d+/g, `$1${VERSION}`);
  write(file, html);
}

// These imports share module identity with versioned entrypoints. Keep the
// authored-scene bridge and main renderer on the same CitySplatLayer instance.
for (const file of ['city-explorer/app.js', 'city-explorer/business-signs.js', 'city-explorer/authored-scene-bootstrap.js', 'city-explorer/road-orientation-fix.js', 'city-explorer/editor/city-editor.js']) {
  const source = replaceRequired(file, read(file), /(\.\/(?:editor\/)?(?:business-signs|business-sign-layout|mapped-building-dimensions|city-splat-layer|authored-scene-bootstrap|draft-store|city-editor|version-saver|recovery-prompt|authored-runtime|ai-editor-tools|ai-editor-camera|ai-editor-panel|ai-editor-bounds)\.js\?v=)\d+\.\d+\.\d+/g, `$1${VERSION}`, 'shared versioned module import');
  write(file, source);
}

// Changed visual modules also need fresh cache keys; retaining an old profile or
// road module with the new app can otherwise mix incompatible release behavior.
const visualModules = ["road-pack-optimize", "connected-road-surface", "road-paint-geometry", "road-tile-pack", "road-tile-stream", "road-tile-layer", "road-pack-version", "road-pack-export", "road-pack-build", "road-surface-finish", "graphics-quality", "road-recovery", "editor/feature-batch-binding", "station-one-runtime", "station-two-runtime", "station-three-runtime", "emergency-facilities", "emergency-facilities-catalog", "building-appearance", "building-archetypes", "city-material-library", "city-visual-settings", "corridor-recording-appearances", "cricket-recording-appearances", "facade-components", "hunter-bridge-appearance", "hunter-bridge-source", "hunter-bridge-surface", "intersection-hologram-rules", "intersection-holograms", "recording-appearance", "recording-photo-profiles", "recording-reference-appearances", "recording-surface-appearance", "reviewed-photo-appearance", "road-appearance-rules", "road-network", "roadside-furniture-geometry", "roadside-furniture-placement", "sherbrooke-details", "sherbrooke-footage", "sherbrooke-footage-profiles", "sherbrooke-garden-clearance", "sherbrooke-plan", "sherbrooke-pole-placement", "web-building-profiles"];
const visualImport = new RegExp('(\\./(?:' + visualModules.join('|') + ')\\.js)(?:\\?v=[^\"\']*)?(?=[\"\'])', 'g');
for (const file of ['city-explorer/app.js', ...visualModules.map(name => `city-explorer/${name}.js`), 'city-explorer/material-preview.js']) {
  write(file, read(file).replace(visualImport, `$1?v=${VERSION}`));
}


// Authored facility geometry and layout revisions must bypass earlier cached copies.
for (const file of ['city-explorer/app.js','city-explorer/station-one-runtime.js','city-explorer/station-two-runtime.js','city-explorer/emergency-facilities-catalog.js']) {
  const assetImport = /(\.\/assets\/(?:station1|station2|station3|stations|ems-armour|ems-clonsilla)\/[^'"?]+\.(?:glb|json))(?:\?v=[^"']*)?(?=["'])/g;
  write(file, read(file).replace(assetImport, `$1?v=${VERSION}`));
}
console.log(`Normalized GitHub Pages artifact to v${VERSION}.`);
