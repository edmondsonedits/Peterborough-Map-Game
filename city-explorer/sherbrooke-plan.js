import { SHERBROOKE_SOURCE } from './sherbrooke-source.js';
import { roadProfile } from './road-network.js';
export const sherbrookeBuildings = new Map();
export const sherbrookeSidewalks = [];
export function recordSherbrookeSidewalk(segment, al, ar, bl, br) {
 if(/sherbrooke/i.test(segment.name||segment.tags?.name||'')) sherbrookeSidewalks.push([al,ar,bl,br].map(v=>({x:v.x,y:v.y,z:v.z})));
}
const ids = new Set(SHERBROOKE_SOURCE.buildings.map(b=>b.id));
export function recordSherbrookeBuilding(id, ring, base, top) {
 if(ids.has(id)) sherbrookeBuildings.set(id,{id,ring:ring.map(p=>({x:p.x,z:p.y})),base,top});
}
export function segmentDistance(p,a,b) {
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
export function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;}return hit;}
export function makeSherbrookePlan(project,{lowPower=false,photographedOnly=false}={}) {
 const point=p=>{const v=project(p[1],p[0]);return {x:v.x,z:v.y};};
 const rings=SHERBROOKE_SOURCE.buildings.map(b=>b.ring.map(point));
 const roads=SHERBROOKE_SOURCE.clearanceRoads.flatMap(r=>r.line.slice(1).map((p,i)=>({a:point(r.line[i]),b:point(p),id:r.id,width:roadProfile(r.tags)?.width||5})));
 const features=[],wires=[],occupied=[];
 const clear=(p,radius,roadId)=>!rings.some(r=>inside(p,r)||r.some((a,i)=>segmentDistance(p,a,r[(i+1)%r.length])<radius))&&!roads.some(r=>r.id!==roadId&&segmentDistance(p,r.a,r.b)<r.width/2+radius+1);
 const put=(kind,p,yaw,size,id,roadId,radius=.3)=>{if(!clear(p,radius,roadId))return null;const f={kind,...p,yaw,size,id};features.push(f);return f;};
 for(const r of SHERBROOKE_SOURCE.roads){
  if(r.tags.bridge==='yes'||r.tags.tunnel==='yes'||r.tags.sidewalk==='no')continue;
  const width=roadProfile(r.tags)?.width||7,pts=r.line.map(point);
  let chain=0,nextPole=16,nextTree=11,previousPole=null;
  for(let n=1;n<pts.length;n++){
   const a=pts[n-1],b=pts[n],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.1)continue;
   const tx=dx/len,tz=dz/len,nx=-tz,nz=tx,yaw=Math.atan2(tx,tz);
   const at=(s,side,offset)=>({x:a.x+tx*s+nx*side*offset,z:a.z+tz*s+nz*side*offset});
   const photo=r.line[n][0]>=-78.3231&&r.line[n][0]<=-78.3187;
   if(photographedOnly&&!photo){chain+=len;continue;}
   while(nextPole<chain+len){const s=nextPole-chain;if(s>=0){const p=at(s,nz>=0?1:-1,width/2+2.9);if(!occupied.some(q=>q.kind==='pole'&&Math.hypot(q.x-p.x,q.z-p.z)<22)){
    const pole=put('pole',p,yaw,9.3,`${r.id}:pole:${nextPole}`,r.id,.55);
    if(pole){occupied.push(pole);if(previousPole&&Math.hypot(p.x-previousPole.x,p.z-previousPole.z)<65)wires.push({a:previousPole,b:pole,nx,nz});previousPole=pole;}
   }}nextPole+=38;}
   while(nextTree<chain+len){const s=nextTree-chain;if(s>=0)for(const side of [-1,1]){
    const p=at(s,side,width/2+5.8),seed=Math.round(nextTree/19);
    // Preserve the existing Station 1 apron, tree and planting composition.
    const station=p.z<point([-78.32215,44.3009]).z+15 && Math.hypot(p.x-point([-78.32215,44.3009]).x,p.z-point([-78.32215,44.3009]).z)<45;
    if(!station&& !occupied.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<6)) {const tree=put(seed%3?'tree':'upright',p,yaw,6.5+(seed%4)*.65,`${r.id}:tree:${nextTree}:${side}`,r.id,2.7);if(tree)occupied.push(tree);}
   }nextTree+=lowPower?38:19;}
   chain+=len;
  }
 }
 // Stitch neighbouring source ways into a continuous inferred overhead run.
 wires.length=0;
 const poles=features.filter(f=>f.kind==='pole').sort((a,b)=>a.x-b.x);
 for(let i=1;i<poles.length;i++){const a=poles[i-1],b=poles[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length>0&&length<65)wires.push({a,b,nx:-dz/length,nz:dx/length});}
 return {features,wires,roads,rings,targetIds:SHERBROOKE_SOURCE.roads.map(r=>r.id),source:SHERBROOKE_SOURCE.evidence};
}

export function landscapeClear(p, radius, plan) {
 return !plan.roads.some(r=>segmentDistance(p,r.a,r.b)<r.width/2+radius+1)
  && !plan.rings.some(r=>inside(p,r)||r.some((a,i)=>segmentDistance(p,a,r[(i+1)%r.length])<radius));
}
