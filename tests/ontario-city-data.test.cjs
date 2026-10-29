'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ids = ['ajax','barrie','brampton','brantford','burlington','cambridge','chatham-kent','clarington','greater-sudbury','guelph','hamilton','kingston','kitchener','london','markham','milton','mississauga','niagara-falls','oakville','oshawa','ottawa','pickering','richmond-hill','st-catharines','thunder-bay','toronto','vaughan','waterloo','whitby','windsor'];
const previews = ['oshawa','belleville','scarborough','pickering','markham','toronto'];
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const json = file => JSON.parse(read(file));
const packs = () => ids.map(id => json(`cities/${id}/geo-data.json`));
const coordinate = (value,minimum,maximum) => typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;

function registry() {
  const context = {window:{}};
  vm.runInNewContext(read('cities/city-registry.js'),context);
  return context.window.PTBO_CITIES;
}

test('registry declares each mode independently for Peterborough, researched demos and legacy previews', () => {
  const cities = registry();
  assert.equal(cities.length,33);
  assert.equal(cities[0].id,'peterborough');
  assert.equal(new Set(cities.map(city => city.id)).size,33);
  for (const city of cities) {
    assert.ok(Object.isFrozen(city.modes),`${city.id}: immutable capabilities`);
    assert.equal(city.modes.geo,true,city.id);
    assert.equal(city.modes.dispatch,city.id === 'peterborough' || previews.includes(city.id),city.id);
    assert.equal(city.modes.route,true,city.id);
    assert.equal(city.modes.explorer,city.id === 'peterborough',city.id);
    if (city.id !== 'peterborough') assert.equal(city.geoDataUrl,`cities/${city.id}/geo-data.json`);
    assert.equal(city.dispatch.desktop,'response-simulator/play/');
    assert.equal(city.dispatch.mobile,'response-simulator/mobile/');
  }
});

test('each compact city pack has one shared twenty-call pool with ten easy, five medium and five hard', () => {
  let total = 0;
  for (const pack of packs()) {
    assert.equal(pack.schemaVersion,1,pack.id);
    assert.equal(pack.locations.length,20,pack.id);
    assert.equal(new Set(pack.locations.map(row => row.id)).size,20,pack.id);
    assert.equal(pack.population.year,2025,pack.id);
    assert.ok(pack.population.value > 0,pack.id);
    assert.equal(pack.map.defaultZoom,18,pack.id);
    assert.equal(pack.map.minZoom,7,pack.id);
    assert.equal(pack.map.maxZoom,19,pack.id);
    assert.equal('locationsByService' in pack,false,pack.id);
    assert.equal('fireLocations' in pack,false,pack.id);
    assert.equal('emsLocations' in pack,false,pack.id);
    const tiers = {easy:0,medium:0,hard:0};
    const [[south,west],[north,east]] = pack.map.bounds;
    assert.ok(south < north && west < east,pack.id);
    assert.ok(coordinate(pack.map.defaultCenter[0],south,north),pack.id);
    assert.ok(coordinate(pack.map.defaultCenter[1],west,east),pack.id);
    for (const row of pack.locations) {
      tiers[row.recognitionDifficulty]++;
      assert.ok(coordinate(row.lat,south,north),`${row.id}: latitude`);
      assert.ok(coordinate(row.lng,west,east),`${row.id}: longitude`);
      assert.ok(row.name && row.addr && row.radius > 0 && row.difficultyReason,row.id);
      assert.equal(row.custom,false,row.id);
      assert.ok(Array.isArray(row.sources) && row.sources.length > 0,row.id);
      assert.ok(Array.isArray(row.crossStreets) && row.crossStreets.every(street => typeof street === 'string' && street.length > 0),row.id);
      assert.equal('originalResearchRecord' in row,false,'runtime omits full research audit');
      assert.equal('crossStreetEvidence' in row,false,'runtime omits road-graph evidence');
    }
    assert.deepEqual(tiers,{easy:10,medium:5,hard:5},pack.id);
    total += pack.locations.length;
  }
  assert.equal(total,600);
});

test('all researched bases survive with future and disputed bases excluded from the selectable set', () => {
  let total = 0, eligible = 0, nullCoordinates = 0;
  for (const pack of packs()) {
    assert.equal(new Set(pack.bases.map(base => base.id)).size,pack.bases.length,pack.id);
    for (const service of ['fire','ems']) {
      const bases = pack.bases.filter(base => base.service === service && base.status === 'active' && base.selectionEligible);
      assert.ok(bases.length > 0,`${pack.id}: ${service} has selectable bases`);
      assert.equal(new Set(bases.map(base => base.number)).size,bases.length,`${pack.id}: ${service} stable station numbers`);
    }
    for (const base of pack.bases) {
      assert.equal(typeof base.selectionEligible,'boolean',base.id);
      assert.ok(base.name && base.address && base.sourceUrl && base.facilityRole,base.id);
      assert.ok(Number.isInteger(base.number),base.id);
      assert.equal(typeof base.officialNumber,'string',base.id);
      assert.equal(typeof base.notes,'string',base.id);
      if (base.status !== 'active') assert.equal(base.selectionEligible,false,base.id);
      if (base.lat === null || base.lng === null) {
        assert.equal(base.lat,null,base.id);
        assert.equal(base.lng,null,base.id);
        assert.equal(base.selectionEligible,false,base.id);
        nullCoordinates++;
      } else {
        assert.ok(coordinate(base.lat,-90,90),base.id);
        assert.ok(coordinate(base.lng,-180,180),base.id);
        assert.notEqual(base.lat,0,base.id);
        assert.notEqual(base.lng,0,base.id);
      }
      if (base.status === 'active' && base.selectionEligible) eligible++;
      total++;
    }
  }
  assert.equal(total,686);
  assert.equal(eligible,581);
  assert.ok(nullCoordinates > 0);
  const disputed = json('cities/barrie/geo-data.json').bases.find(base => base.id === 'barrie-ems-bayfield-review');
  assert.equal(disputed.status,'needs-review');
  assert.equal(disputed.selectionEligible,false);
  const future = json('cities/barrie/geo-data.json').bases.find(base => base.id === 'barrie-ems-cundles-post-planned');
  assert.equal(future.status,'planned');
  assert.equal(future.lat,null);
  assert.equal(future.lng,null);
  const temporary = json('cities/guelph/geo-data.json').bases.find(base => base.id === 'guelph-ems-12');
  assert.equal(temporary.status,'needs-review');
  assert.equal(temporary.selectionEligible,false);
  assert.equal(temporary.operationalReview.status,'conflicting-current-deployment-evidence');
});

test('cross-street display retains evidence-backed indirect via connections', () => {
  const ajax = json('cities/ajax/geo-data.json');
  assert.ok(ajax.locations.some(row => row.crossStreets.includes('Farley Court (via Dreyer Drive)')));
});

test('future base construction fields preserve reviewed stage, opening estimate and project links', () => {
  const examples = [
    ['barrie','barrie-ems-cundles-post-planned','design',null,['barrie-ems-cundles-post-planned']],
    ['brampton','brampton-fire-215','under-construction',null,['brampton-fire-215']],
    ['hamilton','hamilton-fire-29-planned','under-construction','August 2027 (estimated; operations commence)',['hamilton-fire-29-waterdown-construction']],
  ];
  for (const [city,id,stage,opening,projectIds] of examples) {
    const base = json(`cities/${city}/geo-data.json`).bases.find(row => row.id === id);
    assert.equal(base.constructionStage,stage,id);
    assert.equal(base.expectedOpening,opening,id);
    assert.deepEqual(base.constructionProjectIds,projectIds,id);
    assert.equal(base.selectionEligible,false,id);
  }
});

test('legacy aliases resolve only to real preview base IDs and remain unique within each city', async () => {
  const {loadLegacyBases} = require(path.join(root,'scripts/build-ontario-geo-data.cjs'));
  assert.equal(typeof loadLegacyBases,'function','builder can read original packaged preview IDs offline');
  for (const [city,count] of [['oshawa',8],['pickering',6],['markham',15],['toronto',16]]) {
    const originals = await loadLegacyBases(city);
    const pack = json(`cities/${city}/geo-data.json`);
    const aliases = pack.bases.flatMap(base => (base.legacyIds || []).map(id => ({id,base})));
    assert.equal(aliases.length,count,city);
    assert.equal(new Set(aliases.map(alias => alias.id)).size,count,`${city}: unambiguous aliases`);
    for (const {id,base} of aliases) {
      const original = originals.find(row => row.id === id);
      assert.ok(original,`${city}: ${id} is an actual preview ID`);
      assert.equal(original.service,base.service,id);
      assert.notEqual(id,base.id,id);
    }
  }
  const oshawa = json('cities/oshawa/geo-data.json');
  assert.deepEqual(oshawa.bases.find(base => base.id === 'oshawa-fire-1').legacyIds,['fire-fire-station-1-1']);
  const toronto = json('cities/toronto/geo-data.json');
  assert.deepEqual(toronto.bases.find(base => base.id === 'toronto-ems-3234576').legacyIds,['ems-ambulance-station-10-10']);
  const markham = json('cities/markham/geo-data.json');
  assert.deepEqual(markham.bases.find(base => base.id === 'markham-fire-9-5').legacyIds,['fire-fire-station-95-95']);
  assert.deepEqual(markham.bases.find(base => base.id === 'markham-fire-9-7').legacyIds,['fire-fire-station-97-97']);
  assert.equal(json('cities/pickering/geo-data.json').bases.some(base => base.legacyIds?.includes('ems-seaton-rdps-2')),false,'Seaton has no matching legacy civic address');
});

test('legacy matching retains civic identity and service when nearby station labels differ', () => {
  const {compactCityPack} = require(path.join(root,'scripts/build-ontario-geo-data.cjs'));
  const source = {id:'test-city',name:'Test City',population:{value:1},map:{bounds:[[43,-80],[45,-78]]},bases:[{id:'current',number:1,service:'fire',name:'Station 1',address:'316 Main Unionville Street',lat:44,lng:-79,status:'active',selectionEligible:true}],locations:[]};
  const old = {id:'legacy',number:95,service:'fire',address:'316 Main Street, Unionville',lat:44.00001,lng:-79};
  assert.deepEqual(compactCityPack(source,[old]).bases[0].legacyIds,['legacy']);
  for (const change of [{address:'317 Main Street'},{address:'316 Other Street'},{service:'ems'},{lat:44.01},{address:'Main Street'}]) {
    assert.equal(compactCityPack(source,[{...old,...change}]).bases[0].legacyIds,undefined,JSON.stringify(change));
  }
});

test('manifests enable only researched scene cities and the Richmond Hill native Dispatch demo', () => {
  for (const id of ids) {
    const manifest = json(`cities/${id}/city.json`);
    const nativeDemo = id === 'richmond-hill';
    assert.equal(manifest.id,id);
    assert.equal(manifest.features.geoGuesser,true,id);
    assert.equal(manifest.data.geoGuesser,'geo-data.json',id);
    assert.equal(manifest.features.dispatch,previews.includes(id)||nativeDemo,id);
    assert.equal(manifest.features.routeGuidance,nativeDemo,id);
    assert.equal(manifest.features.baseTraining,false,id);
    assert.equal(manifest.data.roads,previews.includes(id)||nativeDemo?'roads.geojson.gz':null,id);
    if (nativeDemo) {
      assert.equal(manifest.runtime,'./package.js',id);
      assert.equal(manifest.status,'dispatch-demo',id);
      assert.equal(manifest.dispatchDemo.callLimit,5,id);
      assert.equal(manifest.features.hospitalTransport,true,id);
      assert.equal(manifest.data.dispatchLocations,'geo-data.json',id);
    } else if (previews.includes(id)) {
      assert.equal(manifest.data.bases,'geo-data.json',id);
      assert.equal(manifest.status,'scene-response',id);
      assert.equal(manifest.map.minZoom,10,id);
    } else {
      assert.equal(manifest.runtime,undefined,id);
      assert.equal(manifest.data.bases,'geo-data.json',id);
      assert.equal(manifest.data.dispatchLocations,null,id);
    }
  }
  const peterborough = json('cities/peterborough/city.json');
  assert.equal(peterborough.features.geoGuesser,true);
  assert.equal(peterborough.runtime,'./package.js');
  assert.equal(peterborough.data.roads,'../../city-explorer/data/osm-public-roads.geojson');
  for (const id of ['belleville','scarborough']) {
    const manifest = json(`cities/${id}/city.json`);
    assert.equal(manifest.features.geoGuesser,true,id);
    assert.equal(manifest.data.geoGuesser,'geo-data.json',id);
    assert.equal(manifest.features.dispatch,previews.includes(id),id);
    assert.equal(manifest.features.baseTraining,false,id);
    assert.equal(manifest.data.bases,'geo-data.json',id);
  }
});

test('builder rejects invalid selectable coordinates instead of silently coercing them', () => {
  const builder = path.join(root,'scripts/build-ontario-geo-data.cjs');
  assert.ok(fs.existsSync(builder),'build script exists');
  const {compactCityPack} = require(builder);
  const source = {schemaVersion:1,id:'test-city',name:'Test City',population:{value:1,year:2025},map:{bounds:[[43,-80],[45,-78]]},bases:[{id:'future',number:2,service:'ems',name:'Future Base',address:'Site pending',status:'planned',selectionEligible:false,lat:null,lng:null},{id:'active',number:1,service:'fire',name:'Station 1',address:'1 Main St',status:'active',selectionEligible:true,lat:44,lng:-79}],locations:[]};
  const compact = compactCityPack(source);
  assert.equal(compact.bases[0].lat,null);
  assert.equal(compact.bases[0].lng,null);
  assert.deepEqual(compact.map.defaultCenter,[44,-79]);
  source.bases[1].lat = null;
  assert.throws(() => compactCityPack(source),/active.*coordinates/i);
  source.bases[1].lat = '';
  assert.throws(() => compactCityPack(source),/active.*coordinates/i);
  source.bases[1].lat = 0;
  assert.throws(() => compactCityPack(source),/active.*coordinates|outside.*bounds/i);
});
