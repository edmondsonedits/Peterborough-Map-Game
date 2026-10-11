import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { reviewedPaintTags } from '../city-explorer/street-paint.js';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
const app=fs.readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
test('primary GeoJSON parser suffixes must resolve to the reviewed OSM way',()=>{
 const tags={highway:'secondary',name:'Sherbrooke Street',lanes:'4'};
 for(const id of ['way/460581459:0','way/460581459:1','way/460581459','460581459'])assert.equal(reviewedPaintTags(tags,id).lanes,'2',id);
 for(const id of ['relation/460581459:0','way/460581459:garbage','way/4605814590:0'])assert.equal(reviewedPaintTags(tags,id),tags,id);
 assert.ok(app.includes('`${featureId}:${lineIndex}`'),'The primary parser creates suffixed source IDs');
});
test('legacy fallback junction contact follows its actual cap top, not the lower ribbon',()=>{
 const state={objectCount:0,fallbackJunctionSurfaceIndex:null};
 const group=new THREE.Group();
 const fn=app.match(/^function buildRoadJunctions\([^]*?^\}/m)[0];
 const env={THREE,state,roadGroup:group,RenderedPavementIndex,URLSearchParams,location:{search:''},
  materials:{roadLocal:new THREE.MeshBasicMaterial(),roadEdge:new THREE.MeshBasicMaterial()},
  roadRenderTileCoordinates:()=>({x:0,z:0}),ROAD_RENDER_TILE_SIZE:400,
  roadProfilePriority:()=>3,attachRoadInstance:()=>{},solveFallbackJunctions:()=>null};
 const run=Function(...Object.keys(env),fn+';return buildRoadJunctions;')(...Object.values(env));
 run([{a:new THREE.Vector2(0,0),b:new THREE.Vector2(0,10),aY:1,bY:1,width:6,
  aSourceVertex:true,bSourceVertex:true,aLineEndpoint:true,bLineEndpoint:true,lineId:'way/1:0',
  profile:{surfaceKey:'roadLocal',edgeKey:'roadEdge',edgeExtra:.6,renderClass:'local'}}]);
 assert.ok(state.fallbackJunctionSurfaceIndex,'Visible junction caps need a matching driving/paint surface');
 const hit=state.fallbackJunctionSurfaceIndex.sample(0,0,1);
 const top=group.children.find(m=>m.userData.type==='road-junction-surfaces');
 const matrix=new THREE.Matrix4();top.getMatrixAt(0,matrix);
 const p=top.geometry.getAttribute('position'),n=top.geometry.getAttribute('normal');
 let actualTop=-Infinity;
 for(let i=0;i<p.count;i++)if(n.getY(i)>.5)actualTop=Math.max(actualTop,new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).y);
 assert.ok(Math.abs(hit.height-actualTop)<1e-6,`${hit.height} vs rendered ${actualTop}`);
 assert.ok(hit.height>1.0179 && hit.height<1.0181);
 assert.equal(state.fallbackJunctionSurfaceIndex.sample(3.2,0),null,'Foundation is not pavement');
});
