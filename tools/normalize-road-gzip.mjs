#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { MAX_ROAD_TILE_BYTES } from '../city-explorer/road-tile-pack.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultPackDirectory = path.join(repositoryRoot, 'city-explorer', 'data', 'road-pack');
const canonicalOsByte = 3;
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => { throw new Error(message); };

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch (error) { fail(`Cannot parse ${label}: ${error.message}`); }
}

function insideDirectory(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function tileFilePath(packDirectory, tile) {
  if (typeof tile?.url !== 'string' || !tile.url || path.extname(tile.url) !== '.gz') {
    fail(`Tile ${tile?.id ?? '?'} URL must name a .gz file`);
  }
  const resolved = path.resolve(packDirectory, tile.url);
  if (!insideDirectory(packDirectory, resolved)) fail(`Tile ${tile.id} URL escapes the selected road-pack directory`);
  let actual;
  try { actual = fs.realpathSync(resolved); }
  catch (error) { fail(`Cannot resolve tile ${tile.id} file ${tile.url}: ${error.message}`); }
  if (!insideDirectory(packDirectory, actual)) fail(`Tile ${tile.id} file resolves outside the selected road-pack directory`);
  return actual;
}

function canonicalGzip(tile, filePath) {
  const compressed = fs.readFileSync(filePath);
  if (compressed.length < 18 || compressed[0] !== 0x1f || compressed[1] !== 0x8b || compressed[2] !== 8) {
    fail(`Tile ${tile.id} is not a valid gzip stream`);
  }
  const flags = compressed[3];
  if (flags & 0xe0) fail(`Tile ${tile.id} gzip header has reserved flags set`);
  if (flags & 0x02) fail(`Tile ${tile.id} gzip header uses FHCRC and cannot be normalized safely`);
  let raw;
  try { raw = zlib.gunzipSync(compressed, { maxOutputLength: MAX_ROAD_TILE_BYTES }); }
  catch (error) { fail(`Tile ${tile.id} gzip validation failed: ${error.message}`); }
  if (!Number.isSafeInteger(tile.rawBytes) || tile.rawBytes < 1 || raw.length !== tile.rawBytes) {
    fail(`Tile ${tile.id} raw byte count mismatch`);
  }
  if (!/^[a-f0-9]{64}$/.test(tile.sha256 || '') || sha256(raw) !== tile.sha256) {
    fail(`Tile ${tile.id} raw SHA-256 mismatch`);
  }
  const normalized = Buffer.from(compressed);
  normalized[9] = canonicalOsByte;
  return { normalized, rawBytes: raw.length, transportSha256: sha256(normalized) };
}

function atomicWrite(filePath, bytes) {
  const temporary = `${filePath}.normalizing-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

/** Canonicalize gzip OS header bytes and refresh selected road-pack metadata. */
export function normalizeRoadPack(packDirectory = defaultPackDirectory) {
  const requestedDirectory = path.resolve(packDirectory);
  const realDirectory = fs.realpathSync(requestedDirectory);
  const manifestPath = path.join(realDirectory, 'manifest.json');
  const originalManifestBytes = fs.readFileSync(manifestPath);
  const manifest = parseJson(originalManifestBytes, 'road-pack manifest');
  if (!Array.isArray(manifest.tiles) || manifest.tiles.length === 0) fail('Road-pack manifest must contain tiles');

  const ids = new Set(), urls = new Set();
  const plannedWrites = [];
  const canonicalTiles = [];
  let totalBytes = 0, totalRawBytes = 0, changedTiles = 0;
  for (const tile of manifest.tiles) {
    if (!tile || typeof tile.id !== 'string' || !tile.id) fail('Road-pack manifest contains an invalid tile ID');
    if (ids.has(tile.id) || urls.has(tile.url)) fail(`Road-pack manifest contains a duplicate tile ID or URL: ${tile.id}`);
    ids.add(tile.id); urls.add(tile.url);
    if (tile.compression !== 'gzip') fail(`Tile ${tile.id} must declare gzip compression`);
    const filePath = tileFilePath(realDirectory, tile);
    const { normalized, rawBytes, transportSha256 } = canonicalGzip(tile, filePath);
    const updatedTile = { ...tile, bytes: normalized.length, transportSha256 };
    canonicalTiles.push(updatedTile);
    totalBytes += normalized.length;
    totalRawBytes += rawBytes;
    if (!fs.readFileSync(filePath).equals(normalized)) {
      changedTiles += 1;
      plannedWrites.push({ path: filePath, bytes: normalized });
    }
  }
  if (manifest.totalRawBytes !== totalRawBytes) fail(`Road-pack totalRawBytes mismatch: manifest ${manifest.totalRawBytes}, actual ${totalRawBytes}`);

  const updatedManifest = { ...manifest, tiles: canonicalTiles, totalBytes };
  const canonicalManifestBytes = Buffer.from(JSON.stringify(updatedManifest));
  const manifestChanged = !originalManifestBytes.equals(canonicalManifestBytes);

  for (const write of plannedWrites) atomicWrite(write.path, write.bytes);
  if (manifestChanged) atomicWrite(manifestPath, canonicalManifestBytes);

  return Object.freeze({
    buildId: manifest.buildId,
    tiles: canonicalTiles.length,
    changedTiles,
    totalBytes,
    totalRawBytes,
    manifestChanged,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const selectedDirectory = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultPackDirectory;
    const result = normalizeRoadPack(selectedDirectory);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(`Road gzip normalization failed: ${error.message}`);
    process.exitCode = 1;
  }
}
