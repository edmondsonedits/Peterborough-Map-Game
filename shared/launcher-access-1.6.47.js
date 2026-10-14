/* v1.6.47 launcher hotfix: reliable in-page Dispatch Editor password dialog. */
(() => {
  'use strict';

  const VERSION = '1.6.47';
  const EDITOR_KEY = 'ptbo-emergency-developer-mode';
  const editorLink = document.getElementById('dispatch-editor-link');
  if (!editorLink) return;

  window.PTBO_LAUNCHER_PATCH = Object.freeze({ version: VERSION, editorPasswordModal: true });

  const refreshVersionMarker = () => {
    document.documentElement.dataset.ptboLauncherVersion = VERSION;
    const badge = document.getElementById('ptbo-build-badge');
    if (badge) {
      badge.textContent = `v${VERSION}`;
      badge.setAttribute('aria-label', `Production launcher version ${VERSION}`);
    }
  };
  refreshVersionMarker();
  setTimeout(refreshVersionMarker, 0);
  addEventListener('pageshow', refreshVersionMarker);

  const style = document.createElement('style');
  style.id = 'ptbo-editor-unlock-style';
  style.textContent = `
    #ptbo-editor-unlock[hidden]{display:none!important}
    #ptbo-editor-unlock{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(2,8,23,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
    #ptbo-editor-unlock .unlock-panel{width:min(100%,430px);padding:24px;border:1px solid rgba(52,211,153,.42);border-radius:18px;background:#101d31;box-shadow:0 24px 70px rgba(0,0,0,.55);color:#f8fafc}
    #ptbo-editor-unlock .unlock-eyebrow{margin:0 0 7px;color:#34d399;font:850 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.13em;text-transform:uppercase}
    #ptbo-editor-unlock h2{margin:0;font:850 25px/1.15 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:-.025em}
    #ptbo-editor-unlock .unlock-copy{margin:9px 0 18px;color:#cbd5e1;font:500 14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
    #ptbo-editor-unlock label{display:block;margin-bottom:7px;color:#e2e8f0;font:800 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
    #ptbo-editor-password{width:100%;min-height:48px;padding:11px 13px;border:1px solid rgba(255,255,255,.2);border-radius:11px;outline:none;background:#07111f;color:#f8fafc;font:700 16px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif}
    #ptbo-editor-password:focus{border-color:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.17)}
    #ptbo-editor-unlock-error{min-height:20px;margin:8px 0 0;color:#fda4af;font:750 12px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
    #ptbo-editor-unlock .unlock-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:15px}
    #ptbo-editor-unlock button{min-height:46px;padding:10px 14px;border-radius:11px;font:850 14px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
    #ptbo-editor-unlock-cancel{border:1px solid rgba(255,255,255,.18);background:#1e293b;color:#f8fafc}
    #ptbo-editor-unlock-submit{border:1px solid #34d399;background:#34d399;color:#06120e}
    #ptbo-editor-unlock button:focus-visible{outline:3px solid #fbbf24;outline-offset:3px}
    @media(max-width:480px){#ptbo-editor-unlock{padding:14px}#ptbo-editor-unlock .unlock-panel{padding:20px}.unlock-actions{grid-template-columns:1fr!important}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'ptbo-editor-unlock';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'ptbo-editor-unlock-title');
  overlay.innerHTML = `
    <form class="unlock-panel" id="ptbo-editor-unlock-form" novalidate>
      <p class="unlock-eyebrow">Password protected</p>
      <h2 id="ptbo-editor-unlock-title">Unlock Dispatch Editor</h2>
      <p class="unlock-copy">Enter the Dispatch Editor password to continue.</p>
      <label for="ptbo-editor-password">Password</label>
      <input id="ptbo-editor-password" name="password" type="password" autocomplete="current-password" spellcheck="false" required>
      <p id="ptbo-editor-unlock-error" role="alert" aria-live="polite"></p>
      <div class="unlock-actions">
        <button id="ptbo-editor-unlock-cancel" type="button">Cancel</button>
        <button id="ptbo-editor-unlock-submit" type="submit">Unlock Editor</button>
      </div>
    </form>
  `;
  document.body.appendChild(overlay);

  const form = document.getElementById('ptbo-editor-unlock-form');
  const passwordInput = document.getElementById('ptbo-editor-password');
  const errorText = document.getElementById('ptbo-editor-unlock-error');
  const cancelButton = document.getElementById('ptbo-editor-unlock-cancel');
  const submitButton = document.getElementById('ptbo-editor-unlock-submit');
  const launchStatus = document.getElementById('launch-status');
  let previousOverflow = '';

  const readExistingAccessHash = () => {
    for (const script of document.scripts) {
      const source = script.textContent || '';
      const match = source.match(/accessHash\s*=\s*['"]([a-f0-9]{64})['"]/i);
      if (match) return match[1].toLowerCase();
    }
    return '';
  };

  const openDialog = () => {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay.hidden = false;
    errorText.textContent = '';
    passwordInput.value = '';
    requestAnimationFrame(() => passwordInput.focus());
  };

  const closeDialog = () => {
    overlay.hidden = true;
    document.body.style.overflow = previousOverflow;
    errorText.textContent = '';
    passwordInput.value = '';
    editorLink.focus({ preventScroll: true });
  };

  const digest = async value => {
    if (!globalThis.crypto?.subtle) throw new Error('Secure password verification is unavailable.');
    const bytes = new TextEncoder().encode(value);
    const result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
  };

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#dispatch-editor-link') : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openDialog();
  }, true);

  cancelButton.addEventListener('click', closeDialog);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeDialog();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !overlay.hidden) {
      event.preventDefault();
      closeDialog();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const value = passwordInput.value.trim();
    if (!value) {
      errorText.textContent = 'Enter the password to continue.';
      passwordInput.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Checking…';
    errorText.textContent = '';
    try {
      const accessHash = readExistingAccessHash();
      if (!accessHash) throw new Error('The launcher password verifier could not be found.');
      const valid = await digest(value) === accessHash;
      if (!valid) {
        errorText.textContent = 'Incorrect password. Try again.';
        passwordInput.select();
        return;
      }
      try { localStorage.setItem(EDITOR_KEY, 'enabled'); } catch (_) {}
      if (launchStatus) launchStatus.textContent = 'Opening Dispatch Editor…';
      location.assign(editorLink.href);
    } catch (error) {
      console.error('Dispatch Editor password verification failed.', error);
      errorText.textContent = 'Password verification is unavailable in this browser.';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Unlock Editor';
    }
  });
})();
