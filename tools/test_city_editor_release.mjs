import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const city = path.join(root, 'city-explorer');
const html = await readFile(path.join(city, 'index.html'), 'utf8');
const workflow = await readFile(path.join(root, '.github/workflows/deploy-pages.yml'), 'utf8');
const scene = JSON.parse(await readFile(path.join(city, 'data/editor/peterborough-details.json'), 'utf8'));
const editorFiles = await readdir(path.join(city, 'editor'));
const sourceFiles = [
  path.join(city, 'app.js'),
  path.join(city, 'data-loader.js'),
  path.join(city, 'road-orientation-fix.js'),
  ...(editorFiles.filter((name) => name.endsWith('.js')).map((name) => path.join(city, 'editor', name))),
];

for (const match of html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  const source = match[2].split('?')[0];
  assert.doesNotMatch(source, /^https?:\/\//i, 'the page must not add a remote script dependency');
  const referenced = path.resolve(city, source);
  assert.equal((await stat(referenced)).isFile(), true, `referenced script must exist: ${path.relative(root, referenced)}`);
}

assert.match(html, /styles\.css\?v=city-editor-20260925/, 'the editor release must invalidate cached styles');
const loaderURL = new URL(html.match(/src="([^"']*road-orientation-fix\.js[^"']*)"/)[1], 'https://simulator.test/city-explorer/');
assert.ok(loaderURL.searchParams.get('v'), 'entrypoint release cache key required');
assert.equal(loaderURL.searchParams.get('simulatorTasks'), '20261011b', 'invalidate the rebuilt entrypoint');
const loaderSource = await readFile(path.join(city, 'road-orientation-fix.js'), 'utf8');
const loaded = [];
const bootstrap = new Function('globalThis', '__import', 'return (async () => {' + loaderSource.replace(/\bimport\(/g, '__import(') + '})();');
await bootstrap({ PTBO_BUILD: { version: 'fixture-release' } }, async specifier => loaded.push(specifier));
const appURL = new URL(loaded.find(value => value.startsWith('./app.js?')), loaderURL);
assert.equal(appURL.searchParams.get('v'), 'fixture-release');
assert.equal(appURL.searchParams.get('simulatorTasks'), loaderURL.searchParams.get('simulatorTasks'));
const appSource = await readFile(path.join(city, 'app.js'), 'utf8');
const authoredSource = await readFile(path.join(city, 'authored-scene-bootstrap.js'), 'utf8');
const splatSpecifier = source => source.match(/from ['"]([^'"]*city-splat-layer\.js[^'"]*)['"]/)[1];
assert.equal(splatSpecifier(appSource), splatSpecifier(authoredSource), 'one exact shared CitySplatLayer module identity');
for (const filename of ['city-detail-rules.js', 'station-pavement-layer.js', 'historical-paint-profiles.js', 'mapped-arrow-visibility.js', 'mapped-arrow-paint.js', 'hospital-curb-detail.js', 'fallback-arrow-support.js']) {
  const specifier = [...appSource.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]).find(value => value.startsWith('./' + filename + '?'));
  assert.equal(new URL(specifier, appURL).searchParams.get('simulatorTasks'), '20261011b', filename + ' cache invalidation');
}
const pavementSource = await readFile(path.join(city, 'station-pavement-layer.js'), 'utf8');
assert.match(pavementSource, /from ['"]\.\/reconciled-road-ranges\.js\?v=1['"]/, 'final source-range transform has its initial scoped cache identity');
const arrowSource = await readFile(path.join(city, 'mapped-arrow-paint.js'), 'utf8');
const nestedRules = arrowSource.match(/from ['"]([^'"]*city-detail-rules\.js[^'"]*)['"]/)[1];
assert.equal(nestedRules, appSource.match(/from ['"]([^'"]*city-detail-rules\.js[^'"]*)['"]/)[1], 'arrow and app share the same current detail-rules module');
for (const filename of ['mobile-controls-1.6.68.js', 'driving-refinement-1.6.69.js']) {
  const specifier = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]).find(value => value.startsWith(filename + '?'));
  assert.equal(new URL(specifier, loaderURL).searchParams.get('simulatorTasks'), '20261011b', filename + ' cache invalidation');
}
assert.match(html, /data-loader\.js\?v=city-editor-20260925/, 'the data loader must have a release cache key');
assert.match(html, /osmtogeojson-3\.0\.0-beta\.5\/osmtogeojson\.js\?v=city-editor-20260925/, 'the pinned GeoJSON converter must have a release cache key');
assert.match(html, /three-r180\/build\/three\.module\.min\.js/, 'Three.js must resolve from the pinned local vendor copy');
assert.match(html, /three-r180\/examples\/jsm\//, 'Three.js addons must resolve from the pinned local vendor copy');
assert.match(html, /spark-2\.1\.0\/spark\.module\.min\.js/, 'Spark must resolve from the pinned local vendor copy');
assert.doesNotMatch(html, /<script\b[^>]*\bsrc=["']https?:\/\//i, 'public viewing must not load a remote script runtime');
assert.doesNotMatch(html, /sourceMappingURL=/i, 'the public editor shell must not reference source maps');
assert.equal(editorFiles.some((name) => name.endsWith('.map')), false, 'the editor directory must not ship source map files');
assert.doesNotMatch(html, /AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/, 'the public editor shell must not contain API credentials');
assert.equal(scene.schemaVersion, 1);
assert.equal(scene.city, 'peterborough-on');
assert.ok(Array.isArray(scene.objects) && Array.isArray(scene.overrides), 'the published scene JSON must have valid authored collections');
assert.match(workflow, /uses:\s*actions\/upload-pages-artifact@v3\s+with:\s+path:\s*_site/, 'the current Pages workflow must publish its staged production artifact');

const importPattern = /(?:\bimport\s*(?:[^'";]*?\sfrom\s*)?|\bimport\s*\()(['"])([^'"]+)\1/g;
const checked = new Set();
async function assertModuleGraph(file) {
  const absolute = path.resolve(file);
  if (checked.has(absolute)) return;
  checked.add(absolute);
  const source = await readFile(absolute, 'utf8');
  assert.doesNotMatch(source, /sourceMappingURL=/i, `${path.relative(root, absolute)} must not reference source maps`);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}/, `${path.relative(root, absolute)} must not contain API credentials`);
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[2];
    assert.doesNotMatch(specifier, /^https?:\/\//i, `${path.relative(root, absolute)} must not add a remote module dependency`);
    if (specifier.startsWith('node:')) continue;
    let dependency;
    if (specifier.startsWith('three/addons/')) {
      dependency = path.join(city, 'vendor/three-r180/examples/jsm', specifier.slice('three/addons/'.length));
    } else if (specifier === 'three') {
      dependency = path.join(city, 'vendor/three-r180/build/three.module.min.js');
    } else if (specifier === '@sparkjsdev/spark') {
      dependency = path.join(city, 'vendor/spark-2.1.0/spark.module.min.js');
    } else if (specifier.startsWith('.')) {
      dependency = path.resolve(path.dirname(absolute), specifier.split('?')[0]);
    } else {
      throw new Error(`Unmapped runtime import in ${path.relative(root, absolute)}: ${specifier}`);
    }
    assert.equal((await stat(dependency)).isFile(), true, `referenced module must exist: ${path.relative(root, dependency)}`);
    if (dependency.endsWith('.js') && !dependency.includes(`${path.sep}vendor${path.sep}`)) await assertModuleGraph(dependency);
  }
}

for (const file of sourceFiles) await assertModuleGraph(file);
assert.ok(checked.size >= sourceFiles.length, 'the release check should traverse the complete editor module graph');

console.log(`City editor release assertions passed (${checked.size} local modules checked).`);
