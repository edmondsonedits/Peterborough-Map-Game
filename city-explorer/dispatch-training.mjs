// A repeatable practice scenario; this is never a live emergency dispatch.
export function createDispatchTraining(destination) {
  let current={status:'idle',station:null,startedAt:0,elapsedSeconds:0,distance:null};
  const state=()=>({...current,destination:{...destination}});
  return {state,
    start(station,now=performance.now()){current={status:'responding',station,startedAt:now,elapsedSeconds:0,distance:null};return state();},
    cancel(){current={...current,status:'idle'};return state();},
    update(pose,driving,now=performance.now()){
      if(current.status!=='responding'||!pose)return state();
      const distance=Math.hypot(pose.x-destination.x,pose.z-destination.z);
      current.distance=distance;current.elapsedSeconds=Math.max(0,(now-current.startedAt)/1000);
      if(driving&&Number.isFinite(distance)&&distance<=60&&Math.abs(pose.speed??Infinity)<.7)current.status='arrived';
      return state();
    },
  };
}

export function collectMapEntities({snapshot=null,localPose=null,vehicleId=null,fleet=[],player=null,driving=false}={}){
  if(snapshot){
    const players=[snapshot.player,...(snapshot.players||[])].filter(Boolean);
    const crews=new Map();
    for(const p of players.filter(p=>p.mode==='driving'&&p.vehicleId)){
      if(!crews.has(p.vehicleId))crews.set(p.vehicleId,new Map());
      crews.get(p.vehicleId).set(p.id,p.id===snapshot.player?.id?'You':p.name||'Firefighter');
    }
    return [
      ...(snapshot.vehicles||[]).map(v=>({id:`vehicle:${v.id}`,label:v.id.replaceAll('-',' ')+(crews.has(v.id)?` · ${[...crews.get(v.id).values()].join(', ')}`:''),kind:'truck',local:v.id===vehicleId,pose:v.id===vehicleId&&localPose?localPose:v.pose})),
      ...players.filter(p=>p.mode!=='driving').map(p=>({id:`player:${p.id}`,label:p.id===snapshot.player?.id?'You':p.name||'Firefighter',kind:'player',local:p.id===snapshot.player?.id,pose:p.id===snapshot.player?.id&&localPose?localPose:p.pose})),
    ];
  }
  return [...fleet.map(v=>({id:`vehicle:${v.definition.id}`,label:v.definition.name,kind:'truck',local:driving&&v.definition.id===vehicleId,pose:v.state})),
    ...(!driving&&player?[{id:'player:local',label:'You',kind:'player',local:true,pose:player}]:[])];
}

export function createMapMarkerOverlay({document,container,projectPoint}){
  const elements=new Map();
  return {update(markers,visible){
    container.hidden=!visible;if(!visible)return;
    const seen=new Set(),labels=[];
    for(const marker of [...markers].sort((a,b)=>Number(Boolean(b.local))-Number(Boolean(a.local)))){
      if(!marker.pose||!Number.isFinite(marker.pose.x)||!Number.isFinite(marker.pose.z))continue;
      seen.add(marker.id);
      let element=elements.get(marker.id);
      if(!element){element=document.createElement('div');element.className='tactical-marker';const icon=document.createElement('span');icon.className='tactical-marker-icon';const label=document.createElement('span');label.className='tactical-marker-label';element.append(icon,label);container.append(element);elements.set(marker.id,element);}
      const point=projectPoint(marker.pose);
      element.hidden=!point||point.x<0||point.x>1||point.y<0||point.y>1;
      if(element.hidden)continue;
      element.dataset.kind=marker.kind;element.dataset.local=String(Boolean(marker.local));
      element.style.left=`${point.x*100}%`;element.style.top=`${point.y*100}%`;
      element.firstChild.textContent=marker.kind==='call'?'!':marker.kind==='truck'?'▲':'●';
      element.firstChild.style.transform=marker.kind==='truck'?`rotate(${-(marker.pose.heading||0)}rad)`:'';
      if(element.lastChild.textContent!==marker.label)element.lastChild.textContent=marker.label;
      element.title=marker.label;
      // Keep every position icon, but suppress labels which would cover the local truck.
      element.lastChild.hidden=labels.some(p=>Math.abs(p.x-point.x)<.14&&Math.abs(p.y-point.y)<.035);
      if(!element.lastChild.hidden)labels.push(point);
    }
    for(const [id,element] of elements)if(!seen.has(id)){element.remove();elements.delete(id);}
  }};
}
