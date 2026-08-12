/* Pure sampling helpers for the prepared Ontario lidar Terrarium heightmap. */

export const WEB_MERCATOR_RADIUS = 6378137;
export const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function decodeTerrariumRgb(red, green, blue) {
  return Number(red) * 256 + Number(green) + Number(blue) / 256 - 32768;
}

export function toWebMercator(lat, lon) {
  const safeLatitude = clamp(Number(lat), -WEB_MERCATOR_MAX_LATITUDE, WEB_MERCATOR_MAX_LATITUDE);
  const longitude = Number(lon);
  if (!Number.isFinite(safeLatitude) || !Number.isFinite(longitude)) return { x: Number.NaN, y: Number.NaN };
  const radians = safeLatitude * Math.PI / 180;
  return {
    x: WEB_MERCATOR_RADIUS * longitude * Math.PI / 180,
    y: WEB_MERCATOR_RADIUS * Math.log(Math.tan(Math.PI / 4 + radians / 2)),
  };
}

export function validOfficialTerrainMetadata(metadata) {
  const width = Number(metadata?.dimensions?.width);
  const height = Number(metadata?.dimensions?.height);
  const bounds = metadata?.bounds?.webMercatorEpsg3857;
  return Number.isInteger(width)
    && Number.isInteger(height)
    && width > 1
    && height > 1
    && typeof metadata?.asset === 'string'
    && metadata.asset.length > 0
    && metadata?.encoding?.name === 'Mapzen Terrarium RGB'
    && ['xmin', 'ymin', 'xmax', 'ymax'].every((key) => Number.isFinite(Number(bounds?.[key])))
    && Number(bounds.xmax) > Number(bounds.xmin)
    && Number(bounds.ymax) > Number(bounds.ymin);
}

export function officialTerrainPixelCoordinates(metadata, lat, lon) {
  if (!validOfficialTerrainMetadata(metadata)) return { x: Number.NaN, y: Number.NaN };
  const point = toWebMercator(lat, lon);
  const bounds = metadata.bounds.webMercatorEpsg3857;
  const width = metadata.dimensions.width;
  const height = metadata.dimensions.height;
  // ArcGIS exports describe pixel-area outer bounds, so geographic positions
  // map to pixel centres with a half-pixel offset.
  return {
    x: (point.x - bounds.xmin) / (bounds.xmax - bounds.xmin) * width - 0.5,
    y: (bounds.ymax - point.y) / (bounds.ymax - bounds.ymin) * height - 0.5,
  };
}

export function sampleTerrariumPixelGrid(pixels, width, height, x, y) {
  if (!pixels || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return Number.NaN;
  if (pixels.length < width * height * 4) return Number.NaN;
  const safeX = clamp(Number(x), 0, width - 1);
  const safeY = clamp(Number(y), 0, height - 1);
  if (!Number.isFinite(safeX) || !Number.isFinite(safeY)) return Number.NaN;
  const x0 = Math.floor(safeX);
  const y0 = Math.floor(safeY);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = safeX - x0;
  const ty = safeY - y0;
  const sample = (sampleX, sampleY) => {
    const index = (sampleY * width + sampleX) * 4;
    return decodeTerrariumRgb(pixels[index], pixels[index + 1], pixels[index + 2]);
  };
  const top = sample(x0, y0) * (1 - tx) + sample(x1, y0) * tx;
  const bottom = sample(x0, y1) * (1 - tx) + sample(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

export function sampleOfficialTerrainElevation(metadata, pixels, lat, lon) {
  if (!validOfficialTerrainMetadata(metadata)) return Number.NaN;
  const coordinate = officialTerrainPixelCoordinates(metadata, lat, lon);
  return sampleTerrariumPixelGrid(
    pixels,
    metadata.dimensions.width,
    metadata.dimensions.height,
    coordinate.x,
    coordinate.y,
  );
}
