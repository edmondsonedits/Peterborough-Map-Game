/* Route review uses observed choices and bounded divergence/rejoin regret. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_ROUTE_LEARNING=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const edgeId=e=>e.segmentId!=null?e.segmentId+':'+Boolean(e.reverse):e.from+':'+e.to;
  const position=e=>(e.start?.lat??0).toFixed(5)+','+(e.start?.lng??e.from??0).toFixed(5);
  function heading(edge){
    const a=edge.start,b=edge.end;if(!a||!b)return '';
    const x=(b.lng-a.lng)*Math.cos(a.lat*Math.PI/180),y=b.lat-a.lat;
    if(Math.hypot(x,y)<1e-10)return '';
    return ['east','northeast','north','northwest','west','southwest','south','southeast'][(Math.round(Math.atan2(y,x)/(Math.PI/4))+8)%8];
  }
  function decisionKey(edge){return position(edge)+'|'+String(edge.name||edge.ref||'road').toLowerCase()+'|'+heading(edge);}
  function describe(edge){return String(edge.name||edge.ref||'the road')+(heading(edge)?' '+heading(edge)+'bound':'');}
  function location(edge,end=false){
    const t=end?edge.t1:edge.t0,node=end?edge.to:edge.from;
    const boundary=end?(edge.reverse?0:1):(edge.reverse?1:0);
    if(t==null||Math.abs(t-boundary)<1e-7)return 'node:'+node;
    return 'segment:'+edge.segmentId+':'+t.toFixed(7);
  }
  function sameTraversal(a,b){
    return edgeId(a)===edgeId(b)&&location(a)===location(b)&&location(a,true)===location(b,true);
  }
  function compareChoices(player,reference){
    const p=player.edges||[],r=reference.edges||[],firstChoices=new Map(),correctDecisions=[],credited=new Set(),regrets=[];
    for(const edge of p){const key=position(edge);if(!firstChoices.has(key))firstChoices.set(key,edge);}
    for(const edge of r){const key=decisionKey(edge);if(credited.has(key))continue;
      const chosen=firstChoices.get(position(edge));if(chosen&&sameTraversal(chosen,edge)){credited.add(key);correctDecisions.push(edge);}
    }
    const tolerance=Math.max(160,(reference.distance||0)*.035);
    let pi=0,ri=0;
    while(pi<p.length&&ri<r.length){
      if(sameTraversal(p[pi],r[ri])){pi++;ri++;continue;}
      // Bound attribution at the next observed rejoin, including a shared final destination.
      // Matching a road name or direction alone is not evidence of arriving at that point.
      let joinP=-1,joinR=-1;
      outer:for(let nextP=pi+1;nextP<=p.length;nextP++)for(let nextR=ri+1;nextR<=r.length;nextR++){
        const pLocation=nextP<p.length?location(p[nextP]):location(p.at(-1),true);
        const rLocation=nextR<r.length?location(r[nextR]):location(r.at(-1),true);
        if(pLocation===rLocation){joinP=nextP;joinR=nextR;break outer;}
      }
      if(joinP<0)break;
      const playerDistance=p.slice(pi,joinP).reduce((n,e)=>n+e.distance,0),referenceDistance=r.slice(ri,joinR).reduce((n,e)=>n+e.distance,0),extra=playerDistance-referenceDistance;
      if(extra>tolerance)regrets.push({key:decisionKey(r[ri]),correct:r[ri],chosen:p[pi],extra,playerDistance,referenceDistance});
      pi=joinP;ri=joinR;
    }
    return {regrets:regrets.sort((a,b)=>b.extra-a.extra),correctDecisions,tolerance};
  }
  return {compareChoices,decisionKey,describe,heading};
});
