// Hunter/Ashburnham only. XY and lane width remain owned by the source ways.
// Elevations are an inferred bank-to-bank deck, not a surveyed bridge model.
const BRIDGE_IDS = new Set(['33954231', '177049271']);
const ROUTE_IDS = new Set([...BRIDGE_IDS, '33953421', '499202158', '33953339', '33963410']);
const idNumber = id => /(?:^|\/)(\d+)(?::\d+)?$/.exec(String(id))?.[1];
export const isHunterBridgeLine = id => BRIDGE_IDS.has(idNumber(id));
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const hermite = (x,a,b,ha,hb,ma,mb) => {
  const span=b-a,t=clamp((x-a)/span,0,1),t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*ha+(t3-2*t2+t)*span*ma+(-2*t3+3*t2)*hb+(t3-t2)*span*mb;
};
export function createHunterBridgeSurface(lines, sourceHeight) {
  const selected=lines.filter(l=>ROUTE_IDS.has(idNumber(l.id)) && l.samples?.length>=2);
  const bridge=selected.filter(l=>isHunterBridgeLine(l.id));
  if (bridge.length!==2 || new Set(bridge.map(l=>idNumber(l.id))).size!==2) return null;
  const ends=bridge.map(l=>[l.samples[0],l.samples.at(-1)]);
  if (!ends[0].some(a=>ends[1].some(b=>Math.hypot(a.x-b.x,a.y-b.y)<.05))) return null;
  const unique=new Map();
  for(const l of selected) for(const p of l.samples){
    if (![p.x,p.y,p.height].every(Number.isFinite)) return null;
    const key=`${p.x}:${p.y}`,old=unique.get(key);
    unique.set(key,{...p,height:Math.max(p.height,old?.height??-Infinity),groundHeight:Math.max(p.groundHeight??-Infinity,old?.groundHeight??-Infinity)});
  }
  const points=[...unique.values()].sort((a,b)=>a.x-b.x);
  const bankPoints=ends.flat().sort((a,b)=>a.x-b.x),west=bankPoints[0],east=bankPoints.at(-1);
  const first=points[0],last=points.at(-1),span=east.x-west.x;
  const westApproach=selected.find(l=>idNumber(l.id)==='33953421');
  const eastApproach=selected.find(l=>idNumber(l.id)==='33953339');
  if(!westApproach || !eastApproach) return null;
  const westJoin=[westApproach.samples[0],westApproach.samples.at(-1)].sort((a,b)=>a.x-b.x)[0];
  const eastJoin=[eastApproach.samples[0],eastApproach.samples.at(-1)].sort((a,b)=>b.x-a.x)[0];
  // Fail closed if the source changes topology, or approaches are unavailable.
  if (span<100 || west.x-first.x<20 || last.x-east.x<20 || points.some((p,i)=>i && p.x-points[i-1].x<1e-5)) return null;
  let westY=Math.max(west.height,Number(sourceHeight(west.x,west.y))+.14);
  let eastY=Math.max(east.height,Number(sourceHeight(east.x,east.y))+.14);
  if (![westY,eastY].every(Number.isFinite)) return null;
  const leftNeighbor=points.filter(p=>p.x<westJoin.x).at(-1);
  const rightNeighbor=points.find(p=>p.x>eastJoin.x);
  if(!leftNeighbor || !rightNeighbor) return null;
  const slopeWest=clamp((westJoin.height-leftNeighbor.height)/(westJoin.x-leftNeighbor.x),-.06,.06);
  const slopeEast=clamp((rightNeighbor.height-eastJoin.height)/(rightNeighbor.x-eastJoin.x),-.06,.06);
  const originalElevation=x=>{
    const i=points.findIndex(p=>p.x>=x),b=points[Math.max(0,i)],a=points[Math.max(0,i-1)];
    return a===b?b.height:a.height+(b.height-a.height)*(x-a.x)/(b.x-a.x);
  };
  const elevation=(x,w=westY,e=eastY)=>{
    const slope=(e-w)/span;
    if(x<=westJoin.x || x>=eastJoin.x) return originalElevation(x);
    if(x<west.x) return hermite(x,westJoin.x,west.x,westJoin.height,w,slopeWest,slope);
    if(x>east.x) return hermite(x,east.x,eastJoin.x,e,eastJoin.height,slope,slopeEast);
    return w+(x-west.x)*slope;
  };
  // Respect the approach's terrain-clearance envelope, rather than retaining
  // reconciliation humps propagated from unrelated neighboring ways. Raise the
  // relevant bank gently if needed; outer road joins remain fixed.
  for(let pass=0;pass<10;pass++){
    let change=0;
    for(const p of points){
      if(p===first || p===last || !Number.isFinite(p.groundHeight)) continue;
      const deficit=p.groundHeight-elevation(p.x);
      if(deficit<=.001) continue;
      const westSide=p.x<(west.x+east.x)/2;
      const influence=elevation(p.x,westY+(westSide?1:0),eastY+(westSide?0:1))-elevation(p.x);
      if(influence<.0001) continue;
      const lift=deficit/influence;
      if(westSide) westY+=lift; else eastY+=lift;
      change=Math.max(change,lift);
    }
    if(change<.001) break;
  }
  // A bad/new source must not create a large artificial embankment.
  if(Math.abs(eastY-westY)/span>.06 || westY-Math.max(west.height,sourceHeight(west.x,west.y)+.14)>3
    || eastY-Math.max(east.height,sourceHeight(east.x,east.y)+.14)>3) return null;
  const routeSegments=[];
  for(const l of selected) for(let i=1;i<l.samples.length;i++) routeSegments.push({a:l.samples[i-1],b:l.samples[i],width:l.profile.width,lineId:l.id,bridge:isHunterBridgeLine(l.id)});
  const minZ=Math.min(...points.map(p=>p.y))-12,maxZ=Math.max(...points.map(p=>p.y))+12;
  function nearest(x,z){
    if(x<first.x-1e-7 || x>last.x+1e-7 || z<minZ || z>maxZ) return null;
    let best=null;
    for(const s of routeSegments){
      const dx=s.b.x-s.a.x,dz=s.b.y-s.a.y,l2=dx*dx+dz*dz;
      const t=clamp(((x-s.a.x)*dx+(z-s.a.y)*dz)/l2,0,1);
      const distance=Math.hypot(x-s.a.x-dx*t,z-s.a.y-dz*t);
      if(!best || distance<best.distance) best={...s,distance,t};
    }
    return best;
  }
  const result={
    bounds:{minX:first.x,maxX:last.x,minZ,maxZ},
    banks:{west:{x:west.x,z:west.y,height:westY},east:{x:east.x,z:east.y,height:eastY}},
    heightAt(x,z,reach=10){const hit=nearest(x,z);return hit && hit.distance<=reach?elevation(x):null;},
    roadAt(x,z){const hit=nearest(x,z);return hit && hit.distance<=hit.width/2?{height:hit.a.height+(hit.b.height-hit.a.height)*hit.t,onRoad:true,name:'Hunter Street East',bridge:hit.bridge,width:hit.width,distance:hit.distance,lineId:hit.lineId}:null;},
  };
  for(const l of selected) for(const p of l.samples) p.height=elevation(p.x);
  return result;
}
