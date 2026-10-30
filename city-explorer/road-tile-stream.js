function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.tiles)) throw new TypeError('Road tile manifest needs a tiles array');
  const ids = new Set();
  return manifest.tiles.map((tile) => {
    if (!tile || typeof tile.id !== 'string' || !tile.id || ids.has(tile.id)
      || !tile.bounds || ![tile.bounds.minX, tile.bounds.maxX, tile.bounds.minZ, tile.bounds.maxZ].every(Number.isFinite)
      || tile.bounds.minX > tile.bounds.maxX || tile.bounds.minZ > tile.bounds.maxZ) {
      throw new TypeError('Invalid road tile manifest entry');
    }
    ids.add(tile.id);
    return tile;
  });
}

function distanceSquaredToBounds(x, z, bounds) {
  const dx = x < bounds.minX ? bounds.minX - x : x > bounds.maxX ? x - bounds.maxX : 0;
  const dz = z < bounds.minZ ? bounds.minZ - z : z > bounds.maxZ ? z - bounds.maxZ : 0;
  return dx * dx + dz * dz;
}

function residentBytes(tile) {
  if (Number.isFinite(tile?.byteLength) && tile.byteLength >= 0) return tile.byteLength;
  if (tile instanceof ArrayBuffer) return tile.byteLength;
  if (ArrayBuffer.isView(tile)) return tile.byteLength;
  let bytes = 0;
  for (const group of tile?.groups || []) {
    bytes += group.positions?.byteLength || 0;
    bytes += group.normals?.byteLength || 0;
  }
  return bytes;
}

/** Bounded asynchronous loader with stale-result rejection and player-region pinning. */
export class RoadTileStream {
  constructor({ manifest, loadTile, commitTile = () => {}, releaseTile = () => {}, concurrency = 3,
    radius = 900, retainRadius = 1400, onError = () => {} } = {}) {
    if (typeof loadTile !== 'function' || typeof commitTile !== 'function' || typeof releaseTile !== 'function'
      || typeof onError !== 'function' || !Number.isSafeInteger(concurrency) || concurrency < 1
      || !Number.isFinite(radius) || radius < 0 || !Number.isFinite(retainRadius) || retainRadius < radius) {
      throw new TypeError('Invalid road tile stream options');
    }
    this.tiles = validateManifest(manifest);
    this.byId = new Map(this.tiles.map((tile) => [tile.id, tile]));
    this.loadTile = loadTile;
    this.commitTile = commitTile;
    this.releaseTile = releaseTile;
    this.onError = onError;
    this.concurrency = concurrency;
    this.radius = radius;
    this.retainRadius = retainRadius;
    this.resident = new Map();
    this.failures = new Map();
    this.pendingById = new Map();
    this.queue = [];
    this.active = new Set();
    this.version = 0;
    this.signature = '';
    this.desiredIds = new Set();
    this.disposed = false;
  }

  _isCurrent(record) {
    return !this.disposed && this.desiredIds.has(record.id) && this.pendingById.get(record.id) === record;
  }

  async _releaseStale(record, loaded) {
    const resident = this.resident.get(record.id);
    const pending = this.pendingById.get(record.id);
    if ((resident && resident.tile !== loaded) || (pending && pending !== record)) return;
    await this.releaseTile(record.id, loaded, { stale: true });
  }

  _computeDesired(x, z, protectX, protectZ, protectRadius) {
    const radiusSquared = this.radius * this.radius;
    const protectSquared = protectRadius * protectRadius;
    const desired = [];
    for (const tile of this.tiles) {
      const viewDistance = distanceSquaredToBounds(x, z, tile.bounds);
      const protectDistance = distanceSquaredToBounds(protectX, protectZ, tile.bounds);
      if (viewDistance <= radiusSquared || protectDistance <= protectSquared) {
        desired.push({ tile, distance: viewDistance });
      }
    }
    desired.sort((a, b) => a.distance - b.distance || a.tile.id.localeCompare(b.tile.id));
    return desired;
  }

  update(x, z, { protectX = x, protectZ = z, protectRadius = 100 } = {}) {
    if (this.disposed) return Promise.reject(new Error('Road tile stream is disposed'));
    if (![x, z, protectX, protectZ, protectRadius].every(Number.isFinite) || protectRadius < 0) {
      return Promise.reject(new TypeError('Invalid road tile stream position'));
    }
    const signature = [x, z, protectX, protectZ, protectRadius].join(':');
    const changed = signature !== this.signature;
    if (changed) {
      this.signature = signature;
      this.version += 1;
      this.desiredIds = new Set(this._computeDesired(x, z, protectX, protectZ, protectRadius).map(({ tile }) => tile.id));
      for (const record of this.pendingById.values()) {
        if (!this.desiredIds.has(record.id)) {
          record.controller.abort();
          this.pendingById.delete(record.id);
        } else record.version = this.version;
      }
      const keep = [];
      for (const record of this.queue) {
        if (!this.desiredIds.has(record.id)) {
          if (this.pendingById.get(record.id) === record) this.pendingById.delete(record.id);
          record.resolve();
        } else {
          record.version = this.version;
          keep.push(record);
        }
      }
      this.queue = keep;
    }
    const version = this.version;
    const desired = this._computeDesired(x, z, protectX, protectZ, protectRadius);
    const jobs = desired.map(({ tile }) => {
      if (this.resident.has(tile.id)) return Promise.resolve();
      const pending = this.pendingById.get(tile.id);
      if (pending) return pending.promise;
      return this._enqueue(tile, version);
    });
    return Promise.all(jobs).then(async () => {
      if (!this.disposed && version === this.version) await this._evictOutside(x, z, protectX, protectZ, protectRadius);
      return this.stats();
    });
  }

  _enqueue(tile, version) {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const record = { id: tile.id, tile, version, promise, resolve, controller: new AbortController() };
    this.pendingById.set(tile.id, record);
    this.queue.push(record);
    this._pump();
    return promise;
  }

  _pump() {
    while (!this.disposed && this.active.size < this.concurrency && this.queue.length) {
      const record = this.queue.shift();
      if (!this._isCurrent(record)) {
        if (this.pendingById.get(record.id) === record) this.pendingById.delete(record.id);
        record.resolve();
        continue;
      }
      this.active.add(record);
      let loadedTile;
      Promise.resolve().then(() => this.loadTile(record.tile, { signal: record.controller.signal }))
        .then(async (loaded) => {
          loadedTile = loaded;
          if (!this._isCurrent(record)) {
            await this._releaseStale(record, loaded);
            return;
          }
          await this.commitTile(record.id, loaded);
          if (!this._isCurrent(record)) {
            await this._releaseStale(record, loaded);
            return;
          }
          this.resident.set(record.id, { tile: loaded, bytes: residentBytes(loaded) });
          this.failures.delete(record.id);
        })
        .catch(async (error) => {
          if (loadedTile !== undefined && !this.resident.has(record.id)) {
            try { await this.releaseTile(record.id, loadedTile, { failed: true }); } catch { /* preserve the load failure */ }
          }
          if (this._isCurrent(record) && error?.name !== 'AbortError') {
            this.failures.set(record.id, error);
            try { this.onError(record.id, error); } catch { /* diagnostics cannot break streaming */ }
          }
        })
        .finally(() => {
          this.active.delete(record);
          if (this.pendingById.get(record.id) === record) this.pendingById.delete(record.id);
          record.resolve();
          this._pump();
        });
    }
  }

  async _evictOutside(x, z, protectX, protectZ, protectRadius) {
    const retainSquared = this.retainRadius * this.retainRadius;
    const protectSquared = protectRadius * protectRadius;
    for (const [id, record] of this.resident) {
      const tile = this.byId.get(id);
      const viewDistance = distanceSquaredToBounds(x, z, tile.bounds);
      const protectDistance = distanceSquaredToBounds(protectX, protectZ, tile.bounds);
      if (viewDistance <= retainSquared || protectDistance <= protectSquared) continue;
      this.resident.delete(id);
      await this.releaseTile(id, record.tile);
    }
  }

  stats() {
    let residentBytesTotal = 0;
    for (const record of this.resident.values()) residentBytesTotal += record.bytes;
    return { residentCount: this.resident.size, residentBytes: residentBytesTotal,
      pendingCount: this.active.size + this.queue.length, activeCount: this.active.size, failures: this.failures.size,
      failedTileIds: [...this.failures.keys()] };
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.version += 1;
    for (const record of this.pendingById.values()) record.controller.abort();
    this.pendingById.clear();
    for (const record of this.queue) record.resolve();
    this.queue = [];
    for (const [id, record] of this.resident) await this.releaseTile(id, record.tile);
    this.resident.clear();
  }
}
