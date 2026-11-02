const coordinate = (point, axis) => Number(point?.[axis] ?? point?.[axis === 'z' ? 'y' : 'x'] ?? (Array.isArray(point) ? point[axis === 'x' ? 0 : point.length > 2 ? 2 : 1] : undefined));
const segmentBounds = segment => {
  const a = segment.a || segment[0], b = segment.b || segment[1];
  const ax = coordinate(a, 'x'), az = coordinate(a, 'z');
  const bx = coordinate(b, 'x'), bz = coordinate(b, 'z');
  if (![ax, az, bx, bz].every(Number.isFinite)) return null;
  return { minX:Math.min(ax,bx), maxX:Math.max(ax,bx), minZ:Math.min(az,bz), maxZ:Math.max(az,bz) };
};
const intersects = (a, b) => a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;

/** Build a coarse road grid once, then return local candidates for a building footprint. */
export function createCityRoadSegmentIndex(segments = [], { cellSize = 160, maxCellsPerSegment = 64 } = {}) {
  const size = Math.max(8, Number(cellSize) || 160);
  const grid = new Map();
  const entries = [];
  const broad = [];
  const cell = value => Math.floor(value / size);
  for (const segment of segments) {
    const bounds = segmentBounds(segment);
    if (!bounds) continue;
    const entry = { segment, bounds };
    entries.push(entry);
    const x0 = cell(bounds.minX), x1 = cell(bounds.maxX);
    const z0 = cell(bounds.minZ), z1 = cell(bounds.maxZ);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > maxCellsPerSegment) {
      broad.push(entry);
      continue;
    }
    for (let x = x0; x <= x1; x += 1) for (let z = z0; z <= z1; z += 1) {
      const key = `${x}:${z}`;
      const bucket = grid.get(key) || [];
      bucket.push(entry);
      grid.set(key, bucket);
    }
  }
  return {
    segmentCount: entries.length,
    query(bounds, { padding = 38 } = {}) {
      if (!bounds || ![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ].every(Number.isFinite)) return [];
      const pad = Math.max(0, Number(padding) || 0);
      const queryBounds = { minX:bounds.minX-pad, maxX:bounds.maxX+pad, minZ:bounds.minZ-pad, maxZ:bounds.maxZ+pad };
      const seen = new Set();
      const result = [];
      const add = entry => {
        if (seen.has(entry)) return;
        seen.add(entry);
        if (intersects(entry.bounds, queryBounds)) result.push(entry.segment);
      };
      const x0=cell(queryBounds.minX),x1=cell(queryBounds.maxX),z0=cell(queryBounds.minZ),z1=cell(queryBounds.maxZ);
      for (let x=x0;x<=x1;x+=1) for(let z=z0;z<=z1;z+=1) for(const entry of grid.get(`${x}:${z}`)||[]) add(entry);
      for(const entry of broad) add(entry);
      return result;
    },
  };
}

/** Return a concrete reason whenever another appearance system owns this shell. */
export function classifyCitywideFacadeEligibility({
  featureId = '', anchor, mode = 'all', pilot = { center:{x:278.09,z:-2942.46}, radius:320 },
  profile, reviewedStyle, reviewedReplacement = false, glbReplacement = false,
} = {}) {
  if (glbReplacement) return { eligible:false, reason:'authored-glb-replacement' };
  if (reviewedReplacement) return { eligible:false, reason:'reviewed-station-replacement' };
  if (reviewedStyle?.customFacade) return { eligible:false, reason:'reviewed-custom-facade' };
  if (profile && !profile.appearanceOnly && profile.confidence !== 'inferred') {
    return { eligible:false, reason:'captured-footage-facade' };
  }
  if (mode !== 'all') {
    const inPilot = Math.hypot(Number(anchor?.x)-pilot.center.x, Number(anchor?.z ?? anchor?.y)-pilot.center.z) <= pilot.radius;
    return inPilot ? { eligible:false, reason:'citywide-disabled-pilot-retained' } : { eligible:false, reason:'citywide-disabled' };
  }
  return { eligible:true, reason:null };
}

/** Bound openings per building and spread the budget across every usable face. */
export function selectFacadePanelsByBudget(edgePlans = [], budget = 16) {
  const cap = Math.max(0, Math.floor(Number(budget) || 0));
  const rank = { front:0, rear:1, side:2 };
  const faces = edgePlans
    .map((face, order) => ({ ...face, order, panels:Array.isArray(face.panels) ? face.panels : [] }))
    .filter(face => face.panels.length)
    .sort((a,b) => (rank[a.role] ?? 3)-(rank[b.role] ?? 3) || a.order-b.order);
  const selected=[];
  const entranceFace=faces.find(face=>face.role==='front'&&face.panels.some(panel=>panel.kind==='door'))
    || faces.find(face=>face.panels.some(panel=>panel.kind==='door'));
  const entrancePanel=entranceFace?.panels.find(panel=>panel.kind==='door');
  if(cap>0&&entranceFace&&entrancePanel) selected.push({...entrancePanel,edge:entranceFace.edge});
  const windowFaces=faces.map(face=>{
    const rowsByFloor=new Map();
    for(const panel of face.panels) {
      if(panel.kind==='door')continue;
      const key=Number(panel.lowerY||0).toFixed(2),row=rowsByFloor.get(key)||[];
      row.push(panel);rowsByFloor.set(key,row);
    }
    const rows=[...rowsByFloor.values()].map(row=>row.sort((a,b)=>(a.t||0)-(b.t||0)))
      .sort((a,b)=>(a[0]?.lowerY||0)-(b[0]?.lowerY||0));
    return {...face,rows};
  }).filter(face=>face.rows.length);
  const rowCount=windowFaces.reduce((sum,face)=>sum+face.rows.length,0);
  const columns=Math.min(4,Math.floor((cap-selected.length)/Math.max(1,rowCount)));
  if(columns>0) {
    for(const face of windowFaces) {
      const anchor=face.rows[Math.floor(face.rows.length/2)];
      const targets=Array.from({length:Math.min(columns,anchor.length)},(_,index)=>anchor[Math.min(anchor.length-1,Math.floor((index+.5)*anchor.length/columns))].t);
      for(const row of face.rows) {
        const used=new Set();
        for(const target of targets) {
          const panel=row.find(item=>!used.has(item)&&Math.abs(item.t-target)<1e-4);
          if(!panel||selected.length>=cap)continue;
          used.add(panel);selected.push({...panel,edge:face.edge});
        }
      }
    }
  } else {
    const remaining=cap-selected.length;
    const rowsPerFace=Math.floor(remaining/Math.max(1,windowFaces.length));
    const extraRows=remaining%Math.max(1,windowFaces.length);
    windowFaces.forEach((face,faceIndex)=>{
      const quota=Math.min(face.rows.length,rowsPerFace+(faceIndex<extraRows?1:0));
      if(!quota)return;
      const anchor=face.rows[Math.floor(face.rows.length/2)];
      const target=anchor[Math.floor((anchor.length-1)/2)]?.t;
      if(!Number.isFinite(target))return;
      const rowIndices=quota===1?[Math.floor((face.rows.length-1)/2)]:Array.from({length:quota},(_,index)=>Math.round(index*(face.rows.length-1)/(quota-1)));
      for(const rowIndex of rowIndices) {
        const panel=face.rows[rowIndex].find(item=>Math.abs(item.t-target)<1e-4);
        if(!panel)continue;
        selected.push({...panel,edge:face.edge});
      }
    });
  }
  return selected;
}

/** Use the existing front edge where possible; otherwise infer a usable side entry. */
export function selectCityFacadeEntranceEdge(edges = [], minimumLength = 3.1, isBlocked = () => false) {
  const usable=(edges||[]).filter(edge=>Number.isFinite(Number(edge.length))&&Number(edge.length)>=minimumLength&&!isBlocked(edge));
  const front=usable.find(edge=>edge.role==='front');
  if(front)return front.index;
  const side=usable.filter(edge=>edge.role==='side').sort((a,b)=>Number(b.length)-Number(a.length)||Number(a.index)-Number(b.index));
  if(side.length)return side[0].index;
  const fallback=usable.sort((a,b)=>Number(b.length)-Number(a.length)||Number(a.index)-Number(b.index));
  return fallback[0]?.index ?? -1;
}

/** Keep citywide surface detail proportional to the active renderer profile. */
export function cityFacadePanelBudget(quality = 'balanced', edgePlans = []) {
  const caps = quality === 'high' ? {small:24,large:384} : quality === 'low' ? {small:16,large:64} : {small:16,large:256};
  const faces = Array.isArray(edgePlans) ? edgePlans : [];
  const available = faces.reduce((sum, face) => sum + (Array.isArray(face.panels) ? face.panels.length : 0), 0);
  const floorBands = new Set();
  for (const face of faces) for (const panel of face.panels || []) {
    if (panel.kind === 'door') continue;
    const lower = Number(panel.lowerY);
    if (Number.isFinite(lower)) floorBands.add(Math.round(lower / 1.5));
  }
  const floors = Math.max(1, floorBands.size);
  const hasEntry=faces.some(face=>(face.panels||[]).some(panel=>panel.kind==='door'));
  const columnsPerFloor=quality==='low'?1:floors>=6?4:2;
  const adaptive = Math.max(caps.small, faces.length * floors * columnsPerFloor + (hasEntry?1:0));
  return Math.min(available, Math.min(caps.large, adaptive));
}

function stableFacadeHash(value) {
  let hash=2166136261;
  for(const character of String(value))hash=Math.imul(hash^character.charCodeAt(0),16777619);
  return hash>>>0;
}

export function cityFacadeWindowMaterialKey(archetype,featureId='',edge=0,t=0) {
  if(!['residential','apartment'].includes(String(archetype)))return 'station2-window';
  return stableFacadeHash(`${featureId}:${edge}:${t}:curtain`)%3===0?'station2-window-curtain':'station2-window';
}

/** Low-power apartments use one repeated shared window strip per face. */
export function cityFacadeUsesRepeatedWindowStrip(archetype,quality='balanced',wallHeight=0) {
  return quality==='low'&&String(archetype)==='apartment'&&Number(wallHeight)>=10;
}

/** Flatten only inferred low-rise commercial roofs that can safely carry shared equipment. */
export function shouldFlattenInferredCommercialRoof({eligible=false,wallKey='',footprintArea=0,wallHeight=0,roofRise=0,explicitRoofShape=false}={}) {
  return Boolean(eligible)&&!explicitRoofShape&&/commercial|industrial|civic/i.test(String(wallKey))
    &&Number(footprintArea)>=320&&Number(wallHeight)>=4.5&&Number(roofRise)>.3&&Number(roofRise)<=2.4;
}

/** Choose pitched geometry or a flat cap, keeping intentional flattening out of pitched fallbacks. */
export function cityBuildingRoofGeometryPlan({roofHeight=0,flattenedCommercialRoof=false}={}) {
  const rise=Number(roofHeight),hasRise=Number.isFinite(rise)&&rise>.3;
  return {
    tryPitched:!flattenedCommercialRoof&&hasRise,
    raisedRingWalls:!flattenedCommercialRoof&&Number.isFinite(rise)&&rise>.05,
    flatCap:Boolean(flattenedCommercialRoof)||!hasRise,
  };
}

/** Equipment rectangles only use simple convex, hole-free footprints. */
export function isConvexCityFootprint(ring=[]) {
  if(!Array.isArray(ring)||ring.length<3)return false;
  let orientation=0;
  for(let i=0;i<ring.length;i++) {
    const a=ring[i],b=ring[(i+1)%ring.length],c=ring[(i+2)%ring.length];
    const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
    if(!Number.isFinite(cross))return false;
    if(Math.abs(cross)<1e-8)continue;
    const sign=Math.sign(cross);
    if(orientation&&orientation!==sign)return false;
    orientation=sign;
  }
  return orientation!==0;
}

/** Split long walls into metre-bounded planning spans, with a hard segment cap. */
export function cityFacadeEdgeSegments(length, maxSegmentLength = 48, maxSegments = 32) {
  const edgeLength = Number(length), maxLength = Math.max(3.1, Number(maxSegmentLength) || 48);
  const segmentCap = Math.max(1, Math.floor(Number(maxSegments) || 32));
  if (!Number.isFinite(edgeLength) || edgeLength < 3.1) return [];
  const count = Math.min(segmentCap, Math.ceil(edgeLength / maxLength));
  return Array.from({length:count},(_,index)=>{
    const start=edgeLength*index/count,end=edgeLength*(index+1)/count;
    return {index,count,start,end,length:end-start};
  });
}

/** Infer only a facade archetype for unusually large anonymous mapped shells. */
export function cityFacadeAppearanceTags(tags = {}, footprintArea = 0, wallHeight = 0) {
  const type=String(tags?.building||'').toLowerCase();
  const area=Number(footprintArea),height=Number(wallHeight);
  const knownUse=['amenity','shop','office','tourism','leisure'].some(key=>tags?.[key]&&tags[key]!=='no');
  if(type!=='yes'||knownUse||!Number.isFinite(area)||area<2000)return tags;
  const inferred=area>=20000?(Number.isFinite(height)&&height>=12?'civic':'industrial'):'retail';
  return {...tags,building:inferred};
}

export function isOpenSidedRoofShell(tags = {}) {
  return /^(roof|carport|canopy)$/.test(String(tags?.building||tags?.['building:part']||'').toLowerCase());
}

/** Irregular roof helper supports bounded gable, hip, and dome-like roofs. */
export function shouldBuildIrregularGableRoof({
  ringVertexCount = 0, hasHoles = false, roofHeight = 0, roofShape = '', footprintArea = 0, explicitRoofShape = false,
} = {}) {
  const shape=String(roofShape||'').toLowerCase();
  const supported=/gable|hip|pyramid|round|dome/.test(shape)||(!explicitRoofShape&&!shape);
  const area=Number(footprintArea),vertices=Number(ringVertexCount),rise=Number(roofHeight);
  const narrowTower=area>=8&&vertices>=8&&rise>=1.4;
  return vertices >= 4 && vertices <= 128
    && Number.isFinite(rise) && rise > 0.3
    && Number.isFinite(area) && area >= (narrowTower?8:18) && area <= 45000
    && supported;
}

/** Summarize per-source-part coverage so callers can assert no loading pass starved a part. */
export function cityFacadeCoverageInvariant({consideredParts=0,eligibleParts=0,coveredParts=0,excludedParts=0}={}) {
  const accountingDelta=consideredParts-coveredParts-excludedParts;
  return {sourcePartsAccounted:accountingDelta===0,eligiblePartsCovered:eligibleParts===coveredParts,unresolvedPartCount:Math.max(0,accountingDelta),overaccountedPartCount:Math.max(0,-accountingDelta)};
}
