import { CUE, PAGE_TURNS, playCue, preloadAll, stopCueGroup } from './cues.js';

// Use the individual rustles in the recorded paper takes and the pen on the
// lodge form. Whole cues include actions outside the post-take gesture.
const PICK_UP = PAGE_TURNS[3];
const PUT_DOWN = PAGE_TURNS[2];
const SHORT_STROKES = [0.489, 0.597, 0.699, 0.893];

export function createWorkOrderFoley({
  preload = preloadAll, play = playCue, stopGroup = stopCueGroup,
} = {}) {
  const sheet = Symbol('work-order-paper');
  const nib = Symbol('work-order-biro');
  let strokeIndex = 0;
  let prepared = null;

  function stopStroke() {
    return stopGroup(nib, 0.014);
  }

  return {
    warm() {
      prepared ??= Promise.resolve(preload([PICK_UP, PUT_DOWN, CUE.signature], { concurrency: 2 }))
        .then(buffers => {
          if (Array.isArray(buffers) && !buffers.every(Boolean)) prepared = null;
          return buffers;
        }, () => { prepared = null; });
      return prepared;
    },
    lift() {
      stopGroup(sheet, 0.025);
      strokeIndex = 0;
      return play(PICK_UP, {
        group: sheet, gain: 0.43, pan: -0.27, lowpassHz: 6800,
        trimStart: 0.038, trimEnd: 0.476, fadeIn: 0.022, fadeOut: 0.065,
      });
    },
    stroke({ duration, strength = 0.6 } = {}) {
      stopStroke();
      if (!Number.isFinite(duration) || duration <= 0) return null;
      const length = Math.min(duration, 0.54);
      const pressure = Number.isFinite(strength) ? Math.min(1, Math.max(0, strength)) : 0.6;
      const long = length > 0.17;
      const trimStart = long ? 0.483 : SHORT_STROKES[strokeIndex % SHORT_STROKES.length];
      strokeIndex += 1;
      return play(CUE.signature, {
        group: nib, gain: 0.17 + pressure * 0.32, pan: -0.19, lowpassHz: 4900 + pressure * 2300,
        trimStart, sliceSeconds: length, fadeIn: Math.min(0.006, length / 3),
        fadeOut: Math.min(0.022, length / 2),
      });
    },
    stopStroke,
    lower() {
      stopStroke();
      stopGroup(sheet, 0.028);
      return play(PUT_DOWN, {
        group: sheet, gain: 0.31, pan: -0.28, lowpassHz: 5600,
        trimStart: 0.323, trimEnd: 0.642, fadeIn: 0.010, fadeOut: 0.064,
      });
    },
    stop() {
      stopStroke();
      stopGroup(sheet, 0.025);
    },
  };
}
