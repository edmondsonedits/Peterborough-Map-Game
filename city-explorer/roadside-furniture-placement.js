/** Derived display placement only. Source points and drivable geometry stay authoritative. */
export const ROADSIDE_CLEARANCE = 0.7;
const RING = Array.from({length: 8}, (_, i) => ({x: Math.cos(i * Math.PI / 4), z: Math.sin(i * Math.PI / 4)}));
function hash(text) { let h = 2166136261; for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function closest(point, s) {
  const dx = s.b.x - s.a.x, dz = s.b.y - s.a.y, length = Math.hypot(dx, dz);
  if (length < .01) return null;
  const t = Math.max(0, Math.min(1, ((point.x-s.a.x)*dx+(point.z-s.a.y)*dz)/(length*length)));
  const x = s.a.x + t*dx, z = s.a.y + t*dz;
  return {segment:s, x,z,t, tx:dx/length,tz:dz/length, distance:Math.hypot(point.x-x,point.z-z), height:s.aY+(s.bY-s.aY)*t};
}

/** Exact zero-tolerance ribbon membership from the containing grid cell.
 * The index already inserts a segment in every cell touched by its padded bounds.
 * Placement does not need sampleAll's neighboring-cell tolerance search and sort.
 */
export function sampleRoadsideRibbon(roadIndex, x, z, referenceHeight) {
  let result=null, distance=Infinity;
  for (const s of roadIndex.cells.get(roadIndex.cellKey(x,z)) || []) {
    const dx=s.b.x-s.a.x,dz=s.b.y-s.a.y,len2=dx*dx+dz*dz;
    if (len2<.0001) continue;
    const t=Math.max(0,Math.min(1,((x-s.a.x)*dx+(z-s.a.y)*dz)/len2));
    const rx=x-s.a.x-t*dx,rz=z-s.a.y-t*dz;
    if (rx*rx+rz*rz>s.width*s.width/4) continue;
    const height=s.aY+(s.bY-s.aY)*t,d=Math.abs(height-referenceHeight);
    if (!result || d<distance) {result={height};distance=d;}
  }
  return result;
}

/** Queries the existing local road grid, never the entire city per object. */
export function createRoadsidePlacementResolver({roadIndex, surfaceAt, groundAt, blockedAt = () => false}) {
  const occupied = [];
  function nearby(point) {
    const found = new Set(), size = roadIndex.cellSize, cx = Math.floor(point.x/size), cz = Math.floor(point.z/size);
    for (let x=-1;x<=1;x++) for (let z=-1;z<=1;z++) for (const s of roadIndex.cells.get(`${cx+x}:${cz+z}`)||[]) found.add(s);
    return [...found].map(s=>closest(point,s)).filter(Boolean).filter(r=>r.distance<90)
      .sort((a,b)=>a.distance-b.distance || String(a.segment.lineId).localeCompare(String(b.segment.lineId)));
  }
  function clear(x,z,height) {
    if (surfaceAt(x,z,height) || blockedAt(x,z) || occupied.some(p=>Math.hypot(p.x-x,p.z-z)<1.15)) return false;
    return RING.every(d=>!surfaceAt(x+d.x*ROADSIDE_CLEARANCE,z+d.z*ROADSIDE_CLEARANCE,height)
      && !blockedAt(x+d.x*.3,z+d.z*.3));
  }
  function place(point, kind = 'lamp') {
    const roads = nearby(point);
    // A curbside lamp beside a public street must not face a parking aisle behind it.
    const publicRoad = kind === 'lamp' && roads.find(r => !['service','track','path','footway','cycleway'].includes(r.segment.tags?.highway)
      && r.distance <= 22 && r.distance <= (roads[0]?.distance || 0) + 10);
    const road = publicRoad || roads[0];
    const sourceId = point.sourceId || `${kind}:${point.x.toFixed(3)}:${point.z.toFixed(3)}`;
    if (!road) {
      // Area/path lamps have no mapped motor road nearby. Keep their surveyed location.
      const baseY=groundAt(point.x,point.z);
      return {...point,sourceId,baseY,armDirection:{x:1,z:0},armLength:1.8,poleHeight:7.4,
        facingDirection:{x:0,z:1},placement:'area-light',moved:0,roadName:null};
    }
    const {tx,tz,height,segment}=road, nx=-tz,nz=tx, half=Math.max(1.5,segment.width/2);
    const signed=(point.x-road.x)*nx+(point.z-road.z)*nz;
    const preferred=Math.abs(signed)>.5?Math.sign(signed):(hash(sourceId)%2?1:-1);
    function mast(candidate) {
      const near=closest(candidate,segment);
      let dx=near.x-candidate.x,dz=near.z-candidate.z,len=Math.hypot(dx,dz);
      if (len<.1) {dx=-nx*candidate.side;dz=-nz*candidate.side;len=1;}
      const armDirection={x:dx/len,z:dz/len};
      let edge=0;
      if (!candidate.area) for (let d=.25;d<=Math.min(len+.5,kind==='signal'?11:5.5);d+=.25) if (surfaceAt(candidate.x+armDirection.x*d,candidate.z+armDirection.z*d,height)) {edge=d;break;}
      const armLength=candidate.area?1.8:Math.min(kind==='signal'?11:5.5,Math.max(kind==='signal'?2.8:1.8,edge+(kind==='signal'?Math.min(3,half*.6):1.3)));
      const headRoad=surfaceAt(candidate.x+armDirection.x*armLength,candidate.z+armDirection.z*armLength,height);
      return {armDirection,armLength,headRoad,edge};
    }
    const usable=candidate => kind==='sign' || candidate.area || Boolean(mast(candidate).headRoad);
    let chosen=null;
    // Correctly mapped curbside and area lamps retain their anchor.
    if (clear(point.x,point.z,height)) {
      const original={x:point.x,z:point.z,side:preferred,score:0,area:kind==='lamp'&&road.distance>half+9};
      if (usable(original)) chosen=original;
    }
    if (!chosen) {
      for (const side of [preferred,-preferred]) for (const along of [0,3,-3,6,-6,10,-10,15,-15,21,-21,28,-28]) {
        for (let lateral=half+ROADSIDE_CLEARANCE+.15;lateral<=half+15;lateral+=.6) {
          const x=road.x+tx*along+nx*side*lateral,z=road.z+tz*along+nz*side*lateral;
          if (!clear(x,z,height) || !usable({x,z,side,area:false})) continue;
          const score=Math.hypot(x-point.x,z-point.z)+(side===preferred?0:1.5)+Math.max(0,lateral-half-2)*.55;
          if (!chosen || score<chosen.score) chosen={x,z,side,score,area:false};
          break;
        }
      }
    }
    if (!chosen) {
      // Rare broad junctions: a bounded radial search still checks every crossing road.
      for (let radius=half+1;radius<=65&&!chosen;radius+=1) for (let a=0;a<32;a++) {
        const angle=a*Math.PI/16,x=point.x+Math.cos(angle)*radius,z=point.z+Math.sin(angle)*radius;
        const candidate={x,z,side:Math.sign((x-road.x)*nx+(z-road.z)*nz)||preferred,area:false};
        if (clear(x,z,height) && usable(candidate)) {chosen=candidate;break;}
      }
    }
    if (!chosen) return null; // Never leave an unresolved pole in the driving surface.
    const {x,z,side}=chosen;
    const {armDirection,armLength,headRoad,edge}=mast(chosen);
    const ground=groundAt(x,z), baseY=Math.max(ground, !chosen.area&&edge<2?height+.12:ground);
    const roadY=Number.isFinite(headRoad?.height)?headRoad.height:height;
    const poleHeight=Math.max(kind==='signal'?8:7.4,roadY-baseY+(kind==='signal'?7.02:5.7));
    const direction=point.tags?.['traffic_signals:direction'];
    const facingSign=direction==='backward'?1:direction==='forward'?-1:segment.tags?.oneway==='-1'?1:segment.tags?.oneway==='yes'?-1:-side;
    const result={...point,x,z,sourceId,baseY,poleHeight,armDirection,armLength,
      facingDirection:{x:tx*facingSign,z:tz*facingSign},placement:chosen.area?'area-light':'roadside',
      moved:Math.hypot(x-point.x,z-point.z),roadName:segment.name||'',headOnRoad:Boolean(headRoad)};
    occupied.push(result);
    return result;
  }
  return {place, clear};
}
