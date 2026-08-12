/*
  Terrain land-cover raster helpers for Peterborough Explorer.

  Large OSM land-use polygons should be painted once into a transparent
  texture and rendered by the terrain mesh. That makes every park, parking
  lot, and land-use area follow the lidar surface without generating hundreds
  of thousands of extra triangles. This module deliberately has no Three.js,
  DOM, or browser dependency, so its mapping and path construction can be
  tested in Node and reused with HTMLCanvasElement or OffscreenCanvas.
*/

function finite(value) {
  return Number.isFinite(value);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedExtent(extent) {
  const minX = extent?.minX;
  const minZ = extent?.minZ;
  const sizeX = extent?.sizeX ?? extent?.width ?? extent?.size;
  const sizeZ = extent?.sizeZ ?? extent?.depth ?? extent?.size;
  if (![minX, minZ, sizeX, sizeZ].every(finite) || sizeX <= 0 || sizeZ <= 0) {
    throw new TypeError('Terrain extent requires finite minX/minZ and positive size values.');
  }
  return { minX, minZ, sizeX, sizeZ };
}

function normalizedDimensions(dimensions) {
  const width = dimensions?.width;
  const height = dimensions?.height;
  if (![width, height].every(finite) || width <= 0 || height <= 0) {
    throw new TypeError('Texture dimensions require positive finite width and height.');
  }
  return { width, height };
}

function worldZ(point) {
  return finite(point?.y) ? point.y : point?.z;
}

/**
 * Convert one projected world point to canvas pixel coordinates.
 *
 * Peterborough's projected rings store the north/south coordinate in `y`,
 * while Three.js stores that same horizontal coordinate in world `z`. The
 * canvas top edge maps to minZ and the bottom edge maps to maxZ. This matches
 * the UV orientation of the Explorer's -90 degree rotated PlaneGeometry.
 */
export function worldToTexturePoint(point, extent, dimensions, { clampToTexture = false } = {}) {
  const terrain = normalizedExtent(extent);
  const texture = normalizedDimensions(dimensions);
  const z = worldZ(point);
  if (!finite(point?.x) || !finite(z)) return null;

  let x = ((point.x - terrain.minX) / terrain.sizeX) * texture.width;
  let y = ((z - terrain.minZ) / terrain.sizeZ) * texture.height;
  if (clampToTexture) {
    x = clamp(x, 0, texture.width);
    y = clamp(y, 0, texture.height);
  }
  return { x, y };
}

/** Map a projected polygon ring, dropping invalid and duplicate closing points. */
export function worldRingToTexture(ring, extent, dimensions, options) {
  if (!Array.isArray(ring)) return [];
  const mapped = ring
    .map((point) => worldToTexturePoint(point, extent, dimensions, options))
    .filter(Boolean);

  if (mapped.length > 1) {
    const first = mapped[0];
    const last = mapped[mapped.length - 1];
    if (first.x === last.x && first.y === last.y) mapped.pop();
  }
  return mapped.length >= 3 ? mapped : [];
}

/** Return mapped pixel bounds and whether any part can intersect the canvas. */
export function textureBoundsForRings(rings, extent, dimensions, options) {
  const texture = normalizedDimensions(dimensions);
  const mappedRings = Array.isArray(rings)
    ? rings.map((ring) => worldRingToTexture(ring, extent, texture, options)).filter((ring) => ring.length >= 3)
    : [];
  if (!mappedRings.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of mappedRings) {
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    intersectsTexture: maxX >= 0 && maxY >= 0 && minX <= texture.width && minY <= texture.height,
    mappedRings,
  };
}

function assertPainterContext(context) {
  const methods = ['beginPath', 'moveTo', 'lineTo', 'closePath', 'fill', 'save', 'restore'];
  if (!context || methods.some((method) => typeof context[method] !== 'function')) {
    throw new TypeError('A CanvasRenderingContext2D-compatible painter context is required.');
  }
}

/**
 * Paint a projected polygon and all of its holes into a land-cover texture.
 *
 * `rings[0]` is conventionally the outer boundary and remaining rings are
 * holes. The explicit even-odd fill rule also handles inconsistent source
 * winding, which is common when several public GIS sources are combined.
 */
export function paintLandCoverPolygon(context, rings, {
  extent,
  width = context?.canvas?.width,
  height = context?.canvas?.height,
  fillStyle = '#000000',
  opacity = 1,
  compositeOperation = 'source-over',
  skipOutside = true,
} = {}) {
  assertPainterContext(context);
  const dimensions = normalizedDimensions({ width, height });
  const bounds = textureBoundsForRings(rings, extent, dimensions);
  if (!bounds || (skipOutside && !bounds.intersectsTexture)) {
    return { painted: false, rings: 0, vertices: 0, bounds };
  }

  const alpha = clamp(finite(opacity) ? opacity : 1, 0, 1);
  if (alpha === 0) {
    return { painted: false, rings: bounds.mappedRings.length, vertices: 0, bounds };
  }

  context.save();
  context.fillStyle = fillStyle;
  context.globalAlpha = alpha;
  context.globalCompositeOperation = compositeOperation;
  context.beginPath();

  let vertices = 0;
  for (const ring of bounds.mappedRings) {
    context.moveTo(ring[0].x, ring[0].y);
    for (let index = 1; index < ring.length; index += 1) {
      context.lineTo(ring[index].x, ring[index].y);
    }
    context.closePath();
    vertices += ring.length;
  }

  context.fill('evenodd');
  context.restore();
  return {
    painted: true,
    rings: bounds.mappedRings.length,
    vertices,
    bounds: {
      minX: bounds.minX,
      minY: bounds.minY,
      maxX: bounds.maxX,
      maxY: bounds.maxY,
      width: bounds.width,
      height: bounds.height,
      intersectsTexture: bounds.intersectsTexture,
    },
  };
}

/** Clear the complete texture back to transparent pixels. */
export function clearLandCoverRaster(context, {
  width = context?.canvas?.width,
  height = context?.canvas?.height,
} = {}) {
  if (!context || typeof context.clearRect !== 'function') {
    throw new TypeError('A canvas context with clearRect is required.');
  }
  const dimensions = normalizedDimensions({ width, height });
  context.clearRect(0, 0, dimensions.width, dimensions.height);
  return dimensions;
}

