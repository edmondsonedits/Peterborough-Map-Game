import * as THREE from 'three';
import { loadStreetscapeAsset } from './streetscape-assets.js';
import { makeSherbrookePlan, sherbrookeBuildings, sherbrookeSidewalks, segmentDistance, landscapeClear } from './sherbrooke-plan.js';
const ASSETS={railing:['props/railing-metal-module.glb',.7],fence:['props/fence-wood-module.glb',.7],pole:['props/utility-pole-transformer.glb',9.3],lamp:['props/streetlight.glb',7.5],tree:['trees/broad-irregular-lod1.glb',7],upright:['trees/upright-lod1.glb',8],vent:['props/facade-vent.glb',.6],planter:['props/planter.glb',.55],bench:['props/bench.glb',.85],canopy:['props/facade-canopy.glb',.5]};
function lampHead(geometry){
 const src=geometry.index?geometry.toNonIndexed():geometry,keep=[],pos=src.getAttribute('position');
 for(let i=0;i<pos.count;i+=3)if([0,1,2].every(j=>pos.getY(i+j)>.72))keep.push(i,i+1,i+2);
 const result=new THREE.BufferGeometry();
 for(const [name,a]of Object.entries(src.attributes)){const values=[];for(const i of keep)for(let j=0;j<a.itemSize;j++)values.push(a.array[i*a.itemSize+j]);result.setAttribute(name,new THREE.Float32BufferAttribute(values,a.itemSize));}
 if(src!==geometry)src.dispose();geometry.dispose();return result;
}
export async function installSherbrookeDetails({group,project,terrainHeightAtWorld,lowPower=false}) {
 const plan=makeSherbrookePlan(project,{lowPower});
 const root=new THREE.Group();root.name='SherbrookeReferenceStreetscape';root.userData={type:'decorative-streetscape',evidence:plan.source,collision:false};
 const loaded=await Promise.allSettled(Object.entries(ASSETS).map(async([key,[path]])=>[key,await loadStreetscapeAsset(path)]));
 const assets=new Map(loaded.filter(r=>r.status==='fulfilled').map(r=>r.value));
 const batches=new Map(),counts={},dummy=new THREE.Object3D();
 const mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95});
 const geometries={box:new THREE.BoxGeometry(1,1,1),bush:new THREE.IcosahedronGeometry(1,1),cylinder:new THREE.CylinderGeometry(.5,.5,1,8)};
 function batch(kind,geometry,material,p,scale,yaw=0,color=0xffffff){
  const tile=`${Math.floor(p.x/160)}:${Math.floor(p.z/160)}`,key=`${kind}:${tile}`;
  if(!batches.has(key))batches.set(key,{geometry,material,items:[],kind});
  batches.get(key).items.push({p,scale,yaw,color});counts[kind]=(counts[kind]||0)+1;
 }
 function box(kind,x,y,z,sx,sy,sz,yaw,color){batch(kind,geometries.box,mat,{x,y,z},[sx,sy,sz],yaw,color);}
 function asset(kind,p,height,yaw=0){const a=assets.get(kind);if(!a)return;
  // Flatten each source mesh once; every placed copy shares normalized geometry/material.
  if(!a.parts){a.parts=[];a.scene.traverse(m=>{if(!m.isMesh)return;const g=m.geometry.clone().applyMatrix4(m.matrixWorld);const c=a.bounds.getCenter(new THREE.Vector3());g.translate(-c.x,-a.bounds.min.y,-c.z);g.scale(1/a.size.y,1/a.size.y,1/a.size.y);a.parts.push({g:kind==='lamp'?lampHead(g):g,m:m.material});});}
  a.parts.forEach((part,i)=>batch(`${kind}-${i}`,part.g,part.m,p,[height,height,height],yaw));
 }
 const at=(x,z,dy=0)=>({x,y:terrainHeightAtWorld(x,z)+dy,z});
 for(const f of plan.features){
  asset(f.kind,at(f.x,f.z),f.size,f.yaw);
  if(f.kind==='pole'){asset('lamp',at(f.x,f.z,1),7.4,f.yaw+Math.PI/2);for(const dy of [5.6,6.05])batch('pole-bands',geometries.cylinder,mat,at(f.x,f.z,dy),[.32,.06,.32],0,0x656663);}
 }
 // Thin sagging conductors are one line batch per spatial tile, not one draw per span.
 const wireTiles=new Map();
 for(const span of plan.wires)for(let cable=0;cable<(lowPower?3:5);cable++){
  const key=`${Math.floor(span.a.x/160)}:${Math.floor(span.a.z/160)}`;if(!wireTiles.has(key))wireTiles.set(key,[]);const out=wireTiles.get(key);
  const offset=(cable-2)*.48,h=cable<3?8.65:6.45,ay=terrainHeightAtWorld(span.a.x,span.a.z)+h,by=terrainHeightAtWorld(span.b.x,span.b.z)+h;
  const p=t=>[span.a.x+(span.b.x-span.a.x)*t+span.nx*offset,ay+(by-ay)*t-4*.65*t*(1-t),span.a.z+(span.b.z-span.a.z)*t+span.nz*offset];
  for(let k=0;k<12;k++)out.push(...p(k/12),...p((k+1)/12));counts['wire-spans']=(counts['wire-spans']||0)+1;
 }
 const poles=plan.features.filter(f=>f.kind==='pole');
 for(const b of sherbrookeBuildings.values()){
  if(b.id==='way/1009651229'||Number(b.id.split('/')[1])%3!==0||b.top-b.base<3.6)continue;
  let pair=null;
  for(const pole of poles)for(const v of b.ring){const d=Math.hypot(v.x-pole.x,v.z-pole.z);if(d>5&&d<28&&(!pair||d<pair.d))pair={pole,v,d};}
  if(!pair)continue;const {pole,v}=pair,key=`${Math.floor(pole.x/160)}:${Math.floor(pole.z/160)}`;
  if(!wireTiles.has(key))wireTiles.set(key,[]);const out=wireTiles.get(key),ay=terrainHeightAtWorld(pole.x,pole.z)+6.4,by=Math.min(b.top-.2,b.base+5);
  const p=t=>[pole.x+(v.x-pole.x)*t,ay+(by-ay)*t-.6*t*(1-t),pole.z+(v.z-pole.z)*t];for(let i=0;i<8;i++)out.push(...p(i/8),...p((i+1)/8));counts['service-drops']=(counts['service-drops']||0)+1;
 }
 for(const positions of wireTiles.values()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));root.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x272727})));}
 const seamTiles=new Map();
 for(const [al,ar,bl,br]of sherbrookeSidewalks){
  const length=Math.hypot(bl.x-al.x,bl.z-al.z),key=`${Math.floor(al.x/160)}:${Math.floor(al.z/160)}`;
  if(!seamTiles.has(key))seamTiles.set(key,[]);const positions=seamTiles.get(key);
  for(let d=1;d<length-.3;d+=lowPower?4:2){const t=d/length;for(const [a,b]of [[al,bl],[ar,br]])positions.push(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t+.012,a.z+(b.z-a.z)*t);counts['sidewalk-joints']=(counts['sidewalk-joints']||0)+1;}
 }
 for(const positions of seamTiles.values()){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));root.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x88877d})));}
 const targetRoads=plan.roads.filter(r=>plan.targetIds.includes(r.id));
 for(const b of sherbrookeBuildings.values()){
  if(b.id==='way/1009651229'||b.top-b.base<2.5)continue;
  let best=null;
  b.ring.forEach((a,i)=>{const c=b.ring[(i+1)%b.ring.length],length=Math.hypot(c.x-a.x,c.z-a.z);if(length<4)return;const p={x:(a.x+c.x)/2,z:(a.z+c.z)/2};const d=Math.min(...targetRoads.map(r=>segmentDistance(p,r.a,r.b)));if(!best||d<best.d)best={a,c,length,p,d};});
  if(!best||best.d>40)continue;
  const seed=Number(b.id.split('/')[1])%997;
  const {a,c,length,p}=best,ux=(c.x-a.x)/length,uz=(c.z-a.z)/length;
  const area=b.ring.reduce((sum,v,i)=>{const q=b.ring[(i+1)%b.ring.length];return sum+v.x*q.z-q.x*v.z;},0),sign=area>0?1:-1,nx=uz*sign,nz=-ux*sign,yaw=Math.atan2(ux,uz);
  const q=(t,out=0)=>({x:a.x+ux*length*t+nx*out,z:a.z+uz*length*t+nz*out});
  box('cornice',p.x+nx*.09,b.top-.18,p.z+nz*.09,.18,.18,length,yaw,0x645f52);
  box('plinth',p.x+nx*.08,b.base+.18,p.z+nz*.08,.16,.28,length,yaw,0x746e62);
  for(const t of [.045,.955]){const v=q(t,.16);box('downpipe',v.x,(b.top+b.base)/2,v.z,.09,b.top-b.base,.09,0,0x787772);}
  // Low sill courses and masonry joints avoid covering the existing window layout.
  if(!lowPower)for(let i=1;i<Math.floor(length/.6);i++){const v=q(i*.6/length,.17);box('masonry-joint',v.x,b.base+.17,v.z,.018,.22,.012,yaw,0x928b7b);}
  if(seed%3!==0){
   const m=q(.08,.19),facing=Math.atan2(nx,nz);
   box('meter-box',m.x,b.base+1.1,m.z,.24,.34,.13,facing,0x92948c);
   box('meter-glass',m.x+nx*.08,b.base+1.15,m.z+nz*.08,.13,.13,.03,facing,0x34474d);
   box('meter-conduit',m.x,b.base+.52,m.z,.035,.9,.035,0,0x737976);
  }
  // Short corner garden edging, leaving central entry approaches open.
  if(best.d>13&&length>8&&seed%3===0){
   const center=q(.18,2.6),ends=[q(.18-1/length,2.6),q(.18+1/length,2.6)];
   if([center,...ends].every(v=>landscapeClear(v,.65,plan))){
    for(let i=0;i<8;i++){const v=q(.18+(i-3.5)*.25/length,2.6);box('retaining-block',v.x,terrainHeightAtWorld(v.x,v.z)+.14,v.z,.28,.28,.24,yaw,seed%2?0x8a8270:0x75624a);}
    if(seed%2===0){const v=q(.18,2.7);asset(seed%4===0?'railing':'fence',at(v.x,v.z),.7,Math.atan2(nx,nz));}
   }
  }
  const v=q(.12,.18);asset('vent',{...v,y:b.base+.65},.42,Math.atan2(nx,nz));
  // Small garden clusters only on clear setbacks, away from every road and footprint.
  if(best.d>13){for(let j=0;j<(lowPower?2:5);j++){const v=q(.16+j*.14,1.5);if(plan.roads.some(r=>segmentDistance(v,r.a,r.b)<r.width/2+3))continue;
   if(!landscapeClear(v,.55,plan))continue;
   batch('shrub',geometries.bush,mat,at(v.x,v.z,.5),[.48+(seed%4)*.09,.4+(seed%5)*.07,.5+(seed%3)*.1],j*.71+(seed%7),j%3?0x526434:0x62703e);
   if(!lowPower&&seed%5===0)for(let k=0;k<5;k++){const x=v.x+Math.cos(k*2.4)*.7,z=v.z+Math.sin(k*2.4)*.7;batch('garden-flower',geometries.bush,mat,at(x,z,.18),[.1,.08,.1],0,k%4?0xc5484e:0xe6e1cb);}
  }}
  // Mapped storefront seen in reference f28: original awnings/planters, no copied branding.
  if(b.id==='way/194192530'){
   for(const t of [.25,.65]){const v=q(t,.35);asset('canopy',{...v,y:b.base+2.35},.55,Math.atan2(nx,nz));}
   for(const t of [.09,.9]){const v=q(t,1.25);asset('planter',at(v.x,v.z),.55,Math.atan2(nx,nz));}
   box('shop-green-trim',p.x+nx*.12,b.top-.1,p.z+nz*.12,.15,.2,length,yaw,0x305d47);
   for(const t of [.08,.92]){const v=q(t,1.8);const gy=terrainHeightAtWorld(v.x,v.z);for(let k=0;k<16;k++){const angle=k*Math.PI/8;box('litter-bin-slats',v.x+Math.cos(angle)*.25,gy+.4,v.z+Math.sin(angle)*.25,.04,.8,.04,0,0x363c38);}batch('litter-bin-rim',geometries.cylinder,mat,{...v,y:gy+.81},[.57,.055,.57],0,0x363c38);}
  }
  for(const t of [.075,.925]){const v=q(t,.23);box('wall-lamp-mount',v.x,b.base+2.45,v.z,.14,.32,.18,Math.atan2(nx,nz),0x3f4642);box('wall-lamp-lens',v.x+nx*.1,b.base+2.44,v.z+nz*.1,.12,.17,.12,0,0xd4d4bb);}
  counts['detailed-frontages']=(counts['detailed-frontages']||0)+1;
 }
 for(const [key,b]of batches){const mesh=new THREE.InstancedMesh(b.geometry,b.material,b.items.length);b.items.forEach((v,i)=>{dummy.position.set(v.p.x,v.p.y,v.p.z);dummy.rotation.set(0,v.yaw,0);dummy.scale.set(...v.scale);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);if(b.material===mat)mesh.setColorAt(i,new THREE.Color(v.color));});mesh.computeBoundingSphere();mesh.castShadow=!lowPower&&!/joint|slab|flower/.test(b.kind);mesh.receiveShadow=true;mesh.name=key;root.add(mesh);}
 const status={counts,instances:Object.entries(counts).filter(([k])=>k!=='detailed-frontages').reduce((s,[,v])=>s+v,0),batches:root.children.length,failedAssets:loaded.filter(r=>r.status==='rejected').length,profile:lowPower?'lite':'full',evidence:plan.source};
 root.userData.status=status;group.add(root);document.documentElement.dataset.sherbrookeDetails=JSON.stringify(status);return status;
}
