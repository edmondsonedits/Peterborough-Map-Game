(() => {
  'use strict';
  const core=window.PTBO_ROUTE_STATIONS,version=window.PTBO_BUILD.version;
  const ui={picker:document.getElementById('station-picker'),city:document.getElementById('picker-city'),list:document.getElementById('station-list'),search:document.getElementById('station-search'),status:document.getElementById('station-status'),retry:document.getElementById('station-retry'),back:document.getElementById('picker-back'),fire:document.getElementById('picker-fire'),ems:document.getElementById('picker-ems')};
  let city,training,bases=[],service='fire';
  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  function render(){
    const choices=core.filterStations(core.stationChoices(bases,training,service),ui.search.value);
    ui.fire.setAttribute('aria-pressed',String(service==='fire'));ui.ems.setAttribute('aria-pressed',String(service==='ems'));
    ui.picker.dataset.service=service;ui.list.replaceChildren();
    for(const choice of choices){
      const {base,callCount,available}=choice,li=element('li'),button=element(available?'a':'div','station-choice'),badge=element('span','station-number',String(base.number).padStart(2,'0')),copy=element('span','station-copy');
      badge.setAttribute('aria-hidden','true');button.dataset.stationId=base.id;
      if(available)button.href=core.playUrl(location.href,{city:city.id,service,station:base.id,version});else button.setAttribute('aria-disabled','true');
      copy.append(element('strong','station-name',base.name),element('span','station-address',base.address),element('span','station-call-count',available?callCount+' '+(callCount===1?'call':'calls')+' available':'Calls unavailable'));
      const arrow=element('span','station-arrow','→');arrow.setAttribute('aria-hidden','true');button.append(badge,copy,arrow);li.append(button);ui.list.append(li);
      button.addEventListener('click',()=>{
        if(!available)return;
        try{localStorage.setItem('ptboRouteMappingService',service);}catch(_){}
      });
    }
    ui.status.textContent=choices.length?choices.length+' '+(choices.length===1?'station':'stations'):'No matching stations. Try a station number or street.';
  }
  function changeService(next){if(!city||service===next)return;service=next;ui.search.value='';render();}
  ui.fire.addEventListener('click',()=>changeService('fire'));ui.ems.addEventListener('click',()=>changeService('ems'));
  ui.search.addEventListener('input',()=>{if(city)render();});ui.retry.addEventListener('click',()=>location.reload());
  async function initialize(){
    try{
      city=await window.PTBO_CITY_LOCATION_RUNTIME.load({context:'route'});
      training=window.PTBO_DISPATCH_STORE.getTrainingData();bases=window.PTBO_BASE_STORE.getAll();
      const requested=new URL(location.href).searchParams.get('service');let saved;try{saved=localStorage.getItem('ptboRouteMappingService');}catch(_){}
      service=['fire','ems'].includes(requested)?requested:saved==='ems'?'ems':'fire';
      document.title='Choose a station · '+city.name+' Route Mapping';ui.city.textContent=city.name;ui.back.href='../?city='+encodeURIComponent(city.id);
      render();ui.search.disabled=false;ui.fire.disabled=false;ui.ems.disabled=false;ui.picker.setAttribute('aria-busy','false');
    }catch(error){ui.status.textContent='Could not load stations. '+(error?.message||'Please try again.');ui.status.setAttribute('role','alert');ui.retry.hidden=false;ui.picker.setAttribute('aria-busy','false');}
  }
  initialize();
})();
