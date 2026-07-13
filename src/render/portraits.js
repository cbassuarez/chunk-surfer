// ASCII portraits. Hand-authored blocks, 22×13 cells.
//
// `degrade(block, amount)` re-quantises a portrait through a coarser glyph
// ramp — a portrait that loses resolution the more you have spoken to someone.
// This is the visual half of the dialogue `decay` register: the game forgets
// faces the way it forgets lines.

const RAMP = ' .:-=+*#%@';

export const PORTRAITS = {
  'usher.neutral': [
    '      ,;;;;;;,      ',
    '   ,;;\'      `;;,   ',
    '  ;;\'  ,----,  `;;  ',
    ' ;;\'  ( o  o )  `;; ',
    ' ;;    \\    /    ;; ',
    ' ;;     `--\'     ;; ',
    ' `;;,    __    ,;;\' ',
    '   `;;,______,;;\'   ',
    '     |;      ;|     ',
    '    /  \\____/  \\    ',
    '   /   |    |   \\   ',
    '  |    |    |    |  ',
    '  |____|    |____|  ',
  ],
  'usher.averted': [
    '      ,;;;;;;,      ',
    '   ,;;\'      `;;,   ',
    '  ;;\'  ,----,  `;;  ',
    ' ;;\'  ( -  - )  `;; ',
    ' ;;    \\    /    ;; ',
    ' ;;     `--\'     ;; ',
    ' `;;,          ,;;\' ',
    '   `;;,______,;;\'   ',
    '     |;      ;|     ',
    '    /  \\____/  \\    ',
    '   /   |    |   \\   ',
    '  |    |    |    |  ',
    '  |____|    |____|  ',
  ],
  // The hush has no portrait. Where a face would be, there is the box.
  'hush': [
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
    '                    ',
  ],
};

export function portrait(id) { return PORTRAITS[id] || null; }

// amount 0..1 — 0 is untouched, 1 is nearly illegible.
export function degrade(block, amount) {
  if (!block || amount <= 0) return block;
  const keep = Math.max(1, Math.round(RAMP.length * (1 - amount)));
  return block.map((line) => [...line].map((ch) => {
    if (ch === ' ') return ' ';
    const i = RAMP.indexOf(ch);
    const idx = i >= 0 ? i : RAMP.length - 1;
    const q = Math.floor(idx / RAMP.length * keep) / Math.max(1, keep - 1);
    return amount > 0.75 && Math.random() < amount - 0.75 ? ' ' : RAMP[Math.round(q * (RAMP.length - 1))] || ch;
  }).join(''));
}
