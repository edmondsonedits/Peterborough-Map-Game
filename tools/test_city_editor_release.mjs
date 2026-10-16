import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const city = path.join(root, 'city-explorer');
const html = await readFile(path.join(city, 'index.html'), 'utf8');
const appSource = await readFile(path.join(city, 'app.js'), 'utf8');
const bootstrapSource = await readFile(path.join(city, 'authored-scene-bootstrap.js'), 'utf8');
const roadOrientationSource = await readFile(path.join(city, 'road-orientation-fix.js'), 'utf8');
const editorSource = await readFile(path.join(city, 'editor/city-editor.js'), 'utf8');
const buildSource = await readFile(path.join(root, 'shared/build-version.js'), 'utf8');
const stationsSource = await readFile(path.join(root, 'shared/stations.js'), 'utf8');
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

const releaseVersion = html.match(/release\.js\?v=(\d+\.\d+\.\d+)/)?.[1];
assert.ok(releaseVersion, 'the release entrypoint should define the active asset version');
const canonicalVersion = buildSource.match(/const VERSION = '(\d+\.\d+\.\d+)'/)?.[1];
assert.equal(canonicalVersion, releaseVersion, 'HTML entrypoints must match the canonical source release');
const appSplatImport = appSource.match(/from ['"](\.\/city-splat-layer\.js\?[^'"]+)['"]/)
  ?.[1];
const bootstrapSplatImport = bootstrapSource.match(/from ['"](\.\/city-splat-layer\.js\?[^'"]+)['"]/)
  ?.[1];
assert.ok(appSplatImport && bootstrapSplatImport, 'both editor modules must import CitySplatLayer');
const appSplatUrl = new URL(appSplatImport, pathToFileURL(path.join(city, 'app.js')));
const bootstrapSplatUrl = new URL(bootstrapSplatImport, pathToFileURL(path.join(city, 'authored-scene-bootstrap.js')));
assert.equal(appSplatUrl.href, bootstrapSplatUrl.href, 'the authored-scene hook and editor must share the same CitySplatLayer module identity');
assert.equal(appSplatUrl.searchParams.get('v'), canonicalVersion, 'CitySplatLayer cache key should match the active release');
const bootstrapImport = roadOrientationSource.match(/import\(['"](\.\/authored-scene-bootstrap\.js\?[^'"]+)['"]\)/)?.[1];
assert.ok(bootstrapImport, 'the explorer loader must version its authored-scene bootstrap import');
const bootstrapUrl = new URL(bootstrapImport, pathToFileURL(path.join(city, 'road-orientation-fix.js')));
assert.equal(bootstrapUrl.searchParams.get('v'), canonicalVersion, 'authored-scene bootstrap cache key should match the active release');
for (const [source, specifier, label] of [
  [appSource, './editor/draft-store.js', 'draft store'],
  [appSource, './editor/city-editor.js', 'editor entry module'],
  [editorSource, './version-saver.js', 'version saver'],
  [editorSource, './recovery-prompt.js', 'recovery prompt'],
]) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(source, new RegExp(`from ['"]${escaped}\\?v=${canonicalVersion}['"]`), `${label} import should carry the active cache key`);
}
const routeRevealLoader = stationsSource.match(/route-reveal\.js\?v=\$\{([^}]+)\}/)?.[1];
assert.equal(routeRevealLoader, 'CACHE_VERSION', 'shared stations must use the canonical script cache key for the changed route calculator');
const stylesheetRefs = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
assert.ok(stylesheetRefs.length > 0, 'the shell should expose its active stylesheet graph');
for (const href of stylesheetRefs) {
  const url = new URL(href, 'https://editor.example.test/city-explorer/');
  assert.equal(url.origin, 'https://editor.example.test', `stylesheets should stay local: ${href}`);
  assert.equal(url.searchParams.get('v'), releaseVersion, `stylesheet cache version should match active release ${releaseVersion}: ${href}`);
  const referenced = path.resolve(city, decodeURIComponent(url.pathname).replace(/^\/city-explorer\//, ''));
  assert.equal((await stat(referenced)).isFile(), true, `referenced stylesheet must exist: ${path.relative(root, referenced)}`);
}
for (const match of html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  const url = new URL(match[2], 'https://editor.example.test/city-explorer/');
  assert.equal(url.searchParams.get('v'), releaseVersion, `script cache version should match active release ${releaseVersion}: ${match[2]}`);
}
assert.doesNotMatch(html, /city-editor-20260925/, 'retired release cache tokens should not remain in the active shell');
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
