// THE PAGES IN THE LONG HALL.
//
// The hall was a corridor of scenery: twelve-odd sheets you walked past, one of
// which was secretly the real one, and none of which could be read. Walking a
// hundred and twelve metres past unreadable paper is not a beat, it is a
// distance.
//
// So they are readable now, and what is on them is the job. Every page in here
// is the same document failing in a different place — a work order, a schedule
// of consent, an acceptance form, a take sheet — with the previous contractor
// coming through the institutional language wherever the form has torn. The
// building files everything. This is the file.
//
// THE RULES THESE WERE WRITTEN TO, so a later hand does not soften them:
//
//   1. It is ALWAYS paperwork first. The horror is that the form has a field for
//      this. Nothing here is a ghost saying boo; it is a clause that has been
//      filled in too many times.
//   2. The corruption is MECHANICAL, not decorative. Text repeats where a
//      transport looped, drops where the tape dropped, and overwrites where the
//      same field was typed twice. Random glyph soup would be noise, and noise
//      is not frightening.
//   3. Alan is never named on a page. He is a signature, a hand, a fourth entry.
//      The player meets his name elsewhere (ending.surfaced); a page that named
//      him would spend that.
//   4. The Surfer may only repeat recorded or institutional language — the same
//      doctrine narrative/signal-role.js enforces. Nothing on a page is in its
//      own voice, because it does not have one.
//
// `stage` is the hall's own pageStage (0..4, rising with depth). Deeper pages
// are more broken, and the last of them stop pretending to be forms.

const page = (id, stage, lines) => Object.freeze({ id, stage, lines: Object.freeze(lines) });

export const SOURCE_PAGES = Object.freeze([
  // ── stage 0 · the form, intact, and already wrong ───────────────────────────
  page('work-order-clean', 0, [
    'W. ELLERY / WORKS · ORDER 4417-C',
    'SCOPE: FIVE (5) ROOM TONES, SIXTY (60) SECONDS EACH.',
    'ACCESS: KEYS HELD AT LODGE. RETURN ON COMPLETION.',
    'NOTE: THE BUILDING IS EMPTY. THIS IS NOT A SURVEY.',
  ]),
  page('consent-schedule', 0, [
    'SCHEDULE OF CONSENT · APPENDIX B',
    'ALL PERSONS PRESENT HAVE AGREED TO BE PRESENT.',
    'ALL PERSONS PRESENT HAVE AGREED TO BE PRESENT.',
    'ALL PERSONS PRESENT HAVE AGREED TO BE',
  ]),

  // ── stage 1 · the transport starts to slip ──────────────────────────────────
  page('take-sheet-1', 1, [
    'TAKE SHEET · ROOM 1 · MAIN B3',
    '01  0:60  ACCEPTED',
    '02  0:60  ACCEPTED',
    '03  0:6   ACCEPT   ACCEPT   ACCEPT   ACCEPT',
    '04  0:__  THE ROOM ANSWERED ON THIS ONE',
  ]),
  page('method-note', 1, [
    'METHOD · DO NOT DEVIATE',
    'STAND STILL. THE ROOM IS THE SOURCE.',
    'STAND STILL. THE ROOM IS THE SOU▓CE.',
    'STAND STILL. THE ROOM IS THE',
    'STAND STILL.',
  ]),
  page('lodge-log', 1, [
    'LODGE LOG · NIGHT ENTRIES',
    '22:04  CONTRACTOR IN. KEYS ISSUED.',
    '22:04  CONTRACTOR IN. KEYS ISSUED.',
    '22:04  CONTRACTOR IN. KEYS ISSUED.',
    'ONE MAN SIGNED THIS COLUMN FOUR TIMES.',
  ]),

  // ── stage 2 · the fourth take, and the correction ───────────────────────────
  page('acceptance-4', 2, [
    'ACCEPTANCE · TAKE 04',
    'REFERENCE MATCH ........ 0.9▓8',
    'DEVIATION .............. CORRECTED',
    'CORRECTED BY ........... THE ROOM',
    'CONTRACTOR PRESENT ..... STILL',
  ]),
  page('correction-notice', 2, [
    'CORRECTION NOTICE',
    'AGAIN FROM THE FIRST BAR.',
    'AGAIN FROM THE FIRST BAR.',
    'AGAIN FROM THE  IRST BAR.',
    'AGAIN F OM THE FI ST B R.',
    'AG IN',
  ]),
  page('inventory-return', 2, [
    'EQUIPMENT · RETURNED ON COMPLETION',
    'RECORDER ....... NOT RETURNED',
    'HEADPHONES ..... NOT RETURNED',
    'TORCH .......... NOT RETURNED',
    'CONTRACTOR ..... NOT RETURNED',
    'FORM COMPLETE.',
  ]),

  // ── stage 3 · a man in the margin of his own paperwork ──────────────────────
  page('margin-hand', 3, [
    'REMARKS (CONTRACTOR TO COMPLETE)',
    'eleven weeks is not the job',
    'eleven weeks is not the job',
    'I have done sixty seconds four hundred times',
    'THE ABOVE IS NOT A VALID REMARK. RE-ENTER.',
    'eleven weeks is not the',
  ]),
  page('overtype', 3, [
    'DECLARATION OF COMPLETION',
    'I CONFIRM THE WORKS ARE COMPLETE AND I AM LEAVING',
    'I̶ ̶C̶O̶N̶F̶I̶R̶M̶ ̶T̶H̶E̶ ̶W̶O̶R̶K̶S̶ ̶A̶R̶E̶ ̶C̶O̶M̶P̶L̶E̶T̶E̶',
    'I CONFIRM THE WORKS ARE',
    'I CONFIRM',
    'I',
  ]),
  page('room-tone-definition', 3, [
    'DEFINITION · ROOM TONE',
    'THE SOUND OF A ROOM WITH NOBODY IN IT.',
    'THE SOUND OF A ROOM WITH NOBODY IN IT.',
    'THE SOUND OF A ROOM WITH NOBODY',
    'THE SOUND OF A ROOM WITH',
    'THE SOUND OF A ROOM',
    'THE SOUND OF A',
  ]),

  // ── stage 4 · the form gives up being a form ────────────────────────────────
  page('left-column', 4, [
    'REGISTER · LEFT COLUMN',
    'NAME ................ (ILLEGIBLE)',
    'NAME ................ (ILLEGIBLE)',
    'NAME ................ (ILLEGIBLE)',
    'NAME ................ (ILLEGIBLE)',
    'THERE IS NO RIGHT COLUMN ON THIS PAGE.',
  ]),
  page('one-more', 4, [
    'ONE MORE AND I AM OUT OF HERE',
    'ONE MORE AND I AM OUT OF HERE',
    'ONE MORE AND I AM OUT OF H▓RE',
    'ONE MORE AND I AM OUT',
    'ONE MORE AND I AM',
    'ONE MORE AND I',
    'ONE MORE',
  ]),
  page('this-page', 4, [
    'THIS PAGE IS THE ROOM.',
    'THE ROOM IS THE TAKE.',
    'THE TAKE IS THE MAN.',
    'THE MAN IS THE REFERENCE.',
    'THE REFERENCE DOES NOT STOP AFTER FOUR.',
  ]),
  page('you', 4, [
    'W. ELLERY / WORKS · ORDER 4417-C',
    'SCOPE: FIVE (5) ROOM TONES, SIXTY (60) SECONDS EACH.',
    'CONTRACTOR: (THE NAME HERE IS YOURS)',
    'THE FORM HAS BEEN PREPARED IN ADVANCE.',
  ]),
]);

// The page a given sheet shows. Deterministic per sheet index and seed, drawn
// from the band at or below the hall's current stage — so the corridor gets
// worse as it goes and never hands a stage-4 page to somebody eight metres in.
export function sourcePageFor(index = 0, stage = 0, seed = 0) {
  const band = SOURCE_PAGES.filter((p) => p.stage <= Math.max(0, Math.min(4, stage)));
  const pool = band.length ? band : SOURCE_PAGES;
  const n = (Math.abs(Math.floor(index)) * 2654435761 + Math.abs(Math.floor(seed)) * 40503) >>> 0;
  return pool[n % pool.length];
}

export function sourcePageById(id) {
  return SOURCE_PAGES.find((p) => p.id === id) || null;
}
