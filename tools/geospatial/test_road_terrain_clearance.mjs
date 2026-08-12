import fs from 'node:fs';
import zlib from 'node:zlib';

const root = new URL('../../', import.meta.url);
const loadBrowserModule = async (relativePath) => {
  const source = fs.readFileSync(new URL(relativePath, root), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};
const roads = await loadBrowserModule('city-explorer/road-network.js');
const terrainHeightmap = await loadBrowserModule('city-explorer/terrain-heightmap.js');
const terrainSurface = await loadBrowserModule('city-explorer/terrain-surface.js');
const manifest = JSON.parse(fs.readFileSync(new URL('city-explorer/data/manifest.json', root), 'utf8'));
const osm = JSON.parse(fs.readFileSync(new URL('city-explorer/data/peterborough-osm.json', root), 'utf8'));

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeTerrainPng(fileUrl) {
  const bytes = fs.readFileSync(fileUrl);
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${fileUrl}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(`Unsupported terrain PNG format: depth=${bitDepth}, colour=${colorType}, interlace=${interlace}`);
  }
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    for (let byteIndex = 0; byteIndex < stride; byteIndex += 1) {
      const left = byteIndex >= channels ? pixels[y * stride + byteIndex - channels] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + byteIndex] : 0;
      const upperLeft = y > 0 && byteIndex >= channels ? pixels[(y - 1) * stride + byteIndex - channels] : 0;
      let value = filtered[sourceOffset];
      sourceOffset += 1;
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + above) & 255;
      else if (filter === 3) value = (value + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, above, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG row filter ${filter}`);
      pixels[y * stride + byteIndex] = value;
    }
  }
  return { channels, height, pixels, width };
}

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const terrainMetadataPath = manifest.terrain?.official?.metadata_file;
if (!terrainMetadataPath) throw new Error('The manifest does not declare the official Ontario lidar terrain');
const terrainMetadata = JSON.parse(fs.readFileSync(new URL(`city-explorer/data/${terrainMetadataPath}`, root), 'utf8'));
if (!terrainHeightmap.validOfficialTerrainMetadata(terrainMetadata)) throw new Error('Official terrain metadata is invalid');
const decodedTerrain = decodeTerrainPng(new URL(`city-explorer/data/terrain/${terrainMetadata.asset}`, root));
if (decodedTerrain.width !== terrainMetadata.dimensions.width || decodedTerrain.height !== terrainMetadata.dimensions.height) {
  throw new Error('Official terrain PNG dimensions do not match its metadata');
}
const rgbaTerrain = Buffer.alloc(decodedTerrain.width * decodedTerrain.height * 4);
for (let source = 0, target = 0; source < decodedTerrain.pixels.length; source += decodedTerrain.channels, target += 4) {
  rgbaTerrain[target] = decodedTerrain.pixels[source];
  rgbaTerrain[target + 1] = decodedTerrain.pixels[source + 1];
  rgbaTerrain[target + 2] = decodedTerrain.pixels[source + 2];
  rgbaTerrain[target + 3] = decodedTerrain.channels === 4 ? decodedTerrain.pixels[source + 3] : 255;
}
const sampleElevation = (lat, lon) => terrainHeightmap.sampleOfficialTerrainElevation(
  terrainMetadata,
  rgbaTerrain,
  lat,
  lon,
);

const center = manifest.center;
const latitudeScale = 110540;
const longitudeScale = 111320 * Math.cos(center.lat * Math.PI / 180);
const project = (lat, lon) => ({
  x: (lon - center.lon) * longitudeScale,
  y: -(lat - center.lat) * latitudeScale,
});
const unproject = (x, z) => ({
  lat: center.lat - z / latitudeScale,
  lon: center.lon + x / longitudeScale,
});
const baseElevation = sampleElevation(center.lat, center.lon);
const corners = [
  project(manifest.bbox.south, manifest.bbox.west),
  project(manifest.bbox.south, manifest.bbox.east),
  project(manifest.bbox.north, manifest.bbox.west),
  project(manifest.bbox.north, manifest.bbox.east),
];
const padding = 520;
const worldMinX = Math.min(...corners.map((point) => point.x)) - padding;
const worldMaxX = Math.max(...corners.map((point) => point.x)) + padding;
const worldMinZ = Math.min(...corners.map((point) => point.y)) - padding;
const worldMaxZ = Math.max(...corners.map((point) => point.y)) + padding;
const terrainSize = Math.max(worldMaxX - worldMinX, worldMaxZ - worldMinZ);
const terrainCenterX = (worldMinX + worldMaxX) / 2;
const terrainCenterZ = (worldMinZ + worldMaxZ) / 2;
const terrainSegments = clamp(Math.ceil(terrainSize / 34), 192, 560);
const terrainGrid = {
  heights: new Float32Array((terrainSegments + 1) ** 2),
  minX: terrainCenterX - terrainSize / 2,
  minZ: terrainCenterZ - terrainSize / 2,
  segments: terrainSegments,
  size: terrainSize,
};
const gridSpacing = terrainSize / terrainSegments;
for (let z = 0; z <= terrainSegments; z += 1) {
  for (let x = 0; x <= terrainSegments; x += 1) {
    const worldX = terrainGrid.minX + x * gridSpacing;
    const worldZ = terrainGrid.minZ + z * gridSpacing;
    const coordinate = unproject(worldX, worldZ);
    terrainGrid.heights[z * (terrainSegments + 1) + x] = sampleElevation(coordinate.lat, coordinate.lon) - baseElevation;
  }
}
const terrainHeightAtWorld = (x, z) => terrainSurface.sampleTriangulatedTerrainHeight(terrainGrid, x, z);

let checkedRoads = 0;
let checkedSurfacePoints = 0;
let minimumClearance = Infinity;
let worst = null;
let maximumLongitudinalGrade = 0;
let maximumGradeChange = 0;
let maximumPublicStreetGrade = 0;
let worstPublicStreetGrade = null;
let worstGrade = null;
let worstGradeChange = null;
let maximumGradeSmoothingLift = 0;
let worstGradeSmoothingLift = null;
const endpointHeights = new Map();
const roadLines = [];
for (const way of osm.elements || []) {
  const tags = way.tags || {};
  const profile = roads.roadProfile(tags);
  if (!profile || profile.tunnel) continue;
  const points = (way.geometry || [])
    .filter((coordinate) => Number.isFinite(coordinate?.lat) && Number.isFinite(coordinate?.lon))
    .map((coordinate) => project(coordinate.lat, coordinate.lon));
  if (points.length < 2) continue;
  const samples = roads.resampleRoadLine(points, tags, terrainHeightAtWorld, false);
  if (samples.length < 2) continue;
  roadLines.push({ id: way.id, profile, samples, tags });
}
roads.reconcileRoadNetworkElevations(roadLines);

for (const line of roadLines) {
  const { id, profile, samples, tags } = line;
  for (const sample of samples) {
    if ((sample.gradeSmoothingLift || 0) > maximumGradeSmoothingLift) {
      maximumGradeSmoothingLift = sample.gradeSmoothingLift;
      const coordinate = unproject(sample.x, sample.y);
      worstGradeSmoothingLift = { lift: sample.gradeSmoothingLift, lat: coordinate.lat, lon: coordinate.lon, name: tags.name || tags.ref || '', way: id };
    }
  }
  const endpointKey = (sample) => `${Math.round(sample.x * 20)}:${Math.round(sample.y * 20)}`;
  for (const sample of [samples[0], samples.at(-1)]) {
    const key = endpointKey(sample);
    if (!endpointHeights.has(key)) endpointHeights.set(key, []);
    endpointHeights.get(key).push({ height: sample.height, name: tags.name || tags.ref || '', way: id });
  }
  let previousGrade = null;
  for (let sampleIndex = 1; sampleIndex < samples.length; sampleIndex += 1) {
    const previous = samples[sampleIndex - 1];
    const sample = samples[sampleIndex];
    const run = Math.max(0.001, sample.distance - previous.distance);
    const grade = (sample.height - previous.height) / run;
    const highway = String(tags.highway || '').toLowerCase();
    if (!['service', 'track'].includes(highway) && Math.abs(grade) > maximumPublicStreetGrade) {
      maximumPublicStreetGrade = Math.abs(grade);
      const coordinate = unproject((sample.x + previous.x) / 2, (sample.y + previous.y) / 2);
      const previousCoordinate = unproject(previous.x, previous.y);
      const sampleCoordinate = unproject(sample.x, sample.y);
      worstPublicStreetGrade = {
        grade,
        lat: coordinate.lat,
        lon: coordinate.lon,
        name: tags.name || tags.ref || '',
        previousHeight: previous.height,
        previousGroundHeight: previous.groundHeight,
        height: sample.height,
        groundHeight: sample.groundHeight,
        previousSourceHeight: sampleElevation(previousCoordinate.lat, previousCoordinate.lon) - baseElevation,
        sourceHeight: sampleElevation(sampleCoordinate.lat, sampleCoordinate.lon) - baseElevation,
        run,
        way: id,
      };
    }
    if (Math.abs(grade) > maximumLongitudinalGrade) {
      maximumLongitudinalGrade = Math.abs(grade);
      const coordinate = unproject((sample.x + previous.x) / 2, (sample.y + previous.y) / 2);
      worstGrade = { grade, lat: coordinate.lat, lon: coordinate.lon, name: tags.name || tags.ref || '', way: id };
    }
    if (previousGrade !== null && Math.abs(grade - previousGrade) > maximumGradeChange) {
      maximumGradeChange = Math.abs(grade - previousGrade);
      const coordinate = unproject(sample.x, sample.y);
      worstGradeChange = { change: grade - previousGrade, lat: coordinate.lat, lon: coordinate.lon, name: tags.name || tags.ref || '', way: id };
    }
    previousGrade = grade;
  }
  const sides = roads.roadRibbonCrossSections(samples, profile.width);
  checkedRoads += 1;
  for (let segmentIndex = 1; segmentIndex < samples.length; segmentIndex += 1) {
    const a = samples[segmentIndex - 1];
    const b = samples[segmentIndex];
    const sideA = sides[segmentIndex - 1];
    const sideB = sides[segmentIndex];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const longitudinalSteps = Math.max(1, Math.ceil(length / 2));
    const lateralSteps = Math.max(2, Math.ceil(profile.width / 2));
    for (let along = 0; along <= longitudinalSteps; along += 1) {
      const t = along / longitudinalSteps;
      const leftX = sideA.leftX + (sideB.leftX - sideA.leftX) * t;
      const leftZ = sideA.leftZ + (sideB.leftZ - sideA.leftZ) * t;
      const rightX = sideA.rightX + (sideB.rightX - sideA.rightX) * t;
      const rightZ = sideA.rightZ + (sideB.rightZ - sideA.rightZ) * t;
      const roadHeight = a.height + (b.height - a.height) * t;
      for (let across = 0; across <= lateralSteps; across += 1) {
        const u = across / lateralSteps;
        const x = leftX + (rightX - leftX) * u;
        const z = leftZ + (rightZ - leftZ) * u;
        // The visible mesh is deliberately 3.5 cm below the shared source
        // datum; compare against those exact pixels, not an abstract DEM.
        const clearance = roadHeight - (terrainHeightAtWorld(x, z) - 0.035);
        checkedSurfacePoints += 1;
        if (clearance < minimumClearance) {
          minimumClearance = clearance;
          const coordinate = unproject(x, z);
          worst = { clearance, lat: coordinate.lat, lon: coordinate.lon, name: tags.name || tags.ref || '', way: id };
        }
      }
    }
  }
}

let maximumEndpointDiscontinuity = 0;
let worstEndpoint = null;
for (const entries of endpointHeights.values()) {
  if (entries.length < 2) continue;
  const minimum = Math.min(...entries.map((entry) => entry.height));
  const maximum = Math.max(...entries.map((entry) => entry.height));
  if (maximum - minimum > maximumEndpointDiscontinuity) {
    maximumEndpointDiscontinuity = maximum - minimum;
    worstEndpoint = entries;
  }
}

const requiredClearance = 0.015;
const validationFailures = [];
if (minimumClearance < requiredClearance) {
  validationFailures.push(`rendered clearance fell to ${minimumClearance.toFixed(3)} m`);
}
if (maximumLongitudinalGrade > 0.221) {
  validationFailures.push(`maximum road grade reached ${(maximumLongitudinalGrade * 100).toFixed(2)}%`);
}
if (maximumPublicStreetGrade > 0.201) {
  validationFailures.push(`maximum public-street grade reached ${(maximumPublicStreetGrade * 100).toFixed(2)}%`);
}
if (maximumGradeChange > 0.25) {
  validationFailures.push(`adjacent grade change reached ${(maximumGradeChange * 100).toFixed(2)}%`);
}
if (maximumEndpointDiscontinuity > 0.002) {
  validationFailures.push(`connected endpoint discontinuity reached ${maximumEndpointDiscontinuity.toFixed(3)} m`);
}
if (maximumGradeSmoothingLift > 3.001) {
  validationFailures.push(`road smoothing fill reached ${maximumGradeSmoothingLift.toFixed(3)} m`);
}
if (validationFailures.length) {
  console.error(JSON.stringify({
    status: 'fail',
    failures: validationFailures,
    minimumClearance,
    worst,
    worstGrade,
    worstPublicStreetGrade,
    worstGradeChange,
    worstGradeSmoothingLift,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'pass',
  checkedRoads,
  checkedSurfacePoints,
  minimumClearanceMetres: Number(minimumClearance.toFixed(3)),
  maximumLongitudinalGradePct: Number((maximumLongitudinalGrade * 100).toFixed(2)),
  maximumPublicStreetGradePct: Number((maximumPublicStreetGrade * 100).toFixed(2)),
  maximumGradeChangePct: Number((maximumGradeChange * 100).toFixed(2)),
  maximumEndpointDiscontinuityMetres: Number(maximumEndpointDiscontinuity.toFixed(3)),
  maximumGradeSmoothingLiftMetres: Number(maximumGradeSmoothingLift.toFixed(3)),
  terrainSource: terrainMetadata.source.dataset,
  terrainGridSpacingMetres: Number(gridSpacing.toFixed(3)),
  worst,
  worstGrade,
  worstPublicStreetGrade,
  worstGradeChange,
  worstGradeSmoothingLift,
  worstEndpoint,
}, null, 2));
