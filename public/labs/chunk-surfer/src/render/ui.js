// Typographic UI layer: a glyph surface that floats above whatever renders
// the world (ASCII grid, raymarcher, or the diffusion overlay). This is where
// the game's *authored* voice lives — dialogue, portraits, menus, battle
// chrome — and it is deliberately the one thing the lens can never repaint.
//
// Coordinates are cells, using the same metrics as the ASCII renderer, so a
// dialogue box occupies the same visual module as the map it covers.

import { CELL_W, CELL_H, FONT_PX, atlasConfigure, atlasDpr, getTile } from './atlas.js';

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

// Dim the world behind a scene without hiding it — dread survives, text reads.
export function uiScrim(alpha = 0.55) {
  if (!ctx) return;
  ctx.fillStyle = `rgba(6,7,9,${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function uiGlyph(cx, cy, ch, cls = 't-chunk', alpha = 1) {
  if (!ctx || ch == null || ch === ' ') return;
  const tile = getTile(ch, cls);
  const dpr = atlasDpr();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(tile.canvas, cx * CELL_W * dpr - tile.ox, cy * CELL_H * dpr - tile.oy);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

export function uiText(cx, cy, str, cls = 't-chunk', alpha = 1) {
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) uiGlyph(cx + i, cy, s[i], cls, alpha);
}

export function uiFill(cx, cy, w, h, color = 'rgba(6,7,9,0.92)') {
  if (!ctx) return;
  const dpr = atlasDpr();
  ctx.fillStyle = color;
  ctx.fillRect(cx * CELL_W * dpr, cy * CELL_H * dpr, w * CELL_W * dpr, h * CELL_H * dpr);
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
