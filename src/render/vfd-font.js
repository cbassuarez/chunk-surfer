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
  // Missing until the return form printed "ACHIEVEMENTS & RUN HISTORY" as a
  // tofu box on a screen the player actually reads. It slipped through
  // vfd-glyph-coverage because that spec only scans NON-ASCII literals.
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
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

// THE GLOW STAGE.
//
// What a lit dot on a character VFD looks like is three things at once, and the
// old stage collapsed them into one blob:
//
//   · a near-clipped white centre, because the dot is driven hard enough that
//     the middle of it is off the top of the eye's range,
//   · a tight saturated phosphor halo immediately around it,
//   · a very wide, very faint veil across the whole front glass.
//
// It is spatial HALATION — light scattering inside the glass — and never a
// temporal trail. A VFD dot stops emitting the instant it stops being
// addressed; there is no persistence and there must never be one here.
//
// FOUR THINGS WERE WRONG, and all four are fixed below.
//
// 1. THERE WAS NO CORE. The old code built the core arc at radius `r`, then the
//    halation block called ctx.beginPath() inside a save()/restore(). save and
//    restore preserve drawing STATE, never the current path — so the core path
//    was destroyed and the final fill() landed on the HALO's path. Every lit dot
//    was drawn once, 18% oversized, with nothing bright in the middle. At UI
//    size that fused the dots into solid bars and the 5×7 matrix — the entire
//    point of this font — disappeared off the screen.
//
// 2. LIGHT DID NOT SUM. Halos composited source-over, so dense strokes never
//    pooled, and because the loop ran halo→core per dot in scan order, each halo
//    painted over the cores already drawn and greyed them. Everything emissive
//    here is composited 'lighter' now, which is both the correct optics and
//    makes draw order stop mattering.
//
// 3. THE SECOND BLOOM RAN AT FULL STRENGTH. atlas.js dimmed its wide pass with
//    ctx.globalAlpha = 0.30, but this function ASSIGNED globalAlpha per dot
//    instead of multiplying by what it was handed, so the dimming did nothing
//    and bright glyphs were double-exposed. `alpha` is the only amplitude
//    control now and it is honoured, so that second call is gone from atlas.js.
//
// 4. THE WIDE PASS WAS CLIPPED BY ITS OWN TILE. It asked for more blur than the
//    atlas tile had padding for, so the glow ended in a straight vertical cut on
//    both sides of every glyph. The bleed is declared here now and atlas.js
//    sizes its tiles from vfdGlowBleed(), so the two cannot disagree again.
//
// HOW THE LOBES ARE BUILT. Not with shadowBlur — the slowest primitive in
// canvas2d, and it was being asked for twice per lit dot. The lit dots are drawn
// once into a scratch canvas, and each lobe is that mask downscaled and drawn
// back up with smoothing on. A downsample/upsample IS a cheap wide gaussian, it
// costs a fraction of a real blur, and because both lobes come off the one mask
// the light inside a glyph sums correctly for free.
export const VFD_GLOW = Object.freeze({
  // The tight saturated halo, in halvings: one step down and back is a small
  // radius. This is the lobe that makes a stroke read as lit rather than drawn.
  coreHalvings: 1,
  coreAmount: 0.74,
  // The wide veil in the glass. Three halvings is soft and broad; the amount is
  // low on purpose, because this one is spread over a large area and it is what
  // lifts the black if it is too strong.
  veilHalvings: 3,
  veilAmount: 0.26,
  // The near-white middle, which is what makes the dot read as clipped rather
  // than as a disc of paint. White composited 'lighter' over the phosphor gets
  // there without this needing to know the phosphor's colour.
  //
  // It only runs when the dot is big enough to HAVE a middle. At UI size a lit
  // dot is under two device px across, so a hot centre inside it is sub-pixel
  // and does not read as a core — it just desaturates the dot to straw. Below
  // the threshold the dot stays fully saturated, which is the better of the two.
  hotAmount: 0.42,
  hotRadius: 0.44,
  hotMinRadiusPx: 2.1,
  // How far light may reach past the glyph box, as a fraction of its longest
  // side. atlas.js reads this through vfdGlowBleed() to size its tile padding.
  bleedCells: 0.85,
});

// How much room the glow needs around a glyph box, in device px. The atlas asks
// rather than guessing, which is what stopped the veil being cut off square.
export function vfdGlowBleed(boxW = 0, boxH = 0) {
  return Math.ceil(Math.max(Number(boxW) || 0, Number(boxH) || 0) * VFD_GLOW.bleedCells);
}

// One reusable set of scratch canvases. Allocating per glyph would undo the
// point of not using shadowBlur; these grow to the largest glyph asked for and
// stay. Null in any environment without a DOM — the unit tests draw through a
// stub context, and a glyph must still put its dots down there.
let maskCanvas = null, maskCtx = null;
const pong = [];
function surface(store, index, w, h) {
  let entry = store[index];
  if (!entry) {
    const canvas = document.createElement('canvas');
    const context = canvas?.getContext?.('2d');
    if (!context) return null;
    entry = store[index] = { canvas, ctx: context };
  }
  if (entry.canvas.width < w || entry.canvas.height < h) {
    entry.canvas.width = Math.max(entry.canvas.width, w);
    entry.canvas.height = Math.max(entry.canvas.height, h);
  }
  // Clear only what is about to be written. These canvases grow to the largest
  // glyph ever asked for and never shrink, so clearing the whole surface for a
  // 4×5 mip level means wiping the biggest tile in the game, every level, twice
  // per glyph.
  entry.ctx.clearRect(0, 0, w, h);
  entry.ctx.imageSmoothingEnabled = true;
  return entry;
}
function scratch(w, h) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
  const width = Math.max(1, Math.ceil(w)), height = Math.max(1, Math.ceil(h));
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas?.getContext?.('2d') || null;
  }
  if (!maskCtx) return null;
  if (maskCanvas.width < width || maskCanvas.height < height) {
    maskCanvas.width = Math.max(maskCanvas.width, width);
    maskCanvas.height = Math.max(maskCanvas.height, height);
  }
  maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
  if (!surface(pong, 0, 1, 1) || !surface(pong, 1, 1, 1)) return null;
  return { maskCanvas, maskCtx };
}

// Draw the mask back onto `ctx` blurred, additively.
//
// HALVE, DON'T LEAP. A single big downscale-and-stretch is not a blur: taking a
// glyph box down to a couple of pixels and bilinearly stretching it back gives a
// blocky RECTANGLE, which is exactly what the first attempt at this looked like
// on screen. Successive halvings are a real box-filter chain and the walk back
// up in ≤2× steps keeps the interpolator inside the range it is good at. Half a
// dozen drawImage calls on tiny canvases, once per tile — still a fraction of
// what one shadowBlur cost, and it comes out smooth and round.
function lobe(ctx, pad, dx, dy, w, h, halvings, amount) {
  if (!(amount > 0)) return;
  const steps = Math.max(1, Math.round(halvings));
  let src = pad.maskCanvas, sw = w, sh = h, slot = 0;
  for (let i = 0; i < steps; i++) {
    const nw = Math.max(1, Math.round(sw / 2)), nh = Math.max(1, Math.round(sh / 2));
    if (nw === sw && nh === sh) break;
    const level = surface(pong, slot, nw, nh);
    if (!level) return;
    level.ctx.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = level.canvas; sw = nw; sh = nh; slot = 1 - slot;
  }
  // Back up to roughly half size in doubling steps, so the final stretch onto
  // the target is never more than 2× and never shows the ladder.
  while (sw * 2 <= w && sh * 2 <= h) {
    const nw = sw * 2, nh = sh * 2;
    const level = surface(pong, slot, nw, nh);
    if (!level) return;
    level.ctx.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = level.canvas; sw = nw; sh = nh; slot = 1 - slot;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = amount;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, sw, sh, dx, dy, w, h);
  ctx.restore();
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
  // Where every dot sits, and which of them are emitting. Collected once so the
  // glow can be built from the whole lit set at once rather than dot by dot —
  // that is what lets light inside a glyph pool instead of stacking.
  const lit = [];
  const dark = [];
  for (let ry = 0; ry < VFD_ROWS; ry++) {
    const bits = rows[ry] | 0;
    for (let cx = 0; cx < VFD_COLS; cx++) {
      const on = (bits >> (VFD_COLS - 1 - cx)) & 1;
      if (!on && !dim) continue;
      const dx = px + padX + stepX * (cx + 0.5);
      const dy = py + padY + stepY * (ry + 0.5);
      (on ? lit : dark).push([dx, dy]);
    }
  }

  // The dots that are not emitting go down first and stay source-over: an unlit
  // dot is not a light, it is a thing the light is not coming out of.
  if (dim && dark.length) {
    ctx.fillStyle = dim;
    ctx.globalAlpha = alpha * dimAlpha;
    ctx.shadowBlur = 0;
    for (const [dx, dy] of dark) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const duty = Math.max(0, Math.min(1, alpha * scan));
  if (lit.length && duty > 0) {
    // THE TWO LOBES, off one mask of the lit dots.
    //
    // Amplitude tracks duty rather than sitting at a fixed ceiling. The old
    // stage clamped the halo to 0.28 no matter what, so a dim readout and a
    // bright one glowed identically and the brightness setting barely read.
    //
    // `blur` is still the caller's dial for how far the light carries — the
    // atlas asks for 3.2, drawVfdText for 4.25, the pad diagram for 0 — so it
    // scales the lobes rather than being ignored now that shadowBlur is gone.
    // 3.2 is the reference, being what the bulk of the game's text uses.
    const spread = Math.max(0.6, Math.min(2.2, (Number(blur) || 0) / 3.2));
    const boxW = cellW, boxH = cellH;
    const bleed = halation > 0 ? Math.ceil(vfdGlowBleed(boxW, boxH) * spread) : 0;
    const pad = bleed > 0 ? scratch(boxW + bleed * 2, boxH + bleed * 2) : null;
    if (pad) {
      const mw = Math.ceil(boxW + bleed * 2), mh = Math.ceil(boxH + bleed * 2);
      // The mask is the lit dots alone, flat, at full strength: no shadow, no
      // alpha, nothing to undo later. Its origin is the glyph box less the
      // bleed, so the lobes land back exactly where the dots are.
      const ox = px - bleed, oy = py - bleed;
      pad.maskCtx.fillStyle = color;
      pad.maskCtx.globalAlpha = 1;
      for (const [dx, dy] of lit) {
        pad.maskCtx.beginPath();
        pad.maskCtx.arc(dx - ox, dy - oy, r, 0, Math.PI * 2);
        pad.maskCtx.fill();
      }
      // Widest and faintest first, then the tight halo on top of it.
      const gain = duty * Math.max(0, halation) / 0.14;
      const veil = Math.max(1, Math.min(5, Math.round(VFD_GLOW.veilHalvings * spread)));
      lobe(ctx, pad, ox, oy, mw, mh, veil, VFD_GLOW.veilAmount * gain);
      lobe(ctx, pad, ox, oy, mw, mh, VFD_GLOW.coreHalvings, VFD_GLOW.coreAmount * gain);
    }

    // THE DOTS THEMSELVES, crisp, at radius r — this is the bug fix. They are
    // opaque and they are what makes the 5×7 matrix readable, so they go down
    // source-over on top of their own glow rather than adding into it.
    ctx.fillStyle = color;
    ctx.globalAlpha = duty;
    ctx.shadowBlur = 0;
    for (const [dx, dy] of lit) {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The hot middle. White added over the phosphor takes the centre of the dot
    // toward clipping, which is what a hard-driven VFD does on camera and what
    // stops the dot reading as a flat disc of paint.
    if (VFD_GLOW.hotAmount > 0 && halation > 0 && r >= VFD_GLOW.hotMinRadiusPx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#FFFFFF';
      ctx.globalAlpha = VFD_GLOW.hotAmount * duty;
      for (const [dx, dy] of lit) {
        ctx.beginPath();
        ctx.arc(dx, dy, r * VFD_GLOW.hotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  ctx.restore();
}
