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
assert.match(html, /road-orientation-fix\.js\?v=city-editor-20260925/, 'the app entrypoint must have a release cache key');
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
assert.match(workflow, /path:\s*\./, 'the existing Pages workflow must continue publishing the repository root');

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
