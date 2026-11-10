import {constrainBusinessSignToReviewedBays} from './business-sign-obstructions.js?v=1.6.208';
import {planBusinessWallSigns,businessOpeningTop,signVisibilityChanged,wrapSignText} from './business-sign-layout.js?v=1.6.208';

export async function loadBusinessDirectory(fetcher=fetch,url=new URL('./data/business-directory.json',import.meta.url)){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{const sourceUrl=new URL(url,import.meta.url);sourceUrl.searchParams.set('v',globalThis.PTBO_BUILD?.version||'1.6.129');const response=await fetcher(sourceUrl,{signal:controller.signal});if(!response.ok)throw new Error('Business directory HTTP '+response.status);const data=await response.json();if(data.schemaVersion!==1||!Array.isArray(data.businesses))throw new Error('Unsupported business directory');return data}finally{clearTimeout(timer)}
}

function makeAtlas(THREE,canvasFactory){
 const pages=[],cell=128,rowHeight=32,cols=8,rows=32;
 function createPage(){const canvas=canvasFactory();canvas.width=1024;canvas.height=1024;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Business sign canvas unavailable');const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.FrontSide,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});const page={canvas,ctx,texture,material,used:Array.from({length:rows},()=>Array(cols).fill(false))};pages.push(page);return page}
 function reserve(w,h){for(const page of pages)for(let y=0;y<=rows-h;y++)for(let x=0;x<=cols-w;x++){let free=true;for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)if(page.used[yy][xx])free=false;if(free){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)page.used[yy][xx]=true;return{page,x,y,w,h}}}createPage();return reserve(w,h)}
 function add(sign){
  const directory=sign.placementMode==='shared-entrance-directory',members=Array.isArray(sign.members)?sign.members.map(m=>typeof m==='string'?m:m.name).filter(Boolean):[];
  if(directory&&(!members.length||members.length>8))return{error:'directory-members-require-review'};
  const spanW=directory||sign.name.length>25||sign.name.split(/\s+/).some(w=>w.length>16)?2:1,spanH=directory?8:sign.name.length>60?2:1,width=spanW*cell,height=spanH*rowHeight,measureContext=pages[0]?.ctx||createPage().ctx,names=directory?[sign.source?.directoryTitle||'IN THIS BUILDING',...members]:[sign.name];let font=directory?18:14,lines=[],fit=false;
  for(;font>=11;font--){measureContext.font=`600 ${font}px Arial,sans-serif`;lines=names.flatMap(name=>wrapSignText(name,t=>measureContext.measureText(t).width,width-12));if(lines.length*(font+2)<=height-6&&lines.every(line=>measureContext.measureText(line).width<=width-12)){fit=true;break}}
  if(!fit)return{error:'text-unreadable-at-minimum-font'};
  const slot=reserve(spanW,spanH),{page,x,y}=slot,px=x*cell,py=y*rowHeight,ctx=page.ctx;
  ctx.fillStyle='#263c42';ctx.fillRect(px,py,width,height);ctx.strokeStyle='#ded9c6';ctx.lineWidth=2;ctx.strokeRect(px+3,py+3,width-6,height-6);ctx.fillStyle='#fffbea';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`600 ${font}px Arial,sans-serif`;
  const lineHeight=font+2;for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],px+width/2,py+height/2+(i-(lines.length-1)/2)*lineHeight,width-16);
  return{page,index:pages.indexOf(page),uv:[px/1024,1-(py+height)/1024,(px+width)/1024,1-py/1024]};
 }

 return{pages,add,finish(){for(const p of pages)p.texture.needsUpdate=true},dispose(){for(const p of pages){p.material.dispose();p.texture.dispose()}}};
}
const normalized=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Older directory rows identify their wall by coordinates rather than a
// frontage index. Compare against actual rendered-sign geometry, never a
// profile which may have been omitted, failed or hidden by a loaded photo.
function sameRenderedFrontage(row,sign,project){
 if(!Number.isInteger(sign.frontageIndex)||sign.frontageIndex<0)return false;
 if(row.frontageIndex!=null)return row.frontageIndex===sign.frontageIndex;
 if(row.frontage?.length!==2||sign.frontage?.length!==2)return false;
 let a,b,c,d;
 try{[a,b,c,d]=[...sign.frontage,...row.frontage].map(p=>{const q=project(p.lat,p.lon);return{x:q.x,z:q.y??q.z}})}catch{return false}
 if(![a.x,a.z,b.x,b.z,c.x,c.z,d.x,d.z].every(Number.isFinite))return false;
 const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<1)return false;
 const along=p=>((p.x-a.x)*dx+(p.z-a.z)*dz)/length;
 const side=p=>Math.abs((p.x-a.x)*dz-(p.z-a.z)*dx)/length;
 const cAlong=along(c),dAlong=along(d);
 return side(c)<=.25&&side(d)<=.25&&Math.min(length,Math.max(cAlong,dAlong))-Math.max(0,Math.min(cAlong,dAlong))>.1;
}
export function createBusinessSignLayer({THREE,parent,features,directory,project,generatedRegistry,profiles={},renderedSignsBySourceId,lowPower=false,canvasFactory=()=>document.createElement('canvas')}){
 const byBuilding=new Map(),roots=[],samples=[],rejected=[],atlas=makeAtlas(THREE,canvasFactory);let existing=0,meshes=0,last=null,lastMode=null;
 for(const row of directory.businesses||[]){if(row.placementStatus!=='approved')continue;if(!byBuilding.has(row.buildingSourceId))byBuilding.set(row.buildingSourceId,[]);byBuilding.get(row.buildingSourceId).push(row)}
 const seenSources=new Set();
 for(const feature of features){const rows=byBuilding.get(feature.sourceId);if(!rows?.length||!feature.generatedId||seenSources.has(feature.sourceId))continue;seenSources.add(feature.sourceId);
  const polygons=feature.sourceGeometry.map((rings,i)=>({rings:rings.map(r=>r.map(([lon,lat])=>{const p=project(lat,lon);return{x:p.x,z:p.y??p.z}})),base:feature.partHeights?.[i]?.base??feature.minY,wallTop:feature.partHeights?.[i]?.wallTop??feature.maxY-.2}));
  const actualSigns=renderedSignsBySourceId?.get?.(feature.sourceId);
  const remaining=rows.filter(row=>{
   const name=normalized(row.name);
   const supplied=Array.isArray(actualSigns)&&actualSigns.find(sign=>sign?.sourceId===feature.sourceId&&typeof sign.text==='string'&&sign.text.trim()
    &&sameRenderedFrontage(row,sign,project)&&name&&[sign.name,sign.text].some(text=>normalized(text)===name));
   if(supplied){existing++;samples.push({id:row.id,name:row.name,buildingSourceId:feature.sourceId,frontageIndex:supplied.frontageIndex,existingProfileSign:true});return false;}
   return true;
  });
  const profile=profiles[feature.sourceId];
  const openingTop=businessOpeningTop(feature.properties||{},Math.min(...polygons.map(p=>p.wallTop-p.base)),profile);
  const adjusted=remaining.map(row=>({...row,openingTopMetres:Math.max(row.openingTopMetres||0,openingTop),...(profile?{outsetMetres:row.outsetMetres??.34}:{})}));
  const result=planBusinessWallSigns({building:{sourceId:feature.sourceId,polygons},businesses:adjusted,project});rejected.push(...result.rejected);if(!result.signs.length)continue;
  const root=new THREE.Group(),lod=new THREE.Group();root.name='BusinessNames-'+feature.sourceId;root.userData={type:'business-name-signs',sourceId:feature.sourceId,collision:false};lod.name='business-sign-distance-lod';root.add(lod);parent.add(root);const batches=new Map();
  for(const originalSign of result.signs){const constrained=constrainBusinessSignToReviewedBays({sign:originalSign,profile,polygons,project});if(constrained.rejected){rejected.push(constrained.rejected);continue;}const sign=constrained.sign;const tile=atlas.add(sign);if(tile.error){rejected.push({id:sign.id,buildingSourceId:sign.buildingSourceId,reason:tile.error});continue;}if(!batches.has(tile.index))batches.set(tile.index,{positions:[],uvs:[],indices:[],material:tile.page.material});const batch=batches.get(tile.index),baseIndex=batch.positions.length/3,{center:c,rightVector:r,width:w,height:h}=sign,[u0,v0,u1,v1]=tile.uv;
   for(const [side,vertical]of [[-1,-1],[1,-1],[1,1],[-1,1]])batch.positions.push(c.x+r.x*w*.5*side,c.y+h*.5*vertical,c.z+r.z*w*.5*side);
   batch.uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);batch.indices.push(baseIndex,baseIndex+1,baseIndex+2,baseIndex,baseIndex+2,baseIndex+3);
   samples.push({id:sign.id,name:sign.name,buildingSourceId:sign.buildingSourceId,placementMode:sign.placementMode,sourceKind:sign.source.sourceKind,geocodeMethod:sign.source.geocodeMethod,center:sign.center,normal:sign.normal,width:sign.width,height:sign.height,belowRoof:true,placementEvidence:sign.placementEvidence,members:sign.members,entrance:sign.source.entrance});
  }
  for(const batch of batches.values()){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));geometry.setIndex(batch.indices);geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,batch.material);mesh.name='business-sign-atlas';mesh.userData={type:'business-name-sign',collision:false};lod.add(mesh);meshes++}
  generatedRegistry.attachEditableGroup(feature.generatedId,root);const bounds=new THREE.Box3().setFromObject(lod),center=bounds.getCenter(new THREE.Vector3());roots.push({root,lod,center});
 }
 for(const [sourceId,rows]of byBuilding)if(!seenSources.has(sourceId))for(const row of rows)rejected.push({id:row.id,buildingSourceId:sourceId,reason:'building-not-rendered'});
 atlas.finish();const radius=lowPower?110:180;
 return{
  update(camera,force=false,mode='street'){const p={x:camera.position.x,z:camera.position.z};if(!force&&lastMode===mode&&!signVisibilityChanged(last,p))return;last=p;lastMode=mode;for(const item of roots)item.lod.visible=mode!=='map'&&Math.hypot(p.x-item.center.x,p.z-item.center.z)<radius},
  stats(){return{catalogueGeneratedAt:directory.generatedAt||null,catalogueBusinesses:directory.coverage?.uniqueBusinesses??directory.businesses?.length??0,renderedNames:samples.reduce((n,s)=>n+(s.members?.length||1),0),storefrontNames:samples.filter(s=>s.placementMode!=='shared-entrance-directory').length,directoryNames:samples.filter(s=>s.placementMode==='shared-entrance-directory').reduce((n,s)=>n+(s.members?.length||0),0),directoryPanels:samples.filter(s=>s.placementMode==='shared-entrance-directory').length,existingProfileSigns:existing,newSignPanels:samples.length-existing,buildings:roots.length,atlasPages:atlas.pages.length,atlasBytes:atlas.pages.length*1024*1024*4,meshes,visibleBuildings:roots.filter(r=>r.root.visible&&r.lod.visible).length,rejected:rejected.length}},
  samples:()=>samples,rejected:()=>rejected,
  dispose(){for(const item of roots){item.lod.traverse(o=>o.geometry?.dispose());item.root.removeFromParent()}roots.length=0;meshes=0;atlas.dispose()},
 };
}
