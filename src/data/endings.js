// THE ENDING CONTRACT.
//
// Five terminal endings, declared rather than hand-assembled. Before this file
// existed each ending was a bespoke function body in main.js that built its own
// beat list, picked its own gate variant and set its own lens — three sites doing
// the same job three slightly different ways, which is why four of the five got
// four lines and no presentation at all. Nothing was shared because there was
// nowhere to share it.
//
// So: one entry per terminal id, and the runtime (game/ending-runtime.js) plays
// whatever it finds here. Adding a light going out at 4.2 seconds, or a second
// authored passage for a defeat, is a data change.
//
// The fields are the audit's contract, in order of when the player meets them:
//
//   arrivals     which routes can reach this ending, and what each one is called
//   passage      an authored document played BEFORE the ending, per arrival
//   objective    the physical thing the player does first, if any
//   tree         the authored document the ending itself is
//   hush         what the Surfer is doing while it plays
//   companion    the second recordist's state, where he is present
//   environment  a timeline of world events in seconds from the first line
//   audio        the bed, and one-shots on the same clock
//   image        the frame the ending holds on
//   coda         which gate epilogue closes it
//   residue      what survives into the next run
//
// Timelines are authored in SECONDS FROM THE FIRST LINE, not per-beat, because a
// player reads at their own speed and an ending that only lands if they read at
// ours is an ending that does not land. Anything that must hit an exact line goes
// on the line as a cue instead.

import { ENDING_IDS, POWER_CIRCUIT_IDS } from '../progression/schema.js';
import { endingCutsceneErrors } from '../game/ending-cutscene.js';
import { VIGIL_ENDING_ACTIONS, VIGIL_ENDING_INSERTS, VIGIL_ENDING_OMISSIONS } from './exterior-vigil.js';

// ─────────────────────────────────────────────────────────────────────────────
// ⚠ EVERY SOUND IN EVERY ENDING IS A PLACEHOLDER. ⚠
//
// All nine endings currently play the OPENING TITLE THEME as their bed (see
// STORY_AUDIO in audio/story-audio.js). That is the right stand-in — it is the
// only music the player already associates with this building — and it is the
// wrong final answer, because nine endings that sound the same are eight endings
// that do not land.
//
// This list is the single source of truth for what is still owed. It is printed
// by test/ending-contract.spec.mjs on every `npm test` and shown on the god
// menu's ending rows, so it cannot quietly become permanent. Delete an entry the
// moment its file lands, and the placeholder marker on the ending with it.
// ─────────────────────────────────────────────────────────────────────────────
export const ENDING_AUDIO_TODO = Object.freeze([
  Object.freeze({ id: 'ending.bed.sacrifice', kind: 'bed', seconds: '60-90', note: 'The Seal. Containment: it closes over you, and the last thing to go is your own torch.' }),
  Object.freeze({ id: 'ending.bed.helped', kind: 'bed', seconds: '60-90', note: 'He Tried to Help. The same closing, but somebody outside it was kind and it was not enough.' }),
  Object.freeze({ id: 'ending.bed.inversion', kind: 'bed', seconds: '60-90', note: 'The Other Door. A building coming down, and a yard that is not there.' }),
  Object.freeze({ id: 'ending.bed.drugged', kind: 'bed', seconds: '60-90', note: 'Cold, Bitter, Gone. Ordinary. A car park. Nothing wrong with the light, which is the frightening part.' }),
  Object.freeze({ id: 'ending.bed.surfaced', kind: 'bed', seconds: '60-90', note: 'The Other Recordist. Two of them, on a service road, arriving in the morning.' }),
  Object.freeze({ id: 'ending.bed.contact-won', kind: 'bed', seconds: '45-70', note: 'Open Channel. Source ends; the fatal return leaves forty-one seconds of breath on the recorder.' }),
  Object.freeze({ id: 'ending.bed.contact-lost', kind: 'bed', seconds: '30-55', note: 'No Return. The carrier ends at the fault without a Horizon release.' }),
  Object.freeze({ id: 'ending.bed.tower-won', kind: 'bed', seconds: '60-90', note: 'Exit Through the Gift Shop. Cathedral dust, severed bells, two bodies at an outward door.' }),
  Object.freeze({ id: 'ending.bed.tower-lost', kind: 'bed', seconds: '40-65', note: 'The Full Peal. Six bells complete the return through both bodies.' }),
  Object.freeze({ id: 'ending.strike.first', kind: 'one-shot', seconds: '4-8', note: 'The 06:00 first strike. The demolition landing on the downbeat — the loudest thing in the game.' }),
  Object.freeze({ id: 'ending.room.silent', kind: 'one-shot', seconds: '6-12', note: 'A room going properly silent: the moment the building stops having a signal in it.' }),
  Object.freeze({ id: 'ending.demolition.bed', kind: 'bed', seconds: '30-60', note: 'Demolition, sustained: plant, hydraulics, masonry, at a distance and then not.' }),
  Object.freeze({ id: 'ending.demolition.collapse', kind: 'one-shot', seconds: '8-15', note: 'One span letting go. For the inversion collapse, which is currently lens effects and prose.' }),
]);

// Whether an ending is still using a borrowed bed. Consumed by the god menu and
// the contract spec; flip to false by giving the ending its own track key in
// STORY_AUDIO and removing its entry above.
export const ENDING_AUDIO_IS_PLACEHOLDER = true;

// `tree` is a RESOLVER, not a document id, because several endings are
// currently split across authored variant files — twelve of them for The Seal
// alone, one per (named × injuries 0–5). Collapsing those into one conditional
// document is what the dossier flags are for and it happens per ending; until
// then the resolver points at whichever variant today's rules would have picked,
// so the contract can land without moving a single line of prose.
const variant = (named) => (named ? 'named' : 'unnamed');
const clampInjuries = (n) => Math.max(0, Math.min(5, Math.floor(Number(n) || 0)));

// How the player got here. Every ending can be arrived at more than one way and
// they are not the same story: agreeing to stay, being beaten into staying and
// running out of time while trying to leave were all one silent handoff before.
export const ENDING_ARRIVAL = Object.freeze({
  AGREED: 'agreed',        // you chose it at the picker
  DEFEATED: 'defeated',    // the chapel took the decision off you
  TIMED_OUT: 'timed-out',  // you tried to leave and the clock beat you
  ESCAPED: 'escaped',      // you made both legs
  CARRIED: 'carried',      // you brought somebody out
});
export const ENDING_ARRIVALS = Object.freeze(Object.values(ENDING_ARRIVAL));

// World events a timeline may ask for. The runtime owns what each one DOES; this
// list is the vocabulary an ending is allowed to speak.
export const ENDING_EVENT = Object.freeze({
  LENS: 'lens',            // value: a look profile id
  POSSESS: 'possess',      // value: profile, amount: intensity
  CIRCUIT: 'circuit',      // value: a power circuit id, on: boolean
  TORCH: 'torch',          // on: boolean — the light he owns, taken or kept
  SHAKE: 'shake',          // amount, ms
  FLASH: 'flash',          // ms
  HUSH: 'hush',            // value: 'stage' | 'release'
  CUE: 'cue',              // value: an authored cue id
  VIGIL: 'vigil',          // action, cluster — visible exterior choreography
  // Somebody says something WHILE THE PLAYER IS WALKING. Speech, not a scene:
  // it does not stop the world, because a man carrying another man does not stop
  // walking to be told something. See ARRIVAL_THOUGHTS for the same decision
  // made about the yard.
  SAY: 'say',              // who, text
});

// The gate epilogue each ending closes on. `nobody` and `client` are the two
// readings of staying, and which one you get is the last thing the game decides
// about you: a man who disclosed nothing leaves no account to close.
function sacrificeCoda(dossier) {
  return dossier?.confession?.kind === 'nothing' ? 'nobody' : 'client';
}

// `bed` is a track key in STORY_AUDIO, not an authored cue id: the soundtrack
// slot allows exactly one bed at a time, which is what guarantees an ending's
// music can never overlap the credits piece that follows it.
const bed = (id) => ({ bed: id, placeholder: ENDING_AUDIO_IS_PLACEHOLDER, oneShots: [] });

// ── THE TWENTY-FOUR PEOPLE OUTSIDE ──────────────────────────────────────────
//
// Every ending used to end as though the yard were empty, and after the vigil
// exists that is a lie the endings tell. So each ending's environment timeline
// gets whatever data/exterior-vigil.js authored for it, merged in on the same
// clock and re-sorted, and the endings that are NOT given anything are named
// there rather than merely omitted here.
//
// Viewpoint is literal: only endings with a stable exterior view receive either
// a line or an actor action. Interior, alternate-forecourt and Contact cameras
// never acquire omniscient knowledge of the gathering.
function withVigil(steps, endingId) {
  const inserts = VIGIL_ENDING_INSERTS[endingId]||[],actions=VIGIL_ENDING_ACTIONS[endingId]||[];
  return Object.freeze([...steps,
    ...inserts.map((line)=>Object.freeze({at:line.at,kind:ENDING_EVENT.SAY,who:line.who,text:line.text})),
    ...actions.map((entry)=>Object.freeze({at:entry.at,kind:ENDING_EVENT.VIGIL,action:entry.action,cluster:entry.cluster})),
  ].sort((a,b)=>a.at-b.at));
}

const dialogueSource = (documentId, lineId) => `${documentId}#${lineId}`;
const cutsceneBeat = (id, trigger, fields = {}) => Object.freeze({ id, trigger, ...fields });
const cutscene = ({ endingId, worldAnchors, interactionMode, beats, actors, camera, finalHold, reducedMotion }) => Object.freeze({
  schema: 1,
  endingId,
  worldAnchors: Object.freeze(worldAnchors),
  interactionMode,
  beats: Object.freeze(beats),
  actors: Object.freeze(actors),
  camera: Object.freeze(camera),
  finalHold: Object.freeze(finalHold),
  reducedMotion: Object.freeze(reducedMotion),
});

// Stable scene metadata lives beside the documents it directs. Code owns how a
// grip, camera pullback or world-look override renders; this contract owns when
// it happens and which authored line belongs to that physical beat.
export const ENDING_CUTSCENES = Object.freeze({
  sacrifice: cutscene({
    endingId: 'sacrifice', interactionMode: 'directed',
    worldAnchors: { screen: Object.freeze({ kind: 'prop', id: 'chapel-inner-screen' }), nave: Object.freeze({ kind: 'zone', id: 'chapel' }) },
    actors: { player: 'braced-at-screen', hush: 'staged-beyond-screen', building: 'progressive-collapse' },
    camera: { treatment: 'first-person-impact-chain', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'stepped-debris-and-black-dissolves' },
    finalHold: { image: 'the screen, and no light on it', ms: 2800 },
    beats: [
      cutsceneBeat('warning-horns', 'time', { atMs: 0, cue: 'ending.demolition.horns', dialogue: [dialogueSource('ending.sacrifice', 'start.line.seal')] }),
      cutsceneBeat('first-machine-strike', 'time', { atMs: 2600, cue: 'ending.strike.first', effect: 'remote-impact' }),
      cutsceneBeat('circuit-chain', 'time', { atMs: 5100, effect: 'circuits-fail-toward-chapel', dialogue: [dialogueSource('ending.sacrifice', 'start.line.demolition')] }),
      cutsceneBeat('chapel-span', 'time', { atMs: 7900, cue: 'ending.demolition.collapse', effect: 'deterministic-debris' }),
      cutsceneBeat('view-extinguished', 'time', { atMs: 10400, effect: 'blackout' }),
    ],
  }),
  helped: cutscene({
    endingId: 'helped', interactionMode: 'directed',
    worldAnchors: { screen: Object.freeze({ kind: 'prop', id: 'chapel-inner-screen' }), booth: Object.freeze({ kind: 'prop', id: 'yard-booth-window' }) },
    actors: { player: 'trapped-at-screen', guard: 'remembered-coffee-handoff', building: 'progressive-collapse' },
    camera: { treatment: 'first-person-present-flashback-intercut', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'warm-still-frames-between-impact-dissolves' },
    finalHold: { image: 'a hot drink, hours cold', ms: 2600 },
    beats: [
      cutsceneBeat('present-warning', 'time', { atMs: 0, cue: 'ending.demolition.horns', dialogue: [dialogueSource('ending.helped', 'start.line.realise')] }),
      cutsceneBeat('booth-pour', 'time', { atMs: 1900, effect: 'flashback-booth-pour', dialogue: [dialogueSource('ending.helped', 'start.line.unresolved')] }),
      cutsceneBeat('present-impact', 'time', { atMs: 3900, cue: 'ending.strike.first', effect: 'remote-impact' }),
      cutsceneBeat('booth-handoff', 'time', { atMs: 5700, effect: 'flashback-handoff', dialogue: [dialogueSource('ending.helped', 'start.line.knew')] }),
      cutsceneBeat('first-strike-cuts-memory', 'time', { atMs: 7900, cue: 'ending.demolition.collapse', effect: 'flashback-cut-to-black' }),
    ],
  }),
  inversion: cutscene({
    endingId: 'inversion', interactionMode: 'walk',
    worldAnchors: { frontDoors: Object.freeze({ kind: 'door', id: 'front-main' }), forecourt: Object.freeze({ kind: 'zone', id: 'front-atrium-exterior' }) },
    actors: { player: 'walking-into-morning', staff: 'arriving-behind-heras', bus: 'first-service' },
    camera: { treatment: 'first-person-door-to-forecourt', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'continuous-player-look-with-stepped-ambient-traffic' },
    finalHold: { image: 'wet municipal dawn beyond the conservatoire doors', ms: 2600 },
    beats: [
      cutsceneBeat('cross-front-doors', 'position', { anchor: 'frontDoors', radius: 3, worldLook: 'dawn-0600', dialogue: [dialogueSource('ending.inversion', 'start.line.1')] }),
      cutsceneBeat('sodium-off', 'time', { atMs: 1200, cue: 'ending.dawn.sodium-off', effect: 'sodium-shutdown' }),
      cutsceneBeat('birds-and-bus', 'time', { atMs: 3100, cue: 'ending.dawn.first-bus', effect: 'birds-bus-arrival' }),
      cutsceneBeat('demolition-shift-arrives', 'time', { atMs: 5600, effect: 'staff-behind-heras', dialogue: [dialogueSource('ending.inversion', 'out.line.6')] }),
      cutsceneBeat('ordinary-morning', 'time', { atMs: 8000, dialogue: [dialogueSource('ending.inversion', 'out.line.8')] }),
    ],
  }),
  drugged: cutscene({
    endingId: 'drugged', interactionMode: 'inspect',
    worldAnchors: { driverSeat: Object.freeze({ kind: 'prop', id: 'ending-van-driver-seat' }), cup: Object.freeze({ kind: 'prop', id: 'ending-van-cup' }), headphones: Object.freeze({ kind: 'prop', id: 'ending-van-headphones' }) },
    actors: { player: 'waking-in-driver-seat', guard: 'absent', building: 'visible-through-rain' },
    camera: { treatment: 'first-person-seated-inspection', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'fixed-seat-look-and-instant-hand-poses' },
    finalHold: { image: 'headphones lowered in a rain-streaked van at 05:00', ms: 2400 },
    beats: [
      cutsceneBeat('wake-in-van', 'time', { atMs: 0, worldLook: 'van-rain-0500', cue: 'ending.van.rain', dialogue: [dialogueSource('ending.drugged', 'start.line.1')] }),
      cutsceneBeat('inspect-kit', 'interaction', { action: 'inspect-kit', dialogue: [dialogueSource('ending.drugged', 'tape.kit.line.1')] }),
      cutsceneBeat('inspect-cup', 'interaction', { action: 'inspect-cup', dialogue: [dialogueSource('ending.drugged', 'tape.cup.line.1')] }),
      cutsceneBeat('inspect-recorder', 'interaction', { action: 'inspect-recorder', dialogue: [dialogueSource('ending.drugged', 'tape.takes.line.1')] }),
      cutsceneBeat('remove-headphones', 'interaction', { action: 'remove-headphones', cue: 'ending.van.headphones-off', dialogue: [dialogueSource('ending.drugged', 'out.line.8')] }),
    ],
  }),
  surfaced: cutscene({
    endingId: 'surfaced', interactionMode: 'carry',
    worldAnchors: { publicDoors: Object.freeze({ kind: 'door', id: 'front-main' }), serviceRoad: Object.freeze({ kind: 'zone', id: 'service-road' }), gateLedger: Object.freeze({ kind: 'prop', id: 'yard-booth-guard-ledger' }) },
    actors: { player: 'carrying-alan', alan: 'carried-speaking', guard: 'opens-returned-ledger' },
    camera: { treatment: 'first-person-carry-to-ledger', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'stable-head-bob-and-stepped-writing-hand' },
    finalHold: { image: 'both names drying in the RETURNED column', ms: 3000 },
    beats: [
      cutsceneBeat('through-public-doors', 'position', { anchor: 'publicDoors', radius: 3, dialogue: [dialogueSource('ending.surfaced', 'start.line.1')] }),
      cutsceneBeat('service-road', 'position', { anchor: 'serviceRoad', radius: 5, optionalAction: 'ask-alan', dialogue: [dialogueSource('ending.surfaced', 'start.line.8')] }),
      cutsceneBeat('gate-ledger', 'position', { anchor: 'gateLedger', radius: 2.5, dialogue: [dialogueSource('ending.surfaced', 'out.line.1')] }),
      cutsceneBeat('write-player-name', 'interaction', { action: 'sign-returned-player', dialogue: [dialogueSource('ending.surfaced', 'out.line.5')] }),
      cutsceneBeat('write-alan-name', 'interaction', { action: 'sign-returned-alan', dialogue: [dialogueSource('ending.surfaced', 'out.line.8')] }),
    ],
  }),
  'contact-won': cutscene({
    endingId: 'contact-won', interactionMode: 'directed',
    worldAnchors: { sourceFault: Object.freeze({ kind: 'source', id: 'final-carrier' }), returnWall: Object.freeze({ kind: 'position', id: 'source-return-wall' }), recorder: Object.freeze({ kind: 'equipment', id: 'recorder' }) },
    actors: { player: 'seated-folded-dying', source: 'collapsing-hallucination', recorder: 'open-channel' },
    camera: { treatment: 'first-person-return-and-bodily-failure', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'source-dissolve-to-fixed-body-failure-poses' },
    finalHold: { image: 'a dead hand beside a recorder on OPEN CHANNEL', ms: 4100 },
    beats: [
      cutsceneBeat('source-collapse', 'time', { atMs: 0, effect: 'source-collapse', dialogue: [dialogueSource('ending.contact-won', 'start.line.1')] }),
      cutsceneBeat('return-to-wall', 'time', { atMs: 1800, worldLook: 'conservatoire-0600', effect: 'restore-return-point' }),
      cutsceneBeat('look-at-failing-hands', 'time', { atMs: 3900, effect: 'body-control-failure', dialogue: [dialogueSource('ending.contact-won', 'start.line.5')] }),
      cutsceneBeat('final-radio', 'interaction', { action: 'final-radio-transmission', cue: 'ending.contact.radio', dialogue: [dialogueSource('ending.contact-won', 'start.line.8')] }),
      cutsceneBeat('open-channel-death', 'time', { atMs: 7200, cue: 'ending.contact.breath', effect: 'body-still', dialogue: [dialogueSource('ending.contact-won', 'start.line.9')] }),
    ],
  }),
  'contact-lost': cutscene({
    endingId: 'contact-lost', interactionMode: 'directed',
    worldAnchors: { player: Object.freeze({ kind: 'source', id: 'defeated-player' }), farField: Object.freeze({ kind: 'source', id: 'endless-architecture' }) },
    actors: { player: 'defeated-static', source: 'persistent', camera: 'detached' },
    camera: { treatment: 'third-person-continuous-source-pullback', allowsLook: false, pullback: true },
    reducedMotion: { treatment: 'eight-fixed-pullback-plates-with-dissolves' },
    finalHold: { image: 'a tiny lost figure inside an endless surviving Source', ms: 3600 },
    beats: [
      cutsceneBeat('camera-detaches', 'time', { atMs: 0, effect: 'camera-detach', dialogue: [dialogueSource('ending.contact-lost', 'start.line.1')] }),
      cutsceneBeat('first-pullback', 'time', { atMs: 1800, cameraScale: 1.8 }),
      cutsceneBeat('architecture-repeats', 'time', { atMs: 3900, cameraScale: 4.5, dialogue: [dialogueSource('ending.contact-lost', 'start.line.5')] }),
      cutsceneBeat('carrier-persists', 'time', { atMs: 6200, cameraScale: 12 }),
      cutsceneBeat('no-return-wide', 'time', { atMs: 8800, cameraScale: 32, dialogue: [dialogueSource('ending.contact-lost', 'start.line.9')] }),
    ],
  }),
  'tower-won': cutscene({
    endingId: 'tower-won', interactionMode: 'drag',
    worldAnchors: { collapsedSurfer: Object.freeze({ kind: 'actor', id: 'ellery-student-surfer' }), nave: Object.freeze({ kind: 'room', id: 'nave' }), westDoors: Object.freeze({ kind: 'door', id: 'brendan-west-door' }) },
    actors: { player: 'dragging-regrippable', surfer: 'collapsed-real-collision', bells: 'severed' },
    camera: { treatment: 'first-person-weighted-extraction', allowsLook: true, pullback: false },
    reducedMotion: { treatment: 'stable-camera-with-discrete-body-follow-poses' },
    finalHold: { image: 'two bodies outside the ceremonial west doors at dawn', ms: 3000 },
    beats: [
      cutsceneBeat('grip-surfer', 'interaction', { action: 'grip-surfer', dialogue: [dialogueSource('ending.tower-won', 'start.line.1')] }),
      cutsceneBeat('drag-through-nave', 'position', { anchor: 'nave', radius: 6, cue: 'ending.body.cloth-drag', dialogue: [dialogueSource('ending.tower-won', 'start.line.4')] }),
      cutsceneBeat('west-threshold', 'position', { anchor: 'westDoors', radius: 3, cue: 'ending.body.threshold', effect: 'threshold-regrip' }),
      cutsceneBeat('open-west-doors', 'interaction', { action: 'open-west-doors', worldLook: 'cathedral-dawn', dialogue: [dialogueSource('ending.tower-won', 'start.line.8')] }),
      cutsceneBeat('ordinary-weight', 'time', { atMs: 4200, dialogue: [dialogueSource('ending.tower-won', 'start.line.10')] }),
    ],
  }),
  'tower-lost': cutscene({
    endingId: 'tower-lost', interactionMode: 'directed',
    worldAnchors: { crossing: Object.freeze({ kind: 'zone', id: 'crossing' }), surfer: Object.freeze({ kind: 'actor', id: 'ellery-student-surfer' }) },
    actors: { player: 'progressively-synchronized', surfer: 'progressively-synchronized', bells: 'six-strike-possession' },
    camera: { treatment: 'first-person-loss-then-final-third-person-wide', allowsLook: false, pullback: true },
    reducedMotion: { treatment: 'six-held-body-poses-and-final-dissolve-wide' },
    finalHold: { image: 'two bodies standing in the same impossible rhythm beneath six bells', ms: 3600 },
    beats: [
      cutsceneBeat('strike-one-breath', 'time', { atMs: 0, cue: 'ending.bell.1', effect: 'sync-breath', dialogue: [dialogueSource('ending.tower-lost', 'start.line.1')] }),
      cutsceneBeat('strike-two-hands', 'time', { atMs: 1450, cue: 'ending.bell.2', effect: 'sync-hands' }),
      cutsceneBeat('strike-three-posture', 'time', { atMs: 2900, cue: 'ending.bell.3', effect: 'sync-posture', dialogue: [dialogueSource('ending.tower-lost', 'start.line.4')] }),
      cutsceneBeat('strike-four-look', 'time', { atMs: 4350, cue: 'ending.bell.4', effect: 'take-look' }),
      cutsceneBeat('strike-five-movement', 'time', { atMs: 5800, cue: 'ending.bell.5', effect: 'take-movement' }),
      cutsceneBeat('strike-six-full-peal', 'time', { atMs: 7250, cue: 'ending.bell.6', effect: 'final-wide', dialogue: [dialogueSource('ending.tower-lost', 'start.line.9')] }),
    ],
  }),
});

export const ENDING_MANIFEST = Object.freeze({
  // ── THE SEAL ───────────────────────────────────────────────────────────────
  // Containment. You stay, and the demolition is the seal. The only ending whose
  // last image is the building rather than the outside of it.
  sacrifice: Object.freeze({
    id: 'sacrifice',
    title: 'The Seal',
    classification: 'containment',
    arrivals: Object.freeze([ENDING_ARRIVAL.AGREED, ENDING_ARRIVAL.DEFEATED, ENDING_ARRIVAL.TIMED_OUT]),
    passage: Object.freeze({
      [ENDING_ARRIVAL.DEFEATED]: 'ending.arrival.defeated',
      [ENDING_ARRIVAL.TIMED_OUT]: 'ending.arrival.timed-out',
    }),
    // THE WALK BACK TO THE SCREEN IS THE ENDING'S ONE PLAYABLE IMAGE.
    //
    // It existed and it was a waypoint: you walked to a cell and a scene opened.
    // The building is closing while he does it, and it closes BEHIND him — one
    // circuit at a time, in the order he came, so the way out goes dark first and
    // he is walking toward the only thing still lit. Seconds are from the moment
    // the objective is set.
    objective: Object.freeze({
      kind: 'walk', to: 'chapel-screen', label: 'chapel screen',
      timeline: Object.freeze([
        Object.freeze({ at: 3.0, kind: ENDING_EVENT.SAY, who: 'you', text: 'Every light behind me has just gone.' }),
        Object.freeze({ at: 9.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp03', on: false }),
        Object.freeze({ at: 16.0, kind: ENDING_EVENT.SAY, who: 'direction', text: 'The corridor you came down is not dark. It is closed, which is a different thing, and you can hear the difference.' }),
        Object.freeze({ at: 22.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp02', on: false }),
        Object.freeze({ at: 34.0, kind: ENDING_EVENT.SAY, who: 'you', text: 'It is not chasing me. It is just shutting doors.' }),
      ]),
    }),
    tree: 'ending.sacrifice',
    hush: 'staged',
    companion: null,
    // It closes over you one circuit at a time, and then it takes your torch. The
    // last thing to go is the light you brought in yourself.
    environment: withVigil([
      Object.freeze({ at: 0.0, kind: ENDING_EVENT.LENS, value: 'battle' }),
      Object.freeze({ at: 6.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp01', on: false }),
      Object.freeze({ at: 11.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp02', on: false }),
      Object.freeze({ at: 14.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp04', on: false }),
      Object.freeze({ at: 16.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp03', on: false }),
      Object.freeze({ at: 18.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp05', on: false }),
      Object.freeze({ at: 21.0, kind: ENDING_EVENT.HUSH, value: 'stage' }),
      Object.freeze({ at: 27.0, kind: ENDING_EVENT.TORCH, on: false }),
      Object.freeze({ at: 28.0, kind: ENDING_EVENT.POSSESS, value: 'rupture', amount: 3 }),
    ], 'sacrifice'),
    audio: Object.freeze(bed('ending.sacrifice')),
    image: 'the screen, and no light on it',
    coda: sacrificeCoda,
    residue: 'sealed-ledger',
    cutscene: ENDING_CUTSCENES.sacrifice,
  }),

  // ── HE TRIED TO HELP ───────────────────────────────────────────────────────
  // Intervention. The same staying, read through a paper cup. This is the
  // guard's ending and it is the one he is in.
  helped: Object.freeze({
    id: 'helped',
    title: 'He Tried to Help',
    classification: 'intervention',
    arrivals: Object.freeze([ENDING_ARRIVAL.AGREED, ENDING_ARRIVAL.DEFEATED, ENDING_ARRIVAL.TIMED_OUT]),
    passage: Object.freeze({
      [ENDING_ARRIVAL.DEFEATED]: 'ending.arrival.defeated',
      [ENDING_ARRIVAL.TIMED_OUT]: 'ending.arrival.timed-out',
    }),
    objective: Object.freeze({
      kind: 'walk', to: 'chapel-screen', label: 'chapel screen',
      timeline: Object.freeze([
        Object.freeze({ at: 4.0, kind: ENDING_EVENT.SAY, who: 'you', text: 'The taste is still there. Eight hours and it is still there.' }),
        Object.freeze({ at: 14.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp03', on: false }),
        Object.freeze({ at: 26.0, kind: ENDING_EVENT.SAY, who: 'you', text: 'He is still on that gate. He will still be on it at six.' }),
      ]),
    }),
    tree: 'ending.helped',
    hush: 'staged',
    companion: null,
    // Warmer and slower than the seal. Something in it was kind.
    environment: withVigil([
      Object.freeze({ at: 0.0, kind: ENDING_EVENT.LENS, value: 'battle' }),
      Object.freeze({ at: 8.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp01', on: false }),
      Object.freeze({ at: 15.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp02', on: false }),
      Object.freeze({ at: 18.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp04', on: false }),
      Object.freeze({ at: 21.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp05', on: false }),
      Object.freeze({ at: 22.0, kind: ENDING_EVENT.HUSH, value: 'stage' }),
      Object.freeze({ at: 30.0, kind: ENDING_EVENT.LENS, value: 'calm' }),
    ], 'helped'),
    audio: Object.freeze(bed('ending.helped')),
    image: 'a hot drink, hours cold',
    coda: () => 'helped',
    residue: 'operator-annotation',
    cutscene: ENDING_CUTSCENES.helped,
  }),

  // ── THE OTHER DOOR ─────────────────────────────────────────────────────────
  // Inversion. Two playable legs and a door that is not where the door is. The
  // most developed ending already; the collapse is what it is missing.
  inversion: Object.freeze({
    id: 'inversion',
    title: 'The Other Door',
    classification: 'inversion',
    arrivals: Object.freeze([ENDING_ARRIVAL.ESCAPED]),
    passage: Object.freeze({}),
    objective: Object.freeze({
      kind: 'escape', legs: Object.freeze(['door', 'rescue']),
      // THE COLLAPSE, CHOREOGRAPHED. It was lens presets and prose: the building
      // was said to be failing and nothing in the room agreed. This runs under
      // both legs and escalates, so the last twenty seconds of the run are loud.
      timeline: Object.freeze([
        Object.freeze({ at: 2.0, kind: ENDING_EVENT.SHAKE, amount: 0.8, ms: 700 }),
        Object.freeze({ at: 7.0, kind: ENDING_EVENT.SAY, who: 'direction', text: 'Something structural lets go a long way below you and arrives through the floor rather than through the air.' }),
        Object.freeze({ at: 11.0, kind: ENDING_EVENT.SHAKE, amount: 1.4, ms: 900 }),
        Object.freeze({ at: 17.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp01', on: false }),
        Object.freeze({ at: 23.0, kind: ENDING_EVENT.SHAKE, amount: 2.1, ms: 1200 }),
        Object.freeze({ at: 24.0, kind: ENDING_EVENT.FLASH, ms: 180 }),
        Object.freeze({ at: 25.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp04', on: false }),
        Object.freeze({ at: 31.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp02', on: false }),
        Object.freeze({ at: 34.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp05', on: false }),
        Object.freeze({ at: 36.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp03', on: false }),
        Object.freeze({ at: 38.0, kind: ENDING_EVENT.SHAKE, amount: 2.6, ms: 1400 }),
      ]),
    }),
    tree: 'ending.inversion',
    hush: 'gone',
    companion: null,
    environment: Object.freeze([
      Object.freeze({ at: 0.0, kind: ENDING_EVENT.LENS, value: 'rupture' }),
      Object.freeze({ at: 4.0, kind: ENDING_EVENT.SHAKE, amount: 1.2, ms: 900 }),
      Object.freeze({ at: 9.0, kind: ENDING_EVENT.SHAKE, amount: 2.0, ms: 1400 }),
      Object.freeze({ at: 14.0, kind: ENDING_EVENT.FLASH, ms: 220 }),
      Object.freeze({ at: 20.0, kind: ENDING_EVENT.POSSESS, value: 'rupture', amount: 5 }),
    ]),
    audio: Object.freeze(bed('ending.inversion')),
    image: 'wet municipal dawn beyond the conservatoire doors',
    coda: () => 'out',
    residue: 'engineering-appendix',
    cutscene: ENDING_CUTSCENES.inversion,
  }),

  // ── COLD, BITTER, GONE ─────────────────────────────────────────────────────
  // Contamination. The same escape, read as eight hours of nothing. The one
  // ending that must not adjudicate itself.
  drugged: Object.freeze({
    id: 'drugged',
    title: 'Cold, Bitter, Gone',
    classification: 'contamination',
    arrivals: Object.freeze([ENDING_ARRIVAL.ESCAPED]),
    passage: Object.freeze({}),
    objective: Object.freeze({
      kind: 'escape', legs: Object.freeze(['door', 'rescue']),
      // THE COLLAPSE, CHOREOGRAPHED. It was lens presets and prose: the building
      // was said to be failing and nothing in the room agreed. This runs under
      // both legs and escalates, so the last twenty seconds of the run are loud.
      timeline: Object.freeze([
        Object.freeze({ at: 2.0, kind: ENDING_EVENT.SHAKE, amount: 0.8, ms: 700 }),
        Object.freeze({ at: 7.0, kind: ENDING_EVENT.SAY, who: 'direction', text: 'Something structural lets go a long way below you and arrives through the floor rather than through the air.' }),
        Object.freeze({ at: 11.0, kind: ENDING_EVENT.SHAKE, amount: 1.4, ms: 900 }),
        Object.freeze({ at: 17.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp01', on: false }),
        Object.freeze({ at: 23.0, kind: ENDING_EVENT.SHAKE, amount: 2.1, ms: 1200 }),
        Object.freeze({ at: 24.0, kind: ENDING_EVENT.FLASH, ms: 180 }),
        Object.freeze({ at: 25.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp04', on: false }),
        Object.freeze({ at: 31.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp02', on: false }),
        Object.freeze({ at: 34.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp05', on: false }),
        Object.freeze({ at: 36.0, kind: ENDING_EVENT.CIRCUIT, value: 'sp03', on: false }),
        Object.freeze({ at: 38.0, kind: ENDING_EVENT.SHAKE, amount: 2.6, ms: 1400 }),
      ]),
    }),
    tree: 'ending.drugged',
    hush: 'gone',
    companion: null,
    // It comes down, all the way down, to an ordinary car park. Nothing is
    // wrong with the light out here and that is the frightening part.
    environment: withVigil([
      Object.freeze({ at: 0.0, kind: ENDING_EVENT.LENS, value: 'explore' }),
      Object.freeze({ at: 12.0, kind: ENDING_EVENT.LENS, value: 'calm' }),
    ], 'drugged'),
    audio: Object.freeze(bed('ending.drugged')),
    image: 'headphones lowered in a rain-streaked van at 05:00',
    coda: () => 'drugged',
    residue: 'contaminant-report',
    cutscene: ENDING_CUTSCENES.drugged,
  }),

  // ── THE OTHER RECORDIST ────────────────────────────────────────────────────
  // Extraction. The hardest route in the game and it should be the longest
  // ending. You are carrying somebody, so it goes at carrying pace.
  surfaced: Object.freeze({
    id: 'surfaced',
    title: 'The Other Recordist',
    classification: 'extraction',
    arrivals: Object.freeze([ENDING_ARRIVAL.CARRIED]),
    passage: Object.freeze({}),
    // THE CARRY, AT CARRYING PACE, WITH HIM TALKING.
    //
    // `pace` divides into the move interval (see currentMoveIntervalMs): 0.58 is
    // a man walking a hundred metres with another man over his shoulder. The walk
    // was the same speed as an empty-handed one, which made the hardest route in
    // the game end with a brisk stroll. He talks while you do it — as speech, not
    // as a scene, because you do not stop walking to be told something.
    objective: Object.freeze({
      kind: 'carry', to: 'main-exit', label: 'main entrance', pace: 0.58,
      timeline: Object.freeze([
        Object.freeze({ at: 4.0, kind: ENDING_EVENT.SAY, who: 'recordist', text: 'Left at the end. Not the stairs. I know what the stairs are for.' }),
        Object.freeze({ at: 15.0, kind: ENDING_EVENT.SAY, who: 'recordist', text: 'You can put me down. I am saying that for you, not for me. I would rather you did not.' }),
        Object.freeze({ at: 28.0, kind: ENDING_EVENT.SAY, who: 'recordist', text: 'It has stopped asking. Do you hear that? It has been asking for eleven weeks and it has stopped.' }),
        Object.freeze({ at: 42.0, kind: ENDING_EVENT.SAY, who: 'you', text: 'Keep talking. Whatever you have got. Just keep talking.' }),
        Object.freeze({ at: 56.0, kind: ENDING_EVENT.SAY, who: 'recordist', text: 'Take one. Room tone, studio B3, and a man breathing who is not going to be here in the morning. That was mine. That was my slate.' }),
      ]),
    }),
    tree: 'ending.surfaced',   // authored in §3; hard-coded in chunk-surf-script.js until then
    hush: 'silent',
    companion: 'carried',
    environment: withVigil([
      Object.freeze({ at: 0.0, kind: ENDING_EVENT.LENS, value: 'explore' }),
      Object.freeze({ at: 18.0, kind: ENDING_EVENT.LENS, value: 'calm' }),
    ], 'surfaced'),
    audio: Object.freeze(bed('ending.surfaced')),
    image: 'both names drying in the RETURNED column',
    coda: () => 'surfaced',
    residue: 'other-recordist',
    cutscene: ENDING_CUTSCENES.surfaced,
  }),

  'contact-won': Object.freeze({
    id: 'contact-won', title: 'Open Channel', classification: 'contact-victory',
    family: 'contact', arrivals: Object.freeze([ENDING_ARRIVAL.AGREED]), passage: Object.freeze({}),
    objective: null, tree: 'ending.contact-won', hush: 'open', companion: null,
    environment: Object.freeze([
      Object.freeze({at:0,kind:ENDING_EVENT.LENS,value:'rupture'}),
      Object.freeze({at:12,kind:ENDING_EVENT.LENS,value:'explore'}),
    ]),
    audio: Object.freeze(bed('ending.contact-won')),
    image: 'a dead hand beside a recorder on OPEN CHANNEL',
    coda: ()=>'contact-won', residue: 'open-channel-log',
    cutscene: ENDING_CUTSCENES['contact-won'],
  }),

  'contact-lost': Object.freeze({
    id: 'contact-lost', title: 'No Return', classification: 'contact-terminal',
    family: 'contact', arrivals: Object.freeze([ENDING_ARRIVAL.DEFEATED]), passage: Object.freeze({}),
    objective: null, tree: 'ending.contact-lost', hush: 'terminal', companion: null,
    environment: Object.freeze([
      Object.freeze({at:0,kind:ENDING_EVENT.LENS,value:'battle'}),
      Object.freeze({at:7,kind:ENDING_EVENT.FLASH,ms:240}),
      Object.freeze({at:8,kind:ENDING_EVENT.TORCH,on:false}),
    ]),
    audio: Object.freeze(bed('ending.contact-lost')),
    image: 'a tiny lost figure inside an endless surviving Source',
    coda: ()=>'contact-lost', residue: 'no-return-notice',
    cutscene: ENDING_CUTSCENES['contact-lost'],
  }),

  'tower-won': Object.freeze({
    id: 'tower-won', title: 'Exit Through the Gift Shop', classification: 'tower-extraction',
    family: 'tower', arrivals: Object.freeze([ENDING_ARRIVAL.CARRIED]), passage: Object.freeze({}),
    objective: null, tree: 'ending.tower-won', hush: 'severed', companion: 'carried',
    environment: withVigil([
      Object.freeze({at:0,kind:ENDING_EVENT.LENS,value:'explore'}),
      Object.freeze({at:16,kind:ENDING_EVENT.LENS,value:'calm'}),
    ], 'tower-won'),
    audio: Object.freeze(bed('ending.tower-won')),
    image: 'two bodies outside the ceremonial west doors at dawn',
    coda: ()=>'tower-won', residue: 'cathedral-return-sheet',
    cutscene: ENDING_CUTSCENES['tower-won'],
  }),

  'tower-lost': Object.freeze({
    id: 'tower-lost', title: 'The Full Peal', classification: 'tower-terminal',
    family: 'tower', arrivals: Object.freeze([ENDING_ARRIVAL.DEFEATED]), passage: Object.freeze({}),
    objective: null, tree: 'ending.tower-lost', hush: 'terminal', companion: 'lost',
    environment: withVigil([
      Object.freeze({at:0,kind:ENDING_EVENT.SHAKE,amount:2.6,ms:1600}),
      Object.freeze({at:1.2,kind:ENDING_EVENT.FLASH,ms:220}),
      Object.freeze({at:9,kind:ENDING_EVENT.LENS,value:'rupture'}),
    ], 'tower-lost'),
    audio: Object.freeze(bed('ending.tower-lost')),
    image: 'two bodies standing in the same impossible rhythm beneath six bells',
    coda: ()=>'tower-lost', residue: 'full-peal-report',
    cutscene: ENDING_CUTSCENES['tower-lost'],
  }),
});

export function endingManifest(id) {
  return ENDING_MANIFEST[id] || null;
}

// Which gate epilogue closes this ending. Kept here rather than in main.js so the
// ending owns its own last page.
export function endingCodaVariant(id, dossier = null) {
  const manifest = endingManifest(id);
  if (!manifest) return 'out';
  return typeof manifest.coda === 'function' ? manifest.coda(dossier) : String(manifest.coda || 'out');
}

// The authored passage that plays BEFORE the ending, for the arrival that
// reached it. Empty for the arrivals that are the ending's own front door.
export function endingArrivalPassage(id, arrival) {
  return endingManifest(id)?.passage?.[arrival] || null;
}

// Every terminal id has an entry, and every entry declares at least one arrival.
// Asserted by test/ending-contract.spec.mjs; exported so the studio validator and
// the god menu can enumerate without importing the whole manifest.
export function endingContractErrors() {
  const errors = [];
  for (const id of ENDING_IDS) {
    const m = ENDING_MANIFEST[id];
    if (!m) { errors.push(`${id} has no manifest entry`); continue; }
    if (!m.arrivals?.length) errors.push(`${id} declares no arrival`);
    for (const arrival of m.arrivals || []) {
      if (!ENDING_ARRIVALS.includes(arrival)) errors.push(`${id} declares unknown arrival ${arrival}`);
    }
    for (const arrival of Object.keys(m.passage || {})) {
      if (!m.arrivals.includes(arrival)) errors.push(`${id} has a passage for ${arrival}, which cannot reach it`);
    }
    // Both clocks: the ending's own, and the objective's, which runs while the
    // player is still walking.
    for (const [where, steps] of [['environment', m.environment], ['objective', m.objective?.timeline]]) {
      for (const step of steps || []) {
        if (!Object.values(ENDING_EVENT).includes(step.kind)) errors.push(`${id} ${where} timeline uses unknown event ${step.kind}`);
        if (!Number.isFinite(step.at) || step.at < 0) errors.push(`${id} ${where} timeline step ${step.kind} has no time`);
        if (step.kind === ENDING_EVENT.SAY && !String(step.text || '').trim()) errors.push(`${id} ${where} timeline has a SAY with nothing to say`);
        if (step.kind === ENDING_EVENT.CIRCUIT && !POWER_CIRCUIT_IDS.includes(step.value)) errors.push(`${id} ${where} timeline switches unknown circuit ${step.value}`);
        if (step.kind === ENDING_EVENT.CIRCUIT && typeof step.on !== 'boolean') errors.push(`${id} ${where} timeline switches ${step.value} neither on nor off`);
        if (step.kind === ENDING_EVENT.VIGIL && (!String(step.action || '').trim() || !String(step.cluster || '').trim())) errors.push(`${id} ${where} timeline has an incomplete vigil action`);
      }
    }
    if (m.objective && !['walk', 'carry', 'escape'].includes(m.objective.kind)) {
      errors.push(`${id} declares an objective of unknown kind ${m.objective.kind}`);
    }
    if (!m.tree) errors.push(`${id} names no authored document`);
    if (!m.residue) errors.push(`${id} leaves nothing behind`);
    errors.push(...endingCutsceneErrors(m.cutscene));
    if (m.cutscene?.endingId !== id) errors.push(`${id} cutscene belongs to ${m.cutscene?.endingId || 'nobody'}`);
    if (m.cutscene?.finalHold?.image !== m.image) errors.push(`${id} cutscene final image disagrees with its manifest image`);
  }
  for (const id of Object.keys(ENDING_MANIFEST)) {
    if (!ENDING_IDS.includes(id)) errors.push(`${id} is a manifest entry that is not a terminal ending`);
  }
  // EVERY ENDING HAS DECIDED ABOUT THE PEOPLE OUTSIDE.
  //
  // Either it says what the vigil is doing, or it is on the list of endings that
  // deliberately cannot see them. Silence by omission is the failure this
  // catches: an ending added later would otherwise quietly go back to ending in
  // an empty yard.
  for (const id of Object.keys(VIGIL_ENDING_INSERTS)) {
    if (!ENDING_IDS.includes(id)) errors.push(`the vigil has an insert for ${id}, which is not a terminal ending`);
    if (VIGIL_ENDING_OMISSIONS.includes(id)) errors.push(`${id} both omits and receives a vigil insert`);
  }
  for (const id of VIGIL_ENDING_OMISSIONS) {
    if (!ENDING_IDS.includes(id)) errors.push(`the vigil omits ${id}, which is not a terminal ending`);
  }
  for (const id of ENDING_IDS) {
    const decided = !!VIGIL_ENDING_INSERTS[id] || VIGIL_ENDING_OMISSIONS.includes(id);
    if (!decided) errors.push(`${id} says nothing about the vigil and is not on the omission list`);
  }
  return errors;
}
