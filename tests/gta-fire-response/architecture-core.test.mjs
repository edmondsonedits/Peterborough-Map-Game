import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DOMAIN_EVENTS,
  DomainEventBus,
  installCoreDomainEventBridge,
  mapStateTransitionToDomainEvents
} from '../../gta-fire-response/src/engine/domain-events.js';

test('DomainEventBus emits synchronously with deterministic monotonic sequence numbers', () => {
  const bus = new DomainEventBus();
  const received = [];
  bus.on(DOMAIN_EVENTS.CALL_DISPATCHED, event => received.push(event));

  const first = bus.emit(DOMAIN_EVENTS.CALL_DISPATCHED, { callId: 'alpha' });
  const second = bus.emit(DOMAIN_EVENTS.CALL_DISPATCHED, { callId: 'bravo' });

  assert.equal(first.sequence, 1);
  assert.equal(second.sequence, 2);
  assert.deepEqual(received.map(event => event.payload.callId), ['alpha', 'bravo']);
  assert.equal('at' in first, false, 'simulation-domain events must not inject wall-clock timestamps');
});

test('state-transition mapper exposes canonical call lifecycle events', () => {
  const game = { activeCall: { id: 'structure-1', type: 'structure-fire' } };
  const mapped = mapStateTransitionToDomainEvents({
    from: 'AVAILABLE',
    to: 'DISPATCHED',
    reason: 'dispatch-received',
    metadata: { callId: 'structure-1' }
  }, game);

  assert.deepEqual(mapped.map(event => event.type), [
    DOMAIN_EVENTS.GAME_STATE_CHANGED,
    DOMAIN_EVENTS.CALL_DISPATCHED
  ]);
  assert.equal(mapped[1].payload.callId, 'structure-1');
  assert.equal(mapped[1].payload.callType, 'structure-fire');
});

test('domain bridge observes the existing FSM without replacing its methods', () => {
  let transitionListener = null;
  const state = {
    onChange(listener) {
      transitionListener = listener;
      return () => { transitionListener = null; };
    }
  };
  const game = { state, activeCall: { id: 'mvc-1', type: 'mvc' } };
  const bus = new DomainEventBus();
  const types = [];
  bus.onAny(event => types.push(event.type));

  const uninstall = installCoreDomainEventBridge(game, bus);
  transitionListener({ from: 'DISPATCHED', to: 'ENROUTE', reason: 'engine-moving', metadata: {} });

  assert.deepEqual(types, [DOMAIN_EVENTS.GAME_STATE_CHANGED, DOMAIN_EVENTS.RESPONSE_STARTED]);
  assert.equal(typeof state.onChange, 'function');

  uninstall();
  assert.equal(transitionListener, null);
});
