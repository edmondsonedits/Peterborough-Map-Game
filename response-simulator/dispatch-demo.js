/* Optional five-call session layered over the shared Fire/EMS dispatch workflow. */
(() => {
  'use strict';
  if (window.PTBO_DISPATCH_DEMO) return;
  const completed = new Set();
  function callIds() {
    const ids = window.PTBO_CITY_PACKAGE?.dispatch?.demoCallIds;
    return Array.isArray(ids) && ids.length === 5 && ids.every(id => typeof id === 'string' && id.trim()) && new Set(ids).size === 5 ? ids : null;
  }
  const enabled = () => Boolean(callIds());
  function progress() {
    const ids = callIds();
    const count = ids ? ids.filter(id => completed.has(id)).length : 0;
    return Object.freeze({completed:count,total:ids?.length || 0,finished:Boolean(ids && count === ids.length)});
  }
  const canStart = () => !progress().finished;
  function filterCandidates(candidates) {
    const ids = callIds();
    return ids ? candidates.filter(item => ids.includes(item.id) && !completed.has(item.id)) : candidates;
  }
  function render() {
    if (!enabled()) return;
    const state = progress();
    let label = document.getElementById('ptbo-demo-progress');
    if (!label) {
      const container = document.querySelector('.hud-timer-block');
      if (!container) return;
      label = document.createElement('div');
      label.id = 'ptbo-demo-progress';
      label.style.cssText = 'font-size:9px;font-weight:750;color:#cbd5e1;margin-bottom:5px;white-space:nowrap';
      label.setAttribute('role','status');
      label.setAttribute('aria-live','polite');
      container.appendChild(label);
    }
    label.textContent = `DEMO · ${state.completed} / ${state.total} complete`;
    if (!state.finished) return;
    const content = document.getElementById('hud-content');
    if (content) {
      const title = document.createElement('div');title.className = 'hud-title';title.textContent = 'DEMO COMPLETE';
      const message = document.createElement('p');message.className = 'hud-address';message.textContent = '5 calls completed';
      const request = document.createElement('a');request.id = 'ptbo-demo-request';request.className = 'hud-meta';request.textContent = 'Request Full Version';
      const url = new URL('../',location.href);url.searchParams.set('city',window.PTBO_CITY_PACKAGE.id);url.hash = 'request-full-dispatch';
      request.href = url.href;request.target = '_top';request.style.cssText = 'display:inline-block;color:#7dd3fc;text-underline-offset:3px;margin-top:6px';
      content.replaceChildren(title,message,request);
    }
    const action = document.getElementById('hud-action-btn');
    if (action) {action.textContent = 'Replay Demo';action.disabled = false;action.style.opacity = '1';}
  }
  function complete(incident) {
    const ids = callIds();
    if (!ids?.includes(incident?.id) || completed.has(incident.id)) return false;
    completed.add(incident.id);
    render();
    return true;
  }
  function reset() {
    completed.clear();
    if (enabled()) {
      const action = document.getElementById('hud-action-btn');
      if (action) {action.textContent = 'Start Call';action.disabled = false;}
      render();
    }
    return progress();
  }
  window.PTBO_DISPATCH_DEMO = Object.freeze({enabled,canStart,filterCandidates,complete,reset,progress,render});
  render();
})();
