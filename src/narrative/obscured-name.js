// THE NAME THE RAIN TOOK.
//
// At 21:38 the guard asks for your name for the register. You give it and he
// accepts it. With separate identity consent, a sanitized persona may exist
// just long enough for local booth synthesis — see docs/story-doctrine.md,
// "The unresolved name" — but no literal operator name is permitted in saves,
// tapes, captions, transcripts, diagnostics, telemetry or exports.
//
// This module draws the hole where it was.
//
// IT CANNOT LEAK A NAME, STRUCTURALLY. There is no parameter a name can enter
// through: the shape is built from a seed, and the optional `token` is already
// the HMAC digest fragment produced by maskIdentitySnapshot (game/interference-
// case.js), which is one-way. The output alphabet is six block glyphs and a
// space. There is no code path from a person's name to a letter on screen,
// which is why the guarding test can be a regex rather than a promise.
//
// Integer hashing only, mirroring nightSeedForRun() in main.js: this decides
// what is on the screen and must not drift between machines.

// The six that actually exist in the VFD ROM. `▒`, `▌` and `▐` do NOT — they
// draw nothing at all, silently (render/vfd-font.js), which is why the speech
// cursor has been invisible for as long as it has. Do not add them here.
export const OBSCURED_GLYPHS = Object.freeze(['░', '▏', '▯', '▓', '▮', '█']);

// Lightest to heaviest. The rain arrives as a smudge and ends as a block, so an
// erase in progress walks up this ramp.
export const OBSCURED_RAMP = Object.freeze(['░', '▏', '▓', '▮', '█']);

// What an accessibility caption says when the animation is off. This is the
// string the doctrine names, and it lives here so the renderer, the fallback and
// the tests all read the same one.
export const OBSCURED_NAME_CAPTION = '[NAME OBSCURED]';

function hash32(value) {
  let h = (Math.floor(Number(value) || 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function mix(seed, salt) {
  return hash32((hash32(seed) ^ Math.imul(salt >>> 0, 0x27d4eb2f)) >>> 0);
}

// FNV-1a over code points. The input is already a digest fragment; this only
// folds it to an integer so it can drive the same hashing as a run counter.
function foldToken(token) {
  let h = 0x811c9dc5;
  for (const ch of String(token)) h = Math.imul(h ^ ch.codePointAt(0), 0x01000193) >>> 0;
  return h >>> 0;
}

const pick = (seed, salt, n) => mix(seed, salt) % n;

// ONE SHAPE PER RUN.
//
// `runSeed` is the run counter, so the shape is stable for a whole run — the
// booth and the pre-roll fragment in B3 have to be the same shape or the joke
// (that you recognise a thing you have never read) does not land — and different
// next time.
//
// `token` is the optional masked identity fragment. When personalized
// interference is switched on, the unreadable name takes its length and rhythm
// from your real one. Nothing recoverable comes back: the digest went in one
// way, and what comes out is blocks.
export function obscuredNameShape({ runSeed = 0, token = null } = {}) {
  const base = token ? mix(foldToken(token), 0x4417) : hash32(runSeed);

  // Two groups, and now and then a third short one in the middle — an initial.
  // A single run of blocks reads as a censor bar; groups read as a name.
  const hasInitial = pick(base, 11, 100) < 24;
  const lengths = [3 + pick(base, 21, 5)];
  if (hasInitial) lengths.push(1);
  lengths.push(4 + pick(base, 31, 6));

  const cells = [];
  const weights = [];
  let index = 0;
  for (let w = 0; w < lengths.length; w++) {
    if (w) { cells.push(' '); weights.push(0); index++; }
    for (let i = 0; i < lengths[w]; i++) {
      // Heavier in the middle of a group, lighter at its ends, so each blot has
      // the swell of a written word rather than the flatness of a bar.
      const centre = 1 - Math.abs((i / Math.max(1, lengths[w] - 1)) - 0.5) * 2;
      const jitter = pick(base, 101 + index * 7, 100) / 100;
      // The floor is low enough that some cells settle thin. With it at 0.34
      // nothing ever landed below `▯` and the whole thing read as a barcode.
      const weight = Math.min(1, 0.16 + centre * 0.54 + jitter * 0.34);
      const glyph = OBSCURED_GLYPHS[Math.min(
        OBSCURED_GLYPHS.length - 1,
        Math.floor(weight * OBSCURED_GLYPHS.length),
      )];
      cells.push(glyph);
      weights.push(weight);
      index++;
    }
  }

  return Object.freeze({
    cells: cells.join(''),
    weights: Object.freeze(weights),
    words: lengths.length,
    length: cells.length,
  });
}

// ── what the mask leaves in the air ─────────────────────────────────────────
//
// This is the non-personal fallback beneath the two booth rows and the ONLY
// voice used by the later B3 pre-roll echo. The opted-in literal booth voice is
// deliberately implemented outside this module, so neither the shape nor its
// repeatable tape utterance can acquire a name by accident.
//
// This function takes the SHAPE, never a name. There is no parameter a name can
// enter through, the shape it reads was itself built from a one-way digest
// fragment, and the output alphabet is a fixed table of twelve syllables. The
// guarantee the glyph ramp makes about the screen, this makes about the echo.
//
// And it reads the shape that is ALREADY DRAWN, so the thing you half-hear and
// the thing you half-see are the same object — one spoken group per blot, one
// syllable per two cells. A player who notices anything notices they agree.
export const UTTERANCE_SYLLABLES = Object.freeze([
  'da', 'na', 'ma', 'la', 'ra', 'va',
  'de', 'ne', 'me', 'le', 're', 'so',
]);

export function obscuredNameUtterance(shape) {
  const cells = String(shape?.cells || '');
  if (!cells.trim()) return '';
  // Folding the drawn cells is what ties the sound to the picture. It is also
  // one more hash between this and anything a person is called.
  const base = foldToken(cells);
  const words = [];
  let index = 0;
  for (const group of cells.split(' ')) {
    if (!group) continue;
    // Roughly two glyph cells to the syllable, which is about the ratio letters
    // run to syllables in a name, so a long blot sounds long.
    const count = Math.max(1, Math.round(group.length / 2));
    let word = '';
    for (let i = 0; i < count; i++) {
      word += UTTERANCE_SYLLABLES[pick(base, 211 + index * 13, UTTERANCE_SYLLABLES.length)];
      index++;
    }
    words.push(word);
  }
  return words.join(' ');
}

// THE RUN'S SHAPES, BY MASK ID.
//
// A one-entry registry rather than a parameter threaded through the transcript,
// the speech band and the tape: those three have no business knowing about run
// counters or identity tokens, and there is exactly one shape in the game. main
// seeds it when the plan loads; everything downstream asks by name.
//
// Deliberately not persisted. It is rebuilt from the run counter on load, which
// is what makes it survive a reload without ever being written down.
const activeShapes = new Map();
export function setObscuredShape(id, shape) {
  if (id && shape) activeShapes.set(String(id), shape);
  return shape;
}
export function obscuredShape(id) {
  return activeShapes.get(String(id || '')) || null;
}

// The glyph to draw at `index` when the rain has swept `erase` of the way across
// (0 = nothing taken yet, 1 = gone). The edge is deliberately ragged: each cell
// carries its own small lead or lag so the wipe never looks like a progress bar.
//
// NO LETTERS, NOT EVEN FOR A FRAME. The first sketch of this had the name type in
// as characters and the rain overwrite them, which is a better piece of motion
// and completely unacceptable: a player could stop on frame three, read "Joh",
// and reasonably believe the game had just told them their character's name. The
// doctrine does not say "no readable name", it says no literal name in any
// presentation. So the type-in is fine ink — a thin stroke that thickens — and
// the gesture is unchanged. You still watch something be set down and then
// taken; you were never going to be able to read it either way.
//
// This function is the ONLY source of glyphs for the masked line, so the
// renderer has nothing to invent with and the regex in the spec is a proof
// rather than a spot check.
//
// At erase >= 1 it returns the settled shape, which is also what a player with
// instant text or effects disabled sees on frame one — the animation is an
// embellishment on a picture that is already correct without it.
export function obscuredGlyphAt(shape, index, erase = 1) {
  const cell = shape?.cells?.[index];
  if (!cell || cell === ' ') return ' ';
  const span = Math.max(1, shape.length);
  const lead = (hash32(index * 2654435761) % 100) / 100;
  const local = ((Number(erase) || 0) * (span + 3) - index - lead * 1.6) / 2.2;
  if (local <= 0) return OBSCURED_RAMP[0];           // still just ink on the page
  if (local >= 1) return cell;
  const step = Math.min(OBSCURED_RAMP.length - 1, Math.floor(local * OBSCURED_RAMP.length));
  return OBSCURED_RAMP[step];
}
