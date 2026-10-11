import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RenderedPavementIndex } from '../city-explorer/official-road-surfaces.js';
const mod = await import('../city-explorer/historical-paint-profiles.js').catch(() => ({}));
const osm = JSON.parse(readFileSync(new URL('../city-explorer/data/peterborough-osm.json',import.meta.url))).elements;
const fixture = id => osm.find(e => e.type==='way' && e.id===id);
const project = ({lat,lon}) => ({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),y:-(lat-44.3091)*110540});
const profile = (id, tags, points) => { const w=fixture(id); return mod.historicalPaintProfile(points??w.geometry.map(project),tags??w.tags,String(id)); };
test('whole source historical API accepts canonical and reverse geometry, rejecting altered and partial ways', () => {
 assert.equal(typeof mod.historicalPaintProfile,'function');
 for(const id of [250810393,250811912]) {
  const w=fixture(id), pts=w.geometry.map(project), p=profile(id);
  assert.ok(p.strokes.length>1); assert.equal(p.currentVerified,false);
  const reversed=profile(id,w.tags,[...pts].reverse()); assert.equal(reversed.sourceReversed,true);assert.deepEqual({...reversed,sourceReversed:false},p);
  const changed=pts.map(p=>({...p}));changed[0].x+=.01;
  assert.equal(profile(id,w.tags,changed),null);
  assert.equal(profile(id,w.tags,[pts[0],pts.at(-1),pts[0]]),null);
  assert.equal(profile(id,w.tags,[pts[0],{x:NaN,y:0}]),null);
  assert.ok(mod.historicalPaintProfile(pts,w.tags,String(id)+':0'));
 }
});
test('source tag semantics remain conservative, including conditional bridge and lane tags', () => {
 for(const id of [250810393,250811912]) {
  const tags=fixture(id).tags;
  for(const delta of [{lanes:'3'},{'lanes:both_ways':'1'},{'lanes:forward':'1'},{'turn:lanes:forward':'through'}, {'turn:lanes:conditional':'left @ (Mo)'},{bridge:'yes'},{'bridge:conditional':'yes @ (wet)'},{tunnel:'yes'},{'tunnel:conditional':'no @ (Mo)'},{oneway:'reversible'},{'oneway:conditional':'no @ (Mo)'},{lane_markings:'no'},{highway:'service'}]) assert.equal(profile(id,{...tags,...delta}),null,JSON.stringify(delta));
  assert.ok(profile(id,{...tags,bridge:'no',tunnel:'no'}));
 }
 const t={...fixture(250810393).tags};delete t['lanes:forward'];delete t['lanes:backward'];delete t['turn:lanes:forward'];delete t['turn:lanes:backward'];assert.ok(profile(250810393,t));
});
function rectangle(index,x0,z0,x1,z1,layer='road_surfaces') {
 index.addTriangle(x0,10,z0,x1,10,z0,x1,10,z1,{layer});index.addTriangle(x0,10,z0,x1,10,z1,x0,10,z1,{layer});
}
test('strict whole stroke draping uses real final road triangles and rejects parking, bridges, holes and missing edge support', () => {
 assert.equal(typeof mod.drapeHistoricalStroke,'function');
 const stroke={points:[{x:0,z:0},{x:2,z:0},{x:3,z:1}],width:.13,kind:'solid'};
 const idx=new RenderedPavementIndex();rectangle(idx,-1,-1,4,2);
 const v=mod.drapeHistoricalStroke(stroke,idx);assert.ok(v.length>0);assert.ok(v.every(Number.isFinite));
 for(let i=0;i<v.length;i+=3) {assert.ok(Math.abs(v[i+1]-10.008)<.000001);assert.equal(idx.sample(v[i],v[i+2]).layer,'road_surfaces');}
 for(const layer of ['parking_surfaces','bridges','unknown']) {const other=new RenderedPavementIndex();rectangle(other,-1,-1,4,2,layer);assert.deepEqual(mod.drapeHistoricalStroke(stroke,other),[]);}
 const narrow=new RenderedPavementIndex();rectangle(narrow,-1,-.02,4,.02);assert.deepEqual(mod.drapeHistoricalStroke(stroke,narrow),[]);
 const gap=new RenderedPavementIndex();rectangle(gap,-1,-1,.9,2);rectangle(gap,1.15,-1,4,2);assert.deepEqual(mod.drapeHistoricalStroke(stroke,gap),[]);
});
test('profile footprint support is checked at all emitted vertices and omission never counts as review', () => {
 for(const id of [250810393,250811912]) {
  const p=profile(id), idx=new RenderedPavementIndex();rectangle(idx,-3000,0,-1500,1500);
  const result=mod.renderHistoricalPaintProfile(p,idx);assert.equal(result.reviewed,true);assert.ok(result.positions.length>0);
  for(let i=0;i<result.positions.length;i+=3) assert.ok(idx.sample(result.positions[i],result.positions[i+2],null,{includeParking:false,includeBridges:false}));
  assert.equal(mod.renderHistoricalPaintProfile(p,new RenderedPavementIndex()).reviewed,false);
 }
});
test('full geometry with loader suffix is accepted, station exclusion trims all small endpoint pieces', () => {
 const w=fixture(250810393),pts=w.geometry.map(project);
 assert.ok(mod.historicalPaintProfile(pts,w.tags,'way/250810393:0'));
 const p=profile(250810393),idx=new RenderedPavementIndex();rectangle(idx,-3000,0,-1500,1500);
 const rendered=mod.renderHistoricalPaintProfile(p,idx,{excludedStationIntervals:[[0,5],[p.coverage.to-5,p.coverage.to]]});
 assert.ok(rendered.positions.length>0);
 for(const s of rendered.strokes) {assert.ok(s.from>=5);assert.ok(s.to<=p.coverage.to-5);}
 assert.equal(mod.renderHistoricalPaintProfile(p,idx,{excludedStationIntervals:[[0,p.coverage.to]]}).reviewed,false);
});
test('Hospital source corners share exact miter joins with no per-segment gaps', () => {
 const p=profile(250811912),w=fixture(250811912),pts=w.geometry.map(project);
 const chain=[0];for(let i=1;i<pts.length;i++)chain.push(chain.at(-1)+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
 const idx=new RenderedPavementIndex();rectangle(idx,-3000,0,-1500,1500);
 for(const s of p.strokes.filter(s=>s.kind==='solid')) {
  for(const c of chain.filter(c=>c>10 && c<90)) assert.equal(s.points.filter(p=>Math.abs(p.station-c)<1e-8).length,1);
  const v=mod.drapeHistoricalStroke(s,idx);
  // Every consecutive pair of strip cells shares both endpoint vertices exactly.
  for(let i=18;i<v.length;i+=18) {
   assert.deepEqual(v.slice(i,i+3),v.slice(i-3,i));
   assert.deepEqual(v.slice(i+3,i+6),v.slice(i-12,i-9));
  }
 }
});
test('measured profile coordinates and widths are independent of inferred lane width', () => {
 const m=profile(250810393),h=profile(250811912);
 assert.equal(m.uncertaintyMetres,.6);assert.equal(h.uncertaintyMetres,.35);
 assert.equal(h.coverage.from,10);assert.equal(h.coverage.to,90);
 assert.ok(Math.abs(m.strokes[0].points.at(-1).station/m.coverage.sourceLength-14.83/46.546)<1e-12);
 assert.ok([...m.strokes,...h.strokes].every(s=>s.color==='yellow' && s.width===.13));
 assert.deepEqual(profile(250811912,{...fixture(250811912).tags,width:'50'}),h);
 for(const malformed of [null,{}, {points:[{x:0,z:0},{x:0,z:0}],width:.13},{points:[{x:0,z:0},{x:1,z:0}],width:NaN}]) assert.deepEqual(mod.drapeHistoricalStroke(malformed,new RenderedPavementIndex()),[]);
});
test('every original vertex is checked, including Hospital interior vertices and extra malformed entries', () => {
 for(const id of [250810393,250811912]) {
  const w=fixture(id),pts=w.geometry.map(project);
  for(let i=0;i<pts.length;i++) {
   const changed=pts.map(p=>({...p}));changed[i].y+=.001;
   assert.equal(mod.historicalPaintProfile(changed,w.tags,`way/${id}:0`),null);
  }
  assert.equal(mod.historicalPaintProfile([...pts,{x:NaN,y:NaN}],w.tags,id),null);
  assert.equal(mod.historicalPaintProfile(pts.slice(1),w.tags,id),null);
 }
});
test('canonical offsets reproduce measured values rather than width-scaled generic lane borders', () => {
 for(const id of [250810393,250811912]) {
  const p=profile(id),points=fixture(id).geometry.map(project);
  const chains=[0];for(let i=1;i<points.length;i++)chains.push(chains.at(-1)+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
  const offset=point=>{let i=0;while(i<points.length-2 && chains[i+1]<point.station)i++;
   const a=points[i],b=points[i+1],d=chains[i+1]-chains[i],t=(point.station-chains[i])/d;
   const x=a.x+(b.x-a.x)*t,z=a.y+(b.y-a.y)*t;
   return (point.x-x)*(b.y-a.y)/d-(point.z-z)*(b.x-a.x)/d;};
  const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
  if(id===250810393) {
   close(offset(p.strokes[0].points[0]),2.1);close(offset(p.strokes[0].points.at(-1)),1.78);
   close(offset(p.strokes[1].points.at(-1)),1.32);close(offset(p.strokes[2].points.at(-1)),3.32);
  } else {
   const solids=p.strokes.filter(s=>s.kind==='solid');
   close(offset(solids[0].points[0]),-2.52);close(offset(solids[1].points[0]),2.92);
   close(offset(solids[0].points.at(-1)),-1.62);close(offset(solids[1].points.at(-1)),1.92);
  }
 }
});
test('Float32 paint triangle interiors follow actual piecewise road triangles, not only supported corners', () => {
 const idx=new RenderedPavementIndex();
 for(const [za,ha,zb,hb] of [[-.2,10,0,10.02],[0,10.02,.2,10]]) {
  idx.addTriangle(-3000,ha,za,-2000,ha,za,-2000,hb,zb,{layer:'road_surfaces'});
  idx.addTriangle(-3000,ha,za,-2000,hb,zb,-3000,hb,zb,{layer:'road_surfaces'});
 }
 const vertices=Float32Array.from(mod.drapeHistoricalStroke({points:[{x:-2501,z:0},{x:-2499,z:0}],width:.13},idx));
 assert.ok(vertices.length>0,'supported ridged pavement must retain paint');
 for(let i=0;i<vertices.length;i+=9) {
  const a=Array.from(vertices.slice(i,i+3)),b=Array.from(vertices.slice(i+3,i+6)),c=Array.from(vertices.slice(i+6,i+9));
  const blend=(u,v,w)=>a.map((x,k)=>x*u+b[k]*v+c[k]*w);
  for(const p of [a,b,c,blend(.5,.5,0),blend(0,.5,.5),blend(.5,0,.5),blend(1/3,1/3,1/3)]) {
   const hit=idx.sample(p[0],p[2],p[1],{includeParking:false,includeBridges:false});assert.ok(hit);
   assert.ok(Math.abs(p[1]-hit.height-.008)<=.0022,`lift residual ${p[1]-hit.height-.008}`);
  }
 }
});
test('wholly absent pavement aborts the full stroke without recursive missing-region queries', () => {
 const index=new RenderedPavementIndex();let queries=0;const sample=index.sample.bind(index);
 index.sample=(...args)=>{queries++;return sample(...args);};
 assert.deepEqual(mod.drapeHistoricalStroke({points:[{x:0,z:0},{x:100,z:0}],width:.13},index),[]);
 assert.equal(queries,1);
});
