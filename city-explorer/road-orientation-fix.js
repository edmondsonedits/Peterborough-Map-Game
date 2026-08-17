/*
  Explorer module bootstrap.

  Earlier builds patched THREE.Quaternion.prototype globally to stop road
  meshes rolling on slopes. v1.5.5 keeps that tangent-frame calculation inside
  app.js instead, so this file remains a harmless compatibility entry point for
  existing links while no longer mutating Three.js behaviour for the page.
*/

function showFatalError(error) {
  console.error('Peterborough 3D Simulator could not start.', error);
  if (globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.fail) {
    globalThis.__PTBO_EXPLORER_BOOTSTRAP__.fail(error?.message || error || 'Unknown startup error');
    return;
  }
  const loading = document.querySelector('#loading-screen');
  if (!loading) return;
  loading.classList.remove('is-hidden');
  loading.classList.add('has-error');
  const card = document.createElement('div');
  card.className = 'loading-card error-card';
  const logo = document.createElement('div');
  logo.className = 'loading-logo';
  logo.textContent = '!';
  const title = document.createElement('p');
  title.className = 'loading-title';
  title.textContent = 'Explorer could not start';
  const explanation = document.createElement('p');
  explanation.className = 'error-explanation';
  explanation.textContent = 'The local 3D runtime or WebGL could not be initialized. Reload the page; if the problem remains, enable hardware acceleration or try a current browser.';
  const details = document.createElement('pre');
  details.className = 'error-details';
  details.textContent = String(error?.message || error || 'Unknown startup error');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'error-retry';
  retry.textContent = 'Reload explorer';
  retry.addEventListener('click', () => location.reload());
  card.append(logo, title, explanation, details, retry);
  loading.replaceChildren(card);
}

globalThis.showPeterboroughExplorerFatalError = showFatalError;

try {
  globalThis.__PTBO_EXPLORER_BOOTSTRAP__?.touch?.('loading 3D city module');
  await import('./app.js?v=1.5.6-opt4');
} catch (error) {
  showFatalError(error);
}
