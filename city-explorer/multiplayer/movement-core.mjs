import { sampleTruckWheelContacts, truckIsOnRoad } from '../road-wheel-contact.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const normalizeAngle=value=>((value+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
export function exponentialStep(current,target,response,delta){const dt=Math.max(0,finite(delta));return current+(target-current)*(1-Math.exp(-Math.max(0,response)*dt));}
export function wrapAngle(angle){const twoPi=Math.PI*2;return((angle+Math.PI)%twoPi+twoPi)%twoPi-Math.PI;}
export function dampAngle(current,target,response,delta){return wrapAngle(current+wrapAngle(target-current)*(1-Math.exp(-response*Math.max(0,delta))));}
export function headingFromDirection(x,z){return Math.atan2(-x,-z);}
export function directionFromHeading(heading){return{x:-Math.sin(heading),z:-Math.cos(heading)};}
export const DEFAULT_PLAYER_TUNING=Object.freeze({walkSpeed:1.6,sprintSpeed:3.8,accelerationResponse:13,brakingResponse:18,rotationResponse:15,enterDistance:6.5,cameraDistance:8.6,cameraHeight:1.55,cameraPositionResponse:11,cameraTargetResponse:16});
export const DEFAULT_VEHICLE_TUNING=Object.freeze({length:10.4,width:2.55,height:3.25,wheelbase:5.65,trackWidth:2.12,maximumForwardSpeed:27.5,maximumReverseSpeed:7.2,forwardAcceleration:3.85,reverseAcceleration:2.65,serviceBrake:8.8,rollingDrag:.56,aerodynamicDrag:.008,offRoadSpeed:11.5,offRoadAccelerationScale:.48,steeringLowSpeed:.54,steeringHighSpeed:.15,steeringResponse:7.5,steeringReturnResponse:10,exitSpeed:.75,chaseDistance:10.2,chaseHeight:3.4,cameraPositionResponse:7.8,cameraTargetResponse:12});
export function stepVehicleKinematics(current,input,delta,onRoad=true,tuning=DEFAULT_VEHICLE_TUNING){
 const dt=Math.min(.05,Math.max(0,finite(delta))),throttle=clamp(finite(input?.throttle),-1,1),steeringInput=clamp(finite(input?.steering),-1,1);
 let speed=finite(current.speed),acceleration=0;const absoluteSpeed=Math.abs(speed);
 if(throttle>0)acceleration=speed<-.2?tuning.serviceBrake:tuning.forwardAcceleration;
 else if(throttle<0)acceleration=speed>.2?-tuning.serviceBrake:-tuning.reverseAcceleration;
 else if(absoluteSpeed>.001)acceleration=-Math.sign(speed)*(tuning.rollingDrag+tuning.aerodynamicDrag*speed*speed);
 if(!onRoad&&throttle!==0&&Math.sign(acceleration)===Math.sign(throttle))acceleration*=tuning.offRoadAccelerationScale;
 speed+=acceleration*dt;if(throttle===0&&Math.sign(speed)!==Math.sign(finite(current.speed)))speed=0;
 speed=clamp(speed,-(onRoad?tuning.maximumReverseSpeed:tuning.maximumReverseSpeed*.65),onRoad?tuning.maximumForwardSpeed:tuning.offRoadSpeed);
 const ratio=Math.min(1,absoluteSpeed/tuning.maximumForwardSpeed),maxSteer=tuning.steeringLowSpeed+(tuning.steeringHighSpeed-tuning.steeringLowSpeed)*ratio;
 const targetSteering=steeringInput*maxSteer,response=steeringInput?tuning.steeringResponse:tuning.steeringReturnResponse;
 const steering=exponentialStep(finite(current.steering),targetSteering,response,dt);
 const heading=wrapAngle(finite(current.heading)+speed/tuning.wheelbase*Math.tan(steering)*dt),direction=directionFromHeading(heading);
 return{x:finite(current.x)+direction.x*speed*dt,z:finite(current.z)+direction.z*speed*dt,heading,speed,steering,acceleration};
}
export function stepWalking(state,controls,dt,world,tuning=DEFAULT_PLAYER_TUNING){
 const safeDt=Math.max(0,finite(dt)),forward=clamp(finite(controls?.forward),-1,1),strafe=clamp(finite(controls?.strafe),-1,1),yaw=normalizeAngle(finite(controls?.viewYaw,finite(state.heading)));
 let dx=-Math.sin(yaw)*forward+Math.cos(yaw)*strafe,dz=-Math.cos(yaw)*forward-Math.sin(yaw)*strafe;const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
 const moving=(dx*dx+dz*dz)>.001;if(moving){const magnitude=Math.hypot(dx,dz);dx/=magnitude;dz/=magnitude;}const speedTarget=moving?(controls?.sprint?tuning.sprintSpeed:tuning.walkSpeed):0,response=moving?tuning.accelerationResponse:tuning.brakingResponse;
 const vx=exponentialStep(finite(state.vx),dx*speedTarget,response,safeDt),vz=exponentialStep(finite(state.vz),dz*speedTarget,response,safeDt);
 const previous={x:finite(state.x),y:finite(state.y),z:finite(state.z),heading:finite(state.heading)},next={...previous,x:previous.x+vx*safeDt,z:previous.z+vz*safeDt};
 if(world?.blocks?.(previous,next,{kind:'onFoot',dimensions:{length:.7,width:.7,height:1.8}})){const surface=world.sampleSurface(previous.x,previous.z,previous.y);return{...state,x:previous.x,y:finite(surface?.height,previous.y),z:previous.z,vx:0,vz:0,speed:0};}
 const surface=world?.sampleSurface?.(next.x,next.z,previous.y)??{height:previous.y},speed=Math.hypot(vx,vz),heading=speed>.08?dampAngle(previous.heading,headingFromDirection(vx,vz),tuning.rotationResponse,safeDt):previous.heading;
 return{...state,...next,y:finite(surface.height,previous.y),heading,vx,vz,speed};
}
export function stepVehicle(state,controls,dt,world,tuning=DEFAULT_VEHICLE_TUNING){
 const surface=world?.sampleSurface?.(finite(state.x),finite(state.z),finite(state.y))??{height:finite(state.y),onRoad:true};
 const contacts=sampleTruckWheelContacts({x:finite(state.x),y:finite(state.y),z:finite(state.z),heading:finite(state.heading)},tuning,world?.sampleSurface?.bind(world)||(()=>({height:finite(state.y),onRoad:Boolean(surface.onRoad)})));const next=stepVehicleKinematics(state,controls,dt,truckIsOnRoad(surface.onRoad,contacts.roadWheelCount),tuning);
 if(world?.blocks?.({x:finite(state.x),y:finite(state.y),z:finite(state.z),heading:finite(state.heading)},{...next,y:finite(surface.height,finite(state.y))},{kind:'vehicle',dimensions:tuning}))return{...state,speed:0,vx:0,vz:0,acceleration:0};
 const nextSurface=world?.sampleSurface?.(next.x,next.z,finite(surface.height))??surface;
 return{...state,...next,y:finite(nextSurface.height,finite(state.y)),vx:-Math.sin(next.heading)*next.speed,vz:-Math.cos(next.heading)*next.speed};
}
