const STORAGE_KEY='ptbo-city-editor-views-v1';
const plain=value=>JSON.parse(JSON.stringify(value));
const finiteArray=(value,length)=>Array.isArray(value)&&value.length===length&&value.every(Number.isFinite);
function validView(view){return view&&finiteArray(view.position,3)&&finiteArray(view.quaternion,4)&&finiteArray(view.up,3)&&finiteArray(view.target,3)&&Number.isFinite(view.fov)&&view.fov>=10&&view.fov<=100&&Number.isFinite(view.zoom)&&view.zoom>0&&view.zoom<=100;}

export function createAIEditorCamera({THREE,camera,navigation,project,heightAt,storage}){
  let views={};
  try {const saved=JSON.parse(storage?.getItem(STORAGE_KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved)) views=Object.fromEntries(Object.entries(saved).filter(([name,view])=>name.length<=80&&validView(view)).slice(0,20));}catch{}
  const inspect=()=>({position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),fov:camera.fov,zoom:camera.zoom,target:navigation().target.toArray()});
  function persist(){try{if(!storage)throw Error('Storage unavailable');storage.setItem(STORAGE_KEY,JSON.stringify(views));return true;}catch{return false;}}
  function nameOf(command){if(typeof command.name!=='string'||!command.name.trim()||command.name.trim().length>80)throw Error('View name must contain 1–80 characters.');return command.name.trim();}
  function apply(view){
    if(!validView(view))throw Error('Invalid camera view.');
    camera.position.fromArray(view.position);camera.quaternion.fromArray(view.quaternion);camera.up.fromArray(view.up);camera.fov=view.fov;camera.zoom=view.zoom;
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);navigation().reset(new THREE.Vector3().fromArray(view.target));
    return inspect();
  }
  function focus(object, featureBounds = null){
    if(!object)throw Error('Feature has no scene object.');
    object.updateWorldMatrix(true,true);
    const box=featureBounds || new THREE.Box3().setFromObject(object);
    if(box.isEmpty())throw Error('Feature has no visible bounds.');
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    const direction=camera.position.clone().sub(center);if(direction.lengthSq()<1)direction.set(1,0.65,1);direction.normalize();
    const fov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));
    const distance=Math.max(12,size.length()/2/Math.sin(fov/2)*1.25);
    camera.position.copy(center).addScaledVector(direction,distance);camera.up.set(0,1,0);camera.lookAt(center);camera.updateMatrixWorld(true);navigation().reset(center);
    return inspect();
  }
  function run(command){
    if(command.op==='view.list')return Object.keys(views).sort().map(name=>({name,view:plain(views[name])}));
    if(command.op==='view.save'){
      const name=nameOf(command);if(!Object.hasOwn(views,name)&&Object.keys(views).length>=20)throw Error('Maximum 20 saved views. Delete one first.');
      views=Object.fromEntries([...Object.entries(views).filter(([key])=>key!==name),[name,inspect()]]);
      return {name,persisted:persist(),view:plain(views[name])};
    }
    if(command.op==='view.restore'){const name=nameOf(command);if(!Object.hasOwn(views,name))throw Error('Unknown saved view.');return apply(views[name]);}
    if(command.op==='view.delete'){const name=nameOf(command);if(!Object.hasOwn(views,name))throw Error('Unknown saved view.');delete views[name];return {name,persisted:persist()};}
    if(command.op==='camera'){
      const {latitude,longitude,altitude=20,distance=50,bearing=145}=command;
      if(![latitude,longitude,altitude,distance,bearing].every(Number.isFinite)||latitude<44.15||latitude>44.5||longitude< -78.55||longitude> -78.05||altitude<1||altitude>10000||distance<1||distance>12000)throw Error('Camera requires a Peterborough latitude/longitude, altitude 1–10000 m, distance 1–12000 m and bearing in degrees.');
      const point=project(latitude,longitude),ground=heightAt(point.x,point.y),angle=bearing*Math.PI/180;
      const target=new THREE.Vector3(point.x,ground,point.y);
      camera.position.set(point.x+Math.sin(angle)*distance,ground+altitude,point.y-Math.cos(angle)*distance);camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld(true);navigation().reset(target);return inspect();
    }
    throw Error('Unknown camera command.');
  }
  return {inspect,run,focus};
}
