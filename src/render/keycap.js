// PRESSABLE PLASTIC, AND THE INK ON IT.
//
// Two finishes of the same object, kept here because prompt-glyphs.js and
// presentation.js both need them and presentation.js already imports
// prompt-glyphs — so this is the shared floor under both rather than a cycle
// between them.
//
//   drawKeycap      a keyboard key: PALE plastic, DARK character, raised edge
//   drawCapLegend   the ink itself, for a keycap or an illuminated legend cap
//
// `[R]` is a description of a key, not a picture of one. The prompt line said it
// in brackets because brackets are all a text grid has; this surface already
// draws plastic in a bezel for the recorder's transport keys, and a keyboard key
// is that same object with the finish inverted. One physical vocabulary: a thing
// you press is a moulded square with something printed on its face, whether it
// is on the machine in your hands or the keyboard under them.
//
// The legend is drawn with halation 0 — ink on plastic, not phosphor behind
// glass. The atlas states the rule: light around a printed mark is how you make
// print look like a screenshot of print.

import { uiDrawHardware } from './ui.js';
import { drawHardwarePrint } from './hardware-faceplate.js';
import { drawHardwareCap, hardwareMotionReduced } from './hardware-material.js';
import { sampleControl } from '../game/control-mechanics.js';

export function drawCapLegend(ctx, text, x, y, w, h, color, dpr, cellW, cellH, alpha = 1) {
  const value = String(text).toUpperCase();
  if (!value) return;
  // Continuous letterforms printed into the plastic; no dot-matrix atlas,
  // dormant pixels, animated wear or emission. The box moves with the cap.
  return drawHardwarePrint(ctx, value, x * cellW * dpr, y * cellH * dpr, {
    width: w * cellW * dpr, height: h * cellH * dpr,
    color, dpr, alpha, align: 'center', finish: 'screenprint', seed: value,
  });
}

/** Printed text in UI cells, separate from electronic uiText readouts. */
export function drawPrintedText(x, y, text, {
  w = Math.max(1, String(text ?? '').length), h = 1, ink = '#191c13',
  alpha = 1, align = 'left', finish = 'screenprint', seed = String(text ?? ''), darkPanel = true,
} = {}) {
  uiDrawHardware(({ctx,dpr,cellW,cellH}) => drawHardwarePrint(ctx, String(text ?? ''), x*cellW*dpr, y*cellH*dpr, {
    width: Math.max(0,w)*cellW*dpr, height: Math.max(0,h)*cellH*dpr,
    color: ink, alpha, align, finish, seed, dpr, darkPanel,
  }));
}


// ── KEYCAPS ──────────────────────────────────────────────────────────────────
//
// `[R]` is a description of a key, not a picture of one. The prompt line has
// always said it in brackets because brackets are all a text grid has — but this
// surface already draws plastic in a bezel for the transport keys, and a
// keyboard key is the same object with a different finish: PALE plastic with a
// DARK character on it. Unlike an annunciator lens, it has no metal retainer
// or internal illumination.
//
// It reuses the cap machinery deliberately. One physical vocabulary: a thing you
// press is a moulded square with something printed on its face, whether it is on
// the machine in your hands or the keyboard under them.
const KEYCAP_INK = '#16170F';

/** One keyboard key, `label` printed on its face. Sizes are UI cells. */
export function drawKeycap(x, y, w, h, { label = '', alpha = 1, dim = false, controlId = `prompt:${label}` } = {}) {
  const state = sampleControl(controlId, { lit: false, reducedMotion: hardwareMotionReduced() });
  uiDrawHardware(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr, py = y * cellH * dpr;
    const pw = w * cellW * dpr, ph = h * cellH * dpr;
    const a = alpha * (dim ? .62 : 1);
    const cap = drawHardwareCap(ctx, px, py, pw, ph, { color:'white', finish:'keycap', travel:state.travel, alpha:a, dpr });
    drawCapLegend(ctx, label, x + cap.content.x/(cellW*dpr), y + cap.content.y/(cellH*dpr),
      cap.content.w/(cellW*dpr), cap.content.h/(cellH*dpr), KEYCAP_INK, dpr, cellW, cellH, a);
  });
  return w;
}
