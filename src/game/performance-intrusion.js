export const PERFORMANCE_INTRUSION_STAGES = Object.freeze([
  Object.freeze({ id: 'MONITOR', min: 0 }),
  Object.freeze({ id: 'RESONATOR', min: 0.33 }),
  Object.freeze({ id: 'ENSEMBLE', min: 0.66 }),
  Object.freeze({ id: 'CORRECTION', min: 1 }),
]);

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function performanceIntrusionStage(value) {
  const amount = clamp(value);
  return PERFORMANCE_INTRUSION_STAGES.reduce(
    (stage, candidate) => amount >= candidate.min ? candidate.id : stage,
    'MONITOR',
  );
}

// Reference density never skips the monitor-only opening. It shortens the
// distance to physical propagation once the first exchange resolves: at
// COHERENT a single bad return crosses the resonator threshold, while exact
// variation can still discharge the head start before the room joins in.
export function performanceIntrusionSeed(referenceExposure={}){
  const density=Math.max(0,Math.min(100,Number(referenceExposure?.density)||0));
  if(density>=90)return .30;
  if(density>=70)return .22;
  if(density>=45)return .14;
  return 0;
}

export function reducePerformanceIntrusion(value, {
  missed = false,
  correct = false,
  movementTransition = false,
} = {}) {
  let next = clamp(value);
  if (missed) next += 0.20;
  if (correct) next -= 0.15;
  if (movementTransition) next = next * 0.5 + 0.15;
  next = clamp(next);
  return { value: next, stage: performanceIntrusionStage(next) };
}

export function hushPerformanceAcousticEvent({ battleId, stage, spatial } = {}) {
  return {
    kind: 'hush_performance_propagated',
    source: { kind: 'hush', id: `battle-performance:${battleId || 'unknown'}` },
    spatial: spatial || null,
    semantics: {
      audibleToHush: false,
      audibleToMonitor: true,
      audibleInWorld: true,
      canBeMimicked: false,
      canSpoilTake: false,
      family: 'hush-performance',
      tags: ['hush', 'performance', String(stage || 'RESONATOR').toLowerCase()],
    },
    provenance: { system: 'battle-performance', battleId: String(battleId || '') },
  };
}
