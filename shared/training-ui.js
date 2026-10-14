/* Launcher return contract. Game state and scoring remain owned by each activity. */
(() => {
  'use strict';
  const dispatch = document.getElementById('dispatch-game-link');
  if (!dispatch) return;
  let completed = false;
  function restoreReturn() {
    if (completed) return;
    const url = new URL(location.href);
    const chooseCity = url.searchParams.get('chooseCity') === '1';
    const restoreFocus = url.searchParams.get('focus') === 'dispatch';
    if (!chooseCity && !restoreFocus) return;
    if (chooseCity && !window.PTBO_CITY_SELECTOR?.open) return;
    completed = true;
    if (chooseCity) window.PTBO_CITY_SELECTOR.open();
    else dispatch.focus();
    url.searchParams.delete('chooseCity');
    url.searchParams.delete('focus');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  addEventListener('ptbo:city-selector-ready', restoreReturn);
  addEventListener('pageshow', restoreReturn);
  restoreReturn();
})();
