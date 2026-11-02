import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildingReconstructionEntries} from '../city-explorer/building-reconstruction-catalog.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const assetRoot=path.join(root,'city-explorer/assets/building-reconstruction/batch-001');
const input=JSON.parse(fs.readFileSync(path.join(root,'docs/building-reconstruction/batch-001-input.json'))).buildings;
const read=p=>JSON.parse(fs.readFileSync(p));
const built=fs.readdirSync(assetRoot,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(assetRoot,d.name,d.name+'.glb'))).map(d=>d.name);

test('each Blender footprint uses the actual game projection and north-south convention',()=>{
 for(const slug of built){const layout=read(path.join(assetRoot,slug,'layout.json')),source=input.find(b=>b.id===layout.sourceIds[0]);assert.ok(source,slug);
  const expected=source.ring.map(([lon,lat])=>[(lon-layout.origin.lon)*111320*Math.cos(44.3091*Math.PI/180),-(lat-layout.origin.lat)*110540]);
  for(const point of expected)assert.ok(layout.footprint.some(p=>Math.hypot(p[0]-point[0],p[1]-point[1])<.01),`${slug}: source vertex ${point} missing or mirrored`);
  assert.equal(layout.origin.yawDegrees,0);
 }
});
test('generated GLBs satisfy budgets, stable root names, embedded assets and reimport validation',()=>{
 for(const slug of built){const dir=path.join(assetRoot,slug),layout=read(path.join(dir,'layout.json')),report=read(path.join(dir,'asset-report.json')),buffer=fs.readFileSync(path.join(dir,layout.assetFile));
  assert.equal(buffer.toString('ascii',0,4),'glTF');assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
  const gltf=JSON.parse(buffer.subarray(20,20+buffer.readUInt32LE(12)).toString());assert.ok(gltf.nodes.some(n=>n.name===layout.rootName));
  const triangles=gltf.meshes.reduce((n,m)=>n+m.primitives.reduce((v,p)=>v+gltf.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
  const primitives=gltf.meshes.reduce((n,m)=>n+m.primitives.length,0);assert.ok(triangles<=6000,slug+' triangles');assert.ok(primitives<=6,slug+' primitives');assert.ok(gltf.materials.length<=6,slug+' materials');assert.ok(buffer.length<=1000000,slug+' payload');
  assert.ok((gltf.images||[]).every(i=>!i.uri||i.uri.startsWith('data:')));assert.ok((gltf.buffers||[]).every(b=>!b.uri));
  assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'),report.sha256);assert.equal(report.validation.errors,0);assert.ok(report.validation.glbReimport.maxAuthoredBoundsDeltaM<.01);
  const evidence=read(path.join(root,layout.evidenceRecord));assert.ok(evidence.sources.some(s=>s.directly_viewed===true),slug+' needs actually viewed source');assert.ok(layout.estimatedElements.length>0,slug+' estimate boundary');
 }
});
test('only reviewed entries can load and disabled comparison preserves the original city',()=>{
 assert.deepEqual(buildingReconstructionEntries({enabled:false}),[]);const entries=buildingReconstructionEntries({enabled:true});const ids=new Set();for(const e of entries){assert.equal(e.status,'reviewed');assert.ok(e.id.startsWith('reconstruction-'));assert.equal(e.datumMode,'source-footprint');assert.ok(e.foundationMaterialName);assert.equal(e.foundationDepth,4);const assetBuffer=fs.readFileSync(fileURLToPath(new URL(e.assetUrl))),assetJson=JSON.parse(assetBuffer.subarray(20,20+assetBuffer.readUInt32LE(12)));assert.ok(assetJson.materials.some(m=>m.name===e.foundationMaterialName),'runtime foundation material must exist in GLB');assert.ok(!ids.has(e.sourceIds[0]));ids.add(e.sourceIds[0]);assert.ok(!e.sourceIds.includes('way/77715149'),'Portage lacks usable facade evidence');assert.ok(fs.existsSync(fileURLToPath(new URL(e.assetUrl))));}
});
