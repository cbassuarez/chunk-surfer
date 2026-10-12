import { sanitizeInterferenceName } from '../game/personalized-interference.js';
import { renderSectorAggregateFrame, renderSectorErrorFrame } from './sector-error.js';

// THE WARNING IS WRITTEN BY WHATEVER IS BREAKING THE DISK.
//
// It used to cut from the failing ntfsclone terminal to a clean card — a navy
// ground, a crisp stderr header, a big centred line — as if the clone had
// recovered in time to deliver a message. It had not: the paranormal thing IS
// the bad sectors. So every frame here is still that terminal, and the name and
// the warning gather in its own character cells as ones and zeroes
// (sector-error.js renderSectorAggregateFrame), formation step by step, with the
// disk's damage running over them.
//
// Only a caller that already holds consent may supply an operator name. This
// renderer performs no identity lookup and returns no literal identity in its
// metadata. Its images live only in the window compositor's transient cache.

// How much of each message has arrived, frame by frame. Gentle modes get only the
// formed frame: no migration, no tears.
export const SOURCE_WARNING_FORM_STEPS = Object.freeze([.35, .7, 1]);
// Plain failing frames that carry the scroll on into the warning.
export const SOURCE_WARNING_PRE_FRAMES = 6;
const ANONYMOUS = Object.freeze(['S I G N A L', 'L O S T', 'S T A Y', 'A L E R T']);
const WARNINGS = Object.freeze(['WATCH OUT', 'IT IS', 'COMING', 'CLOSER']);

// The eight messages, in pane order: four pieces of the name, then the warning.
export function sourceWarningMessages({ operatorName = null, permitted = false } = {}) {
  const safeName = permitted ? sanitizeInterferenceName(operatorName) : null;
  const letters = safeName ? Array.from(safeName.toLocaleUpperCase()) : [];
  const chunk = Math.max(1, Math.ceil(letters.length / 4));
  const nameParts = safeName
    ? Array.from({ length: 4 }, (_, index) => letters.slice(index * chunk, (index + 1) * chunk).join(' '))
    : [...ANONYMOUS];
  return [...nameParts, ...WARNINGS];
}

// { pre: [dataUrl…], messages: [[dataUrl per formation step]… ×8] }
// `mask` (tests) maps a message to an inside(x, y) test in place of rasterising.
export function sourceWarningFrames({
  operatorName = null, permitted = false, documentApi = globalThis.document,
  reducedMotion = false, flashMode = 'full', width = 640, height = 432, seed = 4417, mask = null,
} = {}) {
  const empty = { pre: [], messages: [] };
  if (!documentApi?.createElement) return empty;
  const gentle = !!reducedMotion || flashMode !== 'full';
  const tear = gentle ? 0 : .38;
  const steps = gentle ? [1] : SOURCE_WARNING_FORM_STEPS;
  const stride = gentle ? 1 : 6;
  const common = { width, height, seed, columns: 43, fontPx: 23, referencePalette: true };
  const bake = (draw) => {
    const canvas = documentApi.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext?.('2d');
    if (!ctx || !draw(ctx)) return null;
    try { return canvas.toDataURL('image/png'); } catch (_) { return null; }
  };
  // The scroll carries on from the print bank (sectorErrorPhases, 20 × 6 rows).
  let scroll = 120;
  const pre = [];
  for (let index = 0; index < (gentle ? 2 : SOURCE_WARNING_PRE_FRAMES); index += 1) {
    scroll += stride;
    const at = scroll;
    const frame = bake((ctx) => renderSectorErrorFrame(ctx, { ...common, scroll: at, tear }));
    if (!frame) return empty;
    pre.push(frame);
  }
  const messages = [];
  for (const [index, message] of sourceWarningMessages({ operatorName, permitted }).entries()) {
    const frames = [];
    for (const form of steps) {
      scroll += stride;
      const at = scroll;
      const frame = bake((ctx) => renderSectorAggregateFrame(ctx, {
        ...common, message, form, scroll: at, tear, documentApi, orderSeed: seed + index * 97,
        mask: typeof mask === 'function' ? mask(message) : null,
      }));
      if (!frame) return empty;
      frames.push(frame);
    }
    messages.push(frames);
  }
  return { pre, messages };
}
