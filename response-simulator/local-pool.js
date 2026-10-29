/* Station-local modeled response exercises. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_LOCAL_RESPONSE_POOL=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ISLAND=Object.freeze({city:'toronto',canonicalId:'toronto-osm-node-13854671025',address:'355 Lakeshore Avenue',lat:43.61702,lng:-79.37194,
  approachLat:43.61716140504847,approachLng:-79.37206435397376,way:'way/7779153',
  policy:'https://www.toronto.ca/explore-enjoy/toronto-island-ferries/commercial-emergency-vehicles/',supplement:'cities/toronto/emergency-access-roads.geojson',
  civicSource:'https://www.openstreetmap.org/node/13854671025',ref:'cities/toronto/call-provenance.json#toronto-osm-node-13854671025'});
 function islandAccess(data,call,original,base){
  const supplement=data?.roadSource?.emergencyAccessSupplement;
  const validAccess=a=>a?.method==='modeled-designated-emergency-road-approach'&&a.lat===ISLAND.approachLat&&a.lng===ISLAND.approachLng&&a.road==='Lakeshore Avenue'&&a.distanceMetres===18.6&&a.verifiedEntrance===false&&a.publicRoad===false&&a.designatedEmergencyRoad===true&&a.sourceAccessRestrictions?.motor_vehicle==='private'&&a.officialPolicyUrl===ISLAND.policy&&a.isolatedStreetException===true&&(a.sourceWayId==null||a.sourceWayId===ISLAND.way);
  return base.cityId===ISLAND.city&&((base.service==='fire'&&base.id==='fire-toronto-fire-335')||(base.service==='ems'&&base.id==='ems-toronto-ems-4173463'))&&supplement?.url===ISLAND.supplement&&supplement.officialPolicyUrl===ISLAND.policy&&supplement.wayCount===33&&Array.isArray(supplement.excludedWayIds)&&!supplement.excludedWayIds.includes(ISLAND.way)&&call.canonicalCallId===ISLAND.canonicalId&&call.addr===ISLAND.address&&call.lat===ISLAND.lat&&call.lng===ISLAND.lng&&call.geographicVerificationRef===ISLAND.ref&&call.sources?.includes(ISLAND.civicSource)&&original?.id===ISLAND.canonicalId&&original.cityId===ISLAND.city&&original.geographicVerificationRef===ISLAND.ref&&original.sources?.includes(ISLAND.civicSource)&&validAccess(call.routeAccess)&&validAccess(original.routeAccess);
 }
 function localPool(data,canonical,base){
  if(!data || data.id!==base?.cityId || data.routeResponses?.schemaVersion!==1 || !['fire','ems'].includes(base?.service) || !Array.isArray(data.routeCalls) || !Array.isArray(canonical))return [];
  const profile=data.routeResponses.bases?.find(p=>p.baseId===base.id&&p.service===base.service&&!p.unavailable);
  if(!profile||!Array.isArray(profile.callIds))return [];
  const allowed=new Set(profile.callIds),canon=new Map(canonical.map(c=>[c.id,c])),seen=new Set();
  const eligible=data.routeCalls.filter(call=>{
   if(!call?.id || seen.has(call.id)||!allowed.has(call.id)||call.routeBaseId!==base.id || (call.cityId!=null&&call.cityId!==base.cityId) || call.simulatedIncident!==true || call.trainingServices?.length!==1 || call.trainingServices[0]!==base.service || call.main!==(base.service==='ems'?'Medical':'Fire') || !Number.isFinite(call.lat) || !Number.isFinite(call.lng) || !call.incidentProfiles?.[base.service]?.sub)return false;
   seen.add(call.id);return true;
  });
  const civic=eligible.filter(call=>{
   const original=canon.get(call.canonicalCallId),access=call.routeAccess;
   return call.cityId===base.cityId&&call.locationKind==='sourced-address'&&original&&Number(original.lat)===Number(call.lat)&&Number(original.lng)===Number(call.lng)&&original.addr===call.addr&&Number.isFinite(access?.lat)&&Number.isFinite(access?.lng)&&(access.method==='modeled-public-road-approach'||islandAccess(data,call,original,base));
  }).map(call=>{
   const current=canon.get(call.canonicalCallId),display={};
   for(const key of ['name','recognitionDifficulty','difficultyReason','crossStreets','facilityType'])if(current[key]!==undefined)display[key]=Array.isArray(current[key])?[...current[key]]:current[key];
   return {...call,...display};
  });
  if(civic.length >= (data.routeResponses.minCallsPerBase||3))return civic;
  const intersections=eligible.filter(call=>{
   if(call.locationKind!=='mapped-intersection'||typeof call.name!=='string'||call.name!==call.addr||!/^.+\s&\s.+$/.test(call.name)||!Array.isArray(call.osmWays)||!Array.isArray(call.sources))return false;
   const ways=[...new Set(call.osmWays)];
   return ways.length>=2&&ways.length===call.osmWays.length&&ways.every(id=>/^way\/\d+$/.test(id)&&call.sources.includes(`https://www.openstreetmap.org/${id}`))&&Number.isFinite(call.routeQuality?.routeMetres)&&call.routeQuality.routeMetres>0;
  });
  return [...civic,...intersections];
 }
 return Object.freeze({localPool});
});
