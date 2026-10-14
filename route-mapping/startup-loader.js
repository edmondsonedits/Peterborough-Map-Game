/* One owned deadline covers shared dispatch readiness, fetch and body parsing. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_ROUTE_STARTUP=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function createStartupLoader({fetch,readCalls,timeoutMs=20000}){
    let active=null;
    function cancel(){
      if(!active)return;
      const attempt=active;active=null;clearTimeout(attempt.timer);attempt.controller.abort();attempt.reject(new Error('Startup attempt superseded.'));
    }
    async function load(url){
      cancel();
      const controller=new AbortController(),attempt={controller,timer:null,reject:null};active=attempt;
      const deadline=new Promise((_,reject)=>{
        attempt.reject=reject;
        attempt.timer=setTimeout(()=>{controller.abort();reject(new Error('Road data is taking longer than expected. Please try again.'));},timeoutMs);
      });
      const work=(async()=>{
        const calls=await readCalls();
        if(controller.signal.aborted)throw new Error('Startup attempt cancelled.');
        if(!Array.isArray(calls)||!calls.length)throw new Error('The shared dispatch database is empty.');
        const response=await fetch(url,{cache:'force-cache',signal:controller.signal});
        if(!response.ok)throw new Error('Peterborough road data could not load ('+response.status+'). Please try again.');
        const geojson=await response.json();
        if(controller.signal.aborted)throw new Error('Startup attempt cancelled.');
        return {calls,geojson};
      })();
      try{return await Promise.race([work,deadline]);}
      finally{clearTimeout(attempt.timer);if(active===attempt)active=null;}
    }
    return {load,cancel};
  }
  return {createStartupLoader};
});
