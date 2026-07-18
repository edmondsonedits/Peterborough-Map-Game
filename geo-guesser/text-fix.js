(() => {
  'use strict';

  if (window.__geoTextRepairInstalled) return;
  window.__geoTextRepairInstalled = true;

  const replacements = [
    ['ðŸŒŠ', '🌊'],
    ['ðŸš—', '🚗'],
    ['ðŸ”¥', '🔥'],
    ['âœš', '✚'],
    ['â†', '←'],
    ['â†’', '→'],
    ['â€”', '—'],
    ['â€“', '–'],
    ['â€¦', '…'],
    ['â€™', '’'],
    ['â€˜', '‘'],
    ['â€œ', '“'],
    ['â€', '”'],
    ['Â·', '·'],
    ['Â©', '©'],
    ['Â®', '®'],
    ['Â°', '°'],
    ['Â ', ' ']
  ];

  function repairText(value) {
    if (!value || typeof value !== 'string') return value;
    let fixed = value;
    for (const [broken, correct] of replacements) fixed = fixed.split(broken).join(correct);
    return fixed;
  }

  function repairElement(element) {
    if (!(element instanceof Element)) return;
    for (const attribute of ['title', 'aria-label', 'placeholder', 'alt']) {
      if (!element.hasAttribute(attribute)) continue;
      const original = element.getAttribute(attribute);
      const fixed = repairText(original);
      if (fixed !== original) element.setAttribute(attribute, fixed);
    }
  }

  function repairTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const fixed = repairText(root.nodeValue);
      if (fixed !== root.nodeValue) root.nodeValue = fixed;
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE) repairElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.nodeType === Node.TEXT_NODE) {
        const fixed = repairText(node.nodeValue);
        if (fixed !== node.nodeValue) node.nodeValue = fixed;
      } else {
        repairElement(node);
      }
    }
  }

  function start() {
    repairTree(document.documentElement);
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') repairTree(record.target);
        for (const node of record.addedNodes) repairTree(node);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true
    });
    window.__geoTextRepairObserver = observer;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
