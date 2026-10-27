const copy=circle=>({center:{lat:circle.center.lat,lng:circle.center.lng},radiusMeters:circle.radiusMeters});
function center(value){
  if(!value||!Number.isFinite(value.lat)||Math.abs(value.lat)>90||!Number.isFinite(value.lng)||Math.abs(value.lng)>180)
    throw new Error('Choose a valid map position.');
  return {lat:value.lat,lng:value.lng};
}
export function createCircleDraft(original){
  const start=copy(original);center(start.center);
  if(!Number.isFinite(start.radiusMeters)||start.radiusMeters<=0||start.radiusMeters>20000)throw new Error('Original circle is unavailable.');
  let current=copy(start),enabled=false;
  return {
    value:()=>copy(current),
    enabled:()=>enabled,
    setEnabled(value){enabled=Boolean(value);},
    setCenter(value){current.center=center(value);},
    setRadius(value){
      if(!Number.isFinite(value)||value<5||value>2000)throw new Error('Use a radius from 5 to 2000 metres.');
      current.radiusMeters=value;
    },
    reset(){current=copy(start);},
    suggestion(){
      if(!enabled)return null;
      const out={};
      if(current.center.lat!==start.center.lat||current.center.lng!==start.center.lng)out.center={...current.center};
      if(current.radiusMeters!==start.radiusMeters)out.radiusMeters=current.radiusMeters;
      return Object.keys(out).length?out:null;
    },
  };
}
