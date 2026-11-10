import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {buildRecordedCanopy, RECORDED_CANOPIES} from '../city-explorer/recorded-canopies.js';
import {createFootageFacade, frontageFrame} from '../city-explorer/sherbrooke-footage.js';
import {applyReviewedPhotoAppearance} from '../city-explorer/reviewed-photo-appearance.js';

// Exercise the real mesh/editor/facade commit, not a reimplementation of its
// identity check. The canvas adapter only replaces native text rasterization.
const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
const commit=app.match(/^function\* buildingBatchCommitSteps\([^]*?^\}/m)?.[0];
assert.ok(commit);
const sourceId='way/446339023';
const project=(lat,lon)=>new THREE.Vector2((lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),-(lat-44.3091)*110540);
function fixture(quality='balanced') {
  const ring=RECORDED_CANOPIES[sourceId].sourceRingLonLat.map(([lon,lat])=>project(lat,lon));
  const canopy=buildRecordedCanopy({sourceId,project,ring,groundHeightAt:(x,z)=>13+.002*(x+911)});
  assert.equal(canopy.valid,true);
  const batches=new Map(Object.entries(canopy.surfaces).map(([family,surface])=>[
    family,{positions:surface.positions,materialKey:`reviewed-canopy-${family}`,tile:'canopy-test'}]));
  const profile={...canopy.signProfile,reviewedWallMaterial:true};
  const xs=ring.map(p=>p.x),zs=ring.map(p=>p.y);
  const feature={sourceId,stableSourceId:sourceId,reviewedCanopyProfile:profile,batchSet:batches,
    minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),
    minY:Math.min(...canopy.groundSamples.map(p=>p.height)),maxY:canopy.roofTop,
    sourceGeometry:[[RECORDED_CANOPIES[sourceId].sourceRingLonLat]],ranges:[],properties:{building:'yes'},
    longitude:-78.33114,latitude:44.31897,label:'Source canopy'};
  const registrations=[],attachments=[];
  const document={documentElement:{dataset:{}},createElement:()=>({width:0,height:0,getContext:()=>({
    fillRect(){},fillText(){},measureText:text=>({width:text.length*20})})})};
  const context={THREE,document,project,createFootageFacade,frontageFrame,applyReviewedPhotoAppearance,
    graphicsQuality:{name:quality,optionalScenery:quality!=='lite'},cityVisuals:{mode:'improved',quality:'lite'},
    lowPowerProfile:false,verticalSliceShadowBounds:{},worldPointInVerticalSlice:()=>false,
    cloneCityMaterial:material=>material.clone(),RENDER_TILE_SIZE:1000,
    station2WallMaterials:new Map(),station2OpeningMaterials:new Map(),
    materials:Object.fromEntries(Object.entries(canopy.surfaces).map(([family,surface])=>[
      `reviewed-canopy-${family}`,new THREE.MeshStandardMaterial({color:surface.color})])),
    buildingGroup:new THREE.Group(),generatedBuildingMeshes:new Map(),batchMeshKey:(_,key)=>key,
    buildingFeaturesByBatch:new WeakMap([[batches,[feature]]]),makeGeneratedProxy:()=>new THREE.Object3D(),
    generatedRegistry:{makeGeneratedId:()=>`generated:${sourceId}`,registerEditableObject:(_,record)=>registrations.push(record),
      attachEditableGroup:(id,group)=>attachments.push({id,group})},makeBatchBinding:()=>({}),
    FOOTAGE_PROFILES:{},sherbrookeBuildings:new Map([[sourceId,{ring:canopy.footprint,base:canopy.foundationTop,top:canopy.roofTop}]]),
    footageFacadeGroups:new Map(),cityGlassEnvironment:null,terrainHeightAtWorld:()=>13,
    facadeDetailQuads:0,cityComplexRoofDiagnostics:{},cityAppearanceStats:{details:{}},
    buildingDimensions:()=>{throw new Error('Appearance-only canopy must not add generic roof height');},
  };
  vm.createContext(context);vm.runInContext(commit,context);
  return {context,document,feature,batches,canopy,registrations,attachments};
}

for(const quality of ['balanced','lite']) test(`real ${quality} canopy commit attaches one verified fascia identity and retains source registration`,()=>{
  const f=fixture(quality),previous=globalThis.document;
  globalThis.document=f.document;
  try {
    for(const _ of f.context.buildingBatchCommitSteps(f.batches)){}
    assert.equal(f.registrations.length,1);assert.equal(f.attachments.length,1);
    assert.equal(f.registrations[0].sourceId,sourceId);
    assert.deepEqual(JSON.parse(JSON.stringify(f.registrations[0].geometry.coordinates)),f.feature.sourceGeometry);
    assert.equal(f.context.generatedBuildingMeshes.size,5);
    const facade=f.context.footageFacadeGroups.get(sourceId);
    assert.equal(facade,f.attachments[0].group);assert.equal(facade.parent,f.context.buildingGroup);
    assert.equal(facade.userData.renderedSigns.length,1);
    assert.equal(facade.userData.renderedSigns[0].name,'Ultramar');
    const signs=[];facade.traverse(node=>{if(node.isMesh)signs.push(node);});
    assert.equal(signs.length,1);assert.equal(signs[0].name,'frontage-applied-sign');
    assert.ok(signs[0].position.y>f.canopy.undersideY&&signs[0].position.y<f.canopy.roofTop);
    // A repeated feature iteration is permitted by background commits but
    // must not attach a duplicate wordmark or register a second source object.
    const next=new Map();f.feature.batchSet=next;
    f.context.buildingFeaturesByBatch.set(next,[f.feature]);
    const meshCount=f.context.buildingGroup.children.length;
    for(const _ of f.context.buildingBatchCommitSteps(next)){}
    assert.equal(f.registrations.length,1);assert.equal(f.attachments.length,1);
    assert.equal(f.context.footageFacadeGroups.size,1);
    assert.equal(f.context.buildingGroup.children.length,meshCount);
  } finally {globalThis.document=previous;}
});
