import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLANT_APPARITION_RUNGS,
  PLANT_FITTINGS,
  PLANT_FITTING_IDS,
  PLANT_TRAP,
  PLANT_VALVE_TURNS,
  advancePlantApparition,
  applyPlantRotation,
  applyPlantStroke,
  createPlantTree,
  plantApparitionDistance,
  plantLookBackProgress,
  plantSeatedCount,
  plantTreeComplete,
  plantValveAudioFrame,
  selectPlantFitting,
  settlePlantTree,
  ventPlantHeader,
} from '../src/game/plant-isolation.js';
import { createPlantPipeRuntime } from '../src/audio/plant-pipe.js';
import {
  PLANT_HEADER_CUE_ID, compilePlantHeaderPlan, validateWindowChoreographyPlan, windowChoreographyPolicy,
} from '../src/platform/window-choreography.js';
import { CONSERVATORY_PROPS } from '../src/data/conservatory-props.js';
import * as FP from '../src/world/floorplan.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as PROPS from '../src/game/props.js';

// A player working the tree the way a player does: always the loosest fitting,
// one heave at a time, at a human cadence.
function workTheTree(tool, { dt = 0.35, limit = 200, touch = null } = {}) {
  let tree = createPlantTree(tool);
  let presses = 0;
  let seconds = 0;
  if (touch) tree = selectPlantFitting(tree, touch).tree;
  for (let guard = 0; guard < limit && !plantTreeComplete(tree); guard += 1) {
    const loosest = PLANT_FITTING_IDS.slice()
      .sort((a, b) => tree.fittings[a].progress - tree.fittings[b].progress)[0];
    tree = selectPlantFitting(tree, loosest).tree;
    tree = applyPlantStroke(tree);
    tree = settlePlantTree(tree, dt);
    presses += 1;
    seconds += dt;
  }
  return { tree, presses, seconds };
}

test('the tree closes through accumulated physical rotation, never elapsed time', () => {
  let tree = createPlantTree('spanner');
  assert.equal(plantSeatedCount(tree), 0);

  // A century of standing still closes nothing. This is the property the whole
  // microgame rests on: waiting can only ever LOSE travel.
  for (let i = 0; i < 400; i += 1) tree = settlePlantTree(tree, 0.25);
  assert.equal(plantTreeComplete(tree), false, 'elapsed time cannot close a fitting');
  assert.equal(plantSeatedCount(tree), 0);

  // Turning the wrong way does nothing either.
  const before = tree.fittings[tree.inHand].radians;
  assert.equal(applyPlantRotation(tree, -1.2).fittings[tree.inHand].radians, before,
    'anticlockwise cannot close a fitting');

  // And one enormous packet cannot do it in a single move — not even on the
  // shortest fitting, which is what the per-packet bound is sized against.
  for (const id of PLANT_FITTING_IDS) {
    const one = applyPlantRotation(selectPlantFitting(createPlantTree('spanner'), id).tree, 999);
    assert.equal(one.fittings[id].seated, false, `one pointer packet cannot seat the ${id}`);
  }
});

test('the three fittings loosen each other, so the repair is a hold and not a distance', () => {
  // Seat the nut, then walk away from it and watch it give itself back.
  let tree = createPlantTree('spanner');
  tree = selectPlantFitting(tree, 'back-nut').tree;
  for (let i = 0; i < 6 && !tree.fittings['back-nut'].seated; i += 1) tree = applyPlantStroke(tree);
  assert.equal(tree.fittings['back-nut'].seated, true, 'the nut seats');

  tree = selectPlantFitting(tree, 'gland').tree;
  for (let i = 0; i < 16; i += 1) tree = settlePlantTree(tree, 0.25);
  assert.equal(tree.fittings['back-nut'].seated, false, 'and gives itself back while you are elsewhere');
  assert.ok(tree.fittings['back-nut'].radians > 0, 'though not all at once — four seconds is a slip, not a reset');

  // The gland is the problem child by construction: longest travel, loosest.
  const gland = PLANT_FITTINGS.find((entry) => entry.id === 'gland');
  const nut = PLANT_FITTINGS.find((entry) => entry.id === 'back-nut');
  assert.ok(gland.share > nut.share && gland.backslide > nut.backslide,
    'the gland is both the longest and the loosest');
});

test('a seated fitting holds long enough for the other two to be reached', () => {
  // THE BUG THIS EXISTS TO CATCH. Backslide is continuous, so without a seating
  // latch a fitting un-seats the instant you leave it, only the fitting in hand
  // can ever be seated, and "all three at once" is unreachable — the microgame
  // becomes unwinnable in a way no single-fitting test would show.
  for (const tool of ['spanner', 'stillson']) {
    const { tree, presses, seconds } = workTheTree(tool);
    assert.equal(plantTreeComplete(tree), true, `${tool}: the repair can be finished`);
    assert.ok(presses < 40, `${tool}: and finished in ${presses} heaves, not by grinding`);
    assert.ok(seconds < 20, `${tool}: within ${seconds.toFixed(1)}s`);
  }
});

test('grinding one fitting cannot win, however long you stay on it', () => {
  let tree = createPlantTree('spanner');
  tree = selectPlantFitting(tree, 'handwheel').tree;
  for (let i = 0; i < 200; i += 1) { tree = applyPlantStroke(tree); tree = settlePlantTree(tree, 0.35); }
  assert.equal(tree.fittings.handwheel.seated, true, 'the one in hand is closed');
  assert.equal(plantTreeComplete(tree), false, 'and the repair is not done');
  assert.equal(plantSeatedCount(tree), 1, 'because the other two have been left');
});

test('the heavy tool is the longer repair, in travel and in heaves', () => {
  assert.ok(PLANT_VALVE_TURNS.stillson > PLANT_VALVE_TURNS.spanner);
  const light = workTheTree('spanner');
  const heavy = workTheTree('stillson');
  assert.ok(heavy.presses > light.presses,
    `the Stillson costs more heaves (${heavy.presses} vs ${light.presses})`);
});

test('the fourth fitting is a mistake, and it costs the whole repair', () => {
  const { tree } = workTheTree('spanner');
  assert.equal(plantTreeComplete(tree), true);

  const vented = selectPlantFitting(tree, PLANT_TRAP.id);
  assert.equal(vented.vented, true, 'a wrench on the bypass vents the header');
  assert.equal(plantTreeComplete(vented.tree), false);
  assert.equal(plantSeatedCount(vented.tree), 0, 'everything goes slack, including what was seated');
  assert.equal(vented.tree.vents, 1, 'and it is counted');
  for (const id of PLANT_FITTING_IDS) {
    assert.equal(vented.tree.fittings[id].radians, 0, `${id} is back to nothing`);
  }

  // It is recoverable. A vent is expensive, never terminal.
  assert.equal(ventPlantHeader(vented.tree).tree.vents, 2);
  assert.equal(PLANT_TRAP.id.length > 0 && !PLANT_FITTING_IDS.includes(PLANT_TRAP.id), true,
    'and the trap is not one of the three the card asks for');
});

test('the hiss is the readout: it steps down as fittings seat, and back up when they let go', () => {
  const base = { world: 0.30, monitor: 0.12 };
  const open = plantValveAudioFrame(base, createPlantTree('spanner'), {});
  assert.equal(open.world, 0.30, 'nothing closed, nothing quieter');
  assert.equal(open.rear, 0, 'and nothing behind you yet');

  const { tree } = workTheTree('spanner');
  const shut = plantValveAudioFrame(base, tree, {});
  assert.equal(shut.world, 0);
  assert.equal(shut.monitor, 0, 'the monitor follows the real pipe, not the lie');
  assert.ok(shut.rear > base.world, 'and the thing behind you ends louder than the pipe ever was');

  // Stepped, and audibly so: each seated fitting is an event, not a fade.
  const steps = [];
  let walk = createPlantTree('spanner');
  for (const id of PLANT_FITTING_IDS) {
    walk = selectPlantFitting(walk, id).tree;
    for (let i = 0; i < 8 && !walk.fittings[id].seated; i += 1) walk = applyPlantStroke(walk);
    steps.push(plantValveAudioFrame(base, walk, {}).world);
  }
  assert.ok(steps[0] > steps[1] && steps[1] > steps[2], `the hiss steps down: ${steps.join(' > ')}`);

  // And losing a fitting puts it back up, which is how you hear yourself losing.
  let slipping = walk;
  slipping = selectPlantFitting(slipping, 'handwheel').tree;
  for (let i = 0; i < 40; i += 1) slipping = settlePlantTree(slipping, 0.25);
  assert.ok(plantValveAudioFrame(base, slipping, {}).world > steps[2],
    'a fitting letting go is audible as the pipe coming back');

  assert.equal(plantValveAudioFrame(base, tree, { rearActive: false }).rear, 0,
    'and the false source can be cut');
});

test('the look-back is wrap-safe and requires most of a half turn', () => {
  assert.equal(plantLookBackProgress(Math.PI - 0.05, -Math.PI + 0.05) < 0.1, true);
  assert.ok(plantLookBackProgress(0, Math.PI * 0.75) >= 0.72);
  assert.ok(plantLookBackProgress(0, Math.PI * 0.5) < 0.72);
});

test('the thing behind you comes nearer on what you did, and never arrives', () => {
  let rung = 0;
  const seen = [plantApparitionDistance(rung)];
  for (let i = 0; i < 3; i += 1) { rung = advancePlantApparition(rung, 1); seen.push(plantApparitionDistance(rung)); }
  for (let i = 1; i < seen.length; i += 1) {
    assert.ok(seen[i] < seen[i - 1], `it is nearer each time (${seen.join(' → ')})`);
  }

  // A vent and a loud heave move it further than a look-back does.
  assert.equal(advancePlantApparition(0, 2), 2);

  // AND IT NEVER ARRIVES. The last rung is still short of a body on you, because
  // arriving is a contact and this scene is forbidden to start one.
  let far = 0;
  for (let i = 0; i < 50; i += 1) far = advancePlantApparition(far, 3);
  assert.equal(far, PLANT_APPARITION_RUNGS, 'the rungs clamp');
  assert.ok(plantApparitionDistance(far) > 1, 'and the last rung is still a distance away');
});

test('nothing in the microgame can reach Presence, belief, contact or the save', () => {
  // Asserted against the MODULE, not by matching main.js source text, which is
  // what the previous version of this test did — it pinned the string
  // `blocksWorld:true` and would have passed if the freeze stopped working.
  const source = readFileSync(new URL('../src/game/plant-isolation.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b[^\n]*\b(presence|recordist|hush)/i,
    'the module imports nothing that could create a HUSH');
  const api = { createPlantTree, applyPlantRotation, applyPlantStroke, settlePlantTree, selectPlantFitting, ventPlantHeader };
  for (const [name, fn] of Object.entries(api)) {
    assert.equal(typeof fn, 'function', `${name} is pure state`);
  }
  // Every exported mutator returns new state and leaves its input alone.
  const tree = createPlantTree('spanner');
  const snapshot = JSON.stringify(tree);
  applyPlantStroke(tree); settlePlantTree(tree, 1); ventPlantHeader(tree); selectPlantFitting(tree, 'gland');
  assert.equal(JSON.stringify(tree), snapshot, 'and none of them mutate what they were given');
});

test('the runtime routes the false source through a rear HRTF path', () => {
  const ramps = [];
  const param = (value = 0) => ({ value, cancelScheduledValues() {}, linearRampToValueAtTime(next) { this.value = next; ramps.push(next); } });
  const node = (extra = {}) => ({ connect() {}, ...extra });
  let panner = null;
  const context = {
    sampleRate: 8000, currentTime: 1,
    createBuffer: () => ({ getChannelData: () => new Float32Array(16) }),
    createBufferSource: () => node({ start() {}, stop() {}, loop: false, buffer: null }),
    createBiquadFilter: () => node({ frequency: param(), Q: param(), type: '' }),
    createGain: () => node({ gain: param() }),
    createStereoPanner: () => node({ pan: param() }),
    createPanner: () => { panner = node({ positionX: param(), positionY: param(), positionZ: param(), panningModel: '', distanceModel: '' }); return panner; },
    createOscillator: () => node({ frequency: param(), start() {}, stop() {}, type: '' }),
  };
  const runtime = createPlantPipeRuntime({ context, worldDestination: node(), monitorDestination: node() });
  runtime.update({ world: 0.05, monitor: 0.02, rear: 0.31 }, { monitorOpen: true });
  assert.equal(panner.panningModel, 'HRTF');
  assert.equal(panner.positionZ.value, 1);
  assert.ok(ramps.includes(0.31), 'rear gain is driven independently of pipe and monitor gains');
  runtime.stop();
});

test('the scene can be left, and leaving costs progress rather than the run', () => {
  // A scene that blocks input and swallows Escape is a place a run can end. The
  // previous version of this microgame had no exit at all.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const scene = main.slice(main.indexOf('function makePlantIsolationScene'), main.indexOf('function interactPlantHeader'));
  assert.match(scene, /Escape/, 'the scene handles Escape');
  assert.doesNotMatch(scene, /elapsed<duration|plantIsolationDurationMs/, 'and nothing completes on a clock');
  assert.match(scene, /That was not the pipe/);
});

test('the repair is finishable with every window effect refused', () => {
  // THE ACCESSIBILITY CONTRACT, and the reason the header is allowed a policy at
  // all. Forced to 'stable' there are no surfaces; the microgame is a hand
  // movement and the order is on a board a metre away, so nothing is lost but
  // convenience.
  const forced = 'stable';
  assert.equal(windowChoreographyPolicy('plant-header'), forced, 'the room itself is never an exception');

  const card = CONSERVATORY_PROPS.find((prop) => prop.id === 'plant-header-card');
  assert.ok(card, 'the service card exists as a prop in the room');

  // AND IT IS ACTUALLY IN THE ROOM. propsInit filters `!isSolid(rx,ry)`, so a
  // prop authored inside blockwork silently does not exist — which is how the
  // box office lost two posters. If the card is dropped, the surfaces are the
  // only place the order is written and the accessibility claim is a lie.
  FP.compile(conservatory.levels, {
    width: conservatory.width, height: conservatory.height,
    widenCorridors: conservatory.widenCorridors,
    connectors: conservatory.connectors || [], edgePortals: conservatory.edgePortals || [],
    doors: conservatory.doors || [],
  });
  PROPS.propsInit(FP);
  assert.ok(PROPS.propById('plant-header-card'), 'the card survives propsInit');
  assert.ok(PROPS.propById('plant-heating-header'), 'and so does the header it explains');
  const written = `${card.inspect.first} ${card.inspect.again}`.toLowerCase();
  for (const entry of PLANT_FITTINGS) {
    assert.ok(written.includes(entry.label.toLowerCase()), `${entry.label} is readable in the room`);
  }
  assert.ok(/bypass/.test(written), 'and so is the warning about the fourth');
  assert.ok(/clockwise/.test(written), 'and which way they close');

  // And with no surfaces at all, the tree still shuts.
  assert.equal(plantTreeComplete(workTheTree('spanner').tree), true);
  assert.equal(plantTreeComplete(workTheTree('stillson').tree), true);
});

test('the header surfaces are display-only and carry the order and the trap', () => {
  const plan = compilePlantHeaderPlan({ order: PLANT_FITTINGS, trap: PLANT_TRAP.label, seated: 1 });
  assert.equal(validateWindowChoreographyPlan(plan).ok, true);
  assert.equal(plan.cueId, PLANT_HEADER_CUE_ID);
  assert.equal(plan.mainFrame.length, 0, 'the game window is never moved');
  assert.equal(plan.input, 'none');
  assert.equal(plan.restore, 'transaction', 'nothing outlives the room');
  for (const surface of plan.surfaces) assert.equal(surface.interactive, false);

  const text = plan.surfaces.map((surface) => `${surface.title} ${surface.text}`).join(' ');
  for (const entry of PLANT_FITTINGS) assert.ok(text.includes(entry.label), `${entry.label} is on the card`);
  assert.ok(text.includes(PLANT_TRAP.label), 'and the fourth is named as not this header');

  // The needles move with the repair rather than being a still picture.
  const open = compilePlantHeaderPlan({ order: PLANT_FITTINGS, trap: PLANT_TRAP.label, seated: 0 });
  const shut = compilePlantHeaderPlan({ order: PLANT_FITTINGS, trap: PLANT_TRAP.label, seated: 3 });
  assert.notEqual(open.surfaces[1].text, shut.surfaces[1].text, 'the pressure gauge falls as fittings seat');
});
