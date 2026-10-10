/* Ordered street tracing. The learner's route is never optimized against the call. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PTBO_ROUTE_TRACE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createTraceCore({graph,toXY,toLatLng,search}){
    const distance=(a,b)=>{const p=toXY(a.lat,a.lng),q=toXY(b.lat,b.lng);return Math.hypot(q.x-p.x,q.y-p.y);};
    const pointAt=(s,t)=>toLatLng(s.ax+s.dx*t,s.ay+s.dy*t);
    const allowed=(s,reverse)=>reverse?s.backward!==false:s.forward!==false;
    function indexes(p,radius){
      if(!graph.segmentGrid)return graph.segments.map((_,i)=>i);
      const size=graph.gridSize||120,cx=Math.floor(p.x/size),cy=Math.floor(p.y/size),cells=Math.ceil(radius/size),out=new Set();
      for(let x=-cells;x<=cells;x++)for(let y=-cells;y<=cells;y++)for(const id of graph.segmentGrid.get((cx+x)+','+(cy+y))||[])out.add(id);
      return out;
    }
    function snap(point,tolerance=30,direction,previous){
      const p=toXY(point.lat,point.lng);let best=null,bestScore=Infinity;
      for(const id of indexes(p,tolerance)){
        const s=graph.segments[id],t=Math.max(0,Math.min(1,((p.x-s.ax)*s.dx+(p.y-s.ay)*s.dy)/s.lengthSq));
        const xy={x:s.ax+s.dx*t,y:s.ay+s.dy*t},gap=Math.hypot(xy.x-p.x,xy.y-p.y);
        if(gap>tolerance)continue;
        const v=direction,alignment=v&&Math.hypot(v.x,v.y)>0?Math.abs((v.x*s.dx+v.y*s.dy)/(Math.hypot(v.x,v.y)*s.length)):1;
        const score=gap+(1-alignment)*tolerance*.35-(previous?.segmentId===id?2:0);
        if(score>=bestScore)continue;
        bestScore=score;best={...pointAt(s,t),segmentId:id,t,road:s.name||'Road',highway:s.highway,distance:gap};
      }
      return best;
    }
    function slice(s,fromT,toT){
      const reverse=toT<fromT,edge=graph.nodes[reverse?s.to:s.from].edges.find(e=>e.segmentId===s.id&&Boolean(e.reverse)===reverse);
      const metres=Math.abs(toT-fromT)*s.length;
      if(metres<1e-7)return null;
      if(!edge)return null;
      return {...edge,t0:fromT,t1:toT,start:pointAt(s,fromT),end:pointAt(s,toT),distance:metres,duration:(edge.duration||0)*metres/s.length};
    }
    function exits(a,entering){
      const s=graph.segments[a.segmentId],out=[];
      const add=(nodeId,fromT,toT)=>out.push({nodeId,edge:slice(s,fromT,toT),distance:Math.abs(toT-fromT)*s.length});
      if(entering){
        if(allowed(s,false)||a.t===0)add(s.from,0,a.t);
        if(allowed(s,true)||a.t===1)add(s.to,1,a.t);
      }else{
        if(allowed(s,false)||a.t===1)add(s.to,a.t,1);
        if(allowed(s,true)||a.t===0)add(s.from,a.t,0);
      }
      return out;
    }
    function segmentGap(point,a,b){
      const dx=b.x-a.x,dy=b.y-a.y,len=dx*dx+dy*dy,t=len?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/len)):0;
      return Math.hypot(point.x-a.x-dx*t,point.y-a.y-dy*t);
    }
    function localSearch(start,end,options){
      if(start===end)return {edges:[],distance:0};
      const max=options.maxDistance??Infinity,cost=new Map([[start,0]]),previous=new Map(),queue=[{id:start,cost:0}];
      const a=options.corridorStart&&toXY(options.corridorStart.lat,options.corridorStart.lng),b=options.corridorEnd&&toXY(options.corridorEnd.lat,options.corridorEnd.lng);
      let visited=0;
      while(queue.length&&visited++<2500){
        queue.sort((x,y)=>y.cost-x.cost);const current=queue.pop();
        if(current.cost!==cost.get(current.id))continue;
        if(current.id===end){
          const edges=[];let id=end;while(id!==start){const e=previous.get(id);if(!e)return null;edges.push(e);id=e.from;}
          return {edges:edges.reverse(),distance:current.cost};
        }
        for(const e of graph.nodes[current.id].edges){
          if(e.to===options.avoidNode||options.avoidBridge&&e.bridgeKey===options.avoidBridge)continue;
          const next=current.cost+e.distance;if(next>max||next>=(cost.get(e.to)??Infinity))continue;
          if(a&&b){
            const p=graph.nodes[e.from],q=graph.nodes[e.to],mid={x:(p.x+q.x)/2,y:(p.y+q.y)/2};
            if([p,mid,q].some(point=>segmentGap(point,a,b)>options.corridorWidth))continue;
          }
          cost.set(e.to,next);previous.set(e.to,e);queue.push({id:e.to,cost:next});
        }
      }
      return null;
    }
    function normalize(edges){
      const out=[];
      for(const edge of edges){
        if(!edge||edge.distance<1e-7)continue;
        const copy={...edge,start:edge.start||{lat:graph.nodes[edge.from].lat,lng:graph.nodes[edge.from].lng},end:edge.end||{lat:graph.nodes[edge.to].lat,lng:graph.nodes[edge.to].lng}};
        const last=out[out.length-1];
        if(last&&last.segmentId===copy.segmentId&&Boolean(last.reverse)===Boolean(copy.reverse)&&distance(last.end,copy.start)<.05){
          last.end=copy.end;last.t1=copy.t1;last.distance+=copy.distance;last.duration+=copy.duration||0;
        }else out.push(copy);
      }
      return out;
    }
    function route(edges,start,end){
      edges=normalize(edges);const coordinates=[[start.lat,start.lng]];
      let cursor=start;
      for(const e of edges){
        if(distance(cursor,e.start)>.2)throw new Error('This street section has no continuous connection.');
        if(distance(cursor,e.end)>.01)coordinates.push([e.end.lat,e.end.lng]);
        cursor=e.end;
      }
      if(distance(cursor,end)>.2)throw new Error('This street section has no continuous connection.');
      return {edges,coordinates,start,endpoint:end,distance:edges.reduce((sum,e)=>sum+e.distance,0),duration:edges.reduce((sum,e)=>sum+(e.duration||0),0),complete:false,mainRoads:[...new Set(edges.map(e=>e.name).filter(Boolean))]};
    }
    function fitsCorridor(candidate,options){
      if(!options.local||!options.corridorStart||!options.corridorEnd)return true;
      const a=toXY(options.corridorStart.lat,options.corridorStart.lng),b=toXY(options.corridorEnd.lat,options.corridorEnd.lng);
      return candidate.edges.every(edge=>[edge.start,edge.end].every(point=>segmentGap(toXY(point.lat,point.lng),a,b)<=options.corridorWidth));
    }
    function between(a,b,options={}){
      if(!a||!b)return null;
      let best=null,bestDistance=options.maxDistance??Infinity;
      if(a.segmentId===b.segmentId){
        const s=graph.segments[a.segmentId];
        if(Math.abs(a.t-b.t)<1e-9)return route([],a,b);
        if(allowed(s,b.t<a.t)){
          const e=slice(s,a.t,b.t);
          if(e&&e.distance<=bestDistance&&!(options.avoidBridge&&e.bridgeKey===options.avoidBridge)){
            const candidate=route([e],a,b);if(fitsCorridor(candidate,options)){best=candidate;bestDistance=e.distance;}
          }
        }
      }
      for(const from of exits(a,false))for(const to of exits(b,true)){
        if(from.nodeId===options.avoidNode||to.nodeId===options.avoidNode||options.avoidBridge&&[from.edge,to.edge].some(e=>e?.bridgeKey===options.avoidBridge))continue;
        const budget=bestDistance-from.distance-to.distance;if(budget<0)continue;
        const opts={...options,maxDistance:budget};
        const path=options.local||!search?localSearch(from.nodeId,to.nodeId,opts):search(from.nodeId,to.nodeId,opts);
        if(!path)continue;
        const candidate=route([from.edge,...path.edges,to.edge],a,b);
        if(candidate.distance<=bestDistance&&fitsCorridor(candidate,options)){best=candidate;bestDistance=candidate.distance;}
      }
      return best;
    }
    function samples(points,spacing){
      const out=[points[0]];
      for(let i=1;i<points.length;i++){
        const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(distance(a,b)/spacing));
        for(let j=1;j<=steps;j++)out.push({lat:a.lat+(b.lat-a.lat)*j/steps,lng:a.lng+(b.lng-a.lng)*j/steps});
      }
      return out;
    }
    function trace(points,{tolerance=30}={}){
      if(!Array.isArray(points)||points.length<2)throw new Error('Draw farther along the street.');
      const sampled=samples(points,Math.max(6,Math.min(16,tolerance*.6))),edges=[];
      let start=null,previous=null;
      for(let i=0;i<sampled.length;i++){
        const p=sampled[i],before=sampled[Math.max(0,i-1)],after=sampled[Math.min(sampled.length-1,i+1)],a=toXY(before.lat,before.lng),b=toXY(after.lat,after.lng);
        const current=i===0&&Number.isInteger(points[0].segmentId)?points[0]:snap(p,tolerance,{x:b.x-a.x,y:b.y-a.y},previous);
        if(!current)throw new Error('Trace closer to the street. This section could not be matched.');
        if(!start)start=current;
        if(previous&&(previous.segmentId!==current.segmentId||distance(previous,current)>.05)){
          const gap=distance(previous,current),maxDistance=Math.max(.5,gap*1.8+1);
          const leg=between(previous,current,{local:true,maxDistance,corridorStart:before,corridorEnd:p,corridorWidth:tolerance});
          if(!leg)throw new Error('Those streets are not connected in that direction. Trace the junction or bridge you want.');
          edges.push(...leg.edges);
        }
        previous=current;
      }
      return route(edges,start,previous);
    }
    function combine(first,next){
      if(!first)return next;
      if(distance(first.endpoint,next.start)>1)throw new Error('Continue from the end of your blue route.');
      return route([...first.edges,...next.edges],first.start,next.endpoint);
    }
    function finish(current,target,radius=40){
      if(distance(current.endpoint,target)>radius)return current;
      const arrival=between(current.endpoint,target,{maxDistance:radius});
      if(!arrival)return current;
      return {...combine(current,arrival),complete:true};
    }
    return {snap,trace,between,combine,finish,distance};
  }
  return {createTraceCore};
});
