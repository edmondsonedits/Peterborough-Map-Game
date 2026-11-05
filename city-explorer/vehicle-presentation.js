let contactTexture;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const damp=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*dt));

export function steeringForWheel(steering, lateral, wheelbase) {
  if(Math.abs(steering)<.0001)return 0;
  const radius=wheelbase/Math.tan(steering);
  return Math.atan(wheelbase/(radius+lateral));
}

export function configureVehiclePresentation(THREE, entry, environment) {
  const actor=entry.actor, truck=actor.userData.truck;
  if(truck.presentation || !truck.visual || truck.assetStatus!=='blender-ready')return;
  const materials=new Map();
  truck.visual.traverse(node=>{
    if(!node.isMesh)return;
    const prepare=source=>{
      if(materials.has(source))return materials.get(source);
      const material=source.clone(), name=material.name.toLowerCase();
      if(environment && material.isMeshStandardMaterial){
        material.envMap=environment;
        material.envMapIntensity=/glass|glaz|chrome|polish/.test(name)?1:.55;
      }
      if(/glass|glaz/.test(name)){material.color.lerp(new THREE.Color('#456a7c'),.28);material.roughness=.18;}
      if(/rescue red|pickup red/.test(name)){material.roughness=.27;material.metalness=.3;}
      materials.set(source,material);return material;
    };
    node.material=Array.isArray(node.material)?node.material.map(prepare):prepare(node.material);
  });
  actor.updateWorldMatrix(true,true);
  const wheelData=truck.wheels.map(({pivot,spin})=>{
    if(!pivot||!spin)return null;
    actor.attach(pivot);
    const rest=pivot.position.clone();
    return {pivot,spin,rest,ground:new THREE.Vector3(),front:truck.frontWheels.includes(pivot)};
  }).filter(Boolean);
  const front=wheelData.filter(w=>w.front), rear=wheelData.filter(w=>!w.front);
  if(front.length && rear.length){
    const mean=(w,key)=>w.reduce((sum,v)=>sum+v.rest[key],0)/w.length;
    entry.definition={...entry.definition,tuning:{...entry.definition.tuning,
      frontAxleZ:mean(front,'z'),rearAxleZ:mean(rear,'z'),
      trackWidth:Math.abs(front[0].rest.x-front[1].rest.x)}};
  }
  const lamps={};
  for(const kind of ['Headlamp','BrakeLamp','ReverseLamp']){
    lamps[kind]=[];
    for(const side of ['L','R'])actor.getObjectByName(kind+'_'+side)?.traverse(node=>{
      if(node.isMesh){node.material=node.material.clone();node.material.emissive.copy(node.material.color);lamps[kind].push(node);}
    });
  }
  if(entry.definition.type==='pumper' && typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const context=canvas.getContext('2d');
    context.fillStyle='#f2db8c';context.font='bold 82px Arial';context.textAlign='center';context.textBaseline='middle';
    context.fillText(entry.definition.name.toUpperCase(),256,66);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.55,metalness:.2});
    for(const side of [-1,1]){
      const label=new THREE.Mesh(new THREE.PlaneGeometry(.9,.17),material);
      label.name='Unit_'+entry.definition.id;label.position.set(side*1.263,1.43,-1.66);label.rotation.y=side*Math.PI/2;
      truck.visual.add(label);
    }
  }
  let contactShadow=null;
  if(typeof document!=='undefined'){
    if(!contactTexture){
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const context=canvas.getContext('2d'),gradient=context.createRadialGradient(64,64,12,64,64,64);
      gradient.addColorStop(0,'rgba(0,0,0,0.38)');gradient.addColorStop(.58,'rgba(0,0,0,0.22)');gradient.addColorStop(1,'rgba(0,0,0,0)');
      context.fillStyle=gradient;context.fillRect(0,0,128,128);
      contactTexture=new THREE.CanvasTexture(canvas);
    }
    const size=entry.definition.tuning;
    contactShadow=new THREE.Mesh(new THREE.PlaneGeometry(size.width*1.2,size.length),new THREE.MeshBasicMaterial({map:contactTexture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1}));
    contactShadow.name='Vehicle contact shadow';contactShadow.rotation.x=-Math.PI/2;contactShadow.position.y=-.02;
    actor.add(contactShadow);
  }
  truck.presentation={wheelData,lamps,pitch:0,roll:0,contactShadow,shadowGround:entry.state.y-.035};
}

export function updateVehiclePresentation(entry, {delta,time,surface,driving=false,locked=false}) {
  const truck=entry.actor.userData.truck, pose=entry.state, presentation=truck.presentation;
  if(!presentation){
    for(const {wheel,hub,spin} of truck.wheels){
      if(spin)spin.rotation.x=-(pose.wheelRotation||0);
      else {wheel.rotation.set(pose.wheelRotation||0,0,Math.PI/2);hub.rotation.copy(wheel.rotation);}
    }
    truck.frontWheels.forEach(pivot=>{pivot.rotation.y=pose.steering||0;});
    if(!truck.fallbackLampsReady){truck.beacons.forEach(lamp=>{lamp.material=lamp.material.clone();});truck.fallbackLampsReady=true;}
    updateWarningLamps(truck,pose,time);
    return;
  }
  const tuning=entry.definition.tuning, dt=Math.min(.1,Math.max(0,delta));
  const lateral=pose.speed*pose.speed*Math.tan(pose.steering)/tuning.wheelbase;
  const pitch=driving&&!locked?clamp(pose.acceleration*.006,-.045,.05):0;
  const roll=driving&&!locked?clamp(-lateral*.009,-.065,.065):0;
  presentation.pitch=locked||(entry.aerial&&!driving)?0:damp(presentation.pitch,pitch,7,dt);
  presentation.roll=locked||(entry.aerial&&!driving)?0:damp(presentation.roll,roll,7,dt);
  truck.visual.rotation.x=presentation.pitch;truck.visual.rotation.z=presentation.roll;
  if(presentation.contactShadow){
    if(surface)presentation.shadowGround=surface(pose.x,pose.z,pose.y).height;
    presentation.contactShadow.position.y=presentation.shadowGround-(pose.y+(entry.aerial?.lift||0)*(entry.aerial?.liftHeight||.14))+.018;
  }
  entry.actor.updateWorldMatrix(true,false);
  for(const wheel of presentation.wheelData){
    wheel.pivot.rotation.y=wheel.front?steeringForWheel(pose.steering,wheel.rest.x,tuning.wheelbase):0;
    wheel.spin.rotation.x=-(pose.wheelRotation||0);
    let target=wheel.rest.y;
    if(surface&&!locked){
      wheel.ground.copy(wheel.rest);entry.actor.localToWorld(wheel.ground);
      const hit=surface(wheel.ground.x,wheel.ground.z,pose.y);
      wheel.ground.y=hit.height+(truck.metadata?.wheelRadius??.56);
      entry.actor.worldToLocal(wheel.ground);
      target=clamp(wheel.ground.y,wheel.rest.y-.24,wheel.rest.y+.24);
    }
    wheel.pivot.position.y=damp(wheel.pivot.position.y,target,24,dt);
  }
  updateWarningLamps(truck,pose,time);
  const emergency=Boolean(pose.emergencyLights);
  const brake=driving&&(pose.braking||Math.abs(pose.speed)<.08);
  for(const lamp of presentation.lamps.Headlamp)lamp.material.emissiveIntensity=driving?1.5:.06;
  for(const lamp of presentation.lamps.BrakeLamp)lamp.material.emissiveIntensity=brake?2.8:driving?.35:.03;
  for(const lamp of presentation.lamps.ReverseLamp)lamp.material.emissiveIntensity=driving&&pose.speed<-.05?2:.02;
  truck.presentation.diagnostics={brake:Boolean(brake),reverse:driving&&pose.speed<-.05,emergency,bodyPitch:presentation.pitch,bodyRoll:presentation.roll,beacons:truck.beacons.map(b=>b.material.emissiveIntensity),headlamps:presentation.lamps.Headlamp.map(l=>l.material.emissiveIntensity),brakeLamps:presentation.lamps.BrakeLamp.map(l=>l.material.emissiveIntensity),reverseLamps:presentation.lamps.ReverseLamp.map(l=>l.material.emissiveIntensity)};
}

function updateWarningLamps(truck,pose,time){
  const emergency=Boolean(pose.emergencyLights);
  const phase=(time%900)/900;
  truck.beacons.forEach((beacon,index)=>{
    const alternate=index%2===0?phase:(phase+.5)%1;
    const lit=emergency&&(alternate<.1||(alternate>.17&&alternate<.27));
    beacon.visible=true;
    beacon.material.emissiveIntensity=lit?3.5:0;
  });
}
