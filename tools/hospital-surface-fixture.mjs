/** Deterministic municipal/OSM/lidar source fixture. No edited source outlines.
 * Geometry mirrors the shipped municipal triangle subdivision and Float32 upload;
 * bridge lifts outside the local window and water recess are out of scope. */
import fs from 'node:fs';
import zlib from 'node:zlib';
import * as THREE from '../city-explorer/vendor/three-r180/build/three.module.min.js';
import * as roads from '../city-explorer/road-network.js';
import * as terrainHeightmap from '../city-explorer/terrain-heightmap.js';
import {sampleTriangulatedTerrainHeight} from '../city-explorer/terrain-surface.js';
import {RenderedPavementIndex,officialSurfaceStatusActive,officialBridgeIsVehicular} from '../city-explorer/official-road-surfaces.js';
import {officialRoadMeshEdgeLength} from '../city-explorer/citywide-road-quality.js';
import {reconcileStationPavement} from '../city-explorer/station-pavement-layer.js';
const root = new URL('../',import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
const manifest=read('city-explorer/data/manifest.json');
const osm=read('city-explorer/data/peterborough-osm.json');
const municipal=read('city-explorer/data/peterborough-road-surfaces.geojson');
function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodeTerrainPng(fileUrl) {
  const bytes = fs.readFileSync(fileUrl);
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${fileUrl}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      compressed.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (bitDepth !== 8 || !channels || interlace !== 0) {
    throw new Error(`Unsupported terrain PNG format: depth=${bitDepth}, colour=${colorType}, interlace=${interlace}`);
  }
  const filtered = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset];
    sourceOffset += 1;
    for (let byteIndex = 0; byteIndex < stride; byteIndex += 1) {
      const left = byteIndex >= channels ? pixels[y * stride + byteIndex - channels] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + byteIndex] : 0;
      const upperLeft = y > 0 && byteIndex >= channels ? pixels[(y - 1) * stride + byteIndex - channels] : 0;
      let value = filtered[sourceOffset];
      sourceOffset += 1;
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + above) & 255;
      else if (filter === 3) value = (value + Math.floor((left + above) / 2)) & 255;
      else if (filter === 4) value = (value + paeth(left, above, upperLeft)) & 255;
      else if (filter !== 0) throw new Error(`Unsupported PNG row filter ${filter}`);
      pixels[y * stride + byteIndex] = value;
    }
  }
  return { channels, height, pixels, width };
}
const metadata=read(`city-explorer/data/${manifest.terrain.official.metadata_file}`);
const decoded=decodeTerrainPng(new URL(`city-explorer/data/terrain/${metadata.asset}`,root));
const rgba=Buffer.alloc(decoded.width*decoded.height*4);
for(let from=0,to=0;from<decoded.pixels.length;from+=decoded.channels,to+=4){
 rgba[to]=decoded.pixels[from];rgba[to+1]=decoded.pixels[from+1];rgba[to+2]=decoded.pixels[from+2];rgba[to+3]=255;
}
const longitudeScale=111320*Math.cos(manifest.center.lat*Math.PI/180);
export const project=(lat,lon)=>({x:(lon-manifest.center.lon)*longitudeScale,y:-(lat-manifest.center.lat)*110540});
export const unproject=(x,z)=>({lat:manifest.center.lat-z/110540,lon:manifest.center.lon+x/longitudeScale});
const elevation=(lat,lon)=>terrainHeightmap.sampleOfficialTerrainElevation(metadata,rgba,lat,lon);
const base=elevation(manifest.center.lat,manifest.center.lon);
const terrainCache=new Map();
function terrainFor(lowPower){
 if(terrainCache.has(lowPower))return terrainCache.get(lowPower);
 const corners=[project(manifest.bbox.south,manifest.bbox.west),project(manifest.bbox.north,manifest.bbox.east)];
 const minX=Math.min(...corners.map(p=>p.x))-520,maxX=Math.max(...corners.map(p=>p.x))+520;
 const minZ=Math.min(...corners.map(p=>p.y))-520,maxZ=Math.max(...corners.map(p=>p.y))+520;
 const size=Math.max(maxX-minX,maxZ-minZ),segments=Math.max(192,Math.min(lowPower?340:560,Math.ceil(size/(lowPower?56:34))));
 const grid={size,segments,minX:(minX+maxX-size)/2,minZ:(minZ+maxZ-size)/2,heights:new Float32Array((segments+1)**2)};
 for(let iz=0;iz<=segments;iz++)for(let ix=0;ix<=segments;ix++){
  // PlaneGeometry vertex X/Z are Float32 before terrain height sampling.
  const geo=unproject(Math.fround(grid.minX+ix*size/segments),Math.fround(grid.minZ+iz*size/segments));
  grid.heights[iz*(segments+1)+ix]=elevation(geo.lat,geo.lon)-base;
 }
 const sample=(x,z)=>sampleTriangulatedTerrainHeight(grid,x,z);terrainCache.set(lowPower,sample);return sample;
}
const intersects=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const boundsOf=ring=>ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
export function snapshotGroup(group){return group.children.filter(m=>m.userData.type.startsWith('road-official-')).flatMap(m=>{
 const p=m.geometry.attributes.position.array,layer=m.userData.layer,triangles=[];
 for(let i=0;i<p.length;i+=9)triangles.push({vertices:Array.from(p.slice(i,i+9)),metadata:{layer}});
 return triangles;
});}
export function indexSnapshot(triangles){const index=new RenderedPavementIndex();for(const t of triangles)index.addTriangle(...t.vertices,{...t.metadata,drivable:t.metadata.layer!=='parking_surfaces',parking:t.metadata.layer==='parking_surfaces'});return index;}
export function createHospitalSurfaceFixture({lowPower=false,center={lat:44.301005,lon:-78.34631},halfWidth=260,reconcile=true,radius=120,heightSmoothing=4}={}){
 const p=project(center.lat,center.lon),worldCenter={x:p.x,z:p.y},terrainHeight=terrainFor(lowPower);
 const bounds=[p.x-halfWidth,p.y-halfWidth,p.x+halfWidth,p.y+halfWidth];
 const roadLines=[];
 for(const way of osm.elements){
  if(way.type!=='way')continue;
  const tags=way.tags||{},profile=roads.roadProfile(tags);if(!profile||profile.tunnel)continue;
  const points=(way.geometry||[]).map(v=>project(v.lat,v.lon));if(points.length<2)continue;
  const samples=roads.resampleRoadLine(points,tags,terrainHeight,lowPower);
  if(samples.length>=2)roadLines.push({id:way.id,tags,profile,samples});
 }
 roads.reconcileRoadNetworkElevations(roadLines);
 const roadIndex=new roads.RoadSurfaceIndex(),segments=[];
 for(const line of roadLines)for(let i=1;i<line.samples.length;i++){
  const a=line.samples[i-1],b=line.samples[i];
  const segment={a,b,aY:a.height,bY:b.height,width:line.profile.width,bridge:line.profile.bridge,tags:line.tags,name:line.tags.name||'',lineId:line.id};
  segments.push(segment);roadIndex.add(segment);
 }
 let heightQueries=0;
 const originalSampleAll=roadIndex.sampleAll.bind(roadIndex);roadIndex.sampleAll=(...args)=>{heightQueries++;return originalSampleAll(...args);};
 const heightCache=new Map();
 function officialHeight(x,z,layer){
  const key=`${layer}:${Math.round(x*1000)}:${Math.round(z*1000)}`;
  if(heightCache.has(key))return heightCache.get(key);
  const candidates=roadIndex.sampleAll(x,z,layer==='bridges'?20:layer==='parking_surfaces'?7:14);
  const road=layer==='bridges'?(candidates.find(r=>r.bridge)||candidates[0]):candidates[0];
  const y=Math.max(road?.height??-Infinity,terrainHeight(x,z)+.14)+(layer==='bridges'?.012:layer==='road_surfaces'?.008:.004);
  heightCache.set(key,y);return y;
 }
 const group=new THREE.Group(),polygons=[],positionsByLayer=new Map();
 const station=project(44.3010,-78.32212);
 function append(a,b,c,layer,output,depth=0,local=null){
  const ab=a.distanceToSquared(b),bc=b.distanceToSquared(c),ca=c.distanceToSquared(a),longest=Math.max(ab,bc,ca);
  if(local===null){const x=Math.max(Math.min(a.x,b.x,c.x),Math.min(station.x,Math.max(a.x,b.x,c.x))),z=Math.max(Math.min(a.y,b.y,c.y),Math.min(station.y,Math.max(a.y,b.y,c.y)));local=layer!=='bridges'&&Math.hypot(x-station.x,z-station.y)<240;}
  const edge=officialRoadMeshEdgeLength(layer,{lowPower,nearStation:local});
  if(longest>edge*edge&&depth<(local?20:14)){
   if(longest===ab){const m=a.clone().lerp(b,.5);append(a,m,c,layer,output,depth+1,local);append(m,b,c,layer,output,depth+1,local);}
   else if(longest===bc){const m=b.clone().lerp(c,.5);append(a,b,m,layer,output,depth+1,local);append(a,m,c,layer,output,depth+1,local);}
   else{const m=c.clone().lerp(a,.5);append(a,b,m,layer,output,depth+1,local);append(m,b,c,layer,output,depth+1,local);}return;
  }
  for(const v of [a,c,b])output.push(v.x,officialHeight(v.x,v.y,layer),v.y);
 }
 for(const feature of municipal.features){
  const layer=feature.properties.ptbo_layer;
  const status=Object.entries(feature.properties).find(([k])=>k.toLowerCase()==='status')?.[1];
  if(!officialSurfaceStatusActive(status)||(layer==='bridges'&&!officialBridgeIsVehicular(feature.properties)))continue;
  if(!['road_surfaces','parking_surfaces','bridges'].includes(layer))continue;
  const source=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[];
  for(const polygon of source){
   const rings=polygon.map(r=>r.map(([lon,lat])=>{const v=project(lat,lon);return [v.x,v.y];}));
   if(!intersects(boundsOf(rings[0]),bounds))continue;
   polygons.push({layer,rings});
   const contours=rings.map(r=>r.slice(0,-1).map(v=>new THREE.Vector2(...v)));
   if(!THREE.ShapeUtils.isClockWise(contours[0]))contours[0].reverse();
   contours.slice(1).forEach(r=>{if(THREE.ShapeUtils.isClockWise(r))r.reverse();});
   const vertices=contours.flat(),faces=THREE.ShapeUtils.triangulateShape(contours[0],contours.slice(1));
   if(!positionsByLayer.has(layer))positionsByLayer.set(layer,[]);const positions=positionsByLayer.get(layer);
   for(const [a,b,c]of faces)append(vertices[a],vertices[b],vertices[c],layer,positions);
  }
 }
 for(const [layer,positions]of positionsByLayer){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const mesh=new THREE.Mesh(geometry);mesh.userData={type:`road-official-${layer}-batch`,layer};group.add(mesh);
 }
 const baseline=snapshotGroup(group),baselineIndex=indexSnapshot(baseline),sourcePolygons=JSON.stringify(polygons);
 heightQueries=0;const started=performance.now();
 const result=reconcile?reconcileStationPavement({THREE,group,polygons,center:worldCenter,terrainHeight,roadIndex,Index:RenderedPavementIndex,radius,heightSmoothing}):null;
 const reconcileMilliseconds=performance.now()-started;
 return {center:worldCenter,bounds,group,polygons,sourcePolygons,baseline,baselineIndex,index:result?.index??baselineIndex,result,triangles:snapshotGroup(group),roadLines,roadIndex,segments,terrainHeight,project,unproject,reconcileMilliseconds,get heightQueries(){return heightQueries;}};
}
