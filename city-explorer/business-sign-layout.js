import {facadeDetailClass} from './city-detail-rules.js?v=street-evidence-2';
// Pure wall-layout rules shared by the catalogue builder and runtime. Positions
// are checked against rendered outer rings; courtyard walls are never selected.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const point=p=>({x:Number(p.x),z:Number(p.z??p.y)});
function segment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz,t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(l2||1),0,1);return{t,distance:Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)}}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)yes=!yes}return yes}
// Match the generated facade opening bands; reviewed profiles retain their own scale.
export function businessOpeningTop(tags,wallHeight,profile){
 if(profile){const floor=(profile.detailHeightMetres||profile.eaveHeight||profile.height)/(profile.levels||1),glass=profile.glazedLevels?.includes(0)||(profile.style==='office'&&profile.largeGlazedFront);return Math.max(2.2,glass?floor*.98:profile.style==='retail'?floor*.43+Math.min(2.15,floor*.7)/2:2.2)}
 if(wallHeight<3.1)return 2.2;
 const type=facadeDetailClass(tags);return type==='storefront'?Math.min(wallHeight-.28,2.72):type==='industrial'?Math.min(wallHeight-.35,3.33):Math.min(wallHeight-.34,2.44);
}
export function signVisibilityChanged(previous,next,threshold=15){return !previous||Math.hypot(next.x-previous.x,next.z-previous.z)>=threshold}
export function wrapSignText(text,measure,maxWidth){
 const words=String(text).trim().split(/\s+/),lines=[];let line='';
 for(const word of words){const next=line?line+' '+word:word;if(line&&measure(next)>maxWidth){lines.push(line);line=word}else line=next}if(line)lines.push(line);return lines;
}
function planBusinessWallSignsOnce({building,businesses,project}){
 const signs=[],rejected=[],groups=new Map(),reject=(row,reason)=>rejected.push({id:row.id,buildingSourceId:row.buildingSourceId,reason});
 for(const row of businesses||[]){
  if(row.buildingSourceId!==building.sourceId||row.placementStatus!=='approved'){reject(row,'unapproved-building-match');continue}
  if(!String(row.name||'').trim()||!Array.isArray(row.frontage)||row.frontage.length!==2){reject(row,'missing-frontage');continue}
  const [p,q]=row.frontage.map(p=>point(project(Number(p.lat),Number(p.lon))));
  if(![p.x,p.z,q.x,q.z].every(Number.isFinite)||Math.hypot(p.x-q.x,p.z-q.z)<1){reject(row,'invalid-frontage');continue}
  const fraction=clamp(Number.isFinite(row.fraction)?row.fraction:.5,0,1),desired={x:p.x+(q.x-p.x)*fraction,z:p.z+(q.z-p.z)*fraction};let best=null;
  for(let pi=0;pi<(building.polygons||[]).length;pi++){
   const polygon=building.polygons[pi],ring=polygon.rings[0].map(point);if(ring.length>3&&Math.hypot(ring[0].x-ring.at(-1).x,ring[0].z-ring.at(-1).z)<1e-5)ring.pop();
   for(let ei=0;ei<ring.length;ei++){const a=ring[ei],b=ring[(ei+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1.4)continue;
    const error=Math.max(segment(p,a,b).distance,segment(q,a,b).distance);if(error>.18)continue;
    if(!best||error<best.error)best={a,b,length,polygon,ring,pi,ei,error,desired:segment(desired,a,b).t*length};
   }
  }
  if(!best){reject(row,'frontage-not-on-rendered-outer-wall');continue}
  const height=best.polygon.wallTop-best.polygon.base;if(!Number.isFinite(height)||height<2.6-1e-7){reject(row,'insufficient-height-above-opening');continue}
  const key=best.pi+':'+best.ei;if(!groups.has(key))groups.set(key,{...best,rows:[]});groups.get(key).rows.push({row,desired:best.desired});
 }
 for(const group of groups.values()){
  const {a,b,length,polygon}=group,margin=.18,gap=.18,minWidth=1.2;
  const ordered=group.rows.sort((a,b)=>a.desired-b.desired||String(a.row.id).localeCompare(String(b.row.id))),active=[];let minimumUsed=0;
  for(const item of ordered){const minimum=item.row.placementMode==='shared-entrance-directory'?4.8:Math.max(minWidth,Number(item.row.minWidthMetres)||0);if(minimumUsed+minimum+gap*active.length>length-margin*2){reject(item.row,'insufficient-wall-space');continue}active.push({...item,minimum});minimumUsed+=minimum}
  if(!active.length)continue;
  const requested=active.map(item=>Math.max(item.minimum,Number(item.row.widthMetres)||clamp(String(item.row.name).length*.095+1.2,2.2,6))),extra=requested.reduce((sum,w,i)=>sum+w-active[i].minimum,0),space=length-margin*2-gap*(active.length-1)-minimumUsed,scale=extra?Math.min(1,space/extra):1;
  const fitted=active.map((item,i)=>{const width=item.minimum+(requested[i]-item.minimum)*scale;return{...item,width,left:clamp(item.desired-width/2,margin,length-margin-width)}});
  for(let i=1;i<fitted.length;i++)fitted[i].left=Math.max(fitted[i].left,fitted[i-1].left+fitted[i-1].width+gap);
  if(fitted.at(-1).left+fitted.at(-1).width>length-margin){fitted.at(-1).left=length-margin-fitted.at(-1).width;for(let i=fitted.length-2;i>=0;i--)fitted[i].left=Math.min(fitted[i].left,fitted[i+1].left-gap-fitted[i].width)}
  const tangent={x:(b.x-a.x)/length,z:(b.z-a.z)/length},mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};let normal={x:-tangent.z,z:tangent.x};
  if(inside({x:mid.x+normal.x*.03,z:mid.z+normal.z*.03},group.ring))normal={x:-normal.x,z:-normal.z};
  for(const item of fitted){
   const {row,width,left}=item,right=left+width,offset=Math.abs(left+width/2-item.desired),directory=row.placementMode==='shared-entrance-directory';
   if(offset>(Number(row.maxShiftMetres)||2.5)){reject(row,'tenant-position-requires-review');continue}
   const openingTop=Math.max(2.2,Number(row.openingTopMetres)||2.2),wallHeight=polygon.wallTop-polygon.base;
   const clearance=directory?.18:Math.min(.18,Math.max(.05,wallHeight-openingTop-.35)),height=directory?1.6:Math.min(clamp(Number(row.heightMetres)||.54,.35,.8),wallHeight-openingTop-clearance);
   if(height<.35-1e-7){reject(row,'insufficient-height-above-opening');continue}
   const requestedY=Math.max(Number(row.heightAboveBaseMetres)||(directory?3.2:2.78),openingTop+height/2+.1),y=Math.min(polygon.base+requestedY,polygon.wallTop-clearance-height/2);
   if(y-height/2<polygon.base+openingTop-1e-7){reject(row,'insufficient-height-above-opening');continue}
   const t=(left+width/2)/length,outset=clamp(Number(row.outsetMetres)||.16,.08,.8),center={x:a.x+(b.x-a.x)*t+normal.x*outset,y,z:a.z+(b.z-a.z)*t+normal.z*outset};
   signs.push({id:row.id,name:row.name,address:row.address||'',buildingSourceId:building.sourceId,placementMode:row.placementMode||'street-facing-wall',members:row.members||null,center,normal,rightVector:{x:normal.z,z:-normal.x},width,height,bottom:y-height/2,top:y+height/2,left,right,source:row});
  }
 }
 return{signs,rejected};
}

// Pruning a crowded wall must not invalidate the remaining approved subset:
// removing a tenant changes available widths, so settle until replanning agrees.
export function planBusinessWallSigns(options){
 let businesses=options.businesses||[],rejected=[],result;
 for(let pass=0;pass<=businesses.length+rejected.length;pass++){
  result=planBusinessWallSignsOnce({...options,businesses});
  if(!result.rejected.length)return{signs:result.signs,rejected};
  const ids=new Set(result.rejected.map(r=>r.id));rejected.push(...result.rejected);
  const remaining=businesses.filter(r=>!ids.has(r.id));
  if(remaining.length===businesses.length)return{signs:result.signs,rejected};
  businesses=remaining;
 }
 return{signs:[],rejected};
}
