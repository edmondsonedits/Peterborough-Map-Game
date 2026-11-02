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
  const perFaceTarget=Math.max(1,Math.ceil(cap/Math.max(1,faces.length)));
  const sampled=faces.map(face=>{
    const doors=face.panels.filter(panel=>panel.kind==='door');
    const windows=face.panels.filter(panel=>panel.kind!=='door').slice().sort((a,b)=>(a.lowerY||0)-(b.lowerY||0)||(a.t||0)-(b.t||0));
    const slots=Math.max(0,perFaceTarget-Math.min(doors.length,1));
    const ordered=doors.slice(0,1);
    if(slots>=windows.length) ordered.push(...windows);
    else if(slots>0) for(let i=0;i<slots;i++) ordered.push(windows[Math.min(windows.length-1,Math.floor((i+.5)*windows.length/slots))]);
    return {...face,panels:ordered};
  });
  const selected=[];
  for(let round=0;selected.length<cap;round++){
    let added=false;
    for(const face of sampled){
      const panel=face.panels[round];if(!panel)continue;
      selected.push({...panel,edge:face.edge});added=true;
      if(selected.length>=cap)break;
    }
    if(!added)break;
  }
  return selected;
}

/** Summarize per-source-part coverage so callers can assert no loading pass starved a part. */
export function cityFacadeCoverageInvariant({consideredParts=0,eligibleParts=0,coveredParts=0,excludedParts=0}={}) {
  const accountingDelta=consideredParts-coveredParts-excludedParts;
  return {sourcePartsAccounted:accountingDelta===0,eligiblePartsCovered:eligibleParts===coveredParts,unresolvedPartCount:Math.max(0,accountingDelta),overaccountedPartCount:Math.max(0,-accountingDelta)};
}
