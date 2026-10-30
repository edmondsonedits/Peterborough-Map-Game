import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {exportRoadScene} from '../city-explorer/road-pack-export.js';
test('baked contact uses actual transformed Float32 render triangles and source identities',()=>{const roadGroup=new THREE.Group(),streetscapeGroup=new THREE.Group();const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,2,2,0,0],3));geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry);mesh.position.set(5,2,3);mesh.userData={type:'road-official-road_surfaces-batch',material:'officialRoad'};roadGroup.add(mesh);const result=exportRoadScene({THREE,roadGroup,streetscapeGroup,generatedRoadMeshes:new Map([['road:1',mesh]]),roadPaintRanges:new Map([['way/7',[{key:'road:1',startVertex:0,vertexCount:3}]]])});assert.equal(result.length,1);assert.deepEqual(result[0].positions,[5,2,3,5,2,5,7,2,3]);assert.equal(result[0].contact,'official');assert.equal(result[0].sourceRanges[0].sourceId,'way/7');});
test('paint and sidewalk retain visual geometry without becoming driving surfaces',()=>{const roadGroup=new THREE.Group(),streetscapeGroup=new THREE.Group();const geometry=new THREE.PlaneGeometry(2,2);const mesh=new THREE.Mesh(geometry);mesh.userData={type:'mapped-turn-arrows',material:'roadPaintWhite'};streetscapeGroup.add(mesh);const out=exportRoadScene({THREE,roadGroup,streetscapeGroup});assert.equal(out.length,1);assert.equal(out[0].contact,null);assert.equal(out[0].kind,'paint');});

test('offline compiler exposes complete roads before unrelated actor and scenery startup',async()=>{
 const {readFileSync}=await import('node:fs');const app=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
 const start=app.indexOf('async function buildCity('),body=app.slice(start,app.indexOf('function applyCityOverrides',start));
 const paint=body.indexOf('buildRoadMarkings(state.roadMarkingSegments || [])'),exportReady=body.indexOf('if(ROAD_PACK_BUILD){installRoadBuildExport();return;}'),actors=body.indexOf('initializeGameplay(');
 assert.ok(paint>=0&&exportReady>paint&&actors>exportReady,'only the offline build returns after complete road geometry and before actor loading');
 assert.match(app,/let roadBuildPaused=ROAD_PACK_BUILD/,'offline mesh generation does not render the entire source city while compiling');
});
