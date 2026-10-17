/* Station choices shared by the route picker and gameplay entry. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PTBO_ROUTE_STATIONS=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function stationChoices(bases,data,service){
    const manifest=data?.routeResponses;
    if(manifest?.schemaVersion!==1||!Array.isArray(manifest.bases)||!Array.isArray(data.routeCalls)||!Number.isInteger(manifest.minCallsPerBase)||manifest.minCallsPerBase<3)throw new Error('Local station call data is unavailable.');
    const calls=new Map(data.routeCalls.map(call=>[call.id,call]));
    return bases.filter(base=>base.service===service).map(base=>{
      const profile=manifest.bases.find(p=>p.baseId===base.id&&p.service===service);
      const callCount=[...new Set(Array.isArray(profile?.callIds)?profile.callIds:[])].filter(id=>{
        const call=calls.get(id);return call?.routeBaseId===base.id&&call.trainingServices?.length===1&&call.trainingServices[0]===service&&call.main===(service==='ems'?'Medical':'Fire');
      }).length;
      return {base,callCount,available:Boolean(profile&&!profile.unavailable&&callCount>=manifest.minCallsPerBase)};
    }).sort((a,b)=>Number(a.base.number)-Number(b.base.number)||a.base.name.localeCompare(b.base.name));
  }
  function filterStations(choices,query){
    const words=String(query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return choices.filter(({base})=>words.every(word=>[base.number,base.name,base.shortName,base.address].join(' ').toLocaleLowerCase().includes(word)));
  }
  function destination(href,file,{city,service,station,version}){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city)||!['fire','ems'].includes(service))throw new Error('Choose a valid city and service.');
    const source=new URL(href),url=new URL(file,source);
    url.searchParams.set('city',city);url.searchParams.set('service',service);
    if(station)url.searchParams.set('station',station);
    if(version)url.searchParams.set('v',version);
    if(source.searchParams.get('analytics')==='off')url.searchParams.set('analytics','off');
    return url.href;
  }
  return Object.freeze({stationChoices,filterStations,playUrl:(href,options)=>destination(href,'play.html',options),pickerUrl:(href,options)=>destination(href,'./',options)});
});
