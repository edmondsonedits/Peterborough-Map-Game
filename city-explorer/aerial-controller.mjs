const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number(v)||0));
const approach=(v,t,step)=>v<t?Math.min(v+step,t):Math.max(v-step,t);
export const AERIAL_LIMITS=Object.freeze({pitch:75*Math.PI/180,extension:4.8,supply:45,jackStroke:1.08,lift:.14,maxLift:.36,boardingPitch:.4,clearancePitch:.8});
export function createAerialState(){return {phase:'travel',beams:0,jacks:0,lift:0,liftHeight:AERIAL_LIMITS.lift,fold:1,basketFold:0,pitch:0,yaw:0,extension:0,nozzleYaw:0,nozzlePitch:-.25,flow:false,supply:45,feet:[0,0,0,0],stopped:false,reason:''};}
export function aerialTravelReady(s){return s.phase==='travel'&&s.beams===0&&s.jacks===0&&s.lift===0&&s.fold===1&&s.basketFold===0&&s.extension===0&&Math.abs(s.pitch)<.001&&Math.abs(s.yaw)<.001;}
export function aerialPose(s){return {beams:s.beams,jacks:s.jacks,lift:s.lift,liftHeight:s.liftHeight,fold:s.fold,basketFold:s.basketFold,pitch:s.pitch,yaw:s.yaw,extension:s.extension,nozzleYaw:s.nozzleYaw,nozzlePitch:s.nozzlePitch};}
export function aerialBoardingReady(s){
  return s.phase==='operating'&&s.lift===1&&s.pitch===AERIAL_LIMITS.boardingPitch&&s.extension===0&&s.yaw===0;
}

const homeYaw=yaw=>Math.atan2(Math.sin(yaw),Math.cos(yaw));
const motionAxes=['pitch','yaw','extension','beams','jacks','lift','fold','basketFold'];
const automaticBlocked={
  deploying:'Setup paused — clear the obstruction and resume',
  returning:'Return blocked — take manual control or resume',
  stowing:'Stow paused — clear the obstruction and resume',
};

/** Pure apparatus controller. Environment validates setup and the full swept pose. */
export function stepAerial(s,input={},delta=0,environment={}){
  const dt=Number.isFinite(delta)?clamp(delta,0,.04):0;
  s.flow=false;
  if(input.stop){s.stopped=true;s.reason='Stopped';return s;}
  if(input.refill&&aerialTravelReady(s)&&environment.atHome)s.supply=45;
  if(input.stow&&s.phase!=='travel'&&!environment.occupied){s.phase='stowing';s.yaw=homeYaw(s.yaw);s.stopped=false;s.reason='';}
  if(input.return&&(s.phase==='operating'||s.phase==='returning')){s.phase='returning';s.yaw=homeYaw(s.yaw);s.stopped=false;s.reason='';}
  if(input.resume){s.stopped=false;s.reason='';}
  if(input.takeControl&&s.phase==='returning'){s.phase='operating';s.stopped=false;s.reason='';}
  if(input.deploy){
    if(s.phase==='travel'){
      const setup=Math.abs(environment.speed||0)>.1?{ok:false,reason:'Stop before stabilizing'}:environment.setup?.()||{ok:false,reason:'Ground not ready'};
      if(!setup.ok){s.reason=setup.reason||'Open space required';return s;}
      s.feet=setup.feet||[0,0,0,0];s.liftHeight=setup.liftHeight??AERIAL_LIMITS.lift;s.phase='deploying';
    }
    s.stopped=false;s.reason='';
  }
  if(s.stopped||dt===0||s.phase==='travel')return s;
  const candidate={...s};
  if(s.phase==='deploying'){
    if(s.beams<1)candidate.beams=approach(s.beams,1,dt/2.5);
    else if(s.jacks<1)candidate.jacks=approach(s.jacks,1,dt/2);
    else if(s.lift<1)candidate.lift=approach(s.lift,1,dt/.8);
    else if(s.fold>0){
      if(s.pitch<AERIAL_LIMITS.clearancePitch)candidate.pitch=approach(s.pitch,AERIAL_LIMITS.clearancePitch,dt*.3);
      else candidate.fold=approach(s.fold,0,dt/2.5);
    }else if(s.pitch!==AERIAL_LIMITS.boardingPitch)candidate.pitch=approach(s.pitch,AERIAL_LIMITS.boardingPitch,dt*.3);
    else candidate.phase='operating';
  }else if(s.phase==='stowing'){
    if(s.extension>0)candidate.extension=approach(s.extension,0,dt*.9);
    else if((s.fold<1||s.yaw!==0)&&s.pitch!==AERIAL_LIMITS.clearancePitch)
      candidate.pitch=approach(s.pitch,AERIAL_LIMITS.clearancePitch,dt*.3);
    else if(s.yaw!==0)candidate.yaw=approach(s.yaw,0,dt*.35);
    else if(s.fold<1)candidate.fold=approach(s.fold,1,dt/2.5);
    else { // Lower to travel only after the boom and basket are folded and aligned.
      candidate.pitch=approach(s.pitch,0,dt*.3);
      if(s.pitch===0){
        if(s.lift>0)candidate.lift=approach(s.lift,0,dt/.8);
        else if(s.jacks>0)candidate.jacks=approach(s.jacks,0,dt/2);
        else if(s.beams>0)candidate.beams=approach(s.beams,0,dt/2.5);
        else candidate.phase='travel';
      }
    }
  }else if(s.phase==='returning'){
    if(s.extension>0)candidate.extension=approach(s.extension,0,dt*.9);
    else if(s.pitch<AERIAL_LIMITS.boardingPitch)candidate.pitch=approach(s.pitch,AERIAL_LIMITS.boardingPitch,dt*.3);
    else if(s.yaw!==0)candidate.yaw=approach(s.yaw,0,dt*.35);
    else if(s.pitch!==AERIAL_LIMITS.boardingPitch)candidate.pitch=approach(s.pitch,AERIAL_LIMITS.boardingPitch,dt*.3);
    else candidate.phase='operating';
  }else if(s.phase==='operating'){
    candidate.pitch=clamp(s.pitch+(input.raise||0)*dt*.24,.12,AERIAL_LIMITS.pitch);
    candidate.yaw=s.yaw+(input.rotate||0)*dt*.23;
    candidate.extension=clamp(s.extension+(input.extend||0)*dt*.85,0,AERIAL_LIMITS.extension);
    candidate.nozzleYaw=clamp(s.nozzleYaw+(input.nozzleYaw||0)*dt*.7,-Math.PI*.75,Math.PI*.75);
    candidate.nozzlePitch=clamp(s.nozzlePitch+(input.nozzlePitch||0)*dt*.55,-Math.PI/2,Math.PI/3);
  }
  const changes=motionAxes.filter(key=>candidate[key]!==s[key]);
  let reason='';
  if(changes.length&&environment.motion&&!environment.motion(s,candidate)){
    if(s.phase!=='operating'){
      s.stopped=true;
      s.reason=automaticBlocked[s.phase];
      return s;
    }
    let accepted=s;
    if(changes.length>1){
      for(const axis of changes){
        const single={...accepted,[axis]:candidate[axis]};
        if(environment.motion(accepted,single))accepted=single;
      }
    }
    for(const axis of changes)candidate[axis]=accepted[axis];
    reason=accepted===s?'Movement blocked — try another direction':'Movement limited by clearance';
  }
  Object.assign(s,candidate);s.reason=reason;
  s.flow=s.phase==='operating'&&s.supply>0&&environment.allowWater!==false&&Boolean(input.flow);
  if(s.flow)s.supply=Math.max(0,s.supply-dt);
  if(s.supply===0&&input.flow&&environment.allowWater!==false&&s.phase==='operating'){s.flow=false;s.reason='Water empty';}
  return s;
}
