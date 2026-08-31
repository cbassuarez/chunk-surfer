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
  // Typographic punctuation the authored copy actually uses (em dashes, curly
  // quotes, ellipses). Without these the character module leaves a blank hole
  // where the glyph should be, so prose loses its dashes and apostrophes.
  '—': [0, 0, 0, 0b11111, 0, 0, 0],
  '–': [0, 0, 0, 0b11111, 0, 0, 0],
  '‘': [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '’': [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  '“': [0b01010, 0b01010, 0b10100, 0, 0, 0, 0],
  '”': [0b01010, 0b01010, 0b10100, 0, 0, 0, 0],
  '…': [0, 0, 0, 0, 0, 0b10101, 0b10101],
  '•': [0, 0, 0b01110, 0b01110, 0b01110, 0, 0],
  '↑': [0b00100, 0b01110, 0b10101, 0b00100, 0b00100, 0b00100, 0b00100],
  '↓': [0b00100, 0b00100, 0b00100, 0b10101, 0b01110, 0b00100, 0],
  '→': [0, 0b00100, 0b00010, 0b11111, 0b00010, 0b00100, 0],
  '←': [0, 0b00100, 0b01000, 0b11111, 0b01000, 0b00100, 0],
  '▸': [0b01000, 0b01100, 0b01110, 0b01111, 0b01110, 0b01100, 0b01000],
  '▶': [0b01000, 0b01100, 0b01110, 0b01111, 0b01110, 0b01100, 0b01000],
  '◀': [0b00010, 0b00110, 0b01110, 0b11110, 0b01110, 0b00110, 0b00010],
  '●': [0, 0b01110, 0b11111, 0b11111, 0b11111, 0b01110, 0],
  '○': [0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  // The navigation target, filled and hollow. Both were being asked for by the
  // minimap and the field case (the target readout's prefix, and the centre of
  // the [ ] marker) and neither existed in the ROM, so uiGlyph drew nothing at
  // all — right position, right colour, no pixels. A waypoint that renders as
  // an empty pair of brackets is the map failing at its one job.
  '◆': [0, 0b00100, 0b01110, 0b11111, 0b01110, 0b00100, 0],
  '◇': [0, 0b00100, 0b01010, 0b10001, 0b01010, 0b00100, 0],
  '×': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  '✓': [0, 0, 0b00001, 0b00010, 0b10100, 0b01000, 0],
  '▮': [0b01110, 0b01110, 0b01110, 0b01110, 0b01110, 0b01110, 0b01110],
  '▯': [0b01110, 0b01010, 0b01010, 0b01010, 0b01010, 0b01010, 0b01110],
  '█': [0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111],
  '▓': [0b10101, 0b01010, 0b10101, 0b01010, 0b10101, 0b01010, 0b10101],
  '░': [0b10001, 0b00100, 0b10001, 0b00100, 0b10001, 0b00100, 0b10001],
  '▏': [0b01100, 0b01100, 0b01100, 0b01100, 0b01100, 0b01100, 0b01100],

  // ── EVERYTHING BELOW WAS BEING DRAWN AND WAS NOT HERE ───────────────────────
  //
  // Found by scanning every string literal in src/ against this ROM. Fifty-three
  // characters were being handed to uiGlyph from real draw calls and rendering
  // as nothing at all — right cell, right colour, no pixels — because
  // drawVfdGlyph returned early on an unmapped code.
  //
  // The worst of them, in rough order of how often a player saw the hole:
  //   · ┌ ┐ └ ┘ │ ─  — uiBox's OWN characters, so the box primitive in ui.js
  //                    has never drawn a box.
  //   · ▌ ▐          — the speech cursor, on screen through every line of
  //                    dialogue in the game.
  //   · ▲ ▼          — the scroll indicators in settings, pause, the eula and
  //                    the field case: "there is more below" said invisibly.
  //   · Ⅱ            — the take screen's own TAKE HELD / CLOCK HELD marker.
  //   · ■ □ ┼ ╫ ↕    — the map and minimap's objective and grid chrome.
  //
  // Box drawing. Single-weight, on the centre lines of the 5×7 box so corners
  // meet cleanly when two cells sit side by side.
  '─': [0, 0, 0, 0b11111, 0, 0, 0],
  '│': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '┌': [0, 0, 0, 0b00111, 0b00100, 0b00100, 0b00100],
  '┐': [0, 0, 0, 0b11100, 0b00100, 0b00100, 0b00100],
  '└': [0b00100, 0b00100, 0b00100, 0b00111, 0, 0, 0],
  '┘': [0b00100, 0b00100, 0b00100, 0b11100, 0, 0, 0],
  '┼': [0b00100, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00100],
  '┆': [0b00100, 0, 0b00100, 0, 0b00100, 0, 0b00100],
  '╫': [0b01010, 0b01010, 0b01010, 0b11111, 0b01010, 0b01010, 0b01010],
  '╬': [0b01010, 0b01010, 0b11011, 0, 0b11011, 0b01010, 0b01010],
  '╳': [0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0, 0],

  // Part-width blocks. The cursor, and the bar fills.
  '▌': [0b11100, 0b11100, 0b11100, 0b11100, 0b11100, 0b11100, 0b11100],
  '▐': [0b00111, 0b00111, 0b00111, 0b00111, 0b00111, 0b00111, 0b00111],
  '▉': [0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110],
  '▊': [0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110, 0b11110],
  '▒': [0b01010, 0b10101, 0b01010, 0b10101, 0b01010, 0b10101, 0b01010],

  // Triangles and arrows: scroll affordances, and the pad's own glyphs.
  '▲': [0, 0b00100, 0b01110, 0b11111, 0, 0, 0],
  '▼': [0, 0, 0, 0b11111, 0b01110, 0b00100, 0],
  '△': [0, 0b00100, 0b01010, 0b11111, 0, 0, 0],
  '▽': [0, 0, 0, 0b11111, 0b01010, 0b00100, 0],
  '▾': [0, 0, 0, 0b01110, 0b00100, 0, 0],
  '◂': [0b00010, 0b00110, 0b01110, 0b11110, 0b01110, 0b00110, 0b00010],
  '↕': [0b00100, 0b01110, 0b00100, 0b00100, 0b00100, 0b01110, 0b00100],
  '↩': [0, 0b00001, 0b00001, 0b01001, 0b11111, 0b01000, 0],
  '›': [0, 0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0],

  // Squares, rings and marks.
  '■': [0, 0b11111, 0b11111, 0b11111, 0b11111, 0b11111, 0],
  '□': [0, 0b11111, 0b10001, 0b10001, 0b10001, 0b11111, 0],
  '▣': [0, 0b11111, 0b10001, 0b10101, 0b10001, 0b11111, 0],
  '◉': [0, 0b01110, 0b10001, 0b10101, 0b10001, 0b01110, 0],
  '◎': [0, 0b01110, 0b10001, 0b10101, 0b10001, 0b01110, 0],
  '◍': [0, 0b01110, 0b10101, 0b11011, 0b10101, 0b01110, 0],
  '◌': [0, 0b01010, 0b10001, 0b00000, 0b10001, 0b01010, 0],
  '◈': [0, 0b00100, 0b01110, 0b10101, 0b01110, 0b00100, 0],
  '✕': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  '✦': [0b00100, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0b00100],
  '✧': [0b00100, 0b00100, 0b10101, 0b01010, 0b10101, 0b00100, 0b00100],

  // Corner brackets, for the map's framing marks.
  '⌜': [0b11100, 0b10000, 0b10000, 0, 0, 0, 0],
  '⌝': [0b00111, 0b00001, 0b00001, 0, 0, 0, 0],
  '⌞': [0, 0, 0, 0, 0b10000, 0b10000, 0b11100],
  '⌟': [0, 0, 0, 0, 0b00001, 0b00001, 0b00111],

  // Prose, units and legends.
  '©': [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10001, 0b01110],
  '°': [0b01100, 0b10010, 0b01100, 0, 0, 0, 0],
  '±': [0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0, 0b11111],
  '≤': [0b00011, 0b00100, 0b11000, 0b00100, 0b00011, 0, 0b11111],
  '≈': [0, 0b01001, 0b10110, 0, 0b01001, 0b10110, 0],
  '¦': [0b00100, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0b00100],
  '♭': [0b10000, 0b10000, 0b11100, 0b10010, 0b11100, 0b10000, 0b10000],
  'Ω': [0b01110, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b11011],
  'Ø': [0b01111, 0b10011, 0b10011, 0b10101, 0b11001, 0b11001, 0b11110],
  'É': [0b00100, 0b11111, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'Á': [0b00100, 0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001],
  // Roman two: the transport's HELD marker.
  'Ⅱ': [0b11011, 0b01010, 0b01010, 0b01010, 0b01010, 0b01010, 0b11011],
  // Astrological/alchemical marks used as institutional stamps.
  '⚷': [0b01100, 0b10010, 0b01100, 0b00100, 0b11111, 0b00100, 0b00100],
  '☍': [0b01110, 0b10001, 0b01110, 0b00100, 0b00100, 0b00100, 0b00100],
};

export const VFD_COLS = 5;
export const VFD_ROWS = 7;

// Typographic characters that have no distinct 5×7 form fold onto the nearest
// ASCII glyph that does, so an unmapped code never leaves a blank hole in prose.
const FALLBACK = {
  '\u00A0': ' ', '\u2007': ' ', '\u202F': ' ', '\u200B': ' ',   // spaces
  '\u00AD': '-', '\u2010': '-', '\u2011': '-', '\u2012': '-',   // hyphens
  '\u2032': "'", '\u2033': '"', '\u2035': "'", '\u2036': '"',   // primes
  '\u00B4': "'", '\u0060': "'",                                     // accents as apostrophes
  // The ROM is upper-case only, so accented lower-case folds to its capital
  // rather than to a bare vowel: the mark is the point of the name.
  '\u00E9': '\u00C9', '\u00E1': '\u00C1',
  '\u00F8': '\u00D8', '\u2212': '-', '\u203A': '\u203A',
};

// The hollow box a real character display shows for a code it has no glyph for.
// It is NOT in `G`, so `vfdGlyphMissing` can still tell the truth about coverage.
const TOFU = [0b11111, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11111];

// A glyph exists in the ROM? Typographic variants fold to their nearest mapped
// form; only a genuinely unknown code returns null.
export function vfdGlyph(ch) {
  return G[ch] || G[FALLBACK[ch]] || G[ch?.toUpperCase?.()] || null;
}

// Is this character absent from the ROM? A space is not missing; it is a space.
export function vfdGlyphMissing(ch) {
  return ch != null && ch !== ' ' && !vfdGlyph(ch);
}

// Draw one 5×7 glyph into `ctx`, in device pixels, at (px, py), filling a cell
// of (cellW × cellH) device px. Lit dots are round and glow; dormant dots are a
// faint constant, which is the single detail that separates a VFD from glowing
// text. `dim` is the dormant colour (may be null to omit the grid).
export function drawVfdGlyph(ctx, ch, px, py, cellW, cellH, {
  color = '#F2A81E', dim = null, blur = 3, dpr = 1, alpha = 1,
  scan = 1, halation = 0.14, dimAlpha = 0.78,
} = {}) {
  // A CODE WITH NO GLYPH DRAWS A BOX, NOT NOTHING.
  //
  // This used to `return` on an unmapped character: right cell, right colour,
  // zero pixels. A missing glyph was therefore invisible and read as a spacing
  // bug — it cost real time twice, once on the minimap's diamonds and once on
  // the skills tree's PENDING mark, which had been drawing air for as long as
  // that screen existed. A hollow box is what the hardware does, and it is
  // something a person can see and report.
  const rows = ch === ' ' ? null : (vfdGlyph(ch) || TOFU);
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
        if (halation > 0) {
          // Optical halation in the front glass: spatial bloom only, never a
          // temporal trail. A VFD dot stops emitting when it is not addressed.
          ctx.save();
          ctx.fillStyle = color;
          ctx.globalAlpha = Math.max(0, Math.min(0.28, alpha * halation * scan));
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
