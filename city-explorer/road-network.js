/*
  Peterborough Explorer road profiles and surface sampling.

  This module deliberately contains no DOM or Three.js dependencies. The city
  renderer, a future driving controller, and automated checks can therefore use
  the same width, lane, densification, and road-height rules.
*/

export const ROAD_SURFACE_CLEARANCE = 0.14;
const ROAD_MICRO_SEGMENT_LENGTH = 6;

export const DEFAULT_ROAD_WIDTHS = Object.freeze({
  motorway: 8.1,
  motorway_link: 4.5,
  trunk: 8,
  trunk_link: 4.5,
  primary: 8.2,
  primary_link: 4.4,
  secondary: 7.4,
  secondary_link: 4.3,
  tertiary: 7,
  tertiary_link: 4.2,
  residential: 6.2,
  unclassified: 6,
  living_street: 5.2,
  service: 3.7,
  track: 3.2,
  road: 5.5,
});

const EXCLUDED_HIGHWAYS = new Set([
  'abandoned',
  'bridleway',
  'construction',
  'corridor',
  'crossing',
  'cycleway',
  'footway',
  'path',
  'pedestrian',
  'platform',
  'proposed',
  'raceway',
  'razed',
  'steps',
]);

const UNPAVED_SURFACES = /^(unpaved|gravel|fine_gravel|compacted|ground|dirt|earth|grass|sand|mud|woodchips)$/;
const MAJOR_ROADS = /^(motorway|trunk|primary|secondary)(?:_link)?$/;
const HIGH_SPEED_ROADS = /^(motorway|trunk)(?:_link)?$/;

export function parseRoadMetres(value) {
  if (value === undefined || value === null) return NaN;
  const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const number = Number.parseFloat(match[0]);
  if (!Number.isFinite(number)) return NaN;
  return /ft|feet|foot|'/i.test(String(value)) ? number * 0.3048 : number;
}

export function isRoadOneWay(tags = {}) {
  return ['yes', '1', '-1', 'reversible', 'alternating'].includes(String(tags.oneway || '').toLowerCase())
    || tags.junction === 'roundabout';
}

export function mappedLaneCount(tags = {}) {
  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return Math.max(1, Math.round(lanes));
  const forward = Number.parseFloat(tags['lanes:forward']);
  const backward = Number.parseFloat(tags['lanes:backward']);
  if (Number.isFinite(forward) || Number.isFinite(backward)) {
    return Math.max(1, Math.round((forward || 0) + (backward || 0)));
  }
  return null;
}

export function laneCountFor(tags = {}) {
  const mapped = mappedLaneCount(tags);
  if (mapped) return Math.min(8, mapped);
  const highway = String(tags.highway || 'residential').toLowerCase();
  if (HIGH_SPEED_ROADS.test(highway)) return isRoadOneWay(tags) ? 2 : 4;
  if (/^(primary|secondary)(?:_link)?$/.test(highway)) return isRoadOneWay(tags) ? 1 : 2;
  return 1;
}

export function isDrivableRoad(tags = {}) {
  const highway = String(tags.highway || '').toLowerCase();
  return Boolean(highway) && !EXCLUDED_HIGHWAYS.has(highway) && tags.area !== 'yes';
}

function laneWidthFor(highway) {
  if (HIGH_SPEED_ROADS.test(highway)) return 3.65;
  if (/^(primary|secondary)(?:_link)?$/.test(highway)) return 3.3;
  if (/^tertiary(?:_link)?$/.test(highway)) return 3.2;
  return 3;
}

function inferredRoadWidth(tags, highway) {
  const explicit = parseRoadMetres(tags.width);
  const estimated = parseRoadMetres(tags.est_width);
  const measured = Number.isFinite(explicit) ? explicit : estimated;
  if (Number.isFinite(measured) && measured > 0) return measured;

  const mappedLanes = mappedLaneCount(tags);
  if (!mappedLanes) {
    if (highway === 'service' && tags.service === 'parking_aisle') return 6.2;
    if (highway === 'service' && tags.service === 'driveway') return 3.5;
    if (highway === 'service' && tags.service === 'alley') return 4.5;
    return DEFAULT_ROAD_WIDTHS[highway] || 5.5;
  }

  const edgeAllowance = HIGH_SPEED_ROADS.test(highway) ? 0.8 : MAJOR_ROADS.test(highway) ? 0.55 : 0.3;
  const laneBased = mappedLanes * laneWidthFor(highway) + edgeAllowance;
  const singleLaneMinimum = isRoadOneWay(tags) || highway === 'service' || /_link$/.test(highway) ? 3.4 : 4.5;
  return Math.max(singleLaneMinimum, laneBased);
}

export function roadProfile(tags = {}) {
  if (!isDrivableRoad(tags)) return null;
  const highway = String(tags.highway || 'road').toLowerCase();
  const surface = String(tags.surface || '').toLowerCase();
  const unpaved = highway === 'track' || UNPAVED_SURFACES.test(surface);
  const bridge = Boolean(tags.bridge && tags.bridge !== 'no');
  const tunnel = Boolean(tags.tunnel && tags.tunnel !== 'no');
  const parkingAisle = highway === 'service' && String(tags.service || '').toLowerCase() === 'parking_aisle';
  const width = Math.min(26, Math.max(highway === 'track' ? 2.5 : 2.8, inferredRoadWidth(tags, highway)));

  let renderClass = 'local';
  if (unpaved) renderClass = 'unpaved';
  else if (tunnel) renderClass = 'tunnel';
  else if (HIGH_SPEED_ROADS.test(highway)) renderClass = 'highway';
  else if (MAJOR_ROADS.test(highway)) renderClass = 'arterial';
  else if (/^tertiary(?:_link)?$/.test(highway)) renderClass = 'collector';
  else if (highway === 'service') renderClass = 'service';

  const edgeExtra = parkingAisle
    ? 0
    : bridge
    ? 0.55
    : HIGH_SPEED_ROADS.test(highway)
      ? 2.2
      : MAJOR_ROADS.test(highway)
        ? 0.9
        : unpaved
          ? 0.65
          : 0.55;

  return {
    bridge,
    edgeExtra,
    // A parking aisle lies on top of an already mapped parking surface. Giving
    // it the pale public-road foundation creates false circular roads wherever
    // OSM contains a short circulation loop. Blend it into the authoritative
    // parking polygon while retaining its centreline for navigation/indexing.
    edgeKey: parkingAisle ? 'parking' : bridge ? 'roadBridgeEdge' : HIGH_SPEED_ROADS.test(highway) ? 'roadShoulder' : unpaved ? 'roadUnpavedEdge' : 'roadEdge',
    highway,
    lanes: laneCountFor(tags),
    oneWay: isRoadOneWay(tags),
    parkingAisle,
    renderClass,
    surfaceKey: parkingAisle ? 'parking' : `road${renderClass[0].toUpperCase()}${renderClass.slice(1)}`,
    tunnel,
    unpaved,
    width,
  };
}

export function roadSampleSpacing(tags = {}, lowPower = false) {
  const highway = String(tags.highway || '').toLowerCase();
  if (tags.bridge && tags.bridge !== 'no') return lowPower ? 18 : 10;
  if (HIGH_SPEED_ROADS.test(highway)) return lowPower ? 22 : 14;
  return lowPower ? 25 : 16;
}

export function maximumRoadGrade(tags = {}) {
  const highway = String(tags.highway || '').toLowerCase();
  if (HIGH_SPEED_ROADS.test(highway)) return 0.08;
  if (MAJOR_ROADS.test(highway)) return 0.1;
  if (/^tertiary(?:_link)?$/.test(highway)) return 0.12;
  if (highway === 'service') return 0.16;
  if (highway === 'track') return 0.2;
  return 0.14;
}

export function maximumRoadGradeChange(tags = {}) {
  const highway = String(tags.highway || '').toLowerCase();
  if (HIGH_SPEED_ROADS.test(highway)) return 0.045;
  if (MAJOR_ROADS.test(highway)) return 0.06;
  if (/^tertiary(?:_link)?$/.test(highway)) return 0.075;
  if (highway === 'service' || highway === 'track') return 0.11;
  return 0.09;
}

export function maximumRoadSmoothingLift(tags = {}) {
  const highway = String(tags.highway || '').toLowerCase();
  if (HIGH_SPEED_ROADS.test(highway)) return 2.5;
  if (MAJOR_ROADS.test(highway)) return 2.5;
  if (/^tertiary(?:_link)?$/.test(highway)) return 2.5;
  if (highway === 'service') return 3;
  if (highway === 'track') return 2;
  return 3;
}

export function maximumTerrainConstrainedRoadGrade(tags = {}) {
  const highway = String(tags.highway || '').toLowerCase();
  // Lidar can include short retaining walls, bridge edges, trees, and roofs.
  // A drivable centreline should follow the broad terrain trend without
  // reproducing those one-cell spikes as roller-coaster pavement.
  // Peterborough contains genuine short, steep approaches. These limits are
  // intentionally paired with the three-metre cut/fill ceiling below: forcing
  // a flatter mathematical profile would create inaccurate embankments after
  // a single lidar outlier. High-speed and arterial roads stay gentler, while
  // local/service access retains enough range to follow the real terrain.
  if (HIGH_SPEED_ROADS.test(highway)) return 0.12;
  if (MAJOR_ROADS.test(highway)) return 0.16;
  if (/^tertiary(?:_link)?$/.test(highway)) return 0.18;
  if (highway === 'service') return 0.22;
  if (highway === 'track') return 0.25;
  return 0.20;
}

/**
 * Return the least-raised practical driving profile over an authoritative
 * terrain-clearance envelope. Heights are never lowered into the terrain.
 * Forward/backward grade envelopes remove impossible short ramps; bounded
 * grade-change passes lengthen sharp crests and valleys so a future vehicle
 * does not receive a one-frame suspension impulse at a sampling station.
 */
export function drivableRoadHeightProfile(samples, minimumHeights, tags = {}, options = {}) {
  if (!Array.isArray(samples) || samples.length !== minimumHeights?.length || samples.length < 2) {
    return Array.isArray(minimumHeights) ? minimumHeights.slice() : [];
  }
  const heights = minimumHeights.map((height) => Number.isFinite(Number(height)) ? Number(height) : 0);
  const maximumGrade = Number.isFinite(options.maximumGrade) ? options.maximumGrade : maximumRoadGrade(tags);
  const maximumGradeChange = Number.isFinite(options.maximumGradeChange)
    ? options.maximumGradeChange
    : maximumRoadGradeChange(tags);
  const curvaturePasses = Math.max(0, Math.min(18, Math.round(options.curvaturePasses ?? 10)));
  const runAt = (index) => Math.max(0.001, samples[index].distance - samples[index - 1].distance);
  const enforceGrade = () => {
    for (let index = 1; index < heights.length; index += 1) {
      heights[index] = Math.max(heights[index], heights[index - 1] - maximumGrade * runAt(index));
    }
    for (let index = heights.length - 2; index >= 0; index -= 1) {
      heights[index] = Math.max(heights[index], heights[index + 1] - maximumGrade * runAt(index + 1));
    }
  };

  enforceGrade();
  for (let pass = 0; pass < curvaturePasses; pass += 1) {
    const next = heights.slice();
    for (let index = 1; index < heights.length - 1; index += 1) {
      const leftRun = runAt(index);
      const rightRun = runAt(index + 1);
      const leftGrade = (heights[index] - heights[index - 1]) / leftRun;
      const rightGrade = (heights[index + 1] - heights[index]) / rightRun;
      const gradeChange = rightGrade - leftGrade;
      if (gradeChange > maximumGradeChange) {
        const requiredLift = (gradeChange - maximumGradeChange) / (1 / leftRun + 1 / rightRun);
        next[index] = Math.max(next[index], heights[index] + requiredLift);
      } else if (gradeChange < -maximumGradeChange) {
        const requiredChange = -maximumGradeChange - gradeChange;
        next[index - 1] = Math.max(next[index - 1], heights[index - 1] + requiredChange * leftRun / 2);
        next[index + 1] = Math.max(next[index + 1], heights[index + 1] + requiredChange * rightRun / 2);
      }
    }
    for (let index = 0; index < heights.length; index += 1) heights[index] = Math.max(minimumHeights[index], next[index]);
    enforceGrade();
  }
  return heights;
}

export function roadEndpointKey(sample) {
  return `${Math.round(Number(sample?.x) * 20)}:${Math.round(Number(sample?.y) * 20)}`;
}

/** Reconcile independently mapped OSM ways into one continuous road surface. */
export function reconcileRoadNetworkElevations(roadLines = []) {
  const endpointHeights = new Map();
  roadLines.forEach((line) => {
    if (!line?.samples?.length) return;
    [line.samples[0], line.samples.at(-1)].forEach((sample) => {
      const key = roadEndpointKey(sample);
      endpointHeights.set(key, Math.max(endpointHeights.get(key) ?? -Infinity, sample.height));
    });
  });

  roadLines.forEach((line) => {
    if (!line?.samples?.length) return;
    const originalHeights = line.samples.map((sample) => sample.height);
    const totalLength = Math.max(0.001, line.samples.at(-1).distance);
    const blendEndpoint = (end) => {
      const endpointIndex = end === 'start' ? 0 : line.samples.length - 1;
      const endpoint = line.samples[endpointIndex];
      const target = endpointHeights.get(roadEndpointKey(endpoint));
      const delta = target - originalHeights[endpointIndex];
      if (!(delta > 0.001)) return;
      const blendDistance = Math.min(totalLength / 2, Math.min(64, Math.max(22, delta * 14)));
      line.samples.forEach((sample, index) => {
        const distance = end === 'start' ? sample.distance : totalLength - sample.distance;
        if (distance > blendDistance) return;
        const ratio = Math.max(0, Math.min(1, 1 - distance / Math.max(0.001, blendDistance)));
        const lift = delta * ratio * ratio * (3 - 2 * ratio);
        const reconciled = originalHeights[index] + lift;
        if (reconciled > sample.height) {
          sample.junctionLift = Math.max(sample.junctionLift || 0, reconciled - originalHeights[index]);
          sample.height = reconciled;
        }
      });
    };
    blendEndpoint('start');
    blendEndpoint('end');
  });
  return roadLines;
}

function roadRibbonCrossSectionAt(samples, index, width) {
  const sample = samples[index];
  const halfWidth = width / 2;
  const lastIndex = samples.length - 1;
  const closed = samples.length > 3
    && Math.hypot(samples[0].x - samples[lastIndex].x, samples[0].y - samples[lastIndex].y) < 0.05;
  const previous = closed && index === 0 ? samples[lastIndex - 1] : samples[Math.max(0, index - 1)];
  const next = closed && index === lastIndex ? samples[1] : samples[Math.min(lastIndex, index + 1)];
  let previousX = sample.x - previous.x;
  let previousZ = sample.y - previous.y;
  let nextX = next.x - sample.x;
  let nextZ = next.y - sample.y;
  if (Math.hypot(previousX, previousZ) < 0.001) {
    previousX = nextX;
    previousZ = nextZ;
  }
  if (Math.hypot(nextX, nextZ) < 0.001) {
    nextX = previousX;
    nextZ = previousZ;
  }
  const previousLength = Math.max(0.001, Math.hypot(previousX, previousZ));
  const nextLength = Math.max(0.001, Math.hypot(nextX, nextZ));
  previousX /= previousLength;
  previousZ /= previousLength;
  nextX /= nextLength;
  nextZ /= nextLength;
  const previousNormalX = previousZ;
  const previousNormalZ = -previousX;
  const nextNormalX = nextZ;
  const nextNormalZ = -nextX;
  let miterX = previousNormalX + nextNormalX;
  let miterZ = previousNormalZ + nextNormalZ;
  const miterLength = Math.hypot(miterX, miterZ);
  if (miterLength < 0.05) {
    miterX = nextNormalX;
    miterZ = nextNormalZ;
  } else {
    miterX /= miterLength;
    miterZ /= miterLength;
  }
  const denominator = Math.max(0.35, Math.abs(miterX * nextNormalX + miterZ * nextNormalZ));
  const offset = Math.min(halfWidth * 1.8, halfWidth / denominator);
  return {
    leftX: sample.x + miterX * offset,
    leftZ: sample.y + miterZ * offset,
    rightX: sample.x - miterX * offset,
    rightZ: sample.y - miterZ * offset,
  };
}

/** Return the exact plan-view cross-sections used to construct a road ribbon. */
export function roadRibbonCrossSections(samples, width) {
  if (!Array.isArray(samples) || samples.length < 2 || !Number.isFinite(width) || width <= 0) return [];
  return samples.map((_sample, index) => roadRibbonCrossSectionAt(samples, index, width));
}

/**
 * Sample the complete rendered road footprint at one centreline station.
 *
 * A centreline-only height is insufficient on Peterborough's drumlins and
 * river-valley slopes: one pavement edge can sit below the terrain even while
 * the centre has positive clearance. Sampling at a maximum two-metre interval
 * across the road plus its shoulder/foundation gives the ribbon a conservative
 * cut/fill envelope without adding any map-specific exceptions.
 */
export function sampleRoadTerrainEnvelope(samples, index, tags, heightAtWorld) {
  const sample = samples[index];
  const safeHeightAtWorld = typeof heightAtWorld === 'function' ? heightAtWorld : () => 0;
  const finiteHeight = (x, z) => {
    const height = Number(safeHeightAtWorld(x, z));
    return Number.isFinite(height) ? height : 0;
  };
  const centerHeight = finiteHeight(sample.x, sample.y);
  const profile = roadProfile(tags) || { edgeExtra: 0, tunnel: false, width: 5.5 };

  // A mapped tunnel is intentionally grade-separated below its cover. Keep its
  // centreline datum instead of raising it to the terrain above the portal.
  if (profile.tunnel) {
    return { centerHeight, halfWidth: 0, height: centerHeight, sampleCount: 1 };
  }

  const crossSection = roadRibbonCrossSectionAt(samples, index, profile.width + profile.edgeExtra);
  const crossSectionLength = Math.hypot(
    crossSection.leftX - crossSection.rightX,
    crossSection.leftZ - crossSection.rightZ,
  );
  const halfWidth = crossSectionLength / 2;
  const crossSectionSteps = Math.max(2, Math.ceil(crossSectionLength / 2));
  let envelopeHeight = centerHeight;
  for (let step = 0; step <= crossSectionSteps; step += 1) {
    const t = step / crossSectionSteps;
    envelopeHeight = Math.max(
      envelopeHeight,
      finiteHeight(
        crossSection.leftX + (crossSection.rightX - crossSection.leftX) * t,
        crossSection.leftZ + (crossSection.rightZ - crossSection.leftZ) * t,
      ),
    );
  }
  return {
    centerHeight,
    halfWidth,
    height: envelopeHeight,
    sampleCount: crossSectionSteps + 1,
  };
}

export function resampleRoadLine(points, tags, heightAtWorld, lowPower = false) {
  if (!Array.isArray(points) || points.length < 2) return [];
  const spacing = roadSampleSpacing(tags, lowPower);
  const samples = [];
  let distance = 0;
  const first = points[0];
  samples.push({ x: first.x, y: first.y, distance: 0, sourceVertex: true, sourceIndex: 0 });

  for (let sourceIndex = 1; sourceIndex < points.length; sourceIndex += 1) {
    const a = points[sourceIndex - 1];
    const b = points[sourceIndex];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const steps = Math.max(1, Math.ceil(length / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const stepDistance = length / steps;
      distance += stepDistance;
      samples.push({
        x: a.x + dx * t,
        y: a.y + dz * t,
        distance,
        sourceVertex: step === steps,
        sourceIndex,
      });
    }
  }
  if (samples.length < 2) return [];

  const terrainEnvelopes = samples.map((_sample, index) => sampleRoadTerrainEnvelope(samples, index, tags, heightAtWorld));
  const rawHeights = terrainEnvelopes.map((envelope) => envelope.height + ROAD_SURFACE_CLEARANCE);
  const profile = roadProfile(tags) || { bridge: false, edgeExtra: 0, tunnel: false, width: 5.5 };

  // A road segment can cross a terrain-triangle diagonal between its centreline
  // stations. Check the interpolated ribbon itself at two-metre intervals and
  // lift both bounding stations by any deficit. This closes the remaining gap
  // between station-safe points and a continuously safe driving surface.
  if (!profile.tunnel) {
    const foundationSides = roadRibbonCrossSections(samples, profile.width + profile.edgeExtra);
    const safetyLifts = new Float64Array(samples.length);
    const finiteHeight = (x, z) => {
      const height = Number(heightAtWorld(x, z));
      return Number.isFinite(height) ? height : 0;
    };
    for (let index = 1; index < samples.length; index += 1) {
      const a = samples[index - 1];
      const b = samples[index];
      const sideA = foundationSides[index - 1];
      const sideB = foundationSides[index];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const longitudinalSteps = Math.max(1, Math.ceil(length / 2));
      let segmentLift = 0;
      for (let step = 1; step < longitudinalSteps; step += 1) {
        const t = step / longitudinalSteps;
        const leftX = sideA.leftX + (sideB.leftX - sideA.leftX) * t;
        const leftZ = sideA.leftZ + (sideB.leftZ - sideA.leftZ) * t;
        const rightX = sideA.rightX + (sideB.rightX - sideA.rightX) * t;
        const rightZ = sideA.rightZ + (sideB.rightZ - sideA.rightZ) * t;
        const crossSectionLength = Math.hypot(rightX - leftX, rightZ - leftZ);
        const lateralSteps = Math.max(2, Math.ceil(crossSectionLength / 2));
        let envelopeHeight = -Infinity;
        for (let across = 0; across <= lateralSteps; across += 1) {
          const u = across / lateralSteps;
          envelopeHeight = Math.max(
            envelopeHeight,
            finiteHeight(leftX + (rightX - leftX) * u, leftZ + (rightZ - leftZ) * u),
          );
        }
        const interpolatedRoadHeight = rawHeights[index - 1] + (rawHeights[index] - rawHeights[index - 1]) * t;
        segmentLift = Math.max(segmentLift, envelopeHeight + ROAD_SURFACE_CLEARANCE - interpolatedRoadHeight);
      }
      if (segmentLift > 0) {
        safetyLifts[index - 1] = Math.max(safetyLifts[index - 1], segmentLift);
        safetyLifts[index] = Math.max(safetyLifts[index], segmentLift);
      }
    }
    rawHeights.forEach((height, index) => { rawHeights[index] = height + safetyLifts[index]; });
  }
  samples.forEach((sample, index) => {
    sample.centerGroundHeight = terrainEnvelopes[index].centerHeight + ROAD_SURFACE_CLEARANCE;
    sample.groundHeight = rawHeights[index];
    sample.terrainEnvelopeLift = Math.max(0, rawHeights[index] - sample.centerGroundHeight);
  });
  const isBridge = Boolean(tags.bridge && tags.bridge !== 'no');
  if (isBridge) {
    const firstHeight = rawHeights[0];
    const lastHeight = rawHeights.at(-1);
    const totalDistance = Math.max(0.001, samples.at(-1).distance);
    samples.forEach((sample, index) => {
      const straightDeckHeight = firstHeight + (lastHeight - firstHeight) * (sample.distance / totalDistance);
      // Span DEM depressions with a straight deck, but never allow that chord to
      // enter a bank, embankment, or terrain triangle along a long crossing.
      sample.height = Math.max(straightDeckHeight, rawHeights[index]);
    });
    const maximumGrade = maximumRoadGrade(tags);
    for (let index = 1; index < samples.length; index += 1) {
      const run = Math.max(0.001, samples[index].distance - samples[index - 1].distance);
      samples[index].height = Math.max(samples[index].height, samples[index - 1].height - maximumGrade * run);
    }
    for (let index = samples.length - 2; index >= 0; index -= 1) {
      const run = Math.max(0.001, samples[index + 1].distance - samples[index].distance);
      samples[index].height = Math.max(samples[index].height, samples[index + 1].height - maximumGrade * run);
    }
    const bridgeMinimums = samples.map((sample) => sample.height);
    const drivableHeights = drivableRoadHeightProfile(samples, bridgeMinimums, tags);
    samples.forEach((sample, index) => {
      sample.gradeSmoothingLift = Math.max(0, drivableHeights[index] - bridgeMinimums[index]);
      sample.height = drivableHeights[index];
    });
    return samples;
  }

  // Raise only small local DEM depressions. Never lower the road into terrain,
  // move its horizontal OSM coordinates, or flatten a real Peterborough hill
  // into a several-metre artificial embankment. The old global grade limiter
  // could lift an ordinary road more than eight metres; this terrain-conforming
  // pass has a strict 18 cm total lift ceiling instead.
  let heights = rawHeights.slice();
  // Dense OSM shape nodes can be only a few centimetres apart. Sampling the
  // coarse terrain mesh independently at both nodes turns harmless mapping
  // detail into a visible pavement step (and produced a false 50% grade on one
  // northern service road). Treat sub-six-metre stations as one road datum.
  // This retains every surveyed horizontal vertex while changing elevation
  // only by the local terrain-envelope difference.
  for (let index = 1; index < heights.length; index += 1) {
    const run = samples[index].distance - samples[index - 1].distance;
    if (run >= ROAD_MICRO_SEGMENT_LENGTH) continue;
    const sharedHeight = Math.max(heights[index - 1], heights[index]);
    heights[index - 1] = sharedHeight;
    heights[index] = sharedHeight;
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const next = heights.slice();
    for (let index = 1; index < heights.length - 1; index += 1) {
      const weighted = (heights[index - 1] + heights[index] * 2 + heights[index + 1]) / 4;
      next[index] = Math.max(rawHeights[index], Math.min(rawHeights[index] + 0.18, weighted));
    }
    heights = next;
  }
  for (let index = 1; index < heights.length; index += 1) {
    const run = samples[index].distance - samples[index - 1].distance;
    if (run >= ROAD_MICRO_SEGMENT_LENGTH) continue;
    const sharedHeight = Math.max(heights[index - 1], heights[index]);
    heights[index - 1] = sharedHeight;
    heights[index] = sharedHeight;
  }
  const drivableHeights = drivableRoadHeightProfile(samples, heights, tags, {
    maximumGrade: maximumTerrainConstrainedRoadGrade(tags),
  });
  const maximumFill = maximumRoadSmoothingLift(tags);
  // A perfect mathematical grade envelope can propagate a single coarse DEM
  // peak for hundreds of metres. Apply the useful part of that correction but
  // cap ordinary-road fill to a class-aware, inspectable limit. Foundations
  // conceal the small cut/fill transition; a seven-metre false embankment can
  // no longer be created to satisfy one noisy terrain sample.
  const requiredFill = Math.max(...drivableHeights.map((height, index) => height - rawHeights[index]));
  const profileShift = Math.max(0, requiredFill - maximumFill);
  heights = drivableHeights.map((height, index) => Math.max(rawHeights[index], height - profileShift));
  samples.forEach((sample, index) => {
    sample.gradeSmoothingLift = Math.max(0, heights[index] - rawHeights[index]);
    sample.height = heights[index];
  });
  return samples;
}

export class RoadSurfaceIndex {
  constructor(cellSize = 90) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.segmentCount = 0;
  }

  cellKey(x, z) {
    return `${Math.floor(x / this.cellSize)}:${Math.floor(z / this.cellSize)}`;
  }

  add(segment) {
    const padding = segment.width / 2 + 2;
    const minX = Math.floor((Math.min(segment.a.x, segment.b.x) - padding) / this.cellSize);
    const maxX = Math.floor((Math.max(segment.a.x, segment.b.x) + padding) / this.cellSize);
    const minZ = Math.floor((Math.min(segment.a.y, segment.b.y) - padding) / this.cellSize);
    const maxZ = Math.floor((Math.max(segment.a.y, segment.b.y) + padding) / this.cellSize);
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ += 1) {
        const key = `${cellX}:${cellZ}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(segment);
      }
    }
    this.segmentCount += 1;
  }

  addAll(segments) {
    segments.forEach((segment) => this.add(segment));
  }

  sampleAll(x, z, tolerance = 0.75) {
    const candidates = [];
    const baseX = Math.floor(x / this.cellSize);
    const baseZ = Math.floor(z / this.cellSize);
    const visited = new Set();
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
        const segments = this.cells.get(`${baseX + offsetX}:${baseZ + offsetZ}`) || [];
        for (const segment of segments) {
          if (visited.has(segment)) continue;
          visited.add(segment);
          const dx = segment.b.x - segment.a.x;
          const dz = segment.b.y - segment.a.y;
          const lengthSquared = dx * dx + dz * dz;
          if (lengthSquared < 0.0001) continue;
          const t = Math.max(0, Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.y) * dz) / lengthSquared));
          const nearestX = segment.a.x + dx * t;
          const nearestZ = segment.a.y + dz * t;
          const distance = Math.hypot(x - nearestX, z - nearestZ);
          if (distance > segment.width / 2 + tolerance) continue;
          candidates.push({
            bridge: Boolean(segment.bridge),
            distance,
            height: segment.aY + (segment.bY - segment.aY) * t,
            highway: segment.tags?.highway || '',
            name: segment.name || '',
            onRoad: distance <= segment.width / 2,
            t,
            width: segment.width,
          });
        }
      }
    }
    return candidates.sort((a, b) => a.distance - b.distance || b.height - a.height);
  }

  sample(x, z, tolerance = 0.75, referenceHeight = null) {
    const candidates = this.sampleAll(x, z, tolerance);
    if (!candidates.length) return null;
    if (!Number.isFinite(referenceHeight)) return candidates[0];
    candidates.sort((a, b) => {
      const verticalDifference = Math.abs(a.height - referenceHeight) - Math.abs(b.height - referenceHeight);
      return verticalDifference || a.distance - b.distance;
    });
    return candidates[0];
  }
}
