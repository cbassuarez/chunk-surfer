// Physical direction for the playable last leg of a run. A route advances by
// actual walking/interaction progress; time only lets its current pose settle.
// This module neither completes an objective nor changes the player's pace.
const ROUTES = Object.freeze({
  sacrifice: [['commit', 1]],
  helped: [['commit', 1]],
  inversion: [['door', .45], ['at-door', .05], ['rescue', .5]],
  drugged: [['door', .45], ['at-door', .05], ['rescue', .5]],
  surfaced: [['public-doors', .55], ['service-road', .4], ['ledger', .05]],
  'tower-won': [['grip', .08], ['drag', .67], ['threshold', .2], ['outside', .05]],
  'contact-won': [['approach', .55], ['fault', .45]],
  'contact-lost': [['approach', .55], ['fault', .45]],
  'tower-lost': [['approach', .55], ['crossing', .45]],
});

const clamp = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Math.max(0, Math.min(1, Number(value))) : fallback;
const finiteMs = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const totalProgress = (route, index, progress) => route.reduce((sum, [, weight], i) =>
  sum + (i < index ? weight : i === index ? weight * progress : 0), 0);

export const ENDING_APPROACH_STAGES = Object.freeze(Object.fromEntries(
  Object.entries(ROUTES).map(([id, stages]) => [id, Object.freeze(stages.map(([stage]) => stage))]),
));

export function createEndingApproachState(endingId, { stage } = {}) {
  const route = ROUTES[endingId];
  if (!route) return null;
  const index = stage == null ? 0 : route.findIndex(([name]) => name === stage);
  if (index < 0) return null;
  return Object.freeze({
    endingId, stage: route[index][0], stageIndex: index, stageProgress: 0,
    progress: totalProgress(route, index, 0), elapsedMs: 0, stageElapsedMs: 0,
    complete: false,
  });
}

export function advanceEndingApproach(state, {
  stage = state?.stage, progress = state?.stageProgress, dtMs = 0,
  paused = false, complete = false,
} = {}) {
  if (!state || !ROUTES[state.endingId] || state.complete) return state;
  const route = ROUTES[state.endingId];
  const requestedIndex = route.findIndex(([name]) => name === stage);
  // Late callbacks from an earlier leg must not resurrect it. An unknown stage
  // is ignored, including its progress, rather than advancing the current leg.
  const accepted = requestedIndex >= state.stageIndex;
  const index = accepted ? requestedIndex : state.stageIndex;
  const changed = index !== state.stageIndex;
  const stageProgress = complete ? 1 : accepted
    ? Math.max(changed ? 0 : state.stageProgress, clamp(progress))
    : state.stageProgress;
  const elapsed = paused ? 0 : finiteMs(dtMs);
  return Object.freeze({
    endingId: state.endingId,
    stage: route[index][0], stageIndex: index, stageProgress,
    progress: complete ? 1 : Math.max(state.progress, totalProgress(route, index, stageProgress)),
    elapsedMs: state.elapsedMs + elapsed,
    stageElapsedMs: changed ? 0 : state.stageElapsedMs + elapsed,
    complete: !!complete,
  });
}

const NEUTRAL = Object.freeze({
  active: false, endingId: null, stage: null, progress: 0,
  elapsedMs: 0, stageElapsedMs: 0,
  camera: Object.freeze({ eyeDropM: 0, pitchOffset: 0, rollOffset: 0 }),
  world: Object.freeze({ containment: 0, reverseCollapse: 0, daylight: 0,
    payloadWeight: 0, synchronization: 0, sourceContraction: 0 }),
});

export function endingApproachSnapshot(state, { reducedMotion = false } = {}) {
  if (!state || !ROUTES[state.endingId]) return NEUTRAL;
  const id = state.endingId;
  const progress = clamp(state.progress);
  const settle = smooth(state.elapsedMs / 900);
  const p = smooth(progress);
  const camera = { eyeDropM: 0, pitchOffset: 0, rollOffset: 0 };
  const world = { ...NEUTRAL.world };

  if (id === 'sacrifice' || id === 'helped') {
    world.containment = p;
    camera.eyeDropM = (.025 + .065 * p) * settle;
    camera.pitchOffset = -.028 * p * settle;
  } else if (id === 'inversion' || id === 'drugged') {
    world.reverseCollapse = p;
    world.daylight = smooth((progress - .62) / .38);
    // The second leg gradually relinquishes the tilted interior as the actual
    // exterior begins to occupy the image. The route is still fully walkable.
    camera.rollOffset = -.025 * Math.sin(Math.PI * progress) * settle;
    camera.pitchOffset = -.018 * (1 - world.daylight) * settle;
  } else if (id === 'surfaced') {
    const onRoad = smooth((progress - .55) / .45);
    world.payloadWeight = (1 - .55 * onRoad) * settle;
    world.daylight = onRoad;
    camera.eyeDropM = .12 * world.payloadWeight;
    camera.pitchOffset = -.04 * world.payloadWeight;
    camera.rollOffset = -.026 * world.payloadWeight;
  } else if (id === 'tower-won') {
    const gripped = state.stage !== 'grip' || state.stageProgress >= 1;
    const recovery = smooth((progress - .75) / .25);
    world.payloadWeight = gripped ? (1 - .72 * recovery) * settle : 0;
    world.daylight = recovery;
    camera.eyeDropM = .17 * world.payloadWeight;
    camera.pitchOffset = -.055 * world.payloadWeight;
    camera.rollOffset = .03 * world.payloadWeight;
  } else if (id === 'tower-lost') {
    world.synchronization = p;
    camera.eyeDropM = .05 * p * settle;
    camera.pitchOffset = -.022 * p * settle;
  } else {
    // Contact is spatial narrowing. It must not bring pressure hiss, heartbeat
    // or a submerged audio treatment back into Source.
    world.sourceContraction = p;
    camera.eyeDropM = .07 * p * settle;
    camera.pitchOffset = -.026 * p * settle;
  }

  if (reducedMotion) {
    camera.eyeDropM = 0;
    camera.pitchOffset = 0;
    camera.rollOffset = 0;
  }
  return Object.freeze({
    active: true, endingId: id, stage: state.stage, progress,
    elapsedMs: state.elapsedMs, stageElapsedMs: state.stageElapsedMs,
    camera: Object.freeze(camera), world: Object.freeze(world),
  });
}

// Stable, bounded prop transforms in metres relative to the route's origin and
// forward vector. Containment advances from the far corridor toward the player;
// inversion runs that ordering backward. Geometry stays at the corridor sides
// so presentation cannot create a new collision or block a timed escape.
export function endingApproachDebris(snapshot, { reducedMotion = false } = {}) {
  const containment = clamp(snapshot?.world?.containment);
  const reverse = clamp(snapshot?.world?.reverseCollapse);
  const amount = Math.max(containment, reverse);
  if (!amount) return [];
  const reversing = reverse > containment;
  const out = [];
  for (let row = 0; row < 8; row += 1) {
    const order = reversing ? 7 - row : row;
    const phase = clamp(amount * 9 - order);
    if (!phase) continue;
    const fall = reducedMotion ? 1 : smooth(phase);
    for (const side of [-1, 1]) {
      out.push(Object.freeze({
        id: `ending-approach-debris-${row}-${side < 0 ? 'left' : 'right'}`,
        forwardM: -14 + row * 1.65,
        sideM: side * (1.2 + (row % 3) * .12),
        elevationM: (1 - fall) * 2.4,
        yaw: side * (.24 + row * .19),
        scale: .5 + (row % 3) * .1,
      }));
    }
  }
  return out;
}
