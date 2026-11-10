import {planRecordedEnclosedBays} from './recorded-enclosed-bays.js?v=1.6.208';
const finite=Number.isFinite;
const distanceToSegment=(p,a,b)=>{
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));
 return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
};
// The occupied span is clipped at the directory plane's actual wall outset.
// Include the renderer's 3 mm raised sash; clearance is intentionally conservative.
export function enclosedBayObstructions(plan,{centerAlong,bottom,top,width,outset}){
 if(![centerAlong,bottom,top,width,outset].every(finite)||width<=0||top<=bottom)return[];
 const volumes=[...plan.bays.map((bay,index)=>({...bay,bayIndex:index,bottom:bay.summary.bottomMetres,top:bay.summary.bottomMetres+bay.summary.heightMetres})),
  ...plan.joins.map(join=>({...plan.bays[join.lowerIndex],bayIndex:join.lowerIndex,join:true,bottom:join.bottomMetres,top:join.bottomMetres+join.heightMetres}))];
 const hits=[];
 for(const volume of volumes){
  if(top<=volume.bottom-.01||bottom>=volume.top+.01)continue;
  const threshold=outset-.013,points=[];
  for(let i=0;i<volume.outline.length-1;i++){
   const a=volume.outline[i],b=volume.outline[i+1];
   if(a.out>=threshold)points.push(a.x);if(b.out>=threshold)points.push(b.x);
   if((a.out-threshold)*(b.out-threshold)<0)points.push(a.x+(b.x-a.x)*(threshold-a.out)/(b.out-a.out));
  }
  if(!points.length)continue;
  const left=Math.min(...points)-.01,right=Math.max(...points)+.01;
  if(centerAlong+width/2>left&&centerAlong-width/2<right)hits.push({bayIndex:volume.bayIndex,join:volume.join===true,left,right,bottom:volume.bottom,top:volume.top});
 }
 return hits;
}
function matchingFacade(sign,profile,polygons,project){
 for(const face of [profile,...(profile?.additionalFrontages||[]).map(face=>({...profile,...face,enclosedBays:face.enclosedBays,directoryMarkerBands:face.directoryMarkerBands}))]){
  if(!face?.enclosedBays?.length||face.frontLatLon?.length!==2||sign.source?.frontage?.length!==2)continue;
  let edge,rowEdge;try{edge=face.frontLatLon.map(p=>project(p.lat,p.lon)).map(p=>({x:p.x,z:p.z??p.y}));rowEdge=sign.source.frontage.map(p=>project(p.lat,p.lon)).map(p=>({x:p.x,z:p.z??p.y}));}catch{continue}
  if(![...edge,...rowEdge].every(p=>finite(p.x)&&finite(p.z)))continue;
  const [start,end]=edge,length=Math.hypot(end.x-start.x,end.z-start.z);if(length<1||rowEdge.some(p=>distanceToSegment(p,start,end)>.18))continue;
  const polygon=polygons.find(p=>p.rings[0].some((a,i,ring)=>{const b=ring[(i+1)%ring.length];return edge.every(q=>distanceToSegment(q,a,b)<=.18)}));
  if(!polygon)continue;
  const frame={start,length,tangent:{x:(end.x-start.x)/length,z:(end.z-start.z)/length},outward:sign.normal};
  const height=Math.min(polygon.wallTop-polygon.base,Number(face.detailHeightMetres)||Number(face.eaveHeight)||Number(face.height)||Infinity);
  return{face,frame,base:polygon.base,height,plan:planRecordedEnclosedBays({frame,base:polygon.base,height,specs:face.enclosedBays})};
 }
 return null;
}
export function constrainBusinessSignToReviewedBays({sign,profile,polygons,project}){
 const matched=matchingFacade(sign,profile,polygons,project);if(!matched)return{sign};
 const {frame,base,height,plan,face}=matched;
 const centerAlong=(sign.center.x-frame.start.x)*frame.tangent.x+(sign.center.z-frame.start.z)*frame.tangent.z;
 const outset=(sign.center.x-frame.start.x)*frame.outward.x+(sign.center.z-frame.start.z)*frame.outward.z;
 const occupied=candidate=>enclosedBayObstructions(plan,{centerAlong,bottom:candidate.bottom-base,top:candidate.top-base,width:candidate.width,outset});
 const collisions=occupied(sign);if(!collisions.length)return{sign};
 const reject=()=>({rejected:{id:sign.id,buildingSourceId:sign.buildingSourceId,reason:'reviewed-bay-obstruction',obstructions:collisions}});
 const bands=face.directoryMarkerBands;
 if(!Array.isArray(bands)||!bands.every(b=>b&&typeof b==='object'&&!Array.isArray(b)
  &&typeof b.directoryId==='string'&&typeof b.businessName==='string'
  &&[b.bottomMetres,b.topMetres,b.heightMetres].every(finite)))return reject();
 const band=bands.find(b=>b.directoryId===sign.id&&b.businessName===sign.name);
 if(!band||![band.bottomMetres,band.topMetres,band.heightMetres].every(finite)||band.bottomMetres<0||band.topMetres>height
  ||band.topMetres<=band.bottomMetres||band.heightMetres<.35||band.heightMetres>band.topMetres-band.bottomMetres)return reject();
 const markerHeight=Math.min(sign.height,band.heightMetres),y=base+(band.bottomMetres+band.topMetres)/2;
 const candidate={...sign,center:{...sign.center,y},height:markerHeight,bottom:y-markerHeight/2,top:y+markerHeight/2};
 if(occupied(candidate).length)return reject();
 candidate.placementEvidence={kind:'estimated-educational-marker',observedSign:false,reviewedDirectoryId:sign.id,
  photoIds:Array.isArray(band.photoIds)?[...band.photoIds]:[],style:'standard-directory-blue',
  note:'Verified location; marker style and clear storefront position are estimates, not reconstructed October signage.',
  originalBottomMetres:sign.bottom-base,originalTopMetres:sign.top-base,bandBottomMetres:band.bottomMetres,bandTopMetres:band.topMetres};
 return{sign:candidate};
}
