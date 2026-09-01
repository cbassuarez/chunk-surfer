// SHEET MUSIC.
//
// Five pages in the whole building, and the strong half of the composure
// economy: a sheet is worth three grid squares against the one a clean take
// returns, so reading one is five good takes and you should not want to spend
// it. See recordist.js for the pool and bag-items.js for the transaction.
//
// THEY ARE REAL PIECES, AND THEY SHARE A FIGURE.
//
// Four of these five are built on the same thing: a line that goes down and
// keeps going down. The descending tetrachord is the Baroque lament bass — it
// is literally what Dowland's "tear" is, it is what Strozzi's lament walks, it
// is what a tombeau does over a grave, and Satie's chromatic sink is the same
// gesture with the floor taken out. That was not a curation trick; it is what
// this repertoire is. So the building is full of falling lines, and the one
// piece that is NOT falling is the Bach, which comes back to where it started.
//
// YOU HEAR THEM. Each sheet carries an eleven-second excerpt of a REAL
// PERFORMANCE by a real person, played when he looks at the page — through a
// 900Hz lowpass, slowed, panned off to one side, under tape hiss, because he
// is hearing it the way he hears everything else in this building. See
// audio/sheet-voice.js. `motif` is the same figure written out in note names,
// kept as the fallback for when the file has not decoded yet, and as the thing
// the tests can reason about without an audio context.
//
// LICENSING. Every recording is public domain, CC0, or CC BY — nothing
// share-alike, and nothing that is public domain in the EU only. Two are CC BY
// and carry the credit line they require on the entry itself, so the credits
// roll reads it from here and a new sheet cannot silently drop one. The full
// table, and the list of what was rejected and why, is in
// third_party/licenses/SHEET-MUSIC-AUDIO.md.

// Equal temperament from A4=440, so a motif can be written in note names and
// stay legible as music rather than as a list of frequencies.
const A4 = 440;
const STEP = Object.freeze({ C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 });
export function noteHz(name = 'A4') {
  const match = /^([A-G])([#b]?)(-?\d)$/.exec(String(name).trim());
  if (!match) return 0;
  const [, letter, accidental, octave] = match;
  const semitones = STEP[letter] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)
    + (Number(octave) - 4) * 12;
  return A4 * (2 ** (semitones / 12));
}

// `notes` are note names; `beats` is how long each is held, in the motif's own
// slow time. A page is not a metronome — these are all rubato by the time they
// reach him through two floors.
const motif = (notes, beats = null) => Object.freeze({
  notes: Object.freeze(notes.map(String)),
  beats: Object.freeze(notes.map((_, i) => (beats ? beats[i] : 1))),
});

export const SHEET_MUSIC = Object.freeze([
  Object.freeze({
    id: 'sheet-goldberg-aria',
    at: { x: 63, y: 15 }, room: 'main_b3',
    composer: 'J. S. BACH', title: 'ARIA', work: 'GOLDBERG VARIATIONS BWV 988',
    audio: 'sheet-goldberg-aria', performer: 'KIMIKO ISHIZAKA',
    licence: 'CC0 — OPEN GOLDBERG', attribution: null,
    // The ground bass. Thirty variations are built over these notes and then
    // the Aria returns note for note as though none of it happened — which is
    // the building, and is why this one is in the room he keeps coming back
    // to. The only figure in the set that does not fall.
    motif: motif(['G2', 'F#2', 'E2', 'D2', 'B1', 'C2', 'D2', 'G2'], [2, 2, 2, 2, 2, 2, 2, 3]),
    line: 'Bach. The tune at the front of the book — and the last page is the same page again, after everything else.',
    detail: 'THIRTY VARIATIONS BETWEEN THE FIRST PAGE AND THE LAST. THE LAST IS THE FIRST.',
  }),
  Object.freeze({
    id: 'sheet-lamento-ninfa',
    at: { x: 88, y: 27 }, room: 'the_tub',
    composer: 'C. MONTEVERDI', title: 'LAMENTO DELLA NINFA', work: 'MADRIGALS BOOK VIII, 1638',
    audio: 'sheet-lamento-ninfa', performer: null,
    licence: 'CC BY 2.5',
    attribution: 'Monteverdi, Lamento della Ninfa — Wikimedia Commons, CC BY 2.5',
    // The lament ground itself: four notes down, over and over, while a woman
    // sings across them and never lands with them. Three men stand at the side
    // and comment on her while she does it, which is its own kind of horror.
    motif: motif(['A4', 'G4', 'F4', 'E4', 'A4', 'G4', 'F4', 'E4'], [2, 2, 2, 4, 2, 2, 2, 5]),
    line: 'A woman singing over four notes that keep going down. The four notes never change. She never lands on them.',
    detail: 'THE GROUND FALLS FOUR NOTES AND BEGINS AGAIN. SHE SINGS ACROSS IT.',
  }),
  Object.freeze({
    id: 'sheet-flow-my-tears',
    at: { x: 71, y: 25 }, room: 'amplifications',
    composer: 'J. DOWLAND', title: 'FLOW, MY TEARS', work: 'THE SECOND BOOKE OF SONGS, 1600',
    audio: 'sheet-flow-my-tears', performer: 'SOPRANO AND LUTE',
    licence: 'CC BY 2.5',
    attribution: 'Dowland, Flow my tears — Wikimedia Commons, CC BY 2.5',
    // The falling tear: A G F E, the four notes the whole Lachrimae is built
    // out of. Printed in TABLE-BOOK layout — the parts face different
    // directions on the one page so four people sitting round a table could
    // read from it at once. In the empty hall.
    motif: motif(['A4', 'G4', 'F4', 'E4', 'E4', 'D4', 'C#4', 'D4'], [2, 1, 1, 3, 1, 1, 1, 3]),
    line: 'The parts face different ways on the one page. You would sit round a table, four of you, and all read off it at once.',
    detail: 'TABLE-BOOK. FOUR PARTS, ONE SHEET, FOUR DIRECTIONS.',
  }),
  Object.freeze({
    id: 'sheet-couperin-clavecin',
    at: { x: 95, y: 71 }, room: 'lux_nova',
    composer: 'F. COUPERIN', title: "L'ART DE TOUCHER LE CLAVECIN", work: '1716',
    audio: 'sheet-couperin-clavecin', performer: 'DAVID JOSEPH',
    licence: 'CC0', attribution: null,
    // Not a piece: a TREATISE. "The art of touching the harpsichord" — a
    // manual that teaches you how to play the pages that come after it. The
    // building is already full of instruction he did not ask for, and this is
    // the only instruction in it that is trying to help.
    motif: motif(['D4', 'C4', 'Bb3', 'A3', 'G3', 'F3', 'E3', 'D3'], [3, 2, 2, 4, 2, 2, 2, 5]),
    line: 'It is not a piece. It is a lesson — how to hold your hand, where the weight goes. Somebody wrote down how to do it properly.',
    detail: 'A METHOD, NOT A PIECE. IT IS TRYING TO TEACH SOMEBODY WHO IS NOT HERE.',
  }),
  Object.freeze({
    id: 'sheet-gymnopedie',
    at: { x: 106, y: 18 }, room: 'soundnoisemusic',
    composer: 'E. SATIE', title: 'GYMNOPEDIE NO. 1', work: '1888',
    audio: 'sheet-gymnopedie', performer: 'MICHAEL LAUCKE, GUITAR',
    licence: 'PUBLIC DOMAIN', attribution: null,
    // Marked "lent et douloureux" — slow and painful. It hangs on a chord that
    // will not resolve and then simply stops, which is the practice wing at
    // three in the morning.
    motif: motif(['F#4', 'A4', 'C#5', 'B4', 'A4', 'F#4', 'E4', 'D4'], [3, 2, 4, 2, 2, 3, 2, 5]),
    line: 'Lent et douloureux, at the top. Slow and painful. Somebody has written the tempo of the room down.',
    detail: 'LENT ET DOULOUREUX. IT NEVER RESOLVES, IT JUST STOPS.',
  }),
]);

export function sheetMotifHz(sheet) {
  const source = sheet?.motif;
  if (!source?.notes?.length) return { hz: [] };
  return {
    hz: source.notes.map((name, index) => ({
      hz: noteHz(name),
      beats: Number(source.beats?.[index]) || 1,
    })).filter((note) => note.hz > 0),
  };
}

export function sheetMusicById(id = '') {
  return SHEET_MUSIC.find((sheet) => sheet.id === String(id)) || null;
}
