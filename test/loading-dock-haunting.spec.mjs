import assert from 'node:assert/strict';
import {
  DOCK_ACOUSTIC_PROP_IDS,
  DOCK_HAUNTING_PHASE,
  DOCK_HAUNTING_VARIANT,
  DOCK_PORTAL,
  deriveDockHauntingEligibility,
  dockExitAttemptShouldSpeak,
  dockEndingBeat,
  dockHauntingDynamicInstances,
  dockHauntingEvents,
  dockHauntingLights,
  dockHauntingSnapshot,
  freshDockTransitState,
  makeLoadingDockHauntingScene,
  reduceDockTransit,
} from '../src/game/loading-dock.js';

const eligible = (extra = {}) => deriveDockHauntingEligibility({
  departed: true,
  spent: false,
  transitionKind: 'step',
  entryPortal: DOCK_PORTAL.SERVICE,
  ...extra,
});

assert.equal(eligible().variant, DOCK_HAUNTING_VARIANT.BEHIND_FRAME);
assert.equal(eligible({ entryPortal: DOCK_PORTAL.FOYER }).variant, DOCK_HAUNTING_VARIANT.CROSS_DOCK);
assert.equal(eligible({ drankCoffee: true, completedTakes: 0 }).eligible, false);
assert.equal(eligible({ drankCoffee: true, completedTakes: 1 }).variant, DOCK_HAUNTING_VARIANT.EXIT_BLOCK);
assert.equal(eligible({ transitionKind: 'load' }).eligible, false);
assert.equal(eligible({ transitionKind: 'warp' }).eligible, false);
assert.equal(eligible({ spent: true }).eligible, false);
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.95, hasDoor:true }), true);
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.1, hasDoor:true }), false, 'strafing beside a leaf stays quiet');
assert.equal(dockExitAttemptShouldSpeak({ forwardIntent:.95, hasDoor:false }), false, 'a zone seam is not an exit prompt');

let transit = freshDockTransitState({ inside: true });
transit = reduceDockTransit(transit, { kind: 'step', fromDock: true, toDock: false });
assert.equal(transit.departedNow, false, 'entering the neutral gap is not yet crossing the service leaf');
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: null, toPortal: DOCK_PORTAL.SERVICE, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: DOCK_PORTAL.SERVICE, toPortal: null, toDock: false });
assert.equal(transit.departedNow, true);
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: null, toPortal: DOCK_PORTAL.SERVICE, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromPortal: DOCK_PORTAL.SERVICE, toPortal: null, toDock: false });
transit = reduceDockTransit(transit, { kind: 'step', fromDock: false, toDock: true });
assert.equal(transit.enteredNow, true);
assert.equal(transit.entryPortal, DOCK_PORTAL.SERVICE);
const warpedInside = reduceDockTransit(freshDockTransitState({ inside:false }), { kind:'step', fromDock:true, toDock:true });
assert.equal(warpedInside.enteredNow, false, 'a first step after a warp inside is not a threshold crossing');

const heard = DOCK_ACOUSTIC_PROP_IDS.slice(0, 2);
const events = dockHauntingEvents({ auditioned: heard, effects: 'full' });
assert.deepEqual(events.filter((event) => event.type === 'answer').map((event) => event.propId), heard);
assert.equal(events.filter((event) => event.type === 'rupture').length, 3);
assert.equal(dockHauntingEvents({ auditioned: heard, effects: 'reduced' }).filter((event) => event.type === 'rupture').length, 1);
assert.equal(dockHauntingEvents({ auditioned: [], effects: 'off' }).some((event) => event.type === 'frame-creak'), true);

assert.equal(dockHauntingSnapshot({ seconds: 2 }).phase, DOCK_HAUNTING_PHASE.REVEAL);
assert.equal(dockHauntingSnapshot({ seconds: 3 }).literal, true);
assert.equal(dockHauntingSnapshot({ seconds: 5.6 }).blackout, true);
assert.ok(dockHauntingLights(dockHauntingSnapshot({ seconds: 2 })).length <= 6);
assert.deepEqual(dockHauntingLights(dockHauntingSnapshot({ seconds: 5.6 })), []);

const reflection = dockHauntingDynamicInstances(dockHauntingSnapshot({ seconds: 1.8 }));
assert.deepEqual(reflection.map((entry) => entry.id), ['dock-surfer-reflection']);
const literal = dockHauntingDynamicInstances(dockHauntingSnapshot({ seconds: 3, variant:DOCK_HAUNTING_VARIANT.BEHIND_FRAME }));
assert.deepEqual(literal.map((entry) => entry.id), ['dock-surfer-literal']);

const fired = [];
const frames = [];
let completed = 0;
const scene = makeLoadingDockHauntingScene({
  variant: DOCK_HAUNTING_VARIANT.CROSS_DOCK,
  auditioned: heard,
  onEvent: (event) => fired.push(event),
  onUpdate: (frame) => frames.push(frame),
  onComplete: () => { completed += 1; },
});
assert.equal(scene.blocksInput, true);
assert.equal(scene.blocksWorld, true);
assert.equal(scene.allowsLook, true);
for (let i = 0; i < 70; i += 1) scene.update(.1);
assert.equal(completed, 1);
assert.equal(scene.view().complete, true);
assert.deepEqual(fired.filter((event) => event.type === 'answer').map((event) => event.propId), heard);
assert.ok(frames.some((frame) => frame.reflection));
assert.ok(frames.some((frame) => frame.literal));

assert.match(dockEndingBeat({ spent:true, variant:DOCK_HAUNTING_VARIANT.BEHIND_FRAME, supernatural:true })[0].text, /already knew where I would come back/);
assert.match(dockEndingBeat({ spent:true, variant:DOCK_HAUNTING_VARIANT.EXIT_BLOCK, drankCoffee:true })[0].text, /except the order/);
assert.deepEqual(dockEndingBeat({ spent:false }), []);

console.log('loading dock haunting contracts passed');
