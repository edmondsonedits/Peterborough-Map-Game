/* Start the shared game only after selected-city stores and roads are ready. */
(() => {
  'use strict';
  const source=new URL(document.currentScript?.src||location.href,location.href);
  function inject(url){return new Promise((resolve,reject)=>{const node=document.createElement('script'),timer=setTimeout(()=>{node.remove();reject(new Error('City roads took too long to load. Please retry.'));},120000);node.src=url;node.onload=()=>{clearTimeout(timer);resolve();};node.onerror=()=>{clearTimeout(timer);reject(new Error('The selected city road file could not load.'));};document.head.appendChild(node);});}
  function fail(error){const box=document.getElementById('loading-error'),message=document.getElementById('loading-error-message');if(message)message.textContent=error?.message||String(error);if(box)box.hidden=false;document.getElementById('route-app')?.setAttribute('aria-busy','false');document.getElementById('retry-button')?.addEventListener('click',()=>location.reload(),{once:true});console.error(error);}
  window.PTBO_ROUTE_CITY_READY=(async()=>{
    if(!window.PTBO_CITY_LOCATION_RUNTIME)throw Error('City location data did not load.');
    const city=await window.PTBO_CITY_LOCATION_RUNTIME.load({context:'route'});
    await inject(city.route.networkUrl);
    if(!window.PTBO_ROUTE_NETWORK_READY)throw Error('The selected city road network did not initialize.');
    const network=await window.PTBO_ROUTE_NETWORK_READY;
    if(network?.schemaVersion!==1||network.cityId!==city.id||network.graphVersion!==city.route.graphVersion||!Array.isArray(network.features)||!network.features.length)throw Error('The selected city road network does not match its route data.');
    window.PTBO_ROUTE_NETWORK=network;return city;
  })();
  window.PTBO_ROUTE_READY=window.PTBO_ROUTE_CITY_READY.then(()=>{const module=document.querySelector('[data-route-app]');if(!module?.getAttribute('src'))throw Error('Route Mapping module is missing.');return inject(new URL(module.getAttribute('src'),source).href);}).catch(error=>{fail(error);return false;});
})();
