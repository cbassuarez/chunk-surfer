import * as scenes from './scenes.js';
import { uiFill, uiSize } from '../render/ui.js';

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const ease = (value, power) => Math.pow(clamp01(value), power);

export function irisBands({ progress = 0, cols = 80, rows = 30 } = {}) {
  const p = clamp01(progress);
  const horizontal = ease(p, 1.8);
  const vertical = ease(p, 1.25);
  const left = Math.ceil(Math.max(0, cols) * 0.5 * horizontal);
  const top = Math.ceil(Math.max(0, rows) * 0.5 * vertical);

  return {
    left,
    right: left,
    top,
    bottom: top,
    covered: p >= 0.999999,
  };
}

export function makeIrisScene({
  direction = 'close',
  duration = 0.46,
  reducedMotion = false,
  onCovered = () => {},
  onDone = () => {},
} = {}) {
  const closing = direction !== 'open';
  const total = reducedMotion
    ? Math.min(0.16, duration)
    : Math.max(0.08, Number(duration) || 0.46);
  let elapsed = 0;
  let coveredFired = false;
  let done = false;
  let scene = null;

  function finish() {
    if (done) return;
    done = true;
    scenes.remove(scene);
    onDone();
  }

  scene = {
    id: `front-end-iris:${closing ? 'close' : 'open'}`,
    overlay: true,
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'visible',
    suppressesHud: true,

    update(dt) {
      elapsed += Math.max(0, Number(dt) || 0);
      const raw = clamp01(elapsed / total);
      const progress = closing ? raw : 1 - raw;
      if (closing && progress >= 0.999999 && !coveredFired) {
        coveredFired = true;
        onCovered();
      }
      if (raw >= 1) finish();
    },

    key() { return true; },
    pointer() { return true; },

    view() {
      const raw = clamp01(elapsed / total);
      return {
        direction: closing ? 'close' : 'open',
        progress: closing ? raw : 1 - raw,
      };
    },

    render() {
      const { cols, rows } = uiSize();
      const { progress } = scene.view();
      const bands = irisBands({ progress, cols, rows });
      const black = '#000000';

      if (bands.left > 0) uiFill(0, 0, bands.left, rows, black);
      if (bands.right > 0) {
        uiFill(Math.max(0, cols - bands.right), 0, bands.right, rows, black);
      }

      const x = bands.left;
      const width = Math.max(0, cols - bands.left - bands.right);
      if (bands.top > 0 && width > 0) uiFill(x, 0, width, bands.top, black);
      if (bands.bottom > 0 && width > 0) {
        uiFill(x, Math.max(0, rows - bands.bottom), width, bands.bottom, black);
      }
      if (progress >= 0.999999) uiFill(0, 0, cols, rows, black);
    },
  };

  return scene;
}

export function makeBlackHoldScene({ id = 'front-end-black' } = {}) {
  return {
    id,
    overlay: true,
    blocksInput: true,
    blocksWorld: true,
    worldPresentation: 'hidden',
    suppressesHud: true,
    key() { return true; },
    pointer() { return true; },
    render() {
      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, '#000000');
    },
  };
}
