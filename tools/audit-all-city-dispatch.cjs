#!/usr/bin/env node
'use strict';

// Read-only inventory of the canonical city packages; no graph building or data edits.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const outputPath = path.join(repoRoot, 'artifacts', 'release-qa', 'all-city-dispatch', 'inventory.json');
const services = ['fire', 'ems'];

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function loadRegistry() {
  const registryPath = path.join(repoRoot, 'cities', 'city-registry.js');
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(registryPath, 'utf8'), context, { filename: registryPath });
  return context.window.PTBO_CITIES || [];
}

function capturePackage(cityId, packagePath) {
  if (!fs.existsSync(packagePath)) return null;
  const sourceUrl = `https://inventory.invalid/cities/${cityId}/package.js`;
  let captured = null;
  const window = {
    PTBO_PREVIEW_CITY_FACTORY: {
      version: (fs.readFileSync(packagePath, 'utf8').match(/const VERSION\s*=\s*['"]([^'"]+)/) || [])[1],
      create(config) { captured = config; },
    },
    dispatchEvent() {},
  };
  const document = {
    currentScript: { src: sourceUrl },
    documentElement: { dataset: {} },
  };
  const context = {
    window, document,
    location: { href: sourceUrl },
    URL, CustomEvent: function CustomEvent() {},
    console,
  };
  try {
    vm.runInNewContext(fs.readFileSync(packagePath, 'utf8'), context, { filename: packagePath });
    if (window.PTBO_CITY_PACKAGE) {
      captured = {
        id: window.PTBO_CITY_PACKAGE.id,
        features: window.PTBO_CITY_PACKAGE.features,
        roads: window.PTBO_CITY_PACKAGE.roads,
        serviceConfig: window.PTBO_SERVICE_CONFIG,
      };
    }
  } catch (error) {
    return { parseError: error.message };
  }
  return captured;
}

function addRoadReference(ref, baseDir, refs) {
  if (typeof ref !== 'string' || !ref.trim()) return;
  if (/^https?:\/\//i.test(ref)) {
    refs.push({ reference: ref, local: false, exists: null });
    return;
  }
  const resolved = path.resolve(baseDir, ref);
  const relative = path.relative(repoRoot, resolved);
  const withinRepo = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  refs.push({ reference: ref, local: true, repoPath: withinRepo ? relative.split(path.sep).join('/') : null,
    exists: withinRepo && fs.existsSync(resolved), withinRepo });
}

function validCoordinates(row) {
  return Number.isFinite(row?.lat) && Number.isFinite(row?.lng)
    && Math.abs(row.lat) <= 85 && Math.abs(row.lng) <= 180;
}

function canonicalBases(geo, packageInfo) {
  if (Array.isArray(geo?.bases)) return { rows: geo.bases, source: 'geo-data.json' };
  const profiles = packageInfo?.serviceConfig?.profiles;
  if (profiles) {
    const rows = services.flatMap(service => (profiles[service]?.bases || []).map(row => ({ ...row, service,
      status: 'active', selectionEligible: true })));
    if (rows.length) return { rows, source: 'package.js serviceConfig' };
  }
  const config = packageInfo;
  const rows = services.flatMap(service => {
    const source = config?.sources?.[service];
    const entries = source?.type === 'static' ? source.entries : source?.fallback;
    return (Array.isArray(entries) ? entries : []).map(row => ({ ...row, service,
      status: 'active', selectionEligible: true }));
  });
  return { rows, source: rows.length ? 'package.js source fallback' : null };
}

function recordCollections(geo, training) {
  const collections = [];
  if (Array.isArray(geo?.locations)) collections.push(['geo-data.locations', geo.locations]);
  if (Array.isArray(training?.sharedLocations)) collections.push(['training-data.sharedLocations', training.sharedLocations]);
  if (Array.isArray(training?.routeCalls)) collections.push(['training-data.routeCalls', training.routeCalls]);
  return collections;
}

function hospitalCandidates(geo, training, packageSettings) {
  const byId = new Map();
  const excludedNonHuman = [];
  for (const [source, rows] of recordCollections(geo, training)) {
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const name = String(row.name || row.title || '');
      const facilityType = String(row.facilityType || row.category || row.occupancy || '');
      const veterinaryMatch = /\b(veterinary|vet|animal hospital)\b/i.test(`${name} ${facilityType}`);
      const nameMatch = /\bhospital\b/i.test(name);
      const categoryMatch = /^(hospital|acute-care-hospital)$/i.test(facilityType.trim());
      if (veterinaryMatch) {
        if (!excludedNonHuman.some(item => item.id === (row.id || null) && item.name === name)) {
          excludedNonHuman.push({ id: row.id || null, name: name || null,
            facilityType: facilityType || null, reason: 'veterinary or animal facility; excluded from human hospital candidates' });
        }
        continue;
      }
      if (!nameMatch && !categoryMatch) continue;
      const canonicalId = row.canonicalCallId || row.id || null;
      const key = canonicalId || `${name}|${row.addr || row.address || ''}|${row.lat}|${row.lng}`;
      const candidate = byId.get(key) || {
        id: canonicalId, name: name || null, address: row.addr || row.address || null,
        facilityType: facilityType || null, lat: Number.isFinite(row.lat) ? row.lat : null,
        lng: Number.isFinite(row.lng) ? row.lng : null, candidateReasons: [], recordSources: [],
        hasFiniteCoordinates: validCoordinates(row), emergencyDepartmentVerified: false,
        verification: 'Canonical name/category candidate only; emergency department and transport suitability are not verified.',
      };
      if (nameMatch && !candidate.candidateReasons.includes('canonical-name-contains-hospital')) candidate.candidateReasons.push('canonical-name-contains-hospital');
      if (categoryMatch && !candidate.candidateReasons.includes('explicit-hospital-category')) candidate.candidateReasons.push('explicit-hospital-category');
      const sourceRecordId = row.id || null;
      if (!candidate.recordSources.some(item => item.source === source && item.recordId === sourceRecordId)) candidate.recordSources.push({ source, recordId: sourceRecordId });
      byId.set(key, candidate);
    }
  }
  const configuredHospital = packageSettings?.serviceConfig?.hospital;
  if (configuredHospital && typeof configuredHospital === 'object') {
    const key = configuredHospital.id || `${configuredHospital.name || ''}|${configuredHospital.addr || ''}|${configuredHospital.lat}|${configuredHospital.lng}`;
    const candidate = byId.get(key) || {
      id: configuredHospital.id || null, name: configuredHospital.name || null,
      address: configuredHospital.addr || configuredHospital.address || null,
      facilityType: configuredHospital.facilityType || 'hospital',
      lat: Number.isFinite(configuredHospital.lat) ? configuredHospital.lat : null,
      lng: Number.isFinite(configuredHospital.lng) ? configuredHospital.lng : null,
      candidateReasons: [], recordSources: [], hasFiniteCoordinates: validCoordinates(configuredHospital),
      emergencyDepartmentVerified: false,
      verification: 'Configured package destination; emergency department and transport suitability are not verified by this inventory.',
    };
    if (!candidate.candidateReasons.includes('configured-package-hospital-target')) candidate.candidateReasons.push('configured-package-hospital-target');
    if (!candidate.recordSources.some(item => item.source === 'package.js serviceConfig.hospital')) candidate.recordSources.push({ source: 'package.js serviceConfig.hospital', recordId: configuredHospital.id || null });
    byId.set(key, candidate);
  }
  return {
    candidates: [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id))),
    excludedNonHuman: excludedNonHuman.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id))),
  };
}

function summarizeCity(registryCity) {
  const id = registryCity.id;
  const cityDir = path.join(repoRoot, 'cities', id);
  const manifestPath = path.join(cityDir, 'city.json');
  const trainingPath = path.join(cityDir, 'training-data.json');
  const geoPath = path.join(cityDir, 'geo-data.json');
  const manifest = readJson(manifestPath);
  const training = readJson(trainingPath);
  const geo = readJson(geoPath);
  const packageInfo = capturePackage(id, path.join(cityDir, 'package.js'));
  const packageError = packageInfo?.parseError || null;
  const packageSettings = packageError ? null : packageInfo;

  const roads = [];
  addRoadReference(manifest?.data?.roads, cityDir, roads);
  // Training descriptors store roadsUrl repo-relative; manifest roads are city-relative.
  addRoadReference(training?.roadsUrl, repoRoot, roads);
  addRoadReference(`cities/${id}/roads.geojson.gz`, repoRoot, roads);
  if (packageSettings?.roads?.sourceAsset) addRoadReference(packageSettings.roads.sourceAsset, repoRoot, roads);
  else if (packageSettings?.roads?.dataUrl) addRoadReference(packageSettings.roads.dataUrl, cityDir, roads);
  const uniqueRoads = [...new Map(roads.map(row => [row.reference, row])).values()];

  const baseSource = canonicalBases(geo, packageSettings);
  const activeBases = baseSource.rows.filter(row => row.status === 'active' && row.selectionEligible === true && validCoordinates(row));
  const basesByService = Object.fromEntries(services.map(service => {
    const rows = activeBases.filter(row => row.service === service);
    const fitted = rows.filter(row => {
      const area = row.drivingArea || row;
      return Number.isFinite(area.yardWidth) && area.yardWidth > 0
        && Number.isFinite(area.yardLength) && area.yardLength > 0
        && Number.isFinite(area.yardRotation)
        && Number.isFinite(area.spawnLat ?? row.spawnLat)
        && Number.isFinite(area.spawnLng ?? row.spawnLng);
    });
    return [service, { activeEligible: rows.length, withFittedDrivingArea: fitted.length,
      baseIds: rows.map(row => row.id || null), missingDrivingAreaIds: rows.filter(row => !fitted.includes(row)).map(row => row.id || null) }];
  }));

  const routeCalls = Array.isArray(training?.routeCalls) ? training.routeCalls : [];
  const routeResponses = training?.routeResponses?.bases || [];
  const routeCallsById = new Map(routeCalls.map(row => [row.id, row]));
  const responseByService = Object.fromEntries(services.map(service => {
    const rows = routeResponses.filter(row => row.service === service);
    const refs = rows.flatMap(row => Array.isArray(row.callIds) ? row.callIds.map(callId => ({ baseId: row.baseId || null, callId })) : []);
    return [service, {
      baseAssignments: rows.length,
      assignedCallRefs: refs.length,
      distinctAssignedCallIds: new Set(refs.map(row => row.callId)).size,
      routeCallsByService: routeCalls.filter(row => Array.isArray(row.trainingServices) && row.trainingServices.includes(service)).length,
      assignmentsWithoutRouteCall: refs.filter(row => !routeCallsById.has(row.callId)),
      assignmentsWithoutBaseId: rows.filter(row => !(row.baseId || row.id)).length,
      assignmentBaseIds: rows.map(row => row.baseId || row.id || null),
      assignmentsByBase: rows.map(row => ({ baseId: row.baseId || row.id || null,
        callCount: Array.isArray(row.callIds) ? row.callIds.length : 0 })),
    }];
  }));

  const packageFeatures = packageSettings?.features || null;
  const manifestFeatures = manifest?.features || null;
  const routeLocations = Array.isArray(training?.routeCalls) ? training.routeCalls.length : 0;
  const sharedLocations = Array.isArray(training?.sharedLocations) ? training.sharedLocations.length : 0;
  const canonicalLocations = Array.isArray(geo?.locations) ? geo.locations.length : 0;
  const hospitalAudit = hospitalCandidates(geo, training, packageSettings);
  const candidateHospitals = hospitalAudit.candidates;
  const hospitalReference = packageSettings?.hospitalLocationId || null;
  const hospitalSite = packageSettings?.hospitalSite;
  const sourcedHospitalSite = hospitalSite?.id && hospitalSite?.sourceUrl && validCoordinates(hospitalSite) ? hospitalSite : null;
  const expectedDispatch = registryCity.modes?.dispatch === true;
  const enabledDispatch = manifestFeatures?.dispatch === true || packageFeatures?.dispatch === true;
  const missingData = [];
  const readinessGaps = [];
  if (!manifest) missingData.push('city.json missing');
  if (!packageSettings) missingData.push(packageError ? `package.js parse failed: ${packageError}` : 'package.js missing or no package settings');
  if (!geo && !packageSettings?.serviceConfig?.profiles) missingData.push('geo-data.json missing and package has no canonical base roster');
  if (!training) missingData.push('training-data.json missing');
  if (!uniqueRoads.some(row => row.exists === true)) missingData.push('no referenced local road asset exists');
  for (const service of services) {
    if (basesByService[service].activeEligible === 0) missingData.push(`no active eligible ${service.toUpperCase()} bases`);
    if (responseByService[service].baseAssignments === 0) missingData.push(`no ${service.toUpperCase()} route-response base assignments`);
  }
  if (enabledDispatch && !routeLocations) missingData.push('dispatch enabled but routeCalls empty');
  if ((manifestFeatures?.hospitalTransport || packageFeatures?.hospitalTransport) && !candidateHospitals.length && !hospitalReference && !sourcedHospitalSite) missingData.push('hospital transport enabled without canonical hospital candidate/reference');
  if (!enabledDispatch) readinessGaps.push('dispatch capability is not enabled by the manifest or package');
  if (!(manifestFeatures?.routeGuidance === true || packageFeatures?.routeGuidance === true || packageSettings?.routeGuidance === true)) readinessGaps.push('route guidance is not enabled');
  if (!(manifestFeatures?.hospitalTransport === true || packageFeatures?.hospitalTransport === true || packageSettings?.hospitalLocationId)) readinessGaps.push('hospital transport is not enabled');
  if (basesByService.fire.missingDrivingAreaIds.length || basesByService.ems.missingDrivingAreaIds.length) readinessGaps.push('some active eligible bases lack fitted driving areas');
  if (!candidateHospitals.length && !hospitalReference && !sourcedHospitalSite) readinessGaps.push('no canonical hospital candidate or sourced destination configured');

  return {
    id, name: registryCity.name,
    registry: { status: registryCity.status || null, playable: registryCity.playable === true,
      modes: registryCity.modes || null, dispatchUrl: registryCity.dispatch || null },
    capabilities: {
      manifestStatus: manifest?.status || null,
      manifestFeatures,
      packageFeatures,
      packageSettings: packageSettings ? {
        canonicalRoster: packageSettings.canonicalRoster === true,
        sceneResponseDrills: packageSettings.sceneResponseDrills === true,
        routeGuidance: packageSettings.routeGuidance === true,
        hospitalLocationId: hospitalReference,
        hospitalSite: sourcedHospitalSite,
        roadSource: packageSettings.roads?.sourceAsset || packageSettings.roads?.dataUrl || null,
      } : null,
      registryDispatchMode: expectedDispatch,
      manifestDispatch: manifestFeatures?.dispatch === true,
      packageDispatch: packageFeatures?.dispatch === true || packageSettings?.sceneResponseDrills === true,
    },
    dataFiles: {
      manifest: fs.existsSync(manifestPath), geoData: fs.existsSync(geoPath), trainingData: fs.existsSync(trainingPath),
      package: fs.existsSync(path.join(cityDir, 'package.js')),
      dispatchDescriptor: fs.existsSync(path.join(cityDir, 'dispatch-data.js')),
    },
    roads: { references: uniqueRoads, existingLocalAsset: uniqueRoads.some(row => row.exists === true),
      sourceFeatureCount: training?.roadFeatureCount ?? null, sourceDigest: training?.roadDataSha256 ?? null },
    bases: { source: baseSource.source, activeEligibleTotal: activeBases.length, byService: basesByService,
      ineligibleSourceRecords: baseSource.rows.filter(row => !(row.status === 'active' && row.selectionEligible === true && validCoordinates(row))).length },
    calls: {
      canonicalGeoLocations: canonicalLocations, sharedRecognitionLocations: sharedLocations,
      careHomeRecords: Array.isArray(training?.careHomes) ? training.careHomes.length : 0,
      routeCalls: routeLocations, routeCallsByService: Object.fromEntries(services.map(service => [service,
        routeCalls.filter(row => Array.isArray(row.trainingServices) && row.trainingServices.includes(service)).length])),
      responseAssignmentsByService: responseByService,
      hospitalCandidates: candidateHospitals,
      configuredSourcedHospital: sourcedHospitalSite,
      excludedNonHumanHospitalLikeRecords: hospitalAudit.excludedNonHuman,
    },
    missingData,
    readinessGaps,
  };
}

function main() {
  const cities = loadRegistry().map(summarizeCity);
  const summary = {
    registryCities: cities.length,
    citiesWithManifestDispatch: cities.filter(city => city.capabilities.manifestDispatch).length,
    citiesWithPackageDispatch: cities.filter(city => city.capabilities.packageDispatch).length,
    citiesWithRouteGuidance: cities.filter(city => city.capabilities.manifestFeatures?.routeGuidance === true
      || city.capabilities.packageFeatures?.routeGuidance === true || city.capabilities.packageSettings?.routeGuidance === true).length,
    citiesWithHospitalTransport: cities.filter(city => city.capabilities.manifestFeatures?.hospitalTransport === true
      || city.capabilities.packageFeatures?.hospitalTransport === true || Boolean(city.capabilities.packageSettings?.hospitalLocationId)).length,
    citiesWithRoadAssets: cities.filter(city => city.roads.existingLocalAsset).length,
    citiesWithHospitals: cities.filter(city => city.calls.hospitalCandidates.length > 0).length,
    citiesWithConfiguredSourcedHospital: cities.filter(city => city.calls.configuredSourcedHospital).length,
    potentialHospitalCandidateRecords: cities.reduce((total, city) => total + city.calls.hospitalCandidates.length, 0),
    verifiedEmergencyDepartments: 0,
    citiesMissingAnyDispatchInput: cities.filter(city => city.missingData.length > 0).length,
    missingBaseCounts: Object.fromEntries(services.map(service => [service,
      cities.filter(city => city.bases.byService[service].activeEligible === 0).map(city => city.id)])),
    noHospitalCandidate: cities.filter(city => city.calls.hospitalCandidates.length === 0).map(city => city.id),
    activeEligibleBaseTotals: Object.fromEntries(services.map(service => [service,
      cities.reduce((total, city) => total + city.bases.byService[service].activeEligible, 0)])),
    fittedDrivingAreaTotals: Object.fromEntries(services.map(service => [service,
      cities.reduce((total, city) => total + city.bases.byService[service].withFittedDrivingArea, 0)])),
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 1, source: 'cities/city-registry.js and canonical city package files', summary, cities }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ output: path.relative(repoRoot, outputPath).split(path.sep).join('/'), summary }, null, 2)}\n`);
}

main();
