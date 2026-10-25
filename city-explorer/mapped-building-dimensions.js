import {parseMeters,deterministicNumber,stableHash} from './feature-utils.js';
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
// The same mapped wall dimensions drive the scene and offline sign clearance.
export function mappedBuildingDimensions(tags={},featureId='',landmarkHeight){
  const explicitHeight = parseMeters(tags.height);
  const landmarkBaseHeight = Number(landmarkHeight);
  const levels = Number.parseFloat(tags['building:levels']);
  const roofHeightTag = parseMeters(tags['roof:height']);
  const minHeightTag = parseMeters(tags.min_height);
  const minLevels = Number.parseFloat(tags['building:min_level']);
  const type = String(tags.building || tags['building:part'] || '').toLowerCase();
  const use = `${type} ${tags.leisure || ''} ${tags.amenity || ''}`.toLowerCase();
  let height;
  if (Number.isFinite(landmarkBaseHeight)) height = landmarkBaseHeight;
  else if (Number.isFinite(explicitHeight)) height = explicitHeight;
  // Mall storeys need commercial floor clearance; explicit heights and reviewed profiles still take precedence.
  else if (Number.isFinite(levels)) height = levels * (tags.shop === 'mall' ? 4.8 : 3.15);
  else if (/church|cathedral|mosque|temple/.test(type)) height = 18 + deterministicNumber(featureId, 0, 8);
  else if (/apartments|hotel|office|commercial|hospital|school|university/.test(type)) height = deterministicNumber(featureId, 11, 23);
  else if (/industrial|warehouse|retail|supermarket/.test(type)) height = deterministicNumber(featureId, 7, 12);
  else if (/garage|shed|carport/.test(type)) height = deterministicNumber(featureId, 2.7, 4.2);
  // OSM carries height metadata for only a minority of local footprints. Keep
  // inferred detached-building massing deliberately conservative rather than
  // making an unsupported claim of precise height.
  else height = deterministicNumber(featureId, 6.4, 8.8);

  const minHeight = Number.isFinite(minHeightTag) ? minHeightTag : Number.isFinite(minLevels) ? minLevels * 3.15 : 0;
  const taggedRoofShape = String(tags['roof:shape'] || '').toLowerCase();
  const pitchedCandidate = tags.shop !== 'mall' && !/industrial|warehouse|retail|supermarket|commercial|office|apartments|hospital|school|university|garage|shed|carport|ice_rink|sports_centre|stadium/.test(use)
    && !/flat|skillion|sawtooth/.test(taggedRoofShape);
  // Detached homes dominate Peterborough's residential fabric. OSM rarely
  // records roof height, so infer a conservative, stable pitch while keeping
  // every source footprint and all explicit tags authoritative.
  const inferredRoofHeight = pitchedCandidate ? deterministicNumber(`${featureId}:roof`, 1.25, 2.35) : 0;
  const roofHeight = Number.isFinite(roofHeightTag) ? roofHeightTag : inferredRoofHeight;
  const roofShape = taggedRoofShape || (pitchedCandidate
    ? (stableHash(`${featureId}:roof-shape`) % 5 === 0 ? 'hipped' : 'gabled')
    : 'flat');
  return {
    height: clamp(Math.max(2.6, height - roofHeight - minHeight), 2.6, 115),
    minHeight: clamp(minHeight, 0, 60),
    roofHeight: clamp(roofHeight, 0, 18),
    roofShape,
  };
}
