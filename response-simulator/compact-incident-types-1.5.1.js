(() => {
  'use strict';

  /* ================================================================
     COMPACT INCIDENT FILTERS

     The twelve incident checkboxes are still fully available, but they are
     placed inside a collapsed disclosure panel. This makes the settings
     menu much shorter for players who normally leave every call enabled.
     The summary always shows how many incident types are currently active.
     ================================================================ */

  const VERSION = '1.5.1';
  if (window.PTBO_COMPACT_INCIDENT_TYPES?.version === VERSION) return;

  function installStyles() {
    if (document.getElementById('ptbo-incident-disclosure-style')) return;
    const style = document.createElement('style');
    style.id = 'ptbo-incident-disclosure-style';
    style.textContent = `
      #ptbo-incident-types-disclosure{margin:10px 0 14px;border:1px solid #d7dce2;border-radius:9px;background:#f8fafc;overflow:hidden}
      #ptbo-incident-types-summary{min-height:42px;display:grid;grid-template-columns:minmax(0,1fr) auto 20px;align-items:center;gap:8px;padding:9px 11px;color:#334155;cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;list-style:none;touch-action:manipulation}
      #ptbo-incident-types-summary::-webkit-details-marker{display:none}
      #ptbo-incident-types-summary::after{content:'+';font-size:18px;font-weight:600;line-height:1;text-align:center}
      #ptbo-incident-types-disclosure[open] #ptbo-incident-types-summary::after{content:'−'}
      #ptbo-incident-types-count{padding:3px 7px;color:#475569;border:1px solid #cbd5e1;border-radius:999px;background:#fff;font-size:9px;letter-spacing:0;text-transform:none;white-space:nowrap}
      #ptbo-incident-types-content{padding:4px 11px 8px;border-top:1px solid #e2e8f0;background:#fff}
      #ptbo-incident-types-content>.sub-cat-group:last-child{margin-bottom:2px}
      @media(max-width:480px){#ptbo-incident-types-summary{min-height:46px;padding:10px 12px}}
    `;
    document.head.appendChild(style);
  }

  function updateCount(details) {
    const boxes = [...details.querySelectorAll('.filter-chk')];
    const selected = boxes.filter(box => box.checked).length;
    const count = details.querySelector('#ptbo-incident-types-count');
    if (!count) return;

    count.textContent = selected === boxes.length
      ? `All ${boxes.length} active`
      : `${selected} of ${boxes.length} active`;
  }

  function installDisclosure() {
    const panel = document.querySelector('.panel-scroll');
    if (!panel) return false;
    if (document.getElementById('ptbo-incident-types-disclosure')) return true;

    const title = [...panel.querySelectorAll('.section-title')]
      .find(node => node.textContent.trim() === 'Incident Types');
    if (!title) return false;

    /* Everything between “Incident Types” and the next section heading is
       part of the filter list. Moving those existing elements preserves the
       original checkboxes and the dispatch logic already attached to them. */
    const nextSection = (() => {
      let node = title.nextElementSibling;
      while (node && !node.classList.contains('section-title')) node = node.nextElementSibling;
      return node;
    })();

    const details = document.createElement('details');
    details.id = 'ptbo-incident-types-disclosure';
    details.open = false;

    const summary = document.createElement('summary');
    summary.id = 'ptbo-incident-types-summary';
    summary.innerHTML = '<span>Incident Types</span><span id="ptbo-incident-types-count"></span>';

    const content = document.createElement('div');
    content.id = 'ptbo-incident-types-content';

    panel.insertBefore(details, title);
    details.append(summary, content);

    let node = title.nextSibling;
    title.remove();
    while (node && node !== nextSection) {
      const next = node.nextSibling;
      content.appendChild(node);
      node = next;
    }

    details.addEventListener('change', event => {
      if (event.target.matches('.filter-chk')) updateCount(details);
    });
    updateCount(details);
    installStyles();
    return true;
  }

  function install() {
    if (installDisclosure()) return;

    // Some simulator enhancements build their settings after page load.
    // Observe briefly so this panel still installs in either load order.
    const observer = new MutationObserver(() => {
      if (installDisclosure()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
  }

  window.PTBO_COMPACT_INCIDENT_TYPES = Object.freeze({ version: VERSION, install: installDisclosure });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
