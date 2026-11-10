import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import * as wall from '../city-explorer/station2-neighborhood-facades.mjs';
import * as city from '../city-explorer/citywide-building-facades.mjs';
import {buildStation2NeighborhoodGableRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {captureBatchLengths,collectBatchRanges} from '../city-explorer/editor/feature-batch-binding.js';
import {stableHash,deterministicNumber,pointInPolygon} from '../city-explorer/feature-utils.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {applyReviewedPhotoAppearance} from '../city-explorer/reviewed-photo-appearance.js';

// Execute the real app assembly functions without starting its browser/UI.
// Terrain, bookkeeping, and separate facade-detail generation are controlled;
// material selection, dimensions, roof inference, buffers, and gables stay real.
function appHarness({profiles={},mode='source'}={}) {
  const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
  const names=['buildingDimensions','buildingMaterialKey','roofMaterialKey','cleanRing','polygonCentroid',
    'renderTileCoordinates','batchPositions','batchRecord','appendUvQuad','appendTriangle','appendQuad',
    'appendRingWalls','appendPitchedRoof','appendStation2WallTexture','appendStation2IrregularRoof','appendBufferedBuilding'];
  if(app.includes('function appendCityGableWalls('))names.push('appendCityGableWalls');
  const extract=name=>{
    const start=app.indexOf(`function ${name}(`);
    assert.ok(start>=0,`app function ${name} is available`);
    const end=app.indexOf('\n}',start);
    assert.ok(end>start,`app function ${name} has a top-level closing brace`);
    return app.slice(start,end+2);
  };
  const noop=()=>{};
  const context={THREE,...wall,...city,buildStation2NeighborhoodGableRoof,mappedBuildingDimensions,
    stableHash,deterministicNumber,pointInPolygon,captureBatchLengths,applyReviewedPhotoAppearance,
    FOOTAGE_PROFILES:profiles,REVIEWED_BUILDING_STYLES:{},LANDMARK_BUILDING_HEIGHT_OVERRIDES:{},
    wallSourceMode:mode,stationThreeAssetReady:false,STATION2_FACADES_ENABLED:false,CITY_FACADES_MODE:'all',
    graphicsQuality:{name:'balanced',optionalScenery:true},cityVisuals:{mode:'improved'},
    CITY:{worldBounds:{minX:-10000,minZ:-10000}},RENDER_TILE_SIZE:1000,
    terrainHeightAtWorld:()=>0,project:(lat,lon)=>new THREE.Vector2(lon,lat),unproject:(x,y)=>({lon:x,lat:y}),
    beginCityFacadePart:()=>({}),excludeCityFacadePart:noop,markCityFacadeEligible:noop,
    coverCityFacadePart:noop,recordCityFacadeOpenings:noop,cityRoadCandidatesForRing:()=>[],
    station2PilotRoadSegments:[],batchSetId:()=>1,namespacedRanges:(batches,starts)=>collectBatchRanges(batches,starts),
    landmarkBuildingReferences:new Set(),state:{landmarkBuildingPlacements:new Map()},
    cityAppearanceStats:{details:{flattenedCommercialRoofs:0,roofEquipment:0,chimneys:0,unsafeChimneys:0}},
    cityComplexRoofDiagnostics:{attempted:0,built:0,invalid:0,invalidExamples:[]},
    verticalSliceBounds:{},worldPointInVerticalSlice:()=>true,verticalSliceDetails:{rooftopUnits:[]},CITYWIDE_ROOFTOP_UNIT_CAP:100,
    appendFootageMassing:({profile})=>{assert.equal(profile,undefined,'appearance-only profiles cannot supply massing');return null;},
    recordSherbrookeBuilding:noop,appendBuildingFacadeDetails:()=>0,
    generatedBuildingFeatures:new Map(),buildingFeaturesByBatch:new WeakMap(),
    station2WallMaterials:new Map(['brick','render','stone','siding'].map(family=>[`station2-wall-${family}`,{userData:{station2RepeatMetres:[1,1]}}])),
    materials:{residential:new THREE.MeshStandardMaterial({color:'#ff00ff'})},
    standard:(color,options)=>new THREE.MeshStandardMaterial({color,...options}),installWorldSurfaceDetail:noop,
  };
  vm.createContext(context);
  vm.runInContext(names.map(extract).join('\n'),context);
  const paletteStart=app.indexOf('for (const [id, profile] of Object.entries(FOOTAGE_PROFILES)) {');
  assert.ok(paletteStart>=0,'app initializes reviewed profile materials');
  vm.runInContext(app.slice(paletteStart,app.indexOf('\n}',paletteStart)+2),context);
  return context;
}

function build(context,id,tags,coordinates=[[0,0],[20,0],[20,20],[0,20]]) {
  const batches=new Map();
  const ring=coordinates.map(([x,y])=>new THREE.Vector2(x,y));
  assert.equal(context.appendBufferedBuilding([ring],tags,id,batches),true);
  return {batches,byMaterial:new Map([...batches.values()].map(batch=>[batch.materialKey,batch]))};
}

test('reviewed route walls keep source-class roof inference and rooftop equipment',()=>{
  const id='way/176908280';
  const profiles=addRouteLandmarkAppearances({});
  const tags={building:'retail','building:colour':'blue',height:'7.5','roof:height':'1.5'};
  const baseline=appHarness(),annotated=appHarness({profiles});
  const before=build(baseline,id,tags),after=build(annotated,id,tags);
  assert.ok(after.byMaterial.get(`footage-wall-${id}`)?.positions.length,'mapped walls use the reviewed material');
  assert.ok(![...after.byMaterial].some(([key,batch])=>key.startsWith('station2-wall-')&&batch.positions.length),'reviewed wall is not overlaid by a generic family');
  assert.ok(after.byMaterial.get('roofMetal')?.positions.length,'the unpainted roof retains its commercial-glass source classification');
  assert.deepEqual([...after.byMaterial.get('roofMetal').positions],[...before.byMaterial.get('roofMetal').positions]);
  assert.equal(annotated.cityAppearanceStats.details.flattenedCommercialRoofs,1);
  assert.equal(annotated.verticalSliceDetails.rooftopUnits.length,1,'source commercial class still permits the deterministic HVAC unit');
  assert.deepEqual(JSON.parse(JSON.stringify(annotated.verticalSliceDetails.rooftopUnits)),JSON.parse(JSON.stringify(baseline.verticalSliceDetails.rooftopUnits)));
  assert.equal(annotated.materials[`footage-wall-${id}`].color.getHexString(),profiles[id].wallColor.slice(1));
  assert.ok(after.byMaterial.get(`footage-wall-${id}`).colors.every(value=>value===1),'reviewed colour is not multiplied by a random building tint');
});

test('reviewed appearance-only roof colours resolve to initialized materials while geometry stays mapped',()=>{
  const id='way/1002815290',profiles=addRouteLandmarkAppearances({});
  const context=appHarness({profiles});
  const roof=context.materials[`footage-roof-${id}`];
  assert.ok(roof?.isMaterial,'the selected reviewed roof key has a real material, never residential fallback');
  assert.equal(roof.color.getHexString(),profiles[id].roofColor.slice(1));
  const tags={building:'house',height:'6','roof:height':'2','roof:shape':'gabled'};
  const result=build(context,id,tags,[[0,0],[6,0],[6,4],[0,4]]);
  assert.ok(result.byMaterial.get(`footage-roof-${id}`)?.positions.length);
  const feature=[...context.generatedBuildingFeatures.values()][0];
  assert.equal(feature.maxY,6,'reviewed colour does not change the source roof envelope');
});

test('reviewed four-corner and irregular gable ends share the reviewed wall material and neutral tint',()=>{
  const id='way/1002815290',profiles=addRouteLandmarkAppearances({});
  const tags={building:'house',height:'6','roof:height':'2','roof:shape':'gabled'};
  for(const coordinates of [ [[0,0],[6,0],[6,4],[0,4]], [[0,0],[6,0],[6,4],[3,4],[3,3],[0,3]] ]) {
    const context=appHarness({profiles});
    const {byMaterial}=build(context,id,tags,coordinates);
    const wallBatch=byMaterial.get(`footage-wall-${id}`);
    assert.ok(wallBatch.positions.some((value,index)=>index%3===1&&value>4),'gable vertices above mapped eaves belong to the wall batch');
    assert.ok(wallBatch.colors.every(value=>value===1));
    assert.equal(wallBatch.uvs.length,wallBatch.positions.length/3*2);
    const roofBatch=byMaterial.get(`footage-roof-${id}`);
    for(let i=0;i<roofBatch.positions.length;i+=9) {
      const a=new THREE.Vector3(...roofBatch.positions.slice(i,i+3)),b=new THREE.Vector3(...roofBatch.positions.slice(i+3,i+6)),c=new THREE.Vector3(...roofBatch.positions.slice(i+6,i+9));
      const normal=b.sub(a).cross(c.sub(a));
      assert.ok(Math.abs(normal.y)>1e-6,'roof-material triangles are sloped planes, not vertical gable closures');
    }
  }
});

test('source and procedural modes retain reviewed precedence while unknown generic tags keep the prior family',()=>{
  const profiles=addRouteLandmarkAppearances({}),id='way/1002815290';
  for(const mode of ['source','procedural']) {
    const reviewed=appHarness({profiles,mode});
    const reviewedResult=build(reviewed,id,{building:'house','building:material':'brick',height:'5','roof:height':'0'});
    assert.ok(reviewedResult.byMaterial.get(`footage-wall-${id}`)?.positions.length);
    const generic=appHarness({mode});
    const unknown=build(generic,'generic',{building:'house','building:colour':'red','building:material':'unrecognized',height:'5','roof:height':'0'});
    assert.ok(unknown.byMaterial.get('station2-wall-brick')?.positions.length);
    const tagged=build(appHarness({mode}),'generic',{building:'house','building:colour':'red','building:material':'plaster',height:'5','roof:height':'0'});
    assert.ok(tagged.byMaterial.get(mode==='source'?'station2-wall-render':'station2-wall-brick')?.positions.length);
  }
});
