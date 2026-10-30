import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import {encodeRoadTile} from '../city-explorer/road-tile-pack.js';
import {createRoadTileLayer,loadRoadTileManifest} from '../city-explorer/road-tile-layer.js';
test('tile layer renders and samples identical faces and releases owned GPU geometry',async()=>{
 const parent=new THREE.Group(),material=new THREE.MeshBasicMaterial();let releases=0;const tile={id:'0:0',groups:[{materialKey:'officialRoad',kind:'official-road_surfaces',layer:'road_surfaces',contact:'official',positions:new Float32Array([0,2,0,0,2,10,10,2,0]),normals:new Float32Array([0,1,0,0,1,0,0,1,0]),sourceRanges:[]}]};const buffer=encodeRoadTile(tile);
 const layer=createRoadTileLayer({THREE,parent,materials:{officialRoad:material},manifest:{tiles:[{id:'0:0',url:'0_0.bin',bounds:{minX:0,maxX:10,minZ:0,maxZ:10}}]},baseUrl:'https://example.test/',load:async()=>({ok:true,arrayBuffer:async()=>buffer}),radius:10,retainRadius:20});
 assert.equal(layer.readyAt(1,1),false);await layer.update(0,0);assert.equal(layer.readyAt(1,1),true);assert.equal(parent.children.length,1);assert.equal(parent.children[0].receiveShadow,true,'packed pavement must receive High-profile shadows');assert.equal(layer.sample(1,1,2).height,2);assert.equal(parent.children[0].geometry.getAttribute('position').array[1],2);
 parent.children[0].geometry.addEventListener('dispose',()=>releases++);await layer.dispose();assert.equal(parent.children.length,0);assert.equal(releases,1);assert.equal(layer.sample(1,1),null);
});


test('gzip transport produces the same rendered and contact coordinates',async()=>{
 const {gzipSync}=await import('node:zlib');const raw=encodeRoadTile({id:'0:0',groups:[{materialKey:'officialRoad',kind:'official-road_surfaces',layer:'road_surfaces',contact:'official',positions:new Float32Array([0,3,0,0,3,10,10,3,0]),sourceRanges:[]}]});
 const compressed=Uint8Array.from(gzipSync(new Uint8Array(raw))).buffer;
 const parent=new THREE.Group();const layer=createRoadTileLayer({THREE,parent,materials:{officialRoad:new THREE.MeshBasicMaterial()},manifest:{tiles:[{id:'0:0',url:'tile.bin.gz',bounds:{minX:0,maxX:10,minZ:0,maxZ:10}}]},baseUrl:'https://example.test/',load:async()=>({ok:true,arrayBuffer:async()=>compressed}),radius:10,retainRadius:20});
 await layer.update(0,0);assert.equal(layer.stats().failures,0);assert.equal(layer.sample(1,1,3).height,3);assert.equal(parent.children[0].geometry.attributes.position.array[1],3);await layer.dispose();
});


test('municipal API excludes fallback-only pavement while gameplay retains it',async()=>{
 const {readFileSync}=await import('node:fs');
 const {PackedRoadSurfaceIndex}=await import('../city-explorer/road-tile-pack.js');
 const source=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
 const callback=source.match(/state\.officialDrivableSurfaceIndex=\{contains:([^;]+?),get polygonCount/)[1];
 const index=new PackedRoadSurfaceIndex();
 index.addTile('test',[{materialKey:'asphalt',kind:'road',contact:'fallback',layer:'road_surfaces',positions:new Float32Array([0,2,0,0,2,10,10,2,0])}]);
 const layer={sample:(...args)=>index.sample(...args)};
 const contains=new Function('layer',`return (${callback});`)(layer);
 assert.equal(layer.sample(1,1,2).height,2,'gameplay must retain fallback contact');
 assert.equal(contains(1,1),false,'municipal query must exclude source-only pavement');
 index.addTile('official',[{materialKey:'asphalt',kind:'road',contact:'official',layer:'road_surfaces',positions:new Float32Array([0,2,0,0,2,10,10,2,0])}]);
 assert.equal(contains(1,1),true,'municipal query must accept actual municipal pavement');
 index.addTile('parking',[{materialKey:'asphalt',kind:'parking',contact:'official',layer:'parking_surfaces',positions:new Float32Array([20,2,0,20,2,10,30,2,0])}]);
 assert.equal(contains(21,1),true);
 assert.equal(contains(21,1,{includeParking:false}),false,'caller parking filter still applies');
});


test('a returning browser loads the active road pack without a stale module hint',async()=>{
 const active={schemaVersion:1,buildId:'b'.repeat(20),sourceGeneratedAt:'2026-10-30',tiles:[]};let request;
 const manifest=await loadRoadTileManifest({url:'https://example.test/manifest.json',sourceGeneratedAt:'2026-10-30',load:async(url,options)=>{request={url,options};return{ok:true,json:async()=>active};}});
 assert.equal(request.options.cache,'no-store','browser cache cannot pin an older generated pack');
 assert.equal(manifest.buildId,active.buildId);
});

test('fresh road manifest validation rejects a mismatched source or malformed packet identity',async()=>{
 const active={schemaVersion:1,buildId:'b'.repeat(20),sourceGeneratedAt:'new',tiles:[]};
 const load=async()=>({ok:true,json:async()=>active});
 await assert.rejects(loadRoadTileManifest({url:'https://example.test/',sourceGeneratedAt:'old',load}),/source identity/);
 active.buildId='invalid';await assert.rejects(loadRoadTileManifest({url:'https://example.test/',sourceGeneratedAt:'new',load}),/identity/);
 await assert.rejects(loadRoadTileManifest({url:'https://example.test/',sourceGeneratedAt:'new',load:async()=>({ok:false,status:404})}),/HTTP 404/);
});


test('official-lidar road tiles are not loaded onto fallback terrain',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('../city-explorer/app.js',import.meta.url),'utf8');
 const body=source.match(/async function tryLoadRoadTilePack\(\)\{([\s\S]*?)^\}/m)[1].replaceAll('import.meta.url',"'https://example.test/app.js'");
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('terrain','CONNECTED_ROADS_ENABLED','ROAD_PACK_BUILD','roadParams','state','loadRoadTileManifest',body);
 let calls=0;const load=async()=>{calls++;throw new Error('unexpected pack request on fallback terrain');};
 const result=await run({source:'terrarium-fallback'},true,false,new URLSearchParams(),{manifest:{generated_at:'new'}},load);
 assert.equal(result,null);assert.equal(calls,0);
});


test('cached app terrain must match the physical grid recorded in the road pack',async()=>{
 const terrain={source:'ontario-lidar-2025',segments:322,size:18000};
 const manifest={schemaVersion:1,buildId:'b'.repeat(20),sourceGeneratedAt:'new',terrain:{...terrain,segments:530}};
 const load=async()=>({ok:true,json:async()=>manifest});
 await assert.rejects(loadRoadTileManifest({url:'https://example.test/',sourceGeneratedAt:'new',terrain,load}),/terrain identity/);
 manifest.terrain={...terrain};assert.equal((await loadRoadTileManifest({url:'https://example.test/',sourceGeneratedAt:'new',terrain,load})).buildId,manifest.buildId);
});
