import {roadLaneMarkingBoundaries,mappedCycleLaneSides} from './city-detail-rules.js?v=1.6.154';
import {laneCountFor,roadProfile} from './road-network.js?v=1.6.156';
import {reviewedPaintTags} from './street-paint.js?v=1.6.156';
import {roadMarkingIntervals} from './road-appearance-rules.js?v=1.6.156';
import {buildRoadMarkingPaths,strokeMarkingPath,sourceIntervalsToPathIntervals} from './road-marking-paths.js?v=1.6.156';
const EPS=1e-5;
const length=s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y);
const grade=s=>`${s.tags?.layer||0}:${Boolean(s.profile?.bridge||s.bridge)}:${Boolean(s.profile?.tunnel)}`;
const flow=s=>s.profile?.oneWay?(String(s.tags?.oneway)==='-1'?-1:1):0;
const signature=(rules,direction=1)=>JSON.stringify(rules.map(r=>[r.kind,r.materialKey,Math.round(r.offset*direction*10000),r.width]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
function rulesFor(s){
 const tags=reviewedPaintTags(s.tags||{},s.lineId),profile=s.profile||roadProfile(tags);
 if(!profile||profile.unpaved||profile.tunnel||tags.junction==='roundabout'||tags.lane_markings==='no')return [];
 const lanes=laneCountFor(tags),width=s.width,rules=[];
 for(const rule of roadLaneMarkingBoundaries(tags,{...profile,lanes}))rules.push({kind:rule.pattern==='solid'?'solid':'dash',materialKey:rule.materialKey,offset:width/2-width*rule.boundary/lanes+(rule.offsetMetres||0),width:.15});
 for(const side of mappedCycleLaneSides(tags))rules.push({kind:'cycle-edge',materialKey:'roadPaintWhite',offset:(side==='left'?1:-1)*Math.max(.45,width/2-1.52),width:.15});
 if(/^(motorway|trunk)(?:_link)?$/.test(profile.highway))for(const side of [-1,1])rules.push({kind:'edge',materialKey:profile.oneWay&&side===(tags.oneway==='-1'?-1:1)?'roadPaintYellow':'roadPaintWhite',offset:side*Math.max(.5,width/2-.2),width:.15});
 return rules;
}
function endpoint(run,end){return end==='start'?run.points[0]:run.points.at(-1);}
/** One coherent lane-layout chain, preserving source-node topology and intentional mouths. */
export function buildRoadMarkingLayout(segments,{paintContext=null}={}){
 const byLine=new Map(),arms=new Map(),runs=[];
 for(const s of segments){
  if(!s.a||!s.b||!Number.isFinite(s.width)||length(s)<EPS)continue;
  const key=String(s.lineId);if(!byLine.has(key))byLine.set(key,[]);byLine.get(key).push(s);
  if(s.profile?.renderClass==='service'||s.profile?.parkingAisle)continue;
  for(const end of ['a','b']){
   const node=s[end+'NodeId'];if(node==null)continue;
   const k=`${node}:${grade(s)}`;if(!arms.has(k))arms.set(k,new Set());
   const sign=end==='a'?1:-1,dx=(s.b.x-s.a.x)*sign,dz=(s.b.y-s.a.y)*sign;
   arms.get(k).add(Math.round(Math.atan2(dz,dx)/.05));
  }
 }
 for(const list of byLine.values()){
  list.sort((a,b)=>(a.chainStart||0)-(b.chainStart||0));let run=null;
  for(const s of list){
   const rules=rulesFor(s),len=length(s),key=`${grade(s)}:${flow(s)}:${signature(rules)}`;
   const previous=run?.segments.at(-1);
   if(!rules.length){run=null;continue;}
   if(!run||key!==run.key||Math.hypot(previous.b.x-s.a.x,previous.b.y-s.a.y)>.02||Math.abs(previous.bY-s.aY)>.35||Math.abs((previous.chainStart||0)+length(previous)-(s.chainStart||0))>.02){
    run={key,segments:[],points:[{x:s.a.x,z:s.a.y,y:s.aY,nodeId:s.aNodeId,lineId:String(s.lineId),sourceDistance:0}],allowed:[],rules,first:s,length:0,links:{}};runs.push(run);
   }
   for(const[a,b]of roadMarkingIntervals(paintContext,s))run.allowed.push([run.length+a,run.length+b]);
   run.length+=len;run.points.push({x:s.b.x,z:s.b.y,y:s.bY,nodeId:s.bNodeId,lineId:String(s.lineId),sourceDistance:run.length});run.segments.push(s);
  }
 }
 const ends=new Map();
 runs.forEach((run,index)=>{for(const end of ['start','end']){const p=endpoint(run,end);if(p.nodeId==null)continue;const key=`${p.nodeId}:${grade(run.first)}`;if(!ends.has(key))ends.set(key,[]);ends.get(key).push({index,end});}});
 let joinedWayEndpoints=0;
 for(const[key,pair]of ends){
  if(pair.length!==2||(arms.get(key)?.size||0)!==2)continue;
  const [a,b]=pair,ra=runs[a.index],rb=runs[b.index];if(a.index===b.index)continue;
  const da=a.end==='end'?1:-1,db=b.end==='start'?1:-1;
  const pa=endpoint(ra,a.end),pb=endpoint(rb,b.end);
  if(Math.hypot(pa.x-pb.x,pa.z-pb.z)>.02||Math.abs(pa.y-pb.y)>.35||Math.abs(ra.first.width-rb.first.width)>.02||flow(ra.first)*da!==flow(rb.first)*db||signature(ra.rules,da)!==signature(rb.rules,db))continue;
  ra.links[a.end]=b;rb.links[b.end]=a;joinedWayEndpoints++;
 }
 const visited=new Set(),chains=[];
 const order=runs.map((run,index)=>({run,index})).sort((a,b)=>(Number(Boolean(a.run.links.start))+Number(Boolean(a.run.links.end)))-(Number(Boolean(b.run.links.start))+Number(Boolean(b.run.links.end)))||String(a.run.first.lineId).localeCompare(String(b.run.first.lineId)));
 for(const seed of order){
  if(visited.has(seed.index))continue;
  let index=seed.index,direction=seed.run.links.start&&!seed.run.links.end?-1:1;
  const rules=seed.run.rules.map(r=>({...r,offset:r.offset*direction})),points=[],allowed=[],spans=[];let base=0;
  while(!visited.has(index)){
   const run=runs[index];visited.add(index);
   const oriented=direction===1?run.points:[...run.points].reverse();
   const mapped=oriented.map(p=>({...p,sourceDistance:base+(direction===1?p.sourceDistance:run.length-p.sourceDistance)}));
   points.push(...(points.length?mapped.slice(1):mapped));
   for(const[a,b]of run.allowed)allowed.push(direction===1?[base+a,base+b]:[base+run.length-b,base+run.length-a]);
   spans.push({start:base,end:base+run.length,id:String(run.first.lineId)});base+=run.length;
   const link=run.links[direction===1?'end':'start'];if(!link||visited.has(link.index))break;
   index=link.index;direction=link.end==='start'?1:-1;
  }
  chains.push({points,allowed,spans,rules,length:base});
 }
 const markings=[];let droppedTinyDashes=0;
 for(const chain of chains)for(const rule of chain.rules){
  const options={offset:rule.offset,width:rule.width,miterLimit:3};
  const full=buildRoadMarkingPaths(chain.points,options);
  const clips=full.flatMap(path=>sourceIntervalsToPathIntervals(path.points,chain.allowed));
  let dashPattern=rule.kind==='dash'?{dash:4.2,gap:6.3}:null;
  const loop=full.length===1&&Math.hypot(full[0].points[0].x-full[0].points.at(-1).x,full[0].points[0].z-full[0].points.at(-1).z)<EPS;
  if(dashPattern&&loop){const length=full[0].endDistance-full[0].startDistance,period=length/Math.max(1,Math.round(length/10.5));dashPattern={dash:period*.4,gap:period*.6};}
  const paths=buildRoadMarkingPaths(chain.points,{...options,clipIntervals:clips,dashPattern});
  for(const path of paths){
   if(rule.kind==='dash'&&path.endDistance-path.startDistance<.6){droppedTinyDashes++;continue;}
   const stroke=strokeMarkingPath(path.points,rule.width,{miterLimit:3});if(!stroke.quads.length)continue;
   const low=Math.min(...path.points.map(p=>p.sourceDistance)),high=Math.max(...path.points.map(p=>p.sourceDistance));
   const lineIds=[...new Set(chain.spans.filter(s=>s.end>low+EPS&&s.start<high-EPS).map(s=>s.id))];
   const pieces=stroke.quads.map(quad=>{
    const lo=Math.min(...quad.map(p=>p.sourceDistance)),hi=Math.max(...quad.map(p=>p.sourceDistance));
    let ids=[...new Set(chain.spans.filter(s=>s.end>lo+EPS&&s.start<hi-EPS).map(s=>s.id))];
    if(!ids.length)ids=[chain.spans.find(s=>s.start<=lo+EPS&&s.end>lo+EPS)?.id||chain.spans.at(-1).id];
    return{polygons:[quad],triangles:[[quad[0],quad[1],quad[2]],[quad[0],quad[2],quad[3]]],lineIds:ids};
   });
   markings.push({path,polygons:stroke.quads,triangles:stroke.trianglesXZ,pieces,materialKey:rule.materialKey,kind:rule.kind,lineIds});
  }
 }
 return {markings,stats:{sourceLines:byLine.size,runs:runs.length,chains:chains.length,joinedWayEndpoints,markingPaths:markings.length,droppedTinyDashes,dashLength:4.2,gapLength:6.3,strokeWidth:.15}};
}
