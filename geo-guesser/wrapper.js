/* One bootstrap for desktop, mobile and legacy online Geo Guesser surfaces. */
(() => {
  'use strict';
  const VERSION = window.PTBO_BUILD?.version || '1.6.99';
  const surface = document.currentScript?.dataset.geoSurface || 'desktop';
  const frame = document.getElementById('game-frame');
  const loading = document.getElementById('loading');
  let installedDocument = null;
  function addScript(doc, src) {
    return new Promise((resolve, reject) => {
      const script = doc.createElement('script');
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Timed out loading ' + src)), 15000);
      script.src = src;
      script.onload = () => finish(frame.contentDocument === doc ? null : new Error('Game document changed during loading.'));
      script.onerror = () => finish(new Error('Could not load ' + src));
      doc.head.appendChild(script);
    });
  }
  function bridge() {
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
    window.saveScore = () => alert('The online scoreboard is loading.');
    window.geoScoreboardFailure = error => {
      const text = 'Scoreboard error: ' + (error?.message || error);
      window.showPersonalScores = () => message('scores', text);
      window.showCityTenScores = () => message('city-ten-scores', text);
      window.saveScore = () => alert(text);
    };
  }
  async function installClients(doc) {
    const game = frame.contentWindow;
    const script = doc.createElement('script');
    script.textContent = '(' + bridge.toString() + ')();';
    doc.body.appendChild(script);
    if (!game.firebase?.initializeApp) await addScript(doc, 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
    if (frame.contentDocument !== doc) return;
    if (!game.firebase?.firestore) await addScript(doc, 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore-compat.js');
    if (frame.contentDocument !== doc) return;
    await addScript(doc, new URL('../firebase-scoreboard-compat.js?v=' + VERSION, location.href).href);
    if (!game.__geoScoreboardReady) throw new Error('Scoreboard client did not finish installing.');
  }
  function patchMobile(doc) {
    const style = doc.createElement('style');
    style.textContent = '#game-home{display:none!important}#game.screen{padding:0!important}#game .map-container,#map{width:100vw!important;height:100dvh!important}#header{top:calc(10px + env(safe-area-inset-top))!important;left:10px!important;right:10px!important;width:auto!important;transform:none!important;padding:14px 18px 13px 68px!important;border-radius:20px!important}#confirm{bottom:calc(20px + env(safe-area-inset-bottom))!important;width:min(76vw,330px)!important}';
    if (surface === 'online') style.textContent += '#header{top:calc(66px + env(safe-area-inset-top))!important;padding:12px 20px!important}';
    doc.head.appendChild(style);
  }
  async function install() {
    const doc = frame?.contentDocument;
    if (!doc || typeof frame.contentWindow?.show !== 'function' || installedDocument === doc) return;
    installedDocument = doc;
    if (surface !== 'desktop') patchMobile(doc);
    try { await window.PTBO_DISPATCH_STORE.ready(); }
    catch (error) { console.error('Unable to load shared dispatch data.', error); }
    if (frame.contentDocument !== doc) return;
    loading?.classList.add('hidden');
    setTimeout(() => loading?.remove(), 250);
    void installClients(doc).catch(error => {
      if (frame.contentDocument === doc) frame.contentWindow.geoScoreboardFailure?.(error);
      console.warn('Optional online scoreboard unavailable.', error);
    });
  }
  frame?.addEventListener('load', () => { void install(); });
  if (frame?.contentDocument?.readyState === 'complete') void install();
})();
