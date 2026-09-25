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

  function attributeFor(range, name) {
    return resolveMesh(range.key)?.geometry?.getAttribute?.(name) ?? null;
  }

  function setVisible(visible) {
    if (visible === !hidden) return;
    for (const range of ranges) {
      const attribute = attributeFor(range, 'position');
      if (!attribute) continue;
      const start = range.startVertex * 3;
      const end = start + range.vertexCount * 3;
      if (!originals.has(range.key)) originals.set(range.key, attribute.array.slice(start, end));
      if (visible) attribute.array.set(originals.get(range.key), start);
      else attribute.array.fill(0, start, end);
      attribute.needsUpdate = true;
      resolveMesh(range.key)?.geometry?.computeBoundingSphere?.();
    }
    hidden = !visible;
  }

  function setAppearance(appearance = {}) {
    if (appearance.color === undefined) return false;
    const color = parseColor(appearance.color);
    if (!color) return false;
    for (const range of ranges) {
      const attribute = attributeFor(range, 'color');
      if (!attribute) return false;
      const start = range.startVertex * 3;
      const end = start + range.vertexCount * 3;
      if (!sourceColors.has(range.key)) sourceColors.set(range.key, attribute.array.slice(start, end));
      for (let offset = start; offset < end; offset += 3) attribute.array.set(color, offset);
      attribute.needsUpdate = true;
    }
    return true;
  }

  function restore() {
    setVisible(true);
    for (const range of ranges) {
      const source = sourceColors.get(range.key);
      const attribute = attributeFor(range, 'color');
      if (source && attribute) {
        attribute.array.set(source, range.startVertex * 3);
        attribute.needsUpdate = true;
      }
    }
  }

  return { setVisible, setAppearance, restore };
}
