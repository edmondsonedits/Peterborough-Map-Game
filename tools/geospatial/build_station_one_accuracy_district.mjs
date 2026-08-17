import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const dataRoot = new URL('city-explorer/data/', root);
const outputUrl = new URL('survey/station-one-district-inventory.geojson', dataRoot);

// Exactly ten times the ground area of the original 257 m Station 1 tile.
export const ACCURACY_DISTRICT = Object.freeze({
  centre: { lon: -78.3221624, lat: 44.30096873859512 },
  bounds: {
    west: -78.32727138067858,
    south: 44.29730615311119,
    east: -78.31705341932141,
    north: 44.30463132407905,
  },
  baseline_area_m2: 66269.51489856302,
  target_area_m2: 662695.1489856303,
  nominal_side_m: 814.0609000471834,
});

const osm = JSON.parse(await readFile(new URL('peterborough-osm.json', dataRoot), 'utf8'));
const roadData = JSON.parse(await readFile(new URL('peterborough-road-surfaces.geojson', dataRoot), 'utf8'));

function coordinatePairs(coordinates, output = []) {
  if (!Array.isArray(coordinates)) return output;
  if (coordinates.length >= 2 && Number.isFinite(Number(coordinates[0])) && Number.isFinite(Number(coordinates[1]))) {
    output.push([Number(coordinates[0]), Number(coordinates[1])]);
    return output;
  }
  coordinates.forEach((entry) => coordinatePairs(entry, output));
  return output;
}

function inside([lon, lat]) {
  const { west, south, east, north } = ACCURACY_DISTRICT.bounds;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

function fullyInsideGeometry(geometry) {
  const pairs = coordinatePairs(geometry?.coordinates);
  return pairs.length > 0 && pairs.every(inside);
}

function feature(id, semanticType, geometry, sourceId, confidence, extra = {}) {
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      id,
      semantic_type: semanticType,
      source_id: sourceId,
      confidence,
      review_status: 'source-aligned',
      render_in_semantic_layer: false,
      ...extra,
    },
  };
}

const features = [];
for (const element of osm.elements || []) {
  const tags = element.tags || {};
  if (element.type === 'node' && tags.natural === 'tree' && inside([element.lon, element.lat])) {
    features.push(feature(
      `district-osm-tree-${element.id}`,
      'tree',
      { type: 'Point', coordinates: [element.lon, element.lat] },
      `openstreetmap-node-${element.id}`,
      0.8,
      { source_role: 'mapped-tree-inventory' },
    ));
    continue;
  }
  if (element.type !== 'way' || !Array.isArray(element.geometry) || element.geometry.length < 2) continue;
  const coordinates = element.geometry.map((point) => [Number(point.lon), Number(point.lat)]);
  if (!coordinates.every(inside)) continue;
  if (tags.building && coordinates.length >= 4) {
    const ring = coordinates[0][0] === coordinates.at(-1)[0] && coordinates[0][1] === coordinates.at(-1)[1]
      ? coordinates
      : [...coordinates, coordinates[0]];
    features.push(feature(
      `district-osm-building-${element.id}`,
      'building',
      { type: 'Polygon', coordinates: [ring] },
      `openstreetmap-way-${element.id}`,
      0.86,
      {
        source_role: 'building-footprint-inventory',
        building_class: String(tags.building),
        height: tags.height ?? null,
        levels: tags['building:levels'] ?? null,
        roof_shape: tags['roof:shape'] ?? null,
      },
    ));
  }
  if (tags.barrier === 'fence') {
    features.push(feature(
      `district-osm-fence-${element.id}`,
      'fence',
      { type: 'LineString', coordinates },
      `openstreetmap-way-${element.id}`,
      0.76,
      { source_role: 'mapped-fence-inventory', height_m: Number(tags.height) || null },
    ));
  }
}

for (const source of roadData.features || []) {
  if (!fullyInsideGeometry(source.geometry)) continue;
  const layer = source.properties?.ptbo_layer;
  if (layer === 'road_surfaces' && source.geometry.type === 'Polygon') {
    features.push(feature(
      `district-road-surface-${String(source.id).replace('/', '-')}`,
      'paved_area',
      source.geometry,
      `city-of-peterborough-${source.id}`,
      0.98,
      { source_role: 'authoritative-road-surface', facility_id: source.properties?.FACILITYID ?? null },
    ));
  }
  if (layer === 'curb_edges' && source.geometry.type === 'LineString') {
    features.push(feature(
      `district-curb-${String(source.id).replace('/', '-')}`,
      'curb',
      source.geometry,
      `city-of-peterborough-${source.id}`,
      0.98,
      { source_role: 'authoritative-curb-edge' },
    ));
  }
}

const byType = {};
for (const entry of features) {
  const type = entry.properties.semantic_type;
  byType[type] = (byType[type] || 0) + 1;
}

const collection = {
  type: 'FeatureCollection',
  metadata: {
    schema_version: 1,
    id: 'station-one-central-peterborough-accuracy-inventory',
    area: 'Ten-times Station 1 central Peterborough accuracy district',
    coordinate_reference: 'EPSG:4326',
    generated_at: new Date().toISOString(),
    source: {
      id: 'city-open-data-and-openstreetmap',
      name: 'City of Peterborough open geospatial data and OpenStreetMap',
      licence: 'Open Government Licence - Ontario; Open Data Commons Open Database Licence (ODbL)',
    },
    sources: [
      { id: 'city-of-peterborough', name: 'City of Peterborough road surfaces and curb edges', licence: 'City of Peterborough Open Data Licence' },
      { id: 'openstreetmap', name: 'OpenStreetMap building, tree, and fence inventory', licence: 'ODbL 1.0' },
    ],
    coverage: { ...ACCURACY_DISTRICT, feature_counts: byType },
    production_policy: {
      stable_features_only: true,
      source_aligned_requires_visual_review: true,
      render_authoritative_base_once: true,
    },
  },
  features,
};

await writeFile(outputUrl, `${JSON.stringify(collection)}\n`, 'utf8');
console.log(JSON.stringify({ output: outputUrl.pathname, total: features.length, byType }, null, 2));
