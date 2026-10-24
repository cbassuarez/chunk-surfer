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
import { SOURCE_BRAIDED_DIVIDE } from '../../../src/data/source-braided-divide.js';
import { SOURCE_LAST_RECEPTION } from '../../../src/data/source-last-reception.js';
import { SOURCE_CONTINUATION, continuationCatchFloor, continuationSurfaces } from '../../../src/data/source-continuation.js';
import { SOURCE_PUB } from '../../../src/data/source-pub.js';
import {
  SOURCE_APPROACH_CELLS, SOURCE_BELLS, SOURCE_BELL_PASSAGE, SOURCE_CHAPEL_OUTSKIRTS, SOURCE_CHUTES,
  SOURCE_FIELD_TIERS, SOURCE_HORIZON, SOURCE_LANDMARK_TIER, SOURCE_NOTHING_LENGTH, SOURCE_OUTSKIRTS_LENGTH,
  SOURCE_PRE_TAPE, SOURCE_TIERS, SOURCE_TIER_BY_ID,
} from '../../../src/data/source-level.js';
import { OUTSKIRT_BEATS, OUTSKIRT_PASSES, OUTSKIRT_REPEAT_COUNT, OUTSKIRT_ROAD_END } from '../../../src/data/source-outskirts-arrival.js';
import { CHAPEL_WORLD_SET, ELSEWHERE_CROSSING_SECONDS } from '../../../src/data/elsewhere-worlds.js';
import { ENDING_FAMILY, ENDING_GATES } from '../../../src/data/ending-gates.js';
import {
  CATHEDRAL_ALARM_CEILING, CATHEDRAL_DAMAGE_MARKS, CHUNK_SURF_PHASE, SOURCE_FINALE_STAGE, SOURCE_HUSH_VICTORIES_REQUIRED, TOWER_DEFEAT_CEILING,
} from '../../../src/game/chunk-surf-state.js';
import { CHUNK_SURF_GOD_PRESET } from '../../../src/game/chunk-surf-god.js';
import { SOURCE_HALL_END_METRES, SOURCE_HAYSTACK } from '../../../src/game/source-haystack.js';
import { SOURCE_TRANSFORM_SECONDS } from '../../../src/game/source-space-runtime.js';
import { SOURCE_TRACE_OBJECTIVE_IDS, sourceTraceNote } from '../../../src/game/source-trace.js';
import { ENDING_IDS } from '../../../src/progression/schema.js';

const RUNTIME = 'src/game/source-space-runtime.js';
const STATE = 'src/game/chunk-surf-state.js';
const LEVEL = 'src/data/source-level.js';
const MAIN = 'src/main.js';
const CONTINUATION = 'src/game/source-continuation.js';
const CONTINUATION_DATA = 'src/data/source-continuation.js';
const CONTINUATION_SCENE = 'src/game/source-continuation-scene.js';
const FALSE_RETURN = 'src/game/source-false-return.js';
const FALSE_RETURN_LAYOUT = 'src/game/source-false-return-layout.js';
const EARTHFALL = 'src/game/source-earthfall.js';
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
  { id: 'field', title: 'The field', blurb: 'The Braided Divide, its optional Last Reception, and the original page and goods pair. Contact remains a voluntary meeting in the field.' },
  { id: 'contact', title: 'The Contact road', blurb: 'Choose a warned fight with HUSH. The first two wins return to the field; the third win or any loss resolves this road.' },
  { id: 'away', title: 'Walking away', blurb: 'The original goods pair leads through Wrong Return and the Catch. Its final pair hands back to the existing drive, physical outskirts and tape.' },
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
    happens: 'White exposure recovers into a pale field while the body keeps moving. Crossing the actual FOH threshold commits the nearby demolition and its finite dark pocket; stopping or retreating can preserve a view of it. The room and bank stay fixed. The bank’s deck lowers and waits. Boarding raises the body to its exterior ledge; stepping off loses elevation safely.',
    moveOn: `Walk the direct ${number(SOURCE_SHORE_DIRECT_METRES)} m to the deck, ride up, and turn behind the bank into Source proper.`,
    callouts: [{ kind: 'note', text: 'Sideways movement, circling and returning to the room do not advance a hidden distance quota. The carried torch remains a physical light.' }],
    phases: [P.LANDSCAPE], finale: [S.UNCOMMITTED], objectives: ['shore-walk', 'first-stair'], checkpoints: [],
    next: [{ to: 'field', when: 'around the opaque turn behind the receiving ledge' }],
    span: () => SOURCE_SHORE_DIRECT_METRES / CELL,
    measure: () => [['Length', cells(SOURCE_SHORE_DIRECT_METRES / CELL)], ['Direct ordinary walk', `${number(SOURCE_SHORE_DIRECT_SECONDS)} s`]],
    cites: [
      ['The fixed shores and body elevation', at(RUNTIME, 'function sourceShoreFrame() {')],
      ['The nearby demolition and finite pocket', at('src/data/source-demolition.js', 'export const SOURCE_DEMOLITION = freeze({')],
      ['What moves you on', at(RUNTIME, "dispatch({type:'SOURCE_APPROACH_COMPLETED'")],
      ['The rule it passes', at(STATE, "case 'SOURCE_APPROACH_COMPLETED':")],
    ],
    presets: [], jump: [], puzzles: [],
    specs: ['test/source-approach.spec.mjs', 'test/source-hanging-shore.spec.mjs', 'test/source-demolition-integration.spec.mjs'],
  },
  {
    id: 'field', section: 'field', lane: 'shared', short: 'The field', title: 'The field',
    where: 'The finite Braided Divide beyond the exposed strata: broken lower ground, middle and upper banks, ramps, model crossings and passages beneath them.',
    happens: 'HUSH follows the trail you leave, but does not close the gap merely because you stand still. Walk back into speaking range to choose a conversation or warned Contact. The west-bank Last Reception is optional. Ground gaps can cause a fall cut back to the forecourt; landmarks and the older tier identifiers remain available.',
    moveOn: 'Explore the connected banks and crossings, then reach the original final page and grey goods pair.',
    callouts: [
      { kind: 'fork', text: 'Approaching HUSH and explicitly confirming the warning starts Contact. Questions, radio history and equipment never grant permission to leave or fight.' },
      { kind: 'note', text: 'A four-tier compatibility table remains in the level data; the live Divide support and collision decide where the body can actually stand.' },
    ],
    phases: [P.LANDSCAPE], finale: [S.UNCOMMITTED], objectives: ['final-horizon'], checkpoints: [],
    next: [{ to: 'last-reception', when: 'optional: enter the west-bank room', branch: true }, { to: 'contact', when: 'approach HUSH and confirm the separate warning', branch: true }, { to: 'final-page', when: 'reach the original final landmark' }],
    span: () => SOURCE_BRAIDED_DIVIDE.length / CELL,
    measure: () => [
      ['Length', cells(SOURCE_BRAIDED_DIVIDE.length / CELL)],
      ['Width', `${number(SOURCE_BRAIDED_DIVIDE.maxX - SOURCE_BRAIDED_DIVIDE.minX)} m`],
      ['Bank heights', [SOURCE_BRAIDED_DIVIDE.lower, SOURCE_BRAIDED_DIVIDE.middle, SOURCE_BRAIDED_DIVIDE.upper].map(height => `${number(height)} m`).join(' · ')],
      ['Landmarks', Object.entries(SOURCE_LANDMARK_TIER).map(([id, tier]) => `${id} (${tier})`).join(' · ')],
      ['Contact knowledge gate', 'none; proximity and an explicit warned commitment'],
    ],
    cites: [
      ['The actual connected ground and model banks', at('src/data/source-braided-divide.js', 'export const SOURCE_DIVIDE_GROUND = freeze([')],
      ['The open strata release', at(RUNTIME, "dispatch({type:'SOURCE_LIFT_COMPLETED',id:'lift-fork'")],
      ['What moves you on', at(RUNTIME, "dispatch({ type: 'FINAL_REACHED' }")],
      ['The rule it passes', at(STATE, "case 'FINAL_REACHED':")],
      ['The voluntary meeting and fight authority', at(STATE, 'export function sourceBossAvailable(value) {')],
      ['Waiting does not start pursuit', at('src/game/source-hush-follow.js', "if (intent === 'follow') {")],
    ],
    presets: [G.FIRST_LIFT, G.FIRST_CONTACT, G.ALL_INSIGHTS, G.LANDSCAPE, G.HUNT, G.FINAL_RUN], jump: [], puzzles: ['source-contact'],
    specs: ['test/source-level.spec.mjs', 'test/source-braided-divide.spec.mjs', 'test/source-braided-runtime.spec.mjs', 'test/source-contact-runtime.spec.mjs'],
  },
  {
    id: 'last-reception', section: 'field', lane: 'shared', short: 'Last Reception', title: 'The optional Last Reception',
    where: 'A human-sized lounge and return room on the west middle bank, with a service passage and an upper gallery.',
    happens: 'Residents offer a reception that can turn into convergence and a held-chair encounter. Leaving or being released returns to the same field. This optional room never replaces Contact, the original goods pair or the continuation.',
    moveOn: 'Leave through the main or service opening and continue exploring Source I.',
    callouts: [{ kind: 'can-return', text: 'Both architectural openings and the room remain in the original field when the added rooms are visited.' }],
    phases: [P.LANDSCAPE, P.FINAL], finale: [S.UNCOMMITTED], objectives: [], checkpoints: [],
    next: [{ to: 'field', when: 'leave or return after the reception', back: true }],
    span: () => null,
    measure: () => [['Footprint', `${number(SOURCE_LAST_RECEPTION.bounds.maxX-SOURCE_LAST_RECEPTION.bounds.minX)} m × ${number(SOURCE_LAST_RECEPTION.bounds.maxZ-SOURCE_LAST_RECEPTION.bounds.minZ)} m`], ['Floor / gallery', `${number(SOURCE_LAST_RECEPTION.floor)} m / ${number(SOURCE_LAST_RECEPTION.galleryFloor)} m`]],
    cites: [
      ['The finite room and both openings', at('src/data/source-last-reception.js', 'export const SOURCE_LAST_RECEPTION = freeze({')],
      ['The encounter and release', at('src/game/source-last-reception.js', 'export function updateLastReception(')],
      ['The real runtime integration', at(RUNTIME, 'function tickLastReception(')],
    ],
    presets: [G.LAST_RECEPTION], jump: [], puzzles: [],
    specs: ['test/source-last-reception-layout.spec.mjs', 'test/source-last-reception-integration.spec.mjs'],
  },
  {
    id: 'final-page', section: 'field', lane: 'shared', short: 'Final page', title: 'The original final page',
    where: 'The original landmark near the far edge of Source I; the grey goods pair is at the perimeter.',
    happens: 'Arriving notes the final page. It is a landmark, not a transport menu. The live focus system does not create the older normal-exit or boss-fault pads; no dial, equipment check or required talk stands between the body and the goods pair.',
    moveOn: 'Walk to the original grey goods doors, open them and cross.',
    callouts: [
      { kind: 'note', text: 'The transport and redaction helpers remain compatibility code. Their puzzle links below do not describe live gates on this route.' },
      { kind: 'saves', text: 'Saved as the final page.' },
    ],
    phases: [P.FINAL], finale: [S.UNCOMMITTED], objectives: ['normal-exit', 'return-paths'], checkpoints: ['final-page'],
    next: [
      { to: 'grey-doors', when: 'walk away' },
    ],
    span: () => null,
    measure: () => [['Required transport / equipment / talks', 'none']],
    cites: [
      ['The live final-page focus policy', at(RUNTIME, '// The final sheet is a landmark, not a transport puzzle or fight menu.')],
      ['The landmark arrival', at(RUNTIME, "dispatch({ type: 'FINAL_REACHED' }")],
      ['The actual walked exit intercept', at(RUNTIME, "const continuation = sourceContinuationEntry('forward');")],
    ],
    presets: [G.FINAL, G.NORMAL_EXIT], jump: [], puzzles: ['horizon-transport', 'redaction'],
    specs: ['test/horizon-transport.spec.mjs', 'test/source-finale-routes.spec.mjs'],
  },
  {
    id: 'contact', section: 'contact', lane: 'contact', short: 'Contact', title: 'Contact: the voluntary HUSH encounters',
    where: 'Within speaking range of the actual HUSH body in the field.',
    happens: 'Each fight requires a separate warning and explicit commitment. The first two wins return to Source I with the route uncommitted, so exploration or walking away is possible again. The third win resolves Contact; any committed loss resolves its losing ending.',
    moveOn: 'Choose each commitment. Win all three encounters for the Contact victory, or leave the field after a partial win.',
    callouts: [
      { kind: 'no-return', text: 'A committed bout cannot be exchanged for a safer route. During it, the continuation and normal exit refuse entry.' },
      { kind: 'can-return', text: 'The first two wins release the commitment; returning to the field does not secretly enroll you in another fight.' },
      { kind: 'note', text: 'Losing here ends the run too. It is not a way back onto the other roads.' },
    ],
    phases: [P.FINAL, P.COMPLETED], finale: [S.CONTACT_COMMITTED, S.RESOLVED], objectives: [], checkpoints: [],
    next: [{ to: 'ending:contact', when: 'third victory or any committed loss' }, { to: 'field', when: 'after either of the first two victories', back: true }],
    road: 'contact',
    span: () => null,
    measure: () => [['Victories for the Contact ending', String(SOURCE_HUSH_VICTORIES_REQUIRED)], ['Required prior talks / equipment', 'none']],
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
    happens: 'The real pair keeps its fixed opening and collision. On a fresh normal route, crossing seems to return to Ellery. The false building and retained descent precede Wrong Return, while Source I and its original body remain intact. False echo pairs still erase themselves. Existing onward journeys retain their position.',
    moveOn: 'Open and walk through the real pair into the false Ellery return.',
    callouts: [
      { kind: 'can-return', text: 'Visible refuge portals return to this original approach with continuation progress intact. Until the bust has an answer, returning from the physical road reopens the final Catch balcony.' },
      { kind: 'saves', text: 'The new route lives in chunkSurf.sourceContinuation. Source I remains uncommitted until the final Catch door is physically crossed.' },
    ],
    phases: [P.LANDSCAPE, P.FINAL, P.HORIZON], finale: [S.UNCOMMITTED, S.HORIZON], objectives: [], checkpoints: [],
    next: [
      { to: 'false-ellery', when: 'fresh forward crossing' },
      { to: 'earthfall', when: 'existing descent checkpoint resumes' },
      { to: 'wrong-return', when: 'existing Source II checkpoint resumes' },
      { to: 'nothing', when: 'legacy save already beyond the original handoff' },
      { to: 'catch', when: 'reverse from the road before the bust decision, after completing the added route', back: true },
    ],
    span: () => null,
    measure: (k) => [['Shut behind you after', `${number(k.closeBehind)} cells`]],
    cites: [
      ['Opening them', at(RUNTIME, 'function openEdgeDoor(')],
      ['The fresh-route intercept and legacy bypass', at(RUNTIME, "const continuation = sourceContinuationEntry('forward');")],
      ['Route and Contact authority', at(RUNTIME, "function sourceContinuationEntry(direction = 'forward'")],
      ['Returning to the original approach', at(RUNTIME, 'function returnContinuation(')],
    ],
    presets: [], jump: [{ probe: 'walkToEdgeDoor', call: '__probe.walkToEdgeDoor()' }, { probe: 'openEdgeDoor', call: '__probe.openEdgeDoor()' }], puzzles: [],
    specs: ['test/source-edge-door.spec.mjs', 'test/source-continuation-integration.spec.mjs'],
  },
  {
    id: 'false-ellery', section: 'away', lane: 'away', short: 'Ellery Again', title: 'The false return to Ellery',
    where: 'A borrowed copy of the existing Ellery floor set, entered through its practice-side door.',
    happens: 'The first four distinct opened door assemblies lead into familiar rooms. The fifth opens onto Source II, and every later doorway follows it. The chapel approach and attempted outside retreat fold back to the arrival door. This presentation never dispatches ordinary building, chapel or Contact progression.',
    moveOn: 'Open five different doors, then physically cross an open Source-bound threshold.',
    callouts: [{kind:'saves',text:'Local door motions, count and body position survive pause and reload. Existing journeys already in the descent or Source II skip this introduction.'}],
    phases: [P.LANDSCAPE, P.FINAL], finale: [S.UNCOMMITTED], objectives: [], checkpoints: [],
    next: [{to:'earthfall',when:'the fifth or a subsequent open doorway is physically crossed'}],
    span: () => null, measure: () => [['Distinct openings','5'],['Door swing','0.45 s']],
    cites: [
      ['The fresh forward admission and legacy bypass',at(FALSE_RETURN,'export function sourceFalseReturnNeeded(')],
      ['Five unique physical openings',at(FALSE_RETURN,'function countDoors(')],
      ['The actual copied Ellery floor set',at(FALSE_RETURN_LAYOUT,'export function buildSourceFalseReturnLayout(')],
      ['The local borrowed-world owner',at(MAIN,'async function beginSourceFalseReturn(')],
    ],
    presets: [], jump: [{probe:'godMenu',call:"__probe.godMenu('source-space')"}], puzzles: [],
    specs: ['test/source-false-return.spec.mjs','test/source-false-return-layout.spec.mjs','test/source-false-return-integration.spec.mjs'],
  },
  {
    id: 'earthfall', section: 'away', lane: 'away', short: 'The Descent', title: 'The retained Source II descent',
    where: 'The original Earthfall threshold, between the false Ellery door and Wrong Return.',
    happens: 'Walking away from the threshold releases the existing ground and carries the body through the retained descent. Its settled lower door still requires an opening and a real walked crossing.',
    moveOn: 'Take the descent, open the lower door and walk into Wrong Return.',
    callouts: [], phases: [P.LANDSCAPE,P.FINAL], finale: [S.UNCOMMITTED], objectives: [], checkpoints: [],
    next: [{to:'wrong-return',when:'cross the settled lower door'},{to:'field',when:'retreat before footing loss',back:true}],
    span: () => null, measure: () => [['Retained descent','100 m']],
    cites: [['The existing physical controller',at(EARTHFALL,'export function stepSourceEarthfall(')],['The existing main owner',at(MAIN,'async function beginSourceEarthfall(')]],
    presets: [], jump: [{probe:'godMenu',call:"__probe.godMenu('source-space')"}], puzzles: [],
    specs: ['test/source-earthfall.spec.mjs','test/source-earthfall-integration.spec.mjs'],
  },
  {
    id: 'wrong-return', section: 'away', lane: 'away', short: 'Wrong Return', title: 'Source II: Wrong Return',
    where: 'Beyond the original goods pair, in a separate finite room whose apparent return comes back above the entrance.',
    happens: 'Walk the west side to the far room, cross to the east ramp and return three metres higher. The upper porch is a false return. A warned closing front advances along that route; the matching seam and refuge remain to the west. Opening the seam door and walking across its bridge enters the Catch.',
    moveOn: 'Find the upper door with the matching seam, open it and walk west across the transfer.',
    callouts: [
      { kind: 'can-return', text: 'The entrance and refuge return portals restore the original Source I goods-door approach. Progress survives leaving, pause, title and reload.' },
      { kind: 'note', text: 'For a direct test fixture, open the SOURCE god-menu tab below and select SOURCE II / WRONG RETURN. The menu is a developer shortcut; ordinary entry uses the original physical pair.' },
    ],
    phases: [P.LANDSCAPE, P.FINAL], finale: [S.UNCOMMITTED], objectives: [], checkpoints: [],
    next: [{ to: 'catch', when: 'walk across the opened seam-door bridge' }, { to: 'field', when: 'choose a return portal', back: true }],
    span: () => null,
    measure: () => { const surfaces=continuationSurfaces('wrong-return');return [
      ['Finite footprint', `${number(Math.max(...surfaces.map(s=>s.maxX))-Math.min(...surfaces.map(s=>s.minX)))} m × ${number(Math.max(...surfaces.map(s=>s.maxZ))-Math.min(...surfaces.map(s=>s.minZ)))} m`],
      ['Rise', '3 m'], ['Closure warning', `${number(SOURCE_CONTINUATION.wrongReturn.warningSeconds)} s`], ['Closing front', `${number(SOURCE_CONTINUATION.wrongReturn.closureSpeed)} m/s`],
    ]; },
    cites: [
      ['Shared finite surfaces and the ramp', at(CONTINUATION_DATA, 'const wrongSurfaces = [')],
      ['The real closing front and physical transfer', at(CONTINUATION, "if (state.phase === 'wrong-return') {")],
      ['The checkpoint and borrowed-world owner', at(MAIN, 'async function beginSourceContinuation(')],
      ['Pause, loading and error return', at(CONTINUATION_SCENE, 'export function createSourceContinuationScene(')],
    ],
    presets: [], jump: [{probe:'godMenu',call:"__probe.godMenu('source-space')"}], puzzles: [],
    specs: ['test/source-continuation.spec.mjs', 'test/source-continuation-renderer.spec.mjs', 'test/source-continuation-integration.spec.mjs'],
  },
  {
    id: 'catch', section: 'away', lane: 'away', short: 'The Catch', title: 'Source III: The Catch',
    where: 'A top-down view of a finite shaft with offset openings and six catch levels.',
    happens: 'The visible player walks the actual supported shelves. A chosen lip releases the body into a continuous fall; offset openings decide where the next shelf catches it. A warned physical counterweight follows the shaft and can cause a bounded recovery. The lowest ordinary balcony holds the final grey pair.',
    moveOn: 'Choose successive drops, reach the final balcony, open the pair with E and physically walk through its plane.',
    callouts: [
      { kind: 'can-return', text: 'Every shelf and the recovery floor has a visible portal to the original Source I approach. A forward revisit resumes the saved shelf; a reverse visit from the road opens the final balcony. This is not a backwards staircase.' },
      { kind: 'gate', text: 'Opening the final pair is insufficient. Only the walked crossing creates the exit receipt, dispatches the original normal exit and requests the existing drive handoff.' },
      { kind: 'note', text: 'For a direct test fixture, open the SOURCE god-menu tab below and select SOURCE III / THE CATCH.' },
    ],
    phases: [P.LANDSCAPE, P.FINAL, P.HORIZON], finale: [S.UNCOMMITTED, S.HORIZON], objectives: [], checkpoints: ['landing-horizon'],
    next: [{ to: 'source-drive', when: 'first final-door crossing, before the existing drive has returned' }, { to: 'nothing', when: 'final crossing after that drive is already complete' }, { to: 'field', when: 'choose any refuge return', back: true }],
    span: () => null,
    measure: () => [
      ['Footprint', `${number(SOURCE_CONTINUATION.catch.outer.maxX-SOURCE_CONTINUATION.catch.outer.minX)} m × ${number(SOURCE_CONTINUATION.catch.outer.maxZ-SOURCE_CONTINUATION.catch.outer.minZ)} m`],
      ['Catch levels / interval', `${SOURCE_CONTINUATION.catch.levels} / ${number(SOURCE_CONTINUATION.catch.layerDrop)} m`],
      ['Final balcony / recovery floor', `${number(SOURCE_CONTINUATION.catch.finalApproach.feet)} m / ${number(continuationCatchFloor(SOURCE_CONTINUATION.catch.levels))} m`],
      ['Counterweight warning / speed', `${number(SOURCE_CONTINUATION.catch.counterweightWarningSeconds)} s / ${number(SOURCE_CONTINUATION.catch.counterweightSpeed)} m/s`],
      ['Recovery / grace', `${number(SOURCE_CONTINUATION.recoverySeconds)} s / ${number(SOURCE_CONTINUATION.graceSeconds)} s`],
    ],
    cites: [
      ['The actual shelf surfaces and openings', at(CONTINUATION_DATA, 'const catchSurfaces = [];')],
      ['Supported movement, falls and counterweight', at(CONTINUATION, 'function fallStep(')],
      ['The final open-then-cross condition', at(CONTINUATION, "sourceContinuationDoorFraction(state, 'catch-final') >= C.doorPassFraction")],
      ['The original normal exit and one-time receipt', at(RUNTIME, 'function completeContinuation(')],
      ['The existing drive handoff', at(MAIN, 'async function deliverSourceContinuationHandoff(')],
    ],
    presets: [], jump: [{probe:'godMenu',call:"__probe.godMenu('source-space')"}], puzzles: [],
    specs: ['test/source-continuation.spec.mjs', 'test/source-continuation-renderer.spec.mjs', 'test/source-continuation-integration.spec.mjs'],
  },
  {
    id: 'source-drive', section: 'away', lane: 'away', short: 'The Cut', title: 'The existing Source drive',
    where: 'The familiar vehicle interior, borrowed after the final Catch door and before the physical still ground.',
    happens: 'The existing drive, recorder, radio, weather and journey persist as their own session. Its actual parked dismount returns to the original-world goods-door checkpoint. The continuation receipt is acknowledged only after this drive has acquired a resumable checkpoint; a returned drive is never replayed on a revisit.',
    moveOn: 'Complete the drive, park and choose to leave the van. Then walk the original physical outskirts.',
    callouts: [{kind:'note',text:'This is the existing drive sequence, preserved in front of the original still ground, recurring street, optional Source pub and tape.'}],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: [], checkpoints: [],
    next: [{to:'nothing',when:'the original drive returns its exterior pose'}],
    span: () => null,
    measure: () => [['Persistence', 'sourceDrive, separate from chunkSurf.sourceContinuation']],
    cites: [
      ['The preserved drive session', at(MAIN, 'async function beginSourceDriveJourney(')],
      ['The actual parked dismount and returned receipt', at('src/game/source-drive-session.js', 'function finish() {')],
      ['Onward handoff and acknowledgement', at(MAIN, 'async function deliverSourceContinuationHandoff(')],
    ],
    presets: [], jump: [{probe:'sourceDrive',call:'__probe.sourceDrive.start()'}], puzzles: [],
    specs: ['test/source-drive-session.test.mjs', 'test/source-drive-window-handoff.test.mjs', 'test/source-continuation-integration.spec.mjs'],
  },
  {
    id: 'nothing', section: 'away', lane: 'away', short: 'Still', title: 'The still ground',
    where: 'The original exterior checkpoint after the drive returns: dark, dry ground with nothing standing on it.',
    happens: 'Silence, and the doors shutting behind you. The picture on the horizon is a long way off, and the first lamps of a road stand ahead.',
    moveOn: 'Walk on until the road starts under you.',
    callouts: [{ kind: 'note', text: 'The recording has not started. Everything out here plays at second zero of the tape.' }],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: ['horizon-walk'], checkpoints: [],
    next: [{ to: 'arrival-night', when: 'where the road starts' }, { to: 'catch', when: 'back through the original pair before the bust decision, after the continuation is complete', back: true }],
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
    next: [{ to: 'source-pub', when: 'optional: favors completed, last-light recording heard, and the Lyric threshold chosen', branch: true }, { to: 'tape', when: 'at the head of the tape' }],
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
    id: 'source-pub', section: 'away', lane: 'away', short: 'The lower Lyric', title: 'The optional Source pub',
    where: 'A fixed Lyric entrance near the original last-light point on the physical road, available after Iona’s ordinary-world favors and the recording.',
    happens: 'Iona is warmly oblivious in a colder unfinished bar. Five rounds ask for increasingly distant work among cask stacks. An empty tray and then a barrel drop through real openings; following either is a chosen descent into a lower room. The final errand leaves one clean glass. The road and tape remain where they were.',
    moveOn: 'Choose whether to help. Use the room’s explicit exit to restore the exact physical-road pose, then continue to the tape.',
    callouts: [{kind:'can-return',text:'The room is optional, persists independently and returns to the same road pose. Its falls never move the ordinary Source body or commit Contact or a bust branch.'}],
    phases: [P.HORIZON], finale: [S.HORIZON], objectives: [], checkpoints: [],
    next: [{to:'arrival-night',when:'leave the Lyric and resume the original road',back:true}],
    span: () => null,
    measure: () => [['Rounds / chosen service actions', `${SOURCE_PUB.rounds.length} / ${SOURCE_PUB.rounds.reduce((n,round)=>n+round.tasks.length,0)}`], ['Layer interval', `${number(SOURCE_PUB.layerDrop)} m`]],
    cites: [
      ['The actual prerequisites and fixed entrance', at(MAIN, 'function sourcePubEntranceFrame(){')],
      ['The five rounds and two chosen descents', at('src/data/source-pub.js', 'export const SOURCE_PUB=freeze({')],
      ['The borrowed-world and return owner', at(MAIN, 'async function beginSourcePubJourney(')],
    ],
    presets: [], jump: [{probe:'sourcePub',call:'__probe.sourcePub.fixture()'}], puzzles: [],
    specs: ['test/source-pub.spec.mjs', 'test/source-pub-main.spec.mjs', 'test/source-pub-renderer.spec.mjs'],
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
  const forkAt = place(['hall', 'haystack', 'crossing', 'scene-dock', 'white-walk', 'field'], 'shared', 0);
  const awayAt = place(['final-page'], 'shared', forkAt);
  const contactEnd = place(['contact'], 'contact', forkAt + MOMENT / 2);
  const tapeEnd = place(['grey-doors', 'wrong-return', 'catch', 'source-drive', 'nothing', 'arrival-night', 'tape'], 'shared', awayAt);
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
    forks: [{ id: 'field', x: forkAt, to: 'contact', label: 'voluntary Contact' }, { id: 'tape', x: bustAt, to: 'tower', label: 'the bust' }],
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
