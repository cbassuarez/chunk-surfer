// Typographic UI layer: a glyph surface that floats above whatever renders
// the world (ASCII grid, raymarcher, or the diffusion overlay). This is where
// the game's *authored* voice lives — dialogue, portraits, menus, battle
// chrome — and it is deliberately the one thing the lens can never repaint.
//
// Coordinates are cells, using the same metrics as the ASCII renderer, so a
// dialogue box occupies the same visual module as the map it covers.

import { UI_CELL_W as CELL_W, UI_CELL_H as CELL_H, UI_FONT_PX, MONO_STACK, atlasConfigure, atlasDpr, getTile } from './atlas.js';
import { UI_COLOR, uiFlickerAlpha, uiRoleColor } from './palette.js';

let host = null, canvas = null, ctx = null;
let cols = 0, rows = 0;

export function uiInit(hostEl) {
  host = hostEl;
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:8;';
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  return { cols: () => cols, rows: () => rows };
}

function resize() {
  atlasConfigure(window.devicePixelRatio);
  const dpr = atlasDpr();
  canvas.width = Math.round(host.clientWidth * dpr);
  canvas.height = Math.round(host.clientHeight * dpr);
  cols = Math.max(20, Math.floor(host.clientWidth / CELL_W));
  rows = Math.max(8, Math.floor(host.clientHeight / CELL_H));
}

export function uiSize() { return { cols, rows }; }
export function uiClear() { if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
export function uiCanvasSize() { return { width: canvas?.width || 0, height: canvas?.height || 0 }; }
export function uiPointFromClient(clientX, clientY) {
  const rect = host?.getBoundingClientRect?.();
  if (!rect) return { cellX:-1, cellY:-1 };
  return { cellX:(clientX - rect.left) / CELL_W, cellY:(clientY - rect.top) / CELL_H };
}

// Low-level drawing hook for code-native instruments. The callback receives
// device-pixel metrics; authored modules still express all geometry in cells.
export function uiDraw(draw) {
  if (!ctx || typeof draw !== 'function') return;
  draw({ ctx, dpr: atlasDpr(), cellW: CELL_W, cellH: CELL_H, cols, rows });
}

// Dim the world behind a scene without hiding it — dread survives, text reads.
export function uiScrim(alpha = 0.55) {
  if (!ctx) return;
  ctx.fillStyle = `rgba(6,7,9,${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function uiGlyph(cx, cy, ch, cls = 't-chunk', alpha = 1) {
  if (!ctx || ch == null || ch === ' ') return;
  const tile = getTile(ch, cls, 'ui', cx, cols);
  const dpr = atlasDpr();
  const a = alpha * uiFlickerAlpha(cx, cy, cls);

  if (a !== 1) ctx.globalAlpha = a;
  ctx.drawImage(tile.canvas, cx * CELL_W * dpr - tile.ox, cy * CELL_H * dpr - tile.oy);
  if (a !== 1) ctx.globalAlpha = 1;
}

export function uiText(cx, cy, str, cls = 't-chunk', alpha = 1) {
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) uiGlyph(cx + i, cy, s[i], cls, alpha);
}

// Direction/system copy is prose spoken by the machine, not another VFD
// legend. Give it a real italic monospace face instead of decorating the words
// with // marks. It keeps the same authored cell grid and phosphor colour.
export function uiItalicText(cx, cy, str, cls = 'ui-secondary', alpha = 1) {
  const s = String(str ?? '');
  if (!ctx || !s) return;
  const dpr = atlasDpr();
  ctx.save();
  ctx.font = `italic ${UI_FONT_PX * dpr}px ${MONO_STACK}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = uiRoleColor(cls, cx, cols);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = uiRoleColor(cls, cx, cols);
  ctx.shadowBlur = 2.2 * dpr;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== ' ') ctx.fillText(s[i], (cx + i) * CELL_W * dpr, (cy + 0.5) * CELL_H * dpr);
  }
  ctx.restore();
}

// Typewriter ink on paper. NOT the VFD dot-matrix: a real monospace face with
// slightly uneven per-character ink, the way a struck ribbon lands. Drawn
// directly (paper is static, so per-frame fillText is cheap) so it never
// touches the phosphor atlas.
export function uiInk(cx, cy, str, { color = '#20180F', alpha = 1, weight = '' } = {}) {
  const s = String(str ?? '');
  if (!ctx || !s) return;
  const dpr = atlasDpr();
  ctx.save();
  ctx.font = `${weight ? weight + ' ' : ''}${Math.round(CELL_H * 0.62)}px "Courier New", Courier, ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === ' ') continue;
    // uneven ink: a stable, SUBTLE per-cell jitter — a struck ribbon, not a
    // drunk one. Mostly the ink weight varies; the baseline barely moves.
    const h = ((cx + i) * 2654435761 ^ cy * 40503) >>> 0;
    const jA = 0.90 + ((h & 255) / 255) * 0.10;
    const jx = (((h >> 8) & 7) - 3.5) * 0.014;
    const jy = (((h >> 12) & 7) - 3.5) * 0.016;
    ctx.globalAlpha = alpha * jA;
    ctx.fillText(ch, ((cx + i) + jx) * CELL_W * dpr, (cy + 0.5 + jy) * CELL_H * dpr);
  }
  ctx.restore();
}

export function uiFill(cx, cy, w, h, color = 'rgba(6,7,9,0.92)') {
  if (!ctx) return;
  const dpr = atlasDpr();
  ctx.fillStyle = color;
  ctx.fillRect(cx * CELL_W * dpr, cy * CELL_H * dpr, w * CELL_W * dpr, h * CELL_H * dpr);
}

export function uiStrokeRect(cx, cy, w, h, color = UI_COLOR.frame, alpha = 1, lineWidth = 1) {
  uiDraw(({ ctx: c, dpr, cellW, cellH }) => {
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineWidth = lineWidth * dpr;
    c.strokeRect((cx * cellW + 0.5) * dpr, (cy * cellH + 0.5) * dpr,
      Math.max(0, w * cellW - 1) * dpr, Math.max(0, h * cellH - 1) * dpr);
    c.restore();
  });
}

export function uiLine(x1, y1, x2, y2, color = UI_COLOR.frame, alpha = 1, lineWidth = 1) {
  uiDraw(({ ctx: c, dpr, cellW, cellH }) => {
    c.save(); c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = lineWidth * dpr;
    c.beginPath(); c.moveTo(x1 * cellW * dpr, y1 * cellH * dpr);
    c.lineTo(x2 * cellW * dpr, y2 * cellH * dpr); c.stroke(); c.restore();
  });
}

export function uiBox(cx, cy, w, h, cls = 't-gate-frame', fill = 'rgba(6,7,9,0.92)') {
  if (fill) uiFill(cx, cy, w, h, fill);
  uiGlyph(cx, cy, '┌', cls); uiGlyph(cx + w - 1, cy, '┐', cls);
  uiGlyph(cx, cy + h - 1, '└', cls); uiGlyph(cx + w - 1, cy + h - 1, '┘', cls);
  for (let x = 1; x < w - 1; x++) { uiGlyph(cx + x, cy, '─', cls); uiGlyph(cx + x, cy + h - 1, '─', cls); }
  for (let y = 1; y < h - 1; y++) { uiGlyph(cx, cy + y, '│', cls); uiGlyph(cx + w - 1, cy + y, '│', cls); }
}

// Word-wrap to a cell width; returns lines.
export function uiWrap(text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > width) { if (line) lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function uiCenter(cy, str, cls, alpha) {
  uiText(Math.max(0, Math.floor((cols - String(str).length) / 2)), cy, str, cls, alpha);
}
