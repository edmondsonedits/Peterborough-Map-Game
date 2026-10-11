/** Audit eligibility only: no final mesh exists here, so emission is unverified. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { historicalPaintProfile } from '../city-explorer/historical-paint-profiles.js';
import { reviewedPaintTags } from '../city-explorer/street-paint.js';
import { roadProfile } from '../city-explorer/road-network.js';
const historicalIds = new Set(['250810393','250811912']);
const project = p => ({x:(p.lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(p.lat-44.3091)*110540});
export function evaluatePaintEligibility(ways) {
  const result={};
  for(const way of ways) {
    const id=String(way.id), tags=way.tags||{};
    if(historicalIds.has(id)) {
      const road=roadProfile(tags);
      if(!road || road.unpaved || road.tunnel || road.bridge || road.parkingAisle)continue;
      const geometry=way.geometry;
      // Never coerce null/string/NaN or filter malformed original vertices.
      if(!Array.isArray(geometry)||!geometry.every(p=>p && Number.isFinite(p.lat)&&Number.isFinite(p.lon)))continue;
      const profile=historicalPaintProfile(geometry.map(project),tags,id);
      if(!profile)continue;
      const {from,to,sourceLength}=profile.coverage;
      result[id]={evidence:profile.evidence,profileId:profile.evidence,paintEligibility:'eligible-not-render-verified',
        paintCoverage:{from,to,sourceLength,partial:from>0||to<sourceLength,
          longitudinalPartial:from>0||to<sourceLength,partialAppearance:true,
          limitations:id==='250810393'?['yellow taper only; white dividers, arrows and stop bars omitted','generalized hatch cadence; not surveyed positions']
            :['only 10–90 m of source way traced','white dividers, arrows and stop bars omitted','generalized dash cadence; not surveyed positions'],
          stationConvention:'canonical-app-projection-metres'},
        paintSupport:'not-evaluated',currentVerified:false,uncertaintyMetres:profile.uncertaintyMetres,
        registrationUncertainty:profile.registrationUncertainty};
    } else {
      const corrected=reviewedPaintTags(tags,id);
      if(corrected!==tags && corrected['sim:paint:evidence']) result[id]={
        evidence:corrected['sim:paint:evidence'],paintEligibility:'eligible-not-render-verified',
        paintCoverage:null,paintSupport:'not-evaluated',currentVerified:false};
    }
  }
  return result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const ways=JSON.parse(fs.readFileSync(0,'utf8'));
  if(!Array.isArray(ways))throw new TypeError('Expected original OSM ways array');
  process.stdout.write(JSON.stringify(evaluatePaintEligibility(ways)));
}
