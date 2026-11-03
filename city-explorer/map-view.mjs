export const MAP_VIEW_LIMITS = Object.freeze({ minAltitudeAGL: 100, maxAltitudeAGL: 18000, minTileZoom: 10, maxTileZoom: 19 });

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function clampMapAltitudeAGL(value, min = MAP_VIEW_LIMITS.minAltitudeAGL, max = MAP_VIEW_LIMITS.maxAltitudeAGL) {
  return clamp(Number.isFinite(Number(value)) ? Number(value) : min, min, max);
}

export function mapAltitudeFromWheel(altitudeAGL, deltaY, deltaMode = 0) {
  const pixels = Number(deltaY) * (deltaMode === 1 ? 16 : deltaMode === 2 ? 800 : 1);
  return clampMapAltitudeAGL(Number(altitudeAGL) * Math.exp(pixels * 0.0012));
}

export function mapAltitudeByFactor(altitudeAGL, factor) {
  return clampMapAltitudeAGL(Number(altitudeAGL) * Number(factor));
}

export function mapPanFromDrag({ deltaX, deltaY, altitudeAGL, viewportWidth, viewportHeight, fovDegrees = 58 }) {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const height = Math.max(1, Number(viewportHeight) || 1);
  const halfVisibleHeight = Math.max(0, Number(altitudeAGL) || 0) * Math.tan((Number(fovDegrees) || 58) * Math.PI / 360);
  return {
    x: -Number(deltaX || 0) * 2 * halfVisibleHeight * (width / height) / width,
    z: -Number(deltaY || 0) * 2 * halfVisibleHeight / height,
  };
}

export function lonLatToWebMercatorTile(lat, lon, zoom) {
  const n = 2 ** Number(zoom);
  const latitude = clamp(Number(lat), -85.05112878, 85.05112878) * Math.PI / 180;
  return {
    x: (Number(lon) + 180) / 360 * n,
    y: (1 - Math.asinh(Math.tan(latitude)) / Math.PI) / 2 * n,
  };
}

export function webMercatorTileToLonLat(x, y, zoom) {
  const n = 2 ** Number(zoom);
  return {
    lon: Number(x) / n * 360 - 180,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * Number(y) / n))) * 180 / Math.PI,
  };
}

/** Densified tile mesh; each vertex follows the Mercator latitude curve into local world coordinates. */
export function webMercatorTileVertices(tileX, tileY, zoom, project, { segments = 16 } = {}) {
  const side = Math.max(1, Math.floor(segments));
  const vertices = [];
  for (let row = 0; row <= side; row += 1) {
    for (let column = 0; column <= side; column += 1) {
      const geo = webMercatorTileToLonLat(Number(tileX) + column / side, Number(tileY) + row / side, zoom);
      const world = project(geo.lat, geo.lon);
      vertices.push({ x: world.x, z: world.z ?? world.y, y: 0, u: column / side, v: 1 - row / side });
    }
  }
  return vertices;
}
