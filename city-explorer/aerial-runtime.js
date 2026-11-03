import {stepAerial,aerialTravelReady,AERIAL_LIMITS} from './aerial-controller.mjs';
import {segmentBoxHit,vehicleFootprint} from './apparatus-collision.mjs';

const keys={KeyW:['raise',1],KeyS:['raise',-1],KeyA:['rotate',1],KeyD:['rotate',-1],KeyE:['extend',1],KeyQ:['extend',-1],ArrowLeft:['nozzleYaw',1],ArrowRight:['nozzleYaw',-1],ArrowUp:['nozzlePitch',1],ArrowDown:['nozzlePitch',-1],Space:['flow',true]};
const ends=['FL','FR','RL','RR'];
export function applyAerialPose(THREE,entry,s){
  const rig=entry.actor.userData.truck.rig;if(!rig?.TurntableYaw)return;
  rig.TurntableYaw.rotation.y=s.yaw;
  rig.LadderPitch.rotation.x=s.pitch;
  for(const index of [2,3]){const n=rig[`LadderSection_${index}`];n.position.z=n.userData.fleetRest.position.z-s.extension;}
  rig.KnuckleFold.rotation.x=s.fold*Math.PI;
  rig.BasketLevel.rotation.x=-(s.pitch+s.fold*Math.PI+(entry.state.pitch||0));
  rig.BasketLevel.rotation.z=-(entry.state.roll||0);
  rig.BasketFold.rotation.x=s.basketFold*Math.PI/2;
  rig.MonitorYaw.rotation.y=s.nozzleYaw;
  rig.MonitorPitch.rotation.x=s.nozzlePitch;
  rig.BasketLevel.parent.updateWorldMatrix(true,false);
  const parentRotation=rig.BasketLevel.parent.getWorldQuaternion(new THREE.Quaternion());
  const levelRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(entry.state.heading||0)+s.yaw);
  rig.BasketLevel.quaternion.copy(parentRotation.invert().multiply(levelRotation));
  for(let i=0;i<4;i++){
    const beam=rig[`Outrigger_${ends[i]}`],jack=rig[`Jack_${ends[i]}`],sign=i%2===0?-1:1;
    beam.position.x=beam.userData.fleetRest.position.x+sign*s.beams*1.6;
    beam.updateWorldMatrix(true,false);
    const rest=jack.userData.fleetRest.position;
    const restCenter=beam.localToWorld(rest.clone());
    const up=new THREE.Vector3(0,1,0).transformDirection(beam.matrixWorld);
    const ground=entry.state.y+(s.feet[i]||0);
    const stroke=Math.max(0,Math.min(AERIAL_LIMITS.jackStroke,(restCenter.y-ground-.06)/Math.max(.5,up.y)));
    jack.position.y=rest.y-s.jacks*stroke;
    const piston=jack.children.find(n=>n.isMesh&&n.name.startsWith('Hydraulic_ram'))||jack.children.find(n=>n.isMesh&&n.name.startsWith('Hydraulic ram'));
    if(piston){
      if(!piston.userData.fleetCylinder){piston.geometry.dispose();piston.geometry=new THREE.CylinderGeometry(.085,.085,1,12);piston.userData.fleetCylinder=true;}
      // A telescoping piston reaches from the fixed beam housing to its moving foot.
      const top=rest.y-jack.position.y+.28;
      piston.position.set(0,top/2,0);piston.rotation.set(0,0,0);piston.scale.set(1,Math.max(.1,top),1);
    }
  }
  entry.actor.updateMatrixWorld(true);
  for(const side of ['L','R']){
    const base=rig[`Cylinder_Base_${side}`],tip=rig[`Cylinder_Tip_${side}`],ram=rig[`ElevationRam_${side}`];
    if(!base||!tip||!ram?.isMesh)continue;
    if(!ram.userData.fleetCylinder){ram.geometry.dispose();ram.geometry=new THREE.CylinderGeometry(.1,.1,1,12);ram.userData.fleetCylinder=true;}
    const a=ram.parent.worldToLocal(base.getWorldPosition(new THREE.Vector3())),b=ram.parent.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
    const d=b.clone().sub(a);ram.position.copy(a).add(b).multiplyScalar(.5);ram.scale.set(1,d.length(),1);ram.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());ram.updateMatrixWorld(true);
  }
}

export function createAerialRuntime({THREE,scene,fleet,gameState,canvas,surface,ready,inBay,isWater,obstacles,toast}){
  const entry=fleet.fleet.vehicles.find(v=>v.aerial),s=entry.aerial;
  const input={},held=new Map();let mode=false,pending={},boxes=[],boxTime=-Infinity,lastBlocked=null,nozzleView=false;
  const point=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
  const group=new THREE.Group();group.name='Aerial_Water';scene.add(group);
  const points=new Float32Array(65*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const stream=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xc9f4ff,transparent:true,opacity:.85}));stream.frustumCulled=false;group.add(stream);
  const jet=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.07,1,6),new THREE.MeshBasicMaterial({color:0xc8f1ff,transparent:true,opacity:.7,depthWrite:false}),64);
  jet.frustumCulled=false;jet.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(jet);const jetPart=new THREE.Object3D();
  const impact=new THREE.Mesh(new THREE.SphereGeometry(.22,10,6),new THREE.MeshBasicMaterial({color:0xe5faff,transparent:true,opacity:.5}));impact.scale.set(1,.4,1);group.add(impact);group.visible=false;

  const panel=document.createElement('details');panel.id='aerial-controls';panel.hidden=true;panel.open=false;
  panel.innerHTML='<summary>Aerial</summary><div class="aerial-actions"><button type="button" data-action="mode">Operate</button><button type="button" data-action="deploy">Stabilize</button><button type="button" data-action="stow">Stow</button><button type="button" data-action="stop">Stop</button><button type="button" data-action="refill">Refill</button><button type="button" data-action="view">Nozzle view</button></div><output aria-live="polite"></output><div class="aerial-holds"></div><small>W/S raise · A/D rotate · Q/E telescope · arrows aim · Space water</small>';
  const controls=panel.querySelector('.aerial-holds');
  for(const [label,axis,value] of [['Raise','raise',1],['Lower','raise',-1],['Rotate left','rotate',1],['Rotate right','rotate',-1],['Extend','extend',1],['Retract','extend',-1],['Aim left','nozzleYaw',1],['Aim right','nozzleYaw',-1],['Aim up','nozzlePitch',1],['Aim down','nozzlePitch',-1],['Water','flow',true]]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.axis=axis;controls.append(b);
    b.onpointerdown=e=>{e.preventDefault();if(Math.abs(entry.state.speed)>.1){toast('Stop before operating the aerial');return;}if(!mode)mode=true;b.setPointerCapture(e.pointerId);held.set(b,[axis,value]);b.classList.add('is-held');rebuild();};
    const release=()=>{held.delete(b);b.classList.remove('is-held');rebuild();};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
  }
  const output=panel.querySelector('output');
  document.getElementById('app').append(panel);
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./fleet.css',import.meta.url).href;document.head.append(css);
  function rebuild(){for(const k of Object.keys(input))delete input[k];for(const [axis,v] of held.values())input[axis]=v;}
  function clearInput(){held.clear();rebuild();pending={};s.flow=false;group.visible=false;panel.querySelectorAll('.is-held').forEach(n=>n.classList.remove('is-held'));}
  function action(value){
    if(!active())return;
    panel.open=true;
    if(value.view){nozzleView=!nozzleView;return;}
    if(Math.abs(entry.state.speed)>.1&&(value.mode||value.deploy)){toast('Stop before operating the aerial');return;}
    if(value.mode){mode=!mode;clearInput();}else{mode=true;pending={...pending,...value};if(value.stop){clearInput();pending={stop:true};}}
    canvas.focus({preventScroll:true});
  }
  panel.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>action({[b.dataset.action]:true}));
  window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
  window.addEventListener('ptbo:vehicle-selected',()=>{clearInput();mode=false;});
  panel.addEventListener('toggle',()=>{if(!panel.open){clearInput();mode=false;if(s.phase!=='travel')s.stopped=true;}});
  function active(){return fleet.fleet.active===entry&&gameState.mode==='driving';}
  function refreshBoxes(force=false){if(force||performance.now()-boxTime>2000){boxes=obstacles(entry.state);boxTime=performance.now();}}
  function solidBoxes(){
    const result=[...boxes];
    for(const other of fleet.fleet.vehicles)if(other!==entry){const corners=vehicleFootprint(other.state,other.definition.tuning);result.push({min:{x:Math.min(...corners.map(p=>p.x)),y:other.state.y,z:Math.min(...corners.map(p=>p.z))},max:{x:Math.max(...corners.map(p=>p.x)),y:other.state.y+other.definition.tuning.height,z:Math.max(...corners.map(p=>p.z))}});}
    return result;
  }
  function rigSegments(){
    const rig=entry.actor.userData.truck.rig,result=[];
    for(let i=1;i<=4;i++){const node=rig[`LadderSection_${i}`];point.set(0,0,0);node.localToWorld(point);end.set(0,0,i===4?-3.2:-5.6);node.localToWorld(end);result.push([point.clone(),end.clone(),.27]);}
    const basket=rig.Basket;point.set(0,.5,0);basket.localToWorld(point);end.copy(point);end.y+=.25;result.push([point.clone(),end.clone(),.8]);
    return result;
  }
  function poseClear(pose,solids){
    applyAerialPose(THREE,entry,pose);
    const segments=rigSegments();
    for(const [a,b,radius] of segments){
      const solid=solids.find(box=>segmentBoxHit(a,b,box,radius)!==null);
      if(solid){lastBlocked={kind:'solid',a:a.toArray(),b:b.toArray(),box:{min:solid.min,max:solid.max}};return false;}
      const count=Math.max(1,Math.ceil(a.distanceTo(b)/.5));
      for(let i=0;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
        if(!ready(x,z)||surface(x,z).height+radius>y){lastBlocked={kind:'ground-or-streaming',x,y,z,ground:surface(x,z).height};return false;}
        // Conservative cab clearance; all parts of every section are sampled.
        const p=entry.actor.worldToLocal(new THREE.Vector3(x,y,z));
        const halfHeight=radius>.5?radius:.1;
        if(Math.abs(p.x)<1.35+radius&&p.z<-.95&&p.z>-5.8&&p.y<3.2+halfHeight){lastBlocked={kind:'cab',local:p.toArray()};return false;}
      }
    }
    return true;
  }
  function motion(a,b){
    const rig=entry.actor.userData.truck.rig;if(!rig?.TurntableYaw)return false;
    if(a.pitch===b.pitch&&a.yaw===b.yaw&&a.fold===b.fold&&a.basketFold===b.basketFold&&a.extension===b.extension)return true;
    refreshBoxes();const solids=solidBoxes();
    const steps=Math.max(1,Math.ceil((Math.abs(a.pitch-b.pitch)*25+Math.abs(a.yaw-b.yaw)*25+Math.abs(a.fold-b.fold)*Math.PI*4+Math.abs(a.basketFold-b.basketFold)*2+Math.abs(a.extension-b.extension)*2)/.12));
    let ok=true;
    for(let i=1;i<=steps;i++){const t=i/steps,pose={...a};for(const k of ['pitch','yaw','fold','basketFold','extension'])pose[k]=a[k]+(b[k]-a[k])*t;if(!poseClear(pose,solids)){ok=false;break;}}
    applyAerialPose(THREE,entry,a);return ok;
  }
  function setup(){
    if(entry.actor.userData.truck.assetStatus!=='blender-ready')return {ok:false,reason:'Aerial model is not ready'};
    if(inBay(entry.state))return {ok:false,reason:'Drive clear of the bay before stabilizing'};
    refreshBoxes(true);
    const positions=ends.map((_,i)=>new THREE.Vector3(i%2===0?-2.75:2.75,0,i<2?-3.75:3.45));
    const feet=[],heights=[];
    for(const [i,p] of positions.entries()){entry.actor.localToWorld(p);if(!ready(p.x,p.z)||isWater(p.x,p.z))return {ok:false,reason:'Supported dry ground required'};
      const height=surface(p.x,p.z).height;heights.push(height);feet.push(height-entry.state.y);
      if(Math.abs(height-entry.state.y)>.42)return {ok:false,reason:'Ground exceeds stabilizer travel'};
      const beam=entry.actor.userData.truck.rig[`Outrigger_${ends[i]}`],jack=entry.actor.userData.truck.rig[`Jack_${ends[i]}`];
      const deployedRest=jack.userData.fleetRest.position.clone();
      deployedRest.x+=(i%2===0?-1:1)*1.6*(1-s.beams);
      const restCenter=beam.localToWorld(deployedRest);
      const up=new THREE.Vector3(0,1,0).transformDirection(beam.matrixWorld);
      const requiredStroke=(restCenter.y-height-.06)/Math.max(.5,up.y);
      if(requiredStroke<-.01||requiredStroke>AERIAL_LIMITS.jackStroke)return {ok:false,reason:'Ground exceeds stabilizer travel'};
      if(solidBoxes().some(box=>segmentBoxHit({...p,y:height+.1},{...p,y:entry.state.y+1.7},box,.4)!==null))return {ok:false,reason:'Stabilizer space is blocked'};
      const center=new THREE.Vector3(0,1,i<2?-3.75:3.45);entry.actor.localToWorld(center);
      if(solidBoxes().some(box=>segmentBoxHit(center,{x:p.x,y:entry.state.y+1,z:p.z},box,.25)!==null))return {ok:false,reason:'Stabilizer space is blocked'};
    }
    if(Math.max(...heights)-Math.min(...heights)>Math.tan(5*Math.PI/180)*5.5)return {ok:false,reason:'Ground is too steep'};
    // Validate the complete unfold path before deploying; no partly trapped platform.
    const start={...s};let valid=true;
    for(let i=1;i<=20;i++){const t=i/20,pose={...s,pitch:.4*t,fold:1};if(!poseClear(pose,solidBoxes())){valid=false;break;}}
    applyAerialPose(THREE,entry,start);
    if(!valid)return {ok:false,reason:'Overhead space is blocked'};
    return {ok:true,feet};
  }
  function updateWater(){
    group.visible=s.flow;if(!s.flow)return;
    const rig=entry.actor.userData.truck.rig;rig.NozzleOutlet.getWorldPosition(point);
    direction.set(0,0,-1).transformDirection(rig.NozzleOutlet.matrixWorld);
    const solids=solidBoxes();let previous=point.clone(),last=point.clone(),used=1,hit=false;
    points.set([point.x,point.y,point.z]);
    for(let i=1;i<=64;i++){
      const t=i*.045,next=point.clone().addScaledVector(direction,27*t);next.y-=4.9*t*t;
      let nearest=1;
      for(const box of solids){const h=segmentBoxHit(previous,next,box);if(h!==null)nearest=Math.min(nearest,h);}
      // Stop on the emitting truck too, e.g. aiming vertically down through its body.
      const localA=entry.actor.worldToLocal(previous.clone()),localB=entry.actor.worldToLocal(next.clone());
      const bodyHit=segmentBoxHit(localA,localB,{min:{x:-1.3,y:0,z:-5.8},max:{x:1.3,y:2.5,z:5.8}});if(bodyHit!==null)nearest=Math.min(nearest,bodyHit);
      let groundHit=null;
      for(let j=1;j<=4;j++){const f=j/4,q=previous.clone().lerp(next,f);if(surface(q.x,q.z).height>=q.y){groundHit=f;break;}}
      if(groundHit!==null)nearest=Math.min(nearest,groundHit);
      if(nearest<1||groundHit!==null){next.copy(previous).lerp(next,nearest);hit=true;}
      const span=next.clone().sub(previous);jetPart.position.copy(previous).add(next).multiplyScalar(.5);jetPart.scale.set(1,Math.max(.001,span.length()),1);jetPart.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),span.normalize());jetPart.updateMatrix();jet.setMatrixAt(i-1,jetPart.matrix);
      points.set([next.x,next.y,next.z],i*3);used=i+1;last=next;previous=next;
      if(hit)break;
    }
    geometry.setDrawRange(0,used);geometry.attributes.position.needsUpdate=true;jet.count=used-1;jet.instanceMatrix.needsUpdate=true;impact.visible=hit;impact.position.copy(last);
  }
  function update(delta){
    panel.hidden=!active();const rig=entry.actor.userData.truck.rig;
    document.documentElement.classList.toggle('aerial-operating',active()&&mode);
    if(!rig?.TurntableYaw)return;
    if(active()){
      if(document.querySelector('dialog[open]')||!panel.open)clearInput();
      const home=Math.hypot(entry.state.x-entry.spawn.x,entry.state.z-entry.spawn.z)<4;
      stepAerial(s,{...(mode?input:{}),...pending},delta,{speed:entry.state.speed,atHome:home,setup,motion});pending={};
    }else{s.flow=false;}
    applyAerialPose(THREE,entry,s);
    entry.actor.userData.aerialSegments=s.phase==='travel'?[]:rigSegments();
    updateWater();
    const label=s.phase==='travel'?'Stowed':s.phase==='operating'?'Stabilized':s.phase;
    output.textContent=`${label} · Water ${Math.ceil(s.supply/45*100)}%${s.stopped?' · Stopped':''}${s.reason?' · '+s.reason:''}`;
    panel.querySelector('[data-action="mode"]').textContent=mode?'Drive controls':'Operate';
    panel.querySelector('[data-action="deploy"]').textContent=s.stopped&&s.phase!=='travel'?'Resume':'Stabilize';
    panel.querySelector('[data-action="view"]').textContent=nozzleView?'Overview':'Nozzle view';
  }
  return {update,action,clearInput,locksDriving:()=>fleet.fleet.active===entry&&(!aerialTravelReady(s)||mode),
    diagnostics:()=>({lastBlocked,mode,staticObstacleCount:boxes.length}),
    cameraPose:()=>{
      if(!active()||!mode||s.phase==='travel'||!entry.actor.userData.truck.rig?.NozzleOutlet)return null;
      const outlet=entry.actor.userData.truck.rig.NozzleOutlet;
      if(nozzleView){const position=outlet.getWorldPosition(new THREE.Vector3());const aim=new THREE.Vector3(0,0,-1).transformDirection(outlet.matrixWorld);position.addScaledVector(aim,.4);return {position,target:position.clone().addScaledVector(aim,30)};}
      const bounds=new THREE.Box3().setFromObject(entry.actor),target=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
      const distance=Math.max(18,size.length()*1.1),yaw=gameState.gameplayYaw;
      return {position:target.clone().add(new THREE.Vector3(Math.sin(yaw)*distance,distance*.65,Math.cos(yaw)*distance)),target};
    },
    handleKey(event){if(!active()||!mode||!keys[event.code])return false;event.preventDefault();held.set(event.code,keys[event.code]);rebuild();return true;},
    releaseKey(code){held.delete(code);rebuild();},
    nozzle:()=>entry.actor.userData.truck.rig?.NozzleOutlet,
  };
}
