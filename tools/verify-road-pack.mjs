import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodeRoadTile, MAX_ROAD_TILE_BYTES } from '../city-explorer/road-tile-pack.js';

const MAX_GZIP_TILE_BYTES = MAX_ROAD_TILE_BYTES + 64 * 1024;
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const insideRoot = (root, file) => file === root || file.startsWith(`${root}${path.sep}`);
const fail = message => { throw new Error(message); };

function normalizedSourceBytes(file, bytes) {
  if (!/\.(?:js|mjs|cjs|json|geojson)$/.test(file)) return bytes;
  return Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/\?v=\d+\.\d+\.\d+/g, '?v=release'));
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`Cannot read ${label}: ${error.message}`); }
}

function validFinite(value) { return Number.isFinite(value); }
function verifyBounds(tile, groups) {
  const bounds = tile.bounds;
  if (!bounds || !['minX', 'maxX', 'minZ', 'maxZ'].every(key => validFinite(bounds[key]))) {
    fail(`Tile ${tile.id} has invalid bounds metadata`);
  }
  if (bounds.minX > bounds.maxX || bounds.minZ > bounds.maxZ) fail(`Tile ${tile.id} has inverted bounds`);
  const actual = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const group of groups) {
    const positions = group.positions;
    for (let offset = 0; offset < positions.length; offset += 3) {
      const x = positions[offset];
      const z = positions[offset + 2];
      actual.minX = Math.min(actual.minX, x);
      actual.maxX = Math.max(actual.maxX, x);
      actual.minZ = Math.min(actual.minZ, z);
      actual.maxZ = Math.max(actual.maxZ, z);
    }
  }
  if (!Number.isFinite(actual.minX)) fail(`Tile ${tile.id} contains no geometry`);
  if (actual.minX < bounds.minX - 0.001 || actual.maxX > bounds.maxX + 0.001
    || actual.minZ < bounds.minZ - 0.001 || actual.maxZ > bounds.maxZ + 0.001) {
    fail(`Tile ${tile.id} decoded geometry exceeds manifest bounds`);
  }
}

function verifySourceIdentity(manifest, root) {
  if (!manifest.sources || typeof manifest.sources !== 'object' || Array.isArray(manifest.sources)) {
    fail('Road pack sources must be a path-to-SHA-256 object');
  }
  const entries = Object.entries(manifest.sources);
  if (!entries.length) fail('Road pack has no source identity entries');
  for (const [relativePath, expected] of entries) {
    if (typeof relativePath !== 'string' || path.isAbsolute(relativePath) || !/^[a-f0-9]{64}$/.test(expected)) {
      fail(`Invalid source identity entry: ${relativePath}`);
    }
    const candidate = path.resolve(root, relativePath);
    if (!insideRoot(root, candidate)) fail(`Road pack source path escapes repository: ${relativePath}`);
    let realPath;
    try { realPath = fs.realpathSync(candidate); }
    catch { fail(`Road pack source file is missing: ${relativePath}`); }
    if (!insideRoot(root, realPath) || !fs.statSync(realPath).isFile()) fail(`Road pack source is not a repository file: ${relativePath}`);
    const actual = sha256(normalizedSourceBytes(relativePath, fs.readFileSync(realPath)));
    if (actual !== expected) fail(`Road pack source hash mismatch: ${relativePath}`);
  }
  const contentBuildId = sha256(JSON.stringify(manifest.sources)).slice(0, 20);
  if (contentBuildId !== manifest.buildId) fail(`Road pack build ID does not match its source hashes (${contentBuildId})`);
}

export function verifyRoadPack(repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
  const root = path.resolve(repositoryRoot);
  const packDirectory = path.join(root, 'city-explorer/data/road-pack');
  const manifestPath = path.join(packDirectory, 'manifest.json');
  const sourceManifestPath = path.join(root, 'city-explorer/data/manifest.json');
  const versionPath = path.join(root, 'city-explorer/road-pack-version.js');
  const manifest = readJson(manifestPath, 'road-pack manifest');
  const sourceManifest = readJson(sourceManifestPath, 'city data manifest');
  if (manifest.schemaVersion !== 1) fail(`Unsupported road pack manifest schema: ${manifest.schemaVersion}`);
  if (!/^[a-f0-9]{20}$/.test(manifest.buildId || '')) fail('Road pack buildId must be 20 lowercase hexadecimal characters');
  if (typeof manifest.sourceGeneratedAt !== 'string' || manifest.sourceGeneratedAt !== sourceManifest.generated_at) {
    fail(`Road pack source timestamp mismatch: expected ${sourceManifest.generated_at}, got ${manifest.sourceGeneratedAt}`);
  }
  let versionSource;
  try { versionSource = fs.readFileSync(versionPath, 'utf8'); }
  catch (error) { fail(`Cannot read road pack version module: ${error.message}`); }
  const version = versionSource.match(/export\s+const\s+ROAD_PACK_ID\s*=\s*['"]([a-f0-9]{20})['"]/);
  if (!version) fail('ROAD_PACK_ID is missing or invalid');
  if (version[1] !== manifest.buildId) fail(`ROAD_PACK_ID mismatch: module ${version[1]}, manifest ${manifest.buildId}`);
  verifySourceIdentity(manifest, root);

  if (!Array.isArray(manifest.tiles) || manifest.tiles.length === 0) fail('Road pack must contain at least one tile');
  const ids = new Set();
  const urls = new Set();
  let totalBytes = 0;
  let totalRawBytes = 0;
  let totalTriangles = 0;
  for (const tile of manifest.tiles) {
    if (!tile || typeof tile.id !== 'string' || typeof tile.url !== 'string') fail('Road pack contains an invalid tile entry');
    const idMatch = tile.id.match(/^(-?\d+):(-?\d+)$/);
    const urlMatch = tile.url.match(/^(-?\d+)_(-?\d+)-([a-f0-9]{20})\.bin\.gz$/);
    if (!idMatch || !urlMatch || path.basename(tile.url) !== tile.url) fail(`Tile ${tile.id} URL is not content-addressed gzip data`);
    if (!Number.isSafeInteger(Number(idMatch[1])) || String(Number(idMatch[1])) !== idMatch[1]
      || !Number.isSafeInteger(Number(idMatch[2])) || String(Number(idMatch[2])) !== idMatch[2]
      || urlMatch[1] !== idMatch[1] || urlMatch[2] !== idMatch[2]
      || !/^[a-f0-9]{64}$/.test(tile.sha256 || '') || urlMatch[3] !== tile.sha256.slice(0, 20)) {
      fail(`Tile ${tile.id} URL identity mismatch`);
    }
    if (ids.has(tile.id)) fail(`Duplicate road tile ID: ${tile.id}`);
    if (urls.has(tile.url)) fail(`Duplicate road tile URL: ${tile.url}`);
    ids.add(tile.id); urls.add(tile.url);
    if (tile.compression !== 'gzip') fail(`Tile ${tile.id} must declare gzip compression`);
    for (const [field, value] of [['bytes', tile.bytes], ['rawBytes', tile.rawBytes], ['triangles', tile.triangles]]) {
      if (!Number.isSafeInteger(value) || value <= 0) fail(`Tile ${tile.id} has invalid ${field}`);
    }
    if (tile.rawBytes > MAX_ROAD_TILE_BYTES || tile.bytes > MAX_GZIP_TILE_BYTES) fail(`Tile ${tile.id} exceeds the bounded packet size`);
    if (!/^[a-f0-9]{64}$/.test(tile.sha256 || '') || !/^[a-f0-9]{64}$/.test(tile.transportSha256 || '')) {
      fail(`Tile ${tile.id} has an invalid content hash`);
    }
    const filePath = path.resolve(packDirectory, tile.url);
    if (!insideRoot(root, filePath)) fail(`Tile ${tile.id} path escapes repository`);
    let compressed;
    try { compressed = fs.readFileSync(filePath); }
    catch { fail(`Tile file is missing: ${tile.url}`); }
    if (compressed.byteLength !== tile.bytes) fail(`Tile ${tile.id} compressed byte count mismatch`);
    if (sha256(compressed) !== tile.transportSha256) fail(`Tile ${tile.id} transport hash mismatch`);
    let raw;
    try { raw = zlib.gunzipSync(compressed, { maxOutputLength: MAX_ROAD_TILE_BYTES }); }
    catch (error) { fail(`Tile ${tile.id} gzip decode failed: ${error.message}`); }
    if (raw.byteLength !== tile.rawBytes) fail(`Tile ${tile.id} raw byte count mismatch`);
    if (sha256(raw) !== tile.sha256) fail(`Tile ${tile.id} packet hash mismatch`);
    let decoded;
    try { decoded = decodeRoadTile(raw); }
    catch (error) { fail(`Tile ${tile.id} packet validation failed: ${error.message}`); }
    if (decoded.id !== tile.id) fail(`Tile ${tile.id} packet identity mismatch: ${decoded.id}`);
    const triangles = decoded.groups.reduce((sum, group) => sum + group.positions.length / 9, 0);
    if (triangles !== tile.triangles) fail(`Tile ${tile.id} triangle count mismatch: manifest ${tile.triangles}, decoded ${triangles}`);
    verifyBounds(tile, decoded.groups);
    totalBytes += compressed.byteLength;
    totalRawBytes += raw.byteLength;
    totalTriangles += triangles;
  }
  for (const [field, actual] of [['totalBytes', totalBytes], ['totalRawBytes', totalRawBytes], ['totalTriangles', totalTriangles]]) {
    if (!Number.isSafeInteger(manifest[field]) || manifest[field] !== actual) {
      fail(`Road pack ${field} mismatch: manifest ${manifest[field]}, verified ${actual}`);
    }
  }
  return { buildId: manifest.buildId, tiles: manifest.tiles.length, totalBytes, totalRawBytes, totalTriangles };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyRoadPack();
    console.log(`Road pack verified: ${result.buildId}, ${result.tiles} tiles, ${result.totalTriangles.toLocaleString('en-CA')} triangles, ${result.totalBytes.toLocaleString('en-CA')} gzip bytes / ${result.totalRawBytes.toLocaleString('en-CA')} raw bytes`);
  } catch (error) {
    console.error(`Road pack verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
