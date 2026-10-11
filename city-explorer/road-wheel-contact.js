/** A stable four-wheel contact sampling pattern for a long-wheelbase truck.
 * This samples the actual, height-aware game road surface at each tire corner.
 * It does not pretend that binary road classification is tire suspension.
 */
export function sampleTruckWheelContacts(pose, dimensions, sampleSurface) {
  const { x, z, heading, y } = pose || {};
  const { wheelbase, trackWidth } = dimensions || {};
  if (![x,z,heading,wheelbase,trackWidth].every(Number.isFinite) || wheelbase <= 0 || trackWidth <= 0
    || typeof sampleSurface !== 'function') throw new TypeError('Invalid wheel contact sampler');
  const forwardX = -Math.sin(heading), forwardZ = -Math.cos(heading);
  const rightX = Math.cos(heading), rightZ = -Math.sin(heading);
  const sample = (longitudinal, lateral) => {
    const sx = x + forwardX * longitudinal + rightX * lateral;
    const sz = z + forwardZ * longitudinal + rightZ * lateral;
    const hit = sampleSurface(sx, sz, Number.isFinite(y) ? y : null);
    if (!hit || !Number.isFinite(hit.height)) throw new RangeError('Non-finite truck wheel ground contact');
    return hit;
  };
  const front = wheelbase / 2, side = trackWidth / 2;
  const frontLeft = sample(front, -side);
  const frontRight = sample(front, side);
  const rearLeft = sample(-front, -side);
  const rearRight = sample(-front, side);
  const frontHeight = (frontLeft.height + frontRight.height) / 2;
  const rearHeight = (rearLeft.height + rearRight.height) / 2;
  const leftHeight = (frontLeft.height + rearLeft.height) / 2;
  const rightHeight = (frontRight.height + rearRight.height) / 2;
  const roadWheelCount = [frontLeft, frontRight, rearLeft, rearRight]
    .reduce((count, hit) => count + Number(Boolean(hit.onRoad)), 0);
  return {
    frontLeft, frontRight, rearLeft, rearRight, roadWheelCount,
    pitch: Math.atan2(frontHeight - rearHeight, wheelbase),
    roll: Math.atan2(rightHeight - leftHeight, trackWidth),
    averageHeight: (frontHeight + rearHeight) / 2,
  };
}

/** The wheel majority corrects cases where the truck's midpoint is a mapped
 * pavement hole/traffic island while both tire tracks remain on the roadway.
 * The existing centre query still wins; this does not add any new road polygon.
 */
export function truckIsOnRoad(centerOnRoad, previousWheelCount) {
  return Boolean(centerOnRoad || (Number.isInteger(previousWheelCount) && previousWheelCount >= 2));
}
