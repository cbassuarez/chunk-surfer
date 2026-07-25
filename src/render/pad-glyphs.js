// Controller button glyphs, drawn rather than imported.
//
// Every other icon in this game is code-native line art (see bag-icons.js), and
// the buttons follow that rule: no sprite sheet, no licensing, correct at any UI
// scale, and they inherit the player's phosphor like everything else on the
// faceplate.
//
// These are MONOCHROME, and that was a decision rather than an omission. Vendor
// face-button colours (Xbox green A, red B) were built and then removed from
// both surfaces that drew them: the player picks their own phosphor in
// settings, so a hardcoded Xbox green is simply wrong under a green or blue
// theme, and on a panel where red means danger a red ring reads as a fault.
// Identification comes from the printed letter and the position instead.
//
// Legends are keyed by POSITION, not letter. A Nintendo pad prints A on the
// east button and B on the south, so `south` on Nintendo draws a B — matching
// the hardware under the player's thumb rather than an Xbox convention.

import { uiDraw } from './ui.js';
import { UI_COLOR, themeRoleColor } from './palette.js';

// What is printed on the plastic, by physical position.
const FACE_TEXT = Object.freeze({
  xbox: { south: 'A', east: 'B', west: 'X', north: 'Y' },
  nintendo: { south: 'B', east: 'A', west: 'Y', north: 'X' },
  playstation: { south: '✕', east: '○', west: '□', north: '△' },
  generic: { south: 'S', east: 'E', west: 'W', north: 'N' },
});

const SHOULDER_TEXT = Object.freeze({
  xbox: { leftShoulder: 'LB', rightShoulder: 'RB', leftTrigger: 'LT', rightTrigger: 'RT' },
  nintendo: { leftShoulder: 'L', rightShoulder: 'R', leftTrigger: 'ZL', rightTrigger: 'ZR' },
  playstation: { leftShoulder: 'L1', rightShoulder: 'R1', leftTrigger: 'L2', rightTrigger: 'R2' },
  generic: { leftShoulder: 'L1', rightShoulder: 'R1', leftTrigger: 'L2', rightTrigger: 'R2' },
});

const FACE = new Set(['south', 'east', 'west', 'north']);
const SHOULDER = new Set(['leftShoulder', 'rightShoulder']);
const TRIGGER = new Set(['leftTrigger', 'rightTrigger']);
const STICK = new Set(['leftStick', 'rightStick']);
const DPAD = new Set(['dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight']);

export function padGlyphText(id, family = 'generic') {
  const fam = FACE_TEXT[family] ? family : 'generic';
  if (FACE.has(id)) return FACE_TEXT[fam][id];
  if (SHOULDER.has(id) || TRIGGER.has(id)) return SHOULDER_TEXT[fam][id];
  if (id === 'leftStick') return 'L';
  if (id === 'rightStick') return 'R';
  // Every one of these must exist in the 5x7 VFD font — a character the font
  // lacks draws as blank, not as a fallback.
  if (id === 'view') return fam === 'nintendo' ? '-' : fam === 'playstation' ? 'SH' : 'VW';
  if (id === 'menu') return fam === 'nintendo' ? '+' : fam === 'playstation' ? 'OP' : 'MN';
  return '';
}

// Draws one button at cell (x, y). `w`/`h` are in cells. Pressed buttons invert
// — the same lit-block idiom the menus use, so a held button reads as an
// energised element rather than a recoloured one.
export function drawPadGlyph(id, x, y, {
  w = 3, h = 1.6, family = 'generic', pressed = false, alpha = 1, cols = 120,
} = {}) {
  if (!id) return;
  const label = padGlyphText(id, family);

  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const px = x * cellW * dpr;
    const py = y * cellH * dpr;
    const pw = w * cellW * dpr;
    const ph = h * cellH * dpr;
    const stroke = themeRoleColor('phosphor', Math.round(x), cols) || UI_COLOR.amber;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, 1.3 * dpr);
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineJoin = 'miter';

    const cx = px + pw / 2;
    const cy = py + ph / 2;
    const r = Math.min(pw, ph) * 0.46;

    if (FACE.has(id) || STICK.has(id)) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      pressed ? ctx.fill() : ctx.stroke();
      // A stick is a face button with a collar.
      if (STICK.has(id)) { ctx.beginPath(); ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2); ctx.stroke(); }
    } else if (SHOULDER.has(id)) {
      // Bumpers are wide and flat with a rounded top edge.
      ctx.beginPath();
      ctx.moveTo(px + pw * .06, cy + ph * .26);
      ctx.lineTo(px + pw * .06, cy - ph * .10);
      ctx.quadraticCurveTo(cx, cy - ph * .42, px + pw * .94, cy - ph * .10);
      ctx.lineTo(px + pw * .94, cy + ph * .26);
      ctx.closePath();
      pressed ? ctx.fill() : ctx.stroke();
    } else if (TRIGGER.has(id)) {
      // Triggers are the tapered paddle silhouette from the reference sheets.
      ctx.beginPath();
      ctx.moveTo(px + pw * .16, cy + ph * .30);
      ctx.lineTo(px + pw * .10, cy - ph * .16);
      ctx.quadraticCurveTo(cx, cy - ph * .46, px + pw * .90, cy - ph * .22);
      ctx.lineTo(px + pw * .84, cy + ph * .30);
      ctx.closePath();
      pressed ? ctx.fill() : ctx.stroke();
    } else if (DPAD.has(id)) {
      const a = r * .46;
      ctx.beginPath();
      ctx.rect(cx - a, cy - a * 2.4, a * 2, a * 4.8);
      ctx.rect(cx - a * 2.4, cy - a, a * 4.8, a * 2);
      pressed ? ctx.fill() : ctx.stroke();
      // The pressed direction is a filled pip in that arm.
      const dx = id === 'dpadLeft' ? -1 : id === 'dpadRight' ? 1 : 0;
      const dy = id === 'dpadUp' ? -1 : id === 'dpadDown' ? 1 : 0;
      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(cx + dx * a * 1.6, cy + dy * a * 1.6, a * .52, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.roundRect?.(px + pw * .12, cy - ph * .26, pw * .76, ph * .52, ph * .18)
        || ctx.rect(px + pw * .12, cy - ph * .26, pw * .76, ph * .52);
      pressed ? ctx.fill() : ctx.stroke();
    }

    if (label && !DPAD.has(id)) {
      ctx.fillStyle = pressed ? (UI_COLOR.glass || '#050505') : stroke;
      ctx.font = `${Math.round(ph * .52)}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, cy + ph * .02);
    }
    ctx.restore();
  });
}
