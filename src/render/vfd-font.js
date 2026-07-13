// A 5×7 dot-matrix font, the way a character-VFD module actually draws text.
//
// The landed refactor rendered whole words in 14-segment ("CHUNK SURFER",
// "SOURCE") which is what a numeric readout does, not a text display — it reads
// as garbage. Real VFD text modules (2×20, 4×20) are 5×7 (or 5×8) dot matrices,
// and that is what this is: each glyph is five columns of seven rows, lit dots
// glowing on flat black. Caps only, fixed pitch, no ligatures — a bitmap font
// gets those for free, which is exactly the point.
//
// Rows are given MSB-left across five columns, so 0b10001 is "dot, gap, gap,
// gap, dot". Uppercase, digits, and the punctuation the interface actually uses.

const G = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0, 0b00100, 0b01000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ';': [0, 0b01100, 0b01100, 0, 0b00100, 0b01000, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0b01010, 0, 0, 0, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  '*': [0, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0],
  '·': [0, 0, 0, 0b01100, 0b01100, 0, 0],
  '↑': [0b00100, 0b01110, 0b10101, 0b00100, 0b00100, 0b00100, 0b00100],
  '↓': [0b00100, 0b00100, 0b00100, 0b10101, 0b01110, 0b00100, 0],
  '→': [0, 0b00100, 0b00010, 0b11111, 0b00010, 0b00100, 0],
  '←': [0, 0b00100, 0b01000, 0b11111, 0b01000, 0b00100, 0],
  '▸': [0b01000, 0b01100, 0b01110, 0b01111, 0b01110, 0b01100, 0b01000],
  '▶': [0b01000, 0b01100, 0b01110, 0b01111, 0b01110, 0b01100, 0b01000],
  '◀': [0b00010, 0b00110, 0b01110, 0b11110, 0b01110, 0b00110, 0b00010],
  '●': [0, 0b01110, 0b11111, 0b11111, 0b11111, 0b01110, 0],
  '○': [0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  '×': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  '✓': [0, 0, 0b00001, 0b00010, 0b10100, 0b01000, 0],
  '▮': [0b01110, 0b01110, 0b01110, 0b01110, 0b01110, 0b01110, 0b01110],
  '▯': [0b01110, 0b01010, 0b01010, 0b01010, 0b01010, 0b01010, 0b01110],
  '█': [0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111],
  '▓': [0b10101, 0b01010, 0b10101, 0b01010, 0b10101, 0b01010, 0b10101],
  '░': [0b10001, 0b00100, 0b10001, 0b00100, 0b10001, 0b00100, 0b10001],
  '▏': [0b01100, 0b01100, 0b01100, 0b01100, 0b01100, 0b01100, 0b01100],
};

export const VFD_COLS = 5;
export const VFD_ROWS = 7;

// A glyph exists in the ROM? (Anything unknown falls back to the block box, the
// way a real character module shows an unmapped code.)
export function vfdGlyph(ch) {
  return G[ch] || G[ch?.toUpperCase?.()] || null;
}

// Draw one 5×7 glyph into `ctx`, in device pixels, at (px, py), filling a cell
// of (cellW × cellH) device px. Lit dots are round and glow; dormant dots are a
// faint constant, which is the single detail that separates a VFD from glowing
// text. `dim` is the dormant colour (may be null to omit the grid).
export function drawVfdGlyph(ctx, ch, px, py, cellW, cellH, {
  color = '#F2A81E', dim = null, blur = 3, dpr = 1, alpha = 1,
  scan = 1, ghost = 0.14, dimAlpha = 0.78,
} = {}) {
  const rows = vfdGlyph(ch);
  if (!rows) return;
  // Fit a 5×7 dot grid inside the cell with a little breathing room.
  const padX = cellW * 0.10, padY = cellH * 0.10;
  const gw = cellW - padX * 2, gh = cellH - padY * 2;
  const stepX = gw / VFD_COLS, stepY = gh / VFD_ROWS;
  const r = Math.max(0.7 * dpr, Math.min(stepX, stepY) * 0.42);

  ctx.save();
  if (dim) {
    // A real character VFD never becomes a clean font on black. The unlit dot
    // matrix and a faint support-grid remain visible under the glass.
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(0.12, alpha * dimAlpha * 0.18));
    ctx.strokeStyle = dim;
    ctx.lineWidth = Math.max(0.45 * dpr, 0.6);
    for (let cx = 1; cx < VFD_COLS; cx++) {
      const gx = px + padX + stepX * cx;
      ctx.beginPath();
      ctx.moveTo(gx, py + padY);
      ctx.lineTo(gx, py + padY + gh);
      ctx.stroke();
    }
    ctx.restore();
  }
  for (let ry = 0; ry < VFD_ROWS; ry++) {
    const bits = rows[ry] | 0;
    for (let cx = 0; cx < VFD_COLS; cx++) {
      const on = (bits >> (VFD_COLS - 1 - cx)) & 1;
      if (!on && !dim) continue;
      const dx = px + padX + stepX * (cx + 0.5);
      const dy = py + padY + stepY * (ry + 0.5);
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      if (on) {
        if (ghost > 0) {
          // Phosphor afterglow: a wider, dimmer dot under the addressed one.
          ctx.save();
          ctx.fillStyle = color;
          ctx.globalAlpha = Math.max(0, Math.min(0.28, alpha * ghost * scan));
          ctx.shadowColor = color;
          ctx.shadowBlur = blur * 2.7 * dpr;
          ctx.beginPath();
          ctx.arc(dx, dy, r * 1.18, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha * scan;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * dpr;
      } else {
        ctx.fillStyle = dim;
        ctx.globalAlpha = alpha * dimAlpha;
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
  }
  ctx.restore();
}
