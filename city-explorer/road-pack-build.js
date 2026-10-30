/** Build-time triangle partitioning. Coordinates and source identities survive bit-for-bit. */
export function partitionRoadGeometry(groups, { tileSize = 512 } = {}) {
  if (!Number.isFinite(tileSize) || tileSize <= 0) throw new RangeError('Invalid road tile size');
  const tiles = new Map();
  for (const source of groups) {
    const positions = source.positions;
    if (!positions || positions.length % 9) throw new TypeError('Expected triangle positions');
    const ranges = [...(source.sourceRanges || [])].sort((a, b) => a.startVertex - b.startVertex);
    let cursor = 0; let active = [];
    for (let offset = 0; offset < positions.length; offset += 9) {
      const p = Array.from(positions.slice(offset, offset + 9), Math.fround);
      if (!p.every(Number.isFinite)) throw new TypeError('Road vertices must be finite');
      const x = Math.floor((p[0] + p[3] + p[6]) / (3 * tileSize));
      const z = Math.floor((p[2] + p[5] + p[8]) / (3 * tileSize));
      const id = `${x}:${z}`;
      if (!tiles.has(id)) tiles.set(id, { id, x, z, bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }, groups: new Map() });
      const tile = tiles.get(id);
      const key = [source.materialKey, source.kind, source.layer || '', source.contact || ''].join('|');
      if (!tile.groups.has(key)) tile.groups.set(key, { materialKey: source.materialKey || 'roadLocal', kind: source.kind || 'surface', layer: source.layer || 'road_surfaces', contact: source.contact || null, positions: [], normals: [], sources: new Map() });
      const group = tile.groups.get(key);
      const startVertex = group.positions.length / 3;
      for (let i = 0; i < 9; i += 3) {
        tile.bounds.minX = Math.min(tile.bounds.minX, p[i]); tile.bounds.maxX = Math.max(tile.bounds.maxX, p[i]);
        tile.bounds.minZ = Math.min(tile.bounds.minZ, p[i + 2]); tile.bounds.maxZ = Math.max(tile.bounds.maxZ, p[i + 2]);
      }
      group.positions.push(...p);
      if (source.normals?.length === positions.length) group.normals.push(...source.normals.slice(offset, offset + 9));
      else {
        const ux=p[3]-p[0],uy=p[4]-p[1],uz=p[5]-p[2],vx=p[6]-p[0],vy=p[7]-p[1],vz=p[8]-p[2];
        const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz)||1;
        for(let i=0;i<3;i++)group.normals.push(nx/length,ny/length,nz/length);
      }
      const vertex = offset / 3;
      active = active.filter(range => range.startVertex + range.vertexCount > vertex);
      while (cursor < ranges.length && ranges[cursor].startVertex <= vertex) { active.push(ranges[cursor]); cursor++; }
      for (const sourceId of new Set(active.filter(range => range.startVertex + range.vertexCount >= vertex + 3).map(range => range.sourceId))) {
        if (!sourceId) continue;
        if (!group.sources.has(sourceId)) group.sources.set(sourceId, []);
        const list=group.sources.get(sourceId), previous=list.at(-1);
        if(previous && previous.startVertex+previous.vertexCount===startVertex) previous.vertexCount+=3;
        else list.push({sourceId,startVertex,vertexCount:3});
      }
    }
  }
  return [...tiles.values()].sort((a,b)=>a.x-b.x||a.z-b.z).map(tile=>({ ...tile, groups:[...tile.groups.values()].map(({sources,positions,normals,...group})=>({...group,positions:new Float32Array(positions),normals:new Float32Array(normals),sourceRanges:[...sources.values()].flat()})) }));
}
