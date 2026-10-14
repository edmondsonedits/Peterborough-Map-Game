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
    function snapCandidates(point,tolerance=30,direction,previous,directionBias=.35){
      const p=toXY(point.lat,point.lng),bias=Number.isFinite(directionBias)?Math.max(0,Math.min(1,directionBias)):.35;const candidates=[];
      for(const id of indexes(p,tolerance)){
        const s=graph.segments[id],t=Math.max(0,Math.min(1,((p.x-s.ax)*s.dx+(p.y-s.ay)*s.dy)/s.lengthSq));
        const xy={x:s.ax+s.dx*t,y:s.ay+s.dy*t},gap=Math.hypot(xy.x-p.x,xy.y-p.y);
        if(gap>tolerance)continue;
        const v=direction,alignment=v&&Math.hypot(v.x,v.y)>0?Math.abs((v.x*s.dx+v.y*s.dy)/(Math.hypot(v.x,v.y)*s.length)):1;
        const score=gap+(1-alignment)*tolerance*bias-(previous?.segmentId===id?2:0);
        candidates.push({score,anchor:{...pointAt(s,t),segmentId:id,t,road:s.name||'Road',highway:s.highway,distance:gap}});
      }
      return candidates.sort((a,b)=>a.score-b.score||a.anchor.segmentId-b.anchor.segmentId);
    }
    function steadyJunction(candidates,previous,tolerance){
      const best=candidates[0],held=candidates.find(candidate=>candidate.anchor.segmentId===previous.segmentId);
      if(!best||!held||best===held)return;
      const a=graph.segments[held.anchor.segmentId],b=graph.segments[best.anchor.segmentId];
      // Leave ordinary road curves/straight continuations responsive. A turn at
      // a shared graph junction needs a few pixels of displacement, not jitter.
      if(Math.abs(a.dx*b.dx+a.dy*b.dy)/(a.length*b.length)>=.85)return;
      const junction=[a.from,a.to].find(id=>id===b.from||id===b.to),deadband=Math.max(.75,tolerance*.2);
      if(junction===undefined||distance(held.anchor,graph.nodes[junction])>deadband||distance(best.anchor,graph.nodes[junction])>deadband)return;
      candidates.splice(candidates.indexOf(held),1);candidates.unshift(held);
    }
    function snap(point,tolerance=30,direction,previous,directionBias=.35){
      return snapCandidates(point,tolerance,direction,previous,directionBias)[0]?.anchor||null;
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
        const copy={...edge,t0:edge.t0??(edge.reverse?1:0),t1:edge.t1??(edge.reverse?0:1),start:edge.start||{lat:graph.nodes[edge.from].lat,lng:graph.nodes[edge.from].lng},end:edge.end||{lat:graph.nodes[edge.to].lat,lng:graph.nodes[edge.to].lng}};
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
    function trace(points,{tolerance=30,directionBias=.35}={}){
      if(!Array.isArray(points)||points.length<2)throw new Error('Draw farther along the street.');
      const sampled=samples(points,Math.max(6,Math.min(16,tolerance*.6))),edges=[];
      let start=null,previous=null;
      for(let i=0;i<sampled.length;i++){
        const p=sampled[i],before=sampled[Math.max(0,i-1)],after=sampled[Math.min(sampled.length-1,i+1)],a=toXY(before.lat,before.lng),b=toXY(after.lat,after.lng);
        const current=i===0&&Number.isInteger(points[0].segmentId)?points[0]:snap(p,tolerance,{x:b.x-a.x,y:b.y-a.y},previous,directionBias);
        if(!current){
          const nearest=snap(p,Math.max(200,tolerance*3),null,null,0);
          const error=new Error(nearest
            ? 'That section is '+Math.round(nearest.distance)+' m from the mapped street ('+Math.round(tolerance)+' m allowed). Increase Street forgiveness in settings or zoom in.'
            : 'No mapped street was found near that section. Check the street and Street forgiveness in settings.');
          error.code='street-gap';error.point={lat:p.lat,lng:p.lng};error.nearestDistance=nearest?.distance??null;error.tolerance=tolerance;
          throw error;
        }
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
    // An editor starts at an exact road fraction, not at a distant graph vertex.
    function begin(anchor){
      if(!anchor||!Number.isInteger(anchor.segmentId)||!graph.segments[anchor.segmentId])throw new Error('Start on a mapped street.');
      return route([],anchor,anchor);
    }
    function retreat(current,target,options){
      let removed=0;
      const a=toXY(options.corridorStart.lat,options.corridorStart.lng),b=toXY(options.corridorEnd.lat,options.corridorEnd.lng);
      for(let i=current.edges.length-1;i>=0;i--){
        const edge=current.edges[i],s=graph.segments[edge.segmentId];
        const t0=edge.t0??(edge.reverse?1:0),t1=edge.t1??(edge.reverse?0:1);
        if(edge.segmentId===target.segmentId&&target.t>=Math.min(t0,t1)-1e-9&&target.t<=Math.max(t0,t1)+1e-9){
          const amount=removed+Math.abs(t1-target.t)*s.length;
          if(amount>options.maxDistance)return null;
          // Remove only the contiguous tail under the reverse gesture. Revisiting
          // a distant earlier intersection must not delete a deliberately drawn loop.
          if([edge.end,target].some(p=>segmentGap(toXY(p.lat,p.lng),a,b)>options.corridorWidth))return null;
          if(amount<.35)return current;
          const kept=slice(s,t0,target.t);
          return route([...current.edges.slice(0,i),...(kept?[kept]:[])],current.start,target);
        }
        removed+=edge.distance;
        if(removed>options.maxDistance||[edge.start,edge.end].some(p=>segmentGap(toXY(p.lat,p.lng),a,b)>options.corridorWidth))return null;
      }
      return null;
    }
    // Joining a different street can implicitly retrace the open tail. Treat
    // that travel as an edit, including on one-way streets, not extra mileage.
    // Compare removed + added distance (never the total route score), and only
    // inspect the nearby, contiguous tail inside this gesture's corridor.
    function connectEdited(current,target,options){
      const retracted=retreat(current,target,options);
      if(retracted)return retracted;
      const direct=between(current.endpoint,target,options);
      let best=direct?combine(current,direct):null;
      let bestCost=direct?direct.distance:options.maxDistance,removed=0;
      const a=toXY(options.corridorStart.lat,options.corridorStart.lng),b=toXY(options.corridorEnd.lat,options.corridorEnd.lng);
      for(let i=current.edges.length-1;i>=0;i--){
        const edge=current.edges[i];removed+=edge.distance;
        if(removed>bestCost+1e-7||[edge.start,edge.end].some(p=>segmentGap(toXY(p.lat,p.lng),a,b)>options.corridorWidth))break;
        const segment=graph.segments[edge.segmentId],t=edge.t0??(edge.reverse?1:0);
        const junction={...pointAt(segment,t),segmentId:segment.id,t,road:segment.name||'Road'};
        const leg=between(junction,target,{...options,maxDistance:Math.max(0,bestCost-removed)+1e-7});
        if(!leg||removed+leg.distance>bestCost+1e-7)continue;
        bestCost=removed+leg.distance;
        best=route([...current.edges.slice(0,i),...leg.edges],current.start,target);
      }
      return best;
    }
    function advance(current,point,{tolerance=30,directionBias=.35,previousPoint=current?.endpoint}={}){
      if(!current||!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))throw new Error('A route and a finite pointer position are required.');
      const spacing=Math.max(3,Math.min(10,tolerance/3)),points=samples([previousPoint||current.endpoint,point],spacing);
      let result=current,blocked=false,action='hold';
      for(let i=1;i<points.length;i++){
        const before=points[i-1],p=points[i],a=toXY(before.lat,before.lng),b=toXY(p.lat,p.lng);
        const candidates=snapCandidates(p,tolerance,{x:b.x-a.x,y:b.y-a.y},result.endpoint,directionBias);
        steadyJunction(candidates,result.endpoint,tolerance);
        if(!candidates.length){blocked=true;break;}
        const nearest=Math.min(...candidates.map(candidate=>candidate.anchor.distance));
        let accepted=null,nextAction='hold';
        for(const {anchor} of candidates.slice(0,8)){
          // Reachability may break a tie, but must not magnetize a clearly farther street.
          if(anchor.distance>nearest+Math.max(3,tolerance*.25))continue;
          const gap=distance(result.endpoint,anchor);
          // After an off-road gap, return near the open end; never teleport to a
          // distant part of the same street just because it is connected somewhere.
          if(gap>tolerance*2+spacing*2)continue;
          const options={local:true,maxDistance:Math.max(.5,gap*1.8+1),corridorStart:before,corridorEnd:p,corridorWidth:tolerance};
          if(gap<.35){accepted=result;break;}
          const edited=connectEdited(result,anchor,options);
          if(!edited)continue;
          accepted=edited;nextAction=edited===result?'hold':edited.distance<result.distance?'erase':'draw';break;
        }
        if(!accepted){blocked=true;break;}
        result=accepted;if(nextAction!=='hold')action=nextAction;
      }
      return {route:result,changed:result!==current,blocked,action};
    }
    function finish(current,target,radius=40){
      if(distance(current.endpoint,target)>radius)return current;
      const arrival=connectEdited(current,target,{local:true,maxDistance:radius,corridorStart:current.endpoint,corridorEnd:target,corridorWidth:radius});
      if(!arrival)return current;
      return {...arrival,complete:true};
    }
    // Explicit connected-road authoring uses the same fractions and route shape
    // as tracing. Each step names one segment, never a destination path search.
    function follow(current,steps){
      if(!current)throw new Error('Start on a mapped street.');
      const edges=[...current.edges];let anchor=current.endpoint;
      for(const step of steps){
        const s=graph.segments[step.segmentId],previous=graph.segments[anchor.segmentId];
        if(!s||!Number.isFinite(step.t)||step.t<0||step.t>1)throw new Error('Choose a legal street section.');
        let fromT=anchor.t;
        if(s.id!==anchor.segmentId){
          const nodeId=anchor.t<1e-9?previous.from:anchor.t>1-1e-9?previous.to:null;
          if(nodeId===null||nodeId!==s.from&&nodeId!==s.to)throw new Error('Choose a street connected at this junction.');
          fromT=nodeId===s.from?0:1;
        }
        if(Math.abs(fromT-step.t)<1e-9)continue;
        if(!allowed(s,step.t<fromT))throw new Error('That street direction is not legal.');
        const edge=slice(s,fromT,step.t);
        if(!edge)throw new Error('That street direction is not legal.');
        edges.push(edge);anchor={...pointAt(s,step.t),segmentId:s.id,t:step.t,road:s.name||'Road'};
      }
      return route(edges,current.start,anchor);
    }
    return {snap,trace,between,combine,begin,advance,finish,distance,follow};
  }
  return {createTraceCore};
});
