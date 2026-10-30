const EPSILON = 1e-8;

function distance2D(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function unitDirection(a, b) {
  const length = distance2D(a, b);
  return length > EPSILON ? { x: (b.x - a.x) / length, z: (b.z - a.z) / length } : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))];
}

function offsetAt(points, index, amount, miterLimit, closed = false) {
  const point = points[index];
  const previous = index > 0 ? unitDirection(points[index - 1], point)
    : closed ? unitDirection(points[points.length - 1], point) : null;
  const next = index + 1 < points.length ? unitDirection(point, points[index + 1])
    : closed ? unitDirection(point, points[0]) : null;
  if (!previous && !next) return [{ ...point, x: point.x, z: point.z }];
  const incoming = previous || next;
  const outgoing = next || previous;
  const n1 = { x: incoming.z, z: -incoming.x };
  const n2 = { x: outgoing.z, z: -outgoing.x };
  const sumLength = Math.hypot(n1.x + n2.x, n1.z + n2.z);
  if (sumLength < 1e-6) {
    return [n1, n2].map((normal) => ({ ...point, x: point.x + normal.x * amount, z: point.z + normal.z * amount }));
  }
  const miter = { x: (n1.x + n2.x) / sumLength, z: (n1.z + n2.z) / sumLength };
  const denominator = miter.x * n1.x + miter.z * n1.z;
  const requested = Math.abs(amount / denominator);
  const limit = Math.abs(amount) * Math.max(1, Number.isFinite(miterLimit) ? miterLimit : 4);
  if (requested > limit && previous && next) {
    return [n1, n2].map((normal) => ({ ...point, x: point.x + normal.x * amount, z: point.z + normal.z * amount }));
  }
  const scale = amount / denominator;
  return [{ ...point, x: point.x + miter.x * scale, z: point.z + miter.z * scale }];
}

function interpolate(a, b, ratio) {
  const result = {};
  for (const key of ['x', 'z', 'y', 'height', 'referenceHeight', 'sourceX', 'sourceZ', 'sourceDistance']) {
    const av = key === 'sourceX' ? a.sourceX ?? a.x : key === 'sourceZ' ? a.sourceZ ?? a.z : a[key];
    const bv = key === 'sourceX' ? b.sourceX ?? b.x : key === 'sourceZ' ? b.sourceZ ?? b.z : b[key];
    if (Number.isFinite(av) && Number.isFinite(bv)) result[key] = av + (bv - av) * ratio;
    else if (Number.isFinite(av)) result[key] = av;
    else if (Number.isFinite(bv)) result[key] = bv;
  }
  result.distance = a.distance + (b.distance - a.distance) * ratio;
  result.lineId = ratio < 0.5 ? a.lineId : b.lineId;
  return result;
}

function pointAtDistance(points, distance) {
  if (distance <= points[0].distance) return { ...points[0], distance };
  const last = points[points.length - 1];
  if (distance >= last.distance) return { ...last, distance };
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    if (distance > b.distance + EPSILON) continue;
    const span = b.distance - a.distance;
    if (span <= EPSILON) return { ...b, distance };
    return interpolate(a, b, (distance - a.distance) / span);
  }
  return { ...last, distance };
}

function slicePath(points, start, end) {
  const result = [pointAtDistance(points, start)];
  for (const point of points) {
    if (point.distance > start + EPSILON && point.distance < end - EPSILON) result.push({ ...point });
  }
  result.push(pointAtDistance(points, end));
  return result.filter((point, index) => index === 0 || distance2D(point, result[index - 1]) > EPSILON
    || Math.abs(point.distance - result[index - 1].distance) > EPSILON);
}

function allowedIntervals(length, clips) {
  if (!Array.isArray(clips)) return [[0, length]];
  const sorted = clips.map((range) => [Math.max(0, Number(range?.[0]) || 0), Math.min(length, Number(range?.[1]) || 0)])
    .filter(([start, end]) => end - start > EPSILON)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1] + EPSILON) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

function isCusp(points, index, closed = false) {
  const previousPoint = index > 0 ? points[index - 1] : closed ? points[points.length - 1] : null;
  const nextPoint = index + 1 < points.length ? points[index + 1] : closed ? points[0] : null;
  if (!previousPoint || !nextPoint) return false;
  const previous = unitDirection(previousPoint, points[index]);
  const next = unitDirection(points[index], nextPoint);
  return Boolean(previous && next && previous.x * next.x + previous.z * next.z < -0.98);
}

function mapSourceDistance(points, sourceDistance, preferEnd = false) {
  const exact = points.filter((point) => Math.abs(point.sourceDistance - sourceDistance) <= EPSILON);
  if (exact.length) return (preferEnd ? exact[exact.length - 1] : exact[0]).distance;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const minimum = Math.min(a.sourceDistance, b.sourceDistance);
    const maximum = Math.max(a.sourceDistance, b.sourceDistance);
    if (sourceDistance < minimum || sourceDistance > maximum || maximum - minimum <= EPSILON) continue;
    const ratio = (sourceDistance - a.sourceDistance) / (b.sourceDistance - a.sourceDistance);
    return a.distance + (b.distance - a.distance) * ratio;
  }
  return sourceDistance <= points[0].sourceDistance ? points[0].distance : points.at(-1).distance;
}

/**
 * Convert source-chain allowed intervals into offset-path distance intervals.
 * A bevel plateau maps to its full span so clipping keeps the joined corner intact.
 */
export function sourceIntervalsToPathIntervals(offsetPoints, sourceRanges) {
  if (!Array.isArray(offsetPoints) || offsetPoints.length < 2 || !Array.isArray(sourceRanges)) return [];
  return sourceRanges.map(([start, end]) => [
    mapSourceDistance(offsetPoints, start),
    mapSourceDistance(offsetPoints, end, true),
  ]).filter(([start, end]) => end - start > EPSILON).sort((a, b) => a[0] - b[0]);
}

/** Build continuous offset marking paths. Dash and clip distances follow the offset path. */
export function buildRoadMarkingPaths(sourcePoints, {
  offset = 0,
  width = 0.12,
  dashPattern = null,
  phase = 0,
  clipIntervals,
  miterLimit = 4,
} = {}) {
  if (!Array.isArray(sourcePoints) || sourcePoints.length < 2) return [];
  const center = [];
  const sourceClosed = distance2D(sourcePoints[0] || {}, sourcePoints.at(-1) || {}) <= EPSILON;
  for (const source of sourcePoints) {
    if (!Number.isFinite(source?.x) || !Number.isFinite(source?.z)) continue;
    const previous = center[center.length - 1];
    const segmentLength = previous ? distance2D(previous, source) : 0;
    if (previous && distance2D(previous, source) <= EPSILON) {
      const ids = unique([...(previous.sourceLineIds || []), previous.lineId, ...(source.sourceLineIds || []), source.lineId]);
      if (ids.length) previous.sourceLineIds = ids;
      if (source.lineId && !previous.lineId) previous.lineId = source.lineId;
      continue;
    }
    center.push({
      ...source,
      y: Number.isFinite(source.y) ? source.y : source.height ?? source.referenceHeight,
      sourceX: source.x,
      sourceZ: source.z,
      sourceDistance: Number.isFinite(source.sourceDistance)
        ? source.sourceDistance : previous ? previous.sourceDistance + segmentLength : 0,
    });
  }
  if (center.length < 2) return [];
  const sourceLineIds = unique(center.flatMap((point) => [...(point.sourceLineIds || []), point.lineId]));
  const closed = sourceClosed && distance2D(center[0], center.at(-1)) <= EPSILON && center.length > 2;
  const closingSourceDistance = closed ? center.at(-1).sourceDistance : null;
  if (closed) center.pop();
  const runs = [];
  if (closed && !center.some((_, index) => isCusp(center, index, true))) {
    runs.push({ points: center, closed: true });
  } else {
    let runStart = 0;
    for (let index = 1; index < center.length - 1; index += 1) {
      if (isCusp(center, index)) {
        if (index - runStart >= 1) runs.push({ points: center.slice(runStart, index + 1), closed: false });
        runStart = index;
      }
    }
    if (center.length - runStart >= 2) runs.push({ points: center.slice(runStart), closed: false });
  }

  const output = [];
  let pathBase = 0;
  const dash = Number(dashPattern?.dash);
  const gap = Number(dashPattern?.gap);
  const period = dash + gap;
  for (const run of runs) {
    const offsetPoints = [];
    for (let index = 0; index < run.points.length; index += 1) {
      for (const point of offsetAt(run.points, index, offset, miterLimit, run.closed)) offsetPoints.push(point);
    }
    if (run.closed) offsetPoints.push({ ...offsetPoints[0], sourceDistance: closingSourceDistance });
    let offsetDistance = pathBase;
    const points = offsetPoints.map((point, index) => {
      if (index) offsetDistance += distance2D(offsetPoints[index - 1], point);
      return { ...point, distance: offsetDistance };
    });
    const length = points.at(-1).distance - pathBase;
    const clips = allowedIntervals(pathBase + length, clipIntervals).map(([start, end]) => [
      Math.max(0, start - pathBase), Math.min(length, end - pathBase),
    ]).filter(([start, end]) => end - start > EPSILON);
    const ranges = [];
    if (dashPattern && dash > 0 && gap >= 0 && period > 0) {
      for (const [clipStart, clipEnd] of clips) {
        const absoluteStart = pathBase + clipStart + phase;
        const absoluteEnd = pathBase + clipEnd + phase;
        const first = Math.floor(absoluteStart / period) - 1;
        const last = Math.ceil(absoluteEnd / period) + 1;
        for (let index = first; index <= last; index += 1) {
          const start = Math.max(clipStart, index * period - phase - pathBase);
          const end = Math.min(clipEnd, index * period + dash - phase - pathBase);
          if (end - start > EPSILON) ranges.push([start, end]);
        }
      }
    } else {
      ranges.push(...clips);
    }
    for (const [start, end] of ranges) {
      output.push({
        points: slicePath(points, pathBase + start, pathBase + end),
        width,
        pattern: dashPattern ? 'dash' : 'solid',
        startDistance: pathBase + start + phase,
        endDistance: pathBase + end + phase,
        // Attribution is conservative: a clipped dash names the whole connected source path.
        sourceLineIds,
      });
    }
    pathBase += length;
  }
  return output;
}

/** Build shared cross-sections and quad polygons for a centered paint stroke. */
export function strokeMarkingPath(pathPoints, width, { miterLimit = 4 } = {}) {
  const source = pathPoints || [];
  const closed = source.length > 2 && distance2D(source[0], source.at(-1)) <= EPSILON;
  const points = source.filter((point, index, list) => !index || distance2D(point, list[index - 1]) > EPSILON);
  if (closed && points.length > 2 && distance2D(points[0], points.at(-1)) <= EPSILON) points.pop();
  if (points.length < 2 || !(width > 0)) return { crossSections: [], quads: [], trianglesXZ: [] };
  if (points.some((_, index) => isCusp(points, index, closed))) return { crossSections: [], quads: [], trianglesXZ: [] };
  const half = width / 2;
  const sections = points.map((point, index) => {
    const previous = index > 0 ? unitDirection(points[index - 1], point)
      : closed ? unitDirection(points.at(-1), point) : null;
    const next = index + 1 < points.length ? unitDirection(point, points[index + 1])
      : closed ? unitDirection(point, points[0]) : null;
    const incoming = previous || next;
    const outgoing = next || previous;
    const n1 = { x: incoming.z, z: -incoming.x };
    const n2 = { x: outgoing.z, z: -outgoing.x };
    const sumLength = Math.hypot(n1.x + n2.x, n1.z + n2.z);
    let normal = sumLength > 1e-6 ? { x: (n1.x + n2.x) / sumLength, z: (n1.z + n2.z) / sumLength } : n1;
    const denominator = Math.abs(normal.x * n1.x + normal.z * n1.z);
    let scale = denominator > 1e-6 ? half / denominator : half;
    scale = Math.min(scale, half * Math.max(1, miterLimit));
    const dx = normal.x * scale;
    const dz = normal.z * scale;
    return [
      { ...point, x: point.x + dx, z: point.z + dz },
      { ...point, x: point.x - dx, z: point.z - dz },
    ];
  });
  if (closed) sections.push(sections[0].map((point) => ({ ...point })));
  const quads = [];
  const trianglesXZ = [];
  for (let index = 1; index < sections.length; index += 1) {
    const quad = [sections[index - 1][0], sections[index - 1][1], sections[index][1], sections[index][0]];
    quads.push(quad);
    trianglesXZ.push([quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]);
  }
  return { crossSections: sections, quads, trianglesXZ };
}
