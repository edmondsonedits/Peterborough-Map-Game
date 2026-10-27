/* A result snapshot is independent of map panning, subsequent questions and edits. */
(() => {
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  function captureGeoResult({resultId,target,guess,distance,outcome,city,service,difficulty,base,version,datasetRevision}) {
    if(!target)return null;
    const cityId=city?.id||'peterborough';
    const checked=guess?(Array.isArray(guess)?{lat:guess[0],lng:guess[1]}:{lat:guess.lat,lng:guess.lng}):null;
    return freeze({
      resultId,
      callId:String(target.id||target.canonicalCallId||`unidentified@${target.lat},${target.lng}`),
      city:cityId,service,mode:'geo',version:version||'unknown',
      datasetId:`${cityId}:${target.facilityType==='long-term-care'?'priority-care-homes':'geo-locations'}`,
      datasetRevision:datasetRevision===undefined?(city?.locationsRevision||null):datasetRevision,
      question:{name:String(target.name||''),address:String(target.addr||''),
        crossStreets:Array.isArray(target.crossStreets)?target.crossStreets.slice(0,4).map(String):null,
        difficulty:target.recognitionDifficulty||difficulty||null},
      originalCircle:{center:{lat:target.lat,lng:target.lng},radiusMeters:target.radius},
      guess:checked,distanceMeters:Number.isFinite(distance)?distance:null,result:outcome,
      baseId:base?.id==null?null:String(base.id),
    });
  }
  const api=Object.freeze({captureGeoResult});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.PTBO_GEO_REPORT_CONTEXT=api;
})();
