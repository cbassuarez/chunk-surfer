// WARNING: CAN'T READ SECTOR AT 29498915328, LOST DATA.
//
// An ntfsclone run failing to read a disk, generated rather than recorded. The
// reference is a real 93-second run: rows of the same warning, the offsets
// climbing, and — the part that makes it what it is — the framebuffer TEARING.
// Whole rectangles of the screen shift sideways and down, land on top of each
// other and overwrite mid-word, so a line reads `816RNING: Can't read sector`
// where a number has landed on `WA`, or `169688data.` where an offset has eaten
// `, lost `. Orphaned digit runs sit alone in the blue.
//
// It is generated because it has to do three things a clip cannot: run forever,
// keep climbing, and live on a 3D surface. The recording is the thing this was
// tuned against, not the thing that ships.
//
// WHY IT DRAWS BRIGHT ON BLACK when the reference is dark-on-light. Both
// consumers read LUMINANCE, not colour, and both already own their palette:
// r3dSetSourceSurface feeds sourceGlyph(), which turns brightness into ink
// height and takes its colour from sourceSyntaxTint (red on MAT_SOURCE_FAULT);
// the window pane dithers luminance through its own five-step violet ramp,
// whose top is a pale blue-white and whose middle is a deep blue — which lands
// remarkably close to the reference's ncurses blue by accident. Drawing the
// reference's own colours would be thrown away by both.

const WARNING = (offset) => `WARNING: Can't read sector at ${offset}, lost data.`;

// The offsets in the reference walk in small steps with occasional leaps —
// 29498915328 → 29567705088 (+68.8M) → 29567705600 (+512) → 30839020544 (+1.27G)
// — which is what a run does as it crosses a bad region and then seeks past it.
// 512 is a sector; the small steps are multiples of it, and the leaps are the
// clone giving up on a stretch and moving on.
const SECTOR = 512;
const START = 29498915328;

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

// The warnings themselves. Deterministic from a seed, so one night reads one
// disk and the same night reads it the same way twice.
export function sectorErrorLines({ count = 24, seed = 1, from = START } = {}) {
  const random = seeded(seed);
  const lines = [];
  let offset = Math.max(0, Math.floor(Number(from) || START));
  for (let i = 0; i < Math.max(1, Math.floor(count)); i += 1) {
    lines.push(WARNING(offset));
    const roll = random();
    // Mostly the next sector or a few along; sometimes a jump of a few hundred
    // megabytes; rarely the clone abandons a gigabyte and seeks past it.
    const step = roll > 0.97 ? Math.floor(random() * 2_000_000) * SECTOR
      : roll > 0.82 ? Math.floor(random() * 140_000) * SECTOR
        : Math.max(1, Math.floor(random() * 6)) * SECTOR;
    offset += step;
  }
  return lines;
}

// A bare offset, for the fragments that land on their own in the blue.
export function sectorErrorFragment(seed = 1) {
  const random = seeded(seed);
  const digits = 3 + Math.floor(random() * 5);
  let out = '';
  for (let i = 0; i < digits; i += 1) out += Math.floor(random() * 10);
  return out;
}

export const SECTOR_ERROR_ROW_PITCH = 22;

// Draw the readout into a 2D context.
//
// `scroll` is in rows and may be fractional; phases are baked by stepping it,
// which is how the window panes get vertical motion out of still images.
// `tear` is how much of the framebuffer damage to bake in: the consumers each
// run their own fault pass afterwards (SOURCE_FAULT_FRAG on the floors, the
// nvme-sector shader on the panes), so this only has to carry enough that the
// readout still reads as broken when it is looked at on its own.
export function renderSectorErrorFrame(ctx, {
  width = 512, height = 320, scroll = 0, seed = 1, tear = 1,
  fontPx = 15, ink = '#dfe6ff', ground = '#05070e',
} = {}) {
  if (!ctx) return false;
  ctx.save();
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${fontPx}px monospace`;
  ctx.textBaseline = 'top';

  const pitch = SECTOR_ERROR_ROW_PITCH;
  const rows = Math.ceil(height / pitch) + 2;
  // Enough lines that scrolling never repeats within a phase set.
  const lines = sectorErrorLines({ count: rows * 4, seed });
  const random = seeded(seed + 977);
  const offsetRows = Math.floor(scroll);
  const subRow = (scroll - offsetRows) * pitch;

  ctx.fillStyle = ink;
  for (let row = -1; row < rows; row += 1) {
    const text = lines[(row + offsetRows + lines.length * 4) % lines.length];
    ctx.fillText(text, 4, row * pitch - subRow);
  }

  if (tear > 0) {
    // THE TEAR. Rectangles of what is already drawn, lifted and put back down
    // somewhere else — which is the actual failure in the reference, not a
    // filter over it. Copying from the canvas onto itself is what produces the
    // mid-word collisions; drawing fresh text at an offset would only ever look
    // like text at an offset.
    // RECTANGLES, NOT SCANLINES. A full-width copy smears the whole row and
    // reads as motion blur; the reference tears BLOCKS — a region a few rows
    // tall and part of the way across, put down somewhere else, leaving the
    // ground bare where it came from. That is what makes one line read
    // `816RNING:` while the line under it is untouched.
    const bands = Math.round(3 + random() * 4 * tear);
    for (let i = 0; i < bands; i += 1) {
      const y = Math.floor(random() * height);
      const h = Math.max(pitch, Math.floor(random() * pitch * 3));
      const x = Math.floor(random() * width * 0.6);
      const w = Math.max(40, Math.floor(random() * (width - x)));
      // Short throws. A block flung far lands on bare ground and reads as a
      // caption; a block moved a row or two lands ON the text that is already
      // there, which is the double-exposure the reference is full of.
      const dx = Math.round((random() * 2 - 1) * width * 0.16 * tear);
      const dy = Math.round((random() * 2 - 1) * pitch * 1.4 * tear);
      try {
        // Where the block came from goes dark: the clone did not read it.
        // Occasionally the source really is gone — but rarely, or the screen
        // empties out and stops looking like a terminal under load.
        if (random() < 0.16 * tear) { ctx.fillStyle = ground; ctx.fillRect(x, y, w, h); ctx.fillStyle = ink; }
        ctx.drawImage(ctx.canvas, x, y, w, h, x + dx, y + dy, w, h);
      } catch (_) { /* no-op */ }
    }
    // Orphaned digit runs, sitting alone where a row used to be.
    const orphans = Math.round(random() * 3 * tear);
    for (let i = 0; i < orphans; i += 1) {
      const text = sectorErrorFragment(seed + i * 31);
      const x = Math.floor(random() * width * 0.7);
      const y = Math.floor(random() * rows) * pitch;
      ctx.fillStyle = ground;
      ctx.fillRect(x - 2, y, ctx.measureText(text).width + 4, pitch);
      ctx.fillStyle = ink;
      ctx.fillText(text, x, y);
    }
    // One row held inverted, the way a selected line sits in the reference.
    if (random() < 0.5 * tear) {
      const y = Math.floor(random() * rows) * pitch;
      const text = lines[Math.floor(random() * lines.length)];
      const w = ctx.measureText(text).width;
      ctx.fillStyle = ink;
      ctx.fillRect(2, y, w + 6, pitch - 2);
      ctx.fillStyle = ground;
      ctx.fillText(text, 4, y);
      ctx.fillStyle = ink;
    }
  }
  ctx.restore();
  return true;
}

// Bake a loop of scroll phases as data URLs. The window panes cannot take a live
// canvas — window-media-surface.js is a shader with an image sampler — so
// motion is a cut between still frames, which is also what a terminal actually
// does.
export function sectorErrorPhases({ count = 10, width = 512, height = 320, seed = 1, rowsPerPhase = 1.5 } = {}) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return [];
  const out = [];
  for (let i = 0; i < Math.max(1, Math.floor(count)); i += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return out;
    renderSectorErrorFrame(ctx, { width, height, seed: seed + i, scroll: i * rowsPerPhase });
    try { out.push(canvas.toDataURL('image/webp', 0.82)); } catch (_) { return out; }
  }
  return out;
}
