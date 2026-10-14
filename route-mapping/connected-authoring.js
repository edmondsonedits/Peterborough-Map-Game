/* Learner-selected legal streets. No call-directed route search. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_ROUTE_AUTHORING=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createConnectedAuthoring({graph,traceCore}){
    const nodeAt=anchor=>{const s=graph.segments[anchor.segmentId];return anchor.t<1e-9?s.from:anchor.t>1-1e-9?s.to:null;};
    const direction=(dx,dy)=>['east','northeast','north','northwest','west','southwest','south','southeast'][(Math.round(Math.atan2(dy,dx)/(Math.PI/4))+8)%8];
    function choices(route,target){
      if(!route||route.complete)return [];
      const anchor=route.endpoint,segment=graph.segments[anchor.segmentId],nodeId=nodeAt(anchor),starts=[];
      if(nodeId!==null){
        for(const edge of graph.nodes[nodeId].edges)starts.push({segmentId:edge.segmentId,t:edge.reverse?0:1,fromT:edge.reverse?1:0});
      }else{
        if(segment.forward!==false)starts.push({segmentId:segment.id,t:1,fromT:anchor.t});
        if(segment.backward!==false)starts.push({segmentId:segment.id,t:0,fromT:anchor.t});
      }
      return starts.map(first=>{
        const firstSegment=graph.segments[first.segmentId],steps=[],seen=new Set();let step=first,metres=0,stop='junction',endNode=null;
        // Fold geometry vertices on the same street into one useful choice. A
        // fork, road-name change, dead end or call access always ends the choice.
        while(step&&steps.length<500){
          const s=graph.segments[step.segmentId],key=s.id+':'+step.t;
          if(seen.has(key)){stop='street loop';break;}seen.add(key);
          if(target?.segmentId===s.id&&target.t>=Math.min(step.fromT,step.t)-1e-9&&target.t<=Math.max(step.fromT,step.t)+1e-9&&Math.abs(target.t-step.fromT)>1e-9){
            metres+=Math.abs(target.t-step.fromT)*s.length;steps.push({segmentId:s.id,t:target.t});stop='CALL access';endNode=null;break;
          }
          metres+=Math.abs(step.t-step.fromT)*s.length;steps.push({segmentId:s.id,t:step.t});
          endNode=step.t===1?s.to:s.from;
          const onward=graph.nodes[endNode].edges.filter(edge=>edge.segmentId!==s.id);
          if(!onward.length){stop='street end';break;}
          if(onward.length!==1||String(onward[0].name||'Road')!==String(s.name||'Road'))break;
          const next=onward[0];step={segmentId:next.segmentId,t:next.reverse?0:1,fromT:next.reverse?1:0};
        }
        const sign=first.t>first.fromT?1:-1;
        const roads=endNode===null?[]:[...new Set(graph.nodes[endNode].edges.map(edge=>edge.name).filter(name=>name&&name!==firstSegment.name))];
        return {id:first.segmentId+':'+first.t,road:firstSegment.name||'Road',direction:direction(firstSegment.dx*sign,firstSegment.dy*sign),distance:metres,steps,stop:roads.length?'junction with '+roads.join(' / '):stop};
      });
    }
    function apply(route,choice,target,radius=40){
      // Resolve against current legal choices, preventing stale buttons from
      // appending a section from a previous junction after Undo or Clear.
      const legal=choices(route,target).find(candidate=>candidate.id===choice?.id);
      if(!legal)throw new Error('Choose a connected street from the current route end.');
      const next=traceCore.follow(route,legal.steps);
      return target?traceCore.finish(next,target,radius):next;
    }
    return {choices,apply};
  }
  return {createConnectedAuthoring};
});
