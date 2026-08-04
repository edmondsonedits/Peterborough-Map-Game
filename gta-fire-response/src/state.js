import { GAME_STATES } from './config.js';

const ALLOWED = Object.freeze({
  [GAME_STATES.START_SCREEN]: [GAME_STATES.AVAILABLE],
  [GAME_STATES.AVAILABLE]: [GAME_STATES.DISPATCHED, GAME_STATES.PAUSED],
  [GAME_STATES.DISPATCHED]: [GAME_STATES.ENROUTE, GAME_STATES.ON_SCENE, GAME_STATES.PAUSED, GAME_STATES.RETURNING],
  [GAME_STATES.ENROUTE]: [GAME_STATES.ARRIVING, GAME_STATES.PAUSED, GAME_STATES.RETURNING],
  [GAME_STATES.ARRIVING]: [GAME_STATES.ON_SCENE, GAME_STATES.ENROUTE, GAME_STATES.PAUSED, GAME_STATES.RETURNING],
  [GAME_STATES.ON_SCENE]: [GAME_STATES.CALL_COMPLETE, GAME_STATES.PAUSED, GAME_STATES.RETURNING],
  [GAME_STATES.CALL_COMPLETE]: [GAME_STATES.RETURNING, GAME_STATES.PAUSED],
  [GAME_STATES.RETURNING]: [GAME_STATES.AVAILABLE, GAME_STATES.PAUSED],
  [GAME_STATES.PAUSED]: Object.values(GAME_STATES).filter(value => value !== GAME_STATES.PAUSED && value !== GAME_STATES.START_SCREEN)
});

export class GameStateMachine {
  constructor(initial = GAME_STATES.START_SCREEN) {
    this.current = initial;
    this.previous = null;
    this.pausedFrom = null;
    this.listeners = new Set();
    this.history = [{ state: initial, at: performance.now?.() ?? Date.now(), reason: 'initial' }];
  }

  canTransition(next) {
    return next === this.current || (ALLOWED[this.current] || []).includes(next);
  }

  transition(next, reason = 'unspecified', metadata = {}) {
    if (next === this.current) return false;
    if (!this.canTransition(next)) throw new Error(`Invalid game-state transition: ${this.current} -> ${next}`);
    const from = this.current;
    if (next === GAME_STATES.PAUSED) this.pausedFrom = from;
    this.previous = from;
    this.current = next;
    const event = { from, to: next, reason, metadata, at: performance.now?.() ?? Date.now() };
    this.history.push({ state: next, ...event });
    if (this.history.length > 60) this.history.shift();
    this.listeners.forEach(listener => listener(event));
    return true;
  }

  resume(reason = 'resume') {
    const target = this.pausedFrom || GAME_STATES.AVAILABLE;
    this.pausedFrom = null;
    return this.transition(target, reason);
  }

  onChange(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

export { ALLOWED as STATE_TRANSITIONS };
