export function installPhase4Polish(controller) {
  controller.phase2.entities.budgets.supportVehicle = Math.max(6, controller.phase2.entities.budgets.supportVehicle || 0);
  controller.phase2.entities.budgets.supportPerson = Math.max(8, controller.phase2.entities.budgets.supportPerson || 0);

  const originalMaybeFinalize = controller.phase3.maybeFinalize.bind(controller.phase3);
  controller.phase3.maybeFinalize = reason => {
    const completed = originalMaybeFinalize(reason);
    if (completed && controller.game.state.current === 'CALL_COMPLETE' && !controller.recordedCall) controller.finalizeCityCall();
    return completed;
  };

  const originalResetOperation = controller.phase3.resetOperation.bind(controller.phase3);
  controller.phase3.resetOperation = () => {
    originalResetOperation();
    controller.cleanupMutualAid();
  };
}
