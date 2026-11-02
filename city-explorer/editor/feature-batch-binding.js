export function captureBatchLengths(batches) {
  return new Map([...batches].map(([key, batch]) => [key, batch.positions.length]));
}

export function collectBatchRanges(batches, starts) {
  const ranges = [];
  for (const [key, batch] of batches) {
    const start = starts.get(key) ?? 0;
    const end = batch.positions.length;
    if (end > start) ranges.push({ key, startVertex: start / 3, vertexCount: (end - start) / 3 });
  }
  return ranges;
}

function parseColor(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255];
  const match = /^#?([0-9a-f]{6})$/i.exec(String(value || ''));
  if (!match) return null;
  const color = Number.parseInt(match[1], 16);
  return [(color >> 16 & 255) / 255, (color >> 8 & 255) / 255, (color & 255) / 255];
}

export function createFeatureBatchBinding(ranges, resolveMesh) {
  const originals = new Map();
  const sourceColors = new Map();
  let hidden = false;
  let requestedAppearance = null;
  const rangeIdentity = (range) => JSON.stringify([range.key, range.startVertex, range.vertexCount]);

  function attributeFor(range, name) {
    return resolveMesh(range.key)?.geometry?.getAttribute?.(name) ?? null;
  }

  function setVisible(visible, force = false) {
    const shouldHide = !visible;
    if (hidden === shouldHide && !force) return;
    const changedMeshes = new Set();
    for (const range of ranges) {
      const attribute = attributeFor(range, 'position');
      if (!attribute) continue;
      const start = range.startVertex * 3;
      const end = start + range.vertexCount * 3;
      const identity = rangeIdentity(range);
      if (!originals.has(identity)) originals.set(identity, attribute.array.slice(start, end));
      const source = originals.get(identity);
      let changed = false;
      for (let offset = 0; offset < end - start; offset += 1) {
        const next = visible ? source[offset] : 0;
        if (attribute.array[start + offset] !== next) {
          attribute.array[start + offset] = next;
          changed = true;
        }
      }
      if (changed) {
        attribute.needsUpdate = true;
        changedMeshes.add(range.key);
      }
    }
    for (const key of changedMeshes) resolveMesh(key)?.geometry?.computeBoundingSphere?.();
    hidden = shouldHide;
  }

  function setAppearance(appearance = {}) {
    if (appearance.color === undefined) return false;
    const color = parseColor(appearance.color);
    if (!color) return false;
    requestedAppearance = appearance;
    for (const range of ranges) {
      const attribute = attributeFor(range, 'color');
      if (!attribute) return false;
      const start = range.startVertex * 3;
      const end = start + range.vertexCount * 3;
      const identity = rangeIdentity(range);
      if (!sourceColors.has(identity)) sourceColors.set(identity, attribute.array.slice(start, end));
      let changed = false;
      for (let offset = start; offset < end; offset += 3) {
        for (let channel = 0; channel < 3; channel += 1) {
          if (attribute.array[offset + channel] !== color[channel]) {
            attribute.array[offset + channel] = color[channel];
            changed = true;
          }
        }
      }
      if (changed) {
        attribute.needsUpdate = true;
      }
    }
    return true;
  }

  function restore() {
    if (!hidden && requestedAppearance === null) return;
    const wasHidden = hidden;
    requestedAppearance = null;
    if (wasHidden) setVisible(true);
    for (const range of ranges) {
      const source = sourceColors.get(rangeIdentity(range));
      const attribute = attributeFor(range, 'color');
      if (source && attribute) {
        const start = range.startVertex * 3;
        let changed = false;
        for (let offset = 0; offset < source.length; offset += 1) {
          if (attribute.array[start + offset] !== source[offset]) {
            attribute.array[start + offset] = source[offset];
            changed = true;
          }
        }
        if (changed) attribute.needsUpdate = true;
      }
    }
  }

  function cloneGeometry(THREE, origin = null) {
    const root = new THREE.Group();
    if (origin) root.position.copy(origin);
    for (const range of ranges) {
      const sourceMesh = resolveMesh(range.key);
      const sourceGeometry = sourceMesh?.geometry;
      if (!sourceMesh || !sourceGeometry) continue;
      const geometry = new THREE.BufferGeometry();
      const first = range.startVertex;
      const last = first + range.vertexCount;
      for (const name of Object.keys(sourceGeometry.attributes)) {
        const attribute = sourceGeometry.getAttribute(name);
        const start = first * attribute.itemSize;
        const end = last * attribute.itemSize;
        // Replacement hides the original before cloning. Read its saved source
        // positions instead of the zeroed visibility buffer in that case.
        const array = name === 'position' && hidden && originals.has(rangeIdentity(range))
          ? originals.get(rangeIdentity(range)).slice()
          : attribute.array.slice(start, end);
        if (name === 'position' && origin) {
          for (let offset = 0; offset + 2 < array.length; offset += attribute.itemSize) {
            array[offset] -= origin.x;
            array[offset + 1] -= origin.y;
            array[offset + 2] -= origin.z;
          }
        }
        geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.itemSize, attribute.normalized));
      }
      if (!geometry.getAttribute('position')) { geometry.dispose(); continue; }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const sourceMaterials = Array.isArray(sourceMesh.material) ? sourceMesh.material : [sourceMesh.material];
      const materials = sourceMaterials.map((material) => material?.clone?.() ?? material);
      const mesh = new THREE.Mesh(geometry, Array.isArray(sourceMesh.material) ? materials : materials[0]);
      mesh.castShadow = sourceMesh.castShadow;
      mesh.receiveShadow = sourceMesh.receiveShadow;
      mesh.renderOrder = sourceMesh.renderOrder;
      root.add(mesh);
    }
    return root;
  }

  function refresh() { if (hidden) setVisible(false, true); if (requestedAppearance) setAppearance(requestedAppearance); }
  return { setVisible, setAppearance, restore, cloneGeometry, refresh };
}
