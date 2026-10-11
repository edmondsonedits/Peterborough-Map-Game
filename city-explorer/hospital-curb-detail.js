/** Preserve the legacy inferred 7cm cross-section, never classify a curb. */
export function hospitalInferredCurbTop(point, originalTop, finalPavement, field) {
  if(!field || !Number.isFinite(finalPavement))return originalTop;
  const weight=field.weight(point.x,point.y);
  return weight>0 ? originalTop+weight*(finalPavement+.07-originalTop) : originalTop;
}
/** Refine only segments intersecting the bounded pilot, including long crossings. */
export function hospitalCurbNeedsDetail(segment,field) {
  if(!field || segment.bridge || segment.stationDetail)return false;
  const dx=segment.b.x-segment.a.x,dz=segment.b.y-segment.a.y;
  const t=Math.max(0,Math.min(1,((field.center.x-segment.a.x)*dx+(field.center.z-segment.a.y)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(segment.a.x+t*dx-field.center.x,segment.a.y+t*dz-field.center.z)<field.radius;
}
