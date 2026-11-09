export const CAMERA_VIEWS = Object.freeze(['auto','close','standard','wide','cab','bonnet']);
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const wrapAngle=value=>((value+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;

/** Pure cab/bonnet camera pose in world coordinates (+Y up, vehicle origin at its center). */
export function vehicleCameraPose(state={},tuning={},view='cab',{yawOffset=0,pitch=0}={}) {
 const heading=finite(state.heading),length=Math.max(2,finite(tuning.length,10.4)),height=Math.max(1.8,finite(tuning.height,3.25));
 const mode=view==='bonnet'?'bonnet':'cab';
 const forward=mode==='bonnet'?Math.max(.8,length/2-.6):Math.min(length*.27,Math.max(.65,length/2-.55));
 const eyeHeight=mode==='bonnet'?Math.min(1.55,height*.57):Math.min(2.5,Math.max(1.75,height*.68));
 const position={x:finite(state.x)-Math.sin(heading)*forward,y:finite(state.y)+eyeHeight,z:finite(state.z)-Math.cos(heading)*forward};
 const yaw=wrapAngle(heading+clamp(finite(yawOffset),-Math.PI*.42,Math.PI*.42));
 const lookPitch=clamp(finite(pitch),-.55,.55),lookDistance=42;
 const horizontal=Math.cos(lookPitch)*lookDistance;
 return {position,target:{x:position.x-Math.sin(yaw)*horizontal,y:position.y+Math.sin(lookPitch)*lookDistance,z:position.z-Math.cos(yaw)*horizontal},heading:yaw};
}

// Keep the closer view until the rear of the vehicle clears, then blend over 8 m.
export function cameraBayInfluence(point,bounds,clearance=0) {
 if(!point||!bounds)return 0;
 const dx=Math.max(bounds.minX-clearance-point.x,0,point.x-bounds.maxX-clearance);
 const dz=Math.max(bounds.minZ-clearance-point.z,0,point.z-bounds.maxZ-clearance);
 const t=clamp(Math.hypot(dx,dz)/8,0,1);
 return 1-t*t*(3-2*t);
}

export function cameraFraming(view='auto',bayInfluence=0) {
 const inside=clamp(Number(bayInfluence)||0,0,1);
 const scale=({close:.82,standard:1,wide:1.38})[view]??(inside===1?.82:1-.18*inside);
 return {scale,driveHeight:inside===1?.85:3.4+( .85-3.4)*inside};
}

export function clampBayCamera(target,camera,bounds,margin=.65) {
 const minX=Math.min(bounds.minX+margin,(bounds.minX+bounds.maxX)/2);
 const maxX=Math.max(bounds.maxX-margin,minX);
 const minZ=Math.min(bounds.minZ+margin,(bounds.minZ+bounds.maxZ)/2);
 const maxZ=Math.max(bounds.maxZ-margin,minZ);
 const start={x:clamp(target.x,minX,maxX),z:clamp(target.z,minZ,maxZ)};
 const dx=camera.x-start.x,dz=camera.z-start.z;
 let fraction=1;
 if(dx>0)fraction=Math.min(fraction,(maxX-start.x)/dx);
 if(dx<0)fraction=Math.min(fraction,(minX-start.x)/dx);
 if(dz>0)fraction=Math.min(fraction,(maxZ-start.z)/dz);
 if(dz<0)fraction=Math.min(fraction,(minZ-start.z)/dz);
 return {x:start.x+dx*fraction,z:start.z+dz*fraction};
}

export function installCameraViewControl({document,storage,onChange=()=>{}}) {
 let view='auto';
 try{const saved=storage?.getItem('ptbo.cameraView');if(CAMERA_VIEWS.includes(saved))view=saved;}catch{}
 const select=document.getElementById('camera-view-select');
 function setView(next){
  if(!CAMERA_VIEWS.includes(next))return false;
  view=next;if(select)select.value=view;
  try{storage?.setItem('ptbo.cameraView',view);}catch{}
  onChange(view);return true;
 }
 if(select){select.value=view;select.addEventListener('change',()=>setView(select.value));}
 return {get view(){return view;},setView};
}
