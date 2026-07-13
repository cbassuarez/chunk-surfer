// Offscreen glyph atlas: each (glyph, resolved style) pair is lazily rendered
// once into a padded tile with its glow (text-shadow layers) baked in, then
// blitted per cell each frame. Pad exists so halos bleed into neighbouring
// cells the way DOM text-shadow does; blur radii are capped to the pad.

import { resolveStyle } from './styles-map.js';
import { drawVfdGlyph, vfdGlyph } from './vfd-font.js';
import { uiRoleColor, uiRoleDim, uiBrightness, paletteKey, uiBandKey } from './palette.js';

export const CELL_W = 7.84;          // matches computeViewDims cw
export const CELL_H = 13 * 1.38;     // matches computeViewDims ch
export const FONT_PX = 13;
export const UI_CELL_W = 8.45;
export const UI_CELL_H = 20;
export const UI_FONT_PX = 14;
export const MONO_STACK = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace";
const PAD_CELLS = 2;                 // halo bleed, in cells, each side
const MAX_BLUR = 24;                 // cap: larger CSS blurs are approximated

let dpr = 1;
const tiles = new Map(); // role + class + glyph -> {canvas, ox, oy}

export function atlasConfigure(devicePixelRatio) {
  const next = Math.max(1, Math.min(3, devicePixelRatio || 1));
  if (next !== dpr) { dpr = next; tiles.clear(); }
}

export function atlasDpr() { return dpr; }

function metricsFor(role) {
  return role === 'ui'
    ? { cellW: UI_CELL_W, cellH: UI_CELL_H, fontPx: UI_FONT_PX }
    : { cellW: CELL_W, cellH: CELL_H, fontPx: FONT_PX };
}

function fontString(bold, fontPx) {
  return `${bold ? 'bold ' : ''}${fontPx * dpr}px ${MONO_STACK}`;
}

// The UI layer is a vacuum-fluorescent display: its text is a 5×7 dot matrix,
// not a font. Lit dots glow; a faint dormant grid shows where the unlit dots
// are, which is the single thing that separates a VFD from glowing text. Colour
// comes from the active theme (amber for menus, green for the recorder).
function renderUiTile(glyph, cls, x = 0, cols = 80) {
  const { cellW, cellH } = metricsFor('ui');
  const padX = Math.ceil(cellW * PAD_CELLS * dpr);
  const padY = Math.ceil(cellH * PAD_CELLS * dpr);
  const w = Math.ceil(cellW * dpr) + padX * 2;
  const h = Math.ceil(cellH * dpr) + padY * 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  const isVfd = cls.startsWith('ui-');
    const color = isVfd ? uiRoleColor(cls, x, cols) : (resolveStyle(cls).color || '#F2A81E');
    const dim = isVfd ? uiRoleDim(cls, x, cols) : null;
    const b = uiBrightness();

  // A 5×7 character keeps a real aspect (~5:7); the tall UI cell is generous
  // line spacing, so the glyph lives in a box the width of the cell, centred.
  const boxW = cellW * dpr;
  const boxH = Math.min(cellH * dpr, cellW * 1.42 * dpr);
  const ox = padX, oy = padY + (cellH * dpr - boxH) / 2;

  drawVfdGlyph(ctx, glyph, ox, oy, boxW, boxH, {
    color, dim, blur: 3.2, dpr, alpha: Math.min(1, b),
  });
  // A second, wider, low bloom on the brightest text sells the phosphor.
  if (isVfd && (cls === 'ui-primary' || cls === 'ui-counter' || cls === 'ui-green') && b > 0.6 && vfdGlyph(glyph)) {
    ctx.globalAlpha = 0.30;
    drawVfdGlyph(ctx, glyph, ox, oy, boxW, boxH, { color, dim: null, blur: 8, dpr, alpha: 1 });
    ctx.globalAlpha = 1;
  }
  return { canvas: c, ox: padX, oy: padY, pulse: false };
}

function renderTile(glyph, cls, role, x = 0, cols = 80) {
  if (role === 'ui') return renderUiTile(glyph, cls, x, cols);
  const style = resolveStyle(cls);
  const { cellW, cellH, fontPx } = metricsFor(role);
  const padX = Math.ceil(cellW * PAD_CELLS * dpr);
  const padY = Math.ceil(cellH * PAD_CELLS * dpr);
  const w = Math.ceil(cellW * dpr) + padX * 2;
  const h = Math.ceil(cellH * dpr) + padY * 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = fontString(style.bold, fontPx);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = w / 2, cy = h / 2;
  if (style.shadows) {
    // Each text-shadow layer: draw the glyph with shadow displaced far
    // off-canvas so only the shadow lands in the tile (clean glow, no
    // double-fill), matching how CSS stacks shadow layers under the text.
    const OFF = w * 2;
    for (const sh of style.shadows) {
      ctx.save();
      ctx.shadowColor = sh.color;
      ctx.shadowBlur = Math.min(sh.blur, MAX_BLUR) * dpr;
      ctx.shadowOffsetX = OFF + sh.dx * dpr;
      ctx.shadowOffsetY = sh.dy * dpr;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(glyph, cx - OFF, cy);
      ctx.restore();
    }
  }
  ctx.fillStyle = style.color;
  ctx.fillText(glyph, cx, cy);
  return { canvas: c, ox: padX, oy: padY, pulse: style.pulse };
}

export function getTile(glyph, cls, role = 'world', x = 0, cols = 80) {
  // UI tiles depend on the active theme and the player's settings, so their key
  // carries the palette version; a phosphor/brightness change re-renders them.
  // Filter-band phosphor also depends on horizontal screen position. Cache by
  // band, not raw x, so the atlas stays small.
  const key = role === 'ui'
    ? JSON.stringify(['ui', paletteKey(), uiBandKey(x, cols), cls || '', glyph])
    : JSON.stringify([role, cls || '', glyph]);

  let t = tiles.get(key);
  if (!t) {
    t = renderTile(glyph, cls || '', role, x, cols);
    tiles.set(key, t);
  }

  return t;
}

export function atlasSize() { return tiles.size; }
