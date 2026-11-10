import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import * as wall from '../city-explorer/station2-neighborhood-facades.mjs';
import * as city from '../city-explorer/citywide-building-facades.mjs';
import {buildStation2NeighborhoodGableRoof,resolveRecordedRoofHeights,buildRecordedFrontRoof} from '../city-explorer/station2-neighborhood-roofs.mjs';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';
import {captureBatchLengths,collectBatchRanges} from '../city-explorer/editor/feature-batch-binding.js';
import {stableHash,deterministicNumber,pointInPolygon} from '../city-explorer/feature-utils.js';
import {addRouteLandmarkAppearances} from '../city-explorer/route-landmark-appearances.js';
import {installReviewedBrickDetail} from '../city-explorer/city-material-library.js';
import {resolveReviewedBuildingEnvelope} from '../city-explorer/reviewed-building-envelope.js';
import {buildRecordedCanopy,RECORDED_CANOPIES} from '../city-explorer/recorded-canopies.js';
import {buildReviewedSplitMassing,DRISCOLL_SPLIT_MASSING} from '../city-explorer/reviewed-split-massing.js';
import {ULTRAMAR_PAVEMENT_CORRECTION} from '../city-explorer/reviewed-route-surfaces.js';
import {appendFootageRoof} from '../city-explorer/sherbrooke-footage-roofs.js';
import {applyReviewedPhotoAppearance} from '../city-explorer/reviewed-photo-appearance.js';

// Execute the real app assembly functions without starting its browser/UI.
// Terrain, bookkeeping, and separate facade-detail generation are controlled;
// material selection, dimensions, roof inference, buffers, and gables stay real.
function appHarness({profiles={},mode='source',project=(lat,lon)=>new THREE.Vector2(lon,lat),canopyReceipt=null}={}) {
  const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
  const names=['runtimeReviewedCanopy','sourceReviewedCanopyGround','finishReviewedCanopySource','createBuildingBufferBatches',
    'buildingDimensions','buildingMaterialKey','roofMaterialKey','cleanRing','polygonCentroid',
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
  const noop=()=>{};const recordedFronts=new Map(),committedBatches=[],facadeParts=[],facadeDetailCalls=[],openingCounts=[];
  const context={THREE,...wall,...city,buildStation2NeighborhoodGableRoof,resolveRecordedRoofHeights,buildRecordedFrontRoof,mappedBuildingDimensions,
    stableHash,deterministicNumber,pointInPolygon,captureBatchLengths,applyReviewedPhotoAppearance,
    installReviewedBrickDetail,resolveReviewedBuildingEnvelope,appendFootageRoof,
    buildRecordedCanopy,RECORDED_CANOPIES,buildReviewedSplitMassing,DRISCOLL_SPLIT_MASSING,ULTRAMAR_PAVEMENT_CORRECTION,
    reviewedCanopyGroundReceipt:canopyReceipt,reviewedCanopySourceRings:new Map(),deferredReviewedCanopies:new Map(),
    recordingReferences:true,recordingExpansion:true,ROAD_PACK_BUILD:false,roadTileLayer:{},roadTileManifest:{buildId:'test-pack'},reviewedCanopyStatus:{},
    CONNECTED_ROADS_ENABLED:true,reviewedRouteSurfaceDiagnostics:null,
    FOOTAGE_PROFILES:profiles,REVIEWED_BUILDING_STYLES:{},LANDMARK_BUILDING_HEIGHT_OVERRIDES:{},
    wallSourceMode:mode,stationThreeAssetReady:false,STATION2_FACADES_ENABLED:false,CITY_FACADES_MODE:'all',
    graphicsQuality:{name:'balanced',optionalScenery:true},cityVisuals:{mode:'improved'},
    CITY:{worldBounds:{minX:-10000,minZ:-10000}},RENDER_TILE_SIZE:1000,
    terrainHeightAtWorld:()=>0,project,unproject:(x,y)=>({lon:x,lat:y}),
    facadeParts,beginCityFacadePart:(id)=>{const part={id};facadeParts.push(part);return part;},excludeCityFacadePart:noop,markCityFacadeEligible:noop,
    coverCityFacadePart:noop,openingCounts,recordCityFacadeOpenings:count=>openingCounts.push(count),cityRoadCandidatesForRing:()=>[],
    station2PilotRoadSegments:[],batchSetId:()=>1,namespacedRanges:(batches,starts)=>collectBatchRanges(batches,starts),
    landmarkBuildingReferences:new Set(),state:{landmarkBuildingPlacements:new Map(),finishedRoadSurfaces:false,
      officialDrivableSurfaceIndex:null,renderedPavementIndex:null},
    cityAppearanceStats:{details:{flattenedCommercialRoofs:0,roofEquipment:0,chimneys:0,unsafeChimneys:0}},
    cityComplexRoofDiagnostics:{attempted:0,built:0,invalid:0,invalidExamples:[]},
    verticalSliceBounds:{},worldPointInVerticalSlice:()=>true,verticalSliceDetails:{rooftopUnits:[]},CITYWIDE_ROOFTOP_UNIT_CAP:100,
    appendFootageMassing:({profile})=>{assert.equal(profile,undefined,'appearance-only profiles cannot supply massing');return null;},
    recordedFronts,recordSherbrookeBuilding:(id,ring,base,top,profile)=>recordedFronts.set(id,{ring,base,top,profile}),
    facadeDetailCalls,appendBuildingFacadeDetails:(...args)=>{facadeDetailCalls.push(args);return 0;},
    committedBatches,buildBufferedBuildingBatches:batches=>committedBatches.push(batches),
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

test('actual recorded Chemong roofs integrate as one complete bounded roof with source top preserved',()=>{
  const osm=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url),'utf8'));
  const profiles=addRouteLandmarkAppearances({});
  const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*111320);
  for(const id of ['way/1002815290','way/446339099']) {
    const source=osm.elements.find(element=>`way/${element.id}`===id);
    const dimensions=mappedBuildingDimensions(source.tags,id);
    const context=appHarness({profiles,project});
    const ring=source.geometry.map(point=>project(point.lat,point.lon).toArray());
    const result=build(context,id,source.tags,ring);
    assert.equal(context.cityAppearanceStats.details.recordedRoofs,1,`${id} uses the integrated opt-in builder`);
    const roof=result.byMaterial.get(`footage-roof-${id}`).positions;
    assert.ok(roof.length>0);
    const ys=roof.filter((_,index)=>index%3===1);
    assert.ok(Math.abs(Math.max(...ys)-dimensions.height-dimensions.roofHeight)<1e-5,'maximum source top is retained');
    const xs=ring.map(point=>point[0]),zs=ring.map(point=>point[1]);
    for(let i=0;i<roof.length;i+=3) {
      assert.ok(roof[i]>=Math.min(...xs)-1e-6&&roof[i]<=Math.max(...xs)+1e-6);
      assert.ok(roof[i+2]>=Math.min(...zs)-1e-6&&roof[i+2]<=Math.max(...zs)+1e-6);
    }
    const wall=result.byMaterial.get(`footage-wall-${id}`);
    assert.equal(wall.positions.length/3,wall.uvs.length/2);
    assert.equal(wall.positions.length,wall.colors.length);
    assert.ok(result.byMaterial.get('windowGlass')?.positions.length,'roof glazing resolves into the shared glass batch');
    assert.equal(context.cityAppearanceStats.details.flattenedCommercialRoofs,0,'the recorded roof is not flattened afterward');
  }
});

test('actual app assembly emits the reviewed low bungalow hip and keeps the source footprint',()=>{
  const id='way/1002680782', profiles=addRouteLandmarkAppearances({});
  const source=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url)));
  const way=source.elements.find(item=>item.type==='way'&&item.id===1002680782);
  const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
  const context=appHarness({profiles,project});
  const coordinates=way.geometry.slice(0,-1).map(({lat,lon})=>project(lat,lon).toArray());
  const result=build(context,id,way.tags,coordinates);
  const feature=[...context.generatedBuildingFeatures.values()][0];
  assert.ok(Math.abs(feature.maxY-4.3)<1e-9,'source 8.18 m apex is replaced only in display geometry');
  assert.ok(Math.abs(feature.partHeights[0].wallTop-3.2)<1e-9);
  assert.equal(context.cityComplexRoofDiagnostics.built,1,'clipped hip builder is actually reached');
  const roof=result.byMaterial.get(`footage-roof-${id}`).positions;
  const heights=roof.filter((_,index)=>index%3===1);
  assert.ok(Math.max(...heights)>3.2&&Math.max(...heights)<=4.3+1e-9);
  assert.equal(feature.sourceGeometry[0][0].length,coordinates.length,'all original footprint vertices remain registered');
});

test('actual app keeps the reviewed gable roof and captured facade ceiling aligned',()=>{
  const id='way/1006594188',profiles=addRouteLandmarkAppearances({});
  const source=JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url)));
  const way=source.elements.find(item=>item.type==='way'&&item.id===1006594188);
  const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
  const context=appHarness({profiles,project});
  const coordinates=way.geometry.slice(0,-1).map(({lat,lon})=>project(lat,lon).toArray());
  build(context,id,way.tags,coordinates);
  const feature=[...context.generatedBuildingFeatures.values()][0],capture=context.recordedFronts.get(id);
  assert.ok(Math.abs(feature.maxY-6.6)<1e-9);
  assert.ok(Math.abs(capture.top-6.6)<1e-9,'upper sashes can occupy the actual gable instead of being capped at4.1m eave');
});

test('actual app emits only the open canopy batches when verified ground is available, otherwise preserves generic fallback',()=>{
  const id='way/446339023',definition=RECORDED_CANOPIES[id];
  const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
  const coordinates=definition.sourceRingLonLat.map(([lon,lat])=>project(lat,lon).toArray());
  const result=buildRecordedCanopy({sourceId:id,project,ring:coordinates.map(([x,y])=>({x,y})),groundHeightAt:(x,z)=>13+.01*(x+911)});
  assert.equal(result.valid,true);
  const context=appHarness({project,canopyReceipt:{valid:true,samples:result.groundSamples,stage:'final-packed-triangles'}});
  const emitted=build(context,id,{building:'yes'},coordinates);
  const nonempty=[...emitted.byMaterial].filter(([,batch])=>batch.positions.length);
  assert.equal(nonempty.length,5);assert.ok(nonempty.every(([key])=>key.startsWith('reviewed-canopy-')));
  assert.equal(nonempty.reduce((sum,[,batch])=>sum+batch.positions.length/9,0),48);
  const feature=[...context.generatedBuildingFeatures.values()][0];
  assert.equal(feature.reviewedCanopyProfile.signBusinessName,'Ultramar');
  assert.equal(feature.reviewedCanopyProfile.reviewedWallMaterial,true,'Lite keeps verified applied lettering');
  assert.equal(feature.minY,Math.min(...result.groundSamples.map(point=>point.height)));
  assert.equal(context.reviewedCanopyStatus.state,'rendered');
  const fallback=appHarness({project}),ordinary=build(fallback,id,{building:'yes'},coordinates);
  assert.ok(![...ordinary.byMaterial].some(([key,batch])=>key.startsWith('reviewed-canopy-')&&batch.positions.length));
  assert.ok([...ordinary.byMaterial].some(([,batch])=>batch.positions.length),'unproven old pack cannot silently activate the canopy');
});

const reviewedProject=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
let sourceWays;
function sourceFixture(id) {
  sourceWays ||= new Map(JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url)))
    .elements.filter(row=>row.type==='way').map(row=>[`way/${row.id}`,row]));
  const way=sourceWays.get(id);
  assert.ok(way,`${id} exists in the current OSM source`);
  return {way,coordinates:way.geometry.slice(0,-1).map(({lat,lon})=>reviewedProject(lat,lon).toArray())};
}
function projectedRoofArea(positions) {
  let area=0;
  for(let i=0;i<positions.length;i+=9) {
    const [ax,,az,bx,,bz,cx,,cz]=positions.slice(i,i+9);
    area+=Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))/2;
  }
  return area;
}
const snapshotBatches=batches=>JSON.parse(JSON.stringify([...batches]));

test('actual East City assembly uses the reviewed flat cap and clipped longitudinal hips in Balanced and Lite',()=>{
  const profiles=addRouteLandmarkAppearances({});
  const expected=[
    {id:'way/755554019',wall:2.6,top:2.70,clipped:false},
    {id:'way/1015118646',wall:5.12056,top:5.67056,clipped:true},
    {id:'way/1015118648',wall:5.6,top:6.50,clipped:true},
  ];
  for(const quality of ['balanced','lite']) for(const {id,wall:wallTop,top,clipped} of expected) {
    const {way,coordinates}=sourceFixture(id),context=appHarness({profiles,project:reviewedProject});
    context.graphicsQuality={name:quality,optionalScenery:quality!=='lite'};
    const {byMaterial}=build(context,id,way.tags,coordinates);
    const feature=[...context.generatedBuildingFeatures.values()][0],roof=byMaterial.get(`footage-roof-${id}`).positions;
    assert.ok(Math.abs(feature.maxY-top)<1e-9,`${quality} ${id}: exact reviewed roof top on zero ground`);
    assert.ok(Math.abs(Math.max(...roof.filter((_,i)=>i%3===1))-top)<1e-9);
    assert.equal(context.recordedFronts.get(id).top,wallTop,'the facade capture receives the eave, not the roof peak');
    assert.equal(context.cityComplexRoofDiagnostics.built,clipped?1:0,'actual assembly selects the clipped hip path only for the two houses');
    const ring=coordinates.map(([x,y])=>new THREE.Vector2(x,y));
    assert.ok(Math.abs(projectedRoofArea(roof)-Math.abs(THREE.ShapeUtils.area(ring)))<1e-5,'roof projection covers exactly one source footprint');
    assert.deepEqual(feature.sourceGeometry[0][0].map(point=>Array.from(point)),coordinates,'registered footprint stays unchanged');
    if(clipped) {
      const wallHeights=byMaterial.get(`footage-wall-${id}`).positions.filter((_,i)=>i%3===1);
      assert.ok(Math.max(...wallHeights)<=wallTop+.01,'there is no raised brick gable; only tiny clipped boundary closures are allowed');
      const ridge=[];
      for(let i=0;i<roof.length;i+=3)if(Math.abs(roof[i+1]-top)<1e-6)ridge.push([roof[i],roof[i+2]]);
      assert.ok(ridge.some(a=>ridge.some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])>4)),'long hip ridge replaces the old single pyramid apex');
    }
  }
});

test('installing the East City reviewed records does not change an ordinary building assembly',()=>{
  const id='unreviewed-east-control',tags={building:'house',height:'6','roof:height':'1.2','roof:shape':'hipped'};
  for(const quality of ['balanced','lite']) {
    const before=appHarness(),after=appHarness({profiles:addRouteLandmarkAppearances({})});
    before.graphicsQuality=after.graphicsQuality={name:quality,optionalScenery:quality!=='lite'};
    assert.deepEqual(snapshotBatches(build(after,id,tags).batches),snapshotBatches(build(before,id,tags).batches));
    assert.deepEqual(JSON.parse(JSON.stringify([...after.generatedBuildingFeatures.values()])),JSON.parse(JSON.stringify([...before.generatedBuildingFeatures.values()])));
  }
});

test('actual Driscoll assembly emits only the reviewed split shell and retains separate facade ceilings',()=>{
  const id=DRISCOLL_SPLIT_MASSING.sourceId,profiles=addRouteLandmarkAppearances({});
  const {way,coordinates}=sourceFixture(id),ring=coordinates.map(([x,y])=>new THREE.Vector2(x,y));
  const expected=buildReviewedSplitMassing({sourceId:id,ring,groundHeights:ring.map(()=>0),tags:way.tags,
    dimensions:mappedBuildingDimensions(way.tags,id),project:reviewedProject});
  assert.equal(expected.valid,true,expected.reason);
  for(const quality of ['balanced','lite']) {
    const context=appHarness({profiles,project:reviewedProject});
    context.graphicsQuality={name:quality,optionalScenery:quality!=='lite'};
    const {byMaterial}=build(context,id,way.tags,coordinates);
    const nonempty=[...byMaterial].filter(([,batch])=>batch.positions.length);
    assert.deepEqual(nonempty.map(([key])=>key).sort(),[`footage-roof-${id}`,`footage-wall-${id}`].sort());
    assert.deepEqual(Array.from(byMaterial.get(`footage-wall-${id}`).positions),expected.wallTriangles,'no ordinary wall or gable is added over the split');
    assert.deepEqual(Array.from(byMaterial.get(`footage-roof-${id}`).positions),expected.roofTriangles,'no ordinary roof is added over the two flat caps');
    assert.equal(context.facadeDetailCalls.length,0,'generic facade openings are suppressed');
    assert.equal(context.openingCounts.length,0);
    assert.equal(context.verticalSliceDetails.rooftopUnits.length,0,'generic rooftop units are suppressed');
    assert.equal(context.cityComplexRoofDiagnostics.attempted,0);
    const feature=[...context.generatedBuildingFeatures.values()][0],capture=context.recordedFronts.get(id);
    assert.equal(capture.top,5.16891,'the high block reaches the recorded facade renderer');
    assert.equal(capture.profile,profiles[id]);
    assert.equal(capture.profile.detailHeightMetres,3.2,'main frontage keeps the lower decoration cap');
    assert.equal(capture.profile.additionalFrontages[0].detailHeightMetres,5.1,'north block keeps its separate decoration cap');
    assert.equal(feature.reviewedSplitMassing.lowEave,3.2);
    assert.equal(feature.reviewedSplitMassing.highEave,5.16891);
    assert.equal(feature.maxY,5.16891+.12);
  }
});

test('changed Driscoll source tags and rejected reviewed profiles retain ordinary assembly',()=>{
  const id=DRISCOLL_SPLIT_MASSING.sourceId,profiles=addRouteLandmarkAppearances({});
  const {way,coordinates}=sourceFixture(id);
  const cases=[
    {tags:{...way.tags,name:'Changed source record'}},
    {tags:{...way.tags,height:'8','roof:height':'1','roof:shape':'gabled'}},
    ...[{id:'way/not-the-reviewed-source'},{confidence:'inferred'},{preserveMappedMassing:false},{reviewedWallMaterial:false}]
      .map(patch=>({profile:{...profiles[id],...patch}})),
  ];
  for(const {tags=way.tags,profile=profiles[id]} of cases) {
    const context=appHarness({profiles:{...profiles,[id]:profile},project:reviewedProject});
    const {byMaterial}=build(context,id,tags,coordinates),feature=[...context.generatedBuildingFeatures.values()][0];
    assert.equal(feature.reviewedSplitMassing,undefined,'an unreviewed identity or source revision cannot activate the split');
    assert.ok([...byMaterial.values()].some(batch=>batch.positions.length),'the source shell remains visible');
    const dimensions=mappedBuildingDimensions(tags,id);
    assert.ok(Math.abs(feature.maxY-dimensions.height-dimensions.roofHeight)<1e-9,'ordinary source roof dimensions remain authoritative');
    assert.equal(context.facadeDetailCalls.length,1,'ordinary facade assembly still runs after rejection');
  }
});

function canopySourceHarness() {
  const id='way/446339023',{way,coordinates}=sourceFixture(id),context=appHarness({project:reviewedProject});
  context.roadTileLayer=null;
  context.roadTileManifest=null;
  context.reviewedRouteSurfaceDiagnostics={applied:true,correctionId:ULTRAMAR_PAVEMENT_CORRECTION.id};
  context.state.officialDrivableSurfaceIndex={query:()=>({id:'10/99'})};
  context.state.renderedPavementIndex={sample:(x,z)=>({sourceId:'10/99',layer:'parking_surfaces',contact:'official',
    heightSource:'rendered-pavement-triangle',height:13+.002*(x+911)})};
  return {id,way,coordinates,context};
}

test('unfinished source canopy queues before geometry and final pavement proof drains it exactly once',()=>{
  const {id,way,coordinates,context}=canopySourceHarness();
  for(let attempt=0;attempt<2;attempt++) {
    const queued=build(context,id,way.tags,coordinates);
    assert.equal(queued.batches.size,0,'defer before even allocating empty material batches');
  }
  assert.equal(context.deferredReviewedCanopies.size,1,'repeated source discovery retains one pending job');
  assert.equal(context.reviewedCanopySourceRings.size,1);
  assert.equal(context.generatedBuildingFeatures.size,0);
  assert.equal(context.facadeParts.length,0,'no facade ownership is registered before pavement finishes');
  assert.equal(context.recordedFronts.size,0);
  assert.equal(context.committedBatches.length,0);
  assert.equal(context.sourceReviewedCanopyGround().reason,'source-pavement-not-finished');

  context.state.finishedRoadSurfaces=true;
  context.finishReviewedCanopySource();
  assert.equal(context.deferredReviewedCanopies.size,0);
  assert.equal(context.reviewedCanopyGroundReceipt.valid,true);
  assert.equal(context.reviewedCanopyGroundReceipt.samples.length,25);
  assert.equal(context.reviewedCanopyGroundReceipt.parkingFeatureId,'10/99');
  assert.equal(context.committedBatches.length,1);
  assert.equal(context.generatedBuildingFeatures.size,1);
  assert.equal(context.facadeParts.length,1);
  const batches=context.committedBatches[0],nonempty=[...batches.values()].filter(batch=>batch.positions.length);
  assert.equal(nonempty.length,5);
  assert.ok(nonempty.every(batch=>batch.materialKey.startsWith('reviewed-canopy-')));
  assert.equal(nonempty.reduce((sum,batch)=>sum+batch.positions.length/9,0),48);
  const feature=[...context.generatedBuildingFeatures.values()][0];
  assert.equal(feature.reviewedCanopyProfile.signBusinessName,'Ultramar');
  assert.equal(context.reviewedCanopyStatus.state,'rendered');
  assert.equal(context.reviewedCanopyStatus.groundStage,'finished-source-triangles');
  const before=snapshotBatches(batches),status=context.reviewedCanopyStatus;
  context.finishReviewedCanopySource();
  assert.equal(context.committedBatches.length,1);
  assert.equal(context.facadeParts.length,1);
  assert.equal(context.generatedBuildingFeatures.size,1);
  assert.deepEqual(snapshotBatches(batches),before);
  assert.equal(context.reviewedCanopyStatus,status,'rechecking valid proof must not regress rendered status');
});

test('invalid final source proof clears a stale receipt and drains once into the ordinary source shell',()=>{
  for(const invalidate of [
    context=>{context.state.renderedPavementIndex.sample=()=>null;},
    context=>{context.state.officialDrivableSurfaceIndex.query=()=>({id:'10/100'});},
    context=>{context.reviewedRouteSurfaceDiagnostics.correctionId='stale-correction';},
  ]) {
    const {id,way,coordinates,context}=canopySourceHarness();
    build(context,id,way.tags,coordinates);
    context.state.finishedRoadSurfaces=true;
    context.reviewedCanopyGroundReceipt=context.sourceReviewedCanopyGround();
    assert.equal(context.reviewedCanopyGroundReceipt.valid,true,'seed a prior valid receipt to exercise invalidation');
    invalidate(context);
    context.finishReviewedCanopySource();
    assert.equal(context.reviewedCanopyGroundReceipt,null,'final proof replaces the prior receipt even on failure');
    assert.equal(context.reviewedCanopyStatus.state,'withheld');
    assert.ok(context.reviewedCanopyStatus.reason);
    assert.equal(context.deferredReviewedCanopies.size,0);
    assert.equal(context.committedBatches.length,1);
    const batches=context.committedBatches[0],ordinary=build(appHarness({project:reviewedProject}),id,way.tags,coordinates);
    assert.deepEqual(snapshotBatches(batches),snapshotBatches(ordinary.batches),'failed proof retains the complete ordinary source shell');
    assert.equal([...context.generatedBuildingFeatures.values()][0].reviewedCanopyProfile,undefined);
    context.finishReviewedCanopySource();
    assert.equal(context.committedBatches.length,1);
    assert.equal(context.generatedBuildingFeatures.size,1);
  }
});

test('canopy recording opt-outs and compiler builds never enter the source deferral queue',()=>{
  for(const patch of [{recordingReferences:false},{recordingExpansion:false},{ROAD_PACK_BUILD:true}]) {
    const {id,way,coordinates,context}=canopySourceHarness();
    Object.assign(context,patch);
    const {batches}=build(context,id,way.tags,coordinates);
    assert.equal(context.deferredReviewedCanopies.size,0);
    assert.equal(context.generatedBuildingFeatures.size,1);
    assert.ok([...batches.values()].some(batch=>batch.positions.length));
    assert.ok(![...batches.values()].some(batch=>batch.positions.length&&batch.materialKey.startsWith('reviewed-canopy-')));
    assert.equal([...context.generatedBuildingFeatures.values()][0].reviewedCanopyProfile,undefined);
    context.state.finishedRoadSurfaces=true;
    context.finishReviewedCanopySource();
    assert.equal(context.committedBatches.length,0,'the finisher does not rebuild a source already emitted normally');
    assert.equal(context.generatedBuildingFeatures.size,1);
  }
});
