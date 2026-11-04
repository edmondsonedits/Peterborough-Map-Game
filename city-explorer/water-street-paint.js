import { roadMarkingIntervals } from './road-appearance-rules.js?v=1.6.180';
import { buildRoadMarkingPaths, sourceIntervalsToPathIntervals, strokeMarkingPath } from './road-marking-paths.js?v=1.6.180';

const REVIEWED_WAY = '33966726';
const REVIEWED_SURFACE = '11/5738';
const MIN_SURFACE_WIDTH = 11.5;
const MAX_SURFACE_WIDTH = 15;
const DEFAULT_SAMPLE_SPACING = 2;
const MAX_APPROACH_EXTENSION = 20;
const STRIPES = Object.freeze([
  { kind: 'solid', materialKey: 'roadPaintWhite', curbOffset: 2.2 },
  { kind: 'solid', materialKey: 'roadPaintWhite', curbOffset: 3 },
  { kind: 'solid', materialKey: 'roadPaintWhite', curbOffset: 4.5 },
  { kind: 'dash', materialKey: 'roadPaintWhite', curbOffset: 7.7, dashPattern: { dash: 3, gap: 6 } },
]);

const point = value => Array.isArray(value)
  ? { x: Number(value[0]), z: Number(value[1]) }
  : { x: Number(value?.x), z: Number(value?.z ?? value?.y) };
const segmentLength = segment => Math.hypot(segment.b.x - segment.a.x, segment.b.y - segment.a.y);
const cross = (a, b) => a.x * b.z - a.z * b.x;
const wayId = segment => /^(?:way\/)?(\d+)(?::\d+)?$/.exec(String(segment.lineId || ''))?.[1];
const eligible = segment => wayId(segment) === REVIEWED_WAY
  && String(segment.tags?.name || '').toLowerCase() === 'water street'
  && String(segment.tags?.oneway || '').toLowerCase() === 'yes'
  && String(segment.tags?.lanes || '') === '2'
  && String(segment.tags?.['cycleway:right'] || '').toLowerCase() === 'lane';

function polygonRings(surface) {
  if (Array.isArray(surface?.rings)) return surface.rings.map(ring => ring.map(point).filter(p => Number.isFinite(p.x) && Number.isFinite(p.z)));
  const coordinates = surface?.geometry?.coordinates;
  if (surface?.geometry?.type === 'Polygon' && Array.isArray(coordinates)) return coordinates.map(ring => ring.map(point));
  if (surface?.geometry?.type === 'MultiPolygon' && Array.isArray(coordinates)) return coordinates.flatMap(poly => poly.map(ring => ring.map(point)));
  return [];
}

function pointInRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > p.z) !== (b.z > p.z)
      && p.x < (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function pointInSurface(p, rings) {
  let inside = false;
  for (const ring of rings) if (ring.length >= 4 && pointInRing(p, ring)) inside = !inside;
  return inside;
}

function crossSection(center, right, rings) {
  const intersections = [];
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], b = ring[i];
      const edge = { x: b.x - a.x, z: b.z - a.z };
      const fromCenter = { x: a.x - center.x, z: a.z - center.z };
      const denominator = cross(right, edge);
      if (Math.abs(denominator) < 1e-9) continue;
      const distance = cross(fromCenter, edge) / denominator;
      const edgeT = cross(fromCenter, right) / denominator;
      if (edgeT >= -1e-8 && edgeT <= 1 + 1e-8) intersections.push(distance);
    }
  }
  intersections.sort((a, b) => a - b);
  const unique = intersections.filter((value, i) => !i || Math.abs(value - intersections[i - 1]) > 1e-5);
  const intervals = [];
  for (let i = 1; i < unique.length; i++) {
    const start = unique[i - 1], end = unique[i];
    const mid = (start + end) / 2;
    if (pointInSurface({ x: center.x + right.x * mid, z: center.z + right.z * mid }, rings)) intervals.push([start, end]);
  }
  const containingCenter = intervals.filter(([start, end]) => start <= 1e-3 && end >= -1e-3);
  if (containingCenter.length !== 1) return null;
  const [left, rightEdge] = containingCenter[0];
  const width = rightEdge - left;
  if (width < MIN_SURFACE_WIDTH || width > MAX_SURFACE_WIDTH || rightEdge <= 0) return null;
  return { rightEdge, width };
}

function segmentWorldClip(segment, worldZ) {
  const dz = segment.b.y - segment.a.y;
  if (Math.abs(dz) < 1e-9) return segment.a.y >= worldZ.minZ && segment.a.y <= worldZ.maxZ ? [0, 1] : null;
  const t1 = (worldZ.minZ - segment.a.y) / dz, t2 = (worldZ.maxZ - segment.a.y) / dz;
  const start = Math.max(0, Math.min(t1, t2)), end = Math.min(1, Math.max(t1, t2));
  return end - start > 1e-8 ? [start, end] : null;
}

function mergeRanges(ranges) {
  const sorted = ranges.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end + 1e-4) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function sampleIntervals(segment, intervals, spacing) {
  const dx = segment.b.x - segment.a.x, dz = segment.b.y - segment.a.y;
  const length = Math.hypot(dx, dz), base = Number(segment.chainStart || 0);
  return intervals.flatMap(([start, end]) => {
    if (end - start < 0.05) return [];
    const count = Math.max(1, Math.ceil(length * (end - start) / spacing));
    return Array.from({ length: count + 1 }, (_, i) => {
      const t = start + (end - start) * i / count;
      return {
        x: segment.a.x + dx * t,
        z: segment.a.y + dz * t,
        y: Number.isFinite(segment.aY) && Number.isFinite(segment.bY) ? segment.aY + (segment.bY - segment.aY) * t : undefined,
        sourceDistance: base + length * t,
        lineId: String(segment.lineId),
        sourceLineIds: [String(segment.lineId)],
        sourceVertex: (t <= 1e-7 && segment.aSourceVertex) || (t >= 1 - 1e-7 && segment.bSourceVertex) || false,
      };
    });
  });
}

function sourceAtDistance(segments, lineId, sourceDistance) {
  for (const segment of segments) {
    if (String(segment.lineId) !== String(lineId)) continue;
    const length = segmentLength(segment), base = Number(segment.chainStart || 0);
    if (sourceDistance < base - 1e-5 || sourceDistance > base + length + 1e-5 || length < 1e-8) continue;
    const t = Math.max(0, Math.min(1, (sourceDistance - base) / length));
    return {
      x: segment.a.x + (segment.b.x - segment.a.x) * t,
      z: segment.a.y + (segment.b.y - segment.a.y) * t,
      y: Number.isFinite(segment.aY) && Number.isFinite(segment.bY) ? segment.aY + (segment.bY - segment.aY) * t : undefined,
      sourceDistance,
      lineId: String(lineId),
      sourceLineIds: [String(lineId)],
      sourceVertex: false,
    };
  }
  return null;
}

function allowedRangesForWorld(segments, worldZ, paintContext) {
  const byLine = new Map();
  for (const segment of segments) {
    const length = segmentLength(segment), clip = segmentWorldClip(segment, worldZ);
    if (!clip || length < 0.05) continue;
    const base = Number(segment.chainStart || 0), ranges = byLine.get(String(segment.lineId)) || [];
    for (const [start, end] of roadMarkingIntervals(paintContext, segment)) {
      const a = Math.max(start, clip[0] * length), b = Math.min(end, clip[1] * length);
      if (b - a > 0.05) ranges.push({ start: base + a, end: base + b });
    }
    byLine.set(String(segment.lineId), ranges);
  }
  return [...byLine].flatMap(([lineId, ranges]) => mergeRanges(ranges).map(range => ({ lineId, ...range })));
}

function tangent(frames, atStart) {
  const ordered = atStart ? frames.slice(0, 5) : frames.slice(-5);
  if (ordered.length < 2) return null;
  const origin = atStart ? ordered[0] : ordered.at(-1);
  const meanD = ordered.reduce((sum, frame) => sum + (frame.sourceDistance - origin.sourceDistance), 0) / ordered.length;
  const meanX = ordered.reduce((sum, frame) => sum + frame.x, 0) / ordered.length;
  const meanZ = ordered.reduce((sum, frame) => sum + frame.z, 0) / ordered.length;
  let denominator = 0, numeratorX = 0, numeratorZ = 0;
  for (const frame of ordered) {
    const d = frame.sourceDistance - origin.sourceDistance - meanD;
    denominator += d * d;
    numeratorX += d * (frame.x - meanX);
    numeratorZ += d * (frame.z - meanZ);
  }
  if (denominator < 1e-8) return null;
  return { x: numeratorX / denominator, z: numeratorZ / denominator };
}

function extendRunToRange(frames, range, selected, sampleSpacing) {
  if (frames.length < 2) return null;
  const first = frames[0], last = frames.at(-1);
  if (range.start > first.sourceDistance + 1e-4 || range.end < last.sourceDistance - 1e-4) return null;
  const startExtension = Math.max(0, first.sourceDistance - range.start);
  const endExtension = Math.max(0, range.end - last.sourceDistance);
  if (startExtension > MAX_APPROACH_EXTENSION + 1e-6 || endExtension > MAX_APPROACH_EXTENSION + 1e-6) return null;
  const lineId = first.lineId, startTangent = tangent(frames, true), endTangent = tangent(frames, false);
  if ((startExtension > 1e-5 && !startTangent) || (endExtension > 1e-5 && !endTangent)) return null;
  const makeApproach = (edge, target, slope, reverse) => {
    const distance = Math.abs(edge.sourceDistance - target);
    const count = Math.max(1, Math.ceil(distance / sampleSpacing));
    const result = [];
    for (let i = 0; i <= count; i++) {
      const sourceDistance = target + (edge.sourceDistance - target) * i / count;
      const source = sourceAtDistance(selected, lineId, sourceDistance);
      if (!source) return null;
      const delta = sourceDistance - edge.sourceDistance;
      result.push({
        ...edge,
        x: edge.x + slope.x * delta,
        z: edge.z + slope.z * delta,
        sourceDistance,
        sourceCenterX: source.x,
        sourceCenterZ: source.z,
        y: source.y,
        sourceVertex: false,
        estimated: Math.abs(sourceDistance - edge.sourceDistance) > 1e-6,
      });
    }
    return reverse ? result.reverse() : result;
  };
  const start = startExtension > 1e-5 ? makeApproach(first, range.start, startTangent, false) : [];
  const end = endExtension > 1e-5 ? makeApproach(last, range.end, endTangent, true) : [];
  if (start === null || end === null) return null;
  const merged = [...start, ...frames, ...end];
  return {
    frames: merged.filter((frame, index) => !index || frame.sourceDistance - merged[index - 1].sourceDistance > 1e-6),
    startExtension,
    endExtension,
  };
}

function contiguousRuns(samples, maxSpacing) {
  const runs = [];
  let run = [];
  for (const sample of samples) {
    const previous = run.at(-1);
    if (previous && (Math.hypot(sample.x - previous.x, sample.z - previous.z) > maxSpacing * 1.6
      || sample.sourceDistance - previous.sourceDistance > maxSpacing * 1.6)) {
      if (run.length >= 2) runs.push(run);
      run = [];
    }
    if (!previous || Math.hypot(sample.x - previous.x, sample.z - previous.z) > 1e-6
      || Math.abs(sample.sourceDistance - previous.sourceDistance) > 1e-6) run.push(sample);
  }
  if (run.length >= 2) runs.push(run);
  return runs;
}

function reviewedRun(sourceRun, rings, sampleSpacing) {
  const rawFrames = [];
  for (let i = 0; i < sourceRun.length; i++) {
    const before = sourceRun[Math.max(0, i - 1)], after = sourceRun[Math.min(sourceRun.length - 1, i + 1)];
    const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz);
    if (length < 1e-8) { rawFrames.push(null); continue; }
    const right = { x: -dz / length, z: dx / length };
    const section = crossSection(sourceRun[i], right, rings);
    if (!section) { rawFrames.push(null); continue; }
    rawFrames.push({
      x: sourceRun[i].x + right.x * section.rightEdge,
      z: sourceRun[i].z + right.z * section.rightEdge,
      y: sourceRun[i].y,
      sourceDistance: sourceRun[i].sourceDistance,
      lineId: sourceRun[i].lineId,
      sourceLineIds: sourceRun[i].sourceLineIds,
      sourceVertex: sourceRun[i].sourceVertex,
      width: section.width,
      sourceCenterX: sourceRun[i].x,
      sourceCenterZ: sourceRun[i].z,
    });
  }

  // Ignore isolated sub-25 cm facet wobble in the municipal ring while keeping
  // source vertices and larger curb changes intact.
  let smoothedFrames = 0;
  const frames = rawFrames.map((frame, i) => {
    if (!frame || frame.sourceVertex || i === 0 || i === rawFrames.length - 1) return frame;
    const before = rawFrames[i - 1], after = rawFrames[i + 1];
    if (!before || !after) return frame;
    const predictedX = (before.x + after.x) / 2, predictedZ = (before.z + after.z) / 2;
    const deviation = Math.hypot(frame.x - predictedX, frame.z - predictedZ);
    if (deviation < 1e-4 || deviation > 0.25) return frame;
    smoothedFrames++;
    return { ...frame, x: frame.x + (predictedX - frame.x) * 0.5, z: frame.z + (predictedZ - frame.z) * 0.5 };
  });

  const runs = [];
  let current = [];
  for (const frame of frames) {
    if (!frame) {
      if (current.length >= 2) runs.push(current);
      current = [];
      continue;
    }
    const previous = current.at(-1);
    if (previous && (Math.hypot(frame.x - previous.x, frame.z - previous.z) > sampleSpacing * 1.6
      || frame.sourceDistance - previous.sourceDistance > sampleSpacing * 1.6)) {
      if (current.length >= 2) runs.push(current);
      current = [];
    }
    current.push(frame);
  }
  if (current.length >= 2) runs.push(current);
  return { runs, frames: frames.filter(Boolean), smoothedFrames };
}

function markingsForRun(frames, allowedSourceRanges) {
  const output = [];
  for (const stripe of STRIPES) {
    const fullPaths = buildRoadMarkingPaths(frames, { offset: stripe.curbOffset, width: 0.1, miterLimit: 3 });
    for (const full of fullPaths) {
      const clips = sourceIntervalsToPathIntervals(full.points, allowedSourceRanges);
      const phase = Number(full.points[0]?.sourceDistance || 0);
      const paths = buildRoadMarkingPaths(frames, {
        offset: stripe.curbOffset,
        width: 0.1,
        miterLimit: 3,
        dashPattern: stripe.dashPattern || null,
        phase,
        clipIntervals: clips,
      });
      for (const path of paths) {
        const stroke = strokeMarkingPath(path.points, 0.1, { miterLimit: 3 });
        if (!stroke.quads.length) continue;
        const lineIds = [...new Set(path.points.flatMap(p => [...(p.sourceLineIds || []), p.lineId]).filter(Boolean))];
        const pieces = stroke.quads.map(quad => ({
          polygons: [quad],
          triangles: [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]],
          lineIds,
        }));
        output.push({
          path,
          polygons: stroke.quads,
          triangles: stroke.trianglesXZ,
          pieces,
          materialKey: stripe.materialKey,
          kind: stripe.kind,
          lineIds,
          curbOffset: stripe.curbOffset,
          ...(stripe.dashPattern ? { dashPattern: stripe.dashPattern } : {}),
        });
      }
    }
  }
  return output;
}

/**
 * Reviewed, local Water Street lane paint. Surface rings and source segments
 * must both be in the app's projected world X/Z frame. The calibrated layout
 * is evidence-based and intentionally limited to the supplied Z interval.
 */
export function buildWaterStreetPaint(segments, surfaceFeature, {
  worldZ,
  suppressionWorldZ = worldZ,
  paintContext = null,
  sampleSpacing = DEFAULT_SAMPLE_SPACING,
} = {}) {
  const empty = { markings: [], suppressedRanges: [], frames: [], stats: { reviewedSegments: 0, validSamples: 0, rejectedWidthSamples: 0, smoothedFrames: 0, paintPaths: 0, coreAccepted: false, coverageComplete: false, approachExtensionMetres: { start: 0, end: 0 } } };
  const surfaceId = String(surfaceFeature?.id || surfaceFeature?.properties?.id || surfaceFeature?.properties?.OBJECTID || '');
  if (surfaceId !== REVIEWED_SURFACE || !Number.isFinite(worldZ?.minZ) || !Number.isFinite(worldZ?.maxZ)
    || worldZ.minZ >= worldZ.maxZ || !Number.isFinite(sampleSpacing) || sampleSpacing <= 0) return empty;
  const rings = polygonRings(surfaceFeature);
  if (!rings.some(ring => ring.length >= 4)) return empty;

  const selected = segments.filter(eligible).sort((a, b) => Number(a.chainStart || 0) - Number(b.chainStart || 0));
  if (!selected.length) return empty;
  const sourcePieces = [];
  for (const segment of selected) {
    const planarLength = segmentLength(segment), clip = segmentWorldClip(segment, worldZ);
    if (!clip || planarLength < 0.05) continue;
    const intervals = roadMarkingIntervals(paintContext, segment);
    for (const [allowedStart, allowedEnd] of intervals) {
      const start = Math.max(clip[0] * planarLength, allowedStart), end = Math.min(clip[1] * planarLength, allowedEnd);
      if (end - start < 0.05) continue;
      const local = [start / planarLength, end / planarLength];
      const samples = sampleIntervals(segment, [local], sampleSpacing);
      sourcePieces.push({ segment, samples });
    }
  }
  if (!sourcePieces.length) return empty;

  const sampledRuns = [];
  let run = [];
  for (const piece of sourcePieces) {
    const samples = piece.samples;
    if (!samples.length) continue;
    const previous = run.at(-1);
    const first = samples[0];
    if (previous && (Math.hypot(first.x - previous.x, first.z - previous.z) > 0.03
      || Math.abs(first.sourceDistance - previous.sourceDistance) > 0.03)) {
      if (run.length >= 2) sampledRuns.push(run);
      run = [];
    }
    run.push(...(previous && Math.hypot(first.x - previous.x, first.z - previous.z) < 0.03 ? samples.slice(1) : samples));
  }
  if (run.length >= 2) sampledRuns.push(run);

  const markings = [], coreSuppressedRanges = [], frames = [], coreRuns = [];
  let validSamples = 0, rejectedWidthSamples = 0, smoothedFrames = 0;
  for (const sourceRun of sampledRuns) {
    const framed = reviewedRun(sourceRun, rings, sampleSpacing);
    frames.push(...framed.frames.map(({ x, z, sourceDistance, width }) => ({ x, z, sourceDistance, width })));
    validSamples += framed.frames.length;
    rejectedWidthSamples += sourceRun.length - framed.frames.length;
    smoothedFrames += framed.smoothedFrames;
    for (const frameRun of framed.runs) {
      const sourceRanges = [{ start: frameRun[0].sourceDistance, end: frameRun.at(-1).sourceDistance }];
      coreRuns.push(frameRun);
      coreSuppressedRanges.push({ lineId: frameRun[0].lineId, ...sourceRanges[0] });
    }
  }
  const coreGeometryAccepted = rejectedWidthSamples === 0 && validSamples >= 2;
  // Core geometry is always emitted when valid. It is the safe fallback if an
  // approach cannot be reconstructed or an allowed source interval is missing.
  const coreMarkings = coreGeometryAccepted ? coreRuns.flatMap(frameRun => markingsForRun(frameRun, [[frameRun[0].sourceDistance, frameRun.at(-1).sourceDistance]])) : [];
  const coreAccepted = coreGeometryAccepted && coreMarkings.length > 0;
  const allowedRanges = Number.isFinite(suppressionWorldZ?.minZ) && Number.isFinite(suppressionWorldZ?.maxZ)
    && suppressionWorldZ.minZ < suppressionWorldZ.maxZ
    ? allowedRangesForWorld(selected, suppressionWorldZ, paintContext)
    : [];
  const approachExtensionMetres = { start: 0, end: 0 };
  let coverageComplete = coreAccepted && allowedRanges.length > 0;
  const extendedRanges = [];
  const extendedMarkings = [];
  if (coverageComplete) {
    for (const range of allowedRanges) {
      const candidates = coreRuns.filter(run => String(run[0].lineId) === range.lineId
        && run.at(-1).sourceDistance >= range.start - 1e-4
        && run[0].sourceDistance <= range.end + 1e-4);
      const candidate = candidates.sort((a, b) => Math.min(b.at(-1).sourceDistance, range.end) - Math.max(b[0].sourceDistance, range.start)
        - (Math.min(a.at(-1).sourceDistance, range.end) - Math.max(a[0].sourceDistance, range.start)))[0];
      if (!candidate) { coverageComplete = false; continue; }
      const extension = extendRunToRange(candidate, range, selected, sampleSpacing);
      if (!extension) {
        approachExtensionMetres.start = Math.max(approachExtensionMetres.start, Math.max(0, candidate[0].sourceDistance - range.start));
        approachExtensionMetres.end = Math.max(approachExtensionMetres.end, Math.max(0, range.end - candidate.at(-1).sourceDistance));
        coverageComplete = false;
        continue;
      }
      approachExtensionMetres.start = Math.max(approachExtensionMetres.start, extension.startExtension);
      approachExtensionMetres.end = Math.max(approachExtensionMetres.end, extension.endExtension);
      const rangeMarkings = markingsForRun(extension.frames, [[range.start, range.end]]);
      const solidOffsetsCovered = STRIPES.filter(stripe => stripe.kind === 'solid').every(stripe => {
        const paths = rangeMarkings.filter(marking => marking.kind === 'solid' && marking.curbOffset === stripe.curbOffset);
        const points = paths.flatMap(marking => marking.path.points);
        return points.length >= 2
          && Math.min(...points.map(point => point.sourceDistance)) <= range.start + 0.05
          && Math.max(...points.map(point => point.sourceDistance)) >= range.end - 0.05;
      });
      if (!solidOffsetsCovered) { coverageComplete = false; continue; }
      extendedRanges.push(range);
      frames.push(...extension.frames.filter(frame => frame.estimated).map(({ x, z, sourceDistance, width, estimated }) => ({ x, z, sourceDistance, width, estimated })));
      extendedMarkings.push(...rangeMarkings);
    }
    if (extendedRanges.length !== allowedRanges.length) coverageComplete = false;
    for (const allowed of allowedRanges) {
      const covered = extendedRanges.filter(range => range.lineId === allowed.lineId && range.end >= allowed.start - 0.01 && range.start <= allowed.end + 0.01);
      if (!covered.length || Math.min(...covered.map(range => range.start)) > allowed.start + 0.01
        || Math.max(...covered.map(range => range.end)) < allowed.end - 0.01) coverageComplete = false;
    }
  }
  markings.push(...(coverageComplete ? extendedMarkings : coreMarkings));
  const suppressedRanges = coverageComplete ? allowedRanges : coreAccepted ? coreSuppressedRanges : [];
  const mergedSuppressed = [];
  for (const id of new Set(suppressedRanges.map(range => range.lineId))) {
    for (const range of mergeRanges(suppressedRanges.filter(item => item.lineId === id))) mergedSuppressed.push({ lineId: id, ...range });
  }
  return {
    markings,
    suppressedRanges: mergedSuppressed,
    frames: frames.sort((a, b) => a.sourceDistance - b.sourceDistance),
    stats: {
      reviewedSegments: selected.length,
      validSamples,
      rejectedWidthSamples,
      smoothedFrames,
      paintPaths: markings.length,
      coreAccepted,
      coverageComplete,
      approachExtensionMetres,
    },
  };
}
