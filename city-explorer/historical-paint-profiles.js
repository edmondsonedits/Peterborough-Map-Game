/** Newly rebuilt historical interpretation, not current field verification.
 * Whole original projected source geometry is mandatory. See evidence README.
 * All offsets are metres, positive to driver-left in canonical source order.
 */
const SOURCE = {
  '250810393': { name:'Medical Drive', highway:'secondary', lanes:'4',
    geometry:[[44.3015142,-78.3450836],[44.3019097,-78.3452732]] },
  '250811912': { name:'Hospital Drive', highway:'tertiary', lanes:'2',
    geometry:[[44.300846,-78.345605],[44.3008671,-78.3456972],[44.3008913,-78.345803],
      [44.30095,-78.3460594],[44.3009894,-78.3462879],[44.3010518,-78.3466501],[44.3011523,-78.3470192]] },
};
const project = ([lat,lon]) => ({x:(lon+78.3197)*111320*Math.cos(44.3091*Math.PI/180),z:-(lat-44.3091)*110540});
const distance = (a,b) => Math.hypot(b.x-a.x,b.z-a.z);
const lerp = (a,b,t) => ({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,...(Number.isFinite(a.station)&&Number.isFinite(b.station)?{station:a.station+(b.station-a.station)*t}:{})});
const normal = (a,b) => {const d=distance(a,b);return {x:(b.z-a.z)/d,z:-(b.x-a.x)/d};};
const off = (p,n,d) => ({x:p.x+n.x*d,z:p.z+n.z*d});
const no = value => ['', 'no','0','false'].includes(String(value??'').trim().toLowerCase());
function validTags(tags, source, id) {
  if (!tags || tags.name!==source.name || tags.highway!==source.highway || String(tags.lanes)!==source.lanes
    || !no(tags.oneway) || !no(tags.bridge) || !no(tags.tunnel)
    || tags.junction==='roundabout' || ['no','none','0','false'].includes(String(tags.lane_markings).toLowerCase())) return false;
  const allowed=id==='250810393'?{'lanes:forward':'2','lanes:backward':'2','turn:lanes:forward':'left|none','turn:lanes:backward':'left|none'}:{};
  return !Object.keys(tags).some(key => {
    if (/^(oneway|bridge|tunnel):/.test(key)) return true;
    if (/^(lanes:|turn:|change:lanes|placement|divider|lane_markings:)/.test(key)) return !(key in allowed && String(tags[key])===allowed[key]);
    return false;
  });
}
function lineGeometry(points) {
  const chain=[0];for(let i=1;i<points.length;i++) chain.push(chain.at(-1)+distance(points[i-1],points[i]));
  const normals=points.slice(1).map((p,i)=>normal(points[i],p));
  function at(s,offset=0) {
    const corner=chain.findIndex(c=>Math.abs(c-s)<1e-8);
    if(corner>0 && corner<points.length-1) {
      const a=normals[corner-1],b=normals[corner],denom=1+a.x*b.x+a.z*b.z;
      return {...off(points[corner],{x:(a.x+b.x)/denom,z:(a.z+b.z)/denom},offset),station:s};
    }
    let i=0;while(i<chain.length-2 && chain[i+1]<s) i++;
    return {...off(lerp(points[i],points[i+1],(s-chain[i])/(chain[i+1]-chain[i])),normals[i],offset),station:s};
  }
  return {chain,at,length:chain.at(-1)};
}
function trace(line,stations,column,delta=0,from=stations[0][0],to=stations.at(-1)[0]) {
  const offset=s=>{let i=0;while(i<stations.length-2 && stations[i+1][0]<s)i++;
    const a=stations[i],b=stations[i+1];return a[column]+(b[column]-a[column])*(s-a[0])/(b[0]-a[0])+delta;};
  const cuts=[from,to,...stations.map(s=>s[0]),...line.chain].filter(s=>s>=from && s<=to);
  return [...new Set(cuts)].sort((a,b)=>a-b).map(s=>line.at(s,offset(s)));
}
const stroke=(points,kind='solid')=>({points,width:.13,kind,color:'yellow'});
export function historicalPaintProfile(sourcePoints, tags, lineId) {
  const id=/^(?:way\/)?(\d+)(?::\d+)?$/.exec(String(lineId))?.[1],source=SOURCE[id];
  if(!source || !validTags(tags,source,id) || !Array.isArray(sourcePoints) || sourcePoints.length!==source.geometry.length) return null;
  const points=source.geometry.map(project);
  const same=(p,q)=>p && [p.x,p.y].every(Number.isFinite) && Math.abs(p.x-q.x)<=1e-5 && Math.abs(p.y-q.z)<=1e-5;
  if(!sourcePoints.every((p,i)=>same(p,points[i])) && !sourcePoints.every((p,i)=>same(p,points[points.length-1-i]))) return null;
  const line=lineGeometry(points),strokes=[];
  let from=0,to=line.length,uncertaintyMetres=.6;
  if(id==='250810393') {
    const tip=line.length*14.83/46.546;
    strokes.push(stroke([line.at(0,2.1),line.at(tip,1.78)]));
    strokes.push(stroke([line.at(tip,1.78),line.at(to,1.32)]));
    strokes.push(stroke([line.at(tip,1.78),line.at(to,3.32)]));
    // Generalized inset chevrons; intervals are not claimed as surveyed hatch positions.
    for(let s=tip+3;s<to-1;s+=3) {
      const low=1.78+(1.32-1.78)*(s-tip)/(to-tip)+.18;
      const end=Math.min(s+1,to-.25),high=1.78+(3.32-1.78)*(end-tip)/(to-tip)-.18;
      if(high-low>.18) strokes.push(stroke([line.at(s,low),line.at(end,high)],'hatch'));
    }
  } else {
    from=10;to=90;uncertaintyMetres=.35;
    const stations=[[10,-2.4,2.8],[20,-2.6,2.4],[30,-2.8,1.8],[40,-2.9,1.4],[50,-2.8,.7],
      [60,-2.7,.7],[70,-2.2,1],[80,-1.6,1.4],[90,-1.5,1.8]];
    for(const [column,outerSign] of [[1,-1],[2,1]]) {
      strokes.push(stroke(trace(line,stations,column,outerSign*.12)));
      for(let start=Math.floor(from/10.5)*10.5;start<to;start+=10.5) {
        const a=Math.max(from,start),b=Math.min(to,start+4.2);
        if(b>a) strokes.push(stroke(trace(line,stations,column,-outerSign*.12,a,b),'dash'));
      }
    }
  }
  return {id,sourceReversed:!same(sourcePoints[0],points[0]),evidence:id==='250810393'?'medical-historical-taper':'hospital-historical-shared-turn',
    currentVerified:false,uncertaintyMetres,registrationUncertainty:'unknown',
    coverage:{from,to,sourceLength:line.length},strokes};
}

/** A whole stroke is omitted if ANY sample is unsupported. Samples cover edges
 * and interior at <=0.1 m along/across each mitered quadrilateral. This is finite
 * sampling, not exact polygon clipping: sub-0.1 m holes can remain undetected.
 * Triangle edge midpoints/centroids adapt to <=1.5 mm lift residual (8 levels
 * maximum); unresolved support or curvature omits the whole stroke. Coordinates
 * are sampled after Float32 XZ rounding. Index inclusion tolerance is 1e-8.
 * No terrain/parking/bridge fallback.
 */
export function drapeHistoricalStroke(stroke, index, referenceHeight=null) {
  const points=stroke?.points,width=stroke?.width;
  if(!Array.isArray(points)||points.length<2||!Number.isFinite(width)||width<=0||width>1
    ||!points.every(p=>p && [p.x,p.z].every(Number.isFinite)) || !index?.sample) return [];
  const normals=[];
  for(let i=1;i<points.length;i++) {if(distance(points[i-1],points[i])<1e-8)return [];normals.push(normal(points[i-1],points[i]));}
  const sections=points.map((p,i)=> {
    let n=normals[Math.min(i,normals.length-1)];
    if(i>0 && i<points.length-1) {
      const a=normals[i-1],b=normals[i],denom=1+a.x*b.x+a.z*b.z;
      if(denom<.25)return null;
      n={x:(a.x+b.x)/denom,z:(a.z+b.z)/denom};
    }
    return [off(p,n,width/2),off(p,n,-width/2)];
  });
  if(sections.some(s=>!s))return [];
  const cache=new Map();
  const height=p=> {
    const key=`${p.x}:${p.z}`;
    if(cache.has(key))return cache.get(key);
    const hint=typeof referenceHeight==='function'?referenceHeight(p.x,p.z):referenceHeight;
    const hit=index.sample(p.x,p.z,hint,{includeParking:false,includeBridges:false});
    const y=hit?.layer==='road_surfaces' && hit.heightSource==='rendered-pavement-triangle' && Number.isFinite(hit.height)?hit.height:null;
    cache.set(key,y);return y;
  };
  const sample=p=> {
    // Sample the XZ that the final Float32 GPU buffer will actually contain.
    const point={x:Math.fround(p.x),z:Math.fround(p.z)},y=height(point);
    return y===null||Math.abs(Math.fround(y+.008)-y-.008)>.0015?null:[point.x,Math.fround(y+.008),point.z];
  };
  function adaptiveTriangle(a,b,c,output,depth=0) {
    const blend=(u,v,w)=>({x:a[0]*u+b[0]*v+c[0]*w,z:a[2]*u+b[2]*v+c[2]*w,
      y:a[1]*u+b[1]*v+c[1]*w});
    const probes=[blend(.5,.5,0),blend(0,.5,.5),blend(.5,0,.5),blend(1/3,1/3,1/3)];
    let error=0;
    for(const p of probes) {
      const y=height(p);if(y===null)return false;
      error=Math.max(error,Math.abs(p.y-y-.008));
    }
    if(error<=.0015) {output.push(...a,...b,...c);return true;}
    if(depth>=8)return false; // No inaccurate or partly unsupported stroke escapes.
    const ab=sample(probes[0]),bc=sample(probes[1]),ca=sample(probes[2]);
    if(!ab||!bc||!ca)return false;
    return adaptiveTriangle(a,ab,ca,output,depth+1)&&adaptiveTriangle(ab,b,bc,output,depth+1)
      &&adaptiveTriangle(ca,bc,c,output,depth+1)&&adaptiveTriangle(ab,bc,ca,output,depth+1);
  }
  const positions=[];
  for(let i=1;i<sections.length;i++) {
    const a=sections[i-1],b=sections[i],steps=Math.max(1,Math.ceil(Math.max(distance(a[0],b[0]),distance(a[1],b[1]))/.1));
    let previous=null;
    for(let s=0;s<=steps;s++) {
      const left=lerp(a[0],b[0],s/steps),right=lerp(a[1],b[1],s/steps);
      const crossSteps=Math.max(2,Math.ceil(distance(left,right)/.1));
      let first,last;
      for(let c=0;c<=crossSteps;c++) {
        const v=sample(lerp(left,right,c/crossSteps));if(!v)return [];
        if(c===0)first=v;if(c===crossSteps)last=v;
      }
      if(previous && (!adaptiveTriangle(previous[0],previous[1],last,positions)
        ||!adaptiveTriangle(previous[0],last,first,positions)))return [];
      previous=[first,last];
    }
  }
  return positions;
}
/** Exclusions are in canonical source station metres (not resampled-piece length).
 * Convert reversed source chain c to coverage.sourceLength - c at the caller.
 */
export function renderHistoricalPaintProfile(profile,index,{referenceHeight=null,excludedStationIntervals=[]}={}) {
  const positions=[],strokes=[];
  if(!Array.isArray(excludedStationIntervals)||excludedStationIntervals.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)||v[1]<v[0])) return {positions,strokes,reviewed:false};
  for(const s of profile?.strokes??[]) {
    let intervals=[[s.points[0].station,s.points.at(-1).station]];
    for(const [a,b] of excludedStationIntervals) intervals=intervals.flatMap(([lo,hi])=>b<=lo||a>=hi?[[lo,hi]]:[[lo,Math.min(hi,a)],[Math.max(lo,b),hi]].filter(([x,y])=>y>x));
    for(const [from,to] of intervals) {
      const at=station=>{let i=0;while(i<s.points.length-2 && s.points[i+1].station<station)i++;
        const a=s.points[i],b=s.points[i+1];return lerp(a,b,(station-a.station)/(b.station-a.station));};
      const clipped={...s,points:[at(from),...s.points.filter(p=>p.station>from && p.station<to),at(to)]};
      const vertices=drapeHistoricalStroke(clipped,index,referenceHeight);if(!vertices.length)continue;
      strokes.push({startVertex:positions.length/3,vertexCount:vertices.length/3,kind:s.kind,from,to});
      for(const v of vertices)positions.push(v);
    }
  }
  return {positions,strokes,reviewed:positions.length>0};
}
