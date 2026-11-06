import { sampleTruckWheelContacts, truckIsOnRoad } from '../road-wheel-contact.js?v=1.6.188';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const normalizeAngle=value=>((value+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;
export function exponentialStep(current,target,response,delta){const dt=Math.max(0,finite(delta));return current+(target-current)*(1-Math.exp(-Math.max(0,response)*dt));}
export function wrapAngle(angle){const twoPi=Math.PI*2;return((angle+Math.PI)%twoPi+twoPi)%twoPi-Math.PI;}
export function dampAngle(current,target,response,delta){return wrapAngle(current+wrapAngle(target-current)*(1-Math.exp(-response*Math.max(0,delta))));}
export function headingFromDirection(x,z){return Math.atan2(-x,-z);}
export function directionFromHeading(heading){return{x:-Math.sin(heading),z:-Math.cos(heading)};}
export const DEFAULT_PLAYER_TUNING=Object.freeze({
  walkSpeed: 1.6,
  runSpeed: 3.8,
  sprintSpeed: 5.9,
  accelerationResponse: 13,
  brakingResponse: 18,
  rotationResponse: 15,
  enterDistance: 6.5,
  cameraDistance: 8.6,
  cameraHeight: 1.55,
  cameraPositionResponse: 11,
  cameraTargetResponse: 16,
});
export const DEFAULT_VEHICLE_TUNING=Object.freeze({
  length: 10.4,
  width: 2.55,
  height: 3.25,
  wheelbase: 5.65,
  trackWidth: 2.12,
  maximumForwardSpeed: 27.5,
  maximumReverseSpeed: 7.2,
  forwardAcceleration: 3.85,
  reverseAcceleration: 2.65,
  serviceBrake: 8.8,
  throttleProgression: 1.2,
  maximumLateralAcceleration: 4.2,
  offRoadBrake: 4.8,
  offRoadGripScale: 0.62,
  rollingDrag: 0.56,
  aerodynamicDrag: 0.008,
  offRoadSpeed: 11.5,
  offRoadAccelerationScale: 0.48,
  steeringLowSpeed: 0.54,
  steeringHighSpeed: 0.15,
  steeringResponse: 7.5,
  steeringReturnResponse: 10,
  exitSpeed: 0.75,
  chaseDistance: 10.2,
  chaseHeight: 3.4,
  cameraPositionResponse: 7.8,
  cameraTargetResponse: 12,
});
export function stepVehicleKinematics(current, input, delta, onRoad = true, tuning = DEFAULT_VEHICLE_TUNING) {
  const state = current || {};
  const dt = Math.min(0.05, Math.max(0, Number(delta) || 0));
  if (dt === 0) {
    return {
      x: Number(state.x) || 0,
      z: Number(state.z) || 0,
      heading: Number(state.heading) || 0,
      speed: Number(state.speed) || 0,
      steering: Number(state.steering) || 0,
      acceleration: Number(state.acceleration) || 0,
    };
  }
  const throttle = Math.max(-1, Math.min(1, Number(input?.throttle) || 0));
  const steeringInput = Math.max(-1, Math.min(1, Number(input?.steering) || 0));
  const tuningValue = (key, fallback) => Number.isFinite(Number(tuning?.[key])) ? Number(tuning[key]) : fallback;
  const previousSpeed = Number(state.speed) || 0;
  const throttlePower = Math.sign(throttle) * Math.pow(Math.abs(throttle), Math.max(1, tuningValue('throttleProgression', 1.2)));
  const forwardAcceleration = tuningValue('forwardAcceleration', DEFAULT_VEHICLE_TUNING.forwardAcceleration);
  const reverseAcceleration = tuningValue('reverseAcceleration', DEFAULT_VEHICLE_TUNING.reverseAcceleration);
  const serviceBrake = tuningValue('serviceBrake', DEFAULT_VEHICLE_TUNING.serviceBrake);
  const rollingDrag = tuningValue('rollingDrag', DEFAULT_VEHICLE_TUNING.rollingDrag);
  const aerodynamicDrag = tuningValue('aerodynamicDrag', DEFAULT_VEHICLE_TUNING.aerodynamicDrag);
  const offRoadAccelerationScale = tuningValue('offRoadAccelerationScale', DEFAULT_VEHICLE_TUNING.offRoadAccelerationScale);
  const speedLimit = onRoad ? tuningValue('maximumForwardSpeed', DEFAULT_VEHICLE_TUNING.maximumForwardSpeed) : tuningValue('offRoadSpeed', DEFAULT_VEHICLE_TUNING.offRoadSpeed);
  const reverseLimit = tuningValue('maximumReverseSpeed', DEFAULT_VEHICLE_TUNING.maximumReverseSpeed) * (onRoad ? 1 : 0.65);
  let speed = previousSpeed;
  let acceleration = 0;

  if (Math.abs(throttlePower) > 0) {
    const requestedDirection = Math.sign(throttlePower);
    if (speed !== 0 && Math.sign(speed) !== requestedDirection) {
      // Spend only the time needed to brake to zero, then use any remainder to reverse.
      const brake = serviceBrake * Math.abs(throttlePower);
      const timeToZero = Math.abs(speed) / brake;
      if (timeToZero >= dt) {
        acceleration = -Math.sign(speed) * brake;
        speed += acceleration * dt;
        if (Math.sign(speed) !== Math.sign(previousSpeed)) speed = 0;
      } else {
        const reverseAccelerationScale = !onRoad ? offRoadAccelerationScale : 1;
        speed = requestedDirection * (dt - timeToZero) * (requestedDirection > 0 ? forwardAcceleration : reverseAcceleration) * Math.abs(throttlePower) * reverseAccelerationScale;
        acceleration = (speed - previousSpeed) / dt;
      }
    } else {
      acceleration = requestedDirection * (requestedDirection > 0 ? forwardAcceleration : reverseAcceleration) * Math.abs(throttlePower);
      if (!onRoad) acceleration *= offRoadAccelerationScale;
      speed += acceleration * dt;
    }
  } else if (Math.abs(speed) > 0) {
    acceleration = -Math.sign(speed) * (rollingDrag + aerodynamicDrag * speed * speed);
    speed += acceleration * dt;
    if (Math.sign(speed) !== Math.sign(previousSpeed)) speed = 0;
  }

  if (onRoad) {
    speed = Math.max(-reverseLimit, Math.min(speedLimit, speed));
  } else {
    // Keep a truck that is already over a rough-ground limit easing back toward it.
    // From below, limit the crossing step so power cannot push it past the cap.
    const offRoadBrake = tuningValue('offRoadBrake', DEFAULT_VEHICLE_TUNING.offRoadBrake);
    if (speed > speedLimit) {
      speed = previousSpeed > speedLimit
        ? Math.min(speed, Math.max(speedLimit, previousSpeed - offRoadBrake * dt))
        : speedLimit;
    } else if (speed < -reverseLimit) {
      speed = previousSpeed < -reverseLimit
        ? Math.max(speed, Math.min(-reverseLimit, previousSpeed + offRoadBrake * dt))
        : -reverseLimit;
    }
  }
  acceleration = (speed - previousSpeed) / dt;

  const maximumForwardSpeed = tuningValue('maximumForwardSpeed', DEFAULT_VEHICLE_TUNING.maximumForwardSpeed);
  const absoluteSpeed = Math.abs(speed);
  const speedRatio = Math.min(1, absoluteSpeed / maximumForwardSpeed);
  const steeringLowSpeed = tuningValue('steeringLowSpeed', DEFAULT_VEHICLE_TUNING.steeringLowSpeed);
  const steeringHighSpeed = tuningValue('steeringHighSpeed', DEFAULT_VEHICLE_TUNING.steeringHighSpeed);
  const maximumSteer = steeringLowSpeed + (steeringHighSpeed - steeringLowSpeed) * speedRatio;
  const wheelbase = Math.max(0.1, tuningValue('wheelbase', DEFAULT_VEHICLE_TUNING.wheelbase));
  const maxLateralAcceleration = tuningValue('maximumLateralAcceleration', DEFAULT_VEHICLE_TUNING.maximumLateralAcceleration) * (onRoad ? 1 : tuningValue('offRoadGripScale', DEFAULT_VEHICLE_TUNING.offRoadGripScale));
  const curvatureSteerLimit = absoluteSpeed > 0.1 ? Math.atan(maxLateralAcceleration * wheelbase / (absoluteSpeed * absoluteSpeed)) : maximumSteer;
  const safeSteerLimit = Math.min(maximumSteer, curvatureSteerLimit);
  const targetSteering = steeringInput * safeSteerLimit;
  const steeringResponse = steeringInput ? tuningValue('steeringResponse', DEFAULT_VEHICLE_TUNING.steeringResponse) : tuningValue('steeringReturnResponse', DEFAULT_VEHICLE_TUNING.steeringReturnResponse);
  const priorSteering = Number(state.steering) || 0;
  const steering = Math.max(-safeSteerLimit, Math.min(safeSteerLimit, exponentialStep(priorSteering, targetSteering, steeringResponse, dt)));
  const heading = wrapAngle((Number(state.heading) || 0) + speed / wheelbase * Math.tan(steering) * dt);
  const direction = directionFromHeading(heading);

  return {
    x: (Number(state.x) || 0) + direction.x * speed * dt,
    z: (Number(state.z) || 0) + direction.z * speed * dt,
    heading,
    speed,
    steering,
    acceleration,
  };
}
export function stepWalking(state,controls,dt,world,tuning=DEFAULT_PLAYER_TUNING){
 const safeDt=Math.max(0,finite(dt)),forward=clamp(finite(controls?.forward),-1,1),strafe=clamp(finite(controls?.strafe),-1,1),yaw=normalizeAngle(finite(controls?.viewYaw,finite(state.heading)));
 let dx=-Math.sin(yaw)*forward+Math.cos(yaw)*strafe,dz=-Math.cos(yaw)*forward-Math.sin(yaw)*strafe;const length=Math.hypot(dx,dz);if(length>1){dx/=length;dz/=length;}
 const moving=(dx*dx+dz*dz)>.001;if(moving){const magnitude=Math.hypot(dx,dz);dx/=magnitude;dz/=magnitude;}const speedTarget=moving?(controls?.sprint?tuning.sprintSpeed:controls?.run?tuning.runSpeed:tuning.walkSpeed):0,response=moving?tuning.accelerationResponse:tuning.brakingResponse;
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
