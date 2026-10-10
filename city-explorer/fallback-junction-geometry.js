/** Opt-in experimental fallback junction polygon solver.
 * Road/source coordinates remain untouched; municipal pavement takes precedence.
 * Based on shared principles from osm2streets and OpenStreetMap Racer, not copied code.
 * Works with the city-explorer's sampled road segment shape and is Three.js-free.
 */
function cross(ax,az,bx,bz){return ax*bz-az*bx;}
function polygonArea(p){let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a.x*b.z-b.x*a.z;}return area/2;}
function pointInTriangle(p,a,b,c,orientation){const s1=cross(b.x-a.x,b.z-a.z,p.x-a.x,p.z-a.z)*orientation;const s2=cross(c.x-b.x,c.z-b.z,p.x-b.x,p.z-b.z)*orientation;const s3=cross(a.x-c.x,a.z-c.z,p.x-c.x,p.z-c.z)*orientation;return s1>=-1e-7&&s2>=-1e-7&&s3>=-1e-7;}
function triangulateJunction(points){
  if(points.length<3)return[];
  const orientation=Math.sign(polygonArea(points));
  if(!orientation)return[];
  const indices=Array.from({length:points.length},(_,i)=>i),result=[];
  for(let guard=0;indices.length>3&&guard<points.length*points.length;guard++){
    let ear=false;
    for(let j=0;j<indices.length;j++){
      const ia=indices[(j-1+indices.length)%indices.length],ib=indices[j],ic=indices[(j+1)%indices.length];
      const a=points[ia],b=points[ib],c=points[ic];
      if(cross(b.x-a.x,b.z-a.z,c.x-b.x,c.z-b.z)*orientation<=1e-6)continue;
      if(indices.some(k=>k!==ia&&k!==ib&&k!==ic&&pointInTriangle(points[k],a,b,c,orientation)))continue;
      result.push(ia,ib,ic);indices.splice(j,1);ear=true;break;
    }
    if(!ear)return[];
  }
  if(indices.length!==3)return[];
  result.push(...indices);
  return result;
}
function solveFallbackJunctions(segments,options={}){
  const maxTrim=options.maxTrim??14, minAngle=options.minAngle??0.12;
  if(!Number.isFinite(maxTrim)||maxTrim<=0||!Number.isFinite(minAngle)||minAngle<=0)throw new TypeError('Invalid junction options');
  const nodes=new Map(),trimBySegment=new Map(),polygons=[],solvedKeys=new Set();
  for(const segment of segments){
    if(segment.profile?.parkingAisle||segment.profile?.tunnel)continue;
    if(!Number.isFinite(segment.width)||segment.width<=0)continue;
    for(const endpoint of ['a','b']){
      if(!segment[`${endpoint}SourceVertex`])continue;
      const p=segment[endpoint],q=segment[endpoint==='a'?'b':'a'],y=segment[`${endpoint}Y`],qY=segment[endpoint==='a'?'bY':'aY'];
      if(!p||!q||![p.x,p.y,q.x,q.y,y,qY].every(Number.isFinite))continue;
      const dx=q.x-p.x,dz=q.y-p.y,length=Math.hypot(dx,dz);
      if(length<0.2)continue;
      const key=`${Math.round(p.x*20)}:${Math.round(p.y*20)}:${Math.round(y*4)}`;
      if(!nodes.has(key))nodes.set(key,{key,x:p.x,z:p.y,y,arms:[]});
      nodes.get(key).arms.push({segment,endpoint,lineId:segment.lineId,dx:dx/length,dz:dz/length,length,y,qY,width:segment.width,
        half:segment.width/2,angle:Math.atan2(dz,dx),profile:segment.profile});
    }
  }
  for(const node of nodes.values()){
    const sorted=node.arms.sort((a,b)=>a.angle-b.angle), arms=[];
    for(const arm of sorted){
      const previous=arms.at(-1);
      if(previous&&Math.abs(arm.angle-previous.angle)<minAngle){
        if(arm.width>previous.width)arms[arms.length-1]=arm;
      }else arms.push(arm);
    }
    if(arms.length>=2&&Math.abs(arms[0].angle+Math.PI*2-arms.at(-1).angle)<minAngle){
      if(arms[0].width>=arms.at(-1).width)arms.pop();else arms.shift();
    }
    if(arms.length<3)continue;
    const trims=arms.map(a=>Math.min(maxTrim,Math.max(0.6,a.half*0.6)));
    for(let i=0;i<arms.length;i++){
      const a=arms[i],b=arms[(i+1)%arms.length];
      const leftA={x:-a.dz*a.half,z:a.dx*a.half},rightB={x:b.dz*b.half,z:-b.dx*b.half};
      const denom=cross(a.dx,a.dz,b.dx,b.dz);
      if(Math.abs(denom)>1e-6){
        const rx=rightB.x-leftA.x,rz=rightB.z-leftA.z;
        const t=cross(rx,rz,b.dx,b.dz)/denom,u=cross(rx,rz,a.dx,a.dz)/denom;
        if(t>=0&&u>=0&&t<=maxTrim&&u<=maxTrim){
          trims[i]=Math.max(trims[i],t+0.05);
          trims[(i+1)%arms.length]=Math.max(trims[(i+1)%arms.length],u+0.05);
        }
      }
    }
    const points=[];
    for(let i=0;i<arms.length;i++){
      const a=arms[i],distance=Math.min(trims[i],maxTrim);
      const x=node.x+a.dx*distance,z=node.z+a.dz*distance;
      const y=a.y+(a.qY-a.y)*Math.min(1,distance/a.length);
      const right={x:x+a.dz*a.half,z:z-a.dx*a.half,y};
      const left={x:x-a.dz*a.half,z:z+a.dx*a.half,y};
      for(const point of [right,left]){
        const previous=points.at(-1);
        if(!previous||Math.hypot(previous.x-point.x,previous.z-point.z)>0.02)points.push(point);
      }
    }
    if(points.length>3&&Math.hypot(points.at(-1).x-points[0].x,points.at(-1).z-points[0].z)<0.02)points.pop();
    const triangles=triangulateJunction(points);
    if(triangles.length<3)continue;
    // Do not invent pavement when the angular arms produce crossed boundaries.
    // A triangle count of n-2 is required for one simple closed polygon.
    if(triangles.length!==(points.length-2)*3)continue;
    const priority = { highway: 6, arterial: 5, collector: 4, local: 3, service: 2, tunnel: 1, unpaved: 0 };
    const dominant = arms.reduce((best, arm) =>
      (priority[arm.profile?.renderClass] ?? 2) > (priority[best.profile?.renderClass] ?? 2) ? arm : best, arms[0]);
    polygons.push({key:node.key,x:node.x,z:node.z,y:node.y,points,triangles,
      materialKey:dominant.profile?.surfaceKey||'roadLocal',
      edgeKey:dominant.profile?.edgeKey||'roadEdge',
      lines:[...new Set(arms.map(a=>a.lineId))],
      trimDistances:trims,angles:arms.map(a=>a.angle)});
    solvedKeys.add(node.key);
    arms.forEach((a,i)=>{
      const entry=trimBySegment.get(a.segment)||{a:0,b:0};
      entry[a.endpoint]=Math.max(entry[a.endpoint],trims[i]);
      trimBySegment.set(a.segment,entry);
    });
  }
  return {polygons,solvedKeys,trimBySegment,examined:nodes.size};
}
export {polygonArea,triangulateJunction,solveFallbackJunctions};
