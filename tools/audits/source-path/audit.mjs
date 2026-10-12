// The source space path. `npm run source:audit` is the page; `npm run source:path`
// prints the same thing and fails if it no longer matches the code.
//
// Source space is the one part of the game that is a ROUTE rather than a
// building: a single walk that forks twice and ends at one of three roads. Its
// shape is spread across a state reducer, a five-thousand-line runtime, a level
// file measured in cells and a main.js hand-off per exit, and nobody can hold
// the whole walk in their head from any one of them.
//
// So this page is a DESCRIPTION, like src/data/ending-gates.js: every stage says
// what it is in ordinary words, and every claim that can drift is tied to the
// code that enforces it — cited as text, never as a line number. What it checks
// is the thing a description is worst at: COVERAGE. Every phase, every finale
// stage and every recorder note the game can show must belong to some stage
// here, so a new stretch of source space cannot be added without the page going
// red until somebody says where it sits on the walk.
//
// Nothing here writes to disk.

import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ROOT, citationReader } from '../shared.mjs';
import { auditById } from '../registry.mjs';
import { PUZZLES } from '../puzzles/audit.mjs';

import { CELL } from '../../../src/data/floorplan/legend.js';
import { SCENE_DOCK_LABEL } from '../../../src/data/space-labels.js';
import { SOURCE_SHORE_DIRECT_METRES, SOURCE_SHORE_DIRECT_SECONDS } from '../../../src/data/source-hanging-shore.js';
import {
  SOURCE_APPROACH_CELLS, SOURCE_BELLS, SOURCE_BELL_PASSAGE, SOURCE_CHAPEL_OUTSKIRTS, SOURCE_CHUTES,
  SOURCE_FIELD_TIERS, SOURCE_HORIZON, SOURCE_LANDMARK_TIER, SOURCE_NOTHING_LENGTH, SOURCE_OUTSKIRTS_LENGTH,
  SOURCE_PRE_TAPE, SOURCE_TIERS, SOURCE_TIER_BY_ID,
} from '../../../src/data/source-level.js';
import { OUTSKIRT_BEATS, OUTSKIRT_PASSES, OUTSKIRT_REPEAT_COUNT, OUTSKIRT_ROAD_END } from '../../../src/data/source-outskirts-arrival.js';
import { CHAPEL_WORLD_SET, ELSEWHERE_CROSSING_SECONDS } from '../../../src/data/elsewhere-worlds.js';
import { ENDING_FAMILY, ENDING_GATES } from '../../../src/data/ending-gates.js';
import {
  CATHEDRAL_ALARM_CEILING, CATHEDRAL_DAMAGE_MARKS, CHUNK_SURF_PHASE, SOURCE_FINALE_STAGE, TOWER_DEFEAT_CEILING,
} from '../../../src/game/chunk-surf-state.js';
import { CHUNK_SURF_GOD_PRESET } from '../../../src/game/chunk-surf-god.js';
import { HORIZON_TRANSPORT_DIALS, HORIZON_TRANSPORT_LABELS } from '../../../src/game/horizon-transport.js';
import { SOURCE_CONTACT_TALKS_REQUIRED } from '../../../src/game/source-contact.js';
import { SOURCE_HALL_END_METRES, SOURCE_HAYSTACK } from '../../../src/game/source-haystack.js';
import { SOURCE_TRANSFORM_SECONDS } from '../../../src/game/source-space-runtime.js';
import { SOURCE_TRACE_OBJECTIVE_IDS, sourceTraceNote } from '../../../src/game/source-trace.js';
import { ENDING_IDS } from '../../../src/progression/schema.js';

const RUNTIME = 'src/game/source-space-runtime.js';
const STATE = 'src/game/chunk-surf-state.js';
const LEVEL = 'src/data/source-level.js';
const MAIN = 'src/main.js';
const at = (file, symbol) => ({ file, symbol });
const P = CHUNK_SURF_PHASE;
const S = SOURCE_FINALE_STAGE;
const G = CHUNK_SURF_GOD_PRESET;

const number = (value) => (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10));
// Source coordinates are runtime cells. Both are printed, because the code's own
// comments use both words for the same numbers.
const cells = (value) => `${number(value)} cells · ${number(value * CELL)} m`;

// Constants the runtime keeps to itself. Read out of the file rather than typed
// again, so the page shows the number the game is actually using.
const CODE_CONSTANTS = Object.freeze({
  bustDepth: 'HORIZON_BUST_DEPTH',
  doorCount: 'ROUTE_DOOR_FIELD_COUNT',
  keyDoors: 'TOWER_KEY_DOORS',
  closeBehind: 'EDGE_DOOR_CLOSE_BEHIND',
  takeBackSeconds: 'TAKE_BACK_SECONDS',
});

// The groups the page is read in. `lane` is which road a stage belongs to.
export const SECTIONS = Object.freeze([
  { id: 'in', title: 'Getting in', blurb: 'From the building to the Hanging Shore. Everyone walks this, in this order.' },
  { id: 'field', title: 'The field', blurb: 'The tiered landscape, and the page at the top of it where the road forks for the first time.' },
  { id: 'contact', title: 'The Contact road', blurb: 'Stay and fight at the fault. It ends the run either way and never reaches the tape.' },
  { id: 'away', title: 'Walking away', blurb: 'Through the grey doors and out to the tape, where the bust forks the road a second time.' },
  { id: 'tower', title: 'The tower road', blurb: 'The bust’s detour: the bells, a field of doors, and St Brendan’s.' },
  { id: 'chapel', title: 'The chapel road', blurb: 'Straight on past the end of the tape to the chapel’s own door.' },
]);

export const LANES = Object.freeze({
  shared: 'Everyone walks this',
  contact: 'Contact road',
  away: 'Walking away',
  tower: 'Tower road',
  chapel: 'Chapel road',
});

// ── the stages ──────────────────────────────────────────────────────────────
//
// In walking order. `span` is how long the stage is in cells, or null when it is
// a moment rather than a distance. `road` marks the stage a road's endings hang
// off. `presets` are god-menu presets (reached with __probe.sourcePreset), `jump`
// is any other probe that stands you there.
export const STAGES = Object.freeze([
  {
    id: 'hall', section: 'in', lane: 'shared', short: 'Hall', title: 'The long hall of paper',
    where: 'Straight in from the building: a corridor of pages.',
    happens: 'You walk. The pages change the further in you get, and the rain starts. Nothing stops you.',
    moveOn: `Walk ${number(SOURCE_HALL_END_METRES)} metres in.`,
    callouts: [{ kind: 'note', text: 'There is no save point in the hall itself. The first one is at the still page.' }],
    phases: [P.HALL], finale: [S.UNCOMMITTED], objectives: ['long-hall'], checkpoints: [],
    next: [{ to: 'haystack', when: `after ${number(SOURCE_HALL_END_METRES)} m` }],
    span: () => SOURCE_HALL_END_METRES / CELL,
    measure: () => [['Length', cells(SOURCE_HALL_END_METRES / CELL)]],
    cites: [
      ['How you arrive', at(MAIN, "{type:'SOURCE_ENTERED'")],
      ['What moves you on', at(RUNTIME, "type: 'HAYSTACK_REACHED'")],
      ['The rule it passes', at(STATE, "case 'HAYSTACK_REACHED':")],
    ],
    presets: [G.HALL_ENTRY, G.HALL_STORM], jump: [], puzzles: [],
    specs: ['test/source-hall-boundary.spec.mjs', 'test/source-corridor.spec.mjs'],
  },
  {
    id: 'haystack', section: 'in', lane: 'shared', short: 'Still page', title: 'The still page',
    where: 'The end of the hall, where the pages pile up.',
    happens: 'Every page moves except one. The pressure rises while you look for it, and your step slows as it does.',
    moveOn: 'Read the page that is not moving.',
    callouts: [{ kind: 'saves', text: 'Saved as the haystack entry the moment you arrive.' }],
    phases: [P.HAYSTACK], finale: [S.UNCOMMITTED], objectives: ['still-page'], checkpoints: ['haystack-entry'],
    next: [{ to: 'crossing', when: 'when you read the still page' }],
    span: () => null,
    measure: () => [
      ['Pressure', `${SOURCE_HAYSTACK.entryPressure} on arrival, up to ${SOURCE_HAYSTACK.maxPressure}`],
      ['Takes', `${SOURCE_HAYSTACK.riseSeconds}s to rise`],
    ],
    cites: [
      ['What moves you on', at(RUNTIME, "type: 'HAYSTACK_PAGE_FOUND'")],
      ['The rule it passes', at(STATE, "case 'HAYSTACK_PAGE_FOUND':")],
    ],
    presets: [G.HAYSTACK], jump: [], puzzles: ['haystack'],
    specs: ['test/source-haystack.spec.mjs'],
  },
  {
    id: 'crossing', section: 'in', lane: 'shared', short: 'Crossing', title: 'The crossing',
    where: 'Between the still page and the Scene Dock.',
    happens: 'A short passage the game plays for you. There is nothing to do.',
    moveOn: `Nothing — it finishes on its own after ${number(SOURCE_TRANSFORM_SECONDS)} seconds.`,
    callouts: [{ kind: 'saves', text: 'Saved as the landing arrival. A reload during the crossing lands you on the far side of it.' }],
    phases: [P.TRANSFORMING], finale: [S.UNCOMMITTED], objectives: [], checkpoints: ['landing-arrival'],
    next: [{ to: 'scene-dock', when: 'automatically' }],
    span: () => null,
    measure: () => [['Lasts', `${number(SOURCE_TRANSFORM_SECONDS)}s`]],
    cites: [
      ['What moves you on', at(RUNTIME, "dispatch({ type: 'TRANSFORMATION_COMPLETED' }")],
      ['The rule it passes', at(STATE, "case 'TRANSFORMATION_COMPLETED': {")],
      ['A reload in the middle of it', at(MAIN, "normalized=reduceChunkSurf(normalized,{type:'TRANSFORMATION_COMPLETED'});")],
    ],
    presets: [], jump: [], puzzles: [],
    specs: ['test/source-sensory-release.spec.mjs', 'test/source-space-chapter.spec.mjs'],
  },
  {
    id: 'scene-dock', section: 'in', lane: 'shared', short: 'Scene Dock', title: `The ${SCENE_DOCK_LABEL.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}`,
    where: 'A loading dock standing in the white, with its front-of-house door shut.',
    happens: 'You open the door, leave the dock, and step out through the opening into the white.',
    moveOn: 'Open the FOH door and step through the opening.',
    callouts: [{ kind: 'note', text: 'Once the door has been sealed behind you it does not open again, even after a reload.' }],
    phases: [P.LANDSCAPE], finale: [S.UNCOMMITTED], objectives: ['open-foh-door', 'leave-get-in', 'white-threshold'], checkpoints: [],
    next: [{ to: 'white-walk', when: 'through the opening' }],
    span: () => null,
    measure: () => [['Shown as', SCENE_DOCK_LABEL]],
    cites: [
      ['What moves you on', at(RUNTIME, "dispatch({ type: 'SOURCE_LANDING_DOOR_OPENED' }")],
      ['The rule it passes', at(STATE, "case 'SOURCE_LANDING_DOOR_OPENED':")],
    ],
    presets: [G.LANDING], jump: [], puzzles: [],
    specs: ['test/source-scene-dock.spec.mjs', 'test/source-landing.spec.mjs'],
  },
  {
    id: 'white-walk', section: 'in', lane: 'shared', short: 'Hanging Shore', title: 'The first nothingness and the Hanging Shore',
    where: 'Between the remembered get-in room and a finite receiving bank, both standing without apparent foundations.',
    happens: 'White exposure recovers into a pale field while the body keeps moving. The room and bank stay fixed; there is no visible walking surface or path lighting. The bank’s deck lowers and waits. Boarding raises the body to its exterior ledge; stepping off loses elevation safely.',
    moveOn: `Walk the direct ${number(SOURCE_SHORE_DIRECT_METRES)} m to the deck, ride up, and turn behind the bank into Source proper.`,
    callouts: [{ kind: 'note', text: 'Sideways movement, circling and returning to the room do not advance a hidden distance quota. The carried torch remains a physical light.' }],
    phases: [P.LANDSCAPE], finale: [S.UNCOMMITTED], objectives: ['white-walk', 'first-stair'], checkpoints: [],
    next: [{ to: 'field', when: 'around the opaque turn behind the receiving ledge' }],
    span: () => SOURCE_SHORE_DIRECT_METRES / CELL,
    measure: () => [['Length', cells(SOURCE_SHORE_DIRECT_METRES / CELL)], ['Direct ordinary walk', `${number(SOURCE_SHORE_DIRECT_SECONDS)} s`]],
    cites: [
      ['The fixed shores and body elevation', at(RUNTIME, 'function sourceShoreFrame() {')],
      ['What moves you on', at(RUNTIME, "dispatch({type:'SOURCE_APPROACH_COMPLETED'")],
      ['The rule it passes', at(STATE, "case 'SOURCE_APPROACH_COMPLETED':")],
    ],
    presets: [], jump: [], puzzles: [],
    specs: ['test/source-approach.spec.mjs', 'test/source-hanging-shore.spec.mjs'],
  },
  {
    id: 'field', section: 'field', lane: 'shared', short: 'The field', title: 'The field',
    where: `${SOURCE_FIELD_TIERS.length} tiers of ground joined by staircases, with the building’s source code standing on them as text.`,
    happens: 'The HUSH is already out there when you arrive, and starts hunting once you climb the first stair. Talking to it is how the fight at the top becomes possible. The landmarks stand on the tiers; none of them is required.',
    moveOn: 'Reach the final page, on the top tier.',
    callouts: [
      { kind: 'gate', text: `The fight at the final page is only offered after ${SOURCE_CONTACT_TALKS_REQUIRED} talks with the HUSH, face to face or on the radio.` },
      { kind: 'saves', text: 'Every tier you climb onto saves a checkpoint.' },
    ],
    phases: [P.LANDSCAPE], finale: [S.UNCOMMITTED], objectives: ['final-horizon'], checkpoints: [],
    next: [{ to: 'final-page', when: 'standing at the final page' }],
    span: () => SOURCE_TIER_BY_ID.arrival.from - SOURCE_TIER_BY_ID.return.to - SOURCE_APPROACH_CELLS,
    measure: () => [
      ...SOURCE_FIELD_TIERS.map((tier) => [`Tier: ${tier.id}`, `${cells(tier.from - tier.to)} · ${number(tier.height)} m up`]),
      ['Staircases', String(SOURCE_CHUTES.length)],
      ['Landmarks', Object.entries(SOURCE_LANDMARK_TIER).map(([id, tier]) => `${id} (${tier})`).join(' · ')],
      ['Talks before the fight', String(SOURCE_CONTACT_TALKS_REQUIRED)],
    ],
    cites: [
      ['The first stair', at(RUNTIME, "dispatch({ type: 'SOURCE_LIFT_COMPLETED', id: 'lift-fork', checkpointId }")],
      ['What moves you on', at(RUNTIME, "dispatch({ type: 'FINAL_REACHED' }")],
      ['The rule it passes', at(STATE, "case 'FINAL_REACHED':")],
      ['How many talks', at('src/game/source-contact.js', 'export const SOURCE_CONTACT_TALKS_REQUIRED')],
    ],
    presets: [G.FIRST_LIFT, G.FIRST_CONTACT, G.ALL_INSIGHTS, G.LANDSCAPE, G.HUNT, G.FINAL_RUN], jump: [], puzzles: ['source-contact'],
    specs: ['test/source-level.spec.mjs', 'test/source-traversal.spec.mjs', 'test/source-space-chapter.spec.mjs', 'test/source-contact.spec.mjs'],
  },
  {
    id: 'final-page', section: 'field', lane: 'shared', short: 'Final page', title: 'The final page, and the transport',
    where: 'The far edge of the top tier, beside the grey doors.',
    happens: 'The transport has to be threaded before anything else happens. Then the road forks: stay and fight the thing at the fault, or walk away through the grey doors.',
    moveOn: 'Thread the transport, then choose.',
    callouts: [
      { kind: 'gate', text: 'The transport is threaded first, on both roads. Until it is, neither road opens.' },
      { kind: 'fork', text: 'Fight at the fault (Contact), or walk away. Walking away is always open; the fight only when the talks allow it.' },
      { kind: 'saves', text: 'Saved as the final page.' },
    ],
    phases: [P.FINAL], finale: [S.UNCOMMITTED], objectives: ['normal-exit', 'return-paths'], checkpoints: ['final-page'],
    next: [
      { to: 'contact', when: 'commit to the fight', branch: true },
      { to: 'grey-doors', when: 'walk away' },
    ],
    span: () => null,
    measure: () => [['Transport dials', HORIZON_TRANSPORT_DIALS.map((dial) => HORIZON_TRANSPORT_LABELS[dial] || dial).join(' · ')]],
    cites: [
      ['The transport comes first', at(RUNTIME, 'if (!horizonTransport.threaded) {')],
      ['Choosing the fight', at(RUNTIME, 'function commitContact() {')],
      ['Choosing to walk away', at(RUNTIME, 'function completeNormalExit() {')],
    ],
    presets: [G.FINAL, G.NORMAL_EXIT], jump: [], puzzles: ['horizon-transport', 'redaction'],
    specs: ['test/horizon-transport.spec.mjs', 'test/source-finale-routes.spec.mjs'],
  },
  {
    id: 'contact', section: 'contact', lane: 'contact', short: 'Contact', title: 'Contact: the fight at the fault',
    where: 'At the fault by the final page.',
    happens: 'A fight you commit to before it starts. Win or lose, the run ends here.',
    moveOn: 'Commit, then win or lose the fight.',
    callouts: [
      { kind: 'no-return', text: 'Committing is final. This road never reaches the tape, so the chapel and the tower are gone.' },
      { kind: 'note', text: 'Losing here ends the run too. It is not a way back onto the other roads.' },
    ],
    phases: [P.FINAL, P.COMPLETED], finale: [S.CONTACT_COMMITTED, S.RESOLVED], objectives: [], checkpoints: [],
    next: [{ to: 'ending:contact', when: 'win or lose' }],
    road: 'contact',
    span: () => null,
    measure: () => [['Talks it takes to be offered', String(SOURCE_CONTACT_TALKS_REQUIRED)]],
    cites: [
      ['The commitment', at(STATE, "case 'CONTACT_COMMITTED':")],
      ['Winning', at(RUNTIME, 'function resolveFinalEncounter(result = {}) {')],
      ['Losing', at(STATE, "case 'FINAL_ENCOUNTER_LOST':")],
      ['Into the ending', at(MAIN, 'function beginContactEnding(completion,finalState){')],
    ],
    presets: [G.EXPOSED_BATTLE], jump: [], puzzles: ['source-contact'],
    specs: ['test/source-contact-runtime.spec.mjs', 'test/source-finale-routes.spec.mjs'],
  },
  {
    id: 'grey-doors', section: 'away', lane: 'away', short: 'Grey doors', title: 'The grey goods doors',
    where: 'The edge of the field. Nothing else at the edge lets you across.',
    happens: 'You open them and walk through, and they shut behind you once you are clear.',
    moveOn: 'Walk through the open doors.',
    callouts: [
      { kind: 'can-return', text: 'Until you have spoken to the bust on the tape, walking back through puts you in the field again.' },
      { kind: 'saves', text: 'Saved as the landing horizon.' },
    ],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: [], checkpoints: ['landing-horizon'],
    next: [
      { to: 'nothing', when: 'through the doors' },
      { to: 'field', when: 'back, until the bust has had its answer', back: true },
    ],
    span: () => null,
    measure: (k) => [['Shut behind you after', `${number(k.closeBehind)} cells`]],
    cites: [
      ['Opening them', at(RUNTIME, 'function openEdgeDoor(')],
      ['Walking through', at(RUNTIME, 'const result=completeNormalExit();')],
      ['The rule it passes', at(STATE, "case 'SOURCE_NORMAL_EXIT': {")],
      ['Going back', at(RUNTIME, "dispatch({type:'SOURCE_FIELD_RETURNED'},{immediate:true});")],
    ],
    presets: [], jump: [{ probe: 'walkToEdgeDoor', call: '__probe.walkToEdgeDoor()' }, { probe: 'openEdgeDoor', call: '__probe.openEdgeDoor()' }], puzzles: [],
    specs: ['test/source-edge-door.spec.mjs'],
  },
  {
    id: 'nothing', section: 'away', lane: 'away', short: 'Still', title: 'The still ground',
    where: 'Just past the grey doors: dark, dry ground with nothing standing on it.',
    happens: 'Silence, and the doors shutting behind you. The picture on the horizon is a long way off, and the first lamps of a road stand ahead.',
    moveOn: 'Walk on until the road starts under you.',
    callouts: [{ kind: 'note', text: 'The recording has not started. Everything out here plays at second zero of the tape.' }],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: ['horizon-walk'], checkpoints: [],
    next: [{ to: 'arrival-night', when: 'where the road starts' }],
    span: () => SOURCE_NOTHING_LENGTH,
    measure: () => [['Length', cells(SOURCE_NOTHING_LENGTH)]],
    cites: [['Its length', at(LEVEL, 'export const SOURCE_NOTHING_LENGTH')]],
    presets: [], jump: [{ probe: 'preTapePreset', call: '__probe.preTapePreset(0)' }], puzzles: [],
    specs: ['test/source-outskirts.spec.mjs'],
  },
  {
    id: 'arrival-night', section: 'away', lane: 'away', short: 'The road', title: 'The same scene, over and over',
    where: 'Outside the bay, the night you arrived: the lodge, the lamps, the shelter, the bus, the van. One short scene, passed again and again for about a kilometre.',
    happens: 'Every pass is the same scene, a little more worn than the last — lamps out, pieces missing, everything further off true — and more likely to break badly: mirrored, stuttering, everyone turned toward you, the bus across the road, the road gone.',
    moveOn: 'Keep walking. The road runs out a short walk from the head of the tape.',
    callouts: [{ kind: 'note', text: 'It rains on the road, and only on the road.' }],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: ['horizon-walk'], checkpoints: [],
    next: [{ to: 'tape', when: 'at the head of the tape' }],
    span: () => SOURCE_OUTSKIRTS_LENGTH,
    measure: () => [
      ['Length', cells(SOURCE_OUTSKIRTS_LENGTH)],
      ['The road', `${OUTSKIRT_REPEAT_COUNT} passes of the same scene, ending ${number(OUTSKIRT_ROAD_END)} m along`],
      ['Passes that break', `${OUTSKIRT_PASSES.filter((pass) => pass.break).length} of ${OUTSKIRT_PASSES.length}: ${OUTSKIRT_PASSES.filter((pass) => pass.break).map((pass) => `${pass.k + 1} ${pass.break}`).join(', ')}`],
      ['Scripted moments', String(OUTSKIRT_BEATS.length)],
    ],
    cites: [
      ['The layout and its moments', at('src/data/source-outskirts-arrival.js', 'export const OUTSKIRT_BEATS')],
      ['How each pass wears and breaks', at('src/data/source-outskirts-arrival.js', 'export const OUTSKIRT_PASSES')],
      ['Its length', at(LEVEL, 'export const SOURCE_OUTSKIRTS_LENGTH')],
    ],
    presets: [], jump: [{ probe: 'preTapePreset', call: `__probe.preTapePreset(${SOURCE_NOTHING_LENGTH + 12})` }], puzzles: [],
    specs: ['test/source-outskirts.spec.mjs'],
  },
  {
    id: 'tape', section: 'away', lane: 'away', short: 'The tape', title: 'The tape',
    where: 'The recording, laid out as ground.',
    happens: 'Where you stand is where the recording is: stop and it stops, walk back and it runs backwards. The bust stands a way in, and talking to it decides the road.',
    moveOn: 'Accept the bust and follow the path it cuts to the tower. Otherwise walk to the end of the tape, which puts you on the chapel road.',
    callouts: [
      { kind: 'fork', text: 'The bust decides the road. Accepting leads to the tower; anything else, and the end of the tape leads to the chapel.' },
      { kind: 'gate', text: 'The bust only offers the tower if you carry what it asks about (the marble eyes). Otherwise it declines for you.' },
      { kind: 'no-return', text: 'Once the bust has had its answer, the grey doors stay locked behind you.' },
      { kind: 'note', text: 'Walk off the side of the band and you are put back near the head of the tape.' },
    ],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: ['horizon-walk'], checkpoints: [],
    next: [
      { to: 'bell-passage', when: 'accept the bust, then take its path', branch: true },
      { to: 'chapel-outskirts', when: 'at the end of the tape' },
    ],
    span: () => SOURCE_HORIZON.length,
    measure: (k) => [
      ['Length', cells(SOURCE_HORIZON.length)],
      ['The recording', `${number(SOURCE_HORIZON.tapeSeconds)}s`],
      ['The bust stands', `${number(k.bustDepth)} cells in`],
    ],
    cites: [
      ['Position is time', at(LEVEL, 'export function sourceHorizonSeconds(y) {')],
      ['Whether the bust offers the tower', at(RUNTIME, 'function talkToHorizonBust() {')],
      ['The decision', at(STATE, "case 'HORIZON_BUST_DECIDED': {")],
      ['Onto the tower road', at(RUNTIME, 'chooseHorizonExit(HORIZON_EXIT.TOWER);')],
      ['Onto the chapel road', at(RUNTIME, 'chooseHorizonExit(HORIZON_EXIT.CHAPEL);')],
      ['The rule it passes', at(STATE, "case 'HORIZON_EXIT_CHOSEN': {")],
    ],
    presets: [], jump: [{ probe: 'horizonPreset', call: '__probe.horizonPreset(0)' }], puzzles: [],
    specs: ['test/horizon.spec.mjs', 'test/horizon-bust.spec.mjs', 'test/horizon-score.spec.mjs', 'test/source-horizon-recovery.spec.mjs'],
  },
  {
    id: 'bell-passage', section: 'tower', lane: 'tower', short: 'Bell passage', title: 'The bell passage',
    where: 'Past the tape on the tower road: the chapel ring’s eight bells, at every size.',
    happens: 'Three stretches — huge half-sunk bells, miniatures ringing much too fast, then all eight at their true size ringing rounds. Brushing bells makes noise.',
    moveOn: 'Walk through to the door field.',
    callouts: [
      { kind: 'note', text: 'Too much noise from the bells puts you back at a quiet point further up the passage.' },
      { kind: 'saves', text: 'Saved as the bells entry.' },
    ],
    phases: [P.BELLS], finale: [S.TOWER_COMMITTED], objectives: ['bell-field'], checkpoints: ['bells-entry'],
    next: [{ to: 'tower-doors', when: 'at the hedges' }],
    span: () => SOURCE_BELLS.from - SOURCE_BELLS.doors.from,
    measure: () => [
      ['Length', cells(SOURCE_BELLS.from - SOURCE_BELLS.doors.from)],
      ['Bells standing in it', String(SOURCE_BELL_PASSAGE.length)],
      ['Quiet points', String(SOURCE_BELLS.checkpoints.length)],
    ],
    cites: [
      ['What stands in it', at(LEVEL, 'export const SOURCE_BELL_PASSAGE = Object.freeze([')],
      ['Its extent', at(LEVEL, 'export const SOURCE_BELLS = Object.freeze({')],
    ],
    presets: [], jump: [{ probe: 'bellsPreset', call: '__probe.bellsPreset(0)' }], puzzles: [],
    specs: ['test/source-bell-passage.spec.mjs', 'test/source-bell-field.spec.mjs'],
  },
  {
    id: 'tower-doors', section: 'tower', lane: 'tower', short: 'Door field', title: 'The tower’s door field',
    where: 'A corridor of free-standing doors between hedges, in the rain, before the belfry.',
    happens: 'Most doors open onto somewhere else, and walking through one erases it. Two of them, chosen per run and not marked, are what unlock the tower door.',
    moveOn: 'Open and walk through both key doors, then go to the tower door.',
    callouts: [
      { kind: 'gate', text: 'The tower door stays locked until both key doors have been walked through. Nothing tells you which they are.' },
      { kind: 'note', text: 'Shut doors stay shut, and answer you when you try them.' },
    ],
    phases: [P.BELLS], finale: [S.TOWER_COMMITTED], objectives: ['bell-field'], checkpoints: [],
    next: [{ to: 'tower-door', when: 'once it is unlocked' }],
    span: () => SOURCE_BELLS.doors.from - SOURCE_BELLS.doors.to,
    measure: (k) => [
      ['Length', cells(SOURCE_BELLS.doors.from - SOURCE_BELLS.doors.to)],
      ['Doors', String(k.doorCount)],
      ['Key doors among them', String(k.keyDoors)],
    ],
    cites: [
      ['How many keys', at(RUNTIME, 'const TOWER_KEY_DOORS')],
      ['Opening a door', at(RUNTIME, "dispatch({ type: 'ROUTE_DOOR_OPENED', id }")],
      ['The rule it passes', at(STATE, "case 'ROUTE_DOOR_OPENED': {")],
    ],
    presets: [],
    jump: [
      { probe: 'bellsPreset', call: `__probe.bellsPreset(${SOURCE_BELLS.from - SOURCE_BELLS.doors.from})` },
      { probe: 'sourceTowerKeys', call: '__probe.sourceTowerKeys()' },
    ],
    puzzles: [],
    specs: ['test/source-elsewhere.spec.mjs'],
  },
  {
    id: 'tower-door', section: 'tower', lane: 'tower', short: 'Tower door', title: 'Through the tower door',
    where: 'The missing wall of St Brendan’s belfry, at the end of the door field.',
    happens: 'The doorway already shows the real belfry, so walking through it is walking in, with no cut. Source space ends here.',
    moveOn: 'Walk through.',
    callouts: [],
    phases: [P.BELLS, P.COMPLETED], finale: [S.TOWER_COMMITTED], objectives: ['tower-crossing'], checkpoints: [],
    next: [{ to: 'cathedral', when: 'one step on' }],
    span: () => null,
    measure: () => [['The belfry room', `${number(SOURCE_BELLS.room.halfX * 2)} × ${number(SOURCE_BELLS.room.halfZ * 2)} m`]],
    cites: [
      ['What moves you on', at(RUNTIME, 'function enterBellsRoom() {')],
      ['The rule it passes', at(STATE, "case 'BELLS_ROOM_ENTERED': {")],
      ['Out of source space', at(MAIN, 'function restoreFromSourceSpace(completion,exitSnapshot){')],
    ],
    presets: [], jump: [], puzzles: [],
    specs: ['test/source-finale-routes.spec.mjs', 'test/source-elsewhere.spec.mjs'],
  },
  {
    id: 'cathedral', section: 'tower', lane: 'tower', short: 'St Brendan’s', title: 'St Brendan’s: down, fight, carry out',
    where: 'The real belfry and nave of St Brendan’s, in the building.',
    happens: 'A long forced descent, a fight staged across the crossing that leaves the church damaged, then the escape at dawn.',
    moveOn: 'Win the fight and finish the escape.',
    callouts: [
      { kind: 'note', text: `Lose the fight and you are sent back to try again. The ${TOWER_DEFEAT_CEILING === 3 ? 'third' : `number ${TOWER_DEFEAT_CEILING}`} loss ends the run.` },
      { kind: 'note', text: 'Ringing bells on the way down raises the alarm. Arriving without having rung any gives you a head start in the fight.' },
    ],
    phases: [P.COMPLETED], finale: [S.CATHEDRAL, S.CATHEDRAL_FIGHT, S.TOWER_ESCAPE, S.RESOLVED], objectives: [], checkpoints: [],
    next: [
      { to: 'ending:tower', when: 'escape, or the last loss' },
      { to: 'cathedral', when: 'lose, below the limit', back: true },
    ],
    road: 'tower',
    span: () => null,
    measure: () => [
      ['Losses before it ends', String(TOWER_DEFEAT_CEILING)],
      ['Alarm tops out at', String(CATHEDRAL_ALARM_CEILING)],
      ['Damage it can show', CATHEDRAL_DAMAGE_MARKS.join(' · ')],
    ],
    cites: [
      ['Arriving', at(MAIN, "{type:'CATHEDRAL_ENTERED'}")],
      ['Losing', at(STATE, "case 'CATHEDRAL_FIGHT_LOST': {")],
      ['Getting out', at(MAIN, "{type:'TOWER_ESCAPE_COMPLETED'}")],
    ],
    presets: [], jump: [{ probe: 'cathedralPreset', call: "__probe.cathedralPreset('entry')" }], puzzles: [],
    specs: ['test/church.spec.mjs', 'test/source-finale-routes.spec.mjs'],
  },
  {
    id: 'chapel-outskirts', section: 'chapel', lane: 'chapel', short: 'Past the tape', title: 'Past the end of the tape',
    where: 'Straight on from the tape’s last frame.',
    happens: 'The recording has run out. Across the black to either side stand the road’s lamps, phone boxes and the building. Each look brings them closer, up to a line they cannot cross; their sound comes through as if through a thick wall.',
    moveOn: 'Walk into the planted corridor of doors. The far edges can be looked at, but never reached.',
    callouts: [{ kind: 'saves', text: 'Saved as the chapel outskirts.' }],
    phases: [P.CHAPEL_OUTSKIRTS], finale: [S.CHAPEL_COMMITTED], objectives: ['chapel-doors'], checkpoints: ['chapel-outskirts'],
    next: [{ to: 'chapel-station', when: 'the first doors and hedges appear' }],
    span: () => SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom,
    measure: () => [
      ['Length', cells(SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom)],
    ],
    cites: [
      ['Its extent', at(LEVEL, 'export const SOURCE_CHAPEL_OUTSKIRTS = Object.freeze({')],
      ['The edges that come nearer', at(RUNTIME, 'function stationEdgeInstances(')],
      ['Looking at the edges', at(RUNTIME, 'function stationEdgeFocus(')],
      ['Sound through the wall', at(MAIN, 'function syncStationEdgeSound(')],
    ],
    presets: [], jump: [{ probe: 'chapelOutskirtsPreset', call: '__probe.chapelOutskirtsPreset(0)' }], puzzles: [],
    specs: ['test/source-elsewhere.spec.mjs', 'test/source-trace.spec.mjs'],
  },
  {
    id: 'chapel-station', section: 'chapel', lane: 'chapel', short: 'The station', title: 'The station’s doors and what they leave',
    where: 'The planted corridor after the black approach, before the chapel’s oak pair.',
    happens: 'The first touch looks at a door: which one it was in the building and what comes under it now. The next tries it. Open doors reveal six different worlds; locked ones may knock or try the handle back. Crossing spends a few seconds in the world, then it takes its door back and leaves a readable scar. Doors hanging beyond the hedges can only be looked at.',
    moveOn: 'Explore as many doors as you want, then walk on to the chapel. The five found objects offer an optional way home through the snow.',
    callouts: [
      { kind: 'note', text: 'No field door is required for the chapel handoff. The relics and the way home are optional.' },
      { kind: 'note', text: 'Opening and crossing are different actions. Each of the five worlds beside whiteout leaves one kind of object; repeated copies do not add another.' },
    ],
    phases: [P.CHAPEL_OUTSKIRTS], finale: [S.CHAPEL_COMMITTED], objectives: ['chapel-doors'], checkpoints: [],
    next: [{ to: 'chapel-home', when: 'optional: gather something from all five other worlds, then cross into whiteout', branch: true }, { to: 'chapel-door', when: 'continue past the doors' }],
    span: () => SOURCE_CHAPEL_OUTSKIRTS.doorsFrom - SOURCE_CHAPEL_OUTSKIRTS.doorsTo,
    measure: (k) => [
      ['Length', cells(SOURCE_CHAPEL_OUTSKIRTS.doorsFrom - SOURCE_CHAPEL_OUTSKIRTS.doorsTo)],
      ['Field doors', String(k.doorCount)],
      ['Worlds', String(CHAPEL_WORLD_SET.length)],
      ['Ordinary crossing', `${number(ELSEWHERE_CROSSING_SECONDS)} s`],
      ['Door taken back', `${number(k.takeBackSeconds)} s, then an outline and a scar`],
    ],
    cites: [
      ['Every world has a door that opens', at(RUNTIME, 'const worldSet = route')],
      ['Door inspections', at(MAIN, 'function openDoorFieldLook(')],
      ['A crossing and its acquired object', at(MAIN, 'function syncStationErrand(')],
      ['Taking the door back', at(RUNTIME, 'function doorTakeBack(')],
      ['The scar that stays', at(RUNTIME, 'function doorScarFocus(')],
      ['The inaccessible doors', at(RUNTIME, 'function doorFieldExtras(')],
    ],
    presets: [], jump: [{ probe: 'chapelOutskirtsPreset', call: `__probe.chapelOutskirtsPreset(${SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom})` }], puzzles: [],
    specs: ['test/source-outskirts.spec.mjs', 'test/source-elsewhere.spec.mjs', 'test/bag-items.spec.mjs'],
  },
  {
    id: 'chapel-home', section: 'chapel', lane: 'chapel', short: 'The way home', title: 'The optional way home through the snow',
    where: 'A whiteout door in the station, while carrying the cinder, shell, upward-falling pebble, matchbox of sand and glass shard.',
    happens: 'The five objects together are cold toward the snow. This whiteout crossing stays open for a long walk to one lit window. It is the childhood kitchen; Lyle’s jumper is drying on its radiator, where it could never have been. The window restores composure and leaves the jumper in the case.',
    moveOn: 'Walk toward the window, look in, then return to the station and continue to the chapel.',
    callouts: [
      { kind: 'note', text: 'This is an optional side trip. The test jump below stands at the station; gather the objects and enter whiteout through the actual doors.' },
    ],
    phases: [P.CHAPEL_OUTSKIRTS], finale: [S.CHAPEL_COMMITTED], objectives: [], checkpoints: [],
    next: [{ to: 'chapel-station', when: 'back from the window', back: true }],
    span: () => null,
    measure: () => [['Distinct objects required', String(CHAPEL_WORLD_SET.length - 1)], ['Reward', 'full composure and Lyle’s jumper']],
    cites: [
      ['Opening the way home', at(MAIN, 'function syncStationErrand(')],
      ['Holding the whiteout crossing', at(RUNTIME, 'function setStationHomeOpen(')],
      ['The walk and the window', at(MAIN, 'function tickHomeWalk(')],
      ['The remembered kitchen', at('src/render/childhood-window.js', 'export function paintChildhoodWindow(')],
      ['Composure and the jumper', at(MAIN, 'function finishHomeWalk(')],
      ['The objects in the case', at('src/game/bag-items.js', 'function stationInspectionDialogue(')],
    ],
    presets: [], jump: [{ probe: 'chapelOutskirtsPreset', call: `__probe.chapelOutskirtsPreset(${SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsFrom})` }], puzzles: [],
    specs: ['test/source-outskirts.spec.mjs', 'test/bag-items.spec.mjs'],
  },
  {
    id: 'chapel-door', section: 'chapel', lane: 'chapel', short: 'Chapel door', title: 'Through the chapel door',
    where: 'The chapel’s oak pair, at the end of the door field.',
    happens: 'Walking through puts you in the chapel corridor in the building, facing on. Source space ends; the chapel’s endings are decided inside.',
    moveOn: 'Walk through.',
    callouts: [{ kind: 'gate', text: 'The chapel side has to be ready for the hand-off. A god-menu warp needs __probe.sourceChapelReady() first.' }],
    phases: [P.CHAPEL_OUTSKIRTS, P.COMPLETED], finale: [S.CHAPEL_COMMITTED], objectives: ['chapel-crossing'], checkpoints: [],
    next: [{ to: 'ending:chapel', when: 'inside the chapel' }],
    road: 'chapel',
    span: () => SOURCE_CHAPEL_OUTSKIRTS.doorsTo - SOURCE_CHAPEL_OUTSKIRTS.doorAt,
    measure: () => [['Length', cells(SOURCE_CHAPEL_OUTSKIRTS.doorsTo - SOURCE_CHAPEL_OUTSKIRTS.doorAt)]],
    cites: [
      ['What moves you on', at(RUNTIME, 'function enterChapelDoor() {')],
      ['The rule it passes', at(STATE, "case 'CHAPEL_DOOR_ENTERED': {")],
      ['Into the building', at(MAIN, 'function beginChapelFromHorizon(){')],
    ],
    presets: [],
    jump: [
      { probe: 'sourceChapelReady', call: '__probe.sourceChapelReady()' },
      { probe: 'chapelOutskirtsPreset', call: `__probe.chapelOutskirtsPreset(${SOURCE_CHAPEL_OUTSKIRTS.from - SOURCE_CHAPEL_OUTSKIRTS.doorsTo})` },
    ],
    puzzles: [],
    specs: ['test/source-finale-routes.spec.mjs'],
  },
]);

// ── links other audits use ──────────────────────────────────────────────────

export const sourcePathHref = (stageId) => `http://127.0.0.1:${auditById('source-path').port}/#${encodeURIComponent(stageId)}`;

// The stage a road's endings hang off, for the endings page.
export function sourcePathStageForEndingFamily(family) {
  const stage = STAGES.find((entry) => entry.road === family);
  return stage ? { id: stage.id, title: stage.title, href: sourcePathHref(stage.id) } : null;
}

// Every stage a puzzle sits on, for the puzzles page.
export function sourcePathStagesForPuzzle(puzzleId) {
  return STAGES.filter((stage) => stage.puzzles.includes(puzzleId))
    .map((stage) => ({ id: stage.id, title: stage.title, href: sourcePathHref(stage.id) }));
}

// ── the diagram ─────────────────────────────────────────────────────────────
//
// Lengths are to scale. A stage that is a moment rather than a distance gets a
// fixed width so it can be seen and clicked. The contact road leaves below the
// final page; the tower road leaves above the tape at the bust, and runs beside
// it to the tape's end, because the path the bust cuts does.
const MOMENT = 80;

function layout(stages, k) {
  const by = new Map(stages.map((stage) => [stage.id, stage]));
  const segments = [];
  const place = (ids, row, start) => {
    let x = start;
    for (const id of ids) {
      const stage = by.get(id);
      const width = Number.isFinite(stage.length) && stage.length > 0 ? stage.length : MOMENT;
      segments.push({ id, row, lane: stage.lane, title: stage.short, x0: x, x1: x + width, moment: !(stage.length > 0) });
      x += width;
    }
    return x;
  };
  const forkAt = place(['hall', 'haystack', 'crossing', 'scene-dock', 'white-walk', 'field', 'final-page'], 'shared', 0);
  const contactEnd = place(['contact'], 'contact', forkAt + MOMENT / 2);
  const tapeEnd = place(['grey-doors', 'nothing', 'arrival-night', 'tape'], 'shared', forkAt);
  const tapeStart = tapeEnd - (by.get('tape').length || 0);
  const bustAt = tapeStart + (Number(k.bustDepth) || 0);
  // The home errand is a side trip listed below, not extra distance between the
  // tape and the chapel. The strip keeps the main road's physical length.
  const chapelEnd = place(['chapel-outskirts', 'chapel-station', 'chapel-door'], 'shared', tapeEnd);
  const towerEnd = place(['bell-passage', 'tower-doors', 'tower-door', 'cathedral'], 'tower', tapeEnd);
  const endingsFor = (family) => Object.entries(ENDING_GATES).filter(([, gate]) => gate.family === family).map(([id]) => id);
  return {
    moment: MOMENT,
    segments,
    forks: [{ id: 'final-page', x: forkAt, to: 'contact', label: 'first fork' }, { id: 'tape', x: bustAt, to: 'tower', label: 'the bust' }],
    towerCut: { x0: bustAt, x1: tapeEnd },
    contactFrom: forkAt,
    ends: [
      { row: 'contact', x: contactEnd, family: 'contact', endings: endingsFor('contact') },
      { row: 'shared', x: chapelEnd, family: 'chapel', endings: endingsFor('chapel') },
      { row: 'tower', x: towerEnd, family: 'tower', endings: endingsFor('tower') },
    ],
    total: Math.max(contactEnd, chapelEnd, towerEnd),
  };
}

// ── building it ─────────────────────────────────────────────────────────────

const exists = async (path) => { try { await access(resolve(ROOT, path)); return true; } catch { return false; } };

async function codeConstants() {
  const text = await readFile(resolve(ROOT, RUNTIME), 'utf8').catch(() => '');
  return Object.fromEntries(Object.entries(CODE_CONSTANTS).map(([key, name]) => {
    const match = text.match(new RegExp(`const ${name} = (-?[\\d.]+)[,;]`));
    return [key, match ? Number(match[1]) : null];
  }));
}

// Where the ground has to agree with itself. A gap between two extents is
// ground nobody drew; an overlap is two places claiming the same cells.
function geometryErrors(k) {
  const errors = [];
  for (let index = 0; index < SOURCE_TIERS.length - 1; index += 1) {
    const here = SOURCE_TIERS[index], next = SOURCE_TIERS[index + 1];
    if (here.to !== next.from) errors.push(`the ${here.id} tier ends at ${here.to} but ${next.id} starts at ${next.from}`);
  }
  if (SOURCE_PRE_TAPE.from !== SOURCE_TIER_BY_ID.nothing?.from) errors.push('the walk out does not start with the still ground');
  if (SOURCE_PRE_TAPE.roadFrom !== SOURCE_TIER_BY_ID.outskirts?.from) errors.push('the road does not start where the still ground ends');
  if (SOURCE_PRE_TAPE.to !== SOURCE_HORIZON.from) errors.push('the nothing does not end where the tape begins');
  if (SOURCE_HORIZON.from - SOURCE_HORIZON.to !== SOURCE_HORIZON.length) errors.push('the tape’s declared length disagrees with its extent');
  if (SOURCE_HORIZON.to !== SOURCE_BELLS.from) errors.push('the bell passage does not start where the tape ends');
  if (SOURCE_BELLS.from - SOURCE_BELLS.to !== SOURCE_BELLS.length) errors.push('the bell passage’s declared length disagrees with its extent');
  const { doors, room } = SOURCE_BELLS;
  if (!(SOURCE_BELLS.from > doors.from && doors.from > doors.to && doors.to >= room.threshold && room.threshold >= SOURCE_BELLS.to)) {
    errors.push('the tower door field and the belfry door are not in order inside the bell passage');
  }
  const chapel = SOURCE_CHAPEL_OUTSKIRTS;
  if (!(chapel.from > chapel.doorsFrom && chapel.doorsFrom > chapel.doorsTo && chapel.doorsTo > chapel.doorAt && chapel.doorAt >= chapel.to)) {
    errors.push('past the tape, the nothing, the door field and the chapel door are not in order');
  }
  const overlap = chapel.from - SOURCE_HORIZON.to;
  if (overlap < 0 || overlap > 4) errors.push(`past the tape starts ${overlap} cells from the tape’s end, which leaves a gap or a long overlap`);
  if (!(k.bustDepth > 0 && k.bustDepth < SOURCE_HORIZON.length)) errors.push('the bust does not stand on the tape');
  return errors;
}

export async function buildAudit() {
  const citation = citationReader();
  const broken = [];
  const unfinished = [];
  const main = await readFile(resolve(ROOT, MAIN), 'utf8');
  const stateText = await readFile(resolve(ROOT, STATE), 'utf8');
  const k = await codeConstants();
  for (const [key, value] of Object.entries(k)) {
    if (value == null) broken.push(`could not read ${CODE_CONSTANTS[key]} out of ${RUNTIME}`);
  }

  const stageIds = new Set(STAGES.map((stage) => stage.id));
  const puzzleIds = new Set(PUZZLES.map((puzzle) => puzzle.id));
  const presetIds = new Set(Object.values(CHUNK_SURF_GOD_PRESET));
  const endingIds = new Set(Array.isArray(ENDING_IDS) ? ENDING_IDS : Object.values(ENDING_IDS));
  const puzzleTitles = Object.fromEntries(PUZZLES.map((puzzle) => [puzzle.id, puzzle.title]));

  const stages = await Promise.all(STAGES.map(async (stage) => {
    const problems = [];
    const cites = await Promise.all(stage.cites.map(async ([label, where]) => ({ label, where: await citation(where) })));
    for (const { label, where } of cites) {
      if (!where.resolved) problems.push(`“${label}” points at ${where.symbol} in ${where.file}, which is not there`);
    }
    const specs = await Promise.all(stage.specs.map(async (path) => ({ path, present: await exists(path) })));
    for (const spec of specs) if (!spec.present) problems.push(`names ${spec.path}, which is not there`);

    const jumps = [
      ...stage.presets.map((preset) => ({ probe: 'sourcePreset', call: `__probe.sourcePreset('${preset}')`, preset })),
      ...stage.jump,
    ].map((jump) => ({ ...jump, present: new RegExp(`\\b${jump.probe}:`).test(main) && (!jump.preset || presetIds.has(jump.preset)) }));
    for (const jump of jumps) if (!jump.present) problems.push(`jumps here with ${jump.call}, which the game no longer has`);

    for (const id of stage.checkpoints) {
      if (!stateText.includes(`'${id}'`)) problems.push(`says it saves as ${id}, which the state never sets`);
    }
    for (const id of stage.puzzles) if (!puzzleIds.has(id)) problems.push(`names the puzzle ${id}, which the puzzles audit does not list`);
    for (const next of stage.next) {
      if (next.to.startsWith('ending:')) {
        if (!ENDING_FAMILY[next.to.slice('ending:'.length)]) problems.push(`leads to the ${next.to} road, which is not a road`);
      } else if (!stageIds.has(next.to)) problems.push(`leads to ${next.to}, which is not a stage`);
    }
    for (const id of stage.objectives) {
      if (!SOURCE_TRACE_OBJECTIVE_IDS.includes(id)) problems.push(`names the recorder note ${id}, which the recorder does not have`);
    }

    let length = null, rows = [], measureError = null;
    try { length = stage.span(k); rows = stage.measure(k).map(([label, value]) => ({ label, value: String(value) })); }
    catch (error) { measureError = String(error?.message || error); problems.push(`could not be read out of the game: ${measureError}`); }
    if (length != null && !(length > 0)) problems.push(`has a length of ${length}`);

    const endings = stage.road
      ? Object.entries(ENDING_GATES).filter(([, gate]) => gate.family === stage.road).map(([id]) => ({ id, known: endingIds.has(id) }))
      : [];
    for (const ending of endings) if (!ending.known) problems.push(`lists the ending ${ending.id}, which the game does not have`);

    for (const problem of problems) broken.push(`${stage.title} ${problem}`);
    if (!jumps.length) unfinished.push({ id: stage.id, text: 'has no way to jump straight here for testing' });

    return {
      ...stage, length, rows, measureError, cites, specs, jumps, endings, problems,
      notes: stage.objectives.map((id) => ({ id, text: sourceTraceNote({ id }) })),
      puzzleLinks: stage.puzzles.map((id) => ({ id, title: puzzleTitles[id] || id })),
    };
  }));

  // ── coverage: the part a description cannot promise on its own ──────────────
  const covered = (values, field) => Object.fromEntries(values.map((value) => [value, stages.filter((stage) => stage[field].includes(value)).map((stage) => stage.id)]));
  const coverage = {
    phases: covered(Object.values(CHUNK_SURF_PHASE), 'phases'),
    finale: covered(Object.values(SOURCE_FINALE_STAGE), 'finale'),
    objectives: covered(SOURCE_TRACE_OBJECTIVE_IDS, 'objectives'),
    presets: covered([...presetIds], 'presets'),
  };
  for (const [phase, ids] of Object.entries(coverage.phases)) {
    if (!ids.length) broken.push(`the phase ${phase} is not on the path — say which stage it belongs to`);
  }
  for (const [stage, ids] of Object.entries(coverage.finale)) {
    if (!ids.length) broken.push(`the finale stage ${stage} is not on the path — say which stage it belongs to`);
  }
  for (const [objective, ids] of Object.entries(coverage.objectives)) {
    if (!ids.length) broken.push(`the recorder note ${objective} (“${sourceTraceNote({ id: objective })}”) is not on the path`);
  }
  for (const [preset, ids] of Object.entries(coverage.presets)) {
    if (!ids.length) unfinished.push({ id: preset, text: 'is a god-menu preset that no stage says it jumps to' });
  }
  for (const family of Object.keys(ENDING_FAMILY)) {
    if (!stages.some((stage) => stage.road === family)) broken.push(`the ${family} road has endings but no stage on the path leads to them`);
  }
  broken.push(...geometryErrors(k));

  const roads = Object.values(ENDING_FAMILY).map((family) => ({
    ...family,
    endings: Object.entries(ENDING_GATES).filter(([, gate]) => gate.family === family.id).map(([id]) => id),
    stage: stages.find((stage) => stage.road === family.id)?.id || null,
  }));

  return {
    stages,
    sections: SECTIONS,
    lanes: LANES,
    roads,
    coverage,
    constants: k,
    cell: CELL,
    strip: layout(stages, k),
    counts: {
      stages: stages.length,
      forks: stages.filter((stage) => stage.next.some((next) => next.branch)).length,
      roads: roads.length,
      endings: roads.reduce((sum, road) => sum + road.endings.length, 0),
    },
    ports: { endings: auditById('endings').port, puzzles: auditById('puzzles').port },
    global: { broken, unfinished },
  };
}
