import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dataPath = resolve(root, 'shared/dispatch-data-1.4.4.js');
const roadsPath = resolve(root, 'city-explorer/data/osm-public-roads.geojson');
const outputPath = resolve(root, 'shared/simulator-targets.js');

const normalizeText = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const keyText = value => normalizeText(value).toLowerCase().replace(/[â€™']/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const slug = text => keyText(text).replace(/\s+/g, '-').slice(0, 48) || 'location';
function hash(text) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}
function makeId(location) {
  const identity = [location.main, location.sub, location.name, location.addr]
    .map(keyText)
    .join('|');
  return `call-${slug(location.name)}-${hash(identity)}`;
}

function pointToMeters(latitude, longitude, originLatitude) {
  return {
    x: longitude * 111320 * Math.cos(originLatitude * Math.PI / 180),
    y: latitude * 110540
  };
}

function metersToPoint(x, y, originLatitude) {
  return {
    lat: y / 110540,
    lng: x / (111320 * Math.cos(originLatitude * Math.PI / 180))
  };
}

function nearestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const x = start.x + dx * ratio;
  const y = start.y + dy * ratio;
  return { x, y, distanceMeters: Math.hypot(point.x - x, point.y - y) };
}

function extractLocations(source) {
  const payloadMatch = source.match(/const PAYLOAD = '([^']+)'/);
  if (!payloadMatch) throw new Error('Unable to locate the compressed dispatch payload.');
  return JSON.parse(gunzipSync(Buffer.from(payloadMatch[1], 'base64')).toString('utf8'));
}

function buildRoadSegments(geojson, originLatitude) {
  return geojson.features.flatMap(feature => {
    const coordinates = feature?.geometry?.type === 'LineString' ? feature.geometry.coordinates : [];
    const properties = feature.properties || {};
    return coordinates.slice(1).map((coordinate, index) => ({
      start: pointToMeters(coordinates[index][1], coordinates[index][0], originLatitude),
      end: pointToMeters(coordinate[1], coordinate[0], originLatitude),
      roadName: normalizeText(properties.name || properties.ref || properties.highway || 'Road')
    }));
  });
}

const [source, roadsSource] = await Promise.all([readFile(dataPath, 'utf8'), readFile(roadsPath, 'utf8')]);
const locations = extractLocations(source);
const roads = buildRoadSegments(JSON.parse(roadsSource), 44.31);
const targets = {};

for (const location of locations) {
  const point = pointToMeters(Number(location.lat), Number(location.lng), 44.31);
  let nearest = null;
  for (const segment of roads) {
    const candidate = nearestPointOnSegment(point, segment.start, segment.end);
    if (!nearest || candidate.distanceMeters < nearest.distanceMeters) nearest = { ...candidate, roadName: segment.roadName };
  }
  if (!nearest) throw new Error(`No road target found for ${location.name}.`);
  const snapped = metersToPoint(nearest.x, nearest.y, 44.31);
  targets[makeId(location)] = {
    lat: Number(snapped.lat.toFixed(6)),
    lng: Number(snapped.lng.toFixed(6)),
    radius: Math.max(35, Math.min(100, Number(location.radius) || 50)),
    roadName: nearest.roadName,
    source: 'osm-public-roads'
  };
}

const file = `// Generated from city-explorer/data/osm-public-roads.geojson.\n// Geo Guesser targets remain in the dispatch data; these are road-accessible simulator targets.\n(() => {\n  window.PTBO_SIMULATOR_TARGETS = Object.freeze(${JSON.stringify(targets, null, 2)});\n})();\n`;
await writeFile(outputPath, file, 'utf8');
console.log(`Generated ${Object.keys(targets).length} road-accessible simulator targets.`);
