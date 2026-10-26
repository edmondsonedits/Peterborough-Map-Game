/** Presentation-only controls. No GIS, physics or source-profile mutation. */
export const CITY_DAYLIGHT = Object.freeze({sky:0xe8eff6,ground:0x77716a,ambientIntensity:1.65,sun:0xfff2df,sunIntensity:2.65});
export function visualSettings(search='',lowPower=false){
 const requested=new URLSearchParams(search).get('visuals');
 return Object.freeze({mode:requested==='legacy'?'legacy':'improved',quality:lowPower||requested==='lite'?'lite':'full'});
}
export function cityShadowSettings(mode,heightAboveGround){
 const altitude=Number.isFinite(heightAboveGround)?Math.max(0,heightAboveGround):30;
 const close=mode!=='map'&&(mode==='driving'||mode==='onFoot'||altitude<65);
 // The old 2.9 km shadow span spent >1m per texel on street-height views.
 return {extent:close?140:Math.min(1450,Math.max(240,altitude*3)),normalBias:close?.08:.22,bias:-.00018};
}
export function glazingIntensity(theme){return theme==='night'?.015:theme==='dusk'?.09:.22;}
/** One procedural, non-photographic sky reflection shared by every glass material. */
export function createCityGlazingEnvironment(THREE,renderer,quality='full'){
 if(quality==='lite'||typeof document==='undefined')return null;
 const size=64,faces=[];
 for(let face=0;face<6;face++){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  if(face===2||face===3){ctx.fillStyle=face===2?'#91b2cd':'#777571';ctx.fillRect(0,0,size,size);}
  else {const g=ctx.createLinearGradient(0,0,0,size);g.addColorStop(0,'#91b2cd');g.addColorStop(.48,'#c2d1d9');g.addColorStop(.53,'#777b79');g.addColorStop(1,'#666760');ctx.fillStyle=g;ctx.fillRect(0,0,size,size);}
  faces.push(canvas);
 }
 const cube=new THREE.CubeTexture(faces);cube.colorSpace=THREE.SRGBColorSpace;cube.needsUpdate=true;
 const pmrem=new THREE.PMREMGenerator(renderer);let target;
 try{target=pmrem.fromCubemap(cube);}finally{cube.dispose();pmrem.dispose();}
 const img=target.texture.image||{};
 target.texture.name='city-procedural-sky-reflection';
 return {texture:target.texture,sourceBytes:size*size*4*6,estimatedGpuBytes:(img.width||192)*(img.height||256)*8,dispose:()=>target.dispose()};
}
