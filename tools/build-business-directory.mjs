// Offline, deterministic catalogue builder. Raw downloads stay in the private reference cache.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {Vector2} from '../city-explorer/vendor/three-r180/build/three.core.min.js';
import {FOOTAGE_PROFILES} from '../city-explorer/sherbrooke-footage-profiles.js';
import {featureTags,geometryPolygons,geometryLines,simplifyRing,parseMeters,polygonArea} from '../city-explorer/feature-utils.js';
import {planBusinessWallSigns} from '../city-explorer/business-sign-layout.js';
import {createBuildingIndex,matchBusinessToBuilding,chooseBusinessFrontage,deduplicateBusinesses,boundaryDistance,chooseEntranceFrontage,reconcileSourceCoordinates,signFootprintOccluders} from './business-building-match.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=filename=>JSON.parse(fs.readFileSync(filename,'utf8').replace(/^\uFEFF/,''));
const args=process.argv.slice(2),value=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const input=value('--input',null);
if(!input)throw new Error('Supply --input normalized-source.json; no network is performed by this builder.');
const output=value('--output',path.join(root,'city-explorer/data/business-directory.json'));
const manifest=read(path.join(root,'city-explorer/data/manifest.json')),center=manifest.center;
const lonScale=111320*Math.cos(center.lat*Math.PI/180),latScale=110540;
const project=(lat,lon)=>({x:(lon-center.lon)*lonScale,z:-(lat-center.lat)*latScale});
const unproject=(x,z)=>({lat:center.lat-z/latScale,lon:center.lon+x/lonScale});
const sandbox={module:{exports:{}},exports:{},console};
vm.runInNewContext(fs.readFileSync(path.join(root,'city-explorer/vendor/osmtogeojson-3.0.0-beta.5/osmtogeojson.js'),'utf8'),sandbox);
const raw=read(path.join(root,'city-explorer/data/peterborough-osm.json'));
const osm=sandbox.module.exports(raw,{flatProperties:false});
const buildings=[],roads=[];
function ringsFor(coords,sourceId){return coords.map(ring=>{const points=ring.map(([lon,lat])=>{const p=project(lat,lon);return new Vector2(p.x,p.z)});const rendered=FOOTAGE_PROFILES[sourceId]?points:simplifyRing(points,.72,110);return rendered.map(p=>({x:p.x,z:p.y}))}).filter(r=>r.length>=4)}
function addBuilding(feature,sourceId){const properties=featureTags(feature),profile=FOOTAGE_PROFILES[sourceId];const height=profile?.detailHeightMetres||profile?.height||parseMeters(properties.height)||Math.max(3,(Number(properties['building:levels'])||2)*(properties.shop==='mall'?4.8:3.15));const polygons=geometryPolygons(feature).map(coords=>({rings:ringsFor(coords,sourceId),base:0,wallTop:height})).filter(p=>p.rings.length);if(!polygons.length)return;buildings.push({sourceId,properties,polygons,area:polygons.reduce((n,p)=>n+polygonArea(p.rings[0].map(v=>({x:v.x,y:v.z}))),0)})}
for(const feature of osm.features){const tags=featureTags(feature);if(tags.building||tags['building:part'])addBuilding(feature,feature.id);if(/^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|pedestrian)(?:_link)?$/.test(tags.highway||''))for(const line of geometryLines(feature))for(let i=1;i<line.length;i++){const a=project(line[i-1][1],line[i-1][0]),b=project(line[i][1],line[i][0]);if(Math.hypot(b.x-a.x,b.z-a.z)>.2)roads.push({name:tags.name||'',type:tags.highway,a,b})}}
for(const feature of read(path.join(root,'city-explorer/data/peterborough-official-buildings.geojson')).features){if(feature.properties?.ptbo_gap_fill===true)addBuilding(feature,'city-building/'+feature.id)}
const index=createBuildingIndex(buildings),roadGrid=new Map(),cellSize=100;
for(const road of roads)for(let x=Math.floor(Math.min(road.a.x,road.b.x)/cellSize);x<=Math.floor(Math.max(road.a.x,road.b.x)/cellSize);x++)for(let z=Math.floor(Math.min(road.a.z,road.b.z)/cellSize);z<=Math.floor(Math.max(road.a.z,road.b.z)/cellSize);z++){const key=x+','+z;if(!roadGrid.has(key))roadGrid.set(key,[]);roadGrid.get(key).push(road)}
function nearbyRoads(row){const p=project(row.lat,row.lon),set=new Set();for(let x=Math.floor(p.x/cellSize)-1;x<=Math.floor(p.x/cellSize)+1;x++)for(let z=Math.floor(p.z/cellSize)-1;z<=Math.floor(p.z/cellSize)+1;z++)for(const road of roadGrid.get(x+','+z)||[])set.add(road);return[...set]}
const source=read(input),sourceRows=Array.isArray(source)?source:source.businesses||source.records;
if(!Array.isArray(sourceRows))throw new Error('Normalized source must be an array or contain businesses/records.');
const publicKeys=['id','osmElementId','name','address','unit','street','lat','lon','category','sourceUrl','website','observedAt','sourceKind','sourceBusinessId','level','indoor','sourceIds','nameEvidence','reviewedBuildingMatch','buildingSourceId','parcelAddress','frontageEvidence','addressSourceUrl'];
const publicRow=row=>Object.fromEntries(publicKeys.filter(k=>row[k]!==undefined).map(k=>[k,k==='nameEvidence'?row[k].map(e=>({sourceUrl:e.sourceUrl,sourceKind:e.sourceKind,observedAt:e.observedAt})):row[k]]));
const overridesPath=path.join(root,'city-explorer/data/business-current-overrides.json');
const reviewed=fs.existsSync(overridesPath)?read(overridesPath):{overrides:[],additions:[],suppressed:[]};
const currentOverrides=reviewed.overrides||[],suppressed=new Set((reviewed.suppressed||[]).map(r=>r.id));
const cleanedRows=sourceRows.map(publicRow).filter(row=>!['bus_station','charging_station','dog_park','swimming_pool','atm','courthouse'].includes(row.category));
for(const override of currentOverrides){const row=cleanedRows.find(r=>r.id===override.matchId);if(!row)continue;const originalEvidence={sourceUrl:row.sourceUrl,sourceKind:row.sourceKind,observedAt:row.observedAt};for(const key of ['name','address','lat','lon'])if(override[key]!==undefined)row[key]=override[key];row.street=override.address.replace(/^\d+\s+/,'');row.sourceKind='reviewed-current-name';row.sourceUrl=override.sourceUrl;row.observedAt='2026-10-24';row.nameEvidence=[{sourceUrl:override.sourceUrl,sourceKind:'reviewed-current-name',observedAt:'2026-10-24'},originalEvidence]}
const currentRows=[...cleanedRows.filter(r=>!suppressed.has(r.id)),...(reviewed.additions||[]).map(publicRow)];
const rows=deduplicateBusinesses(reconcileSourceCoordinates(currentRows)),byBuilding=new Map(),audit=[];
for(const row of rows){if(row.requiresAddressEvidence){audit.push({...row,placementStatus:'needs-review',reason:'directory-coordinate-needs-address-corroboration'});continue}const result=matchBusinessToBuilding(row,index,{project});const record={...row,placementStatus:result.status,matchMethod:result.method,matchDistanceMetres:result.distance};if(result.status!=='matched'){record.reason=result.reason;record.candidateBuildingIds=result.candidates;audit.push(record);continue}const building=result.building;record.buildingSourceId=building.sourceId;
 if(row.indoor===true||row.level&&String(row.level)!=='0'||building.properties.shop==='mall'&&row.osmElementId!==building.sourceId&&boundaryDistance(building,project(row.lat,row.lon))>3){record.placementStatus='needs-review';record.reason='interior-tenant-entrance-unverified';audit.push(record);continue}
 const wall=chooseBusinessFrontage(row,building,nearbyRoads(row),{project,unproject});if(!wall){record.placementStatus='needs-review';record.reason='street-facing-wall-unverified';audit.push(record);continue}
 Object.assign(record,{frontage:wall.frontage,fraction:wall.fraction,placementMode:'street-facing-wall',placementStatus:'approved',frontageMethod:row.frontageEvidence==='municipal-parcel-address'?'municipal-parcel-address-street-wall':wall.method,frontageStreet:wall.street,openingEvidence:'inferred-ground-floor-opening-band'});
 audit.push(record);if(!byBuilding.has(building.sourceId))byBuilding.set(building.sourceId,[]);byBuilding.get(building.sourceId).push(record);
}
// Interior tenant names belong on building directories at evidenced shared doors.
const entrancePath=value('--entrances',path.join(root,'city-explorer/data/business-entrances.json'));
const entrances=fs.existsSync(entrancePath)?read(entrancePath).elements:[];
const indoorGroups=new Map();
for(const row of audit)if(row.reason==='interior-tenant-entrance-unverified'){if(!indoorGroups.has(row.buildingSourceId))indoorGroups.set(row.buildingSourceId,[]);indoorGroups.get(row.buildingSourceId).push(row)}
for(const [sourceId,members]of indoorGroups){
 const building=index.byId.get(sourceId);
 const doors=entrances.map(e=>({node:e,wall:chooseEntranceFrontage(e,building,{project,unproject})})).filter(e=>e.wall).sort((a,b)=>(b.node.tags.entrance==='main')-(a.node.tags.entrance==='main')||a.node.id-b.node.id);
 if(!doors.length)continue;
 members.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 for(let start=0;start<members.length;start+=8){const panelIndex=start/8,door=doors[panelIndex%doors.length],group=members.slice(start,start+8),id='directory:'+sourceId+':'+panelIndex;
  const panel={id,name:(building.properties.name||'Building')+' business directory',directoryTitle:'IN '+(building.properties.name||'THIS BUILDING').toUpperCase(),isDirectory:true,buildingSourceId:sourceId,placementStatus:'approved',placementMode:'shared-entrance-directory',frontage:door.wall.frontage,fraction:door.wall.fraction,widthMetres:4.8,minWidthMetres:4.8,heightAboveBaseMetres:3.82,maxShiftMetres:7,entrance:door.wall.entrance,assignmentMethod:'alphabetical-building-directory-distributed-across-mapped-entrances',openingEvidence:'mapped-ground-floor-shared-entrance',members:group.map(r=>({id:r.id,name:r.name,address:r.address,sourceUrl:r.sourceUrl,nameEvidence:r.nameEvidence})),nameEvidence:[{sourceUrl:'https://www.openstreetmap.org/'+door.wall.entrance.osmId,sourceKind:'osm-entrance',observedAt:read(entrancePath).sourceTimestamp}]};
  audit.push(panel);if(!byBuilding.has(sourceId))byBuilding.set(sourceId,[]);byBuilding.get(sourceId).push(panel);
  for(const member of group){member.placementStatus='directory-member';member.directoryPanelId=id;member.entrance=door.wall.entrance;delete member.reason}
 }
}
for(const [sourceId,records]of byBuilding){
 const building=index.byId.get(sourceId);
 for(let pass=0;pass<=records.length;pass++){
  const layout=planBusinessWallSigns({building,businesses:records.filter(r=>r.placementStatus==='approved'),project});
  const rejected=[...layout.rejected,...layout.signs.filter(sign=>signFootprintOccluders(sign,index).length).map(sign=>({id:sign.id,reason:'frontage-obscured-by-rendered-footprint'}))];
  if(!rejected.length)break;
  for(const rejectedRow of rejected){const row=records.find(r=>r.id===rejectedRow.id);row.placementStatus='needs-review';row.reason=rejectedRow.reason;if(row.isDirectory)for(const member of audit.filter(r=>r.directoryPanelId===row.id)){member.placementStatus='needs-review';member.reason='directory-'+rejectedRow.reason}}
 }
}
const counts={sourceRecords:sourceRows.length,excludedNonEstablishments:sourceRows.length-cleanedRows.length,uniqueBusinesses:rows.length,supersededSourceRecords:suppressed.size,reviewedAdditions:(reviewed.additions||[]).length,duplicateRecords:currentRows.length-rows.length,approved:0,ambiguous:0,unmatched:0,'needs-review':0};for(const row of audit.filter(r=>!r.isDirectory))counts[row.placementStatus]=(counts[row.placementStatus]||0)+1;
const reasons={};for(const row of audit.filter(r=>!r.isDirectory))if(row.reason)reasons[row.reason]=(reasons[row.reason]||0)+1;
const sources={};for(const row of sourceRows)sources[row.sourceKind||'unknown']=(sources[row.sourceKind||'unknown']||0)+1;
const catalogue={schemaVersion:1,generatedAt:new Date().toISOString(),city:manifest.city,extent:manifest.bbox,coverage:{...counts,placementCandidates:counts.approved+(counts['directory-member']||0),directoryPanels:audit.filter(r=>r.isDirectory&&r.placementStatus==='approved').length,runtimeVerified:false,inferredNamedStreetWalls:audit.filter(r=>!r.isDirectory&&r.placementStatus==='approved'&&r.frontageMethod==='nearest-named-street-wall-inferred').length,municipalAddressFrontages:audit.filter(r=>!r.isDirectory&&r.placementStatus==='approved'&&r.frontageMethod==='municipal-parcel-address-street-wall').length,sourceCounts:sources,unresolvedReasons:reasons,completeness:'Public-source catalogue; not a claim that all real-world businesses are present. Approved rows are offline placement candidates until runtime count parity is verified.',placement:'Names placed on supported street-facing walls in the ground-floor opening band; exact door/window positions require reviewed entrance evidence.'},businesses:audit};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(catalogue,null,2)+'\n');
fs.writeFileSync(output.replace(/\.json$/,'.coverage.json'),JSON.stringify({schemaVersion:1,generatedAt:catalogue.generatedAt,coverage:catalogue.coverage,unresolved:audit.filter(r=>!r.isDirectory&&!['approved','directory-member'].includes(r.placementStatus))},null,2)+'\n');
console.log(JSON.stringify({output,buildings:buildings.length,roadSegments:roads.length,...counts,reasons}));
