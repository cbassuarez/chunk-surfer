// Pure compiler for AUDIOCORP's architectural window scores. Coordinates are
// normalized to the current monitor work area; conversion, clamping, animation,
// cancellation, and restoration belong to the native executor.

export const WINDOW_CUE_IDS = Object.freeze(['broadcast', 'overload', 'conceal', 'loop', 'silence', 'reject']);
export const WINDOW_STAGE_IDS = Object.freeze(['foreshadow', 'recognition', 'control', 'handoff', 'finale']);
export const WINDOW_ECHO_LABELS = Object.freeze([
  'interference-echo-1',
  'interference-echo-2',
  'interference-echo-3',
]);

const BPM = 168;
const BEAT_MS = 60_000 / BPM;
const unit = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const frame = (atBeat, geometry, aperture = 'open') => Object.freeze({
  atMs: Math.round(atBeat * BEAT_MS),
  geometry: Object.freeze({
    x: unit(geometry.x), y: unit(geometry.y),
    width: unit(geometry.width), height: unit(geometry.height),
  }),
  aperture,
});

const ROOM_SHAPES = Object.freeze({
  foreshadow: { x: 0.11, y: 0.08, width: 0.78, height: 0.84, aperture: 'door-frame' },
  recognition: { x: 0.05, y: 0.29, width: 0.90, height: 0.46, aperture: 'pool-reflection' },
  control: { x: 0.13, y: 0.06, width: 0.74, height: 0.88, aperture: 'proscenium' },
  handoff: { x: 0.20, y: 0.08, width: 0.60, height: 0.84, aperture: 'lancet' },
  finale: { x: 0.10, y: 0.12, width: 0.80, height: 0.76, aperture: 'fold' },
});
const REST = Object.freeze({ x: 0.08, y: 0.08, width: 0.84, height: 0.84 });

function stageFor(stage, encounterId) {
  if (encounterId === 'source-final') return 'finale';
  return WINDOW_STAGE_IDS.includes(stage) ? stage : 'recognition';
}

function echoBudget(stage, intensity, cueId, inputLocked) {
  if (!inputLocked || intensity === 'low' || ['silence', 'reject'].includes(cueId)) return 0;
  // STANDARD's one auxiliary surface is the existing monitor-return sidecar.
  // Echo panes are reserved for the hostile chapel/finale architecture.
  if (intensity === 'standard') return 0;
  // The monitor return is itself an auxiliary window. Two echoes plus it keep
  // the entire cast at four windows including the game.
  if (stage === 'finale') return 2;
  if (stage === 'handoff') return 2;
  return 0;
}

function geometryFor(shape, cueId, variant = 0) {
  if (cueId === 'overload') {
    return {
      x: unit(shape.x + 0.07), y: unit(shape.y + 0.06),
      width: unit(shape.width - 0.14), height: unit(shape.height - 0.12),
    };
  }
  if (cueId === 'loop') {
    const displacement = (variant % 2 ? -1 : 1) * 0.035;
    return { ...shape, x: unit(shape.x + displacement) };
  }
  if (cueId === 'silence') return { x: 0.48, y: 0.48, width: 0.04, height: 0.04 };
  return shape;
}

export function compileWindowChoreography({
  token,
  stage = 'recognition',
  encounterId = '',
  cueId = 'broadcast',
  intensity = 'standard',
  fullscreen = false,
  nativePositioning = true,
  inputLocked = false,
  variant = 0,
  narrativeTiming = false,
  mainGeometry = null,
  hold = false,
} = {}) {
  if (typeof token !== 'string' || !/^[a-z0-9-]{8,96}$/iu.test(token)) return null;
  if (!WINDOW_CUE_IDS.includes(cueId)) return null;
  const safeStage = stageFor(stage, encounterId);
  const safeIntensity = ['low', 'standard', 'hostile'].includes(intensity) ? intensity : 'standard';
  const disruptive = ['overload', 'conceal', 'silence', 'loop'].includes(cueId);
  if (disruptive && !inputLocked) return null;
  if (cueId === 'conceal' && (safeIntensity !== 'hostile' || !inputLocked)) return null;
  const shape = ROOM_SHAPES[safeStage];
  const authoredGeometry = mainGeometry && ['x', 'y', 'width', 'height']
    .every((key) => Number.isFinite(Number(mainGeometry[key])))
    ? {
        x: unit(mainGeometry.x), y: unit(mainGeometry.y),
        width: unit(mainGeometry.width), height: unit(mainGeometry.height),
      }
    : null;
  const target = geometryFor(authoredGeometry || shape, cueId, variant);
  const displayMode = fullscreen || !nativePositioning || safeIntensity === 'low' || !inputLocked ? 'internal' : 'native';
  const durationBeats = cueId === 'silence' ? 2 : cueId === 'reject' ? 1 : 3;
  const echoes = echoBudget(safeStage, safeIntensity, cueId, inputLocked);
  return Object.freeze({
    schema: 1,
    token,
    stage: safeStage,
    cueId,
    intensity: safeIntensity,
    displayMode,
    inputLocked: !!inputLocked,
    timing: Object.freeze({
      clock: narrativeTiming ? 'story' : 'battle-168',
      bpm: narrativeTiming ? null : BPM,
      durationMs: Math.round(durationBeats * BEAT_MS),
    }),
    hold: !!hold,
    main: Object.freeze(hold ? [
      frame(0, REST, shape.aperture),
      frame(cueId === 'reject' ? 0.25 : 1, target, cueId === 'conceal' ? 'occluded' : shape.aperture),
    ] : [
      frame(0, REST, shape.aperture),
      frame(cueId === 'reject' ? 0.25 : 1, target, cueId === 'conceal' ? 'occluded' : shape.aperture),
      frame(durationBeats, REST, cueId === 'reject' ? 'rejected' : 'restored'),
    ]),
    echoes: Object.freeze(WINDOW_ECHO_LABELS.slice(0, echoes).map((label, index) => Object.freeze({
      label,
      silhouette: safeStage === 'finale'
        ? ['pool-reflection', 'proscenium', 'lancet'][index]
        : (index === 0 ? shape.aperture : 'lancet'),
      index,
    }))),
  });
}

export function validateWindowChoreographyPlan(value) {
  if (!value || value.schema !== 1 || typeof value.token !== 'string') return false;
  if (!WINDOW_STAGE_IDS.includes(value.stage) || !WINDOW_CUE_IDS.includes(value.cueId)) return false;
  if (!['native', 'internal'].includes(value.displayMode)) return false;
  if (!Array.isArray(value.main) || value.main.length < 2) return false;
  if (!Array.isArray(value.echoes) || value.echoes.length > 3) return false;
  if (value.echoes.some((entry) => !WINDOW_ECHO_LABELS.includes(entry?.label))) return false;
  return value.main.every((keyframe) => ['x', 'y', 'width', 'height']
    .every((key) => Number.isFinite(keyframe?.geometry?.[key]) && keyframe.geometry[key] >= 0 && keyframe.geometry[key] <= 1));
}
