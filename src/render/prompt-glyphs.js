// Button prompts drawn as buttons.
//
// `inputPrompt('confirm')` returns `[A]` — correct, per-family, and testable,
// and it stays the fallback and the accessible representation. But a bracketed
// letter is a description of a button, not a picture of one, and on a pad the
// player is looking for the shape their thumb is already resting on.
//
// So this module renders the same prompt line one of two ways:
//   keyboard → the bracketed text, unchanged
//   controller → a drawn glyph from pad-glyphs.js, followed by the label
//
// Everything here is measured in UI cells, the same grid uiText writes on, so
// a prompt line can be laid out, measured for right-alignment, and drawn
// without any surface needing to know which device is active.

import { uiText } from './ui.js';
import { drawPadGlyph } from './pad-glyphs.js';
import {
  activeControllerFamily,
  activeInputPromptDevice,
  controllerPromptToken,
  inputPrompt,
  inputPromptLabel,
} from '../game/bindings.js';

// A drawn glyph occupies this many cells. Wide enough for `LB`/`ZR`/`R2`
// without the legend touching the outline.
const GLYPH_CELLS = 3;
const SEPARATOR = ' · ';

// What a single prompt resolves to on the active device. `text` is always the
// truth — `buttonId` is set only when there is a real button to draw.
export function inputGlyph(action, {
  device = activeInputPromptDevice(),
  family = activeControllerFamily(),
} = {}) {
  const text = inputPrompt(action, { device, family });
  if (device !== 'controller') return { device, action, buttonId: null, text, cells: text.length };
  // Composite prompts ("LEFT STICK / D-PAD") have no single button, so they
  // stay as text — drawing half of a two-part answer would be worse than words.
  const buttonId = controllerPromptToken(action);
  if (!buttonId) return { device, action, buttonId: null, text, cells: text.length };
  return { device, action, buttonId, family, text, cells: GLYPH_CELLS };
}

function normalizeParts(parts = []) {
  return parts.map((part) => (typeof part === 'string' ? { text: part } : part)).filter(Boolean);
}

// Total width in cells, so callers can right-align or centre before drawing.
export function promptPartsWidth(parts = [], options = {}) {
  return normalizeParts(parts).reduce((total, part, i) => {
    const sep = i ? SEPARATOR.length : 0;
    if (part.text != null && !part.action) return total + sep + String(part.text).length;
    const glyph = inputGlyph(part.action, options);
    const label = part.label ? ` ${part.label}` : '';
    return total + sep + glyph.cells + label.length;
  }, 0);
}

// Draws the line and returns the width it consumed. Glyph prompts sit on the
// same baseline as the label text, so a mixed line stays on one row.
export function drawPromptParts(x, y, parts = [], {
  role = 'ui-secondary', labelRole = null, alpha = 1, cols = 120, ...options
} = {}) {
  let cx = x;
  normalizeParts(parts).forEach((part, i) => {
    if (i) { uiText(cx, y, SEPARATOR, role, alpha * 0.6); cx += SEPARATOR.length; }
    if (part.text != null && !part.action) {
      uiText(cx, y, String(part.text), labelRole || role, alpha);
      cx += String(part.text).length;
      return;
    }
    const glyph = inputGlyph(part.action, options);
    if (glyph.buttonId) {
      drawPadGlyph(glyph.buttonId, cx, y - 0.3, {
        w: GLYPH_CELLS, h: 1.6, family: glyph.family, alpha, cols,
      });
    } else {
      uiText(cx, y, glyph.text, role, alpha);
    }
    cx += glyph.cells;
    if (part.label) {
      uiText(cx, y, ` ${part.label}`, labelRole || role, alpha);
      cx += String(part.label).length + 1;
    }
  });
  return cx - x;
}
