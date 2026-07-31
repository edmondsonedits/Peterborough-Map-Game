(() => {
  'use strict';

  const VERSION = '1.5.2';
  if (window.PTBO_COMPACT_SETTINGS?.version === VERSION) return;

  const state = { installed: false };

  function installStyle() {
    if (document.getElementById('ptbo-compact-settings-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-compact-settings-style';
    style.textContent = `
      #ptbo-incident-types-details{
        margin:18px 0 10px;
        overflow:hidden;
        border:1px solid #d7dce2;
        border-radius:9px;
        background:#f7f9fb;
      }
      #ptbo-incident-types-details>summary{
        min-height:42px;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        padding:9px 11px;
        color:#374151;
        cursor:pointer;
        list-style:none;
        font-size:11px;
        font-weight:850;
        letter-spacing:.07em;
        text-transform:uppercase;
        user-select:none;
      }
      #ptbo-incident-types-details>summary::-webkit-details-marker{display:none}
      #ptbo-incident-types-details>summary::before{
        content:'›';
        flex:0 0 auto;
        color:#64748b;
        font-size:20px;
        line-height:1;
        transform:rotate(0deg);
        transition:transform .16s ease;
      }
      #ptbo-incident-types-details[open]>summary::before{transform:rotate(90deg)}
      #ptbo-incident-types-summary-label{margin-right:auto}
      #ptbo-incident-types-count{
        color:#64748b;
        font-size:9px;
        font-weight:750;
        letter-spacing:0;
        text-transform:none;
        white-space:nowrap;
      }
      #ptbo-incident-types-body{
        padding:10px 11px 5px;
        border-top:1px solid #e1e5ea;
        background:#fff;
      }
      #ptbo-incident-types-actions{
        display:flex;
        justify-content:flex-end;
        gap:6px;
        margin:0 0 10px;
      }
      .ptbo-incident-action{
        padding:6px 9px;
        color:#374151;
        border:1px solid #d1d5db;
        border-radius:6px;
        background:#f8fafc;
        font:750 10px/1 system-ui,-apple-system,"Segoe UI",sans-serif;
        cursor:pointer;
      }
      .ptbo-incident-action:active{transform:scale(.97)}
      #ptbo-incident-types-body .sub-cat-group{margin-bottom:9px}
      @media(max-width:900px),(pointer:coarse){
        #ptbo-incident-types-details{margin-top:14px}
        #ptbo-incident-types-details>summary{min-height:46px;padding:10px 12px}
      }
    `;
    document.head.appendChild(style);
  }

  function selectedFilters() {
    return [...document.querySelectorAll('.filter-chk')];
  }

  function updateCount() {
    const count = document.getElementById('ptbo-incident-types-count');
    if (!count) return;
    const filters = selectedFilters();
    const selected = filters.filter(input => input.checked).length;
    count.textContent = selected === filters.length
      ? `All ${filters.length} selected`
      : `${selected} of ${filters.length} selected`;
  }

  function setAll(checked) {
    selectedFilters().forEach(input => {
      input.checked = checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    updateCount();
  }

  function install() {
    if (state.installed || document.getElementById('ptbo-incident-types-details')) return true;
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;

    const title = [...panel.querySelectorAll('.section-title')]
      .find(node => node.textContent.trim() === 'Incident Types');
    if (!title) return false;

    const movable = [];
    let node = title.nextElementSibling;
    while (node && !node.classList.contains('section-title')) {
      movable.push(node);
      node = node.nextElementSibling;
    }
    if (!movable.length) return false;

    installStyle();

    const details = document.createElement('details');
    details.id = 'ptbo-incident-types-details';
    details.open = false;
    details.innerHTML = `
      <summary>
        <span id="ptbo-incident-types-summary-label">Incident Types</span>
        <span id="ptbo-incident-types-count"></span>
      </summary>
      <div id="ptbo-incident-types-body">
        <div id="ptbo-incident-types-actions">
          <button class="ptbo-incident-action" id="ptbo-incident-all" type="button">Select All</button>
          <button class="ptbo-incident-action" id="ptbo-incident-none" type="button">Clear All</button>
        </div>
      </div>
    `;

    title.replaceWith(details);
    const body = details.querySelector('#ptbo-incident-types-body');
    movable.forEach(item => body.appendChild(item));

    details.querySelector('#ptbo-incident-all')?.addEventListener('click', event => {
      event.preventDefault();
      setAll(true);
    });
    details.querySelector('#ptbo-incident-none')?.addEventListener('click', event => {
      event.preventDefault();
      setAll(false);
    });
    selectedFilters().forEach(input => input.addEventListener('change', updateCount));
    updateCount();

    state.installed = true;
    window.dispatchEvent(new CustomEvent('ptbo-compact-settings-ready', {
      detail: { version: VERSION, selected: selectedFilters().filter(input => input.checked).length },
    }));
    return true;
  }

  function retry() {
    if (install()) return;
    setTimeout(retry, 60);
  }

  window.PTBO_COMPACT_SETTINGS = Object.freeze({ version: VERSION, state, updateCount });
  retry();
})();
