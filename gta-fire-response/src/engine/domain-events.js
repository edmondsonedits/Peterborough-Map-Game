export const DOMAIN_EVENTS = Object.freeze({
  GAME_STATE_CHANGED: 'GAME_STATE_CHANGED',
  SHIFT_STARTED: 'SHIFT_STARTED',
  CALL_DISPATCHED: 'CALL_DISPATCHED',
  RESPONSE_STARTED: 'RESPONSE_STARTED',
  APPARATUS_ARRIVED: 'APPARATUS_ARRIVED',
  INCIDENT_STARTED: 'INCIDENT_STARTED',
  CALL_COMPLETED: 'CALL_COMPLETED',
  APPARATUS_AVAILABLE: 'APPARATUS_AVAILABLE'
});

/**
 * Small synchronous event bus for deterministic domain communication.
 * Events contain only a monotonic sequence number, type and explicit payload;
 * wall-clock timestamps are intentionally excluded from simulation events.
 */
export class DomainEventBus {
  constructor() {
    this.sequence = 0;
    this.listeners = new Map();
    this.anyListeners = new Set();
  }

  on(type, listener) {
    if (typeof listener !== 'function') throw new TypeError('Domain event listener must be a function.');
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  onAny(listener) {
    if (typeof listener !== 'function') throw new TypeError('Domain event listener must be a function.');
    this.anyListeners.add(listener);
    return () => this.anyListeners.delete(listener);
  }

  emit(type, payload = {}) {
    if (!type) throw new TypeError('Domain event type is required.');
    const event = Object.freeze({ sequence: ++this.sequence, type, payload });
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    for (const listener of [...this.anyListeners]) listener(event);
    return event;
  }

  clear() {
    this.listeners.clear();
    this.anyListeners.clear();
  }
}

export function mapStateTransitionToDomainEvents(transition, game) {
  const reason = transition?.reason;
  const call = game?.activeCall;
  const common = { from: transition?.from, to: transition?.to, reason };
  const events = [{ type: DOMAIN_EVENTS.GAME_STATE_CHANGED, payload: common }];

  if (reason === 'shift-started') events.push({ type: DOMAIN_EVENTS.SHIFT_STARTED, payload: common });
  if (reason === 'dispatch-received') {
    events.push({
      type: DOMAIN_EVENTS.CALL_DISPATCHED,
      payload: { ...common, callId: call?.id ?? transition?.metadata?.callId ?? null, callType: call?.type ?? null }
    });
  }
  if (reason === 'engine-moving') events.push({ type: DOMAIN_EVENTS.RESPONSE_STARTED, payload: { ...common, callId: call?.id ?? null } });
  if (reason === 'entered-arrival-zone') events.push({ type: DOMAIN_EVENTS.APPARATUS_ARRIVED, payload: { ...common, callId: call?.id ?? null } });
  if (reason === 'incident-complete') events.push({ type: DOMAIN_EVENTS.CALL_COMPLETED, payload: { ...common, callId: call?.id ?? null, completionReason: transition?.metadata?.reason ?? null } });
  if (reason === 'ready-at-station' || reason === 'restart-ready') events.push({ type: DOMAIN_EVENTS.APPARATUS_AVAILABLE, payload: common });

  return events;
}

/**
 * Strangler-migration bridge: observe the existing canonical state machine and
 * publish domain events without replacing or monkey-patching existing methods.
 */
export function installCoreDomainEventBridge(game, bus) {
  if (!game?.state?.onChange) throw new TypeError('A game with an observable state machine is required.');
  if (!(bus instanceof DomainEventBus)) throw new TypeError('A DomainEventBus is required.');
  return game.state.onChange(transition => {
    for (const event of mapStateTransitionToDomainEvents(transition, game)) bus.emit(event.type, event.payload);
  });
}
