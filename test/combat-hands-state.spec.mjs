import assert from 'node:assert/strict';
import test from 'node:test';
import { combatHandsSnapshot } from '../src/game/combat-hands-state.js';
import { makeCombatScene } from '../src/game/combat.js';
import { COMBAT_ACTION, COMBAT_TOOL } from '../src/game/combat-state.js';
import { PARRY_IMPACT_SECONDS, PARRY_REACTION_SECONDS, parryOpportunitySnapshot } from '../src/game/combat-parry.js';

test('the animation clock is raw elapsed time, including utility and contact durations', () => {
  const ordinary = combatHandsSnapshot({ phase: 'resolve', resolution: {
    side: 'player', action: { id: 'monitor', tool: 'recorder' }, elapsed: .336, duration: 1.2,
  } });
  assert.ok(Math.abs(ordinary.rawProgress - .28) < 1e-10);
  assert.equal(ordinary.progress, ordinary.rawProgress);
  assert.equal(ordinary.resolveProgress, ordinary.rawProgress);
  assert.equal(ordinary.actionElapsed, .336);
  assert.equal(ordinary.move, 'monitor');
  assert.equal(ordinary.readout.capture, true);
  assert.equal(ordinary.readout.recording, false, 'capture starts at the committed button contact');
  assert.equal(ordinary.readout.elapsedSeconds, .336);
  assert.equal(ordinary.readout.locationSeconds, 1.2);
  assert.equal(ordinary.readout.counterLabel, 'ACTION COUNTER');
  assert.equal(ordinary.readout.meter.db, -96, 'an unavailable audio meter is dormant');
  const utility = combatHandsSnapshot({ resolution: {
    side: 'player', action: { id: 'tune', tool: 'fork' }, elapsed: .41, duration: .82,
  } });
  assert.equal(utility.rawProgress, .5);
  const parry = parryOpportunitySnapshot({ actionKind: 'broadcast', elapsed: PARRY_IMPACT_SECONDS });
  const contact = combatHandsSnapshot({ selectedTool: 'torch', parry, resolution: {
    side: 'enemy', heldTool: 'recorder', action: { id: 'enemy', tool: 'self' },
    elapsed: PARRY_IMPACT_SECONDS, duration: PARRY_REACTION_SECONDS,
  } });
  assert.equal(contact.parry.contact, true);
  assert.ok(Math.abs(contact.rawProgress - .625) < 1e-10);
  assert.equal(contact.parry.impactSeconds, PARRY_IMPACT_SECONDS);
  assert.equal(contact.brace, true);
  assert.equal(contact.readout.capture, false, 'incoming enemy actions do not start our transport');
});

test('an enemy SELF action retains the player equipment and keeps actor/tool identities separate', () => {
  const frame = combatHandsSnapshot({ selectedTool: 'torch', resolution: {
    side: 'enemy', heldTool: 'recorder', action: { id: 'enemy', tool: 'self' }, elapsed: .3, duration: 1.2,
  } });
  assert.equal(frame.tool, 'recorder');
  assert.equal(frame.selectedTool, 'torch');
  assert.equal(frame.actionTool, 'self');
  assert.equal(frame.actionActor, 'enemy');
  assert.equal(combatHandsSnapshot({ selectedTool: 'fork' }).tool, 'fork');
  assert.equal(combatHandsSnapshot({ selectedTool: 'torch', resolution: {
    side: 'player', action: { id: 'compose', tool: 'self' }, elapsed: 0, duration: 1.2,
  } }).tool, 'self', 'an intentional empty-hand player action still releases the tool');
});

test('injury, reduced motion, wetness, and independent cosmetics survive the presentation snapshot', () => {
  const cosmetics = { faceplate: 'olive', buttons: 'signal', vfd: 'ice', flashlightHousing: 'ivory' };
  const frame = combatHandsSnapshot({ injury: 'wounded', snr: 'noise', hurt: .6,
    reducedMotion: true, wet: .5, cosmetics, time: 3.2 });
  assert.equal(frame.injury, 'wounded');
  assert.equal(frame.snr, 'noise');
  assert.equal(frame.hurt, .6);
  assert.equal(frame.reducedMotion, true);
  assert.equal(frame.wet, .5);
  assert.deepEqual(frame.cosmetics, cosmetics);
  assert.notEqual(frame.cosmetics, cosmetics, 'rendering cannot mutate the saved cosmetic object');
  assert.equal(frame.time, 3.2);
  assert.equal(combatHandsSnapshot({ wet: 9, hurt: -1 }).wet, 1);
  assert.equal(combatHandsSnapshot({ wet: 9, hurt: -1 }).hurt, 0);
});

const battleFixture = () => ({
  id: 'hand-contact-fixture', enemy: 'REFERENCE', intro: [], win: [], lose: [],
  combat: { id: 'hand-contact-fixture', kind: 'hall', enemy: 'REFERENCE', baseComposure: 100,
    movements: [{ id: 'contact', title: 'CONTACT', coherence: 100, before: [], after: [],
      intents: [{ id: 'contact:broadcast', label: 'CARRIER', kind: 'broadcast', damage: 1,
        recordable: true, playbackDamage: 5 }] }],
  },
});

function press(scene, key) { scene.key({ key }); scene.keyup({ key }); }
function select(scene, toolId, actionId) {
  const toolIndex = scene.battleView().tools.findIndex((entry) => entry.id === toolId);
  assert.ok(toolIndex >= 0);
  while (scene.battleView().selectedTool !== toolIndex) press(scene, 'ArrowRight');
  press(scene, 'ArrowDown');
  const moveIndex = scene.battleView().moves.findIndex((entry) => entry.id === actionId);
  assert.ok(moveIndex >= 0);
  while (scene.battleView().selectedMove !== moveIndex) press(scene, 'ArrowRight');
  press(scene, 'Enter');
}

test('the scene carries a committed recorder through the player-to-enemy handoff', () => {
  const scene = makeCombatScene({ battle: battleFixture(), skipOpening: true, difficulty: {},
    loadout: { tools: { recorder: true, torch: true } }, getAudio: () => null });
  scene.enter();
  try {
    select(scene, COMBAT_TOOL.RECORDER, COMBAT_ACTION.MONITOR);
    scene.update(.12);
    let view = scene.battleView();
    assert.equal(view.hands.tool, COMBAT_TOOL.RECORDER);
    assert.equal(view.hands.actionActor, 'player');
    assert.equal(view.hands.move, COMBAT_ACTION.MONITOR);
    assert.ok(Math.abs(view.hands.rawProgress - .1) < 1e-10);
    for (let i = 0; i < 100 && scene.battleView().resolution?.side !== 'enemy'; i += 1) scene.update(.05);
    view = scene.battleView();
    assert.equal(view.resolution.side, 'enemy');
    assert.equal(view.hands.tool, COMBAT_TOOL.RECORDER);
    assert.equal(view.hands.actionTool, COMBAT_TOOL.SELF);
    assert.equal(view.hands.actionActor, 'enemy');
    assert.equal(view.hands.parry.impactSeconds, PARRY_IMPACT_SECONDS);
    assert.equal(view.hands.actionDuration, PARRY_REACTION_SECONDS);
  } finally { scene.exit(); }
});
