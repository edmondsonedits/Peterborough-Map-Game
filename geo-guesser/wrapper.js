/* All Geo Guesser surfaces share the same address-only application. */
(() => {
  const frame=document.getElementById('game-frame'),loading=document.getElementById('loading');
  let installed=null;
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
