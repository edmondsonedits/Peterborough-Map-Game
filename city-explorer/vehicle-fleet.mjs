import {TRUCK_TUNING} from './gameplay-systems.js';

const definition=(id,name,station,type,changes={})=>Object.freeze({id,name,station,type,tuning:Object.freeze({...TRUCK_TUNING,...changes})});
// Shared by single-player and multiplayer; sharper low-speed steering leaves high-speed grip unchanged.
const PUMPER_HANDLING=Object.freeze({steeringLowSpeed:0.66,steeringResponse:9,steeringReturnResponse:12});
export const FLEET_DEFINITIONS=Object.freeze([
  definition('pump-1','Pump 1',1,'pumper',PUMPER_HANDLING),
  definition('pump-2','Pump 2',2,'pumper',PUMPER_HANDLING),
  definition('pump-3','Pump 3',3,'pumper',PUMPER_HANDLING),
  definition('aerial','Aerial',1,'aerial',{length:12.8,width:2.55,height:4.28,wheelbase:6.55,maximumForwardSpeed:85/3.6,forwardAcceleration:2.8,maximumLateralAcceleration:3,offRoadSpeed:9.5,offRoadAccelerationScale:.34,offRoadGripScale:.48,steeringLowSpeed:.41,steeringHighSpeed:.12,chaseDistance:15,chaseHeight:4.5}),
  definition('medi','Medi',1,'medi',{length:6.5,width:2.35,height:2.7,wheelbase:3.8,trackWidth:1.95,maximumForwardSpeed:200/3.6,forwardAcceleration:6.2,maximumLateralAcceleration:5.4,offRoadSpeed:16.5,offRoadAccelerationScale:.68,offRoadGripScale:.46,serviceBrake:10,steeringLowSpeed:.62,steeringHighSpeed:.075,chaseDistance:8.5,chaseHeight:3}),
]);
export function createVehicleFleet(spawns){
  const vehicles=FLEET_DEFINITIONS.map(definition=>{
    const spawn={...spawns[definition.id]};
    if(![spawn.x,spawn.z,spawn.heading].every(Number.isFinite))throw Error(`Invalid spawn for ${definition.id}`);
    return {definition,spawn,state:{y:0,speed:0,acceleration:0,steering:0,pitch:0,roll:0,wheelRotation:0,...spawn},actor:null};
  });
  let activeId='pump-1';
  return {vehicles,get activeId(){return activeId;},get active(){return vehicles.find(v=>v.definition.id===activeId);},
    select(id){const entry=vehicles.find(v=>v.definition.id===id);if(!entry)throw Error(`Unknown vehicle: ${id}`);activeId=id;return entry;},
    reset(){for(const v of vehicles)Object.assign(v.state,{...v.spawn,speed:0,acceleration:0,steering:0,pitch:0,roll:0,wheelRotation:0});},
  };
}
