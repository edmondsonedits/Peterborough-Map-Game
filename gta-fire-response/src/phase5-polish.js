import { GAME_STATES } from './config.js';

export function installPhase5Polish(controller) {
  const { game, phase4 } = controller;

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
