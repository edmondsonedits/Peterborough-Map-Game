import { GAME_STATES } from './config.js';
import { clamp, meters } from './math.js';

export function installPhase2Hooks(controller) {
  const game = controller.game;
  const originalSelectCall = game.selectCall.bind(game);
  game.selectCall = () => game.options.forcedCall ? originalSelectCall() : controller.selectWeightedCall();

  const originalDispatch = game.dispatchCall.bind(game);
  game.dispatchCall = call => {
    const source = call || game.selectCall();
    const selected = { ...source, notes: controller.baseCallNotes.get(source.id) || source.notes };
    controller.prepareCall(selected);
    return originalDispatch(selected);
  };

  const originalEnter = game.enterTruck.bind(game);
  game.enterTruck = () => {
    const result = originalEnter();
    if (game.mode === 'truck' && !controller.callMetrics.enteredTruckAt) controller.callMetrics.enteredTruckAt = performance.now();
    return result;
  };

  const originalExit = game.exitTruck.bind(game);
  game.exitTruck = () => {
    const before = game.mode;
    const result = originalExit();
    if (before === 'truck' && game.mode === 'foot' && game.activeCall && meters(game.truck, game.activeCall) < 105) {
      controller.callMetrics.positioned = meters(game.truck, game.activeCall) >= 12 && meters(game.truck, game.activeCall) <= 55;
      controller.crew.deploy();
      controller.panel.show(true);
    }
    return result;
  };

  const originalSimulate = game.simulate.bind(game);
  game.simulate = dt => { controller.beforeSimulation(dt); originalSimulate(dt); controller.afterSimulation(dt); };

  const originalRender = game.render.bind(game);
  game.render = dt => {
    originalRender(dt);
    controller.renderer.update(controller.entities.active());
    controller.renderer.setSupplyLine(controller.hydrants.connected, game.truck, Boolean(controller.hydrants.connected));
    controller.panel.update();
  };

  const originalCollision = game.onTrafficCollision.bind(game);
  game.onTrafficCollision = () => {
    originalCollision();
    controller.callMetrics.collisions += 1;
    controller.save.data.shift.collisions += 1;
    controller.applyDamage(5.5, 'traffic collision');
  };

  const originalComplete = game.completeCall.bind(game);
  game.completeCall = reason => {
    if (game.state.current !== GAME_STATES.ON_SCENE) return;
    controller.callMetrics.completionReason = reason;
    originalComplete(reason);
    controller.finalizeCall();
  };

  const originalReset = game.resetAtStation.bind(game);
  game.resetAtStation = clearCall => {
    const leftBehind = controller.equipment.leftBehindCount();
    if (leftBehind) controller.save.data.shift.equipmentLeftBehind += leftBehind;
    originalReset(clearCall);
    controller.cleanupCall();
  };

  const roads = game.roads;
  const originalResolve = roads.resolveMovement.bind(roads);
  roads.resolveMovement = (...args) => {
    const result = originalResolve(...args);
    if (result.blocked && controller.damageCooldown <= 0 && Math.abs(args[2] || 0) > 4) {
      controller.damageCooldown = .8;
      controller.callMetrics.roadHits += 1;
      controller.applyDamage(result.slid ? .55 : 1.4, 'road edge');
    }
    return result;
  };

  const incident = game.incident;
  const originalOnExit = incident.onExitTruck.bind(incident);
  incident.onExitTruck = () => {
    originalOnExit();
    if (!incident.call) return;
    if (incident.call.type === 'medical') game.ui.setObjective('Retrieve the medical bag, assess the patient and request an ambulance.');
    if (incident.call.type === 'mvc') game.ui.setObjective('Deploy traffic cones, request police/ambulance and assist the occupant.');
  };

  const originalPrompt = incident.promptFor.bind(incident);
  incident.promptFor = player => incident.call && !incident.call.type.includes('fire') ? null : originalPrompt(player);

  const originalUpdate = incident.update.bind(incident);
  incident.update = (dt, input) => {
    if (incident.call && !incident.call.type.includes('fire')) { controller.updatePatientIncident(dt, input); return; }
    const flowingHose = incident.tool === 'hose' && input.actionHeld;
    const pumpFactor = clamp(controller.condition.pump / 100, .55, 1);
    let allowed = true;
    if (flowingHose) allowed = controller.hydrants.consumeWater(2.6 * dt);
    const held = input.actionHeld;
    if (!allowed) input.actionHeld = false;
    originalUpdate(dt * pumpFactor, input);
    input.actionHeld = held;
    if (!allowed) game.ui.toast('ENGINE TANK EMPTY · ESTABLISH A HYDRANT SUPPLY', 1200);
  };
}
