/* One bootstrap for desktop, mobile and legacy online Geo Guesser surfaces. */
(() => {
  'use strict';
  const VERSION = window.PTBO_BUILD?.version || '1.6.99';
  const surface = document.currentScript?.dataset.geoSurface || 'desktop';
  const frame = document.getElementById('game-frame');
  const loading = document.getElementById('loading');
  const status = document.getElementById('startup-status');
  const recovery = document.getElementById('startup-recovery');
  const retry = document.getElementById('startup-retry');
  let owner = null, deadline, probe, stopped = false, waitingDocument = null;
  const pendingScripts = new Set();
  function owns(token) { return !stopped && owner === token && !token.cancelled && frame.contentDocument === token.doc; }
  function cancelOwner() {
    if (owner) owner.cancelled = true;
    for (const cancel of pendingScripts) cancel();
    pendingScripts.clear();
    clearTimeout(probe);
  }
  function cover(message) {
    if (loading) {
      loading.hidden=false;loading.inert=false;loading.setAttribute('aria-hidden','false');
      loading.classList.remove('hidden');
    }
    if (status) status.textContent = message;
    frame.inert = true;frame.setAttribute('aria-hidden','true');
  }
  function fail() {
    if (stopped) return;
    cancelOwner();clearTimeout(deadline);
    cover('Geo Guesser could not finish loading. Check your connection and try again.');
    if (recovery) recovery.hidden = false;
    retry?.focus();
  }
  function startDeadline() {
    clearTimeout(deadline);
    if (recovery) recovery.hidden = true;
    cover('Loading Geo Guesser… Preparing the call database.');
    deadline = setTimeout(fail, 20000);
  }
  function addScript(token, src) {
    return new Promise((resolve, reject) => {
      if (!owns(token)) { reject(new Error('Game document changed.'));return; }
      const doc=token.doc,script=doc.createElement('script');let settled=false,timer;
      const cancel=()=>finish(new Error('Game document changed.'));
      const finish=error=>{
        if(settled)return;settled=true;clearTimeout(timer);pendingScripts.delete(cancel);
        script.onload=script.onerror=null;
        if(error){script.remove();reject(error)}else resolve();
      };
      pendingScripts.add(cancel);
      timer=setTimeout(()=>finish(new Error('The optional scoreboard took too long to connect.')),15000);
      script.src=src;script.onload=()=>finish(owns(token)?null:new Error('Game document changed.'));
      script.onerror=()=>finish(new Error('The optional scoreboard could not connect.'));
      doc.head.appendChild(script);
    });
  }
  function bridge() {
    if (window.__geoScoreBridgeInstalled) return;
    window.__geoScoreBridgeInstalled = true;
    window.geoScoreContext = () => ({
      responseTimeSeconds: Number(elapsed.toFixed(1)),
      station: station?.name || 'Unknown Station',
      callType: modeName(),
      completed: sessionEnded && gameMode !== 'open' && history.length === targets.length && history.length > 0,
      sessionId: scoreSessionId,
    });
    const message = (id, text) => {
      show(id);
      const list = document.querySelector('#' + id + ' .list');
      if (list) { const paragraph = document.createElement('p'); paragraph.className = 'muted'; paragraph.textContent = text; list.replaceChildren(paragraph); }
    };
    window.showPersonalScores = () => message('scores', 'Connecting to the online scoreboard…');
    window.showCityTenScores = () => message('city-ten-scores', 'Connecting to the online scoreboard…');
    window.saveScore = () => { document.getElementById('score-status').textContent = 'The optional online scoreboard is connecting. Your device save is available.'; };
    window.shareOnlineScore = () => window.saveScore();
    window.geoScoreboardFailure = error => {
      const text = 'Online scores are unavailable. You can keep practising and save scores on this device.';
      window.showPersonalScores = () => message('scores', text);
      window.showCityTenScores = () => message('city-ten-scores', text);
      window.saveScore = () => { document.getElementById('score-status').textContent = text; };
    };
  }
  async function installClients(token) {
    if (!owns(token)) return;
    const doc=token.doc;
    const game = frame.contentWindow;
    // BFCache restores this same child document, including its live handlers.
    // Reuse its client rather than replacing handlers with the loading bridge.
    if (game.__geoScoreboardReady) {
      await game.__geoScoreboardReadyPromise;
      return;
    }
    if (!game.__geoScoreBridgeInstalled) {
      const script = doc.createElement('script');
      script.textContent = '(' + bridge.toString() + ')();';
      doc.body.appendChild(script);
    }
    if (!game.firebase?.initializeApp) await addScript(token, 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
    if (!owns(token)) return;
    if (!game.firebase?.firestore) await addScript(token, 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore-compat.js');
    if (!owns(token)) return;
    await addScript(token, new URL('../firebase-scoreboard-compat.js?v=' + VERSION, location.href).href);
    if (!game.__geoScoreboardReady) throw new Error('Scoreboard client did not finish installing.');
    await game.__geoScoreboardReadyPromise;
  }
  function patchMobile(doc) {
    // The core now owns responsive overlays for every surface.
    doc.body.classList.add('geo-mobile');
  }
  async function install() {
    if (stopped) return;
    const doc=frame?.contentDocument;
    if (!doc || doc===waitingDocument) return;
    if (owner?.doc!==doc) {
      cancelOwner();owner={doc,cancelled:false,started:false};
      startDeadline();
    }
    const token=owner;
    if(token.cancelled||token.started)return;
    if(typeof frame.contentWindow?.show!=='function'||!frame.contentWindow.__ptboGeoCoreReady) {
      clearTimeout(probe);probe=setTimeout(()=>void install(),100);return;
    }
    token.started=true;
    if(surface!=='desktop')patchMobile(doc);
    try { await window.PTBO_DISPATCH_STORE?.ready?.(); }
    catch(error) { console.error('Unable to load shared dispatch data.',error); }
    if(!owns(token))return;
    clearTimeout(deadline);clearTimeout(probe);
    if (loading) {
      loading.classList.add('hidden');loading.hidden=true;loading.inert=true;loading.setAttribute('aria-hidden','true');
    }
    frame.inert=false;frame.setAttribute('aria-hidden','false');
    frame.contentWindow.focus?.();
    void installClients(token).catch(error=>{
      if(owns(token))frame.contentWindow.geoScoreboardFailure?.(error);
      console.warn('Optional online scoreboard unavailable.',error);
    });
  }
  retry?.addEventListener('click',()=>{
    cancelOwner();waitingDocument=frame.contentDocument;owner=null;
    startDeadline();const url=new URL(frame.src,location.href);
    url.searchParams.set('retry',String(Date.now()));frame.src=url.href;
  });
  frame?.addEventListener('load',()=>{if(frame.contentDocument!==waitingDocument)waitingDocument=null;void install()});
  window.addEventListener('pagehide',()=>{stopped=true;cancelOwner();clearTimeout(deadline)});
  window.addEventListener('pageshow',event=>{if(!event.persisted)return;stopped=false;owner=null;waitingDocument=null;startDeadline();void install()});
  if(frame){startDeadline();if(frame.contentDocument?.readyState==='complete')void install()}
})();
