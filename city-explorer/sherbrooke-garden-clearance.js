// Small, cached clearance model for reviewed visual front gardens only.
import { SHERBROOKE_SOURCE } from './sherbrooke-source.js';
import { roadProfile } from './road-network.js?v=1.6.152';
import { landscapeClear, segmentDistance } from './sherbrooke-plan.js?v=1.6.152';
const cache = new WeakMap();
export function createGardenClearance(project, anchor) {
  if (typeof project !== 'function' || !Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.z)) throw new TypeError('Projected garden anchor required');
  if (!cache.has(project)) {
    const point = p => { const v=project(p[1],p[0]); return {x:v.x,z:v.y ?? v.z}; };
    cache.set(project, {
      rings: SHERBROOKE_SOURCE.buildings.map(b=>b.ring.map(point)),
      roads: SHERBROOKE_SOURCE.clearanceRoads.flatMap(r=>r.line.slice(1).map((p,i)=>({a:point(r.line[i]),b:point(p),width:roadProfile(r.tags)?.width||7}))),
    });
  }
  const all=cache.get(project);
  const plan={rings:all.rings.filter(r=>r.some(p=>Math.hypot(p.x-anchor.x,p.z-anchor.z)<55)),
    roads:all.roads.filter(r=>segmentDistance(anchor,r.a,r.b)<55)};
  return (x,z) => Number.isFinite(x)&&Number.isFinite(z)
    && landscapeClear({x,z},.08,plan)
    // Reserve the sidewalk as well as the road. This is visual ground only.
    && plan.roads.every(r=>segmentDistance({x,z},r.a,r.b)>r.width/2+2.8);
}
