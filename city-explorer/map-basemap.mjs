import { MAP_VIEW_LIMITS, lonLatToWebMercatorTile, webMercatorTileVertices } from './map-view.mjs?v=1.6.192';

const EARTH_CIRCUMFERENCE = 40075016.68557849;
const MAX_CONCURRENT_REQUESTS = 6;
const MAX_CACHED_TEXTURES = 72;
const MAX_TILE_ATTEMPTS = 3;
const TILE_SEGMENTS = 16;
const TILE_LIFT = 1.5;

function commercialDeployment(deployment = {}) {
  const mode = String(deployment.mode || '').toLowerCase();
  return deployment.commercial === true || deployment.private === true || ['department', 'commercial', 'private'].includes(mode);
}

export function resolveMapTileSource(layer, { mapConfig = {}, deployment = {} } = {}) {
  const config = { ...(deployment.map || {}), ...mapConfig };
  const commercial = commercialDeployment(deployment);
  if (layer === 'osm') {
    if (commercial && !config.osmTileUrl) return { error: 'Configure a licensed street-map tile service before using map tiles in this deployment.' };
    return {
      template: String(config.osmTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
      attribution: String(config.osmAttribution || '© OpenStreetMap contributors'),
      attributionUrl: String(config.osmAttributionUrl || 'https://www.openstreetmap.org/copyright'),
      minZoom: 10,
      maxZoom: 19,
    };
  }
  if (layer === 'satellite') {
    if (config.arcgisAccessToken) return {
      template: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(config.arcgisAccessToken)}`,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      attributionUrl: 'https://www.esri.com/en-us/legal/terms/data-attributions', minZoom: 10, maxZoom: 19,
    };
    if (commercial) return { error: 'Configure an ArcGIS imagery access token before using satellite maps in this deployment.' };
    return {
      template: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      attributionUrl: 'https://www.esri.com/en-us/legal/terms/data-attributions', minZoom: 10, maxZoom: 19,
    };
  }
  return null;
}

function lonToTileX(lon, zoom) { return (lon + 180) / 360 * (2 ** zoom); }
function latToTileY(lat, zoom) { return lonLatToWebMercatorTile(lat, 0, zoom).y; }

export function planMapTiles({ centerX, centerZ, altitudeAGL, viewportWidth, viewportHeight, fovDegrees = 58, project, unproject }) {
  const width = Math.max(1, Number(viewportWidth) || 1);
  const height = Math.max(1, Number(viewportHeight) || 1);
  const altitude = Math.max(MAP_VIEW_LIMITS.minAltitudeAGL, Number(altitudeAGL) || MAP_VIEW_LIMITS.minAltitudeAGL);
  const halfHeight = altitude * Math.tan(Number(fovDegrees) * Math.PI / 360);
  const halfWidth = halfHeight * width / height;
  const northWest = unproject(Number(centerX) - halfWidth, Number(centerZ) - halfHeight);
  const southEast = unproject(Number(centerX) + halfWidth, Number(centerZ) + halfHeight);
  const centerGeo = unproject(Number(centerX), Number(centerZ));
  const metresPerPixel = Math.max(0.01, 2 * halfHeight / height);
  const latitude = Math.max(-85, Math.min(85, Number(centerGeo.lat)));
  const zoom = Math.max(MAP_VIEW_LIMITS.minTileZoom, Math.min(MAP_VIEW_LIMITS.maxTileZoom,
    Math.round(Math.log2((EARTH_CIRCUMFERENCE * Math.cos(latitude * Math.PI / 180)) / (256 * metresPerPixel)))));
  const n = 2 ** zoom;
  const minX = Math.max(0, Math.floor(lonToTileX(Math.min(northWest.lon, southEast.lon), zoom)));
  const maxX = Math.min(n - 1, Math.floor(lonToTileX(Math.max(northWest.lon, southEast.lon), zoom)));
  const minY = Math.max(0, Math.floor(latToTileY(Math.max(northWest.lat, southEast.lat), zoom)));
  const maxY = Math.min(n - 1, Math.floor(latToTileY(Math.min(northWest.lat, southEast.lat), zoom)));
  const tiles = [];
  for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) tiles.push({ z: zoom, x, y, key: `${zoom}/${x}/${y}` });
  return { zoom, tiles, centerGeo, bounds: { northWest, southEast }, halfWidth, halfHeight };
}

function tileUrl(template, tile) {
  return String(template).replaceAll('{z}', String(tile.z)).replaceAll('{x}', String(tile.x)).replaceAll('{y}', String(tile.y)).replaceAll('{s}', 'a');
}

function textureFromBitmap(THREE, bitmap) {
  const texture = new THREE.Texture(bitmap);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function mapTileGeometryData(tile, { project, surfaceAt = () => 0, segments = TILE_SEGMENTS } = {}) {
  const side = Math.max(1, Math.floor(segments));
  const vertices = webMercatorTileVertices(tile.x, tile.y, tile.z, project, { segments: side });
  const positions = new Float32Array(vertices.length * 3);
  const uvs = new Float32Array(vertices.length * 2);
  vertices.forEach((vertex, index) => {
    positions[index * 3] = vertex.x;
    positions[index * 3 + 1] = (Number(surfaceAt(vertex.x, vertex.z)) || 0) + TILE_LIFT;
    positions[index * 3 + 2] = vertex.z;
    uvs[index * 2] = vertex.u;
    uvs[index * 2 + 1] = vertex.v;
  });
  const indices = [];
  const stride = side + 1;
  for (let row = 0; row < side; row += 1) for (let column = 0; column < side; column += 1) {
    const nw = row * stride + column, ne = nw + 1, sw = nw + stride, se = sw + 1;
    indices.push(nw, sw, ne, ne, sw, se);
  }
  return { positions, uvs, indices, vertices };
}

function createTileMesh(THREE, tile, texture, project, surfaceAt) {
  const { positions, uvs, indices } = mapTileGeometryData(tile,{project,surfaceAt});
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, fog: false, transparent: true, opacity: 1, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1000000;
  mesh.userData.mapTile = tile.key;
  mesh.frustumCulled = true;
  return mesh;
}

export function createMapBasemap({ THREE, group, project, unproject, surfaceAt, mapConfig = {}, deployment = {}, fetchImpl = globalThis.fetch?.bind(globalThis), bitmapFactory = globalThis.createImageBitmap?.bind(globalThis), onState = () => {} }) {
  const textureCache = new Map();
  const meshes = new Map();
  const desired = new Map();
  const queue = [];
  const queued = new Set();
  const requests = new Map();
  const failed = new Set();
  const attempts = new Map();
  const retryAt = new Map();
  const status = { active: false, layer: '3d', zoom: null, requestCount: 0, error: '', attribution: '', attributionUrl: '', disposed: false };
  let planFingerprint = '';
  let retryTimer = null;

  function state() {
    return { ...status, loadedTileCount: meshes.size, activeRequests: requests.size, queuedRequests: queue.length, retryingCount: retryAt.size, cacheCount: textureCache.size };
  }
  function publish() { onState(state()); }
  function disposeMesh(key) {
    const mesh = meshes.get(key);
    if (!mesh) return;
    group.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    meshes.delete(key);
  }
  function attach(tile) {
    const key = `${status.layer}/${tile.key}`;
    if (meshes.has(key)) return;
    const cached = textureCache.get(key);
    if (!cached || !desired.has(key)) return;
    textureCache.delete(key); textureCache.set(key, cached);
    const mesh = createTileMesh(THREE, tile, cached.texture, project, surfaceAt);
    group.add(mesh);
    meshes.set(key, mesh);
  }
  function trimCache() {
    while (textureCache.size > MAX_CACHED_TEXTURES) {
      const removable = [...textureCache.keys()].find(key => !desired.has(key));
      if (!removable) break;
      const cached = textureCache.get(removable);
      cached.texture.dispose();
      cached.bitmap.close?.();
      textureCache.delete(removable);
    }
  }
  function scheduleRetry() {
    clearTimeout(retryTimer);
    retryTimer=null;
    let next=Infinity;
    for(const [key,time] of retryAt)if(desired.has(key))next=Math.min(next,time);
    if(!Number.isFinite(next)||status.disposed)return;
    retryTimer=setTimeout(()=>{
      retryTimer=null;
      const now=Date.now();
      for(const [key,time] of retryAt)if(time<=now&&desired.has(key)){
        retryAt.delete(key);
        const tile=desired.get(key);
        if(tile)enqueue(tile);
      }
      void pump();
      scheduleRetry();
    },Math.max(0,next-Date.now()));
  }
  function enqueue(tile) {
    const key = `${status.layer}/${tile.key}`;
    if (textureCache.has(key)) { attach(tile); return; }
    if (requests.has(key) || queued.has(key) || failed.has(key) || retryAt.has(key)) return;
    queue.push({ ...tile, cacheKey: key, layer: status.layer });
    queued.add(key);
  }
  async function pump() {
    if (status.disposed) return;
    while (requests.size < MAX_CONCURRENT_REQUESTS && queue.length) {
      const tile = queue.shift();
      queued.delete(tile.cacheKey);
      if (!desired.has(tile.cacheKey) || tile.layer !== status.layer) continue;
      const controller = new AbortController();
      const source = resolveMapTileSource(tile.layer, { mapConfig, deployment });
      requests.set(tile.cacheKey, controller);
      status.requestCount += 1;
      void (async () => {
        let bitmap;
        try {
          if (!fetchImpl || !bitmapFactory) throw new Error('Map imagery is unavailable in this browser.');
          const response = await fetchImpl(tileUrl(source.template, tile), { signal: controller.signal, mode: 'cors' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bitmap = await bitmapFactory(await response.blob(),{imageOrientation:'flipY'});
          if (status.disposed || controller.signal.aborted || !desired.has(tile.cacheKey)) { bitmap.close?.(); return; }
          const texture = textureFromBitmap(THREE, bitmap);
          textureCache.set(tile.cacheKey, { texture, bitmap });
          failed.delete(tile.cacheKey);
          attempts.delete(tile.cacheKey);
          retryAt.delete(tile.cacheKey);
          attach(tile);
          if (![...failed].some(key => desired.has(key)) && ![...retryAt.keys()].some(key=>desired.has(key))) status.error = '';
          trimCache();
        } catch (error) {
          bitmap?.close?.();
          if (error?.name !== 'AbortError' && !controller.signal.aborted) {
            const attempt=(attempts.get(tile.cacheKey)||0)+1;
            attempts.set(tile.cacheKey,attempt);
            if(attempt>=MAX_TILE_ATTEMPTS){failed.add(tile.cacheKey);status.error='Some map tiles did not load after three attempts. Check the connection or choose another layer.';}
            else {retryAt.set(tile.cacheKey,Date.now()+(attempt===1?1000:4000));status.error=`Map tiles are retrying (attempt ${attempt+1} of ${MAX_TILE_ATTEMPTS}).`;}
          }
        } finally {
          requests.delete(tile.cacheKey);
          if (desired.has(tile.cacheKey) && !textureCache.has(tile.cacheKey) && !failed.has(tile.cacheKey) && !retryAt.has(tile.cacheKey)) enqueue(tile);
          publish();
          scheduleRetry();
          void pump();
        }
      })();
    }
    publish();
  }
  function deactivate() {
    status.active = false;
    desired.clear(); queue.length = 0; queued.clear(); failed.clear();
    attempts.clear();retryAt.clear();clearTimeout(retryTimer);retryTimer=null;
    for (const controller of requests.values()) controller.abort();
    for (const key of [...meshes.keys()]) disposeMesh(key);
    status.zoom = null;
    status.error = '';
    planFingerprint = '';
    publish();
  }
  function update({ active, layer = status.layer, centerX = 0, centerZ = 0, altitudeAGL = 1000, viewportWidth = 1, viewportHeight = 1, fovDegrees = 58 }) {
    if (status.disposed) return state();
    if (status.layer !== layer) { failed.clear(); attempts.clear();retryAt.clear();clearTimeout(retryTimer);retryTimer=null;status.error = ''; planFingerprint = ''; }
    status.layer = layer;
    if (!active || layer === '3d') {
      if (status.active || desired.size || meshes.size) deactivate();
      else publish();
      return state();
    }
    status.active = true;
    const source = resolveMapTileSource(layer, { mapConfig, deployment });
    status.attribution = source?.attribution || '';
    status.attributionUrl = source?.attributionUrl || '';
    if (!source || source.error) {
      status.error = source?.error || 'Map imagery source is unavailable.';
      deactivate();
      status.layer = layer;
      status.error = source?.error || 'Map imagery source is unavailable.';
      status.attribution = '';
      publish();
      return state();
    }
    const plan = planMapTiles({ centerX, centerZ, altitudeAGL, viewportWidth, viewportHeight, fovDegrees, project, unproject });
    status.zoom = plan.zoom;
    const nextDesired = new Map(plan.tiles.map(tile => [`${layer}/${tile.key}`, tile]));
    const fingerprint=`${layer}/${plan.zoom}/${plan.tiles.map(tile=>tile.key).join(',')}`;
    if (fingerprint===planFingerprint) return state();
    planFingerprint=fingerprint;
    for(const key of [...failed])if(!nextDesired.has(key))failed.delete(key);
    for(const key of [...attempts.keys()])if(!nextDesired.has(key))attempts.delete(key);
    for(const key of [...retryAt.keys()])if(!nextDesired.has(key))retryAt.delete(key);
    const failedVisible=[...failed].some(key=>nextDesired.has(key));
    const retryingVisible=[...retryAt.keys()].some(key=>nextDesired.has(key));
    status.error = failedVisible ? 'Some map tiles did not load after three attempts. Check the connection or choose another layer.' : retryingVisible ? `Map tiles are retrying (attempt ${Math.min(MAX_TILE_ATTEMPTS,Math.max(...[...attempts.values(),1])+1)} of ${MAX_TILE_ATTEMPTS}).` : '';
    for (const key of [...meshes.keys()]) if (!nextDesired.has(key)) disposeMesh(key);
    for (const [key, controller] of requests) if (!nextDesired.has(key)) controller.abort();
    for (let index = queue.length - 1; index >= 0; index -= 1) if (!nextDesired.has(queue[index].cacheKey)) {
      queued.delete(queue[index].cacheKey); queue.splice(index, 1);
    }
    desired.clear(); for (const [key, tile] of nextDesired) desired.set(key, tile);
    for (const [key, tile] of desired) enqueue(tile);
    scheduleRetry();
    trimCache();
    void pump();
    return state();
  }
  function dispose() {
    if (status.disposed) return;
    deactivate(); status.disposed = true;
    for (const cached of textureCache.values()) { cached.texture.dispose(); cached.bitmap.close?.(); }
    textureCache.clear();
    publish();
  }
  return { update, state, dispose };
}
