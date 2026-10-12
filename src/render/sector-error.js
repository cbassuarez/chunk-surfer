// ntfsclone stderr, transcribed from cant-read-sector.mp4. The warning is the
// content; damage belongs around it, not in place of it. Fit its complete line
// at the final column pitch before any surface sampling or damage pass.
export const NTFSCLONE_WARNING = (offset) => `WARNING: Can't read sector at ${offset}, lost data.`;
export const SECTOR_ERROR_ROW_PITCH = 22;
const SECTOR = 512;
const START = 29498915328;
const REFERENCE_OFFSETS = [START, 29567705088, 29567705600, 30839020544];

function seeded(seed = 1) {
  let s = (Math.floor(Number(seed) || 1) >>> 0) || 1;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sectorErrorLines({ count = 24, seed = 1, from = START } = {}) {
  const random = seeded(seed), lines = [];
  let offset = Math.max(0, Math.floor(Number(from) || START));
  for (let i = 0; i < Math.max(1, Math.min(100000, Math.floor(count))); i += 1) {
    if (from === START && i < REFERENCE_OFFSETS.length) offset = REFERENCE_OFFSETS[i];
    lines.push(NTFSCLONE_WARNING(offset));
    const roll = random();
    const step = roll > .97 ? Math.max(1, Math.floor(random() * 2_000_000)) * SECTOR
      : roll > .82 ? Math.max(1, Math.floor(random() * 140_000)) * SECTOR
        : Math.max(1, Math.floor(random() * 6)) * SECTOR;
    offset += step;
  }
  return lines;
}

// Compatibility helper for deliberate displaced fragments. The readable
// terminal no longer invents orphaned numbers over its warning stream.
export function sectorErrorFragment(seed = 1) {
  return sectorErrorLines({ count: 5, seed }).at(-1).match(/at (\d+)/)[1].slice(-6);
}

// Physical terminal rows: wrap at the column boundary, scroll in whole rows.
// Never shift fractionally through glyphs or cycle back to an earlier error.
export function sectorTerminalRows({ columns = 64, rows = 14, scroll = 0, seed = 1 } = {}) {
  const cols = Math.max(20, Math.floor(columns));
  const rowCount = Math.max(2, Math.floor(rows));
  const count = Math.min(100000, Math.max(rowCount, rowCount + Math.floor(Math.max(0, scroll))));
  const physical = [];
  for (const line of sectorErrorLines({ count, seed })) {
    for (let at = 0; at < line.length; at += cols) physical.push(line.slice(at, at + cols));
  }
  return { rows: physical.slice(-(rowCount - 1)), cursor: { column: 0, row: rowCount - 1 }, columns: cols };
}

// The terminal's physical grid: margin, glyph size, row pitch and how many rows
// fit. Leaves ctx set to the terminal font with top baselines.
export function sectorTerminalGeometry(ctx, { width = 512, height = 320, columns = null, fontPx = 15 } = {}) {
  const margin = Math.max(6, Math.round(width * .02));
  const requestedCols = Math.max(20, Math.floor(columns || NTFSCLONE_WARNING(START).length));
  ctx.font = `${fontPx}px monospace`;
  const glyphWidth = ctx.measureText('M').width || fontPx * .62;
  const px = Math.min(fontPx, fontPx * (width - margin * 2) / (requestedCols * glyphWidth));
  ctx.font = `${px}px monospace`;
  ctx.textBaseline = 'top';
  const pitch = Math.max(12, Math.ceil(px * 1.42));
  const rowCount = Math.max(2, Math.floor((height - margin * 2) / pitch));
  return { margin, requestedCols, px, pitch, rowCount, cellWidth: ctx.measureText('M').width || px * .62 };
}

export function renderSectorErrorFrame(ctx, {
  width = 512, height = 320, scroll = 0, seed = 1, tear = .18,
  fontPx = 15, ink = '#dfe6ff', ground = '#05070e',
  columns = null, referencePalette = false, cursor = true,
} = {}) {
  if (!ctx) return false;
  ctx.save();
  const { margin, requestedCols, px, pitch, rowCount } = sectorTerminalGeometry(ctx, { width, height, columns, fontPx });
  // DAMAGED IS OVERFILLED. The clone writes faster than the screen can be read,
  // so there is no last row — only the one the pane edge is cutting through.
  const damaged = tear > 0;
  const terminal = sectorTerminalRows({ columns: requestedCols, rows: rowCount + (damaged ? 2 : 0), scroll, seed });
  const bg = referencePalette ? '#292296' : ground;
  const fg = referencePalette ? '#272157' : ink;
  const slab = referencePalette ? '#c5c8d0' : ink;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  // Light stderr slab on the blue damaged console. No global inversion flash.
  if (referencePalette) {
    ctx.fillStyle = slab;
    ctx.fillRect(margin - 2, margin - 2, width - margin * 2 + 4, damaged ? height : rowCount * pitch + 2);
  }
  let rows = terminal.rows;
  if (damaged) {
    // SMEARED. The same rows a few writes ago, faintly, a pixel over. Where the
    // warning is identical it lands on itself; only the churning offsets blur,
    // which is what a screen redrawing faster than the eye does to digits.
    const ghost = sectorTerminalRows({ columns: requestedCols, rows: rowCount + 2, scroll: Math.max(0, Math.floor(scroll) - 3), seed });
    ctx.globalAlpha = .34;
    ctx.fillStyle = fg;
    ghost.rows.forEach((line, row) => ctx.fillText(line, margin + 1, margin + row * pitch));
    ctx.globalAlpha = 1;
    // THE STALE HEAD. The first reads stay where they were written while
    // everything under them scrolls past.
    const head = [];
    for (const line of sectorErrorLines({ count: 3, seed })) {
      for (let at = 0; at < line.length; at += requestedCols) head.push(line.slice(at, at + requestedCols));
    }
    rows = [...head.slice(0, 3), ...terminal.rows.slice(3)];
  }
  ctx.fillStyle = fg;
  rows.forEach((line, row) => ctx.fillText(line, margin, margin + row * pitch));
  if (cursor && !damaged) ctx.fillRect(margin, margin + terminal.cursor.row * pitch, Math.max(2, px * .57), Math.max(2, px));
  if (!damaged || !ctx.drawImage) { ctx.restore(); return true; }

  const random = seeded(seed + Math.floor(scroll) * 31 + 977);
  // A DOUBLE WRITE on the last whole row: the row again half a line down, struck
  // through, with digits landed on its first letters.
  const bottom = margin + (rowCount - 1) * pitch;
  ctx.globalAlpha = .55;
  ctx.fillText(rows[rowCount - 1] || rows[rows.length - 1] || '', margin, bottom + pitch * .45);
  ctx.globalAlpha = 1;
  ctx.fillRect(margin, Math.round(bottom + pitch * .5), width - margin * 2, 1);
  ctx.fillStyle = slab;
  ctx.fillRect(margin, bottom + pitch, px * 1.9, pitch);
  ctx.fillStyle = fg;
  ctx.fillText(String(800 + Math.floor(random() * 199)), margin, bottom + pitch);

  // WHAT WAS WRITTEN EARLIER AND NEVER CLEARED. Seeded by the disk, not the
  // frame, so it stays where it is while everything under it scrolls.
  const stale = seeded(seed * 131 + 7);
  const staleLines = sectorErrorLines({ count: 8, seed: seed + 5 });
  for (let i = 0; i < 6; i += 1) {
    const kind = i % 3, text = staleLines[i];
    const piece = kind === 0 ? text.slice(Math.floor(stale() * 30))
      : kind === 1 ? text.slice(0, 12 + Math.floor(stale() * 18))
        : String(Math.floor(stale() * 1e6)).padStart(6, '0');
    const x = kind === 0 && i === 0 ? -px * 2 : Math.floor(stale() * width * .8);
    const y = margin + Math.floor(stale() * (rowCount + 1)) * pitch;
    ctx.fillStyle = kind === 1 ? '#0b0b12' : slab;
    ctx.fillRect(x, y, ctx.measureText(piece).width + px * .6, pitch);
    ctx.fillStyle = kind === 1 ? '#e8eaf0' : fg;
    ctx.fillText(piece, x + px * .3, y);
  }
  const cellX = Math.floor(stale() * width * .6), cellY = margin + Math.floor(stale() * rowCount) * pitch;
  ctx.fillStyle = '#86e05a';
  ctx.fillRect(cellX, cellY, px * 4.2, pitch);
  ctx.fillStyle = '#10140a';
  ctx.fillText('0;10mm', cellX + px * .2, cellY);

  damageSectorFrame(ctx, { width, height, margin, px, pitch, rowCount, requestedCols, tear, random, bg });
  ctx.restore();
  return true;
}

// The disk's damage over whatever is on the terminal: block tears, scanline
// shear, pixel blocks and, past half, dropped sectors. `random` is the frame's
// own seeded stream, so the same frame tears the same way.
export function damageSectorFrame(ctx, { width, height, margin, px, pitch, rowCount, requestedCols, tear, random, bg }) {
  if (!ctx?.drawImage || !(tear > 0)) return false;
  const copy = (sx, sy, sw, sh, dx, dy) => {
    try { ctx.drawImage(ctx.canvas, sx, sy, sw, sh, dx, dy, sw, sh); } catch (_) { /* headless canvas */ }
  };
  // BLOCK TEARS. Partial-width blocks thrown a few cells, sometimes a whole row,
  // onto text that is already there — two writes in one cell.
  const bands = 2 + Math.ceil(tear * 6);
  for (let i = 0; i < bands; i += 1) {
    const y = margin + Math.floor(random() * rowCount) * pitch;
    const x = margin + Math.floor(random() * requestedCols * .7) * px * .6;
    const w = Math.min(width * .42, px * .6 * (4 + Math.floor(random() * 18)));
    const dx = (random() < .5 ? -1 : 1) * px * .6 * (1 + Math.floor(random() * 6));
    const dy = random() < .25 ? (random() < .5 ? -1 : 1) * pitch : 0;
    copy(x, y, w, pitch, x + dx, y + dy);
  }
  // SCANLINE SHEAR. Thin full-width strips slipped sideways.
  const strips = 3 + Math.floor(tear * 12);
  for (let i = 0; i < strips; i += 1) {
    const y = Math.floor(random() * height), h = 1 + Math.floor(random() * 3);
    copy(0, y, width, h, (random() < .5 ? -1 : 1) * (2 + Math.floor(random() * 14)), y);
  }
  // PIXEL BLOCKS. A patch resolved at a few pixels to the sample.
  ctx.imageSmoothingEnabled = false;
  const mosaics = 1 + (random() < tear ? 1 : 0) + Math.max(0, Math.floor((tear - .5) * 6));
  for (let i = 0; i < mosaics; i += 1) {
    const cell = 4 + Math.floor(random() * 5);
    const w = cell * (8 + Math.floor(random() * 20)), h = cell * (3 + Math.floor(random() * 6));
    const x0 = Math.floor(random() * Math.max(1, width - w)), y0 = Math.floor(random() * Math.max(1, height - h));
    for (let y = y0; y < y0 + h; y += cell) {
      for (let x = x0; x < x0 + w; x += cell) {
        try { ctx.drawImage(ctx.canvas, x + (cell >> 1), y + (cell >> 1), 1, 1, x, y, cell, cell); } catch (_) { /* headless canvas */ }
      }
    }
  }
  // DROPPED SECTORS. Past a point the disk stops returning whole blocks at all.
  const drops = Math.max(0, Math.floor((tear - .5) * 16));
  for (let i = 0; i < drops; i += 1) {
    const w = width * (.08 + random() * .3), h = pitch * (1 + Math.floor(random() * 3));
    ctx.fillStyle = random() < .5 ? bg : '#000000';
    ctx.fillRect(Math.floor(random() * Math.max(1, width - w)), Math.floor(random() * Math.max(1, height - h)), w, h);
  }
  return true;
}

// ── THE SPECTER IN THE ONES AND ZEROES ─────────────────────────────────────
//
// The Source warning does not cut away to a working screen. Whatever is on the
// disk is what is breaking it, so its message is made OUT of the failing
// terminal: the character cells that fall inside the letters turn to bits —
// dark ink, a light 0 or 1 — and gather there, while every other cell keeps
// failing to read its sector. `form` is how much of it has arrived: cells come
// in interior-first in a seeded order, the last ones still crossing from where
// they were on their stderr line, and a few strays light outside the letters and
// are lost again. The disk's own damage runs over the top, lighter, so the
// message tears with the screen it is written in.
export const SECTOR_AGGREGATE_BITS = Object.freeze(['0', '1']);

export function sectorAggregateMask(message, { width = 640, height = 432, documentApi = globalThis.document } = {}) {
  if (!documentApi?.createElement) return null;
  const canvas = documentApi.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const mctx = canvas.getContext?.('2d', { willReadFrequently: true });
  if (!mctx?.getImageData || !mctx.fillText) return null;
  // Spaced letters (S I G N A L) close up into one word; a message of several
  // words stacks one word per line so each gets the pane's height.
  const raw = String(message || '').trim() || '_';
  const lines = /^(\S )+\S$/.test(raw) ? [raw.replace(/ /g, '')] : raw.split(/\s+/).filter(Boolean);
  const face = (px) => `900 ${px}px "Arial Black", Impact, Helvetica, sans-serif`;
  const lineHeight = (height * .9) / Math.max(1, lines.length);
  let size = lineHeight * 1.05;
  mctx.font = face(size);
  const widest = Math.max(...lines.map((line) => mctx.measureText(line).width || 1));
  if (widest > width * .94) size *= (width * .94) / widest;
  mctx.font = face(size);
  mctx.fillStyle = '#ffffff';
  mctx.textAlign = 'center';
  mctx.textBaseline = 'middle';
  const top = height / 2 - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, index) => mctx.fillText(line, width / 2, top + index * lineHeight));
  let data;
  try { data = mctx.getImageData(0, 0, width, height).data; } catch (_) { return null; }
  return (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= width || iy >= height) return false;
    return data[(iy * width + ix) * 4 + 3] > 96;
  };
}

export function renderSectorAggregateFrame(ctx, {
  message = '', form = 1, seed = 1, orderSeed = seed, scroll = 0, width = 640, height = 432,
  columns = 43, fontPx = 23, referencePalette = true, tear = 0,
  documentApi = globalThis.document, mask = null, density = 2,
} = {}) {
  if (!ctx) return null;
  const inside = typeof mask === 'function' ? mask : sectorAggregateMask(message, { width, height, documentApi });
  if (!inside) return null;
  renderSectorErrorFrame(ctx, { width, height, scroll, seed, tear: 0, fontPx, columns, referencePalette, cursor: false });
  ctx.save();
  const g = sectorTerminalGeometry(ctx, { width, height, columns, fontPx });
  // The bits gather finer than the stderr grid: `density` sub-cells to a
  // terminal cell each way, in type that size, so a letter's stroke is thick
  // enough to read while it is still made of the terminal's digits.
  const grain = Math.max(1, Math.floor(Number(density) || 2));
  const cellW = Math.max(1, g.cellWidth / grain);
  const pitch = g.pitch / grain;
  const rowsTotal = Math.max(1, Math.floor((height - g.margin * 2) / pitch));
  const cols = Math.max(1, Math.floor((width - g.margin * 2) / cellW));
  ctx.font = `${g.px / grain}px monospace`;
  ctx.textBaseline = 'top';
  const ink = referencePalette ? '#272157' : '#05070e';
  const light = referencePalette ? '#e8eaf0' : '#dfe6ff';
  const f = Math.max(0, Math.min(1, Number(form) || 0));
  const hash = (a, b, salt) => seeded((orderSeed * 7919) ^ (a * 977 + b * 131 + salt))();
  const centre = (row, col) => ({ x: g.margin + col * cellW + cellW / 2, y: g.margin + row * pitch + pitch / 2 });
  const WINDOW = .2;
  const stats = { cells: 0, migrating: 0, stray: 0 };
  const bit = (row, col) => SECTOR_AGGREGATE_BITS[hash(row, col, 41) < .5 ? 0 : 1];
  const paint = (x, y, value, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(cellW + .5), Math.ceil(pitch));
    ctx.fillStyle = light;
    ctx.fillText(value, x, y);
    ctx.globalAlpha = 1;
  };
  for (let row = 0; row < rowsTotal; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const c = centre(row, col);
      if (!inside(c.x, c.y)) {
        // Strays: a few bits light outside the letters while it is still gathering.
        if (f < 1 && hash(row, col, 7) < .018 * (1 - f)) { paint(c.x - cellW / 2, c.y - pitch / 2, bit(row, col), .6); stats.stray += 1; }
        continue;
      }
      // Interior cells (all four neighbours inside) arrive before edge cells.
      const around = [inside(c.x - cellW, c.y), inside(c.x + cellW, c.y), inside(c.x, c.y - pitch), inside(c.x, c.y + pitch)]
        .filter(Boolean).length / 4;
      const key = hash(row, col, 13) * .72 + (1 - around) * .28;
      const x = c.x - cellW / 2, y = c.y - pitch / 2;
      if (key <= f) { paint(x, y, bit(row, col)); stats.cells += 1; continue; }
      if (key <= f + WINDOW && f < 1) {
        // Still crossing: from a cell on its own stderr line toward its place.
        const t = 1 - (key - f) / WINDOW;
        const fromCol = Math.max(0, Math.min(cols - 1, col + Math.round((hash(row, col, 29) - .5) * 24 * grain)));
        const fromRow = Math.max(0, Math.min(rowsTotal - 1, row + (hash(row, col, 31) < .2 ? (hash(row, col, 37) < .5 ? -1 : 1) * grain : 0)));
        const from = centre(fromRow, fromCol);
        const ease = t * t;
        paint(from.x + (c.x - from.x) * ease - cellW / 2, from.y + (c.y - from.y) * ease - pitch / 2, bit(row, col), .35 + .5 * t);
        stats.migrating += 1;
      }
    }
  }
  if (tear > 0) {
    damageSectorFrame(ctx, {
      width, height, margin: g.margin, px: g.px, pitch: g.pitch, rowCount: g.rowCount, requestedCols: g.requestedCols,
      tear: tear * .5, random: seeded(seed + Math.floor(scroll) * 31 + 1531), bg: referencePalette ? '#292296' : '#05070e',
    });
  }
  ctx.restore();
  return stats;
}

export function sectorErrorPhases({
  count = 10, width = 640, height = 432, seed = 1, rowsPerPhase = 1,
  reducedMotion = false, flashMode = 'full',
  // How far gone the disk is, 0..1. The decaying windows on the walk out of
  // Source use it; still images, so it applies under reduced motion too.
  damage = 0,
} = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return [];
  const out = [];
  for (let i = 0; i < Math.max(1, Math.floor(count)); i += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    renderSectorErrorFrame(ctx, {
      width, height, seed, scroll: i * rowsPerPhase, columns: 43, fontPx: 23,
      referencePalette: true,
      tear: damage > 0 ? Math.min(1, .38 + damage * .62) : reducedMotion || flashMode !== 'full' ? 0 : .38,
    });
    // Lossless: lossy ringing closes small e/a counters at 320px desktop size.
    try { out.push(canvas.toDataURL('image/png')); } catch (_) { return out; }
  }
  return out;
}
