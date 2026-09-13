/* Response simulator training-use UX and shortcut polish — v1.6.57. */
(() => {
  'use strict';

  const VERSION = '1.6.57';
  if (window.PTBO_TRAINING_UI?.version === VERSION) return;

  const hostWindow = () => {
    try { return window.parent && window.parent !== window ? window.parent : window; }
    catch (_) { return window; }
  };
  const hostDocument = () => {
    try { return hostWindow().document || document; }
    catch (_) { return document; }
  };

  const NOTICE_FLAG = 'ptboTrainingUseNotice';
  const noticeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 3.8 6.5v5.4c0 4.9 3.3 7.8 8.2 9.1 4.9-1.3 8.2-4.2 8.2-9.1V6.5L12 3Z"/><path d="M12 8v5M12 17h.01"/></svg>';

  function noticeStep() {
    return {
      [NOTICE_FLAG]: true,
      stage: 'notice',
      icon: noticeIcon,
      eyebrow: 'Before you begin',
      title: 'Training use only',
      copy: 'This simulator is for training and street-familiarization practice only. Do not use it for live response, navigation, dispatch, or operational decisions.',
      visual: '<div class="ptbo-training-use-card"><strong>TRAINING USE ONLY</strong><span>Not for live response, navigation, dispatch, or operational decisions.</span><small>You can reopen this notice anytime from the Options menu.</small></div>',
    };
  }

  function removeLegacyPinnedNotice() {
    const doc = hostDocument();
    doc.getElementById('ptbo-training-use-notice')?.remove();
    doc.getElementById('ptbo-training-use-style')?.remove();
  }

  function installHostPolish() {
    const doc = hostDocument();
    removeLegacyPinnedNotice();

    if (!doc.getElementById('ptbo-training-ui-1657-style')) {
      const style = doc.createElement('style');
      style.id = 'ptbo-training-ui-1657-style';
      style.textContent = `
        .station-shortcuts{background:transparent!important;border:0!important;box-shadow:none!important;outline:0!important;overflow:visible!important}
        .station-shortcuts::before,.station-shortcuts::after{content:none!important;display:none!important}
        .station-shortcuts .station-button{box-shadow:none!important}
        .ptbo-training-use-card{display:grid;gap:8px;padding:16px 17px;border:1px solid rgba(251,113,133,.5);border-radius:14px;background:linear-gradient(145deg,rgba(69,10,10,.9),rgba(30,10,18,.94));box-shadow:inset 0 1px rgba(255,255,255,.06)}
        .ptbo-training-use-card strong{color:#fecdd3;font-size:11px;font-weight:950;letter-spacing:.12em}
        .ptbo-training-use-card span{color:#fff;font-size:14px;font-weight:760;line-height:1.45}
        .ptbo-training-use-card small{color:#cbd5e1;font-size:10px;font-weight:650;line-height:1.4}
      `;
      doc.head?.appendChild(style);
    }

    const badge = doc.getElementById('ptbo-build-badge');
    if (badge) {
      badge.textContent = `v${VERSION}`;
      badge.setAttribute('aria-label', `Production version ${VERSION}`);
    }
    doc.documentElement.dataset.ptboRelease = VERSION;
  }

  function appendNoticeToOpenTutorial() {
    const tutorial = window.PTBO_QUICK_TUTORIAL;
    const steps = tutorial?.state?.steps;
    if (!tutorial?.state?.open || !Array.isArray(steps)) return false;
    if (!steps.some(step => step?.[NOTICE_FLAG])) steps.push(noticeStep());
    return true;
  }

  function openNoticeOnly() {
    const tutorial = window.PTBO_QUICK_TUTORIAL;
    if (!tutorial?.open || !tutorial?.state) return false;
    if (tutorial.state.open) tutorial.close?.(false);
    if (!tutorial.open({ force:true })) return false;
    appendNoticeToOpenTutorial();
    let safety = 0;
    while (tutorial.state.open && tutorial.state.step < tutorial.state.steps.length - 1 && safety < 20) {
      tutorial.next();
      safety += 1;
    }
    return true;
  }

  function installOptionsButton() {
    if (document.getElementById('ptbo-training-use-menu')) return true;
    if (!window.PTBO_QUICK_TUTORIAL) return false;
    const panel = document.querySelector('#control-panel .panel-scroll');
    if (!panel) return false;

    const button = document.createElement('button');
    button.id = 'ptbo-training-use-menu';
    button.className = 'station-spawn-box';
    button.type = 'button';
    button.textContent = 'Training Use Notice';
    button.style.borderColor = '#fb7185';
    button.addEventListener('click', () => {
      if (!document.getElementById('control-panel')?.classList.contains('minimized')) window.togglePanel?.();
      setTimeout(openNoticeOnly, 180);
    });

    const replay = document.getElementById('ptbo-replay-tutorial');
    if (replay) replay.insertAdjacentElement('afterend', button);
    else {
      const subtitle = panel.querySelector('.subtitle');
      if (subtitle) subtitle.insertAdjacentElement('afterend', button);
      else panel.prepend(button);
    }
    return true;
  }

  function sync() {
    installHostPolish();
    appendNoticeToOpenTutorial();
    installOptionsButton();
  }

  const doc = hostDocument();
  if (doc.body) {
    const observer = new MutationObserver(() => removeLegacyPinnedNotice());
    observer.observe(doc.body, { childList:true, subtree:false });
    addEventListener('pagehide', () => observer.disconnect(), { once:true });
  }

  [0, 80, 250, 600, 1200, 2500, 5000].forEach(delay => setTimeout(sync, delay));
  const tutorialPoll = setInterval(sync, 250);
  setTimeout(() => clearInterval(tutorialPoll), 15000);
  window.addEventListener('ptbo-service-change', sync);

  window.PTBO_TRAINING_UI = Object.freeze({
    version: VERSION,
    sync,
    openNotice: openNoticeOnly,
    appendNotice: appendNoticeToOpenTutorial,
  });
})();
