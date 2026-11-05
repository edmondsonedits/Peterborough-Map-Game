import {configureVehiclePresentation} from './vehicle-presentation.js';
import {createVehicleFleet} from './vehicle-fleet.mjs';
import {installFleetAsset} from './fleet-assets.js';
import {vehicleFootprint,polygonsOverlap,sweepVehicle,segmentBoxHit} from './apparatus-collision.mjs';
import {createAerialState} from './aerial-controller.mjs';
export function createFleetRuntime({THREE,group,createTruck,spawns,initialId,prepare,activate,changed=()=>{},environment=null,canSelect=()=>null,installModel=installFleetAsset}){
  const fleet=createVehicleFleet(spawns);let request=0,busy=false,error='';
  for(const entry of fleet.vehicles){
    const root=createTruck(THREE);entry.actor=root;root.name=entry.definition.name;root.userData.vehicleId=entry.definition.id;
    if(entry.definition.type!=='pumper')installModel(root,createTruck,entry.definition.type);
    root.userData.truck.ready=Promise.resolve(root.userData.truck.ready).then(status=>{
      const metadata=root.userData.truck.metadata;
      if(metadata?.dimensions){
        const dimensions=Object.fromEntries(['length','width','height'].filter(k=>Number.isFinite(metadata.dimensions[k])).map(k=>[k,metadata.dimensions[k]]));
        entry.definition={...entry.definition,tuning:{...entry.definition.tuning,...dimensions,wheelbase:metadata.wheelbase||entry.definition.tuning.wheelbase}};
      }
      configureVehiclePresentation(THREE,entry,environment);
      return status;
    });
    root.position.set(entry.state.x,entry.state.y,entry.state.z);root.rotation.y=entry.state.heading;group.add(root);
    if(entry.definition.type==='aerial')entry.aerial=createAerialState();
  }
  fleet.select(initialId);activate(fleet.active);
  function park(){const active=fleet.active;active.state.speed=0;active.state.acceleration=0;active.state.steering=0;if(active.aerial){active.aerial.flow=false;active.aerial.stopped=true;}}
  async function select(id){
    const entry=fleet.vehicles.find(v=>v.definition.id===id);if(!entry)return {ok:false,error:'Unknown vehicle'};
    const reason=canSelect(entry);if(reason)return {ok:false,error:reason};
    const token=++request;park();busy=true;error='';changed();
    try{
      await prepare(entry,()=>token===request);
      if(token!==request)return {ok:false,cancelled:true};
      fleet.select(id);activate(entry);return {ok:true,vehicleId:id};
    }catch(e){if(token===request)error=e.message;return {ok:false,error:e.message};}
    finally{if(token===request){busy=false;changed();}}
  }
  function blocked(point,dimensions,excludeId=fleet.activeId){
    const polygon=vehicleFootprint(point,dimensions),y=point.y??0;
    const body={min:{x:Math.min(...polygon.map(p=>p.x)),y,z:Math.min(...polygon.map(p=>p.z))},max:{x:Math.max(...polygon.map(p=>p.x)),y:y+(dimensions.height||1.8),z:Math.max(...polygon.map(p=>p.z))}};
    return fleet.vehicles.some(v=>{
      if(v.definition.id===excludeId)return false;
      const size={...v.definition.tuning,width:v.definition.tuning.width+(v.aerial?.beams||0)*2*(v.actor.userData.truck.metadata?.stabilizerBeamTravel??1.6)};
      if(Math.abs(y-v.state.y)<4&&polygonsOverlap(polygon,vehicleFootprint(v.state,size)))return true;
      return (v.actor.userData.aerialSegments||[]).some(([a,b,r])=>segmentBoxHit(a,b,body,r)!==null);
    });
  }
  function sweep(a,b,dimensions){return sweepVehicle(a,b,dimensions,p=>blocked({...p,y:b.y??a.y},dimensions));}
  function nearest(point,max=6.5){return fleet.vehicles.map(v=>({entry:v,distance:Math.hypot(point.x-v.state.x,point.z-v.state.z)})).filter(v=>v.distance<=max).sort((a,b)=>a.distance-b.distance)[0]?.entry;}
  function updateParked(){for(const entry of fleet.vehicles){if(entry===fleet.active)continue;entry.actor.position.set(entry.state.x,entry.state.y,entry.state.z);entry.actor.rotation.set(entry.state.pitch,entry.state.heading,entry.state.roll,'YXZ');}}
  return {fleet,select,park,blocked,sweep,nearest,updateParked,get busy(){return busy;},get error(){return error;},snapshot:()=>fleet.vehicles.map(v=>({id:v.definition.id,name:v.definition.name,station:v.definition.station,type:v.definition.type,...v.state,assetStatus:v.actor.userData.truck.assetStatus,presentation:v.actor.userData.truck.presentation?.diagnostics,aerial:v.aerial?{...v.aerial}:undefined}))};
}
