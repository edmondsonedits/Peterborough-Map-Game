/* =========================================================
   BEGINNER CODE GUIDE — COMPACT INCIDENT-TYPE SETTINGS

   PURPOSE:
   The base simulator contains a long list of emergency-call checkboxes. This
   module places that existing list inside a collapsible section without
   changing which filters the dispatch system reads.

   WHAT THE PLAYER EXPERIENCES:
   Options opens with a short “Incident Types” row. It displays how many call
   types are enabled, expands when tapped, and provides Select All/Clear All.

   IMPORTANT DESIGN RULE:
   This file MOVES the original checkbox elements. It does not make copies.
   The dispatch code therefore continues reading the same checked values.

   HOW TO READ THIS FILE:
   - state remembers whether setup finished.
   - installStyle() defines appearance only.
   - selectedFilters(), updateCount(), and setAll() manage checkbox state.
   - install() builds the collapsible wrapper.
   - retry() waits for the Options menu to exist.

   Comments are hidden from players and ignored by the browser.
   ========================================================= */
(() => {
  'use strict';

  /*
  RELEASE VERSION:
  The version prevents duplicate installation and lets startup verification
  confirm that the expected module loaded.
  */
  const VERSION = '1.6.21';
  if (window.PTBO_COMPACT_SETTINGS?.version === VERSION) return;

  /*
  LIVE STATE:
  This module needs only one changing fact: whether the original controls have
  already been reorganized. That prevents wrapping them more than once.
  */
  const state = { installed: false };

  /*
  FUNCTION: installStyle

  WHAT THE CODE DOES:
  Creates CSS for the collapsed card, arrow, selection count, action buttons,
  and touch-friendly mobile sizing.

  WHY IT EXISTS:
  JavaScript controls behaviour; CSS controls presentation. Keeping the visual
  rules together makes the interface easier to tune without changing filters.
  */
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

  /*
  FUNCTION: selectedFilters

  WHAT THE CODE DOES:
  Finds every original incident checkbox by its shared filter-chk class and
  returns a normal array.

  WHY IT EXISTS:
  Counting, Select All, Clear All, and event binding should all use the same
  authoritative collection instead of repeating the selector in many places.
  */
  function selectedFilters() {
    return [...document.querySelectorAll('.filter-chk')];
  }

  /*
  FUNCTION: updateCount

  WHAT THE PLAYER EXPERIENCES:
  The collapsed row says either “All 12 selected” or “7 of 12 selected.”

  WHAT THE CODE DOES:
  Counts checked boxes and writes a short summary. It does not change filters.
  */
  function updateCount() {
    const count = document.getElementById('ptbo-incident-types-count');
    if (!count) return;
    const filters = selectedFilters();
    const selected = filters.filter(input => input.checked).length;
    count.textContent = selected === filters.length
      ? `All ${filters.length} selected`
      : `${selected} of ${filters.length} selected`;
  }

  /*
  FUNCTION: setAll

  WHAT THE CODE DOES:
  Checks or unchecks every incident type, then sends a normal change event for
  each checkbox before refreshing the summary.

  WHY DISPATCH CHANGE EVENTS:
  Other current or future modules may listen for checkbox changes. Updating the
  checked property alone would silently bypass those listeners.
  */
  function setAll(checked) {
    selectedFilters().forEach(input => {
      input.checked = checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    updateCount();
  }

  /*
  FUNCTION: install

  WHAT THE CODE DOES:
  1. Finds the Options panel and the original Incident Types heading.
  2. Collects every following element until the next section heading.
  3. Creates a native <details> element, collapsed by default.
  4. Replaces the old heading and moves the original controls into its body.
  5. Connects bulk-action buttons and live selection counting.

  WHY IT RETURNS TRUE/FALSE:
  retry() needs to know whether setup succeeded or whether the page is still
  loading and should be checked again shortly.
  */
  function install() {
    if (state.installed) return true;
    const existingDetails = document.getElementById('ptbo-incident-types-details');
    if (existingDetails) {
      state.installed = true;
      return true;
    }
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;

    // Base-training mode appends “— Calls Unavailable” to this heading before
    // the compact module can run. Match the stable semantic prefix rather than
    // requiring one exact label so every city shares the same Options UI.
    const title = [...panel.querySelectorAll('.section-title')]
      .find(node => node.textContent.trim().startsWith('Incident Types'));
    if (!title) return false;
    const titleText = title.textContent.trim();

    // Everything after Incident Types and before the next section belongs inside.
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
        <span id="ptbo-incident-types-summary-label"></span>
        <span id="ptbo-incident-types-count"></span>
      </summary>
      <div id="ptbo-incident-types-body">
        <div id="ptbo-incident-types-actions">
          <button class="ptbo-incident-action" id="ptbo-incident-all" type="button">Select All</button>
          <button class="ptbo-incident-action" id="ptbo-incident-none" type="button">Clear All</button>
        </div>
      </div>
    `;
    details.querySelector('#ptbo-incident-types-summary-label').textContent = titleText;

    title.replaceWith(details);
    const body = details.querySelector('#ptbo-incident-types-body');

    // appendChild moves an existing element; it does not duplicate it.
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

  /*
  FUNCTION: retry

  WHAT THE CODE DOES:
  Attempts installation and waits 60 milliseconds before trying again if the
  Options panel has not been created yet.

  WHY IT EXISTS:
  Modules are loaded asynchronously, so file order alone cannot guarantee that
  the required HTML already exists on a slow phone or first page visit.
  */
  function retry() {
    if (install()) return;
    setTimeout(retry, 60);
  }

  /*
  PUBLIC MODULE API:
  Startup verification can inspect version/state, and other code can request a
  count refresh after changing incident checkboxes.
  */
  window.PTBO_COMPACT_SETTINGS = Object.freeze({ version: VERSION, state, updateCount });
  retry();
})();
