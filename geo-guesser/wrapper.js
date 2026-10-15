/* All Geo Guesser surfaces share the same address-only application. */
(() => {
  const frame=document.getElementById('game-frame'),loading=document.getElementById('loading');
  let installed=null;
  if(frame){
    const page=new URL(location.href),cities=window.PTBO_CITIES||[];
    let stored=null;try{stored=localStorage.getItem('ptboSelectedCity');}catch(_){}
    const remembered=cities.find(city=>city.id===stored && city.modes?.geo);
    const cityId=page.searchParams.has('city')?String(page.searchParams.get('city')).toLowerCase():remembered?.id||'peterborough';
    const city=cities.find(city=>city.id===cityId);
    const url=new URL(frame.dataset.gameSrc || '../index.html',page);
    url.searchParams.set('city',cityId);
    const version=page.searchParams.get('v')||window.PTBO_BUILD?.version;
    if(version)url.searchParams.set('v',version);
    frame.title=(city?.name||'City')+' Geo Guesser';document.title=frame.title;
    frame.src=url.href;
    document.querySelectorAll?.('a.back').forEach(link=>{const home=new URL('../../',page);home.searchParams.set('city',cityId);link.href=home.href;});
  }
  async function install(){
    const doc=frame?.contentDocument,ready=frame?.contentWindow?.PTBO_GEO_READY;
    if(!doc||!ready||installed===doc)return;
    installed=doc;await ready;
    if(frame.contentDocument!==doc)return;
    loading?.classList.add('hidden');setTimeout(()=>loading?.remove(),250);
  }
  frame?.addEventListener('load',()=>{void install();});
  if(frame?.contentDocument?.readyState==='complete')void install();
})();
