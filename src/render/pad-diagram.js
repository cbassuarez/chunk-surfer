// The controller diagram, drawn on the glyph layer.
//
// This screen used to be a DOM overlay that re-implemented a VFD panel in CSS:
// browser-font text, a border-box "selection", and a hand-authored SVG blob for
// the pad. It looked like a web page wearing a faceplate, because that is what
// it was. Everything here now goes through the same surface as the rest of the
// instrument, which means it inherits the phosphor, the duty tiers, the scan
// dither and the lens for free instead of approximating them.
//
// Colour discipline: the panel is monochrome phosphor with two sanctioned
// accents from the VFD palette itself — `counter` (the warm readout amber a
// real module uses for its numerals) marks the binding a row points at, and
// `marker` (the red annunciator) is reserved for capture. Both are theme roles,
// so they follow the player's chosen phosphor instead of fighting it. No vendor
// colours: a hardcoded Xbox green is simply wrong under a green or blue theme.

import { uiCellMetrics, uiDraw, uiText } from './ui.js';
import { themeRoleColor, themeRoleDim, uiBrightness } from './palette.js';
import { drawVfdGlyph } from './vfd-font.js';
import { PAD_OUTLINE, BUTTON_POSITIONS } from '../game/controller-ui.js';

// The drawing box. Wider than the pad itself because the leader labels run out
// into margins either side — projecting only 0..100 put every right-hand label
// outside the diagram column and straight over the binding list.
export const PAD_BOX = Object.freeze({ x: -30, y: 0, w: 162, h: 86 });

// The projection lives in CELL space, computed once and shared by the canvas
// art and the uiText legends — two projections would drift apart and put every
// label a little off its own leader line.
//
// Cells are taller than they are wide, so a pad unit is worth `k` cells across
// and `k * aspect` cells down. That is the whole reason this cannot be worked
// out inside the draw callback and handed to uiText afterwards.
export function padProjection(rect) {
  const { aspect } = uiCellMetrics();
  const ar = aspect > 0 ? aspect : 0.5;
  const k = Math.min(rect.w / PAD_BOX.w, rect.h / (PAD_BOX.h * ar));
  const ox = rect.x + (rect.w - PAD_BOX.w * k) / 2 - PAD_BOX.x * k;
  const oy = rect.y + (rect.h - PAD_BOX.h * k * ar) / 2 - PAD_BOX.y * k * ar;
  return {
    // pad space -> cell space
    cx: (v) => ox + v * k,
    cy: (v) => oy + v * k * ar,
    cells: k,
  };
}

// A closed outline through the profile points. Quadratic segments between
// successive midpoints round every corner without needing hand-placed control
// points, which is what keeps the mirrored halves identical.
function traceOutline(ctx, p) {
  const pts = PAD_OUTLINE;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[pts.length - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(p.x(start[0]), p.y(start[1]));
  for (let i = 0; i < pts.length; i += 1) {
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(p.x(cur[0]), p.y(cur[1]), p.x(m[0]), p.y(m[1]));
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

// Marks that are shapes rather than letters. PlayStation prints a cross, a
// circle, a square and a triangle; Xbox prints three bars and two panes. None
// of those exist in a 5x7 text font, so drawing them as glyphs silently
// rendered nothing at all. They are drawn.
const SHAPE_MARK = Object.freeze({
  cross: (ctx, cx, cy, r) => {
    ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
  },
  circle: (ctx, cx, cy, r) => { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); },
  square: (ctx, cx, cy, r) => ctx.rect(cx - r, cy - r, r * 2, r * 2),
  triangle: (ctx, cx, cy, r) => {
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath();
  },
  bars: (ctx, cx, cy, r) => {
    for (let i = -1; i <= 1; i += 1) { ctx.moveTo(cx - r, cy + i * r * 0.62); ctx.lineTo(cx + r, cy + i * r * 0.62); }
  },
  panes: (ctx, cx, cy, r) => {
    ctx.rect(cx - r, cy - r * 0.7, r * 1.3, r * 1.4);
    ctx.rect(cx - r * 0.3, cy - r * 0.7, r * 1.3, r * 1.4);
  },
});

// Which mark a button wears, by family. Anything absent falls through to the
// dot-matrix legend, which is right for A/B/X/Y and the shoulder names.
const BUTTON_MARK = Object.freeze({
  playstation: { south: 'cross', east: 'circle', west: 'square', north: 'triangle' },
  xbox: { menu: 'bars', view: 'panes' },
  generic: { menu: 'bars', view: 'panes' },
});

const DPAD_ARROW = Object.freeze({
  dpadUp: [[0, -0.32], [-0.3, 0.18], [0.3, 0.18]],
  dpadDown: [[0, 0.32], [-0.3, -0.18], [0.3, -0.18]],
  dpadLeft: [[-0.32, 0], [0.18, -0.3], [0.18, 0.3]],
  dpadRight: [[0.32, 0], [-0.18, -0.3], [-0.18, 0.3]],
});

// `rect` is in UI cells. Returns nothing — this paints straight onto the layer.
export function drawPadDiagram(rect, model, { cols = 120, blinkOn = true } = {}) {
  const proj = padProjection(rect);
  uiDraw(({ ctx, dpr, cellW, cellH }) => {
    const p = {
      x: (v) => proj.cx(v) * cellW * dpr,
      y: (v) => proj.cy(v) * cellH * dpr,
      s: (v) => v * proj.cells * cellW * dpr,
    };
    const at = Math.round(rect.x + rect.w / 2);
    const phosphor = themeRoleColor('phosphor', at, cols);
    const silkscreen = themeRoleColor('silkscreen', at, cols);
    const counter = themeRoleColor('counter', at, cols);
    const marker = themeRoleColor('marker', at, cols);
    const glass = themeRoleDim('phosphor', at, cols);
    const bright = uiBrightness();
    const unit = p.s(1);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // The shell is silkscreen: printed on the panel, not lit by it.
    traceOutline(ctx, p);
    ctx.fillStyle = glass;
    ctx.fill();
    ctx.strokeStyle = silkscreen;
    ctx.lineWidth = Math.max(1, unit * 0.9);
    ctx.stroke();

    for (const button of model.buttons) {
      const pos = button.pos;
      const isStick = button.collar > 0;
      const dx = button.offset?.x || 0;
      const dy = button.offset?.y || 0;

      // Three states, three different mechanisms so they can stack: held is
      // inverse video (the panel's own idiom for "energised"), the selected
      // action's button takes the counter accent, capture blinks the marker.
      let stroke = silkscreen;
      let width = 0.7;
      if (button.active) { stroke = counter; width = 1.15; }
      if (button.captureTarget) { stroke = blinkOn ? marker : silkscreen; width = 1.3; }
      if (button.held) { stroke = phosphor; width = 1.2; }

      ctx.strokeStyle = stroke;
      ctx.fillStyle = button.held ? phosphor : glass;
      ctx.lineWidth = Math.max(1, unit * width);
      if (button.held || button.active || button.captureTarget) {
        ctx.shadowColor = stroke;
        ctx.shadowBlur = 5 * dpr * bright;
      }

      if (isStick) {
        // The collar is the fixed housing; the cap moves with the axes, which
        // is what makes this screen double as a drift test.
        ctx.beginPath();
        ctx.arc(p.x(pos.x), p.y(pos.y), p.s(button.collar), 0, Math.PI * 2);
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = silkscreen;
        ctx.lineWidth = Math.max(1, unit * 0.5);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        ctx.arc(p.x(pos.x + dx), p.y(pos.y + dy), p.s(pos.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if ('r' in pos) {
        ctx.beginPath();
        ctx.arc(p.x(pos.x), p.y(pos.y), p.s(pos.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (DPAD_ARROW[button.id]) {
        // A d-pad arm is a shape, not a labelled box: draw the arm and put a
        // filled chevron in it rather than printing a word that never fit.
        roundRect(ctx, p.x(pos.x - pos.w / 2), p.y(pos.y - pos.h / 2), p.s(pos.w), p.s(pos.h), p.s(0.8));
        ctx.fill();
        ctx.stroke();
        const a = Math.min(pos.w, pos.h);
        ctx.beginPath();
        DPAD_ARROW[button.id].forEach(([ax, ay], i) => {
          const gx = p.x(pos.x + ax * a);
          const gy = p.y(pos.y + ay * a);
          if (i === 0) ctx.moveTo(gx, gy); else ctx.lineTo(gx, gy);
        });
        ctx.closePath();
        ctx.fillStyle = button.held ? glass : stroke;
        ctx.fill();
        ctx.fillStyle = button.held ? phosphor : glass;
      } else {
        roundRect(ctx, p.x(pos.x - pos.w / 2), p.y(pos.y - pos.h / 2), p.s(pos.w), p.s(pos.h), p.s(1.1));
        ctx.fill();
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      const markName = BUTTON_MARK[model.family]?.[button.id];
      if (markName) {
        const r = p.s(('r' in pos ? pos.r : Math.min(pos.w, pos.h) / 2) * 0.46);
        ctx.save();
        ctx.strokeStyle = button.held ? '#050505' : stroke;
        ctx.lineWidth = Math.max(1, unit * 0.55);
        ctx.beginPath();
        SHAPE_MARK[markName](ctx, p.x(pos.x + dx), p.y(pos.y + dy), r);
        ctx.stroke();
        ctx.restore();
      } else if (button.label && !DPAD_ARROW[button.id]) {
        const chars = [...button.label];
        const gh = p.s(isStick ? pos.r * 0.8 : 'r' in pos ? pos.r * 1.25 : pos.h * 0.74);
        const gw = gh * 0.78;
        const originX = p.x(pos.x + dx) - (chars.length * gw) / 2;
        const originY = p.y(pos.y + dy) - gh / 2;
        chars.forEach((chr, i) => {
          drawVfdGlyph(ctx, chr, originX + i * gw, originY, gw, gh, {
            color: button.held ? '#050505' : stroke,
            blur: button.held ? 0 : 2.6,
            dpr,
            alpha: 1,
            ghost: 0,
          });
        });
      }
    }

    // Leader lines last so they sit over the shell but read as printed rules.
    for (const callout of model.callouts || []) {
      ctx.strokeStyle = callout.selected ? counter : silkscreen;
      ctx.globalAlpha = callout.selected ? 1 : 0.5;
      ctx.lineWidth = Math.max(1, unit * (callout.selected ? 0.5 : 0.32));
      ctx.beginPath();
      ctx.moveTo(p.x(callout.anchor.x), p.y(callout.anchor.y));
      ctx.lineTo(p.x(callout.knee.x), p.y(callout.knee.y));
      ctx.lineTo(p.x(callout.text.x), p.y(callout.text.y));
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x(callout.anchor.x), p.y(callout.anchor.y), Math.max(1, unit * 0.8), 0, Math.PI * 2);
      ctx.fillStyle = callout.selected ? counter : silkscreen;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  });

  // Legends go through uiText, so they are real panel glyphs on the cell grid
  // and take the phosphor, the scan dither and the flicker like everything
  // else. Drawing them with ctx.fillText is what made this screen read as a
  // web page in the first place.
  for (const callout of model.callouts || []) {
    const cell = calloutLabelCell(proj, callout);
    uiText(cell.x, cell.y, callout.label, callout.selected ? 'ui-counter' : 'ui-secondary', callout.selected ? 1 : 0.7);
  }
}

// Where a leader's label lands on the grid. Left-column labels are right
// aligned to their leader, so the text ends where the rule does.
export function calloutLabelCell(proj, callout) {
  const x = proj.cx(callout.text.x);
  return {
    x: Math.round(callout.side === 'left' ? x - callout.label.length : x + 1),
    y: Math.round(proj.cy(callout.text.y)),
  };
}
