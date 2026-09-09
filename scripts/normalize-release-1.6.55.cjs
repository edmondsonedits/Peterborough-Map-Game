'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VERSION = '1.6.55';
const root = path.resolve(__dirname, '..');
const canonicalSurfaces = [
  'index.html',
  'response-simulator/play/index.html',
  'response-simulator/mobile/index.html',
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

let build = read('shared/build-version.js');
build = replaceRequired(
  'shared/build-version.js',
  build,
  /const VERSION = '\d+\.\d+\.\d+';/,
  `const VERSION = '${VERSION}';`,
  'build VERSION'
);
write('shared/build-version.js', build);

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
      /release-bootstrap-\d+\.\d+\.\d+\.js\?v=\d+\.\d+\.\d+/g,
      `release-bootstrap-${VERSION}.js?v=${VERSION}`,
      'release bootstrap'
    );
  }

  if (file === 'dispatch-editor/index.html') {
    html = replaceRequired(
      file,
      html,
      /spawn-box-editor-\d+\.\d+\.\d+\.js\?v=\d+\.\d+\.\d+/g,
      `spawn-box-editor-${VERSION}.js?v=${VERSION}`,
      'dispatch editor spawn-box module'
    );
    html = html.replace(/\?v=\d+\.\d+\.\d+/g, `?v=${VERSION}`);
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

  write(file, html);
}

console.log(`Normalized GitHub Pages artifact to v${VERSION}.`);
