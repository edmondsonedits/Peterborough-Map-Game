/* Capture each base on an independent local satellite map for yard fitting.
 * Usage: node tools/fit-city-base-areas.cjs ajax [port] [output-directory]
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const city = process.argv[2] || 'ajax';
const port = Number(process.argv[3] || 4224);
const output = path.resolve(process.argv[4] || `artifacts/release-qa/base-fit-${city}`);
const root = path.resolve(__dirname, '..');
const geo = JSON.parse(fs.readFileSync(path.join(root, 'cities', city, 'geo-data.json'), 'utf8'));
for (const base of geo.bases.filter((item) => item.status === 'active' && item.drivingArea)) {
  const area = base.drivingArea;
  const validCoordinate = (value) => Number.isFinite(Number(value));
  if (![area.lat, area.lng, area.spawnLat, area.spawnLng, area.yardWidth, area.yardLength, area.yardRotation].every(validCoordinate)
    || area.yardWidth < 10 || area.yardWidth > 600 || area.yardLength < 10 || area.yardLength > 600
    || area.yardRotation < 0 || area.yardRotation > 359) {
    throw new Error(`${base.id}: invalid drivingArea; dimensions must be 10-600 m and rotation 0-359 degrees`);
  }
}
const roadPath = path.join(root, 'cities', city, 'roads.geojson.gz');
const roads = JSON.parse(zlib.gunzipSync(fs.readFileSync(roadPath)));
const toXY = ([lng, lat], origin) => [
  (lng - origin.lng) * 111320 * Math.cos(origin.lat * Math.PI / 180),
  (lat - origin.lat) * 111320,
];
const roadFeaturesFor = (base) => roads.features.filter((feature) => {
  const geometry = feature.geometry;
  const lines = geometry?.type === 'LineString' ? [geometry.coordinates]
    : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];
  return lines.some((line) => line.some((coord) => {
    const [x, y] = toXY(coord, base);
    return Math.abs(x) < 260 && Math.abs(y) < 260;
  }));
});

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = spawn(process.execPath, ['tools/serve-preview.cjs', String(port)], { cwd: root, stdio: 'ignore', windowsHide: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1120, height: 860 }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/response-simulator/?city=${encodeURIComponent(city)}`);
    await page.waitForFunction(() => window.PTBO_BASE_STORE?.getAll().length > 0);
    await page.evaluate(() => {
      document.querySelectorAll('dialog').forEach((dialog) => dialog.close());
      document.querySelectorAll('[class*=modal],[id*=service-choice]').forEach((node) => node.remove());
      const node = document.createElement('div');
      node.id = 'base-fit-map';
      Object.assign(node.style, { position: 'fixed', inset: '0', zIndex: 999999 });
      document.body.append(node);
      window.baseFitMap = L.map(node, { zoomControl: false }).setView([43.85, -79.03], 19);
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 20 }).addTo(window.baseFitMap);
    });
    const bases = geo.bases;
    const reviewed = [];
    for (const base of bases.filter((item) => item.status === 'active')) {
      const localRoads = roadFeaturesFor(base);
      await page.evaluate(({ base, localRoads }) => {
        window.baseFitOverlay?.clearLayers();
        if (!window.baseFitOverlay) window.baseFitOverlay = L.featureGroup().addTo(window.baseFitMap);
        window.baseFitMap.setView([base.lat, base.lng], 19, { animate: false });
        for (const feature of localRoads) {
          L.geoJSON(feature, { style: { color: '#ff4b21', weight: 3, opacity: 0.85 } }).addTo(window.baseFitOverlay);
        }
        L.circleMarker([base.lat, base.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#164dff', fillOpacity: 0.9 }).addTo(window.baseFitOverlay).bindTooltip(`${base.id} · source point`, { permanent: true, direction: 'top' });
      }, { base, localRoads });
      await page.waitForTimeout(2200);
      const screenshot = path.join(output, `${base.id}.png`);
      await page.screenshot({ path: screenshot });
      reviewed.push({ id: base.id, address: base.address, sourcePoint: { lat: base.lat, lng: base.lng }, metresPerPixel: await page.evaluate(() => window.baseFitMap.distance(window.baseFitMap.containerPointToLatLng([100, 430]), window.baseFitMap.containerPointToLatLng([200, 430])) / 100), nearbyRoads: localRoads.map((feature) => feature.properties).filter(Boolean), screenshot });
    }
    fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify({ city, imagery: 'Esri World Imagery tile service', roads: 'city roads.geojson.gz supplied with checkout', capturedAt: new Date().toISOString(), bases: reviewed }, null, 2));
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
