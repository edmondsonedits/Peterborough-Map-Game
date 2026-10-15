/* Shared city location boundary for Geo Guesser, Route Mapping and the editor. */
(() => {
  'use strict';
  const source = new URL(document.currentScript?.src || location.href, location.href);
  const version = source.searchParams.get('v') || window.PTBO_BUILD?.version || '1';
  const root = new URL('../', source);
  const asset = path => { const url=new URL(path,root);url.searchParams.set('v',version);return url.href; };
  function script(path,params={}) {
    return new Promise((resolve,reject) => {
      const node=document.createElement('script');
      const timer=setTimeout(()=>{node.remove();reject(new Error(`Loading ${path} timed out.`));},20000);
      const url=new URL(asset(path));Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
      node.src=url.href;
      node.onload=()=>{clearTimeout(timer);resolve();};
      node.onerror=()=>{clearTimeout(timer);reject(new Error(`Unable to load ${path}.`));};
      document.head.appendChild(node);
    });
  }
  function selectedCity(context) {
    const cities=window.PTBO_CITIES || [], params=new URL(location.href).searchParams;
    let stored=null;try{stored=localStorage.getItem('ptboSelectedCity');}catch(_){}
    const explicit=params.has('city');
    const requested=String(explicit?params.get('city'):stored || 'peterborough').toLowerCase();
    let city=cities.find(item=>item.id===requested);
    const usable=city=>city&&(context==='editor'||city.modes?.[context]===true);
    if(!explicit && !usable(city)) city=cities.find(item=>item.id==='peterborough');
    if(!usable(city)) throw new Error('This city is not available here. Choose a city from All Games.');
    return city;
  }
  const coordinate = value => value !== null && String(value).trim() !== '' && value !== undefined && Number.isFinite(Number(value));
  function installPack(pack,city) {
    if(pack?.schemaVersion!==1 || pack.id!==city.id || !Array.isArray(pack.bases) || !Array.isArray(pack.locations) || !pack.map?.bounds) throw new Error('The selected city data could not be verified.');
    const profiles={};
    for(const service of ['fire','ems']) {
      const bases=pack.bases.filter(base=>base.service===service && base.status==='active' && base.selectionEligible===true && coordinate(base.lat) && coordinate(base.lng) && Math.abs(base.lat)<=85 && Math.abs(base.lng)<=180);
      if(!bases.length)throw new Error(`No operating ${service.toUpperCase()} bases are available for ${city.name}.`);
      profiles[service]={id:service,label:service==='fire'?'Fire':'EMS',vehicle:service==='fire'?'Fire truck':'Ambulance',bases};
    }
    const serviceConfig={profiles,hospital:null,alarmCategories:[]};
    window.PTBO_SERVICE_CONFIG=serviceConfig;
    window.PTBO_CITY_PACKAGE={schemaVersion:3,version,id:city.id,name:city.name,status:'demo',playable:true,
      features:{geoGuesser:city.modes?.geo===true,dispatch:false,baseTraining:false,hospitalTransport:false},map:pack.map,
      serviceConfig,futureBases:pack.bases.filter(base=>base.status!=='active' || !base.selectionEligible),constructionProjects:pack.constructionProjects || []};
    window.PTBO_ACTIVE_CITY=window.PTBO_CITY_PACKAGE;
    window.PTBO_STATIONS=profiles.fire.bases;
    window.PTBO_DISPATCH_DATA_VERSION='ontario-geo-1';
    window.PTBO_DISPATCH_DATA_READY=Promise.resolve(pack.locations);
  }
  let loading=null;
  function load({context='geo'}={}) {
    if(!['geo','editor','route'].includes(context))return Promise.reject(new Error('Unknown location workspace.'));
    if(loading)return loading;
    loading=(async()=>{
    const city=selectedCity(context);
    window.PTBO_REQUESTED_CITY=city.id;
    if(city.id==='peterborough')await script('cities/peterborough/package.js');
    else if(city.locationDataUrl||city.geoDataUrl) {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      try {
        const response=await fetch(asset(city.locationDataUrl||city.geoDataUrl),{signal:controller.signal});
        if(!response.ok)throw new Error('City locations could not load.');
        installPack(await response.json(),city);
      } finally{clearTimeout(timer);}
    }
    else {
      await script('cities/preview-package-factory.js');
      await script(`cities/${city.id}/package.js`);
      await window.PTBO_CITY_PACKAGE_READY;
    }
    if(context==='route'){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);let manifest;
      try{const response=await fetch(asset(city.routeDataUrl),{signal:controller.signal});if(!response.ok)throw new Error('City route manifest could not load.');manifest=await response.json();}finally{clearTimeout(timer);}
      if(manifest?.schemaVersion!==1||manifest.cityId!==city.id||!manifest.graphVersion||!manifest.costProfileVersion||!Array.isArray(manifest.coverage)||!manifest.baseAccess||typeof manifest.baseAccess!=='object'||!manifest.networkUrl)throw new Error('The selected city route data could not be verified.');
      const network=new URL(manifest.networkUrl,asset(city.routeDataUrl)),allowed=new URL(`cities/${city.id}/`,root);
      if(network.origin!==allowed.origin||!network.pathname.startsWith(allowed.pathname)||!network.pathname.endsWith('/route-network.js'))throw new Error('The selected city road network could not be verified.');
      network.searchParams.set('v',version);
      const pack=window.PTBO_CITY_PACKAGE;
      window.PTBO_CITY_PACKAGE={...pack,features:{...pack.features,routeMapping:true},route:{...manifest,available:true,networkUrl:network.href}};
      window.PTBO_ACTIVE_CITY=window.PTBO_CITY_PACKAGE;
    }
    await script('shared/base-locations.js');
    // An explicit script city prevents another tab's preference changing this namespace.
    await script('shared/dispatch-locations.js',{city:city.id});
    await window.PTBO_DISPATCH_STORE.ready();
    try{localStorage.setItem('ptboSelectedCity',city.id);}catch(_){}
    return window.PTBO_CITY_PACKAGE;
    })();
    loading.catch(()=>{});
    return loading;
  }
  window.PTBO_CITY_LOCATION_RUNTIME=Object.freeze({load});
})();
