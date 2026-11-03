'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const baseUrl = process.env.PARITY_QA_URL || 'http://127.0.0.1:4183';
const outputDir = process.env.PARITY_QA_OUT || path.join(root, 'artifacts/progressive-parity');
const quality = 'balanced';
const appSource = fs.readFileSync(path.join(root, 'city-explorer/app.js'), 'utf8');
const anchor = 'populateLandmarks();';
if (appSource.indexOf(anchor) < 0 || appSource.indexOf(anchor) !== appSource.lastIndexOf(anchor)) {
  throw new Error('Expected one populateLandmarks() instrumentation anchor in city-explorer/app.js');
}

const injection = String.raw`
globalThis.__BUILDING_PARITY_READY__ = () => {
  const root = document.documentElement;
  const sourceRecords = [...generatedRegistry.records.values()].filter(record =>
    record.sourceType === 'building' && record.sourceId === 'way/558402285');
  const sourceHidden = sourceRecords.every(record => record.object?.visible === false);
  return root.dataset.stationThreeModel === 'ready'
    && root.dataset.stationThreeReplacement !== undefined && sourceHidden;
};
globalThis.__BUILDING_PARITY__ = () => {
  const fnvBytes = bytes => {
    let hash = 0x811c9dc5;
    for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
    return (hash >>> 0).toString(16).padStart(8, '0');
  };
  const hashText = text => fnvBytes(new TextEncoder().encode(text));
  const rangeAttribute = (mesh, range, name) => {
    const attribute = mesh?.geometry?.getAttribute?.(name);
    if (!attribute?.array || !Number.isInteger(attribute.itemSize)) return { values: 0, bytes: 0, hash: null };
    const first = range.startVertex * attribute.itemSize;
    const valueCount = range.vertexCount * attribute.itemSize;
    const bytesPerValue = attribute.array.BYTES_PER_ELEMENT;
    const byteOffset = attribute.array.byteOffset + first * bytesPerValue;
    const byteLength = valueCount * bytesPerValue;
    const bytes = new Uint8Array(attribute.array.buffer, byteOffset, byteLength);
    return { values: valueCount, bytes: byteLength, hash: fnvBytes(bytes) };
  };
  const normalizeGeometry = geometry => (geometry || []).map(polygon =>
    (polygon || []).map(ring => (ring || []).map(point => point.map(value => Number(value))))
  ).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const records = [...generatedBuildingFeatures].map(([featureKey, feature]) => {
    const ranges = (feature.ranges || []).map(range => {
      const mesh = generatedBuildingMeshes.get(range.key);
      const attributes = Object.fromEntries(['position', 'color', 'uv', 'normal'].map(name =>
        [name, rangeAttribute(mesh, range, name)]));
      const material = String(mesh?.userData?.material ?? '(missing-material)');
      const descriptor = { material, vertexCount: range.vertexCount, attributes };
      descriptor.hash = hashText(JSON.stringify(descriptor));
      return descriptor;
    }).sort((a, b) => a.material.localeCompare(b.material)
      || a.hash.localeCompare(b.hash) || a.vertexCount - b.vertexCount);
    const sourceGeometry = normalizeGeometry(feature.sourceGeometry);
    const sourceGeometryText = JSON.stringify(sourceGeometry);
    const sourceId = feature.sourceId == null ? null : String(feature.sourceId);
    const id = feature.generatedId == null ? String(featureKey) : String(feature.generatedId);
    const signature = JSON.stringify({ sourceGeometryHash: hashText(sourceGeometryText),
      sourceGeometryBytes: new TextEncoder().encode(sourceGeometryText).byteLength, ranges });
    return { id, sourceId, sourceGeometry: { polygons: sourceGeometry.length,
      rings: sourceGeometry.reduce((sum, polygon) => sum + polygon.length, 0),
      vertices: sourceGeometry.reduce((sum, polygon) => sum + polygon.reduce((n, ring) => n + ring.length, 0), 0),
      bytes: new TextEncoder().encode(sourceGeometryText).byteLength, hash: hashText(sourceGeometryText) },
      rangeCount: ranges.length, vertexCount: ranges.reduce((sum, range) => sum + range.vertexCount, 0),
      ranges, hash: hashText(signature) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const aggregateText = records.map(record => record.id + '\t' + record.hash).join('\n');
  const metricSnapshot = __PTBO_CITY_QA__.metrics();
  const cityMetrics = {
    sourceBuildings: metricSnapshot.sourceBuildings,
    appearanceParts: metricSnapshot.visuals?.appearanceParts,
    appearancePanels: metricSnapshot.visuals?.appearancePanels,
    appearanceTiles: metricSnapshot.visuals?.appearanceTiles,
    presets: metricSnapshot.visuals?.presets,
    buildingRefinements: metricSnapshot.visuals?.buildingRefinements,
    cityBuildingFacades: metricSnapshot.cityBuildingFacades ? {
      mode: metricSnapshot.cityBuildingFacades.mode,
      consideredParts: metricSnapshot.cityBuildingFacades.consideredParts,
      eligibleParts: metricSnapshot.cityBuildingFacades.eligibleParts,
      coveredParts: metricSnapshot.cityBuildingFacades.coveredParts,
      excludedParts: metricSnapshot.cityBuildingFacades.excludedParts,
      uncoveredPartCount: metricSnapshot.cityBuildingFacades.uncoveredPartCount,
      consideredUniqueBuildings: metricSnapshot.cityBuildingFacades.consideredUniqueBuildings,
      coveredUniqueBuildings: metricSnapshot.cityBuildingFacades.coveredUniqueBuildings,
      wallFaces: metricSnapshot.cityBuildingFacades.wallFaces,
      openingQuads: metricSnapshot.cityBuildingFacades.openingQuads,
      existingRoofSurfaceParts: metricSnapshot.cityBuildingFacades.existingRoofSurfaceParts,
    } : null,
  };
  const facades = {
    facadeDetailQuads,
    appearance: { parts: cityAppearanceStats.parts, panels: cityAppearanceStats.panels,
      presets: { ...cityAppearanceStats.presets }, details: { ...cityAppearanceStats.details } },
    citywide: {
      consideredParts: cityBuildingFacadeDiagnostics.consideredParts,
      eligibleParts: cityBuildingFacadeDiagnostics.eligibleParts,
      coveredParts: cityBuildingFacadeDiagnostics.coveredParts,
      excludedParts: cityBuildingFacadeDiagnostics.excludedParts,
      wallFaces: cityBuildingFacadeDiagnostics.wallFaces,
      openings: cityBuildingFacadeDiagnostics.openings,
      existingRoofSurfaceParts: cityBuildingFacadeDiagnostics.existingRoofSurfaceParts,
      pendingParts: cityBuildingFacadeDiagnostics.pendingPartIds.size,
      consideredBuildings: cityBuildingFacadeDiagnostics.consideredIds.size,
      coveredBuildings: cityBuildingFacadeDiagnostics.coveredIds.size,
      exclusionReasons: Object.fromEntries([...cityBuildingFacadeDiagnostics.exclusionsByReason].sort(([a], [b]) => a.localeCompare(b))),
    },
    station2: { considered: station2FacadeDiagnostics.considered.size,
      covered: station2FacadeDiagnostics.wallCovered.size,
      wallFaces: station2FacadeDiagnostics.wallFaces,
      exclusions: station2FacadeDiagnostics.exclusions.size },
  };
  const rooftopUnits = verticalSliceDetails.rooftopUnits.map(unit => {
    const feature = generatedBuildingFeatures.get(unit.generatedFeatureKey);
    return { sourceId: feature?.sourceId == null ? null : String(feature.sourceId),
      x: unit.x, y: unit.y, z: unit.z, width: unit.width, depth: unit.depth,
      height: unit.height, yaw: unit.yaw };
  }).sort((a, b) => String(a.sourceId ?? '').localeCompare(String(b.sourceId ?? ''))
    || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const registryIds = [...generatedRegistry.records.values()].map(record => String(record.id)).sort();
  const uniqueRegistryIds = new Set(registryIds);
  const stationThreeRecords = [...generatedRegistry.records.values()].filter(record =>
    record.sourceType === 'building' && record.sourceId === 'way/558402285');
  return { records, aggregateHash: hashText(aggregateText), totalRanges: records.reduce((sum, record) => sum + record.rangeCount, 0),
    totalVertices: records.reduce((sum, record) => sum + record.vertexCount, 0),
    cityMetrics, facades, rooftopUnits,
    stationThree: { model: document.documentElement.dataset.stationThreeModel,
      replacement: document.documentElement.dataset.stationThreeReplacement ?? null,
      sourceRecords: stationThreeRecords.length,
      visibleSourceRecords: stationThreeRecords.filter(record => record.object?.visible !== false).length },
    registry: { count: registryIds.length, uniqueCount: uniqueRegistryIds.size,
      duplicateCount: registryIds.length - uniqueRegistryIds.size, hash: hashText(registryIds.join('\n')),
      ids: registryIds } };
};
`;
const instrumentedSource = appSource.replace(anchor, `${injection}\n${anchor}`);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText(text) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) { hash ^= byte; hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function compareRecords(progressive, baseline) {
  const progressiveById = new Map(progressive.map(record => [record.id, record]));
  const baselineById = new Map(baseline.map(record => [record.id, record]));
  const missingFromProgressive = [...baselineById.keys()].filter(id => !progressiveById.has(id)).sort();
  const missingFromBaseline = [...progressiveById.keys()].filter(id => !baselineById.has(id)).sort();
  const changed = [];
  for (const [id, record] of progressiveById) {
    const other = baselineById.get(id);
    if (other && stableJson(record) !== stableJson(other)) changed.push(id);
  }
  changed.sort();
  const sourceIds = new Set();
  for (const id of [...missingFromProgressive, ...missingFromBaseline, ...changed]) {
    const record = progressiveById.get(id) || baselineById.get(id);
    sourceIds.add(record?.sourceId ?? id);
  }
  return { missingFromProgressive, missingFromBaseline, changed,
    differingSourceIds: [...sourceIds].sort() };
}

async function runMode(browser, mode) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/city-explorer/app.js*', route => route.fulfill({
    status: 200, contentType: 'application/javascript', body: instrumentedSource,
  }));
  const query = new URLSearchParams({ station: '2', qa: '1', quality });
  if (mode === 'progressive-0') query.set('progressive', '0');
  const started = Date.now();
  try {
    await page.goto(`${baseUrl}/city-explorer/?${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__PTBO_EXPLORER_BOOTSTRAP__?.failed
      || document.documentElement.dataset.cityFullReady === 'true', null, { timeout: 600000 });
    const failure = await page.evaluate(() => window.__PTBO_EXPLORER_BOOTSTRAP__?.failed
      ? document.querySelector('#loading-screen')?.innerText || 'bootstrap failed' : null);
    if (failure) throw new Error(`${mode} bootstrap failed: ${failure}`);
    await page.waitForFunction(() => globalThis.__BUILDING_PARITY_READY__?.(), null, { timeout: 120000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fullReadyMs = Date.now() - started;
    const result = await page.evaluate(() => globalThis.__BUILDING_PARITY__?.());
    if (!result) throw new Error(`${mode} missing __BUILDING_PARITY__ instrumentation`);
    result.mode = mode;
    result.url = page.url();
    result.fullReadyMs = fullReadyMs;
    result.fingerprintElapsedMs = Date.now() - started - fullReadyMs;
    result.pageErrors = pageErrors;
    return result;
  } finally {
    await context.close();
  }
}

function registryDiff(progressive, baseline) {
  const a = new Set(progressive.registry.ids), b = new Set(baseline.registry.ids);
  return {
    missingFromProgressive: [...b].filter(id => !a.has(id)).sort(),
    missingFromBaseline: [...a].filter(id => !b.has(id)).sort(),
    progressiveDuplicates: progressive.registry.duplicateCount,
    baselineDuplicates: baseline.registry.duplicateCount,
  };
}

function compareRooftopUnits(progressive, baseline) {
  const bySourceId = list => {
    const map = new Map();
    for (const unit of list) {
      const sourceId = unit.sourceId ?? '(unknown)';
      if (!map.has(sourceId)) map.set(sourceId, []);
      map.get(sourceId).push(unit);
    }
    for (const units of map.values()) units.sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    return map;
  };
  const a = bySourceId(progressive), b = bySourceId(baseline);
  const sourceIds = new Set([...a.keys(), ...b.keys()]);
  const differing = [...sourceIds].filter(id => stableJson(a.get(id) || []) !== stableJson(b.get(id) || [])).sort();
  const progressiveText = stableJson(progressive), baselineText = stableJson(baseline);
  return { equal: !differing.length, differingSourceIds: differing,
    progressiveHash: hashText(progressiveText), baselineHash: hashText(baselineText) };
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    args: process.platform === 'win32' ? ['--use-angle=d3d11'] : [] });
  try {
    const progressive = await runMode(browser, 'progressive-default');
    const baseline = await runMode(browser, 'progressive-0');
    fs.writeFileSync(path.join(outputDir, 'progressive-default-fingerprints.json'), JSON.stringify(progressive));
    fs.writeFileSync(path.join(outputDir, 'progressive-0-fingerprints.json'), JSON.stringify(baseline));

    const records = compareRecords(progressive.records, baseline.records);
    const registry = registryDiff(progressive, baseline);
    const rooftopUnits = compareRooftopUnits(progressive.rooftopUnits, baseline.rooftopUnits);
    const mismatches = {
      records,
      cityMetrics: stableJson(progressive.cityMetrics) === stableJson(baseline.cityMetrics) ? null : {
        progressive: progressive.cityMetrics, baseline: baseline.cityMetrics,
      },
      facades: stableJson(progressive.facades) === stableJson(baseline.facades) ? null : {
        progressive: progressive.facades, baseline: baseline.facades,
      },
      rooftopUnits: rooftopUnits.equal ? null : {
        progressiveCount: progressive.rooftopUnits.length, baselineCount: baseline.rooftopUnits.length,
        progressiveHash: rooftopUnits.progressiveHash, baselineHash: rooftopUnits.baselineHash,
        differingSourceIds: rooftopUnits.differingSourceIds,
      },
      registry,
      pageErrors: { progressive: progressive.pageErrors, baseline: baseline.pageErrors },
    };
    const changed = records.missingFromProgressive.length || records.missingFromBaseline.length || records.changed.length
      || mismatches.cityMetrics || mismatches.facades
      || !rooftopUnits.equal
      || registry.missingFromProgressive.length || registry.missingFromBaseline.length
      || registry.progressiveDuplicates || registry.baselineDuplicates
      || progressive.pageErrors.length || baseline.pageErrors.length;
    const summary = {
      ok: !changed,
      quality,
      checkedAt: new Date().toISOString(),
      modes: Object.fromEntries([progressive, baseline].map(result => [result.mode, {
        fullReadyMs: result.fullReadyMs, sourceBuildings: result.records.length,
        aggregateHash: result.aggregateHash, ranges: result.totalRanges, vertices: result.totalVertices,
        facadeDetailQuads: result.facades.facadeDetailQuads,
        rooftopUnits: result.rooftopUnits.length,
        registryIds: result.registry.count, uniqueRegistryIds: result.registry.uniqueCount,
        duplicateRegistryIds: result.registry.duplicateCount, pageErrors: result.pageErrors.length,
        stationThree: result.stationThree,
      }])),
      mismatchCounts: {
        missingFromProgressive: records.missingFromProgressive.length,
        missingFromBaseline: records.missingFromBaseline.length,
        changedRecords: records.changed.length,
        differingSourceIds: records.differingSourceIds.length,
        cityMetrics: Boolean(mismatches.cityMetrics), facades: Boolean(mismatches.facades),
        rooftopUnits: !rooftopUnits.equal,
        registryMissingFromProgressive: registry.missingFromProgressive.length,
        registryMissingFromBaseline: registry.missingFromBaseline.length,
        registryDuplicates: registry.progressiveDuplicates + registry.baselineDuplicates,
      },
      differingSourceIds: records.differingSourceIds,
      rooftopDifferingSourceIds: rooftopUnits.differingSourceIds,
      registryDifferences: { missingFromProgressive: registry.missingFromProgressive,
        missingFromBaseline: registry.missingFromBaseline,
        progressiveDuplicates: registry.progressiveDuplicates, baselineDuplicates: registry.baselineDuplicates },
      differingPageErrors: mismatches.pageErrors,
      artifacts: ['progressive-default-fingerprints.json', 'progressive-0-fingerprints.json'],
    };
    fs.writeFileSync(path.join(outputDir, 'parity-summary.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    if (changed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
