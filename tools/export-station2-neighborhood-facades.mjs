import {readFile,writeFile} from 'node:fs/promises';
import {STATION2_PILOT,station2FacadeLayout,station2NeighborhoodCoverage} from '../city-explorer/station2-neighborhood-facades.mjs';
import {mappedBuildingDimensions} from '../city-explorer/mapped-building-dimensions.js';

const root=new URL('../',import.meta.url);
const project=(lat,lon)=>({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),z:-(lat-44.3091)*110540});
const ringFromGeometry=geometry=>{
  const ring=geometry?.type==='Polygon'?geometry.coordinates?.[0]:geometry?.type==='MultiPolygon'?geometry.coordinates?.[0]?.[0]:null;
  return Array.isArray(ring)?ring.map(([lon,lat])=>project(lat,lon)):[];
};
const osm=JSON.parse(await readFile(new URL('city-explorer/data/peterborough-osm.json',root),'utf8'));
const official=JSON.parse(await readFile(new URL('city-explorer/data/peterborough-official-buildings.geojson',root),'utf8'));
const source=[];
const roadSegments=[];
for(const e of osm.elements||[])if(e.type==='way'&&e.tags?.highway&&Array.isArray(e.geometry))for(let i=0;i+1<e.geometry.length;i++){
  const a=project(e.geometry[i].lat,e.geometry[i].lon),b=project(e.geometry[i+1].lat,e.geometry[i+1].lon);
  if(Math.hypot(a.x-STATION2_PILOT.center.x,a.z-STATION2_PILOT.center.z)<700||Math.hypot(b.x-STATION2_PILOT.center.x,b.z-STATION2_PILOT.center.z)<700)roadSegments.push({a,b});
}
for(const e of osm.elements||[]) if(e.type==='way'&&(e.tags?.building||e.tags?.['building:part'])&&Array.isArray(e.geometry)) source.push({id:`way/${e.id}`,tags:e.tags,ring:e.geometry.map(p=>project(p.lat,p.lon)),source:'osm'});
const osmCentroids=source.map(item=>({id:item.id,center:item.ring.reduce((sum,p)=>({x:sum.x+p.x/item.ring.length,z:sum.z+p.z/item.ring.length}),{x:0,z:0})}));
for(const f of official.features||[]) if(f.properties?.ptbo_gap_fill===true&&f.geometry&&/Polygon/.test(f.geometry.type||'')){
  const ring=ringFromGeometry(f.geometry);if(ring.length<4)continue;
  const center=ring.reduce((sum,p)=>({x:sum.x+p.x/ring.length,z:sum.z+p.z/ring.length}),{x:0,z:0});
  if(osmCentroids.some(item=>Math.hypot(item.center.x-center.x,item.center.z-center.z)<=4.5))continue;
  const area=Math.abs(ring.reduce((sum,p,i)=>sum+p.x*ring[(i+1)%ring.length].z-ring[(i+1)%ring.length].x*p.z,0)/2);
  const building=area<28?'shed':area<64?'garage':area<260?'house':'yes';
  source.push({id:`city-building/${f.id}`,tags:{building,source:'City of Peterborough Basedata','source:geometry':'City of Peterborough Basedata layer 6'},ring,source:'municipal-gap-fill'});
}
const inventory=station2NeighborhoodCoverage(source,{center:STATION2_PILOT.center,radius:STATION2_PILOT.radius});
const byId=new Map(source.map(item=>[item.id,item]));
const selected=inventory.included.map(row=>({id:row.id,source:byId.get(row.id)?.source,distanceMetres:Number(row.distanceMetres.toFixed(2)),archetype:station2FacadeLayout(byId.get(row.id)).archetype}));
const representatives=[];
for(const family of ['residential','commercial','ancillary','industrial']){
  const rows=selected.filter(item=>item.archetype===family);
  const chosen=[];const seenVariation=new Set();
  for(const row of rows){const item=byId.get(row.id),dimensions=mappedBuildingDimensions(item.tags,row.id),layout=station2FacadeLayout(item,{wallHeight:dimensions.height,roadSegments});if(family==='residential'&&seenVariation.has(layout.variation))continue;chosen.push({...row,_layout:layout});seenVariation.add(layout.variation);if(chosen.length>=(family==='residential'?4:2))break;}
  for(const row of chosen){const item=byId.get(row.id),dimensions=mappedBuildingDimensions(item.tags,row.id);representatives.push({...station2FacadeLayout(item,{wallHeight:dimensions.height,roadSegments}),source:item.source,ring:item.ring,wallHeight:dimensions.height,roofHeight:dimensions.roofHeight,roofShape:dimensions.roofShape||item.tags['roof:shape']||null});}
}
const report={schemaVersion:1,coverageBasis:'candidate inventory; mapped OSM ways plus municipal gap-fill candidates after runtime-equivalent 4.5 m centroid de-duplication. OSM relation multipolygon expansion is not repeated by this offline exporter, so counts are a conservative source inventory, not a claim of rendered runtime totals.',boundary:{center:STATION2_PILOT.center,radiusMetres:STATION2_PILOT.radius},anchor:{lat:44.335719,lon:-78.316209,source:'FIRE_STATION_TWO reviewed runtime geographic anchor'},sources:['city-explorer/data/peterborough-osm.json','city-explorer/data/peterborough-official-buildings.geojson'],wallTextureFamilies:['station2-wall-brick','station2-wall-render','station2-wall-siding','station2-wall-stone'],wallTextureSource:'Original shared runtime CanvasTextures created by createStation2WallMaterials; UV repeat values are in metres.',totals:{mapped:inventory.totalMapped,included:inventory.included.length,excluded:inventory.excluded.length,outside:inventory.outside.length,invalid:inventory.invalid.length},included:selected,excluded:inventory.excluded,outsideCount:inventory.outside.length,invalid:inventory.invalid,representatives};
const output=new URL('docs/station2-neighborhood-facade-coverage.json',root);
await writeFile(output,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({output:output.pathname,totals:report.totals,representatives:representatives.map(row=>({id:row.id,archetype:row.archetype,quadCount:row.quadCount}))}));
