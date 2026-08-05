import { GAME_STATES } from './config.js';
import { meters, pointFrom } from './math.js';
import { migratePhase4Save } from './phase4-save.js';
import { migrateProgression } from './progression.js';
import { migrateSave } from './save.js';
import { driveSpeedScale, driveThrottleDemand, reverseSpeedScale, selectSafeExit } from './player-benefit-math.js';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function visible(element) {
  return Boolean(element && element.classList.contains('show'));
}

function installAccessiblePanel(showOwner, methodName, panel, closeButtonSelector) {
  if (!showOwner || typeof showOwner[methodName] !== 'function' || !panel) return;
  const original = showOwner[methodName].bind(showOwner);
  let returnFocus = null;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-hidden', visible(panel) ? 'false' : 'true');

  showOwner[methodName] = show => {
    if (show) returnFocus = document.activeElement;
    const result = original(show);
    panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    if (show) {
      requestAnimationFrame(() => {
        const preferred = panel.querySelector(closeButtonSelector) || panel.querySelector(FOCUSABLE);
        preferred?.focus?.({ preventScroll:true });
      });
    } else if (returnFocus && typeof returnFocus.focus === 'function') {
      returnFocus.focus({ preventScroll:true });
      returnFocus = null;
    }
    return result;
  };
}

function topOpenPanel() {
  return [
    document.getElementById('phase5-tutorial'),
    document.getElementById('phase5-panel'),
    document.getElementById('phase4-panel'),
    document.getElementById('phase3-panel'),
    document.getElementById('phase2-panel'),
    document.getElementById('settings-panel'),
    document.getElementById('pause-panel')
  ].find(visible) || null;
}

export function installPhase5Polish(controller) {
  const { game, phase2, phase3, phase4 } = controller;

  // Core dispatch is intentionally allowed to be called without an argument.
  // Resolve that call before it reaches the Phase 5 variant wrapper so every
  // automatic dispatch receives a complete incident record.
  const dispatch = game.dispatchCall.bind(game);
  game.dispatchCall = call => {
    const resolvedCall = call || game.selectCall();
    if (!resolvedCall) {
      game.dispatchCountdown = game.options.testMode ? .2 : 1.2;
      game.ui.toast('DISPATCH RETRYING · NO VALID INCIDENT WAS AVAILABLE');
      return false;
    }
    return dispatch(resolvedCall);
  };

  // Preserve the Phase 4 post-call readiness pause while guaranteeing that a
  // newly started shift cannot remain available forever if another wrapper
  // clears the countdown during initialization.
  const startShift = game.startShift.bind(game);
  game.startShift = () => {
    const result = startShift();
    if (game.state.current === GAME_STATES.AVAILABLE && !game.activeCall && !phase4.waitingForReady && game.dispatchCountdown == null) {
      game.dispatchCountdown = game.options.testMode ? .25 : 2.8;
    }
    return result;
  };

  // Shape only the commanded speed, not the steering direction. Keyboard and
  // full-stick inputs remain unchanged; partial thumb-stick travel now gives
  // a useful crawl range instead of immediately commanding 20%+ throttle.
  const updateTruck = game.updateTruck.bind(game);
  game.updateTruck = dt => {
    const magnitude = game.input.movement().magnitude;
    const tuning = game.ui.settings.tuning;
    const speedScale = driveSpeedScale(magnitude);
    const reverseScale = reverseSpeedScale(magnitude);
    const snapshot = {
      maxNormalSpeed:tuning.maxNormalSpeed,
      maxBoostedSpeed:tuning.maxBoostedSpeed,
      reverseSpeed:tuning.reverseSpeed
    };
    game.playerBenefitMetrics = {
      ...(game.playerBenefitMetrics || {}),
      rawThrottle:magnitude,
      shapedThrottle:driveThrottleDemand(magnitude)
    };
    tuning.maxNormalSpeed *= speedScale;
    tuning.maxBoostedSpeed *= speedScale;
    tuning.reverseSpeed *= reverseScale;
    try {
      return updateTruck(dt);
    } finally {
      Object.assign(tuning, snapshot);
    }
  };

  // Never spawn the firefighter into moving traffic or the incident marker.
  // The old fallback always returned the first door point when every candidate
  // was blocked. The player now stays safely in the cab and receives feedback.
  const calculateSafeExit = () => {
    const candidates = [90, -90, 180, 0].map(offset => pointFrom(
      game.truck,
      game.truck.heading + offset,
      offset === 0 || offset === 180 ? 5.3 : 4
    ));
    return selectSafeExit(
      candidates,
      game.traffic.vehicles.filter(vehicle => vehicle.active),
      game.activeCall,
      meters
    );
  };
  game.safeExitPoint = calculateSafeExit;
  const exitTruck = game.exitTruck.bind(game);
  game.exitTruck = () => {
    if (game.mode !== 'truck') return false;
    if (Math.abs(game.truck.speed) > 1.2) {
      game.ui.toast('STOP THE APPARATUS BEFORE EXITING', 1100);
      return false;
    }
    const exit = calculateSafeExit();
    if (!exit) {
      game.ui.toast('EXIT BLOCKED · MOVE THE APPARATUS OR WAIT FOR TRAFFIC', 1800);
      return false;
    }
    const safeExitPoint = game.safeExitPoint;
    game.safeExitPoint = () => exit;
    try {
      exitTruck();
      return game.mode === 'foot';
    } finally {
      game.safeExitPoint = safeExitPoint;
    }
  };

  // Keyboard users can now close and traverse management panels without
  // steering or activating equipment behind them. Focus returns to the button
  // that opened a panel when it closes.
  installAccessiblePanel(controller.ui, 'show', document.getElementById('phase5-panel'), '[data-phase5="close"]');
  installAccessiblePanel(phase4.ui, 'show', document.getElementById('phase4-panel'), '[data-phase4="close"]');
  installAccessiblePanel(phase3.ui, 'show', document.getElementById('phase3-panel'), '[data-phase3="close"]');
  installAccessiblePanel(phase2.ui, 'show', document.getElementById('phase2-panel'), '[data-phase2="close"]');
  installAccessiblePanel(game.ui, 'showSettings', document.getElementById('settings-panel'), '#settings-close');

  window.addEventListener('pfr:close-top-ui', () => {
    if (visible(document.getElementById('phase5-tutorial'))) controller.dismissTutorial();
    else if (visible(document.getElementById('phase5-panel'))) controller.ui.show(false);
    else if (visible(document.getElementById('phase4-panel'))) phase4.ui.show(false);
    else if (visible(document.getElementById('phase3-panel'))) phase3.ui.show(false);
    else if (visible(document.getElementById('phase2-panel'))) phase2.ui.show(false);
    else if (visible(document.getElementById('settings-panel'))) game.ui.showSettings(false);
    else if (visible(document.getElementById('pause-panel'))) game.resume();
  });

  window.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const panel = topOpenPanel();
    if (!panel) return;
    const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter(element => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, true);

  // Imported saves are accepted only between calls and every included layer is
  // passed through its own migration/clamping function. Raw text can no longer
  // grant arbitrary unlocks or inject malformed Phase 2 statistics.
  controller.importSave = text => {
    if (game.activeCall || ![GAME_STATES.START_SCREEN, GAME_STATES.AVAILABLE].includes(game.state.current)) {
      game.ui.toast('IMPORT SAVES BETWEEN CALLS AT QUARTERS', 2600);
      return false;
    }
    const result = controller.save.importBundle(text);
    if (!result.ok) {
      game.ui.toast(result.message.toUpperCase(), 3200);
      return false;
    }
    let bundle;
    try {
      bundle = JSON.parse(text);
    } catch {
      game.ui.toast('INVALID SAVE FILE', 2600);
      return false;
    }
    if (bundle.phase4) {
      phase4.save.data = migratePhase4Save(bundle.phase4);
      phase4.save.persist();
    }
    if (bundle.phase3) {
      phase3.progression.data = migrateProgression(bundle.phase3);
      phase3.progression.persist();
    }
    if (bundle.phase2) {
      phase2.save.data = migrateSave(bundle.phase2);
      phase2.save.persist();
    }
    controller.applyAccessibility();
    phase4.applyDeployment(true);
    controller.ui.update(true);
    game.ui.toast('CAREER IMPORTED AND VALIDATED');
    return true;
  };

  // Reset every persistent career layer, including the exact Phase 2 key.
  // The earlier fallback key is retained for players who opened development builds.
  controller.resetCareer = () => {
    for (const key of [
      'pfr-phase5-final-release',
      'pfr-phase4-city-career',
      'pfr-phase3-progression',
      'pfr-street-shift-phase2',
      'pfr-street-shift-save'
    ]) {
      try { localStorage.removeItem(key); } catch {}
    }
    game.ui.toast('CAREER RESET · RELOADING');
    setTimeout(() => location.reload(), 450);
  };
}
