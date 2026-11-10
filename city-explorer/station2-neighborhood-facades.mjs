// Small, deterministic facade pilot. GIS and the existing editor batches remain
// the owners of every footprint and wall/roof dimension.
export const STATION2_PILOT = Object.freeze({
  center: Object.freeze({ x: 278.09, z: -2942.46 }),
  radius: 320,
  // The reviewed station model owns this building's complete appearance.
  excludedIds: Object.freeze(['way/1022083769', '1022083769']),
});

const stableHash = value => {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};
const point = value => ({x:Number(value?.x ?? value?.[0]),z:Number(value?.z ?? value?.y ?? value?.[1])});
const centroid = ring => {
  const valid=ring.map(point).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  return valid.length ? valid.reduce((sum,p)=>({x:sum.x+p.x/valid.length,z:sum.z+p.z/valid.length}),{x:0,z:0}) : null;
};

/** Inventory every source footprint by centroid, with a complete exclusion ledger. */
export function station2NeighborhoodCoverage(buildings, {center=STATION2_PILOT.center,radius=STATION2_PILOT.radius,excludedIds=STATION2_PILOT.excludedIds}={}) {
  const excludedSet=new Set(excludedIds.map(String));
  const included=[],excluded=[],outside=[],invalid=[];
  for (const building of buildings||[]) {
    const id=String(building.id ?? building.featureId ?? '');
    const ring=building.ring ?? building.footprint ?? [];
    const c=centroid(ring);
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) { invalid.push({id,reason:'invalid-footprint'}); continue; }
    const distance=Math.hypot(c.x-center.x,c.z-center.z);
    if(distance>radius){outside.push({id,distanceMetres:distance});continue;}
    if(excludedSet.has(id)||building.customFacade||building.reviewedReplacement){excluded.push({id,reason:'custom-or-reviewed-appearance',distanceMetres:distance});continue;}
    included.push({id,distanceMetres:distance,centroid:c});
  }
  return {center:{...center},radius,totalMapped:(buildings||[]).length,included,excluded,outside,invalid};
}

/** Pick one front edge from the largest frontage; classify opposite and side faces. */
export function station2EdgeRoles(ring, featureId='', roadSegments=[]) {
  const points=ring.map(point).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.z));
  if(points.length>1&&points[0].x===points.at(-1).x&&points[0].z===points.at(-1).z)points.pop();
  const edges=points.map((a,index)=>{
    const b=points[(index+1)%points.length],length=Math.hypot(b.x-a.x,b.z-a.z);
    return {index,a,b,length,midpoint:{x:(a.x+b.x)/2,z:(a.z+b.z)/2}};
  }).filter(e=>e.length>=1.2);
  if(!edges.length)return [];
  const tie=stableHash(`${featureId}:front-edge`)%edges.length;
  const distanceToSegment=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,d=dx*dx+dz*dz,t=d?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/d)):0;return Math.hypot(p.x-(a.x+t*dx),p.z-(a.z+t*dz));};
  const score=edge=>{
    const ux=(edge.b.x-edge.a.x)/edge.length,uz=(edge.b.z-edge.a.z)/edge.length;
    let best=Infinity;
    for(const segment of roadSegments||[]){const a=point(segment.a||segment[0]),b=point(segment.b||segment[1]);const length=Math.hypot(b.x-a.x,b.z-a.z);if(!length)continue;const alignment=Math.abs(ux*(b.x-a.x)/length+uz*(b.z-a.z)/length);if(alignment<.82)continue;const d=distanceToSegment(edge.midpoint,a,b);if(d>=3&&d<=38)best=Math.min(best,d+(1-alignment)*18);}
    return best;
  };
  const roadScores=new Map(edges.map(edge=>[edge.index,score(edge)])),hasRoad=[...roadScores.values()].some(Number.isFinite);
  const front=hasRoad?edges.slice().sort((a,b)=>roadScores.get(a.index)-roadScores.get(b.index)||b.length-a.length)[0]:edges.slice().sort((a,b)=>b.length-a.length||((a.index-tie+edges.length)%edges.length)-((b.index-tie+edges.length)%edges.length))[0];
  const rear=edges.filter(e=>e!==front).sort((a,b)=>{
    const da=Math.hypot(a.midpoint.x-front.midpoint.x,a.midpoint.z-front.midpoint.z);
    const db=Math.hypot(b.midpoint.x-front.midpoint.x,b.midpoint.z-front.midpoint.z);
    return db-da;
  })[0];
  return edges.map(edge=>({...edge,role:edge===front?'front':edge===rear?'rear':'side',frontEvidence:hasRoad?'nearest-parallel-road':'inferred-longest-edge'}));
}

export function isStation2PilotBuilding(anchor, featureId='', enabled=true) {
  const id=String(featureId);
  return enabled && !STATION2_PILOT.excludedIds.includes(id) && station2BoundaryContains(anchor);
}

export function station2BoundaryContains(anchor) {
  return Math.hypot(Number(anchor?.x)-STATION2_PILOT.center.x,Number(anchor?.z??anchor?.y)-STATION2_PILOT.center.z)<=STATION2_PILOT.radius;
}

export function station2WallPattern(wallMaterialKey,featureId='') {
  const key=String(wallMaterialKey||'');
  if(/industrialMetal|metal/i.test(key))return 'station2-wall-siding';
  if(/Brick|brick/.test(key))return 'station2-wall-brick';
  if(/Slate|stone|civic|industrial|tower/i.test(key))return 'station2-wall-stone';
  if(/commercial|render|pale|glass/i.test(key))return 'station2-wall-render';
  return ['station2-wall-brick','station2-wall-render','station2-wall-siding','station2-wall-stone'][stableHash(`${featureId}:station2-wall-style`)%4];
}

/** Apply explicit wall evidence at the wall batch, never to the upstream roof key. */
export function station2WallPatternForTags(wallMaterialKey,featureId='',tags={}) {
  const material=String(tags?.['building:material']||'').trim().toLowerCase();
  if(/^(brick|bricks)$/.test(material))return 'station2-wall-brick';
  if(/^(plaster|render|concrete|stucco)$/.test(material))return 'station2-wall-render';
  if(/^(wood|timber)$/.test(material))return 'station2-wall-siding';
  if(/^(stone|sandstone|limestone)$/.test(material))return 'station2-wall-stone';
  return station2WallPattern(wallMaterialKey,featureId);
}

const SHARED_WALL_SOURCES = [
  // Bricks101 has 24 visible courses. The 1.8 m square is a rendering estimate
  // calibrated to 75 mm courses, not a dimension published by the provider.
  {family:'brick',id:'Bricks101',repeatMetres:[1.8,1.8]},
  {family:'render',id:'Concrete034',repeatMetres:[1.1,.55]},
];

/** Four shared 256-square maps, immediately usable with exact procedural fallbacks.
 * `ready` settles after both optional colour sources, including load/draw errors.
 */
export function createStation2WallMaterials(THREE,{sourceMode='source'}={}) {
  const draw=(family)=>{
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
    const ctx=canvas.getContext('2d');
    const palettes={
      brick:['#a9705d','#d0bbaa','#c08b73'],
      render:['#c9c2b5','#b6b0a5','#ded8ce'],
      siding:['#b7b2a8','#88847d','#d1ccc2'],
      stone:['#918f88','#c3beb4','#77766f'],
    };
    const [base,detail,light]=palettes[family];ctx.fillStyle=base;ctx.fillRect(0,0,256,256);
    if(family==='brick'){
      ctx.strokeStyle=detail;ctx.lineWidth=2;
      for(let y=0;y<=256;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();const shift=(Math.floor(y/16)%2)*32;for(let x=-64+shift;x<=256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+16);ctx.stroke();}}
      ctx.fillStyle=light;for(let i=0;i<36;i++){const x=(i*73)%256,y=(i*131)%256;ctx.globalAlpha=.1;ctx.fillRect(x,y,20,2);}ctx.globalAlpha=1;
    }else if(family==='siding'){
      for(let y=0;y<256;y+=32){ctx.fillStyle=detail;ctx.fillRect(0,y,256,3);ctx.fillStyle=light;ctx.fillRect(0,y+4,256,2);}
    }else if(family==='stone'){
      ctx.strokeStyle=detail;ctx.lineWidth=2;for(let y=0;y<256;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();const shift=(Math.floor(y/64)%2)*64;for(let x=-128+shift;x<256;x+=128){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+64);ctx.stroke();}}
    }else{
      ctx.strokeStyle=detail;ctx.globalAlpha=.28;for(let i=0;i<30;i++){ctx.beginPath();const x=(i*83)%256,y=(i*137)%256;ctx.moveTo(x,y);ctx.lineTo(x+42,y-18);ctx.stroke();}ctx.globalAlpha=1;
      ctx.fillStyle=light;ctx.globalAlpha=.17;for(let i=0;i<90;i++){const x=(i*47)%256,y=(i*97)%256;ctx.fillRect(x,y,2,2);}ctx.globalAlpha=1;
    }
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=2;
    const material=new THREE.MeshStandardMaterial({map:texture,roughness:.94,metalness:0,side:THREE.DoubleSide});
    material.userData.station2RepeatMetres=family==='brick'?[.96,1.2]:family==='stone'?[.84,1.2]:family==='siding'?[1,1.2]:[1,1];
    return material;
  };
  const materials=new Map(['brick','render','siding','stone'].map(family=>[`station2-wall-${family}`,draw(family)]));
  const mode=sourceMode==='procedural'?'procedural':'source';
  materials.ready=Promise.all(SHARED_WALL_SOURCES.map(source=>{
    const result=status=>({family:source.family,id:source.id,status});
    if(mode==='procedural')return result('procedural');
    return new Promise(resolve=>{
      const fallback=()=>resolve(result('fallback'));
      try {
        const url=new URL(`./assets/shared-wall-materials/${source.id}_1K-JPG_Color.jpg`,import.meta.url).href;
        new THREE.ImageLoader().load(url,image=>{
          try {
            if(!(image.naturalWidth>0&&image.naturalHeight>0)){fallback();return;}
            // Prepare off-texture so failed decoding/drawing cannot damage the
            // original canvas. This adds no GPU texture or material instance.
            const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
            const ctx=canvas.getContext('2d');
            ctx.drawImage(image,0,0,256,256);
            const material=materials.get(`station2-wall-${source.family}`);
            const bakedRepeat=material.userData.station2RepeatMetres;
            material.map.image=canvas;
            // Geometry may already be batched. Transform the existing UVs on
            // source success; keep both old UVs and repeats intact on failure.
            material.map.repeat.set(bakedRepeat[0]/source.repeatMetres[0],bakedRepeat[1]/source.repeatMetres[1]);
            material.map.needsUpdate=true;
            resolve(result('source'));
          }catch{fallback();}
        },undefined,fallback);
      }catch{fallback();}
    });
  })).then(sources=>({mode,sources}));
  return materials;
}

/** Build representative wall and opening quads for deterministic offline review. */
export function station2FacadeLayout(building,{wallHeight=3.1,lite=false,visuals='improved',roadSegments=[]}={}) {
  const tags=building.tags||building.properties||{};
  const id=String(building.id??building.featureId??'building');
  const type=String(tags.building||tags['building:part']||'house').toLowerCase();
  const archetype=/garage|shed|carport|roof/.test(type)?'ancillary':/retail|shop|commercial|office/.test(`${type} ${tags.shop||''} ${tags.office||''}`)?'commercial':/industrial|warehouse/.test(type)?'industrial':'residential';
  const faces=station2EdgeRoles(building.ring||building.footprint||[],id,roadSegments).map(edge=>{
    const {a,b,length,role}=edge,ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
    const signedArea=building.ring.reduce((sum,value,index,ring)=>{const a=point(value),b=point(ring[(index+1)%ring.length]);return sum+a.x*b.z-b.x*a.z;},0)/2;
    const outwardSign=signedArea>=0?1:-1;
    const nx=uz*outwardSign,nz=-ux*outwardSign;
    const pointAt=(t,y,offset)=>[a.x+(b.x-a.x)*t+nx*offset,y,a.z+(b.z-a.z)*t+nz*offset];
    const rect=(t,width,bottom,top,offset,materialKey,atlasCell)=>({
      positions:[pointAt(t-width/(2*length),bottom,offset),pointAt(t+width/(2*length),bottom,offset),pointAt(t+width/(2*length),top,offset),pointAt(t-width/(2*length),top,offset)],
      uv:[[atlasCell[0],atlasCell[1]],[atlasCell[2],atlasCell[1]],[atlasCell[2],atlasCell[3]],[atlasCell[0],atlasCell[3]]],materialKey,
    });
    const facade=role==='front'||role==='rear';
    const plan=buildingFacadePlan({tags,featureId:id,edgeLength:length,wallHeight,edgeIndex:edge.index,footprintArea:Math.abs(signedArea),lite:lite||role!=='front',front:facade,visuals});
    const wallPattern=station2WallPatternForTags(building.wallMaterialKey||station2SourceWallKey(tags,id),id,tags);
    const wallA=[a.x+nx*.014,0,a.z+nz*.014],wallB=[b.x+nx*.014,0,b.z+nz*.014],wallC=[b.x+nx*.014,wallHeight,b.z+nz*.014],wallD=[a.x+nx*.014,wallHeight,a.z+nz*.014];
    const wall={positions:signedArea>=0?[wallA,wallD,wallC,wallB]:[wallA,wallB,wallC,wallD],uv:signedArea>=0?[[0,0],[0,wallHeight],[length,wallHeight],[length,0]]:[[0,0],[length,0],[length,wallHeight],[0,wallHeight]],materialKey:wallPattern,repeatMetres:1};
    const quads=plan.panels.map(panel=>{
      const materialKey=panel.materialKey;
      const atlasCell=[0,0,1,1]; // Full shared texture; artwork is generated by the material factories.
      const quad=rect(panel.t,panel.width,panel.lowerY,panel.upperY,panel.offset,materialKey,atlasCell);
      return {...quad,kind:panel.kind};
    });
    return {...edge,archetype:plan.archetype,wall,quads};
  });
  return {id,archetype,variation:stableHash(`${id}:palette`)%5,faces,quadCount:faces.reduce((n,face)=>n+face.quads.length,0)};
}

function station2SourceWallKey(tags,id){
  const type=String(tags.building||tags['building:part']||'').toLowerCase(),amenity=String(tags.amenity||'').toLowerCase(),use=`${type} ${tags.shop||''} ${tags.office||''}`.toLowerCase(),colour=String(tags['building:colour']||tags.colour||tags.color||'').toLowerCase();
  if(/industrial|warehouse|manufacture/.test(type)||tags.landuse==='industrial')return /metal|silver|grey|gray|white/.test(colour)?'industrialMetal':'industrial';
  if(/retail|commercial|office|hotel|supermarket/.test(type))return /glass|blue|cyan/.test(colour)?'commercialGlass':'commercial';
  if(/school|college|university|hospital|church|cathedral|civic|public/.test(type)||amenity||/ice_rink|sports_centre|stadium/.test(String(tags.leisure||'')))return /brick|red|brown/.test(colour)?'civicBrick':'civic';
  if(/red|brown|brick|maroon/.test(colour))return 'residentialBrick';
  if(/white|cream|beige|yellow/.test(colour))return 'residentialPale';
  if(/grey|gray|blue|slate/.test(colour))return 'residentialSlate';
  const variant=stableHash(id)%10;return variant<4?'residentialBrick':variant<7?'residentialPale':variant===7?'residentialSlate':'residential';
}
import {buildingFacadePlan} from './building-archetypes.js?v=1.6.203';
