/**
 * Apply an optional road-polygon-aware resolver to generated utility-pole anchors.
 * The resolver receives the existing pole feature and returns that pole, a finite
 * {x, z} position, or null when no safe position can be found.
 */
export function applySherbrookePolePlacement(plan, resolvePole) {
  const poles = plan.features.filter((feature) => feature.kind === 'pole');
  if (typeof resolvePole !== 'function') {
    return { checked: false, requested: poles.length, kept: poles.length, moved: 0, suppressed: 0 };
  }

  // Resolve first so a thrown callback cannot leave a partially moved plan.
  const decisions = poles.map((pole) => {
    const result = resolvePole(pole);
    if (result === null || !result || !Number.isFinite(result.x) || !Number.isFinite(result.z)) return null;
    const direction = result.armDirection;
    const armLength = result.armLength;
    const hasLampAim = direction
      && Number.isFinite(direction.x)
      && Number.isFinite(direction.z)
      && (direction.x !== 0 || direction.z !== 0)
      && Number.isFinite(armLength)
      && armLength > 0;
    return {
      pole,
      x: result.x,
      z: result.z,
      ...(hasLampAim ? {
        lampYaw: Math.atan2(direction.x, direction.z),
        lampReach: armLength,
      } : {}),
    };
  });
  const suppressed = new Set();
  let kept = 0;
  let moved = 0;
  decisions.forEach((decision, index) => {
    if (!decision) {
      suppressed.add(poles[index]);
      return;
    }
    const { pole, x, z } = decision;
    kept += 1;
    if (pole.x !== x || pole.z !== z) moved += 1;

    // Mutate the original feature: plan.wires retain references to these objects.
    pole.x = x;
    pole.z = z;
    if (decision.lampYaw !== undefined) {
      pole.lampYaw = decision.lampYaw;
      pole.lampReach = decision.lampReach;
    }
  });

  if (suppressed.size) {
    plan.features.splice(0, plan.features.length, ...plan.features.filter((feature) => !suppressed.has(feature)));
    plan.wires.splice(0, plan.wires.length, ...plan.wires.filter((wire) => !suppressed.has(wire.a) && !suppressed.has(wire.b)));
  }
  return { checked: true, requested: poles.length, kept, moved, suppressed: suppressed.size };
}
