import { compileWindowChoreography, WINDOW_CUE_IDS, WINDOW_STAGE_IDS } from './window-choreography.js';

export const CHOREOGRAPHY_LAB_MONITORS = Object.freeze([
  { id: '1080p-1x', width: 1920, height: 1080, scale: 1, origin: [0, 0], nativePositioning: true },
  { id: 'retina-2x', width: 3024, height: 1964, scale: 2, origin: [0, 0], nativePositioning: true },
  { id: 'negative-origin', width: 2560, height: 1440, scale: 1.5, origin: [-2560, -180], nativePositioning: true },
  { id: 'wayland-fallback', width: 1920, height: 1080, scale: 1, origin: [0, 0], nativePositioning: false },
]);

const PROFILE_VECTORS = Object.freeze([
  { id: 'relief', adaptiveBand: -1 },
  { id: 'neutral', adaptiveBand: 0 },
  { id: 'pressure', adaptiveBand: 1 },
]);

export function buildWindowChoreographyLabCases() {
  const cases = [];
  for (const stage of WINDOW_STAGE_IDS) for (const cueId of WINDOW_CUE_IDS) {
    for (const intensity of ['low', 'standard', 'hostile']) for (const profile of PROFILE_VECTORS) {
      for (const monitor of CHOREOGRAPHY_LAB_MONITORS) for (const fullscreen of [false, true]) {
        for (const windowMovement of [false, true]) {
          const nativePositioning = monitor.nativePositioning && windowMovement;
          const id = [stage, cueId, intensity, profile.id, monitor.id, fullscreen ? 'fullscreen' : 'windowed', windowMovement ? 'motion' : 'no-motion'].join(':');
          const plan = compileWindowChoreography({
            token: `lab-${Math.abs(hash(id)).toString(36).padStart(8, '0')}`,
            stage,
            encounterId: stage === 'finale' ? 'source-final' : '',
            cueId,
            intensity,
            fullscreen,
            nativePositioning,
            inputLocked: true,
            variant: profile.adaptiveBand,
          });
          cases.push(Object.freeze({ id, stage, cueId, intensity, profile, monitor, fullscreen, windowMovement, plan }));
        }
      }
    }
  }
  return Object.freeze(cases);
}

function hash(value) {
  let out = 0x811c9dc5;
  for (const char of String(value)) out = Math.imul(out ^ char.charCodeAt(0), 16777619) >>> 0;
  return out;
}

export function choreographyLabSummary(cases = buildWindowChoreographyLabCases()) {
  return Object.freeze({
    cases: cases.length,
    compiled: cases.filter((entry) => entry.plan).length,
    suppressed: cases.filter((entry) => !entry.plan).length,
    native: cases.filter((entry) => entry.plan?.displayMode === 'native').length,
    internal: cases.filter((entry) => entry.plan?.displayMode === 'internal').length,
    maxEchoes: Math.max(0, ...cases.map((entry) => entry.plan?.echoes?.length || 0)),
  });
}
