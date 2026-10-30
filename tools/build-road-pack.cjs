'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..');
let activeBrowser=null;
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function main(){
/* BEGIN PACK PAINT FINISH */
 const {finalizeRoadMarkings,finishExistingPack,pruneOwnedPackets}=await import('./finalize-road-markings.mjs');
 if(process.argv.includes('--finish-existing'))return finishExistingPack(root);
/* END PACK PAINT FINISH */
 const {partitionRoadGeometry}=await import('../city-explorer/road-pack-build.js');
 const {collectRoadGridNodes,optimizeRoadGeometry}=await import('../city-explorer/road-pack-optimize.js');
 const {encodeRoadTile}=await import('../city-explorer/road-tile-pack.js');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'city-explorer/data/manifest.json')));
 const metadataPath='city-explorer/data/'+(manifest.terrain?.official?.metadata_file||'terrain/peterborough-dtm-2025.json');
 const terrain=JSON.parse(fs.readFileSync(path.join(root,metadataPath)));
 const files=['city-explorer/app.js','city-explorer/connected-road-surface.js','city-explorer/road-network.js','city-explorer/official-road-surfaces.js','city-explorer/road-surface-finish.js','city-explorer/road-terrain-envelope.js','city-explorer/road-paint-geometry.js','city-explorer/road-marking-layout.js','city-explorer/road-marking-paths.js','city-explorer/road-marking-projection.js','city-explorer/street-paint.js','city-explorer/road-appearance-rules.js','city-explorer/city-detail-rules.js','city-explorer/pavement-continuity.js','city-explorer/station-pavement-layer.js','city-explorer/station-road-detail.js','city-explorer/hunter-bridge-surface.js','city-explorer/hunter-bridge-source.js','city-explorer/road-pack-build.js','city-explorer/road-pack-optimize.js','city-explorer/road-pack-export.js','city-explorer/graphics-quality.js','city-explorer/terrain-surface.js','city-explorer/terrain-heightmap.js','city-explorer/water-system.js','city-explorer/land-surface.js','city-explorer/feature-utils.js','city-explorer/citywide-road-quality.js','city-explorer/road-orientation-fix.js','city-explorer/fallback-junction-geometry.js','city-explorer/road-tile-pack.js','city-explorer/assets/station1/layout.json','city-explorer/assets/station2/layout.json','city-explorer/data/peterborough-hydrography.geojson','city-explorer/data/peterborough-city-open-data.geojson','city-explorer/vendor/three-r180/examples/jsm/utils/BufferGeometryUtils.js','tools/build-road-pack.cjs','tests/fixtures/road-terrain-clearance.json','city-explorer/vendor/polygon-clipping-0.15.7.js','city-explorer/vendor/three-r180/build/three.module.min.js','city-explorer/data/manifest.json','city-explorer/data/peterborough-osm.json','city-explorer/data/peterborough-road-surfaces.geojson',metadataPath,path.relative(root,path.resolve(root,path.dirname(metadataPath),terrain.asset)).replaceAll('\\','/')];
/* BEGIN PACK PAINT FINISH */
 files.push('city-explorer/road-marking-pack-finish.js','tools/finalize-road-markings.mjs');
/* END PACK PAINT FINISH */
 const sources=Object.fromEntries(files.map(file=>{let content=fs.readFileSync(path.join(root,file));if(/\.(?:js|mjs|cjs|json|geojson)$/.test(file))content=Buffer.from(content.toString('utf8').replace(/\r\n/g,'\n').replace(/\?v=\d+\.\d+\.\d+/g,'?v=release'));return[file,sha(content)];}));
 const buildId=sha(JSON.stringify(sources)).slice(0,20);
 const {chromium}=require('playwright');const browser=activeBrowser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});
 const tiles=new Map();let report,page;
 try{
  page=await browser.newPage({viewport:{width:1500,height:950},deviceScaleFactor:1});const errors=[];
  page.on('console',m=>{if(m.text().startsWith('Roadbuild:'))console.log(m.text());});
  page.on('pageerror',e=>{errors.push(e.message);console.error('Compiler browser:',e.message);});
  await page.goto((process.env.ROAD_BUILD_URL||'http://127.0.0.1:4186')+'/city-explorer/?roadPack=build&quality=high&qa=1',{waitUntil:'domcontentloaded',timeout:90000});
  await page.waitForFunction(()=>Boolean(window.__PTBO_ROAD_BUILD__)||document.documentElement.dataset.explorerBoot==='failed',null,{timeout:720000});
  if(errors.length)throw new Error('Road compiler page errors: '+errors.join('; '));
  report=await page.evaluate(()=>window.__PTBO_ROAD_BUILD__.report());
  if(report.terrain?.source!=='ontario-lidar-2025'||report.terrain.segments!==Math.max(192,Math.min(340,Math.ceil(report.terrain.size/56))))throw new Error('Compiler requires canonical official terrain: '+JSON.stringify(report.terrain));
  const terrainFixture=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/road-terrain-clearance.json')));
  report.terrainProbes=await page.evaluate(points=>window.__PTBO_ROAD_BUILD__.terrainProbes(points),terrainFixture.points);
  for(const probe of report.terrainProbes)if(!probe.onRoad||probe.heightSource!=='rendered-pavement-triangle'||probe.roadHeight-probe.terrainHeight<terrainFixture.minimumClearance)throw new Error('Compiled pavement terrain clearance failed: '+JSON.stringify(probe));
  console.log('Terrain clearance probes passed: '+JSON.stringify({terrain:report.terrain,probes:report.terrainProbes}));
  await page.evaluate(()=>window.__PTBO_ROAD_BUILD__.pause());
  const ids=await page.evaluate(()=>window.__PTBO_ROAD_BUILD__.meshIds());
  console.log('Compiling '+ids.length+' source road/paint meshes');
  for(let i=0;i<ids.length;i++){
   const groups=await page.evaluate(id=>window.__PTBO_ROAD_BUILD__.exportMesh(id),ids[i]);
   for(const partition of partitionRoadGeometry(groups)){
    if(!tiles.has(partition.id))tiles.set(partition.id,{id:partition.id,x:partition.x,z:partition.z,bounds:{...partition.bounds},groups:new Map()});
    const tile=tiles.get(partition.id);for(const key of ['minX','minZ'])tile.bounds[key]=Math.min(tile.bounds[key],partition.bounds[key]);for(const key of ['maxX','maxZ'])tile.bounds[key]=Math.max(tile.bounds[key],partition.bounds[key]);
    for(const group of partition.groups){
     const key=[group.materialKey,group.kind,group.layer,group.contact].join('|');
     if(!tile.groups.has(key))tile.groups.set(key,{...group,positionChunks:[],normalChunks:[],sourceRanges:[],floatCount:0});
     const target=tile.groups.get(key);const startVertex=target.floatCount/3;
     target.positionChunks.push(group.positions);target.normalChunks.push(group.normals);target.floatCount+=group.positions.length;
     for(const range of group.sourceRanges)target.sourceRanges.push({...range,startVertex:range.startVertex+startVertex});
    }
   }
   if(i&&i%150===0)console.log('Source meshes '+i+'/'+ids.length);
  }
 }catch(error){await browser.close();throw error;}
 for(const [file,expected] of Object.entries(sources)){let content=fs.readFileSync(path.join(root,file));if(/\.(?:js|mjs|cjs|json|geojson)$/.test(file))content=Buffer.from(content.toString('utf8').replace(/\r\n/g,'\n').replace(/\?v=\d+\.\d+\.\d+/g,'?v=release'));if(sha(content)!==expected)throw new Error('Source changed during road compile: '+file+'; rerun required');}
 const output=path.join(root,'city-explorer/data/road-pack');fs.mkdirSync(output,{recursive:true});
 const previous=fs.existsSync(path.join(output,'manifest.json'))?JSON.parse(fs.readFileSync(path.join(output,'manifest.json'))):null;
 const concat=(chunks,count)=>{const output=new Float32Array(count);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}return output;};
 const entries=[],heightCache=new Map(),optimization={};let totalBytes=0,totalRawBytes=0,totalTriangles=0,tileIndex=0;
 for(const tile of [...tiles.values()].sort((a,b)=>a.x-b.x||a.z-b.z)){
  let groups=[...tile.groups.values()].map(({positionChunks,normalChunks,floatCount,positions,normals,...group})=>({...group,positions:concat(positionChunks,floatCount),normals:concat(normalChunks,floatCount)}));
  const nodes=collectRoadGridNodes(groups).filter(node=>!heightCache.has(`${node.x}:${node.z}`));
  for(let i=0;i<nodes.length;i+=5000){const batch=nodes.slice(i,i+5000),values=await page.evaluate(points=>window.__PTBO_ROAD_BUILD__.heightNodes(points),batch);for(let j=0;j<batch.length;j++)heightCache.set(`${batch[j].x}:${batch[j].z}`,values[j]);}
  const optimized=optimizeRoadGeometry(groups,{heightAt:(x,z)=>heightCache.get(`${x}:${z}`)});groups=optimized.groups;
  for(const [key,value] of Object.entries(optimized.stats))if(typeof value==='number')optimization[key]=(optimization[key]||0)+value;
  const buffer=encodeRoadTile({id:tile.id,groups}),transport=zlib.gzipSync(Buffer.from(buffer),{level:9});const url=`${tile.x}_${tile.z}-${sha(Buffer.from(buffer)).slice(0,20)}.bin.gz`;fs.writeFileSync(path.join(output,url),transport);
  const triangles=groups.reduce((sum,g)=>sum+g.positions.length/9,0);totalBytes+=transport.byteLength;totalRawBytes+=buffer.byteLength;totalTriangles+=triangles;
  entries.push({id:tile.id,url,bounds:tile.bounds,bytes:transport.byteLength,rawBytes:buffer.byteLength,compression:'gzip',triangles,sha256:sha(Buffer.from(buffer)),transportSha256:sha(transport)});
  tile.groups.clear();tileIndex++;if(tileIndex%75===0)console.log('Optimized tiles '+tileIndex+'/'+tiles.size);
 }
 await browser.close();activeBrowser=null;
 for(const [file,expected] of Object.entries(sources)){let content=fs.readFileSync(path.join(root,file));if(/\.(?:js|mjs|cjs|json|geojson)$/.test(file))content=Buffer.from(content.toString('utf8').replace(/\r\n/g,'\n').replace(/\?v=\d+\.\d+\.\d+/g,'?v=release'));if(sha(content)!==expected)throw new Error('Source changed during road optimization: '+file+'; rerun required');}
 const pack={schemaVersion:1,buildId,sourceGeneratedAt:report.sourceGeneratedAt,tileSize:512,sources,inventory:report.inventory,terrain:report.terrain,terrainProbes:report.terrainProbes,connected:report.connected,finish:report.finish,markings:report.markings,projection:report.projection,tiles:entries,totalBytes,totalRawBytes,totalTriangles,optimization,method:'Precomputed from finished source renderer; same Float32 faces for all graphics profiles.'};
/* BEGIN PACK PAINT FINISH */
 const sourceStageEntries=await finalizeRoadMarkings(root,pack);
 entries.length=0;entries.push(...pack.tiles);totalBytes=pack.totalBytes;totalRawBytes=pack.totalRawBytes;totalTriangles=pack.totalTriangles;
/* END PACK PAINT FINISH */
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(pack));
/* BEGIN PACK PAINT FINISH */
 pruneOwnedPackets(root,sourceStageEntries,entries);
/* END PACK PAINT FINISH */
 // Only prior compiler-owned, hash-verified compressed outputs may be replaced.
 const retained=new Set(entries.map(tile=>tile.url));
 for(const tile of previous?.tiles||[]){if(!/^-?\d+_-?\d+-[a-f0-9]+\.bin\.gz$/.test(tile.url)||retained.has(tile.url))continue;const file=path.resolve(output,tile.url);if(path.dirname(file)!==path.resolve(output)||!fs.existsSync(file))continue;if(tile.transportSha256&&sha(fs.readFileSync(file))===tile.transportSha256)fs.unlinkSync(file);}

 fs.writeFileSync(path.join(root,'city-explorer/road-pack-version.js'),`// Generated by tools/build-road-pack.cjs.\nexport const ROAD_PACK_ID = '${buildId}';\n`);
 fs.mkdirSync(path.join(root,'artifacts/road-rebuild'),{recursive:true});fs.writeFileSync(path.join(root,'artifacts/road-rebuild/build-report.json'),JSON.stringify(pack,null,2));
 console.log(JSON.stringify({buildId,tiles:entries.length,totalBytes,totalRawBytes,totalTriangles,optimization,connected:report.connected,finish:report.finish,markings:report.markings}));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(activeBrowser)await activeBrowser.close();});
