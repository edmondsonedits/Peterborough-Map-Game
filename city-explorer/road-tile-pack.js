const MAGIC = [0x50, 0x42, 0x52, 0x54]; // PBRT
const SCHEMA_VERSION = 1;
const HEADER_BYTES = 16;
const MAX_GROUPS = 8192;
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
export const MAX_ROAD_TILE_BYTES = 128 * 1024 * 1024;
const MAX_FLOATS = MAX_ROAD_TILE_BYTES / Float32Array.BYTES_PER_ELEMENT;
const align4 = (value) => (value + 3) & ~3;
const finiteArray = (array) => {
  for (let index = 0; index < array.length; index += 1) if (!Number.isFinite(array[index])) return false;
  return true;
};
const isContact = (value) => value === null || value === 'official' || value === 'fallback';

function validateTileInput(tile) {
  if (!tile || typeof tile.id !== 'string' || !tile.id || tile.id.length > 512 || !Array.isArray(tile.groups)
    || tile.groups.length > MAX_GROUPS) throw new TypeError('Invalid road tile metadata');
  let floatCount = 0;
  const descriptors = [];
  for (const group of tile.groups) {
    if (!group || typeof group.materialKey !== 'string' || group.materialKey.length > 256
      || typeof group.kind !== 'string' || group.kind.length > 128
      || typeof group.layer !== 'string' || group.layer.length > 128
      || !isContact(group.contact) || !(group.positions instanceof Float32Array)
      || group.positions.length % 9 !== 0 || !finiteArray(group.positions)) {
      throw new TypeError('Invalid road tile group or nonfinite position data');
    }
    const positionOffset = floatCount;
    floatCount += group.positions.length;
    let normalsOffset = null;
    let normalsCount = 0;
    if (group.normals !== undefined && group.normals !== null) {
      if (!(group.normals instanceof Float32Array) || group.normals.length !== group.positions.length
        || !finiteArray(group.normals)) throw new TypeError('Invalid road tile normals');
      normalsOffset = floatCount;
      normalsCount = group.normals.length;
      floatCount += normalsCount;
    }
    const vertexCount = group.positions.length / 3;
    const sourceRanges = group.sourceRanges ?? [];
    if (!Array.isArray(sourceRanges) || sourceRanges.length > 1_000_000) throw new TypeError('Invalid source ranges');
    const checkedRanges = sourceRanges.map((range) => {
      if (!range || typeof range.sourceId !== 'string' || !range.sourceId || range.sourceId.length > 512
        || !Number.isSafeInteger(range.startVertex) || !Number.isSafeInteger(range.vertexCount)
        || range.startVertex < 0 || range.vertexCount < 0
        || range.startVertex + range.vertexCount > vertexCount) throw new RangeError('Invalid source range bounds');
      return { sourceId: range.sourceId, startVertex: range.startVertex, vertexCount: range.vertexCount };
    });
    descriptors.push({ materialKey: group.materialKey, kind: group.kind, layer: group.layer,
      contact: group.contact, positionOffset, positionCount: group.positions.length,
      normalsOffset, normalsCount, sourceRanges: checkedRanges });
  }
  if (floatCount > MAX_FLOATS) throw new RangeError('Road tile size limit exceeded');
  return { id: tile.id, descriptors, floatCount };
}

/** Encode one deterministic, bounded, nonindexed road tile packet. */
export function encodeRoadTile(tile, { maxBytes = MAX_ROAD_TILE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < HEADER_BYTES || maxBytes > MAX_ROAD_TILE_BYTES) {
    throw new RangeError('Invalid road tile size limit');
  }
  const { id, descriptors, floatCount } = validateTileInput(tile);
  const metadataBytes = new TextEncoder().encode(JSON.stringify({ id, groups: descriptors }));
  if (metadataBytes.length > MAX_METADATA_BYTES) throw new RangeError('Road tile metadata size limit exceeded');
  const bodyOffset = align4(HEADER_BYTES + metadataBytes.length);
  const bodyBytes = floatCount * Float32Array.BYTES_PER_ELEMENT;
  const totalBytes = bodyOffset + bodyBytes;
  if (totalBytes > maxBytes || totalBytes > MAX_ROAD_TILE_BYTES) throw new RangeError('Road tile size limit exceeded');
  const packet = new ArrayBuffer(totalBytes);
  const bytes = new Uint8Array(packet);
  bytes.set(MAGIC, 0);
  const view = new DataView(packet);
  view.setUint16(4, SCHEMA_VERSION, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, metadataBytes.length, true);
  view.setUint32(12, bodyBytes, true);
  bytes.set(metadataBytes, HEADER_BYTES);
  const output = new Float32Array(packet, bodyOffset, floatCount);
  let cursor = 0;
  for (const group of tile.groups) {
    output.set(group.positions, cursor); cursor += group.positions.length;
    if (group.normals) { output.set(group.normals, cursor); cursor += group.normals.length; }
  }
  return packet;
}

function packetBytes(input) {
  if (input instanceof ArrayBuffer) return { buffer: input, offset: 0, length: input.byteLength };
  if (ArrayBuffer.isView(input)) return { buffer: input.buffer, offset: input.byteOffset, length: input.byteLength };
  throw new TypeError('Road tile packet must be an ArrayBuffer or view');
}

/** Decode a tile with zero-copy Float32Array views into the packet buffer. */
export function decodeRoadTile(input, { maxBytes = MAX_ROAD_TILE_BYTES } = {}) {
  const packet = packetBytes(input);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < HEADER_BYTES || packet.length > maxBytes
    || packet.length > MAX_ROAD_TILE_BYTES) throw new RangeError('Road tile packet size limit exceeded');
  if (packet.length < HEADER_BYTES) throw new RangeError('Road tile packet is truncated');
  const bytes = new Uint8Array(packet.buffer, packet.offset, packet.length);
  if (!MAGIC.every((value, index) => bytes[index] === value)) throw new TypeError('Invalid road tile magic');
  const header = new DataView(packet.buffer, packet.offset, packet.length);
  if (header.getUint16(4, true) !== SCHEMA_VERSION) throw new TypeError('Unsupported road tile schema version');
  if (header.getUint16(6, true) !== 0) throw new TypeError('Unsupported road tile flags');
  const metadataLength = header.getUint32(8, true), bodyLength = header.getUint32(12, true);
  if (metadataLength > MAX_METADATA_BYTES || bodyLength % 4 !== 0) throw new RangeError('Invalid road tile lengths');
  const bodyRelative = align4(HEADER_BYTES + metadataLength);
  if (bodyRelative > packet.length || bodyLength !== packet.length - bodyRelative) {
    throw new RangeError('Road tile length or body bounds are invalid');
  }
  for (let index = HEADER_BYTES + metadataLength; index < bodyRelative; index += 1) {
    if (bytes[index] !== 0) throw new TypeError('Invalid road tile metadata padding');
  }
  let metadata;
  try {
    metadata = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(HEADER_BYTES, HEADER_BYTES + metadataLength)));
  } catch {
    throw new TypeError('Invalid road tile metadata');
  }
  if (!metadata || typeof metadata.id !== 'string' || !metadata.id || metadata.id.length > 512
    || !Array.isArray(metadata.groups) || metadata.groups.length > MAX_GROUPS) throw new TypeError('Invalid road tile metadata');
  const bodyOffset = packet.offset + bodyRelative;
  if (bodyOffset % 4 !== 0) throw new RangeError('Road tile float data is unaligned');
  const body = new Float32Array(packet.buffer, bodyOffset, bodyLength / 4);
  const groups = [];
  let expectedFloatOffset = 0;
  for (const descriptor of metadata.groups) {
    const { materialKey, kind, layer, contact, positionOffset, positionCount,
      normalsOffset, normalsCount, sourceRanges } = descriptor || {};
    if (typeof materialKey !== 'string' || materialKey.length > 256 || typeof kind !== 'string' || kind.length > 128
      || typeof layer !== 'string' || layer.length > 128 || !isContact(contact)
      || !Number.isSafeInteger(positionOffset) || !Number.isSafeInteger(positionCount) || positionOffset !== expectedFloatOffset
      || positionCount < 0 || positionCount % 9 !== 0 || positionOffset + positionCount > body.length) {
      throw new RangeError('Invalid road tile group bounds');
    }
    expectedFloatOffset += positionCount;
    if ((normalsOffset === null && normalsCount !== 0)
      || (normalsOffset !== null && (!Number.isSafeInteger(normalsOffset) || !Number.isSafeInteger(normalsCount)
        || normalsOffset !== expectedFloatOffset || normalsCount !== positionCount || normalsOffset + normalsCount > body.length))) {
      throw new RangeError('Invalid road tile normal bounds');
    }
    if (!Array.isArray(sourceRanges) || sourceRanges.length > 1_000_000) throw new TypeError('Invalid road tile source ranges');
    const vertexCount = positionCount / 3;
    for (const range of sourceRanges) {
      if (!range || typeof range.sourceId !== 'string' || !range.sourceId || range.sourceId.length > 512
        || !Number.isSafeInteger(range.startVertex) || !Number.isSafeInteger(range.vertexCount)
        || range.startVertex < 0 || range.vertexCount < 0 || range.startVertex + range.vertexCount > vertexCount) {
        throw new RangeError('Invalid road tile source range bounds');
      }
    }
    if (normalsOffset !== null) expectedFloatOffset += normalsCount;
    const positions = body.subarray(positionOffset, positionOffset + positionCount);
    const normals = normalsOffset === null ? undefined : body.subarray(normalsOffset, normalsOffset + normalsCount);
    if (!finiteArray(positions) || (normals && !finiteArray(normals))) throw new TypeError('Nonfinite road tile float data');
    groups.push({ materialKey, kind, layer, contact, positions, ...(normals ? { normals } : {}), sourceRanges });
  }
  if (expectedFloatOffset !== body.length) throw new RangeError('Road tile float spans do not match body length');
  return { id: metadata.id, groups };
}

function validateGroup(group) {
  if (!group || !(group.positions instanceof Float32Array) || group.positions.length > MAX_FLOATS || group.positions.length % 9 !== 0
    || !['official', 'fallback', null].includes(group.contact ?? null)
    || typeof group.layer !== 'string') throw new TypeError('Invalid packed road surface group');
  if (!finiteArray(group.positions)) throw new TypeError('Nonfinite packed road surface positions');
}

/** Compact triangle contact index over resident tile geometry. */
export class PackedRoadSurfaceIndex {
  constructor(cellSize = 60) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError('Invalid pavement cell size');
    this.cellSize = cellSize;
    this.cells = new Map(); // cell -> tile slot -> Uint32Array(local triangle refs)
    this.tiles = new Map();
    this.slots = new Map();
    this.nextSlot = 1;
  }

  addTile(id, groups) {
    if (typeof id !== 'string' || !id || !Array.isArray(groups) || groups.length > 65535) throw new TypeError('Invalid packed road tile');
    const slot = this.nextSlot++;
    const cellLists = new Map();
    const triangleGroups = [];
    const triangleOffsets = [];
    const tileGroups = groups.map((group, groupIndex) => {
      validateGroup(group);
      const contact = group.contact ?? null;
      if (contact === null) return { ...group, contact, contactReady: false };
      for (let offset = 0; offset < group.positions.length; offset += 9) {
        const p = group.positions;
        const ax = p[offset], az = p[offset + 2], bx = p[offset + 3], bz = p[offset + 5], cx = p[offset + 6], cz = p[offset + 8];
        const determinant = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
        if (Math.abs(determinant) < 1e-10) continue;
        const minX = Math.floor(Math.min(ax, bx, cx) / this.cellSize);
        const maxX = Math.floor(Math.max(ax, bx, cx) / this.cellSize);
        const minZ = Math.floor(Math.min(az, bz, cz) / this.cellSize);
        const maxZ = Math.floor(Math.max(az, bz, cz) / this.cellSize);
        if ((maxX - minX + 1) * (maxZ - minZ + 1) > 8192) throw new RangeError('Road contact triangle spans too many index cells');
        const triangleIndex = triangleGroups.length;
        triangleGroups.push(groupIndex);
        triangleOffsets.push(offset);
        for (let cellX = minX; cellX <= maxX; cellX += 1) for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
          const key = `${cellX}:${cellZ}`;
          if (!cellLists.has(key)) cellLists.set(key, []);
          cellLists.get(key).push(triangleIndex);
        }
      }
      return { ...group, contact, contactReady: true };
    });
    const record = { id, slot, groups: tileGroups, triangleGroups: new Uint16Array(triangleGroups),
      triangleOffsets: new Uint32Array(triangleOffsets), cellKeys: [...cellLists.keys()] };
    if (this.tiles.has(id)) this.removeTile(id);
    for (const [key, refs] of cellLists) {
      if (!this.cells.has(key)) this.cells.set(key, new Map());
      this.cells.get(key).set(slot, new Uint32Array(refs));
    }
    this.tiles.set(id, record);
    this.slots.set(slot, record);
    return record;
  }

  removeTile(id) {
    const record = this.tiles.get(id);
    if (!record) return false;
    for (const key of record.cellKeys) {
      const cell = this.cells.get(key);
      cell?.delete(record.slot);
      if (!cell?.size) this.cells.delete(key);
    }
    this.tiles.delete(id);
    this.slots.delete(record.slot);
    return true;
  }

  sample(x, z, referenceHeight = null, options = {}) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    const contactFilter = options.contact ?? null;
    if (![null, 'official', 'fallback'].includes(contactFilter)) throw new TypeError('Invalid contact filter');
    const refsByTile = this.cells.get(`${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`);
    if (!refsByTile) return null;
    let best = null, bestDistance = Infinity, bestContactPriority = -1;
    for (const [slot, refs] of refsByTile) {
      const record = this.slots.get(slot);
      if (!record) continue;
      for (const triangleIndex of refs) {
        const group = record.groups[record.triangleGroups[triangleIndex]];
        if (!group?.contactReady || (contactFilter && group.contact !== contactFilter)
          || (options.includeParking === false && group.layer === 'parking_surfaces')
          || (options.includeBridges === false && group.layer === 'bridges')) continue;
        const p = group.positions, offset = record.triangleOffsets[triangleIndex];
        const ax = p[offset], ay = p[offset + 1], az = p[offset + 2];
        const bx = p[offset + 3], by = p[offset + 4], bz = p[offset + 5];
        const cx = p[offset + 6], cy = p[offset + 7], cz = p[offset + 8];
        const ux = bx - ax, uz = bz - az, vx = cx - ax, vz = cz - az;
        const determinant = ux * vz - vx * uz;
        if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) continue;
        const dx = x - ax, dz = z - az;
        const inverse = 1 / determinant;
        const b = (dx * vz - dz * vx) * inverse;
        const c = (ux * dz - uz * dx) * inverse;
        if (b < -1e-8 || c < -1e-8 || b + c > 1 + 1e-8) continue;
        const height = ay + b * (by - ay) + c * (cy - ay);
        const vertex = offset / 3;
        const sourceId = group.sourceRanges?.find((range) => range.startVertex <= vertex
          && range.startVertex + range.vertexCount >= vertex + 3)?.sourceId;
        const distance = Number.isFinite(referenceHeight) ? Math.abs(height - referenceHeight) : -height;
        const contactPriority = group.contact === 'official' ? 1 : 0;
        const sameGradeContactOverride = best && group.contact !== best.contact
          && Math.abs(height - best.height) <= 0.5 && contactPriority > bestContactPriority;
        const reverseGradeOverride = best && group.contact !== best.contact
          && Math.abs(height - best.height) <= 0.5 && contactPriority < bestContactPriority;
        if (!best || sameGradeContactOverride
          || (!reverseGradeOverride && (distance < bestDistance - 1e-8
            || (Math.abs(distance - bestDistance) <= 1e-8 && contactPriority > bestContactPriority)
            || (Math.abs(distance - bestDistance) <= 1e-8 && contactPriority === bestContactPriority && height > best.height)))) {
          best = { height, heightSource: 'rendered-pavement-triangle', id: record.id, ...(sourceId ? { sourceId } : {}),
            layer: group.layer, contact: group.contact, materialKey: group.materialKey, kind: group.kind };
          bestDistance = distance;
          bestContactPriority = contactPriority;
        }
      }
    }
    return best;
  }
}
