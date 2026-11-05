#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { stationOneTruckSpawn } from '../city-explorer/station-one-core.mjs';
import { stationTruckSpawn as stationTwoTruckSpawn } from '../city-explorer/station-two-core.mjs';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import { geometryPolygons } from '../city-explorer/feature-utils.js';
import { reviewedWaterHoles } from '../city-explorer/water-shorelines.js';
import { HydroSurfaceIndex, WATER_TERRAIN_RECESS, createWaterStageSampler, relativeWaterElevation, robustFallbackWaterHeight, subdivideWaterTriangle } from '../city-explorer/water-system.js';
import { canonicalTextHash } from '../city-explorer/multiplayer/canonical-source-hash.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const city = path.join(root, 'city-explorer');
const arg = process.argv.indexOf('--out');
const out = path.resolve(arg >= 0 ? process.argv[arg + 1] : path.join(city, 'multiplayer/world-data/v1'));
if (arg >= 0 && !process.argv[arg + 1]) throw new Error('--out requires a directory');
const readJson = async p => JSON.parse(await readFile(p, 'utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const shaTextFile = async p => canonicalTextHash(await readFile(p,'utf8'));
const shaJson = value => canonicalTextHash(JSON.stringify(value));
const align4 = n => (n + 3) & ~3;
const manifest = await readJson(path.join(city, 'data/manifest.json'));
const terrainMeta = await readJson(path.join(city, 'data/terrain/peterborough-dtm-2025.json'));
const roadPack = await readJson(path.join(city, 'data/road-pack/manifest.json'));
const station1 = await readJson(path.join(city, 'assets/station1/layout.json'));
const station2 = await readJson(path.join(city, 'assets/station2/layout.json'));
const png = await readFile(path.join(city, 'data/terrain', terrainMeta.asset));

function decodePngRgb(bytes) {
  if (bytes.toString('ascii', 1, 4) !== 'PNG' || bytes[24] !== 8 || bytes[25] !== 2) throw new Error('Terrain DTM must be 8-bit RGB PNG');
  const width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20), chunks=[];
  for(let offset=8;offset<bytes.length;){const size=bytes.readUInt32BE(offset);const type=bytes.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(bytes.subarray(offset+8,offset+8+size));offset+=12+size;if(type==='IEND')break;}
  const raw=inflateSync(Buffer.concat(chunks)),stride=width*3,pixels=Buffer.alloc(stride*height);let cursor=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[cursor++],row=y*stride,prev=row-stride;for(let x=0;x<stride;x++){const value=raw[cursor++],left=x>=3?pixels[row+x-3]:0,up=y?pixels[prev+x]:0,upperLeft=y&&x>=3?pixels[prev+x-3]:0;let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=Math.floor((left+up)/2);else if(filter===4)predictor=paeth(left,up,upperLeft);else if(filter!==0)throw new Error(`Unsupported PNG filter ${filter}`);pixels[row+x]=(value+predictor)&255;}}
  return {width,height,pixels};
}
const image=decodePngRgb(png), bounds=terrainMeta.bounds.webMercatorEpsg3857, center=manifest.center;
const lonScale=111320*Math.cos(center.lat*Math.PI/180),latScale=110540;
const project=(lat,lon)=>({x:(lon-center.lon)*lonScale,z:-(lat-center.lat)*latScale});
const worldCorners=[project(manifest.bbox.south,manifest.bbox.west),project(manifest.bbox.south,manifest.bbox.east),project(manifest.bbox.north,manifest.bbox.west),project(manifest.bbox.north,manifest.bbox.east)];
const minX=Math.min(...worldCorners.map(p=>p.x))-520,maxX=Math.max(...worldCorners.map(p=>p.x))+520,minZ=Math.min(...worldCorners.map(p=>p.z))-520,maxZ=Math.max(...worldCorners.map(p=>p.z))+520;
const terrainSize=roadPack.terrain.size,segments=roadPack.terrain.segments,gridMinX=(minX+maxX)/2-terrainSize/2,gridMinZ=(minZ+maxZ)/2-terrainSize/2;
const webMercator=(lat,lon)=>{const r=6378137,rad=lat*Math.PI/180;return{x:r*lon*Math.PI/180,y:r*Math.log(Math.tan(Math.PI/4+rad/2))};};
const elevation=(lat,lon)=>{const point=webMercator(lat,lon),px=(point.x-bounds.xmin)/(bounds.xmax-bounds.xmin)*image.width-.5,py=(bounds.ymax-point.y)/(bounds.ymax-bounds.ymin)*image.height-.5;
 const x=Math.max(0,Math.min(image.width-1,px)),y=Math.max(0,Math.min(image.height-1,py)),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(image.width-1,x0+1),y1=Math.min(image.height-1,y0+1),tx=x-x0,ty=y-y0;
 const sample=(sx,sy)=>{const i=(sy*image.width+sx)*3;return image.pixels[i]*256+image.pixels[i+1]+image.pixels[i+2]/256-32768;};
 return (sample(x0,y0)*(1-tx)+sample(x1,y0)*tx)*(1-ty)+(sample(x0,y1)*(1-tx)+sample(x1,y1)*tx)*ty;};
const base=elevation(center.lat,center.lon),heights=new Float32Array((segments+1)**2);

const hydroFile=path.join(city,'data/peterborough-hydrography.geojson'),hydroJson=await readJson(hydroFile),hydroIndex=new HydroSurfaceIndex(120);
for(const feature of hydroJson.features||[]){const properties=feature.properties||{};if(properties.source_kind==='ohn_watercourse'||!['lidar_breakline','ohn_waterbody'].includes(properties.source_kind))continue;for(const polygonCoordinates of geometryPolygons(feature)){const terrainSamples=polygonCoordinates.flatMap(ring=>ring.filter(c=>Array.isArray(c)&&c.length>=2).map(([lon,lat])=>{const q=project(lat,lon);return elevation(lat,lon)-base;}));const fallbackHeight=robustFallbackWaterHeight(terrainSamples);const rings=polygonCoordinates.map(coordinates=>{const points=coordinates.filter(c=>Array.isArray(c)&&c.length>=2).map(([lon,lat,absoluteElevation])=>{const q=project(lat,lon),stage=relativeWaterElevation(absoluteElevation,base);return{x:q.x,z:q.z,y:Number.isFinite(stage)?stage:fallbackHeight};});if(points.length>2&&Math.hypot(points[0].x-points.at(-1).x,points[0].z-points.at(-1).z)<.01)points.pop();return points;});if(!rings[0]||rings[0].length<3)continue;let contour=rings[0],contour2d=contour.map(q=>new THREE.Vector2(q.x,q.z));if(!THREE.ShapeUtils.isClockWise(contour2d)){contour=contour.slice().reverse();contour2d=contour2d.slice().reverse();}const holes=[],holes2d=[];for(const sourceHole of rings.slice(1)){if(sourceHole.length<3)continue;let hole=sourceHole,hole2d=hole.map(q=>new THREE.Vector2(q.x,q.z));if(THREE.ShapeUtils.isClockWise(hole2d)){hole=hole.slice().reverse();hole2d=hole2d.slice().reverse();}holes.push(hole);holes2d.push(hole2d);}const stageSampler=createWaterStageSampler([contour,...holes],{fallbackHeight,sampleSpacing:30,cellSize:90});for(const coordinates of reviewedWaterHoles(feature.id,polygonCoordinates)){const ring=coordinates.map(([lon,lat])=>{const q=project(lat,lon);return new THREE.Vector2(q.x,q.z);});if(THREE.ShapeUtils.isClockWise(ring))ring.reverse();holes.push(ring.map(q=>({x:q.x,z:q.y,y:stageSampler(q.x,q.y)})));holes2d.push(ring);}const faces=THREE.ShapeUtils.triangulateShape(contour2d,holes2d),vertices=contour.concat(...holes),stages=vertices.map(q=>q.y).filter(Number.isFinite),stageRange=stages.length?Math.max(...stages)-Math.min(...stages):0;for(const face of faces){const [a,b,c]=face.map(i=>vertices[i]);if(!a||!b||!c)continue;const triangles=stageRange>.35?subdivideWaterTriangle(a,b,c,stageSampler,{maximumEdge:72,maximumTriangles:4096}):[[a,b,c]];for(const triangle of triangles)hydroIndex.addTriangle(...triangle);}}}
for(let row=0;row<=segments;row++)for(let col=0;col<=segments;col++){const x=Math.fround(Math.fround(col*terrainSize/segments-terrainSize/2)+(minX+maxX)/2),z=Math.fround(Math.fround(row*terrainSize/segments-terrainSize/2)+(minZ+maxZ)/2),lat=center.lat-z/latScale,lon=center.lon+x/lonScale;let h=elevation(lat,lon)-base,water=hydroIndex.heightAt(x,z);if(Number.isFinite(water))h=Math.min(h,water-WATER_TERRAIN_RECESS);heights[row*(segments+1)+col]=h;}
const s1=stationOneTruckSpawn(station1,(lat,lon)=>{const p=project(lat,lon);return{x:p.x,z:p.z,y:p.z};});
const s2=stationTwoTruckSpawn(station2,(lat,lon)=>{const p=project(lat,lon);return{x:p.x,z:p.z,y:p.z};});
const s3={anchor:project(44.28490065,-78.3506243),yaw:Math.atan2(-Math.sin(234.63*Math.PI/180),-Math.cos(234.63*Math.PI/180))};
const sourceHashes={sourceHasher:await shaTextFile(path.join(city,'multiplayer/canonical-source-hash.mjs')),terrainPng:sha(png),terrainMetadata:shaJson(terrainMeta),hydrography:shaJson(hydroJson),roadPackManifest:shaJson(roadPack),stationOneLayout:shaJson(station1),stationTwoLayout:shaJson(station2),stationOneCore:await shaTextFile(path.join(city,'station-one-core.mjs')),stationTwoCore:await shaTextFile(path.join(city,'station-two-core.mjs')),stationThreeCollider:await shaTextFile(path.join(city,'station-three-bay.mjs')),movementCore:await shaTextFile(path.join(city,'multiplayer/movement-core.mjs')),wheelContact:await shaTextFile(path.join(city,'road-wheel-contact.js')),roadTileSelector:await shaTextFile(path.join(city,'road-tile-pack.js')),worldCollision:await shaTextFile(path.join(city,'multiplayer/world-collision.mjs')),stationHeightRecord:await shaTextFile(path.join(city,'multiplayer/station-height-record.mjs'))};
const metadata={schemaVersion:1,worldVersion:'pending',sourceHashes,terrain:{source:'ontario-lidar-2025',sourcePngSha256:sha(png),sourceMetadataSha256:shaJson(terrainMeta),baseElevation:base,minX:gridMinX,minZ:gridMinZ,size:terrainSize,segments,datum:'CGVD2013 relative to centre elevation'},stations:[
 {number:1,anchor:s1.anchor,yaw:s1.yaw,datum:null,layout:station1},
 {number:2,anchor:s2.anchor,yaw:s2.yaw,datum:null,layout:station2},
 {number:3,anchor:s3.anchor,yaw:s3.yaw,door:{centerX:-.7,width:4.6,halfThickness:.15}}
]};
const terrainBytes=Buffer.from(heights.buffer);
metadata.worldVersion=sha(Buffer.concat([Buffer.from(roadPack.buildId),Buffer.from(JSON.stringify({...metadata,worldVersion:null})),terrainBytes])).slice(0,24);
const metaBytes=Buffer.from(JSON.stringify(metadata)),bodyOffset=align4(16+metaBytes.length),data=Buffer.alloc(bodyOffset+terrainBytes.length);
data.write('PTMW',0,'ascii');data.writeUInt16LE(1,4);data.writeUInt16LE(0,6);data.writeUInt32LE(metaBytes.length,8);data.writeUInt32LE(terrainBytes.length,12);metaBytes.copy(data,16);terrainBytes.copy(data,bodyOffset);
const roadTiles=roadPack.tiles.map(tile=>({id:tile.id,bounds:tile.bounds,url:`../../../data/road-pack/${tile.url}`,rawBytes:tile.rawBytes,bytes:tile.bytes,triangles:tile.triangles,sha256:tile.sha256,transportSha256:tile.transportSha256}));
const roadPackManifestSha256=shaJson(roadPack);
const hydroSha256=shaJson(hydroJson);const worldManifest={schemaVersion:1,worldVersion:metadata.worldVersion,city:'Peterborough, Ontario',coordinateSystem:'app local metre grid; x east, z south, y relative to Ontario DTM centre',bounds:{minX,maxX,minZ,maxZ},terrain:{segments,size:terrainSize,gridMinX,gridMinZ,sample:'PlaneGeometry two-triangle cell, diagonal h01-to-h10',binaryOffset:bodyOffset,binaryBytes:terrainBytes.length},roadPack:{buildId:roadPack.buildId,sourceGeneratedAt:roadPack.sourceGeneratedAt,tileSize:roadPack.tileSize,tileCount:roadTiles.length,triangles:roadTiles.reduce((sum,t)=>sum+t.triangles,0),manifestSha256:roadPackManifestSha256,tiles:roadTiles},dataFile:'world-data.bin',dataSha256:sha(data),dataBytes:data.length,staticCollision:{stations:[1,2,3],coverage:'same authored station runtime/layout collision and Station 3 door sweep used by the browser; excludes dynamic actors'},sourceHashes};
await mkdir(out,{recursive:true});await writeFile(path.join(out,'world-data.bin'),data);await writeFile(path.join(out,'world-manifest.json'),JSON.stringify(worldManifest));
const {loadWorldCollision}=await import('../city-explorer/multiplayer/world-collision.mjs');const sharedWorld=await loadWorldCollision({manifestUrl:path.join(out,'world-manifest.json')});const stationHeights={schemaVersion:1,worldVersion:worldManifest.worldVersion,roadPackBuildId:roadPack.buildId,stations:sharedWorld.stations.filter(station=>[1,2].includes(station.number)).map(({number,datum,groundMin})=>({number,datum,groundMin}))};await writeFile(path.join(out,'station-heights.json'),JSON.stringify(stationHeights));
console.log(JSON.stringify({out,worldVersion:worldManifest.worldVersion,segments,roadTiles:roadTiles.length,roadTriangles:worldManifest.roadPack.triangles,dataBytes:data.length,roadBuildId:roadPack.buildId}));
