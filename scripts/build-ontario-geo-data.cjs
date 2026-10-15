#!/usr/bin/env node
'use strict';

// Build static, city-scoped Geo data from the reviewed research package.
// Usage: node scripts/build-ontario-geo-data.cjs /path/to/package/cities
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const legacyCityIds = ['oshawa','pickering','markham','toronto'];

async function loadLegacyBases(cityId) {
  if (!legacyCityIds.includes(cityId)) return [];
  const root = path.resolve(__dirname,'..');
  let fetchCount = 0;
  const context = vm.createContext({
    console,URL,AbortController,setTimeout,clearTimeout,
    CustomEvent:class { constructor(type,options) { this.type=type; this.detail=options?.detail; } },
    location:{href:`https://example.invalid/cities/${cityId}/package.js`},
    document:{currentScript:{src:`https://example.invalid/cities/${cityId}/package.js`},readyState:'complete',
      documentElement:{dataset:{}},createElement:() => ({dataset:{}}),head:{appendChild(){}}},
    dispatchEvent(){},fetch:async () => { fetchCount++; throw new Error('Legacy ID extraction forbids live fetch'); },
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root,'cities/preview-package-factory.js'),'utf8'),context,{timeout:1000});
  vm.runInContext(fs.readFileSync(path.join(root,'cities',cityId,'package.js'),'utf8'),context,{timeout:1000});
  await context.PTBO_CITY_PACKAGE_READY;
  if (fetchCount) throw new Error(`${cityId}: legacy IDs must come only from packaged fallback data`);
  return ['fire','ems'].flatMap(service => Array.from(context.PTBO_SERVICE_CONFIG.profiles[service].bases,base => ({...base,service})));
}

function compactCityPack(source,legacyBases = []) {
  const bounds = source.map.bounds;
  const [[south,west],[north,east]] = bounds;
  if (![south,west,north,east].every(Number.isFinite) || south >= north || west >= east) {
    throw new Error(`${source.id}: invalid map bounds`);
  }
  const normalizedAddress = value => String(value ?? '').toLowerCase().split(',')[0].replace(/\./g,'')
    .replace(/\b(st|rd|ave|dr|blvd|hwy|ct|crt|n|s|e|w)\b/g,word => ({st:'street',rd:'road',ave:'avenue',dr:'drive',blvd:'boulevard',hwy:'highway',ct:'court',crt:'court',n:'north',s:'south',e:'east',w:'west'}[word]))
    .replace(/[^a-z0-9]+/g,' ').trim();
  const aliases = new Map();
  for (const old of legacyBases) {
    const address = normalizedAddress(old.address);
    const civicNumber = address.match(/^\d+[a-z]?\b/)?.[0];
    if (!civicNumber) continue;
    const sameService = source.bases.filter(base => base.service === old.service);
    let matches = sameService.filter(base => normalizedAddress(base.address) === address);
    if (!matches.length) {
      matches = sameService.filter(base => {
        const candidateAddress = normalizedAddress(base.address);
        if (candidateAddress.match(/^\d+[a-z]?\b/)?.[0] !== civicNumber || candidateAddress.split(' ')[1] !== address.split(' ')[1]) return false;
        if (![base.lat,base.lng,old.lat,old.lng].every(Number.isFinite)) return false;
        const northMeters = (base.lat-old.lat)*111320;
        const eastMeters = (base.lng-old.lng)*111320*Math.cos(old.lat*Math.PI/180);
        return Math.hypot(northMeters,eastMeters) <= 30;
      });
    }
    if (matches.length !== 1 || matches[0].id === old.id) continue;
    const ids = aliases.get(matches[0].id) || [];
    if (!ids.includes(old.id)) ids.push(old.id);
    aliases.set(matches[0].id,ids);
  }
  const bases = source.bases.map(base => {
    if (base.status === 'active' && base.selectionEligible === true) {
      if (!Number.isFinite(base.lat) || !Number.isFinite(base.lng)) {
        throw new Error(`${base.id}: active selectable base requires numeric coordinates`);
      }
      if (base.lat < south || base.lat > north || base.lng < west || base.lng > east) {
        throw new Error(`${base.id}: active selectable base coordinates outside city bounds`);
      }
    }
    if (base.status !== 'active' && base.selectionEligible === true) {
      throw new Error(`${base.id}: non-active base cannot be selection eligible`);
    }
    return {
      id:base.id,number:base.number,officialNumber:base.officialNumber ?? '',
      service:base.service,name:base.name,shortName:base.shortName ?? base.name,
      address:base.address,lat:base.lat ?? null,lng:base.lng ?? null,
      status:base.status,selectionEligible:base.selectionEligible === true,
      facilityRole:base.facilityRole ?? 'station / post',sourceUrl:base.sourceUrl ?? '',notes:base.notes ?? '',
      ...(Object.hasOwn(base,'constructionStage') ? {constructionStage:base.constructionStage} : {}),
      ...(Object.hasOwn(base,'expectedOpening') ? {expectedOpening:base.expectedOpening} : {}),
      ...(Object.hasOwn(base,'constructionProjectIds') ? {constructionProjectIds:base.constructionProjectIds} : {}),
      ...(aliases.has(base.id) ? {legacyIds:aliases.get(base.id)} : {}),
    };
  });
  const firstBase = bases.find(base => base.status === 'active' && base.selectionEligible);
  const locations = source.locations.map(location => {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng) || location.lat < south || location.lat > north || location.lng < west || location.lng > east) {
      throw new Error(`${location.id}: call coordinates outside city bounds or not numeric`);
    }
    return {
      id:location.id,name:location.name,addr:location.addr,lat:location.lat,lng:location.lng,
      radius:location.radius,recognitionDifficulty:location.recognitionDifficulty,
      crossStreets:location.crossStreetDisplay?.length ? location.crossStreetDisplay : (location.crossStreets ?? []),
      custom:false,sources:location.sources ?? [],difficultyReason:location.difficultyReason ?? '',
    };
  });
  const pack = {
    schemaVersion:1,id:source.id,name:source.name,population:source.population,
    map:{bounds,defaultCenter:firstBase ? [firstBase.lat,firstBase.lng] : [(south+north)/2,(west+east)/2],defaultZoom:18,minZoom:7,maxZoom:19},
    bases,locations,
  };
  if (source.constructionProjects?.length) {
    pack.constructionProjects = source.constructionProjects.map(project => ({
      id:project.id,service:project.service,name:project.name,address:project.address,
      lat:project.lat ?? null,lng:project.lng ?? null,status:project.status,
      constructionStage:project.constructionStage,expectedOpening:project.expectedOpening ?? null,
      projectType:project.projectType,linkedBaseId:project.linkedBaseId ?? null,
      replacesBaseId:project.replacesBaseId ?? null,historyOnly:project.historyOnly === true,
      createsResponseBase:project.createsResponseBase ?? null,sourceUrl:project.sourceUrl,notes:project.notes,
    }));
  }
  return pack;
}

module.exports = {compactCityPack,loadLegacyBases};

if (require.main === module) {
  (async () => {
  const sourceDir = process.argv[2];
  if (!sourceDir) {
    console.error('Usage: node scripts/build-ontario-geo-data.cjs /path/to/package/cities');
    process.exitCode = 1;
  } else {
    const root = path.resolve(__dirname,'..');
    const cityIds = fs.readdirSync(sourceDir).filter(id => fs.existsSync(path.join(sourceDir,id,'city-pack.json'))).sort();
    if (cityIds.length !== 30) throw new Error(`Expected 30 reviewed city packs, received ${cityIds.length}`);
    let baseCount = 0, callCount = 0, aliasCount = 0, legacyCount = 0;
    const unmatched = [];
    for (const id of cityIds) {
      const source = JSON.parse(fs.readFileSync(path.join(sourceDir,id,'city-pack.json'),'utf8'));
      if (source.id !== id) throw new Error(`${id}: source city ID mismatch`);
      const legacyBases = await loadLegacyBases(id);
      const pack = compactCityPack(source,legacyBases);
      const legacyIds = new Set(pack.bases.flatMap(base => base.legacyIds || []));
      aliasCount += legacyIds.size;
      legacyCount += legacyBases.length;
      unmatched.push(...legacyBases.filter(base => !legacyIds.has(base.id)).map(base => `${id}/${base.id}`));
      const cityDir = path.join(root,'cities',id);
      fs.mkdirSync(cityDir,{recursive:true});
      fs.writeFileSync(path.join(cityDir,'geo-data.json'),JSON.stringify(pack)+'\n');
      const manifestPath = path.join(cityDir,'city.json');
      const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath,'utf8')) : {
        schemaVersion:2,id:pack.id,name:pack.name,province:'Ontario',country:'Canada',
        status:'geo-demo',playable:true,note:'Geo Guesser demo with 20 shared Fire and EMS call locations.',
        map:pack.map,
        features:{baseTraining:false,dispatch:false,roadBoundaries:false,routeGuidance:false},
        data:{boundaries:null,roads:null,dispatchLocations:null,bases:'geo-data.json',hospitals:null},
      };
      manifest.features = {...manifest.features,geoGuesser:true};
      manifest.data = {...manifest.data,geoGuesser:'geo-data.json'};
      fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
      baseCount += pack.bases.length;
      callCount += pack.locations.length;
    }
    for (const id of ['peterborough','belleville','scarborough']) {
      const manifestPath = path.join(root,'cities',id,'city.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath,'utf8'));
      manifest.features = {...manifest.features,geoGuesser:id === 'peterborough'};
      fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
    }
    console.log(`Built ${cityIds.length} Ontario Geo demos: ${callCount} calls, ${baseCount} base records.`);
    console.log(`Legacy preview aliases: ${aliasCount}/${legacyCount}; unmatched: ${unmatched.join(', ') || 'none'}.`);
  }
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
