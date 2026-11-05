import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadWorldCollision } from '../../world-collision.mjs';
import { createMultiplayerVehicleInstances, createMultiplayerPlayerSpawn } from '../../vehicle-instances.mjs';

const worldManifest = fileURLToPath(new URL('../../world-data/v1/world-manifest.json', import.meta.url));
const asset = name => fileURLToPath(new URL(`../../../assets/vehicles/${name}.json`, import.meta.url));
const metadata = async name => JSON.parse(await readFile(asset(name), 'utf8'));

/** One process-local immutable world shared by rooms; geometry cache holds eight distinct active regions. */
export async function createExplorerWorld({ maxCachedTiles = 192 } = {}) {
  const source = await loadWorldCollision({ manifestUrl: worldManifest, maxCachedTiles });
  const metadataByType = { pumper: await metadata('generic-pumper'), aerial: await metadata('aerial-platform'), medi: await metadata('medi-pickup') };
  const station = source.stations.find(value => value.number === 1);
  await source.prefetch(station.anchor.x, station.anchor.z, 180);
  const vehicles = createMultiplayerVehicleInstances(source, metadataByType);
  const spawns = Array.from({ length: 8 }, (_, i) => createMultiplayerPlayerSpawn(source, i + 1));
  const loading = new Map(), lastScheduled = new Map();
  let lastError = null;
  function schedule(x, z, radius) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const key = `${Math.floor(x / 80)}:${Math.floor(z / 80)}`;
    if (loading.has(key) || Date.now() - (lastScheduled.get(key) ?? 0) < 1000) return;
    lastScheduled.set(key, Date.now());
    const task = source.prefetch(x, z, Math.max(110, Math.min(180, radius + 100)))
      .catch(error => { lastError = error; })
      .finally(() => { if (loading.get(key) === task) loading.delete(key); });
    loading.set(key, task);
  }
  const world = Object.freeze({
    worldVersion: source.worldVersion, manifest: source.manifest, stations: source.stations,
    sampleSurface: (...args) => source.sampleSurface(...args),
    blocks: (...args) => source.blocks(...args),
    readyAt(x, z, radius = 0) { schedule(x, z, radius); return source.readyAt(x, z, radius); },
    prefetch: (...args) => source.prefetch(...args),
    get loadingCount() { return loading.size; }, get lastError() { return lastError?.message ?? null; },
    residentTileCount: source.residentTileCount,
  });
  return { world, vehicles, spawn: ({ seat }) => ({ ...spawns[seat - 1] }) };
}
