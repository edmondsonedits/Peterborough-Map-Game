import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {buildRecordedCanopy} from '../city-explorer/recorded-canopies.js';
import {ULTRAMAR_PAVEMENT_CORRECTION,applyReviewedRouteSurfaceCorrections} from '../city-explorer/reviewed-route-surfaces.js';
const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const osm=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url)));
const source=osm.elements.find(item=>item.type==='way'&&item.id===446339023);
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(lat-44.3091)*110540});
const ring=source.geometry.slice(0,-1).map(({lat,lon})=>{const p=project(lat,lon);return{x:p.x,z:p.y};});
const body=app.match(/^function sourceReviewedCanopyGround\([^]*?^\}/m)?.[0];
assert.ok(body);
function report({diagnostics={applied:true,correctionId:ULTRAMAR_PAVEMENT_CORRECTION.id},finished=true,
  semantic=()=>({id:'10/99'}),hit=(x,z)=>({sourceId:'10/99',height:13+.002*(x+911),layer:'parking_surfaces',contact:'official',heightSource:'rendered-pavement-triangle'}),rings=new Map([['way/446339023',{ring,holes:[]}]])}={}) {
  return runInNewContext(`${body}\nsourceReviewedCanopyGround()`,{
    reviewedRouteSurfaceDiagnostics:diagnostics,reviewedCanopySourceRings:rings,
    state:{finishedRoadSurfaces:finished,officialDrivableSurfaceIndex:{query:semantic},renderedPavementIndex:{sample:hit}},
    ULTRAMAR_PAVEMENT_CORRECTION,buildRecordedCanopy,project,
  });
}
test('source compiler reports all actual canopy support and footprint samples only after final pavement',()=>{
  const result=report();assert.equal(result.valid,true);assert.equal(result.samples.length,25);
  assert.equal(result.parkingFeatureId,'10/99');assert.equal(result.sourceId,'way/446339023');
  assert.ok(result.samples.every(point=>Number.isFinite(point.height)));
  assert.equal(report({finished:false}).valid,false);
  assert.equal(report({diagnostics:null}).valid,false);
  assert.equal(report({diagnostics:{applied:true,correctionId:'stale'}}).valid,false);
});
test('terrain, wrong parking feature, unfinished contacts and missing source geometry cannot certify a canopy',()=>{
  for(const options of [{semantic:()=>({id:'10/100'})},{semantic:()=>null},{hit:()=>null},
    {hit:()=>({sourceId:'10/99',height:13,layer:'parking_surfaces',contact:'fallback',heightSource:'rendered-pavement-triangle'})},
    {hit:()=>({sourceId:'10/99',height:13,layer:'road_surfaces',contact:'official',heightSource:'rendered-pavement-triangle'})},
    {hit:()=>({sourceId:'10/99',height:13,layer:'parking_surfaces',contact:'official',heightSource:'terrain'})},
    {hit:()=>({sourceId:'10/100',height:13,layer:'parking_surfaces',contact:'official',heightSource:'rendered-pavement-triangle'})},
    {rings:new Map()}]) {const result=report(options);assert.equal(result.valid,false);assert.equal(result.samples.length,0);}
});
test('app loader corrects the audited lot before indexing and leaves the original source untouched',async()=>{
  const loader=app.match(/^async function loadOfficialRoadSurfaces\([^]*?^\}/m)?.[0];assert.ok(loader);
  const collection=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-road-surfaces.geojson',import.meta.url)));
  const original=collection.features.find(feature=>feature.id==='10/99');
  const context={pinnedStationHeights:null,reviewedRouteSurfaceDiagnostics:null,
    tryLoadRoadTilePack:async()=>null,lowPowerProfile:false,location:{search:''},
    state:{manifest:{}},document:{documentElement:{dataset:{}}},console,URL,URLSearchParams,
    fetch:async()=>({ok:true,json:async()=>collection}),applyReviewedRouteSurfaceCorrections};
  const result=await runInNewContext(`${loader.replace('import.meta.url',"'https://example.invalid/city-explorer/app.js'")}\nloadOfficialRoadSurfaces()`,context);
  assert.equal(original.geometry.coordinates.length,3);
  assert.equal(result.features.find(feature=>feature.id==='10/99').geometry.coordinates.length,2);
  assert.equal(context.reviewedRouteSurfaceDiagnostics.applied,true);
  assert.equal(result.features.length,collection.features.length);
});
