import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {decodeRoadTile,encodeRoadTile} from '../city-explorer/road-tile-pack.js';
import {RenderedPavementIndex} from '../city-explorer/official-road-surfaces.js';
import {finishPaintGroup} from '../city-explorer/road-marking-pack-finish.js';
const addedSources=['city-explorer/road-marking-pack-finish.js','tools/finalize-road-markings.mjs'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const normalize=bytes=>Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n').replace(/\?v=\d+\.\d+\.\d+/g,'?v=release'));
export const fingerprintedSourceBytes=(file,bytes)=>/\.(?:js|mjs|cjs|json|geojson)$/.test(file)?normalize(bytes):bytes;
const sourceBytes=(root,file)=>fingerprintedSourceBytes(file,fs.readFileSync(path.join(root,file)));
export function stripFinishingBlocks(source){return source.replace(/\/\* BEGIN PACK PAINT FINISH \*\/[\s\S]*?\/\* END PACK PAINT FINISH \*\/\r?\n?/g,'');}
const controllerStageHash=root=>sha(normalize(Buffer.from(stripFinishingBlocks(fs.readFileSync(path.join(root,'tools/build-road-pack.cjs'),'utf8')))));
export function packLoader(root,manifest){
 const folder=path.join(root,'city-explorer/data/road-pack'),cache=new Map();
 return tile=>{if(cache.has(tile.url)){const p=cache.get(tile.url);cache.delete(tile.url);cache.set(tile.url,p);return p;}if(!/^-?\d+_-?\d+-[a-f0-9]{20}\.bin\.gz$/.test(tile.url)||!tile.url.startsWith(tile.id.replace(':','_')+'-'))throw new Error('Invalid tile path: '+tile.url);const bytes=fs.readFileSync(path.join(folder,tile.url));if(sha(bytes)!==tile.transportSha256)throw new Error('Input transport hash mismatch: '+tile.id);const raw=bytes[0]===0x1f&&bytes[1]===0x8b?zlib.gunzipSync(bytes):bytes;if(sha(raw)!==tile.sha256||raw.length!==tile.rawBytes)throw new Error('Input raw hash mismatch: '+tile.id);const p=decodeRoadTile(raw);cache.set(tile.url,p);if(cache.size>32)cache.delete(cache.keys().next().value);return p;};
}
export function buildPaintContactIndex(manifest,load){
 const index=new RenderedPavementIndex(12);
 for(const tile of manifest.tiles)for(const g of load(tile).groups){if(!g.contact||g.layer==='parking_surfaces')continue;const p=g.positions,meta={layer:g.layer,contact:g.contact,kind:g.kind};for(let i=0;i<p.length;i+=9)index.addTriangle(p[i],p[i+1],p[i+2],p[i+3],p[i+4],p[i+5],p[i+6],p[i+7],p[i+8],meta);}
 return index;
}
export function pruneOwnedPackets(root,prior,retained){
 const folder=path.resolve(root,'city-explorer/data/road-pack'),urls=new Set(retained.map(t=>t.url));
 for(const tile of prior){if(urls.has(tile.url)||!/^[-0-9]+_[-0-9]+-[a-f0-9]+\.bin\.gz$/.test(tile.url))continue;const file=path.resolve(folder,tile.url);if(path.dirname(file)!==folder||!fs.existsSync(file))continue;if(tile.transportSha256&&sha(fs.readFileSync(file))===tile.transportSha256)fs.unlinkSync(file);}
}
function nonPaintSignature(groups){
 const hash=crypto.createHash('sha256');
 for(const g of groups.filter(g=>g.kind!=='paint')){hash.update(JSON.stringify([g.materialKey,g.kind,g.layer,g.contact,g.sourceRanges]));for(const a of [g.positions,g.normals])if(a)hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
 return hash.digest('hex');
}
/** Complete paint only after all optimized contact tiles are fixed. */
export async function finalizeRoadMarkings(root,manifest){
 const originalTiles=manifest.tiles.map(t=>({...t})),load=packLoader(root,manifest),index=buildPaintContactIndex(manifest,load),stats={};
 const folder=path.join(root,'city-explorer/data/road-pack'),entries=[];let bytes=0,rawBytes=0,triangles=0,paintTriangles=0;
 for(let n=0;n<originalTiles.length;n++){
  const tile=originalTiles[n],packet=load(tile),groups=packet.groups.map(group=>{const result=finishPaintGroup(group,[index]);for(const[key,value]of Object.entries(result.stats))if(typeof value==='number')stats[key]=(stats[key]||0)+value;return result.group;}).filter(g=>g.positions.length);
  const raw=Buffer.from(encodeRoadTile({id:tile.id,groups})),compressed=zlib.gzipSync(raw,{level:9}),url=tile.id.replace(':','_')+'-'+sha(raw).slice(0,20)+'.bin.gz';
  if(nonPaintSignature(packet.groups)!==nonPaintSignature(decodeRoadTile(raw).groups))throw new Error('Nonpaint geometry changed: '+tile.id);
  fs.writeFileSync(path.join(folder,url),compressed);
  const count=groups.reduce((sum,g)=>sum+g.positions.length/9,0);paintTriangles+=groups.filter(g=>g.kind==='paint').reduce((sum,g)=>sum+g.positions.length/9,0);
  entries.push({...tile,url,bytes:compressed.length,rawBytes:raw.length,triangles:count,sha256:sha(raw),transportSha256:sha(compressed)});bytes+=compressed.length;rawBytes+=raw.length;triangles+=count;
  if(n&&n%100===0)console.log('Final paint tiles '+n+'/'+originalTiles.length);
 }
 manifest.tiles=entries;manifest.totalBytes=bytes;manifest.totalRawBytes=rawBytes;manifest.totalTriangles=triangles;
 manifest.markings={...manifest.markings,version:'joined-paths-visible-contact-2',finalization:{...stats,paintTriangles,contactTriangles:index.triangleCount,maximumLowering:.025,sameGradeTolerance:.5}};
 return originalTiles;
}
/** Incremental finalization is allowed only when every source-stage byte matches,
 * including the controller after removing exactly the additive finishing blocks. */
export async function finishExistingPack(root){
 const folder=path.join(root,'city-explorer/data/road-pack'),manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'))),baseId=manifest.buildId;
 if(manifest.markings?.version!=='joined-paths-exact-faces-1')throw new Error('Expected an unfinished joined-path source-stage pack');
 for(const[file,expected]of Object.entries(manifest.sources)){
  const actual=file==='tools/build-road-pack.cjs'?controllerStageHash(root):sha(sourceBytes(root,file));
  if(actual!==expected)throw new Error('Source-stage input changed; full compile required: '+file);
 }
 const files=[...Object.keys(manifest.sources),...addedSources];
 const sources=Object.fromEntries(files.map(file=>[file,sha(sourceBytes(root,file))]));
 manifest.sources=sources;manifest.buildId=sha(JSON.stringify(sources)).slice(0,20);
 const prior=await finalizeRoadMarkings(root,manifest);
 for(const[file,expected]of Object.entries(sources))if(sha(sourceBytes(root,file))!==expected)throw new Error('Finalization input changed: '+file);
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'city-explorer/road-pack-version.js'),`// Generated by tools/build-road-pack.cjs.\nexport const ROAD_PACK_ID = '${manifest.buildId}';\n`);
 pruneOwnedPackets(root,prior,manifest.tiles);
 const out=path.join(root,'artifacts/road-markings');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'finalization-receipt.json'),JSON.stringify({baseBuildId:baseId,buildId:manifest.buildId,sourceStageInputsVerified:Object.keys(sources).length-addedSources.length,controllerSourceStageHash:controllerStageHash(root),stats:manifest.markings.finalization},null,2));
 console.log(JSON.stringify({buildId:manifest.buildId,tiles:manifest.tiles.length,totalBytes:manifest.totalBytes,totalRawBytes:manifest.totalRawBytes,totalTriangles:manifest.totalTriangles,finalization:manifest.markings.finalization}));
 return manifest;
}
