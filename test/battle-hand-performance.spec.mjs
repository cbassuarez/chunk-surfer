import assert from 'node:assert/strict';
import test from 'node:test';
import { combatHandsSnapshot } from '../src/game/combat-hands-state.js';
import { PARRY_CONTACT_HOLD_SECONDS, PARRY_IMPACT_SECONDS, PARRY_REACTION_SECONDS,
  parryOpportunitySnapshot } from '../src/game/combat-parry.js';
import { HAND_LIMITS } from '../src/render/battle-hand-rig.js';
import { battleHandFraming, battleHandPerformance } from '../src/render/battle-hand-performance.js';

function actionFrame(elapsed, { move = 'monitor', tool = 'recorder', duration = 1.2, ...frame } = {}) {
  return combatHandsSnapshot({ phase: 'resolve', ...frame,
    resolution: { side: 'player', action: { id: move, tool }, elapsed, duration } });
}

test('instrument operation reaches contact at the actual 28 percent impact and recovers before settle', () => {
  const ready = battleHandPerformance(actionFrame(0));
  const approach = battleHandPerformance(actionFrame(1.2 * .14));
  const contact = battleHandPerformance(actionFrame(1.2 * .28));
  const held = battleHandPerformance(actionFrame(1.2 * .35));
  const recover = battleHandPerformance(actionFrame(1.2 * .6));
  const settled = battleHandPerformance(actionFrame(1.2));
  assert.equal(ready.operation, 0);
  assert.ok(approach.operation > 0 && approach.operation < 1);
  assert.equal(contact.operation, 1);
  assert.equal(held.operation, 1);
  assert.ok(recover.operation > 0 && recover.operation < 1);
  assert.equal(settled.operation, 0);
  assert.equal(contact.rawProgress, .28, 'HUD easing must never be applied to the animation input');
  assert.equal(battleHandPerformance(actionFrame(.82 * .28, { move: 'tune', tool: 'fork', duration: .82 })).operation, 1,
    'utility actions reach their own contact rather than a hard-coded 1.2-second contact');
});

function reactionFrame(atSeconds, extra = {}) {
  return combatHandsSnapshot({ phase: 'resolve', selectedTool: 'recorder', ...extra,
    parry: parryOpportunitySnapshot({ actionKind: 'broadcast', elapsed: atSeconds, attempted: true, parried: true }),
    resolution: { side: 'enemy', heldTool: 'recorder', action: { id: 'enemy', tool: 'self' },
      elapsed: atSeconds, duration: PARRY_REACTION_SECONDS } });
}

test('parry interception holds the whole authored contact interval while the recorder remains latched', () => {
  const before = battleHandPerformance(reactionFrame(PARRY_IMPACT_SECONDS - .14));
  assert.ok(before.intercept > 0 && before.intercept < 1);
  for (const elapsed of [PARRY_IMPACT_SECONDS, PARRY_IMPACT_SECONDS + PARRY_CONTACT_HOLD_SECONDS / 2,
    PARRY_IMPACT_SECONDS + PARRY_CONTACT_HOLD_SECONDS]) {
    const frame = reactionFrame(elapsed);
    const pose = battleHandPerformance(frame);
    assert.equal(frame.tool, 'recorder');
    assert.equal(pose.intercept, 1, `guard must remain in contact at ${elapsed}s`);
    assert.equal(pose.operation, 0, 'an incoming SELF attack must not operate our recorder');
  }
  const release = battleHandPerformance(reactionFrame(PARRY_IMPACT_SECONDS + PARRY_CONTACT_HOLD_SECONDS + .15));
  assert.ok(release.intercept > 0 && release.intercept < 1);
  assert.equal(battleHandPerformance(reactionFrame(PARRY_REACTION_SECONDS)).intercept, 0);
});

test('reduced motion removes idle drift and tremor while preserving button contact and defensive poses', () => {
  const still = battleHandPerformance(actionFrame(.336, { injury: 'critical', time: 1, reducedMotion: true }));
  const later = battleHandPerformance(actionFrame(.336, { injury: 'critical', time: 15, reducedMotion: true }));
  assert.equal(still.operation, 1);
  assert.equal(still.travel, 0);
  assert.deepEqual(still.leftOffset, later.leftOffset);
  assert.deepEqual(still.toolOffset, later.toolOffset);
  assert.deepEqual(still.leftFingers, later.leftFingers);
  const full = battleHandPerformance(actionFrame(.336, { injury: 'critical', time: 1 }));
  assert.notDeepEqual(still.leftOffset, full.leftOffset, 'normal motion retains the authored injured tremor');
  const guarded = battleHandPerformance(reactionFrame(PARRY_IMPACT_SECONDS, { reducedMotion: true }));
  assert.equal(guarded.intercept, 1);
  assert.equal(guarded.guard, true);
});

test('authored moves distinguish a defensive palm, a breath, a voice, a drink, and actual tool strikes', () => {
  for (const [move, tool, handling] of [['compose', 'self', 'breathe'], ['shout', 'self', 'voice'],
    ['steady-hands', 'coffee', 'drink'], ['monitor', 'recorder', 'operate'], ['listen', 'self', 'listen']]) {
    const pose = battleHandPerformance(actionFrame(.336, { move, tool }));
    assert.equal(pose.handling, handling);
    assert.equal(pose.strike, false, `${move} must not become an invented punch`);
  }
  assert.equal(battleHandPerformance(actionFrame(.336, { move: 'steady-hands', tool: 'coffee' })).control, 'drink');
  assert.equal(battleHandPerformance(actionFrame(.336, { move: 'swing', tool: 'spanner' })).strike, true);
  assert.equal(battleHandPerformance(actionFrame(.82 * .28, { move: 'tune', tool: 'fork', duration: .82 })).control, 'strike');
  assert.equal(battleHandPerformance(actionFrame(.336, { move: 'invert', tool: 'rig' })).control, 'invert');
  assert.equal(battleHandPerformance(actionFrame(.336, { move: 'master-take', tool: 'recorder' })).control, 'rec',
    'MASTER TAKE is a capture, not the TAKE/playback cap despite its name');
  assert.equal(battleHandPerformance(actionFrame(.336, { move: 'radio-decoy', tool: 'radio' })).control, 'transmit');
  const held = battleHandPerformance(actionFrame(.336, { move: 'hold', tool: 'self' }));
  const returned = battleHandPerformance(actionFrame(1.2, { move: 'hold', tool: 'self' }));
  assert.equal(held.guard, true);
  assert.equal(held.operation, 0);
  assert.equal(returned.guard, false, 'the palm returns under control at the end of HOLD');
});

test('free-hand flexion stays within anatomical joint limits at every injury and reaction extreme', () => {
  const bounds = [HAND_LIMITS.mcp, HAND_LIMITS.pip, HAND_LIMITS.dip];
  for (const injury of ['steady', 'hurt', 'wounded', 'critical']) {
    for (const hurt of [0, .5, 1]) {
      for (const brace of [false, true]) {
        const pose = battleHandPerformance({ injury, hurt, brace, time: 3.2 });
        for (const [finger, flexion] of Object.entries(pose.leftFingers)) {
          flexion.forEach((value, joint) => assert.ok(value >= bounds[joint][0] && value <= bounds[joint][1],
            `${finger} joint ${joint} exceeds a flexion limit under ${injury}/${hurt}/${brace}`));
        }
        for (const [channel, range] of Object.entries({ opposition: HAND_LIMITS.opposition,
          abduction: HAND_LIMITS.abduction, mcp: HAND_LIMITS.thumbMcp, ip: HAND_LIMITS.thumbIp })) {
          assert.ok(pose.thumb[channel] >= range[0] && pose.thumb[channel] <= range[1], channel);
        }
      }
    }
  }
});

test('brace, committed parry and injury produce readable whole-hand poses while retaining the ready pose', () => {
  const ready = battleHandPerformance({ reducedMotion: true });
  assert.deepEqual(ready.leftOffset, [0, 0, 0]);
  assert.deepEqual(ready.toolOffset, [0, 0, 0]);
  assert.deepEqual(ready.leftRotation, [-.45, Math.PI - .50, .32]);
  const brace = battleHandPerformance({ brace: true, reducedMotion: true });
  assert.ok(brace.leftOffset[1] - ready.leftOffset[1] >= .05, 'brace raises a full defensive hand');
  assert.ok(brace.spread.pinky > ready.spread.pinky + .07, 'brace has an open silhouette');
  const parry = battleHandPerformance(reactionFrame(PARRY_IMPACT_SECONDS, { reducedMotion: true }));
  assert.ok(parry.leftOffset[0] - brace.leftOffset[0] >= .10, 'committed parry sweeps across the body');
  assert.ok(parry.leftRotation[2] - brace.leftRotation[2] > .8, 'deflection changes the whole wrist angle');
  const incoming = battleHandPerformance({ actionActor: 'enemy', actionElapsed: PARRY_IMPACT_SECONDS,
    parry: parryOpportunitySnapshot({ actionKind: 'broadcast', elapsed: PARRY_IMPACT_SECONDS }), brace: true });
  assert.equal(incoming.intercept, 0, 'an unattempted parry cannot fabricate a successful deflection');
  const critical = battleHandPerformance({ injury: 'critical', reducedMotion: true });
  assert.ok(critical.leftFingers.ring[0] > ready.leftFingers.ring[0] + .4, 'injury visibly protects the fingers');
  assert.ok(critical.toolOffset[1] < -.02, 'the injured holding arm sags as a whole assembly');
  const hurt = battleHandPerformance({ hurt: 1, reducedMotion: true });
  assert.ok(hurt.leftOffset[2] > .05 && hurt.leftFingers.index[0] > .7, 'impact pulls a clenched hand back toward the body');
  const recovering = battleHandPerformance(combatHandsSnapshot({ hurt: 0, hurtAge: .45, injury: 'wounded' }));
  assert.ok(recovering.flinch > .2, 'protective hand recovery outlasts the short impact flash');
  assert.equal(battleHandPerformance(combatHandsSnapshot({ hurt: 0, hurtAge: .71 })).flinch, 0);
  assert.equal(battleHandPerformance(combatHandsSnapshot()).flinch, 0, 'no hit age means no fabricated recoil');
});

test('framing preserves metric anatomy across window aspect ratios and moves whole assemblies inside the aperture', () => {
  const tall = battleHandFraming({ width: 360, height: 330 });
  const wide = battleHandFraming({ width: 1280, height: 330 });
  const scaled = battleHandFraming({ width: 720, height: 660 });
  assert.equal(tall.scale, wide.scale, 'width must not stretch a hand');
  assert.equal(tall.extent, wide.extent);
  assert.deepEqual(tall.leftWrist, scaled.leftWrist, 'doubling pixel dimensions preserves metric placement');
  assert.deepEqual(tall.tool, scaled.tool);
  for (const width of [300, 360, 640, 1280, 1920]) {
    const f = battleHandFraming({ width, height: 330,
      left: { x: -500, y: 50, w: 200, h: 240 }, right: { x: 2000, y: 40, w: 230, h: 230 } });
    assert.ok(Math.abs(f.leftWrist[0]) + .065 <= f.halfWidth + 1e-10);
    assert.ok(Math.abs(f.tool[0]) + .15 <= f.halfWidth + 1e-10);
  }
});
