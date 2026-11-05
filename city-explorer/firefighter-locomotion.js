import * as THREE from 'three';

const WALK_NOMINAL_SPEED = 1.51;
const RUN_NOMINAL_SPEED = 3.71;
const SPRINT_BLEND_START = 3.8;
const SPRINT_NOMINAL_SPEED = 5.36;
const BLEND_RESPONSE = 11;
const MAX_DELTA = 0.1;
const START_SPEED = 0.08;
const FULL_MOVE_SPEED = 0.38;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const safeNumber = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const blendStep = (current, target, response, delta) => current + (target - current) * (1 - Math.exp(-response * delta));

/** Blend in-place gait clips using measured ground speed and a shared stride phase. */
export function createFirefighterLocomotion(scene, clips) {
  const byName = new Map((clips || []).map(clip => [clip.name, clip]));
  const idleClip = byName.get('Idle');
  const walkClip = byName.get('Walk');
  const runClip = byName.get('Run');
  const sprintClip = byName.get('Sprint');
  if (![idleClip, walkClip, runClip].every(clip => clip && clip.duration > 0 && clip.tracks.length)) {
    throw new Error('Firefighter locomotion requires non-empty Idle, Walk, and Run clips');
  }

  const mixer = new THREE.AnimationMixer(scene);
  const idle = mixer.clipAction(idleClip, scene);
  const walk = mixer.clipAction(walkClip, scene);
  const run = mixer.clipAction(runClip, scene);
  const sprint = sprintClip?.duration > 0 && sprintClip.tracks.length ? mixer.clipAction(sprintClip, scene) : null;
  for (const action of [idle, walk, run, ...(sprint ? [sprint] : [])]) {
    action.enabled = true;
    action.paused = true;
    action.setEffectiveWeight(0);
    action.play();
  }
  idle.setEffectiveWeight(1);

  let idleWeight = 1;
  let walkWeight = 0;
  let runWeight = 0;
  let sprintWeight = 0;
  let speed = 0;
  let phase = 0;
  let idleTime = 0;
  let mode = 'idle';

  function update(delta, planarSpeed) {
    const dt = clamp(Math.max(0, safeNumber(delta)), 0, MAX_DELTA);
    speed = Math.max(0, safeNumber(planarSpeed));
    const moving = speed > START_SPEED;
    const moveWeight = moving ? clamp((speed - START_SPEED) / (FULL_MOVE_SPEED - START_SPEED), 0, 1) : 0;
    const runBlend = clamp((speed - WALK_NOMINAL_SPEED) / (RUN_NOMINAL_SPEED - WALK_NOMINAL_SPEED), 0, 1);
    const targetWalk = moveWeight * (1 - runBlend);
    const sprintBlend = sprint ? clamp((speed - SPRINT_BLEND_START) / (SPRINT_NOMINAL_SPEED - SPRINT_BLEND_START), 0, 1) : 0;
    const targetRun = moveWeight * runBlend * (1 - sprintBlend);
    const targetSprint = moveWeight * sprintBlend;
    const targetIdle = 1 - moveWeight;

    idleWeight = blendStep(idleWeight, targetIdle, BLEND_RESPONSE, dt);
    walkWeight = blendStep(walkWeight, targetWalk, BLEND_RESPONSE, dt);
    runWeight = blendStep(runWeight, targetRun, BLEND_RESPONSE, dt);
    sprintWeight = blendStep(sprintWeight, targetSprint, BLEND_RESPONSE, dt);
    const totalWeight = idleWeight + walkWeight + runWeight + sprintWeight || 1;
    idleWeight /= totalWeight;
    walkWeight /= totalWeight;
    runWeight /= totalWeight;
    sprintWeight /= totalWeight;

    if (moving) {
      const walkStride = WALK_NOMINAL_SPEED * walkClip.duration;
      const runStride = RUN_NOMINAL_SPEED * runClip.duration;
      const runStrideBlend = sprint ? runStride * (1 - sprintBlend) + SPRINT_NOMINAL_SPEED * sprintClip.duration * sprintBlend : runStride;
      const effectiveStride = walkStride * (1 - runBlend) + runStrideBlend * runBlend;
      phase = (phase + speed * dt / effectiveStride) % 1;
    }
    idleTime = (idleTime + dt) % idleClip.duration;

    idle.time = idleTime;
    walk.time = phase * walkClip.duration;
    run.time = phase * runClip.duration;
    idle.setEffectiveWeight(idleWeight);
    walk.setEffectiveWeight(walkWeight);
    run.setEffectiveWeight(runWeight);
    if (sprint) {
      sprint.time = phase * sprintClip.duration;
      sprint.setEffectiveWeight(sprintWeight);
    }
    mixer.update(dt);

    if (speed <= START_SPEED && idleWeight > 0.98) mode = 'idle';
    else if (sprintWeight > 0.98) mode = 'sprint';
    else if (runWeight > 0.98) mode = 'run';
    else if (walkWeight > 0.98) mode = 'walk';
    else if (speed > WALK_NOMINAL_SPEED + 0.25) mode = 'transition';
    else mode = 'walk';
  }

  function state() {
    return {
      mode,
      speed,
      phase,
      weights: { Idle: idleWeight, Walk: walkWeight, Run: runWeight, Sprint: sprintWeight },
      actionTimes: { Walk: walk.time, Run: run.time, Sprint: sprint?.time ?? 0 },
      walkPlaybackRate: speed / WALK_NOMINAL_SPEED,
      runPlaybackRate: speed / RUN_NOMINAL_SPEED,
    };
  }

  return { update, state };
}
