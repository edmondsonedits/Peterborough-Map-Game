import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {reconcileStationPavement} from '../city-explorer/station-pavement-layer.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {createFeatureBatchBinding} from '../city-explorer/editor/feature-batch-binding.js';
const rect=(x,z,w,d,y)=>[x,y,z,x,y,z+d,x+w,y,z,x+w,y,z,x,y,z+d,x+w,y,z+d];
function fixture(tracked=true){
 const group=new THREE.Group(),geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute([...rect(-9,-4,7,8,2),...rect(2,-4,7,8,2),...rect(35,-4,7,8,12)],3));
 const mesh=new THREE.Mesh(geometry);mesh.userData.type='road-surface-batch';group.add(mesh);
 const ranges=[{key:'mixed',startVertex:0,vertexCount:6},{key:'mixed',startVertex:6,vertexCount:6},{key:'mixed',startVertex:12,vertexCount:6}];
 const sourceRanges=new Map(tracked?[[mesh,ranges]]:[]);
 const run=(center={x:0,z:0},radius=12)=>reconcileStationPavement({THREE,group,sourceRanges,center,radius,polygons:[{layer:'road_surfaces',rings:[[[-7,-2],[-4,-2],[-4,2],[-7,2],[-7,-2]]]}],terrainHeight:()=>0,roadIndex:{sampleAll:()=>[]},Index:RenderedPavementIndex});
 return {group,mesh,ranges,run};
}
test('clipped/conformed source ranges compose twice without changing rendered geometry',()=>{
 const a=fixture(),b=fixture(false),identity=a.ranges,objects=[...a.ranges];
 const binding=createFeatureBatchBinding([a.ranges[1]],()=>a.mesh);
 for(const center of [{x:0,z:0},{x:2,z:0}]){a.run(center);b.run(center);assert.deepEqual(a.mesh.geometry.attributes.position.array,b.mesh.geometry.attributes.position.array);}
 assert.equal(a.ranges,identity);for(let i=0;i<3;i++)assert.equal(a.ranges[i],objects[i]);
 assert.equal(a.ranges[2].startVertex+a.ranges[2].vertexCount,a.mesh.geometry.attributes.position.count,'all final source vertices have coherent ranges');
 assert.equal(a.mesh.userData.roadGeometryRevision,2);assert.ok(a.ranges.every(r=>r.roadGeometryRevision===2));
 const p=a.mesh.geometry.attributes.position.array;
 for(let j=0;j<3;j++)for(let i=a.ranges[j].startVertex*3;i<(a.ranges[j].startVertex+a.ranges[j].vertexCount)*3;i+=3)assert.ok(j===0?p[i]<=-2:j===1?p[i]>=2&&p[i]<=9:p[i]>=35,'source ownership survives splitting');
 const before=p.slice();binding.setVisible(false);
 for(let i=0;i<p.length;i++)assert.equal(p[i],i>=a.ranges[1].startVertex*3&&i<(a.ranges[1].startVertex+a.ranges[1].vertexCount)*3?0:before[i]);
 binding.restore();assert.deepEqual(p,before);
});
test('fully removed source range remains the same zero-length editor range',()=>{
 const f=fixture(),r=f.ranges[0];
 reconcileStationPavement({THREE,group:f.group,sourceRanges:new Map([[f.mesh,f.ranges]]),center:{x:0,z:0},radius:12,polygons:[{layer:'road_surfaces',rings:[[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]]]}],terrainHeight:()=>0,roadIndex:{sampleAll:()=>[]},Index:RenderedPavementIndex});
 assert.equal(f.ranges[0],r);assert.equal(r.vertexCount,0);
});
test('throwing reconciliation leaves original geometry and source ranges intact',()=>{
 const f=fixture(),geometry=f.mesh.geometry,prior=JSON.stringify(f.ranges);
 assert.throws(()=>reconcileStationPavement({THREE,group:f.group,sourceRanges:new Map([[f.mesh,f.ranges]]),center:{x:0,z:0},radius:12,polygons:[{layer:'road_surfaces',rings:[[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]]]}],terrainHeight:()=>{throw Error('source failure');},roadIndex:{sampleAll:()=>[]},Index:RenderedPavementIndex}),/source failure/);
 assert.equal(f.mesh.geometry,geometry);assert.equal(JSON.stringify(f.ranges),prior);
});
