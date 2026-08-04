import { GAME_STATES } from './config.js';
import { calculateEscalation } from './phase3-math.js';

function objectiveSignature(controller) {
  if (!controller.operation) return 'none';
  return controller.operation.objectives.map(item => `${item.id}:${item.status}:${Math.round(item.progress)}`).join('|');
}

function actionSignature(controller) {
  if (!controller.operation) return 'none';
  return `${controller.activeTask || ''}|${controller.availableActions().map(item => `${item.id}:${item.status}:${item.disabled ? 1 : 0}`).join('|')}`;
}

function careerSignature(controller) {
  const data = controller.progression.data;
  return JSON.stringify([data.xp, data.level, data.rank, data.reputation, data.streak, data.bestStreak, data.operations, data.sRanks, data.unlocks, data.achievements]);
}

export function installPhase3Polish(controller) {
  controller.operationElapsed = 0;

  const originalStartOperation = controller.startOperation.bind(controller);
  controller.startOperation = call => {
    const result = originalStartOperation(call);
    controller.operationElapsed = 0;
    return result;
  };

  const originalResetOperation = controller.resetOperation.bind(controller);
  controller.resetOperation = () => {
    const result = originalResetOperation();
    controller.operationElapsed = 0;
    return result;
  };

  const originalUpdate = controller.update.bind(controller);
  controller.update = dt => {
    const simulationActive = controller.operation && controller.game.activeCall && !controller.finishing && controller.game.state.current !== GAME_STATES.PAUSED;
    if (simulationActive) controller.operationElapsed += Math.max(0, dt);
    return originalUpdate(dt);
  };

  controller.updateRisk = () => {
    if (!controller.operation) return;
    const supportOnScene = controller.phase2.entities.active('supportVehicle').filter(unit => unit.state === 'arrived').length;
    controller.risk = calculateEscalation({
      elapsedSeconds:controller.operationElapsed,
      baseRisk:controller.operation.template.baseRisk,
      completedRatio:controller.operation.completionRatio(),
      supportOnScene,
      waterSupply:Boolean(controller.phase2.hydrants.connected)
    });
    for (const threshold of [45, 70, 88]) {
      if (controller.risk >= threshold && !controller.escalationThresholds.has(threshold)) {
        controller.escalationThresholds.add(threshold);
        controller.escalate(threshold);
      }
    }
  };

  const originalMaybeFinalize = controller.maybeFinalize.bind(controller);
  controller.maybeFinalize = reason => {
    const originalStartedAt = controller.operationStartedAt;
    controller.operationStartedAt = performance.now() - controller.operationElapsed * 1000;
    try { return originalMaybeFinalize(reason); }
    finally { controller.operationStartedAt = originalStartedAt; }
  };

  const ui = controller.ui;
  let lastObjectives = '';
  let lastActions = '';
  let lastCareer = '';
  const originalRenderObjectives = ui.renderObjectives.bind(ui);
  const originalRenderActions = ui.renderActions.bind(ui);
  const originalUpdateCareer = ui.updateCareer.bind(ui);

  ui.renderObjectives = () => {
    const signature = objectiveSignature(controller);
    if (signature === lastObjectives) return;
    lastObjectives = signature;
    originalRenderObjectives();
  };
  ui.renderActions = () => {
    const signature = actionSignature(controller);
    if (signature === lastActions) return;
    lastActions = signature;
    originalRenderActions();
  };
  ui.updateCareer = () => {
    const signature = careerSignature(controller);
    if (signature === lastCareer) return;
    lastCareer = signature;
    originalUpdateCareer();
  };
}
