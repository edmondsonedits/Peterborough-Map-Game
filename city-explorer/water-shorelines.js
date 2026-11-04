import clipping from './vendor/polygon-clipping-0.15.7.js';

// Stable vegetated island cores downstream of the London Street dam.
// Digitized from South Central Ontario Orthophotography 2023 (EPSG:4326),
// with the seasonal shallows left in the lidar water footprint.
// Contains information licensed under the Open Government Licence – Ontario.
// https://data.ontario.ca/dataset/open-ontario-imagery/resource/7a637818-08d9-4951-936e-c1adb0d858e1
const LONDON_STREET_ISLETS = [
  [
    [-78.3138442,44.3114875], [-78.3136888,44.3114796], [-78.3135223,44.3113604], [-78.3134446,44.311138],
    [-78.3133891,44.3109632], [-78.3134335,44.3108043], [-78.3133446,44.3106296], [-78.313278,44.3104151],
    [-78.3132447,44.3101688], [-78.3132558,44.3099146], [-78.3132114,44.3096603], [-78.3132114,44.3093426],
    [-78.3132669,44.3089851], [-78.3133335,44.3092313], [-78.3133891,44.3095571], [-78.3134668,44.3098431],
    [-78.3135445,44.3100814], [-78.3136111,44.3102959], [-78.3136777,44.3105501], [-78.3137554,44.3107249],
    [-78.3137998,44.3109156], [-78.3138998,44.3111459], [-78.313922,44.3113287],
  ],
  [
    [-78.3131892,44.3110983], [-78.3130671,44.3110188], [-78.3130116,44.3108441], [-78.3129117,44.3106455],
    [-78.3128562,44.3104468], [-78.3127451,44.3102641], [-78.3126563,44.3100337], [-78.3124898,44.3098907],
    [-78.3125009,44.3097398], [-78.3126563,44.3097398], [-78.3128339,44.3098748], [-78.3129228,44.3100576],
    [-78.3130005,44.3102482], [-78.3131115,44.3103753], [-78.313167,44.3105819], [-78.3132558,44.3107487],
    [-78.3133002,44.3109314],
  ],
  [
    [-78.3122899,44.3103038], [-78.3121678,44.3103038], [-78.3120679,44.3102006], [-78.3120679,44.3100337],
    [-78.3121789,44.3099305], [-78.3123232,44.3099781], [-78.3123566,44.3100893],
  ],
];

export function reviewedWaterHoles(featureId, sourcePolygon) {
  if (featureId !== 'lidar/61') return [];
  // A future hydrography refresh may already include one of these islands.
  return LONDON_STREET_ISLETS.filter(ring => !clipping.difference([[...ring, ring[0]]], sourcePolygon).length);
}

function shorelineCells(polygons, minX, minZ, step, segments) {
  const cells = new Set();
  const limits = (a, b, origin) => [
    Math.max(0, Math.floor((Math.min(a, b) - origin) / step)),
    Math.min(segments - 1, Math.floor((Math.max(a, b) - origin) / step)),
  ];
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let i = 1; i < ring.length; i += 1) {
        const [ax, az] = ring[i - 1];
        const [bx, bz] = ring[i];
        const [left, right] = limits(ax, bx, minX);
        const [top, bottom] = limits(az, bz, minZ);
        for (let row = top; row <= bottom; row += 1) {
          for (let col = left; col <= right; col += 1) cells.add(row * segments + col);
        }
      }
    }
  }
  return cells;
}

const BLOCK_SIZE = 8;

function polygonBounds(polygon) {
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const [x, z] of polygon[0]) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, z);
    bottom = Math.max(bottom, z);
  }
  return {left, right, top, bottom};
}

function overlaps(a, b) {
  return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;
}

function localShorelines(polygons, minX, minZ, step) {
  const sources = polygons.map(polygon => ({polygon, bounds: polygonBounds(polygon)}));
  const blocks = new Map();
  const size = BLOCK_SIZE * step;

  return (col, row) => {
    const bx = Math.floor(col / BLOCK_SIZE);
    const bz = Math.floor(row / BLOCK_SIZE);
    const key = `${bx}:${bz}`;
    if (!blocks.has(key)) {
      // Crop long rivers once per neighborhood so each terrain triangle
      // only clips against nearby banks. Padding keeps crop edges outside.
      const left = minX + bx * size - 1;
      const top = minZ + bz * size - 1;
      const right = left + size + 2;
      const bottom = top + size + 2;
      const bounds = {left, right, top, bottom};
      const rectangle = [[[left,top],[right,top],[right,bottom],[left,bottom],[left,top]]];
      const local = [];
      for (const source of sources) {
        if (!overlaps(bounds, source.bounds)) continue;
        if (source.polygon[0].length < 100) {
          local.push(source);
          continue;
        }
        for (const polygon of clipping.intersection(source.polygon, rectangle)) {
          local.push({polygon, bounds: polygonBounds(polygon)});
        }
      }
      blocks.set(key, local);
    }
    const left = minX + col * step;
    const top = minZ + row * step;
    const bounds = {left: left - 0.01, right: left + step + 0.01, top: top - 0.01, bottom: top + step + 0.01};
    return blocks.get(key).filter(source => overlaps(bounds, source.bounds)).map(source => source.polygon);
  };
}

export function clipTerrainToShorelines(THREE, geometry, segments, polygons, waterHeightAt) {
  if (!polygons.length) return geometry;
  const {position} = geometry.attributes;
  const step = (position.getX(segments) - position.getX(0)) / segments;
  const minX = position.getX(0);
  const minZ = position.getZ(0);
  const edges = shorelineCells(polygons, minX, minZ, step, segments);
  const getLocalShorelines = localShorelines(polygons, minX, minZ, step);
  const index = geometry.index.array;
  const indices = [];
  const extra = Object.fromEntries(Object.keys(geometry.attributes).map(name => [name, []]));
  const shorelineVertices = new Map();
  let vertexCount = position.count;

  for (let cell = 0; cell < segments * segments; cell += 1) {
    const col = cell % segments;
    const row = Math.floor(cell / segments);
    const nearby = edges.has(cell) ? getLocalShorelines(col, row) : null;
    if (!nearby && Number.isFinite(waterHeightAt(minX + (col + 0.5) * step, minZ + (row + 0.5) * step))) continue;
    for (let offset = cell * 6; offset < cell * 6 + 6; offset += 3) {
      const corners = [index[offset], index[offset + 1], index[offset + 2]];
      if (!nearby?.length) {
        indices.push(...corners);
        continue;
      }
      const points = corners.map(id => [position.getX(id), position.getZ(id)]);
      const dry = clipping.difference([[...points, points[0]]], ...nearby);
      const [[ax, az], [bx, bz], [cx, cz]] = points;
      const denominator = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);

      for (const polygon of dry) {
        const rings = polygon.map(ring => ring.slice(0, -1).map(([x,z]) => new THREE.Vector2(x,z)));
        const faces = THREE.ShapeUtils.triangulateShape(rings[0], rings.slice(1));
        const vertices = rings.flat().map(({x, y: z}) => {
          const existing = points.findIndex(([px,pz]) => px === x && pz === z);
          if (existing >= 0) return corners[existing];
          const key = Math.fround(x) + ':' + Math.fround(z);
          if (shorelineVertices.has(key)) return shorelineVertices.get(key);
          const a = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / denominator;
          const b = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / denominator;
          const c = 1 - a - b;
          for (const [name, attribute] of Object.entries(geometry.attributes)) {
            for (let component = 0; component < attribute.itemSize; component += 1) {
              const first = attribute.array[corners[0] * attribute.itemSize + component];
              const second = attribute.array[corners[1] * attribute.itemSize + component];
              const third = attribute.array[corners[2] * attribute.itemSize + component];
              extra[name].push(first * a + second * b + third * c);
            }
          }
          const waterY = waterHeightAt(x, z);
          const start = extra.position.length - 3;
          extra.position[start] = x;
          extra.position[start + 2] = z;
          if (Number.isFinite(waterY)) extra.position[start + 1] = Math.min(extra.position[start + 1], waterY - 0.045);
          shorelineVertices.set(key, vertexCount);
          return vertexCount++;
        });
        for (const [a, b, c] of faces) {
          const [first, second, third] = [vertices[a], vertices[c], vertices[b]];
          if (first !== second && second !== third && third !== first) indices.push(first, second, third);
        }
      }
    }
  }

  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(attribute.array.length + extra[name].length);
    values.set(attribute.array);
    values.set(extra[name], attribute.array.length);
    geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
  }
  geometry.setIndex(indices);
  return geometry;
}
