/** Lift shared road lattice nodes just enough to clear every rendered terrain plane. */
export function terrainEnvelopeNodes({field,terrainHeight,grid,clearance}) {
 if(!field?.sample||typeof terrainHeight!=='function'||!Number.isFinite(clearance)
  ||!Number.isInteger(grid?.segments)||grid.segments<1||!Number.isFinite(grid.size)||grid.size<=0
  ||![grid.minX,grid.minZ,field.spacing].every(Number.isFinite)||field.spacing<=0)throw new TypeError('Invalid terrain envelope');
 const spacing=field.spacing,step=grid.size/grid.segments,cells=new Map();
 const stats={checkedCells:0,liftedCells:0,maximumLift:0};
 const cellLift=(ix,iz)=>{
  const key=`${ix}:${iz}`;if(cells.has(key))return cells.get(key);
  const x0=ix*spacing,z0=iz*spacing,x1=x0+spacing,z1=z0+spacing,diagonal=x0+z0+spacing;
  const gx=Math.floor((x0-grid.minX)/step),gz=Math.floor((z0-grid.minZ)/step);
  const gx1=Math.floor((x1-grid.minX)/step),gz1=Math.floor((z1-grid.minZ)/step);
  stats.checkedCells++;
  // Within one terrain triangle, its linear floor is already bounded by the road nodes.
  if(gx===gx1&&gz===gz1&&gx>=0&&gz>=0&&gx<grid.segments&&gz<grid.segments){
   const sum0=(x0-grid.minX-gx*step)+(z0-grid.minZ-gz*step);
   if(sum0>=step||sum0+2*spacing<=step){cells.set(key,0);return 0;}
  }
  const xs=[x0,x1],zs=[z0,z1];
  for(let i=Math.max(0,Math.ceil((x0-grid.minX)/step));i<=Math.min(grid.segments,Math.floor((x1-grid.minX)/step));i++)xs.push(grid.minX+i*step);
  for(let i=Math.max(0,Math.ceil((z0-grid.minZ)/step));i<=Math.min(grid.segments,Math.floor((z1-grid.minZ)/step));i++)zs.push(grid.minZ+i*step);
  let lift=0;
  const probe=(x,z)=>{
   if(x<x0-1e-8||x>x1+1e-8||z<z0-1e-8||z>z1+1e-8)return;
   const deficit=terrainHeight(x,z)+clearance-field.sample(x,z);
   if(!Number.isFinite(deficit))throw new RangeError('Non-finite terrain envelope height');
   lift=Math.max(lift,deficit);
  };
  // The difference of the two piecewise planes reaches its maximum at a vertex
  // of their overlay: grid corners or intersections with either triangulation.
  for(const x of xs)for(const z of zs)probe(x,z);
  for(const x of xs)probe(x,diagonal-x);
  for(const z of zs)probe(diagonal-z,z);
  for(let tx=Math.max(0,gx);tx<=Math.min(grid.segments-1,gx1);tx++)for(let tz=Math.max(0,gz);tz<=Math.min(grid.segments-1,gz1);tz++){
   const ax=grid.minX+tx*step,az=grid.minZ+tz*step,d=ax+az+step;
   const onEdge=(x,z)=>{if(x>=ax-1e-8&&x<=ax+step+1e-8&&z>=az-1e-8&&z<=az+step+1e-8)probe(x,z);};
   for(const x of xs)onEdge(x,d-x);
   for(const z of zs)onEdge(d-z,z);
  }
  lift=lift>1e-8?lift+0.0001:0;
  cells.set(key,lift);if(lift){stats.liftedCells++;stats.maximumLift=Math.max(stats.maximumLift,lift);}return lift;
 };
 return {stats,heightAt(x,z){
  const ix=Math.round(x/spacing),iz=Math.round(z/spacing);
  const lift=Math.max(cellLift(ix-1,iz-1),cellLift(ix,iz-1),cellLift(ix-1,iz),cellLift(ix,iz));
  // Every corner of a cell receives at least that cell's required lift. Shared
  // nodes keep both road halves and adjacent road sources exactly continuous.
  return field.sample(x,z)+lift;
 }};
}
