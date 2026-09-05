// Every puzzle, minigame and microgame in the building.
//
// These are the things that are not combat and not walking: a discrete thing to
// work out or a discrete thing to perform, with a state that says whether you
// have done it. They are the most scattered system in the game — fourteen of
// them across ten directories, no shared base, no registry, and no two written
// the same way, because each one is shaped like the room it is in rather than
// like its siblings. That is the right call for the game and a bad one for
// anybody trying to answer "what happens if a player cannot do this one".
//
// So this page asks four questions of each, and it asks them of the CODE:
//
//   what does it ask         the verb, not the fiction
//   what counts as solved    the actual predicate, imported and run where it can be
//   what does failing cost   and whether the cost is recoverable
//   what is the way through  for a player who cannot do it — a hint, a wide
//                            timing window, an auto-solve, or nothing at all
//
// The last one is the reason this exists. A puzzle with no way through is a
// place a run can end, and the only puzzles allowed to be that are the ones
// nothing depends on. Anything that GATES something and has no assist is
// reported as broken, not as a matter of taste.
//
// Nothing here writes to disk.

import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ROOT, citationReader } from '../shared.mjs';

import { HORIZON_TRANSPORT_DIALS, HORIZON_TRANSPORT_LABELS, HORIZON_TRANSPORT_OPTIONS } from '../../../src/game/horizon-transport.js';
import { POWER_CIRCUITS } from '../../../src/game/conservatory-power.js';
import { KEY_CABINET_RING } from '../../../src/game/key-cabinet.js';
import { MARBLE_HEAD_BUST, MARBLE_HEAD_PHASE } from '../../../src/game/marble-head.js';
import { PLANT_APPARITION_RUNGS, PLANT_FITTINGS, PLANT_FITTING_IDS, PLANT_TRAP, PLANT_VALVE_TURNS } from '../../../src/game/plant-isolation.js';
import { SOURCE_CONTACT_INSIGHTS } from '../../../src/game/source-contact.js';
import { PEAL_ASSIST_MODE, TENOR_TIMING } from '../../../src/game/bell-peal-performance.js';
import { PRACTICE_LISTENS_TO_STOP, PRACTICE_RETAKE_COST, PRACTICE_ROOMS } from '../../../src/game/practice-room.js';
import { STAIR_ANOMALY_DARK_ESCAPE_MS, STAIR_ANOMALY_VARIANT } from '../../../src/game/stair-anomaly.js';
import { SOURCE_HAYSTACK } from '../../../src/game/source-haystack.js';
import { COMBAT_TUTORIAL_STEPS } from '../../../src/game/combat-tutorial.js';
import { WINDOW_COMPOSITION_PURPOSES } from '../../../src/platform/window-composition.js';

const at = (file, symbol) => ({ file, symbol });
const list = (values) => values.join(' · ');

// PUZZLE or MICROGAME, and the difference is not a grading of size.
//
//   puzzle     you are asked to work something out. It waits for you, and the
//              answer is the same however long you take.
//   microgame  you are asked to DO something, against a clock or a tolerance.
//              Waiting does not help and can hurt.
//
// It matters because the two fail differently and therefore need different ways
// through: a puzzle wants a hint, a microgame wants a wider window.
const KIND = Object.freeze({ PUZZLE: 'puzzle', MICROGAME: 'microgame' });

export const PUZZLES = Object.freeze([
  {
    id: 'horizon-transport',
    kind: KIND.PUZZLE,
    title: 'The transport at the edge of the field',
    room: 'The pad at the end of the source, before the crossing.',
    asks: 'Thread three dials — run length, where the picture sits, where it breaks up — to match a tape you have already watched.',
    solved: 'All three dials agree with the truth derived from the recording itself, so the answer cannot be typed in beside the puzzle.',
    fails: 'Nothing. It simply does not thread, and you can go on turning dials.',
    assist: 'The readings are legible off the tape; the machine re-derives its own truth so the two can never drift apart.',
    gates: 'The POINT OF NO RETURN crossing. Nothing else starts it.',
    live: () => [
      ['Dials', list(HORIZON_TRANSPORT_DIALS.map((dial) => HORIZON_TRANSPORT_LABELS[dial] || dial))],
      ['Settings each', list(HORIZON_TRANSPORT_DIALS.map((dial) => `${dial} ${HORIZON_TRANSPORT_OPTIONS[dial].length}`))],
      ['Combinations', String(HORIZON_TRANSPORT_DIALS.reduce((n, dial) => n * HORIZON_TRANSPORT_OPTIONS[dial].length, 1))],
    ],
    cite: at('src/game/horizon-transport.js', 'export function horizonTransportThreaded'),
    spec: 'test/horizon-transport.spec.mjs',
  },
  {
    id: 'aperture',
    kind: KIND.PUZZLE,
    title: 'The aperture',
    room: 'The source, at the first lift.',
    asks: 'Place the panes of a composition until the picture assembles across real desktop windows.',
    solved: 'Every pane reports ok, which sets window.aperture.complete.',
    fails: 'Nothing. It holds until it is done.',
    assist: 'Two, on a clock: the composition goes coherent as a hint after 20s, and after 45s an interact assembles it outright.',
    gates: 'The first lift. The god menu can enter the level on either side of it.',
    live: () => [
      ['Composition purposes', list(WINDOW_COMPOSITION_PURPOSES)],
      ['Hint after', '20s'],
      ['Auto-assemble after', '45s'],
    ],
    cite: at('src/platform/window-choreography.js', 'function armPuzzleHint'),
    spec: 'test/window-composition.spec.mjs',
  },
  {
    id: 'conservatory-power',
    kind: KIND.PUZZLE,
    title: 'The five distribution panels',
    room: 'The service risers, throughout the conservatory.',
    asks: 'Find and throw the panels that feed the parts of the building you need lit.',
    solved: 'allPowerCircuitsRestored — but almost nothing needs all five, and that is the design.',
    fails: 'Nothing. A circuit can be thrown back.',
    assist: 'Each panel says what it serves, and rendering, audio and recording all read the same normalized state, so a lit room is never a lie.',
    gates: 'Light and recordability in the rooms each one serves. Not a single door.',
    live: () => POWER_CIRCUITS.map((circuit) => [circuit.label, circuit.serves]),
    cite: at('src/game/conservatory-power.js', 'export function allPowerCircuitsRestored'),
    spec: 'test/conservatory-power.spec.mjs',
  },
  {
    id: 'key-cabinet',
    kind: KIND.PUZZLE,
    title: 'The key cabinet',
    room: 'The box office.',
    asks: 'Three rings on three hooks. Take the one that opens the chapel.',
    solved: 'C-17 comes off the hook. The other two are dropped.',
    fails: 'A wrong ring falls, which is a noise in a building that listens. Nothing is consumed.',
    assist: 'The tags are readable and the wrong ones are wrong for a reason you can read off them.',
    gates: 'The chapel.',
    live: () => Object.entries(KEY_CABINET_RING).map(([tag, ring]) => [tag, ring.outcome === 'take' ? 'the one that comes away' : 'drops']),
    cite: at('src/game/key-cabinet.js', 'export const KEY_CABINET_RING'),
    spec: 'test/key-cabinet.spec.mjs',
  },
  {
    id: 'marble-head',
    kind: KIND.PUZZLE,
    title: 'The eyes and the face',
    room: 'The park fountain, then the academic gallery.',
    asks: 'Carry the eyes out of the water and find the one bust of six they belong to.',
    solved: 'They are returned to the fragment bust. Declining is also an ending state, and is kept.',
    fails: 'Nothing. Declining is a choice the game remembers rather than a failure.',
    assist: 'The break is described on both halves; five of the six busts refuse them outright.',
    gates: 'A pin and what the gallery says to you afterwards.',
    live: () => [
      ['The bust that fits', MARBLE_HEAD_BUST],
      ['States', list(Object.values(MARBLE_HEAD_PHASE))],
    ],
    cite: at('src/game/marble-head.js', 'export function marbleHeadFits'),
    spec: 'test/academic-gallery.spec.mjs',
  },
  {
    id: 'plant-isolation',
    kind: KIND.MICROGAME,
    title: 'The heating header',
    room: 'The plant room, during the incident.',
    asks: 'Shut three fittings down a christmas tree — back nut, gland, handwheel — with whichever wrench you brought, while each of them backs the others off.',
    solved: 'All three seated AT ONCE. The persisted incident owns open-or-sealed; this owns the hand.',
    fails: 'Two costs, both recoverable. A wrench on the bypass cock vents the header: loud, and everything goes slack. And the thing standing behind you comes one rung nearer every time you turn round to look at it, which is what looking costs.',
    assist: 'Three ways in — pointer drag, keyboard heave, controller heave — and each finishes it alone. The order and the warning about the fourth fitting are on a board a metre from the valve. The lighter wrench is about half the travel of the heavy one.',
    gates: 'Recording in the plant room, which is blocked while the pipe is open. Nothing else.',
    // Can you leave, and what does leaving cost? The page's one rule is about
    // runs ending, and a scene that blocks input and swallows Escape is exactly
    // that — this microgame did, until it was rewritten.
    abandon: 'Escape leaves it. The incident stays ISOLATING and the header is still there to come back to; the fittings keep their travel less a lump for having been left with nobody on them.',
    inputs: 'Pointer: press a fitting and drag it clockwise. Keyboard: 1-4 to choose, E/Space/Enter to heave, Tab to cycle. Controller: interact to heave, cancel to leave, with haptics on every seat. No input is required that another cannot replace.',
    windows: 'A service card and two gauges, while the wrench is on the tree (compilePlantHeaderPlan). Display only, no input, and recompiled as fittings seat so the needles fall. Nothing is gated on them: the card is a prop on the wall and the gauge is on the header, and the spec shuts the whole thing with the policy forced to stable.',
    live: () => [
      ['Fittings', list(PLANT_FITTINGS.map((entry) => entry.label))],
      ['Travel, by tool', list(Object.entries(PLANT_VALVE_TURNS).map(([tool, turns]) => `${tool} ${turns} turns`))],
      ['Lighter tool is', `${Math.round((PLANT_VALVE_TURNS.spanner / PLANT_VALVE_TURNS.stillson) * 100)}% of the heavy one`],
      ['Backslide, per second', list(PLANT_FITTINGS.map((entry) => `${entry.id} ${entry.backslide} loose / ${entry.seatedBackslide} seated`))],
      ['The one not to touch', `${PLANT_TRAP.label} — ${PLANT_TRAP.note}`],
      ['How near it gets', `${PLANT_APPARITION_RUNGS} rungs, and the last is still short of you`],
    ],
    cite: at('src/game/plant-isolation.js', 'export const PLANT_FITTINGS'),
    spec: 'test/plant-isolation.spec.mjs',
  },
  {
    id: 'source-contact',
    kind: KIND.PUZZLE,
    title: 'What you get him to say',
    room: 'The source, in conversation.',
    asks: 'Draw three admissions out of him in whatever order they come.',
    solved: 'All three insights held, which is what exposes the boss.',
    fails: 'Nothing is spent and nothing is closed. A contact you do not resolve stays unresolved.',
    assist: 'The three are drawn from authored documents rather than a hidden list, so every one of them is somewhere to be read.',
    gates: 'The final encounter being winnable at all.',
    live: () => SOURCE_CONTACT_INSIGHTS.map((id) => [id, 'insight']),
    cite: at('src/game/source-contact.js', 'export function sourceBossExposed'),
    spec: 'test/source-contact.spec.mjs',
  },
  {
    id: 'redaction',
    kind: KIND.PUZZLE,
    title: 'The redactions',
    room: 'Inside the fights that are made of paper.',
    asks: 'Paint out and uncover words until what survives on the page reads as the thing you meant.',
    solved: 'The surviving text matches an authored reading.',
    fails: 'A stroke can be undone; the opponent moves against you between turns.',
    assist: 'Undo, and the reading is validated as you go rather than only at the end.',
    gates: 'The paper battles it is the body of.',
    live: () => [['Verbs', 'paint · undo · reveal · graft']],
    cite: at('src/game/redaction.js', 'export function validateReading'),
    spec: 'test/redaction-system.spec.mjs',
  },
  {
    id: 'bell-peal',
    kind: KIND.MICROGAME,
    title: 'Ringing the tenor',
    room: 'The bell tower.',
    asks: 'Strike the tenor on its place in a Stedman triples, row after row.',
    solved: 'The rows are rung. Each strike is graded against the tenor’s place in real time.',
    fails: 'Misses accumulate and the peal can be lost.',
    assist: 'Three timing modes, and WIDE is a genuinely different game: the perfect window goes from 90ms to 140 and the accepted window from 260 to 400.',
    gates: 'The tower, and the chapel through it.',
    live: () => [
      ['Modes', list(Object.values(PEAL_ASSIST_MODE))],
      ['Standard windows', `perfect ${TENOR_TIMING.perfectMs}ms · good ${TENOR_TIMING.goodMs}ms · accepted ${TENOR_TIMING.acceptedMs}ms`],
      ['Wide windows', `perfect ${TENOR_TIMING.widePerfectMs}ms · good ${TENOR_TIMING.wideGoodMs}ms · accepted ${TENOR_TIMING.wideAcceptedMs}ms`],
      ['Count-in', `${TENOR_TIMING.countInBeats} beats at ${TENOR_TIMING.countInBeatMs}ms`],
    ],
    cite: at('src/game/bell-peal-performance.js', 'export function gradeTenorTiming'),
    spec: 'test/bell-peal-performance.spec.mjs',
  },
  {
    id: 'practice-room',
    kind: KIND.MICROGAME,
    title: 'The practice wing',
    room: 'The practice rooms.',
    asks: 'Play the bar forward, wind it back when it hits the wall, and listen enough times to be allowed to stop.',
    solved: 'You have listened enough to stop. The file itself can never be finished — that is the point of the room.',
    fails: 'Winding back costs, and the cost climbs the further in you are.',
    assist: 'Nothing in here attacks you. The only thing you spend is time, and stopping is always eventually offered.',
    gates: 'Nothing. It is the encounter with nothing on the other side of it.',
    live: () => [
      ['Rooms', list(PRACTICE_ROOMS.map((room) => `${room.label} ${room.instrument}`))],
      ['Listens before you may stop', String(PRACTICE_LISTENS_TO_STOP)],
      ['Retake cost curve', list(PRACTICE_RETAKE_COST.map(String))],
    ],
    cite: at('src/game/practice-room.js', 'export const practiceCanStop'),
    spec: 'test/practice-room.spec.mjs',
  },
  {
    id: 'stair-anomaly',
    kind: KIND.MICROGAME,
    title: 'The stair that does not arrive',
    room: 'The main stair, going up.',
    asks: 'Keep climbing a flight that returns you to its own foot.',
    solved: 'The commitment is made and the stage advances. It is ascent-only; going down is never the anomaly.',
    fails: 'You are held in it. Nothing is taken.',
    assist: 'A torch flash breaks it, and it breaks itself after 20s in the dark.',
    gates: 'The floor above, and which of five variants the night gives you.',
    live: () => [
      ['Variants', list(Object.values(STAIR_ANOMALY_VARIANT))],
      ['Escapes itself in the dark after', `${Math.round(STAIR_ANOMALY_DARK_ESCAPE_MS / 1000)}s`],
    ],
    cite: at('src/game/stair-anomaly.js', 'export function reduceStairAnomaly'),
    spec: 'test/stair-anomaly.spec.mjs',
  },
  {
    id: 'haystack',
    kind: KIND.MICROGAME,
    title: 'The paper search',
    room: 'The long hall, and the haystack it gives way to.',
    asks: 'Find one page in a room made of pages, while the pressure climbs.',
    solved: 'The page is found. The pressure envelope never resets at the phase boundary, so the room cannot be farmed by walking back out.',
    fails: 'Nothing is lost, but movement and fear both get worse the longer it takes.',
    assist: 'Page guidance, and a pressure floor rather than a spike — it climbs over most of a minute instead of arriving.',
    gates: 'The rest of the source.',
    live: () => [
      ['Pressure', `${SOURCE_HAYSTACK.entryPressure} at entry, ${SOURCE_HAYSTACK.maxPressure} at the top`],
      ['Rise', `${SOURCE_HAYSTACK.riseSeconds}s`],
      ['Movement multiplier', `${SOURCE_HAYSTACK.movement.entry} to ${SOURCE_HAYSTACK.movement.max}`],
    ],
    cite: at('src/game/source-haystack.js', 'export function haystackPageGuidance'),
    spec: 'test/source-haystack.spec.mjs',
  },
  {
    id: 'combat-drill',
    kind: KIND.MICROGAME,
    title: 'The drill',
    room: 'The dock, during the tutorial.',
    asks: 'Play the four moves the drill asks for, in the order it asks for them.',
    solved: 'Every step is taken. The director filters the moves so a wrong one cannot be made.',
    fails: 'Nothing. The tutorial never punishes.',
    assist: 'The drill IS the assist: it allows one move at a time and says what it is for.',
    gates: 'Nothing. It is skippable, and the fights do not assume it.',
    // The last step allows null, which is the drill letting go — everything is
    // legal again and it is watching rather than steering.
    live: () => COMBAT_TUTORIAL_STEPS.map((step) => [step.id, step.allow ? list(step.allow) : 'anything — the drill lets go']),
    cite: at('src/game/combat-tutorial.js', 'export const COMBAT_TUTORIAL_STEPS'),
    spec: 'test/combat-tutorial.spec.mjs',
  },
  {
    id: 'mic-test',
    kind: KIND.MICROGAME,
    title: 'The level check',
    room: 'The dock, before anything else.',
    asks: 'Make a noise into a real microphone and watch a real meter move.',
    solved: 'A level is seen. It is the one moment in the game that asks the player to be loud on purpose.',
    fails: 'Nothing. A refused or missing microphone is a supported way to play.',
    assist: 'The whole game runs without it; the self-audio mask keeps the game’s own output out of the measurement.',
    gates: 'Nothing, and it must never gate anything — a player with no microphone is not a player with no game.',
    live: () => [['Measurement', 'rms · peak, masked against the game’s own output']],
    cite: at('src/game/mic.js', 'export function micTest'),
    spec: 'test/mic-input.test.mjs',
  },
]);

const exists = async (path) => { try { await access(resolve(ROOT, path)); return true; } catch { return false; } };

export async function buildAudit() {
  const citation = citationReader();
  const broken = [];
  const unfinished = [];

  const puzzles = await Promise.all(PUZZLES.map(async (puzzle) => {
    const where = await citation(puzzle.cite);
    const covered = await exists(puzzle.spec);
    // A live block that throws is the whole point of importing the game rather
    // than describing it: the page goes red the day the module changes shape.
    let live = [];
    let liveError = null;
    try { live = puzzle.live().map(([label, value]) => ({ label, value: String(value) })); }
    catch (error) { liveError = String(error?.message || error); }

    if (!where?.resolved) broken.push(`${puzzle.id} points at ${puzzle.cite.symbol} in ${puzzle.cite.file}, which is not there`);
    if (liveError) broken.push(`${puzzle.id} could not read itself out of the game: ${liveError}`);
    if (!covered) broken.push(`${puzzle.id} has no ${puzzle.spec}`);
    // THE ONE RULE. Everything else on this page is description; this is a
    // claim. A puzzle that opens something and offers no way through is a place
    // a run can end on a skill the game never taught.
    const opens = !/^nothing/i.test(puzzle.gates);
    if (opens && !puzzle.assist) broken.push(`${puzzle.id} gates something and offers no way through`);
    if (!puzzle.assist) unfinished.push({ id: puzzle.id, text: 'has no declared way through for a player who cannot do it' });

    return { ...puzzle, where, covered, live, liveError, opens };
  }));

  return {
    puzzles,
    counts: {
      all: puzzles.length,
      puzzles: puzzles.filter((entry) => entry.kind === KIND.PUZZLE).length,
      microgames: puzzles.filter((entry) => entry.kind === KIND.MICROGAME).length,
      gating: puzzles.filter((entry) => entry.opens).length,
    },
    global: { broken, unfinished },
  };
}
