const WORLD_VERSION=/^[a-f0-9]{24}$/;
const ROAD_PACK_BUILD=/^[a-f0-9]{20}$/;

export function validateStationHeightRecord(value,{worldVersion,roadPackBuildId}={}){
 if(!value||value.schemaVersion!==1||!WORLD_VERSION.test(value.worldVersion||'')||!ROAD_PACK_BUILD.test(value.roadPackBuildId||''))throw new TypeError('Invalid station height record identity');
 if(worldVersion!==undefined&&value.worldVersion!==worldVersion)throw new Error('Station height record world version mismatch');
 if(roadPackBuildId!==undefined&&value.roadPackBuildId!==roadPackBuildId)throw new Error('Station height record road pack mismatch');
 if(!Array.isArray(value.stations)||value.stations.length!==2)throw new TypeError('Station height record must include stations 1 and 2');
 const stations={};
 for(const station of value.stations){if(!station||![1,2].includes(station.number)||stations[station.number])throw new TypeError('Invalid station height record station numbers');if(!Number.isFinite(station.datum)||!Number.isFinite(station.groundMin)||station.groundMin>station.datum)throw new TypeError('Station height record values must be finite and ordered');stations[station.number]=Object.freeze({number:station.number,datum:station.datum,groundMin:station.groundMin});}
 if(!stations[1]||!stations[2])throw new TypeError('Station height record must include stations 1 and 2');
 return Object.freeze({schemaVersion:1,worldVersion:value.worldVersion,roadPackBuildId:value.roadPackBuildId,stations});
}