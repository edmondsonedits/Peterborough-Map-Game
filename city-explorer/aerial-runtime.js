import {stepAerial,aerialTravelReady,aerialBoardingReady,AERIAL_LIMITS} from './aerial-controller.mjs';
import {segmentBoxHit,vehicleFootprint} from './apparatus-collision.mjs';

const keys={KeyW:['raise',1],KeyS:['raise',-1],KeyA:['rotate',1],KeyD:['rotate',-1],KeyE:['extend',1],KeyQ:['extend',-1],ArrowLeft:['nozzleYaw',1],ArrowRight:['nozzleYaw',-1],ArrowUp:['nozzlePitch',1],ArrowDown:['nozzlePitch',-1],Space:['flow',true]};
const ends=['FL','FR','RL','RR'];
const upAxis=[0,1,0];
const sideFor=index=>index%2===0?-1:1;
const beamTravel=model=>model.metadata?.stabilizerBeamTravel??1.6;
const footSole=model=>model.metadata?.jackFootSole??-.06;

function setChassisPose(entry,lift,liftHeight=AERIAL_LIMITS.lift){
  const {actor,state}=entry;
  actor.position.y=(state.y||0)+lift*liftHeight;
  actor.rotation.set((state.pitch||0)*(1-lift),state.heading||0,(state.roll||0)*(1-lift),'YXZ');
  actor.updateMatrixWorld(true);
}

function strokeToGround(THREE,model,beam,jack,height,extraX=0){
  const rest=jack.userData.fleetRest.position.clone();
  rest.x+=extraX;
  rest.y+=footSole(model);
  const sole=beam.localToWorld(rest);
  const up=new THREE.Vector3(...upAxis).transformDirection(beam.matrixWorld);
  return (sole.y-height)/up.y;
}
export function applyAerialPose(THREE,entry,s){
  const model=entry.actor.userData.truck,rig=model.rig;if(!rig?.TurntableYaw)return;
  setChassisPose(entry,s.lift||0,s.liftHeight);
  rig.TurntableYaw.rotation.y=s.yaw;
  rig.LadderPitch.rotation.x=s.pitch;
  for(const section of model.ladderSections){
    const node=rig[section.node];
    node.position.z=node.userData.fleetRest.position.z-section.travel*(s.extension/AERIAL_LIMITS.extension);
  }
  // Negative half-turn sends the fly below the main ladder during deployment.
  rig.KnuckleFold.rotation.x=-s.fold*Math.PI;
  // BasketLevel compensates every boom angle, including the transport pose.
  rig.BasketFold.rotation.x=0;
  rig.MonitorYaw.rotation.y=s.nozzleYaw;
  rig.MonitorPitch.rotation.x=s.nozzlePitch;
  rig.BasketLevel.parent.updateWorldMatrix(true,false);
  const parentRotation=rig.BasketLevel.parent.getWorldQuaternion(new THREE.Quaternion());
  const levelRotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),(entry.state.heading||0)+s.yaw);
  rig.BasketLevel.quaternion.copy(parentRotation.invert().multiply(levelRotation));
  for(let i=0;i<4;i++){
    const beam=rig[`Outrigger_${ends[i]}`],jack=rig[`Jack_${ends[i]}`];
    beam.position.x=beam.userData.fleetRest.position.x+sideFor(i)*s.beams*beamTravel(model);
    beam.updateWorldMatrix(true,false);
    const rest=jack.userData.fleetRest.position;
    const ground=(entry.state.y||0)+(s.feet[i]||0);
    const stroke=Math.max(0,Math.min(AERIAL_LIMITS.jackStroke,strokeToGround(THREE,model,beam,jack,ground)));
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


/** Geometry bounds in the chassis frame avoid heading-dependent world-AABB inflation. */
export function aerialPartBounds(THREE,object,chassis){
 const inverse=chassis.matrixWorld.clone().invert(),bounds=new THREE.Box3(),part=new THREE.Box3(),matrix=new THREE.Matrix4();
 object.traverse(node=>{
  if(!node.isMesh)return;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  matrix.multiplyMatrices(inverse,node.matrixWorld);
  part.copy(node.geometry.boundingBox).applyMatrix4(matrix);bounds.union(part);
 });
 return bounds;
}
export function aerialSelfClearance(THREE,entry){
 const model=entry.actor.userData.truck,rig=model.rig;
 const inverse=entry.actor.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),basketParts=[];
 rig.BasketLevel.traverse(node=>{
  if(!node.isMesh)return;
  if(!node.geometry.boundingBox)node.geometry.computeBoundingBox();
  matrix.multiplyMatrices(inverse,node.matrixWorld);
  basketParts.push(node.geometry.boundingBox.clone().applyMatrix4(matrix));
 });
 const fly=rig.LadderSection_6;
 const a=entry.actor.worldToLocal(fly.getWorldPosition(new THREE.Vector3()));
 const b=entry.actor.worldToLocal(rig.BasketLevel.getWorldPosition(new THREE.Vector3()));
 for(const box of [model.cabClearance,...(model.bodyClearance??[])].filter(Boolean)){
  const solid=new THREE.Box3(new THREE.Vector3(box.min.x,box.min.y,box.min.z),new THREE.Vector3(box.max.x,box.max.y,box.max.z));
  if(basketParts.some(part=>part.intersectsBox(solid))||segmentBoxHit(a,b,box,.10)!==null)return false;
 }
 // The complete fly stays below the nested sections in the boom's own frame.
 const frame=rig.KnuckleFold.parent;
 const start=frame.worldToLocal(fly.getWorldPosition(new THREE.Vector3()));
 const end=frame.worldToLocal(rig.BasketLevel.getWorldPosition(new THREE.Vector3()));
 if(Math.max(start.y,end.y)+.10>-.25)return false;
 return true;
}

export function createAerialRuntime({THREE,scene,fleet,gameState,canvas,surface,ready,inBay,isWater,obstacles,toast,playerPosition,placeOperator,canMutate=()=>true}){
  const entry=fleet.fleet.vehicles.find(v=>v.aerial),s=entry.aerial;
  const input={},held=new Map();let station=null,pending={},boxes=[],boxTime=-Infinity,lastBlocked=null,view='basket',boardingHeading=0,travelPoseReady=false,groundControl=false;
  const point=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
  const group=new THREE.Group();group.name='Aerial_Water';scene.add(group);
  const points=new Float32Array(65*3),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(points,3));
  const stream=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xc9f4ff,transparent:true,opacity:.85}));stream.frustumCulled=false;group.add(stream);
  const jet=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.07,1,6),new THREE.MeshBasicMaterial({color:0xc8f1ff,transparent:true,opacity:.7,depthWrite:false}),64);
  jet.frustumCulled=false;jet.instanceMatrix.setUsage(THREE.DynamicDrawUsage);group.add(jet);const jetPart=new THREE.Object3D();
  const impact=new THREE.Mesh(new THREE.SphereGeometry(.22,10,6),new THREE.MeshBasicMaterial({color:0xe5faff,transparent:true,opacity:.5}));impact.scale.set(1,.4,1);group.add(impact);group.visible=false;

  const prompt=document.createElement('button');prompt.type='button';prompt.id='aerial-rear-prompt';
  prompt.innerHTML='<kbd>E</kbd><span>Rear aerial controls</span>';prompt.hidden=true;
  const panel=document.createElement('section');panel.id='aerial-controls';panel.hidden=true;panel.setAttribute('aria-label','Aerial controls');
  panel.innerHTML=`<header><div><span class="aerial-eyebrow">Aerial 1</span><h2>Rear controls</h2></div><button type="button" data-action="leave" aria-label="Leave rear controls">×</button></header>
    <output aria-live="polite"></output>
    <div class="aerial-readouts"></div>
    <div class="aerial-actions">
      <button type="button" data-action="deploy">Extend &amp; level</button>
      <button type="button" data-action="board">Climb into basket</button>
      <button type="button" data-action="ground">Ground ladder</button>
      <button type="button" data-action="return">Return to boarding</button>
      <button type="button" data-action="takeControl">Manual control</button>
      <button type="button" data-action="exit">Exit basket</button>
      <button type="button" data-action="stow">Stow apparatus</button>
      <button type="button" data-action="refill">Refill water</button>
      <button type="button" data-action="view">Change view</button>
      <button type="button" data-action="resume">Resume</button>
      <button type="button" data-action="stop">Stop</button>
    </div>
    <div class="aerial-compartments" role="group" aria-label="Basket control group"><button type="button" data-compartment="ladder" aria-pressed="true">Ladder</button><button type="button" data-compartment="water" aria-pressed="false">Aim &amp; Water</button></div>
    <div class="aerial-holds" data-compartment="ladder"></div><small>W/S raise · A/D rotate · Q/E telescope · arrows aim · Space water · X return or exit</small>`;
  const controls=panel.querySelector('.aerial-holds');
  const compartments=panel.querySelector('.aerial-compartments');
  for(const type of ['selectstart','contextmenu'])panel.addEventListener(type,event=>event.preventDefault());
  function selectCompartment(compartment){
    clearInput();
    controls.dataset.compartment=compartment;
    for(const option of compartments.children)option.setAttribute('aria-pressed',String(option.dataset.compartment===compartment));
  }
  compartments.addEventListener('click',event=>{
    if(!canMutate())return;
    const compartment=event.target.closest('button[data-compartment]')?.dataset.compartment;
    if(compartment&&compartment!==controls.dataset.compartment)selectCompartment(compartment);
  });
  for(const [label,axis,value] of [['Raise','raise',1],['Lower','raise',-1],['Rotate left','rotate',1],['Rotate right','rotate',-1],['Extend','extend',1],['Retract','extend',-1],['Aim left','nozzleYaw',1],['Aim right','nozzleYaw',-1],['Aim up','nozzlePitch',1],['Aim down','nozzlePitch',-1],['Water','flow',true]]){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.axis=axis;b.dataset.group=axis.startsWith('nozzle')||axis==='flow'?'water':'ladder';controls.append(b);
    b.onpointerdown=e=>{if(!canMutate()||b.disabled||!canHold(axis))return;e.preventDefault();b.setPointerCapture(e.pointerId);held.set(b,[axis,value]);b.classList.add('is-held');rebuild();};
    b.onkeydown=e=>{if(e.code==='Enter'&&canMutate()&&!b.disabled&&canHold(axis)){e.preventDefault();held.set(b,[axis,value]);b.classList.add('is-held');rebuild();}};
    b.onkeyup=e=>{if(e.code==='Enter')release();};b.onblur=()=>release();
    const release=()=>{held.delete(b);b.classList.remove('is-held');rebuild();};b.onpointerup=release;b.onpointercancel=release;b.onlostpointercapture=release;
  }
  const output=panel.querySelector('output'),title=panel.querySelector('h2'),readouts=panel.querySelector('.aerial-readouts');
  const buttons=Object.fromEntries([...panel.querySelectorAll('[data-action]')].map(b=>[b.dataset.action,b]));
  document.getElementById('app').append(prompt,panel);
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./fleet.css?rev=4',import.meta.url).href;document.head.append(css);
  function rebuild(){for(const k of Object.keys(input))delete input[k];for(const [axis,v] of held.values())input[axis]=v;}
  function clearInput(){held.clear();rebuild();pending={};s.flow=false;group.visible=false;panel.querySelectorAll('.is-held').forEach(n=>n.classList.remove('is-held'));}
  function onFoot(){return canMutate()&&gameState.mode==='onFoot';}
  function canHold(axis){
    return canMutate()&&(station==='basket'||(station==='rear'&&groundControl&&['raise','rotate','extend'].includes(axis)));
  }
  function rearPosition(){
    const rear=entry.actor.userData.truck.rig?.RearOperator;
    const ground=rear?rear.getWorldPosition(new THREE.Vector3()):entry.actor.localToWorld(new THREE.Vector3(0,0,entry.definition.tuning.length/2+1.15));
    ground.y=surface(ground.x,ground.z).height+.025;
    return ground;
  }
  function nearRear(){
    const pos=playerPosition();
    if(!onFoot()||!pos||entry.actor.userData.truck.assetStatus!=='blender-ready'||Math.abs(entry.state.speed)>.1)return false;
    const rear=rearPosition();
    return Math.hypot(pos.x-rear.x,pos.z-rear.z)<1.65&&Math.abs(pos.y-rear.y)<1.4;
  }
  function basketPosition(){
    const rig=entry.actor.userData.truck.rig;
    return (rig.BasketStand??rig.Basket).getWorldPosition(new THREE.Vector3());
  }
  function dismiss(){
    clearInput();station=null;groundControl=false;view='basket';panel.hidden=true;prompt.hidden=true;
    document.documentElement.classList.remove('aerial-operating','aerial-near-rear');
  }
  function action(value){
    if(!onFoot()||document.querySelector('dialog[open]'))return false;
    if(value.rear&&nearRear()){
      station='rear';groundControl=false;clearInput();placeOperator(rearPosition(),entry.state.heading);
    }else if(value.leave&&station==='rear'){
      dismiss();
    }else if(value.ground&&station==='rear'&&(groundControl||s.phase==='operating'||s.phase==='returning')){
      groundControl=!groundControl;
      selectCompartment('ladder');
    }else if(value.board&&station==='rear'&&!groundControl&&aerialBoardingReady(s)&&!s.stopped){
      selectCompartment('ladder');station='basket';view='basket';boardingHeading=entry.state.heading;
      gameState.gameplayYaw=boardingHeading;gameState.gameplayPitch=-.37;
      placeOperator(basketPosition(),boardingHeading);
    }else if(value.exit&&station==='basket'&&aerialBoardingReady(s)){
      const rear=rearPosition();refreshBoxes(true);
      if(!rearPadClear(rear)){
        toast('Rear access is blocked');return false;
      }
      clearInput();station='rear';placeOperator(rear,entry.state.heading);
      gameState.gameplayYaw=entry.state.heading;gameState.gameplayPitch=-.16;
    }else if(value.view&&station==='basket'){
      view=view==='basket'?'overview':view==='overview'?'nozzle':'basket';
    }else if(station&&(value.stop||value.resume)){
      clearInput();pending=value.stop?{stop:true}:{resume:true};
    }else if(station==='rear'&&!groundControl&&(value.deploy||value.stow||value.refill)){
      clearInput();pending=value;
    }else if((station==='basket'||(station==='rear'&&groundControl))&&(value.return||value.takeControl)){
      clearInput();pending=value;
    }else return false;
    canvas.focus({preventScroll:true});
    return true;
  }
  prompt.onclick=()=>action({rear:true});
  Object.entries(buttons).forEach(([name,b])=>b.onclick=()=>action({[name]:true}));
  window.addEventListener('blur',clearInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
  window.addEventListener('ptbo:vehicle-selected',()=>{
    if(s.phase!=='travel')s.stopped=true;
    dismiss();
  });
  function refreshBoxes(force=false){if(force||performance.now()-boxTime>2000){boxes=obstacles(entry.state);boxTime=performance.now();}}
  function solidBoxes(){
    const result=[...boxes];
    for(const other of fleet.fleet.vehicles)if(other!==entry){const corners=vehicleFootprint(other.state,other.definition.tuning);result.push({min:{x:Math.min(...corners.map(p=>p.x)),y:other.state.y,z:Math.min(...corners.map(p=>p.z))},max:{x:Math.max(...corners.map(p=>p.x)),y:other.state.y+other.definition.tuning.height,z:Math.max(...corners.map(p=>p.z))}});}
    return result;
  }
  function rearPadClear(rear,solids=solidBoxes()){
    if(!ready(rear.x,rear.z)||isWater(rear.x,rear.z))return false;
    const head=rear.clone();head.y+=2.1;
    return !solids.some(box=>segmentBoxHit(rear,head,box,.34)!==null)&&
      !fleet.blocked?.({...rear,heading:0},{length:.65,width:.65},entry.definition.id);
  }
  function rigSegments(){
    const rig=entry.actor.userData.truck.rig,result=[];
    for(const section of entry.actor.userData.truck.ladderSections){
      const node=rig[section.node];
      node.localToWorld(point.set(0,0,0));node.localToWorld(end.set(0,0,-section.length));
      result.push([point.clone(),end.clone(),section.radius??.27]);
    }
    const basket=rig.Basket;point.set(0,.5,0);basket.localToWorld(point);end.copy(point);end.y+=.25;result.push([point.clone(),end.clone(),.8]);
    return result;
  }
  function poseClear(pose,solids){
    applyAerialPose(THREE,entry,pose);
    if(!aerialSelfClearance(THREE,entry)){lastBlocked={kind:'apparatus-self-clearance'};return false;}
    const segments=rigSegments();
    const cab=entry.actor.userData.truck.cabClearance??{min:{x:-1.35,z:-5.8},max:{x:1.35,y:3.2,z:-.95}};
    for(const [a,b,radius] of segments){
      const solid=solids.find(box=>segmentBoxHit(a,b,box,radius)!==null);
      if(solid){lastBlocked={kind:'solid',a:a.toArray(),b:b.toArray(),box:{min:solid.min,max:solid.max}};return false;}
      const count=Math.max(1,Math.ceil(a.distanceTo(b)/.5));
      for(let i=0;i<=count;i++){const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=a.y+(b.y-a.y)*t;
        if(!ready(x,z)||surface(x,z).height+radius>y){lastBlocked={kind:'ground-or-streaming',x,y,z,ground:surface(x,z).height};return false;}
        // Conservative cab clearance; all parts of every section are sampled.
        const p=entry.actor.worldToLocal(new THREE.Vector3(x,y,z));
        const halfHeight=radius>.5?radius:.1;
        if(p.x>cab.min.x-radius&&p.x<cab.max.x+radius&&p.z<cab.max.z&&p.z>cab.min.z&&p.y<cab.max.y+halfHeight){lastBlocked={kind:'cab',local:p.toArray()};return false;}
      }
    }
    return true;
  }
  function motion(a,b){
    const rig=entry.actor.userData.truck.rig;if(!rig?.TurntableYaw)return false;
    if(a.lift===b.lift&&a.pitch===b.pitch&&a.yaw===b.yaw&&a.fold===b.fold&&a.basketFold===b.basketFold&&a.extension===b.extension)return true;
    refreshBoxes();const solids=solidBoxes();
    const steps=Math.max(1,Math.ceil((Math.abs(a.pitch-b.pitch)*33+Math.abs(a.yaw-b.yaw)*33+Math.abs(a.fold-b.fold)*Math.PI*4+Math.abs(a.basketFold-b.basketFold)*2+Math.abs(a.extension-b.extension)*4+Math.abs(a.lift-b.lift)*.8)/.12));
    let ok=true;
    for(let i=1;i<=steps;i++){
      const t=i/steps,pose={...a};
      for(const k of ['pitch','yaw','fold','basketFold','extension','lift'])pose[k]=a[k]+(b[k]-a[k])*t;
      if(!poseClear(pose,solids)){ok=false;break;}
      if(b.lift>a.lift){
        const bounds=new THREE.Box3().setFromObject(entry.actor);
        if(solids.some(box=>bounds.intersectsBox(box))){
          lastBlocked={kind:'chassis-lift',bounds:{min:bounds.min,max:bounds.max}};ok=false;break;
        }
      }
    }
    applyAerialPose(THREE,entry,a);return ok;
  }
  function setup(){
    if(entry.actor.userData.truck.assetStatus!=='blender-ready')return {ok:false,reason:'Aerial model is not ready'};
    if(inBay(entry.state))return {ok:false,reason:'Drive clear of the bay before stabilizing'};
    refreshBoxes(true);
    const model=entry.actor.userData.truck,rig=model.rig,solids=solidBoxes();
    if(!rearPadClear(rearPosition(),solids))return {ok:false,reason:'Rear access is blocked'};
    const feet=[],contacts=[];
    for(let i=0;i<ends.length;i++){
      const beam=rig[`Outrigger_${ends[i]}`],jack=rig[`Jack_${ends[i]}`];
      const extraX=sideFor(i)*beamTravel(model)*(1-s.beams);
      const p=jack.userData.fleetRest.position.clone();p.x+=extraX;p.y+=footSole(model);beam.localToWorld(p);
      const up=new THREE.Vector3(0,1,0).transformDirection(beam.matrixWorld);
      // Sample under the pad's projected ground contact rather than under its housing.
      let height=surface(p.x,p.z).height;
      for(let j=0;j<3;j++){
        const distance=(p.y-height)/up.y;
        height=surface(p.x-up.x*distance,p.z-up.z*distance).height;
      }
      const foot=p.clone().addScaledVector(up,-(p.y-height)/up.y);
      if(!ready(foot.x,foot.z)||isWater(foot.x,foot.z))return {ok:false,reason:'Supported dry ground required'};
      if(Math.abs(height-entry.state.y)>.42)return {ok:false,reason:'Ground exceeds stabilizer travel'};
      feet.push(height-entry.state.y);contacts.push({beam,jack,height,extraX});
      const center=beam.localToWorld(new THREE.Vector3(-beam.position.x,.2,0));
      if(solids.some(box=>segmentBoxHit(foot,p,box,.37)!==null||segmentBoxHit(center,p,box,.28)!==null))
        return {ok:false,reason:'Stabilizer space is blocked'};
    }
    if(Math.max(...feet)-Math.min(...feet)>Math.tan(5*Math.PI/180)*5.5||
        Math.max(Math.abs(entry.state.pitch||0),Math.abs(entry.state.roll||0))>5*Math.PI/180)
      return {ok:false,reason:'Ground is too steep'};
    // Leave tire clearance on the high side as the suspension levels.
    setChassisPose(entry,1,0);
    const wheelRadius=model.metadata?.wheelRadius??.56;
    const rise=Math.max(AERIAL_LIMITS.lift,...model.wheels.map(({pivot})=>{
      const center=pivot.getWorldPosition(new THREE.Vector3());
      return surface(center.x,center.z).height+wheelRadius+.055-center.y;
    }));
    if(rise>AERIAL_LIMITS.maxLift){applyAerialPose(THREE,entry,s);return {ok:false,reason:'Ground is too uneven to level'};}
    for(const lift of [0,.5,1]){
      setChassisPose(entry,lift,rise);
      const reachable=contacts.every(({beam,jack,height,extraX})=>{
        const stroke=strokeToGround(THREE,model,beam,jack,height,extraX);
        return stroke>=0&&stroke<=AERIAL_LIMITS.jackStroke;
      });
      if(!reachable){applyAerialPose(THREE,entry,s);return {ok:false,reason:'Ground exceeds stabilizer travel'};}
    }
    // Validate the boarding sequence before committing the stabilizers.
    const stable={...s,feet,beams:1,jacks:1,lift:1,liftHeight:rise},raised={...stable,pitch:AERIAL_LIMITS.clearancePitch};
    const unfolded={...raised,fold:0};
    const valid=motion({...stable,lift:0},stable)&&motion(stable,raised)&&motion(raised,unfolded)&&motion(unfolded,{...unfolded,pitch:AERIAL_LIMITS.boardingPitch});
    applyAerialPose(THREE,entry,s);
    return valid?{ok:true,feet,liftHeight:rise}:{ok:false,reason:'Overhead space is blocked'};
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
      const bodyHit=segmentBoxHit(localA,localB,{min:{x:-1.3,y:0,z:-entry.definition.tuning.length/2},max:{x:1.3,y:2.5,z:entry.definition.tuning.length/2}});if(bodyHit!==null)nearest=Math.min(nearest,bodyHit);
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
    if(station&&!onFoot())dismiss();
    if(station==='rear'&&!nearRear())dismiss();
    const rig=entry.actor.userData.truck.rig,bucket=station==='basket',rear=station==='rear';
    const ground=rear&&groundControl,ladderConsole=bucket||ground;
    panel.hidden=!station;prompt.hidden=Boolean(station)||!nearRear();
    document.documentElement.classList.toggle('aerial-operating',Boolean(station));
    document.documentElement.classList.toggle('aerial-near-rear',!prompt.hidden);
    if(!rig?.TurntableYaw)return;
    if(document.querySelector('dialog[open]'))clearInput();
    const home=Math.hypot(entry.state.x-entry.spawn.x,entry.state.z-entry.spawn.z)<4;
    if(s.phase!=='travel'||station){
      stepAerial(s,{...(ladderConsole?input:{}),...pending},delta,{speed:entry.state.speed,atHome:home,occupied:bucket,allowWater:bucket,setup,motion});
      pending={};
    }
    if(s.phase!=='travel'||!travelPoseReady)applyAerialPose(THREE,entry,s);
    travelPoseReady=s.phase==='travel';
    entry.actor.userData.aerialSegments=travelPoseReady?[]:rigSegments();
    if(bucket)placeOperator(basketPosition(),entry.state.heading+s.yaw);
    updateWater();
    if(!station)return;

    const canBoard=aerialBoardingReady(s);
    const label={travel:'Stowed',deploying:s.beams<1?'Extending outriggers':s.jacks<1?'Lowering jacks':s.lift<1?'Leveling chassis':'Unfolding platform',
      operating:canBoard?(bucket?'At boarding position':'Ready to board'):'Platform clear',returning:'Returning to boarding position',stowing:'Stowing apparatus'}[s.phase];
    const message=s.reason||label;
    if(output.textContent!==message)output.textContent=message;
    const heading=bucket?'Basket controls':ground?'Ground ladder controls':'Rear controls';
    if(title.textContent!==heading)title.textContent=heading;
    const height=rig.Basket.getWorldPosition(point).y-(entry.state.y||0);
    const meters=Math.max(0,height);
    const stats=bucket?`Height ${meters.toFixed(1)} m · Water ${Math.ceil(s.supply/AERIAL_LIMITS.supply*100)}%`:
      ground?`Height ${meters.toFixed(1)} m · Outriggers level`:
      `Outriggers ${Math.round(s.beams*100)}% · ${s.lift===1?'Level':s.jacks===1?'Jacks grounded':s.jacks>0?'Lowering jacks':'Jacks up'}`;
    if(readouts.textContent!==stats)readouts.textContent=stats;
    buttons.leave.hidden=!rear;
    buttons.deploy.hidden=!rear||s.phase!=='travel';
    buttons.board.hidden=!rear||ground||!canBoard||s.stopped;
    buttons.ground.hidden=!rear||(!ground&&s.phase!=='operating'&&s.phase!=='returning');
    const groundLabel=ground?'Done':'Ground ladder';
    if(buttons.ground.textContent!==groundLabel)buttons.ground.textContent=groundLabel;
    buttons.stow.hidden=!rear||ground||s.phase==='travel'||s.phase==='stowing';
    buttons.refill.hidden=!rear||!home||s.phase!=='travel'||s.supply===AERIAL_LIMITS.supply;
    buttons.return.hidden=!ladderConsole||canBoard||s.phase==='returning';
    buttons.takeControl.hidden=!ladderConsole||s.phase!=='returning';
    buttons.exit.hidden=!bucket||!canBoard;
    buttons.view.hidden=!bucket;
    const viewLabel=view==='basket'?'Overview':view==='overview'?'Nozzle view':'Basket view';
    if(buttons.view.textContent!==viewLabel)buttons.view.textContent=viewLabel;
    buttons.resume.hidden=!s.stopped||s.phase==='travel';
    buttons.stop.hidden=s.stopped||s.phase==='travel';
    panel.classList.toggle('is-basket',bucket);
    panel.classList.toggle('is-ground-ladder',ground);
    compartments.hidden=!bucket;
    controls.hidden=!ladderConsole;
    panel.querySelector('small').hidden=!bucket;
    for(const button of controls.children){
      button.hidden=ground&&button.dataset.group==='water';
      button.disabled=s.stopped||s.phase!=='operating';
    }
  }
  return {update,action,clearInput,dismiss,rearExitPoint:()=>{
    const rear=rearPosition();refreshBoxes(true);
    return rearPadClear(rear)?rear:null;
  },atControls:()=>Boolean(station),aboard:()=>station==='basket',
    locksDriving:()=>fleet.fleet.active===entry&&!aerialTravelReady(s),
    diagnostics:()=>({lastBlocked,station,view,groundControl,staticObstacleCount:boxes.length,
      rear:entry.actor.userData.truck.rig?.RearOperator?rearPosition().toArray():null,
      chassisLift:entry.actor.position.y-(entry.state.y||0),basket:entry.actor.userData.truck.rig?.Basket?.getWorldPosition(new THREE.Vector3()).toArray()}),
    cameraPose:()=>{
      if(!onFoot())return null;
      if(station==='rear'&&groundControl){
        const rig=entry.actor.userData.truck.rig;
        const base=rig.TurntableYaw.getWorldPosition(new THREE.Vector3());
        const basket=basketPosition();
        const center=entry.actor.getWorldPosition(new THREE.Vector3()).lerp(basket,.40);
        center.y+=.7;
        const distance=Math.max(15,base.distanceTo(basket)*1.18);
        const yaw=gameState.gameplayYaw+.84;
        const position=center.clone().add(new THREE.Vector3(Math.sin(yaw)*distance,4+distance*.23,Math.cos(yaw)*distance));
        return {position,target:center};
      }
      if(station!=='basket')return null;
      const outlet=entry.actor.userData.truck.rig.NozzleOutlet;
      if(view==='nozzle'){
        const position=outlet.getWorldPosition(new THREE.Vector3()),aim=new THREE.Vector3(0,0,-1).transformDirection(outlet.matrixWorld);
        position.addScaledVector(aim,.4);return {position,target:position.clone().addScaledVector(aim,30),attached:true};
      }
      const yaw=gameState.gameplayYaw+entry.state.heading+s.yaw-boardingHeading;
      const target=basketPosition();target.y+=1.05;
      if(view==='overview'){
        const height=Math.max(5,target.y-entry.actor.position.y),distance=8+height*.8;
        target.y-=height*.34;
        return {position:target.clone().add(new THREE.Vector3(Math.sin(yaw+.65)*distance,4+height*.42,Math.cos(yaw+.65)*distance)),target};
      }
      const position=basketPosition();position.y+=1.53;
      position.x+=Math.sin(yaw)*.33;position.z+=Math.cos(yaw)*.33;
      const pitch=gameState.gameplayPitch;
      const aim=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
      return {position,target:position.clone().addScaledVector(aim,24),attached:true};
    },
    handleKey(event){
      if(!onFoot())return false;
      let handled=false;
      if(event.code==='KeyE'&&station!=='basket'&&!groundControl&&!event.repeat)handled=action(station==='rear'?{leave:true}:{rear:true});
      else if(event.code==='KeyX'&&!event.repeat){
        if(station==='basket')handled=action(aerialBoardingReady(s)?{exit:true}:{return:true});
        else if(groundControl)handled=action(aerialBoardingReady(s)?{ground:true}:{return:true});
      }else if(keys[event.code]&&canHold(keys[event.code][0])){
        if(!s.stopped&&s.phase==='operating'){held.set(event.code,keys[event.code]);rebuild();}
        handled=true;
      }
      if(handled)event.preventDefault();
      return handled;
    },
    releaseKey(code){held.delete(code);rebuild();},
    nozzle:()=>entry.actor.userData.truck.rig?.NozzleOutlet,
  };
}
