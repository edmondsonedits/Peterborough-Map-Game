import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {decodeRoadTile} from '../city-explorer/road-tile-pack.js';
import {buildPaintContactIndex} from './finalize-road-markings.mjs';
import {createVisibleMarkingIndex} from '../city-explorer/road-marking-pack-finish.js';
const intersects=(a,b)=>a.minX<=b.maxX+1&&a.maxX>=b.minX-1&&a.minZ<=b.maxZ+1&&a.maxZ>=b.minZ-1;
/** Verify every non-degenerate packed paint triangle against final packed road contact. */
export function verifyRoadMarkings(manifest,loadTile){
 const index=createVisibleMarkingIndex([buildPaintContactIndex(manifest,loadTile)],{maxHeightDelta:Infinity});
 const report={buildId:manifest.buildId,tiles:manifest.tiles.length,paintTiles:0,paintTriangles:0,checkedTriangles:0,tinyTriangles:0,missingSurface:0,belowSurface:0,aboveSurface:0,minClearance:null,maxClearance:null,failures:[]};
 const failure=(kind,tile,group,offset,x,z,y,clearance)=>{report[kind]++;if(report.failures.length<30)report.failures.push({kind,tile:tile.id,material:group.materialKey,vertex:offset/3,x,z,y,clearance});};
 for(const tile of manifest.tiles){
  const packet=loadTile(tile),paints=packet.groups.filter(g=>g.kind==='paint');if(!paints.length)continue;report.paintTiles++;
  for(const group of paints){const p=group.positions;for(let i=0;i<p.length;i+=9){
   report.paintTriangles++;
   const area=Math.abs((p[i+3]-p[i])*(p[i+8]-p[i+2])-(p[i+6]-p[i])*(p[i+5]-p[i+2]))/2;
   // Float32 clipping slivers below one square millimetre have no visible area.
   if(area<1e-6){report.tinyTriangles++;continue;}
   const x=(p[i]+p[i+3]+p[i+6])/3,z=(p[i+2]+p[i+5]+p[i+8])/3,y=(p[i+1]+p[i+4]+p[i+7])/3;
   const hit=index.sample(x,z,y-.012);report.checkedTriangles++;
   if(!hit){failure('missingSurface',tile,group,i,x,z,y,null);continue;}
   const clearance=y-hit.height;report.minClearance=report.minClearance===null?clearance:Math.min(report.minClearance,clearance);report.maxClearance=report.maxClearance===null?clearance:Math.max(report.maxClearance,clearance);
   if(clearance<.006)failure('belowSurface',tile,group,i,x,z,y,clearance);
   else if(clearance>.025)failure('aboveSurface',tile,group,i,x,z,y,clearance);
  }}
 }
 report.passed=report.checkedTriangles>0&&report.missingSurface===0&&report.belowSurface===0&&report.aboveSurface===0;
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),folder=path.join(root,'city-explorer/data/road-pack'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),cache=new Map();
 const load=tile=>{if(cache.has(tile.id)){const packet=cache.get(tile.id);cache.delete(tile.id);cache.set(tile.id,packet);return packet;}const bytes=fs.readFileSync(path.join(folder,tile.url)),packet=decodeRoadTile(bytes[0]===0x1f&&bytes[1]===0x8b?zlib.gunzipSync(bytes):bytes);cache.set(tile.id,packet);if(cache.size>32)cache.delete(cache.keys().next().value);return packet;};
 const report=verifyRoadMarkings(manifest,load);const out=path.resolve(process.env.ROAD_MARKING_VERIFY_REPORT||'artifacts/road-markings/packet-verification.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
}
