// THE EAR ROOM.
//
// After B3 is on tape, the next room on the work order he walks into is waiting
// for him: the floor is ears, every one of them turned up, and the walls say
// STOP LISTENING TO ME. Among the ears is one of Ellery's own take sheets, the
// form he fills in every night, written over in biro, every field and every
// margin: STOP LISTENING, over and over.
//
// AFTER B3, AND THE NEXT ROOM, NOT A FIXED ONE. B3 is the first real take (the
// get-in's level check is never a take; it files nothing). It has to be a room
// he walks into, and after B3 the plan has no room every route shares; measured
// on the compiled plan, the routes split at the ground spine. The only room he
// is guaranteed to enter is the next one he means to record in, so that is the
// one. Every free candidate is dressed from the moment B3 counts (so the ears
// are visible from the door), and the first one he steps into keeps it.
//
// NEVER TWO TREATMENTS IN ONE ROOM. A room with its own set piece still running
// (the practice wing's metronomes, the pool that comes for you) is not dressed,
// and if he walks into one it is passed over for the night. The ears wait for a
// room that is free. See STOP_LISTENING_TREATMENTS.
//
// THE CHAPEL IS NOT A CANDIDATE. It is the last room on the work order and the
// end of the night; the confrontation, the tower and the inner screen all live
// there, and none of them should have to share a floor with this.
//
// Everything below is in AUTHORED metres, the logical frame the plan is written
// in (see floorplan/conservatory.js). Wall writing stands on the open cell beside
// its wall and names the face it belongs to; the runtime snaps it flush.

// The room whose take arms it.
export const STOP_LISTENING_AFTER = 'main_b3';

// The rooms it can be. Order is irrelevant: the choice is made by walking.
export const STOP_LISTENING_ROOM_IDS = Object.freeze(['the_tub', 'amplifications', 'soundnoisemusic']);

// WHAT ELSE A ROOM MAY BE DOING. A room is busy while any of its treatments is
// live, and a busy room never gets the ears. `while` is a flag condition (the
// game/flags.js grammar); `encounter` is busy until that encounter is cleared.
//
// The signal fights are deliberately not here. Take two in the hall or the wing
// is always a fight, and walking into either before take four is an ambush;
// those belong to the take, not to the room, and counting them would rule out
// every room he could go to second. The practice suite's haunts are not here
// either: they are in the side rooms, and the ears are in the corridor.
export const STOP_LISTENING_TREATMENTS = Object.freeze({
  soundnoisemusic: Object.freeze([
    Object.freeze({ id: 'metronomes', while: '!practice.metronomes.quieted' }),
    Object.freeze({ id: 'student', while: 'practice.student.pending && !practice.student.heard' }),
  ]),
  the_tub: Object.freeze([
    Object.freeze({ id: 'pool', encounter: 'natatorium-approach' }),
  ]),
});

// The prop pack (tools/chunk_surfer/build-stop-listening.mjs). Ears are baked in
// several lying poses because the prop renderer turns an instance about the
// vertical only; heaps are single meshes so a pile can actually pile.
export const STOP_LISTENING_ASSET = 'assets/stop-listening.glb';
// The anatomy starts as a measured adult ear in the Blender authoring file.
// Enlarge that anatomy in the pack, before the small per-instance variation:
// the scattered ears are now roughly half a metre long, not lost as floor grit.
export const STOP_LISTENING_EAR_SCALE = 6.4;
export const STOP_LISTENING_MESH = Object.freeze({
  ears: Object.freeze(['stop_listening_ear_a', 'stop_listening_ear_b', 'stop_listening_ear_c',
    'stop_listening_ear_d', 'stop_listening_ear_e', 'stop_listening_ear_f']),
  heaps: Object.freeze(['stop_listening_heap_a', 'stop_listening_heap_b', 'stop_listening_heap_c']),
  writing: Object.freeze({
    line: 'stop_listening_writing_line',     // STOP LISTENING TO ME, once, large
    block: 'stop_listening_writing_block',   // STOP LISTENING TO ME, four lines
    scrawl: 'stop_listening_writing_scrawl', // STOP LISTENING, smaller, crowding
  }),
  sheet: 'stop_listening_take_sheet',
});

// The sheet's reading image, baked in the same Blender pass as its mesh so the
// thing on the floor and the thing in his hands are one render.
export const STOP_LISTENING_SHEET_DOCUMENT = Object.freeze({
  id: 'stop-listening:take-sheet',
  path: 'assets/paper/inspect/stop-listening-take-sheet.webp',
  format: 'A4',
  issuer: 'ellery-works',
  template: 'take-sheet',
  // Damp, folded once where somebody leaned on it, one corner lifted.
  handlingVector: Object.freeze([0.33, 0.30, 0.22, 0.25]),
});

const field = (x0, x1, y0, y1, count) => Object.freeze({ x0, x1, y0, y1, count });
// Heaps use the same enlarged anatomy. A modest reduction of their assembled
// piles keeps the corridor passable and gives the room genuinely different ear
// sizes, instead of a metre-wide smear being mistaken for a large ear.
const heap = (x, y, mesh, yaw = 0, scale = 1) => Object.freeze({ x, y, mesh, yaw, scale: scale * .82 });
// normal: the room-facing normal of the wall, in plan axes.
// tone: the paint has to read against the wall it is on. Pale on the hall's
// dark oak; dark on the pool's tile and the corridor plaster.
const writing = (x, y, mesh, nx, ny, { elevation = 1.2, standoff = 0, scale = 1, tone = 'dark' } = {}) =>
  Object.freeze({ x, y, mesh: tone === 'pale' ? `${mesh}_pale` : mesh, tone, mountNormal: Object.freeze({ nx, ny }), elevation, standoff, scale });
const voice = (x, y, gain = 1) => Object.freeze({ x, y, gain });

const W = STOP_LISTENING_MESH.writing;
const H = STOP_LISTENING_MESH.heaps;

export const STOP_LISTENING_ROOMS = Object.freeze({
  // The natatorium. In through the glazed pair in the north wall, facing south
  // across five metres of dry deck before the basin.
  the_tub: Object.freeze({
    entry: Object.freeze({ x: 84.0, y: 28.3 }),
    fields: Object.freeze([
      field(77.0, 91.5, 28.4, 32.6, 92),
      field(72.0, 77.4, 29.0, 41.0, 30),
      field(90.0, 95.6, 29.0, 41.0, 30),
    ]),
    heaps: Object.freeze([
      heap(83.4, 30.3, H[0], .2), heap(80.1, 30.6, H[2], -.8), heap(87.2, 30.6, H[1], 1.7),
      heap(74.6, 35.8, H[1], 2.9, .9), heap(92.7, 35.1, H[0], -1.9, .9),
    ]),
    writing: Object.freeze([
      // The west wall has the showers at its north end and the cubicles at its
      // south; the paint goes between them. The north wall keeps the notice
      // board and the first-aid cabinet clear.
      writing(71.5, 34.6, W.line, 1, 0, { elevation: 1.5 }),
      writing(95.5, 30.5, W.line, -1, 0, { elevation: 1.5 }),
      writing(95.5, 36.2, W.scrawl, -1, 0, { elevation: 1.1 }),
      writing(89.8, 28.5, W.block, 0, 1, { elevation: 1.0 }),
      writing(80.8, 28.5, W.scrawl, 0, 1, { elevation: 1.15 }),
    ]),
    sheet: Object.freeze({ x: 84.7, y: 30.7, yaw: -.5 }),
    voices: Object.freeze([voice(83.4, 30.3), voice(74.6, 35.8, .8), voice(92.7, 35.0, .8), voice(83.5, 40.5, .6)]),
  }),
  // The concert hall. Through the vestibule pair in the west wall, straight onto
  // the stepped side aisle under the balcony arm. Heaps sit at terrace centres
  // (global y 19, 23, 27, 31), never across a riser.
  amplifications: Object.freeze({
    entry: Object.freeze({ x: 99.4, y: 24.5 }),
    fields: Object.freeze([
      field(99.1, 102.9, 16.2, 33.8, 96),
    ]),
    heaps: Object.freeze([
      heap(101.2, 22.8, H[0], .6, .9), heap(100.6, 27.0, H[2], .05, .9),
      heap(101.4, 31.0, H[1], 2.0, .85), heap(100.4, 19.0, H[1], -.4, .85),
    ]),
    writing: Object.freeze([
      // The arm's soffit comes down as the rake goes up, so the paint keeps to
      // the front half of the aisle, where the wall is tall, and stands level
      // while the floor climbs under it.
      writing(99.5, 15.2, W.line, 1, 0, { elevation: 1.4, tone: 'pale' }),
      writing(99.5, 19.0, W.block, 1, 0, { elevation: 1.2, tone: 'pale' }),
      writing(99.5, 22.2, W.scrawl, 1, 0, { elevation: .9, tone: 'pale' }),
      writing(99.5, 27.0, W.scrawl, 1, 0, { elevation: .55, tone: 'pale' }),
    ]),
    sheet: Object.freeze({ x: 101.0, y: 25.6, yaw: .9 }),
    voices: Object.freeze([voice(101.2, 23.0), voice(100.6, 27.0, .9), voice(101.4, 31.0, .7), voice(100.4, 19.0, .7)]),
  }),
  // The practice wing. In off the upper landing at the east end of the cross
  // corridor, walking west. Corridors keep their throat clear by rule; nothing
  // here blocks, and the paint is on the walls either side of him.
  soundnoisemusic: Object.freeze({
    entry: Object.freeze({ x: 75.5, y: 54.5 }),
    fields: Object.freeze([
      field(63.2, 75.8, 53.1, 55.9, 96),
    ]),
    heaps: Object.freeze([
      heap(72.4, 55.0, H[0], .05, .9), heap(68.6, 53.65, H[2], .05, .75), heap(65.2, 55.2, H[1], .1, .85),
    ]),
    writing: Object.freeze([
      writing(70.5, 53.5, W.line, 0, 1, { elevation: 1.35 }),
      writing(74.3, 53.5, W.scrawl, 0, 1, { elevation: 1.05 }),
      writing(66.5, 55.5, W.block, 0, -1, { elevation: 1.0 }),
      writing(71.8, 55.5, W.scrawl, 0, -1, { elevation: 1.1 }),
    ]),
    sheet: Object.freeze({ x: 70.7, y: 54.4, yaw: -.25 }),
    voices: Object.freeze([voice(72.4, 54.6), voice(68.6, 53.8, .9), voice(65.2, 55.2, .8)]),
  }),
});

// What he says. The room does most of the talking; he says very little, and
// none of it is the word for what the floor is until he has looked at it.
export const STOP_LISTENING_COPY = Object.freeze({
  // A beat after he is through the door, once the torch has had time to find it.
  arrival: Object.freeze([
    Object.freeze({ who: 'direction', text: 'The floor is ears. Hundreds of them, lying where they were put, and every one of them turned up.' }),
    Object.freeze({ who: 'you', text: 'Those are ears.' }),
  ]),
  heap: Object.freeze({
    first: 'Ears. Left and right, all sizes, cut clean. Wet. Every one of them lies the same way up, open to the room.',
    again: 'All of them turned up. All of them pointed at whoever is standing here.',
  }),
  writing: Object.freeze({
    first: 'Painted on in something that has not finished running. STOP LISTENING TO ME.',
    again: 'STOP LISTENING TO ME.',
  }),
  sheet: Object.freeze({
    label: 'take sheet',
    first: 'One of ours. A W. Ellery take sheet, face up among them.',
    again: 'The take sheet. STOP LISTENING, all the way down.',
  }),
  // After he has read it, once.
  sheetRead: Object.freeze([
    Object.freeze({ who: 'you', text: 'That is our sheet. The one I fill in every night. Every box on it.' }),
    Object.freeze({ who: 'you', text: 'Somebody pressed so hard it went through to the floor.' }),
  ]),
});

// THE SOUND IS REAL RECORDINGS, AND EVERY ONE WAS CHECKED AT ITS SOURCE.
//
// Licence, author and date were read off each file's own page on 2026-10-18 —
// Freesound's sound page, and Commons through the API (extmetadata and the page
// wikitext), never a badge. CC0 and PD-author need no attribution; they are
// credited anyway, because the credits are generated from this list
// (data/credits.js) and an uncredited line here is a line nobody checked.
// Share-alike is refused outright: the Commons borborygmus recordings were all
// CC BY-SA, and the stethoscope bowel recording was CC BY-SA 3.0.
// Full table and the processing chain: third_party/licenses/STOP-LISTENING-AUDIO.md.
const source = (id, title, author, licence, url, role, extra = {}) =>
  Object.freeze({ id, title, author, licence, url, role, ...extra });
export const STOP_LISTENING_SOURCES = Object.freeze([
  source('borygmi-gurgles3', 'gurgles3', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/409857/', 'gut',
    { download: 'https://cdn.freesound.org/previews/409/409857_7821970-hq.mp3' }),
  source('borygmi-gurgles2', 'gurgles2', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/409858/', 'gut',
    { download: 'https://cdn.freesound.org/previews/409/409858_7821970-hq.mp3' }),
  source('borygmi-gurgle1', 'gurgle1', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/409860/', 'gut',
    { download: 'https://cdn.freesound.org/previews/409/409860_7821970-hq.mp3' }),
  source('borygmi-percolating1', 'percolating1', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/414974/', 'gut',
    { download: 'https://cdn.freesound.org/previews/414/414974_7821970-hq.mp3' }),
  source('borygmi-groaning1', 'groaning1', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/414975/', 'gut',
    { download: 'https://cdn.freesound.org/previews/414/414975_7821970-hq.mp3' }),
  source('borygmi-bubbling1', 'bubbling1', 'borygmi', 'CC0', 'https://freesound.org/people/borygmi/sounds/409859/', 'gut',
    { download: 'https://cdn.freesound.org/previews/409/409859_7821970-hq.mp3' }),
  source('christo13-squishing', 'Squishing', 'christo13', 'CC0', 'https://freesound.org/people/christo13/sounds/485484/', 'wet',
    { download: 'https://cdn.freesound.org/previews/485/485484_1807941-hq.mp3' }),
  source('editor-adp-gooey-squish', 'Gooey Squish', 'editor_adp', 'CC0', 'https://freesound.org/people/editor_adp/sounds/269482/', 'wet',
    { download: 'https://cdn.freesound.org/previews/269/269482_2155835-hq.mp3' }),
  source('cabled-mess-wet-sponge', 'Squeezing a big, wet sponge', 'cabled_mess', 'CC0', 'https://freesound.org/people/cabled_mess/sounds/571471/', 'wet',
    { download: 'https://cdn.freesound.org/previews/571/571471_5450487-hq.mp3' }),
  source('starlite-tummy-grumble', 'Tummy Grumble', 'starlite (pdsounds.org)', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Tummy_grumble.ogg', 'gut',
    { download: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Tummy_grumble.ogg' }),
  source('stephan-slime-smacking', 'slime wet smacking', 'stephan (pdsounds.org)', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Slime_wet_smacking.ogg', 'wet',
    { download: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Slime_wet_smacking.ogg' }),
]);

// The processed bank (tools/chunk_surfer/build-stop-listening-audio.mjs).
export const STOP_LISTENING_AUDIO_DIR = 'audio/stop-listening';
