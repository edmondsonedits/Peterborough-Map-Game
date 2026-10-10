import { mappedCycleLaneSides, roadLaneLayout, roadLaneMarkingBoundaries,
  laneBoundaryOffset, turnLaneOffset, mappedTurnLaneGroups, roadDashPattern } from './city-detail-rules.js';
import { reviewedMarkingTags } from './reviewed-street-markings.js';
import { RenderedPavementIndex } from './official-road-surfaces.js';

const lerp=(a,b,t)=>a+(b-a)*t;
const lengthOf=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
const nodeKey=(s,end)=>`${Math.round(s[end].x*20)}:${Math.round(s[end].y*20)}:${s.tags?.layer||0}:${Math.round(s[`${end}Y`]*2)}`;

export function markingJunctions(segments) {
  const nodes=new Map();
  for(const s of segments) {
    if(s.profile?.parkingAisle || s.profile?.renderClass==='service')continue;
    for(const end of ['a','b']) {
      if(!s[`${end}SourceVertex`])continue;
      const p=s[end],q=s[end==='a'?'b':'a'],dx=q.x-p.x,dz=q.y-p.y,len=Math.hypot(dx,dz);
      if(len<.05)continue;
      const key=nodeKey(s,end),arms=nodes.get(key)||[];
      if(!arms.some(a=>a.x*dx/len+a.z*dz/len>.995))arms.push({x:dx/len,z:dz/len});
      nodes.set(key,arms);
    }
  }
  return new Set([...nodes].filter(([,arms])=>arms.length>=3).map(([key])=>key));
}

// Identical plan-view ribbon edge stations to appendRoadRibbon(). The points
// below interpolate that frame so adjacent paint does not restart perpendicular
// to each tiny segment, leaving gaps/spikes on a bend.
function section(s,end) {
  if(s[`paint${end.toUpperCase()}`])return s[`paint${end.toUpperCase()}`];
  const p=s[end],len=lengthOf(s),nx=(s.b.y-s.a.y)/len,nz=-(s.b.x-s.a.x)/len,h=s.width/2;
  return {leftX:p.x+nx*h,leftZ:p.y+nz*h,rightX:p.x-nx*h,rightZ:p.y-nz*h};
}
export function paintPoint(s,t,offset) {
  const a=section(s,'a'),b=section(s,'b'),u=.5+offset/s.width;
  return {x:lerp(lerp(a.rightX,a.leftX,u),lerp(b.rightX,b.leftX,u),t),
    z:lerp(lerp(a.rightZ,a.leftZ,u),lerp(b.rightZ,b.leftZ,u),t)};
}
function strip(s,start,end,offset,width=.10) {
  const len=lengthOf(s),a=start/len,b=end/len;
  return [paintPoint(s,a,offset+width/2),paintPoint(s,a,offset-width/2),
    paintPoint(s,b,offset-width/2),paintPoint(s,b,offset+width/2)];
}

/** Generate paint intents, never claim inferred line styles are imagery-verified. */
export function collectStreetPaint(segments) {
  const result=[],junctions=markingJunctions(segments),lines=new Map();
  const add=(s,polygon,materialKey,kind,referenceHeight)=>result.push({s,polygon,materialKey,kind,
    referenceHeight:referenceHeight??(s.aY+s.bY)/2});
  for(const s of segments) {
    const original=s.tags||{},tags=reviewedMarkingTags(original,s.lineId);
    const p={...s.profile,lanes:Number(tags.lanes)||s.profile?.lanes,width:s.width};
    if(!p || p.unpaved || p.tunnel || p.parkingAisle || tags.junction==='roundabout')continue;
    const len=lengthOf(s);if(len<.1)continue;
    if(!lines.has(s.lineId))lines.set(s.lineId,[]);lines.get(s.lineId).push(s);
    const trim=Math.max(2.8,s.width*.62);
    const from=junctions.has(nodeKey(s,'a'))?Math.min(len/2,trim):0;
    const to=len-(junctions.has(nodeKey(s,'b'))?Math.min(len/2,trim):0);
    const layout=roadLaneLayout(tags,p);
    const pattern=roadDashPattern(tags),chain=s.chainStart||0;
    const addStrip=(offset,kind,materialKey,width=.10,customPattern=pattern)=>{
      if(to-from<.1)return;
      if(kind==='solid') {
        add(s,strip(s,from,to,offset,width),materialKey,'solid');return;
      }
      for(let start=Math.floor((chain+from)/customPattern.period)*customPattern.period;start<chain+to;start+=customPattern.period){
        const a=Math.max(from,start-chain),b=Math.min(to,start+customPattern.length-chain);
        if(b-a>.1)add(s,strip(s,a,b,offset,width),materialKey,'dash',lerp(s.aY,s.bY,(a+b)/2/len));
      }
    };
    for(const rule of roadLaneMarkingBoundaries(tags,p)) {
      const offset=laneBoundaryOffset(s.width,layout.lanes,rule.boundary);
      if(rule.pattern==='shared') {
        // OTM Book 11 Fig 34: continuous boundary faces the shared turn lane;
        // dashed component faces the adjacent through lane (not a white divider).
        addStrip(offset+rule.sharedInsideSign*.10,'solid',rule.materialKey);
        addStrip(offset-rule.sharedInsideSign*.10,'dash',rule.materialKey,.10,{length:3,period:9});
      }else addStrip(offset,rule.pattern,rule.materialKey);
    }
    if(tags.lane_markings!=='no') for(const side of mappedCycleLaneSides(tags)) {
      addStrip((side==='left'?1:-1)*Math.max(.45,s.width/2-1.52),'solid','roadPaintWhite');
    }
    // A one-lane ramp still has edge lines. Do not place this after a
    // `boundaries.length === 0` early return. Left-of-TRAVEL is yellow on a
    // divided one-way carriageway; urban streets are not given freeway edges.
    if(/^(motorway|trunk)(?:_link)?$/.test(p.highway||'')) for(const side of [-1,1]) {
      const leftTravel=tags.oneway==='-1'?-1:1;
      const key=p.oneWay&&side===leftTravel?'roadPaintYellow':'roadPaintWhite';
      addStrip(side*Math.max(.5,s.width/2-.2),'solid',key,.13);
    }
  }
  // Mapped arrows retain their lane direction. Shared or unknown allocation is
  // never mirrored from the number of forward arrows to invent backward lanes.
  for(const line of lines.values()) {
    line.sort((a,b)=>(a.chainStart||0)-(b.chainStart||0));
    const e=line[0],tags=reviewedMarkingTags(e.tags,e.lineId),p={...e.profile,width:e.width,lanes:Number(tags.lanes)||e.profile.lanes};
    const lineLength=e.lineLength||line.reduce((n,s)=>n+lengthOf(s),0);
    for(const g of mappedTurnLaneGroups(tags,p)) {
      const layout=roadLaneLayout(tags,p);
      if(!layout || layout[g.direction]!==g.symbols.length)continue;
      const distance=g.direction==='forward'?Math.max(lineLength*.5,lineLength-13):Math.min(lineLength*.5,13);
      const s=line.find(s=>distance>=(s.chainStart||0)&&distance<=(s.chainStart||0)+lengthOf(s));
      if(!s)continue;
      const t=Math.max(.1,Math.min(.9,(distance-(s.chainStart||0))/lengthOf(s)));
      const sign=g.direction==='forward'?1:-1,len=lengthOf(s);
      const fx=(s.b.x-s.a.x)/len*sign,fz=(s.b.y-s.a.y)/len*sign;
      const rx=-fz,rz=fx; // right of travel in the XZ ground plane
      g.symbols.forEach((symbol,i)=>{
        if(!symbol)return;
        const offset=turnLaneOffset(tags,p,g.direction,i);if(offset===null)return;
        const centre=paintPoint(s,t,offset);
        for(const polygon of arrowPolygons(symbol)) add(s,polygon.map(([right,forward])=>({x:centre.x+rx*right+fx*forward,z:centre.z+rz*right+fz*forward})),
          'roadPaintWhite','arrow',lerp(s.aY,s.bY,t));
      });
    }
  }
  return result;
}

function arrowPolygons(symbol) {
  const choices=String(symbol).split(';'),polygons=[];
  const recognised=choices.filter(s=>['left','through','right'].includes(s));
  if(!recognised.length)return polygons; // Do not turn a U-turn into a left arrow.
  polygons.push([[-.12,-1.6],[.12,-1.6],[.12,.55],[-.12,.55]]);
  if(recognised.includes('through'))polygons.push([[-.55,.45],[.55,.45],[0,1.65]]);
  for(const side of [-1,1])if(recognised.includes(side<0?'left':'right')){
    polygons.push([[0,.23],[side*1.00,.23],[side*1.00,.47],[0,.47]]);
    polygons.push([[side*1.45,.35],[side*.9,-.2],[side*.9,.90]]);
  }
  return polygons;
}

/** Renderer adapter: batched unit triangles preserve per-OSM editor ownership.
 * Source topology/vehicle contacts are unchanged; paint has no collision mesh.
 */
export function renderStreetPaint({THREE,segments,pavementIndex,materials,group,tileAt,tileSize,attach}) {
  const started=performance.now(),fallback=new RenderedPavementIndex(),hasOfficial=pavementIndex.triangleCount>0;
  for(const s of segments){
    const a=section(s,'a'),b=section(s,'b');
    const meta={layer:s.bridge?'bridges':'road_surfaces',lineId:s.lineId};
    fallback.addTriangle(a.leftX,s.aY,a.leftZ,a.rightX,s.aY,a.rightZ,b.rightX,s.bY,b.rightZ,meta);
    fallback.addTriangle(a.leftX,s.aY,a.leftZ,b.rightX,s.bY,b.rightZ,b.leftX,s.bY,b.leftZ,meta);
  }
  const batches=new Map(),stats={intents:0,triangles:0,clippedAway:0,official:0,fallback:0,arrowIntents:0,reviewedWays:[]};
  const reviewed=new Set();
  for(const mark of collectStreetPaint(segments)) {
    stats.intents++;
    if(mark.kind==='arrow')stats.arrowIntents++;
    const opts={bridge:Boolean(mark.s.bridge),includeBridges:Boolean(mark.s.bridge)};
    let triangles=hasOfficial?pavementIndex.projectPaintPolygon(mark.polygon,mark.referenceHeight,opts):[];
    let source='official';
    if(!triangles.length) {
      const centre=mark.polygon.reduce((p,q)=>({x:p.x+q.x/mark.polygon.length,z:p.z+q.z/mark.polygon.length}),{x:0,z:0});
      // Missing municipal coverage outside the surveyed pavement uses the exact
      // existing ribbon. A hole/traffic island within a municipal road must not
      // be repainted by the fallback underneath it.
      const near=hasOfficial&&[0,2,-2,4,-4].some(dx=>[0,2,-2,4,-4].some(dz=>
        pavementIndex.sample(centre.x+dx,centre.z+dz,mark.referenceHeight,{includeParking:false,includeBridges:opts.includeBridges})));
      if(!near)triangles=fallback.projectPaintPolygon(mark.polygon,mark.referenceHeight,opts);
      source='fallback';
    }
    if(!triangles.length){stats.clippedAway++;continue;}
    stats[source]++;
    if(reviewedMarkingTags(mark.s.tags,mark.s.lineId)!==mark.s.tags)reviewed.add(mark.s.lineId);
    for(const t of triangles) {
      const tile=tileAt((t[0].x+t[1].x+t[2].x)/3,(t[0].z+t[1].z+t[2].z)/3);
      const key=`${tile.x}:${tile.z}:${mark.materialKey}`;
      if(!batches.has(key))batches.set(key,{tile,materialKey:mark.materialKey,entries:[]});
      batches.get(key).entries.push({t,lineId:mark.s.lineId,kind:mark.kind,source});stats.triangles++;
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,0,-1],3));
  geometry.computeVertexNormals();
  const matrix=new THREE.Matrix4(),x=new THREE.Vector3(),z=new THREE.Vector3(),y=new THREE.Vector3();
  for(const batch of batches.values()) {
    const mesh=new THREE.InstancedMesh(geometry,materials[batch.materialKey],batch.entries.length);
    batch.entries.forEach(({t,lineId},i)=>{
      const [a,b,c]=t;x.set(b.x-a.x,b.y-a.y,b.z-a.z);z.set(a.x-c.x,a.y-c.y,a.z-c.z);y.crossVectors(z,x).normalize();
      matrix.set(x.x,y.x,z.x,a.x,x.y,y.y,z.y,a.y,x.z,y.z,z.z,a.z,0,0,0,1);
      mesh.setMatrixAt(i,matrix);attach(lineId,mesh,i);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.renderOrder=7;
    mesh.userData={type:'surface-conforming-road-paint',material:batch.materialKey,tile:batch.tile,tileSize,count:batch.entries.length};
    group.add(mesh);
  }
  stats.drawBatches=batches.size;stats.buildMs=Math.round(performance.now()-started);stats.reviewedWays=[...reviewed];
  return stats;
}
