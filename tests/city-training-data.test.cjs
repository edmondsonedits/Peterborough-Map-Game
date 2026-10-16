'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib'),crypto=require('node:crypto');
const c={window:{}};vm.runInNewContext(fs.readFileSync('cities/city-registry.js','utf8'),c);
test('every advertised route city has a validated sourced road asset and official care-home catalog',()=>{
 for(const city of c.window.PTBO_CITIES){
  const d=JSON.parse(fs.readFileSync(`cities/${city.id}/training-data.json`));
  assert.equal(d.id,city.id);assert.equal(d.schemaVersion,1);assert.ok(d.careHomes.length>0,city.id);
  assert.match(d.careSource.url,/^https:\/\/ws\.lioservices\.lrc\.gov\.on\.ca\//);
  assert.match(d.careSource.sha256,/^[a-f0-9]{64}$/);assert.equal(d.roadSource.license,'ODbL-1.0');
  assert.equal(new Set(d.careHomes.map(h=>h.id)).size,d.careHomes.length);
  for(const h of d.careHomes){assert.match(h.id,/^moh-ltc-/);assert.equal(h.facilityType,'long-term-care');assert.ok(Number.isFinite(h.lat)&&Number.isFinite(h.lng));assert.ok(h.lat>=d.bounds[0][0]&&h.lat<=d.bounds[1][0]&&h.lng>=d.bounds[0][1]&&h.lng<=d.bounds[1][1]);assert.ok(h.addr&&h.name&&h.sources.length);}
  const manifest=JSON.parse(fs.readFileSync(`cities/${city.id}/city.json`));assert.equal(manifest.features.routeMapping,true);assert.equal(manifest.data.routeMapping,'training-data.json');
  assert.ok(fs.existsSync(d.roadsUrl),city.id);
  if(city.id==='peterborough'){
   assert.equal(d.roadSource.metadataUrl,'city-explorer/data/manifest.json');
   assert.equal(d.roadSource.rawDataUrl,'city-explorer/data/peterborough-osm.json');
   assert.equal(d.roadSource.sha256,undefined,'periodically refreshed Peterborough roads use their own source manifest');
   continue;
  }
  const bytes=zlib.gunzipSync(fs.readFileSync(d.roadsUrl));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),d.roadDataSha256);
  const roads=JSON.parse(bytes);assert.equal(roads.features.length,d.roadFeatureCount);assert.ok(roads.features.length>0);
  assert.ok(roads.features.every(f=>f.id.startsWith('way/')&&f.geometry.type==='LineString'&&f.geometry.coordinates.length>=2));
 }
});
