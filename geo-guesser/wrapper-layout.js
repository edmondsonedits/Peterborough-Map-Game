/* Keep outer-page navigation clear of the shared practice game's controls. */
(() => {
  const frame = document.getElementById('game-frame');
  if (!frame) return;
  let observer;
  function watchPractice() {
    observer?.disconnect();
    const controls = frame.contentDocument?.getElementById('practice-controls');
    const sync = () => document.body.classList.toggle('station-practice-active', Boolean(controls && !controls.classList.contains('hidden')));
    sync();
    if (!controls) return;
    observer = new MutationObserver(sync);
    observer.observe(controls, { attributes: true, attributeFilter: ['class'] });
  }
  frame.addEventListener('load', watchPractice);
  watchPractice();
})();
