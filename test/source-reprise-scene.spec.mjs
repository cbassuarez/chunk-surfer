import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_REPRISE_CAST_SECONDS,
  SOURCE_REPRISE_JUMPSCARE_SECONDS,
  SOURCE_REPRISE_RECOGNITION_SECONDS,
  SOURCE_REPRISE_RETURN_SECONDS,
  SOURCE_REPRISE_UNFOLD_SECONDS,
  makeSourceRepriseScene,
} from '../src/game/source-reprise-scene.js';
import { makeCombatScene } from '../src/game/combat.js';
import { createCombatState } from '../src/game/combat-state.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';

const plan = {
  id: 'call-site',
  segments: [
    { kind: 'recording-room', id: 'take:1:main_b3', roomId: 'main_b3', mark:{x:4,y:0}, frames: [{x:0,y:0},{x:4,y:0}] },
    { kind: 'recording-room', id: 'take:2:the_tub', roomId: 'the_tub', mark:{x:14,y:0}, frames: [{x:10,y:0},{x:14,y:0}] },
  ],
};

function reachTraversal(scene) {
  scene.update(SOURCE_REPRISE_CAST_SECONDS);
  scene.update(SOURCE_REPRISE_UNFOLD_SECONDS);
  assert.equal(scene.view().phase, 'traverse');
}

function walkUntil(scene, predicate) {
  for (let guard = 0; guard < 100 && !predicate(scene.view()); guard += 1) scene.key({ code:'KeyW' });
  assert.ok(predicate(scene.view()), 'route reached the expected state');
}

test('the reprise is player-paced and early R is a dry click only', () => {
  let clicks = 0;
  let commits = 0;
  const scene = makeSourceRepriseScene({ plan, onDryClick: () => { clicks += 1; }, onCommit: () => { commits += 1; } });
  scene.key({ key: 'r' });
  assert.equal(clicks, 1);
  assert.equal(commits, 0);
  assert.equal(scene.view().recordRefused, true, 'the invalid punch-in stays visibly rejected');
  scene.update(.91);
  assert.equal(scene.view().recordRefused, false);
  reachTraversal(scene);
  scene.update(90);
  assert.equal(scene.view().phase, 'traverse', 'waiting cannot fail or auto-finish the walk');
});

test('every reprise declares itself lossy and missing pose data degrades visibly', () => {
  const seams = [];
  const scene = makeSourceRepriseScene({
    plan: {
      id: 'borrowed-body',
      segments: [
        { kind: 'recording-room', id: 'take:1:old', roomId: 'old', frames: Array.from({ length: 96 }, (_, t) => ({ t, x: t, y: 0 })) },
        { kind: 'recording-room', id: 'take:2:legacy', roomId: 'legacy', frames: [], fallback: true },
      ],
    },
    onSeam: (seam) => seams.push(seam),
  });
  reachTraversal(scene);
  assert.equal(scene.view().reconstruction, 'lossy');
  assert.equal(scene.view().segment.reconstruction, 'lossy');
  assert.equal(scene.view().integrity, 61, 'the second movement is more corrupt even with a full pose block');
  assert.ok(scene.view().corruption >= .4);
  assert.match(scene.view().fault, /MISMATCH|GAP|DROP|SUBSTITUTE/);
  walkUntil(scene, (view) => view.segmentIndex === 1);
  assert.equal(scene.view().segmentIndex, 1);
  assert.equal(scene.view().integrity, 18);
  assert.ok(scene.view().seamFlash > 0, 'the change between reconstructed places is an error seam, not a clean cut');
  assert.deepEqual(seams.map(({from,to,index})=>({from,to,index})), [{ from: 'take:1:old', to: 'take:2:legacy', index: 1 }]);
  assert.ok(seams[0].corruption > .4);
});

test('player follows collisionless shadow through each seam to the real record mark', () => {
  const scene = makeSourceRepriseScene({ plan });
  reachTraversal(scene);
  assert.ok(scene.view().shadowStep > scene.view().step);
  walkUntil(scene, (view) => view.segmentIndex === 1);
  assert.equal(scene.view().segmentIndex, 1);
  assert.equal(scene.view().step, 0);
  walkUntil(scene, (view) => view.phase === 'recognition');
  assert.equal(scene.view().shadowPose.stageFromMark, true, 'the old body is staged beyond the camera at the mark');
  assert.ok(scene.view().shadowPose.stageDistance > 1.7);
  const yawBefore = scene.view().shadowPose.yaw;
  scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS / 2);
  assert.ok(scene.view().shadowPose.yaw > yawBefore, 'the old player shadow turns toward the camera before it resolves');
  scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS / 2);
  assert.equal(scene.view().phase, 'armed');
  assert.equal(scene.view().atMark, true);
  assert.deepEqual(
    { x:scene.view().pose.x, y:scene.view().pose.y },
    { x:14, y:0 },
    'record arms at the authentic saved mark',
  );
});

test('holding movement traverses on the reprise clock without moving the live Source body', () => {
  const scene = makeSourceRepriseScene({ plan });
  reachTraversal(scene);
  scene.key({ code: 'KeyW' });
  scene.update(.72);
  assert.equal(scene.view().segmentIndex, 1);
  scene.keyup({ code: 'KeyW' });
  const stopped = scene.view().step;
  scene.update(2);
  assert.equal(scene.view().step, stopped);
});

test('R checkpoints before the scare and returns after exactly four 168 BPM beats', () => {
  const order = [];
  const scene = makeSourceRepriseScene({
    plan: { id: 'call-site', segments: [] },
    onCommit: () => order.push('checkpoint'),
    onDone: () => order.push('return'),
  });
  scene.update(SOURCE_REPRISE_CAST_SECONDS);
  scene.update(SOURCE_REPRISE_UNFOLD_SECONDS);
  assert.equal(scene.view().phase, 'recognition');
  scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS);
  assert.equal(scene.view().phase, 'armed');
  scene.key({ key: 'r' });
  assert.deepEqual(order, ['checkpoint']);
  assert.equal(scene.view().phase, 'jumpscare');
  scene.update(SOURCE_REPRISE_JUMPSCARE_SECONDS);
  assert.equal(scene.view().phase, 'rupture');
  scene.update(SOURCE_REPRISE_RETURN_SECONDS - SOURCE_REPRISE_JUMPSCARE_SECONDS - .001);
  assert.deepEqual(order, ['checkpoint']);
  scene.update(.001);
  assert.deepEqual(order, ['checkpoint', 'return']);
});

test('transport phases expose one ordered audiovisual gesture from throw through rupture', () => {
  const phases=[];
  const scene=makeSourceRepriseScene({plan,onPhase:({phase})=>phases.push(phase)});
  scene.enter();
  reachTraversal(scene);
  walkUntil(scene,(view)=>view.phase==='recognition');
  scene.update(SOURCE_REPRISE_RECOGNITION_SECONDS);
  scene.key({code:'KeyR'});
  scene.update(SOURCE_REPRISE_JUMPSCARE_SECONDS);
  assert.deepEqual(phases,['cast','unfold','traverse','recognition','armed','jumpscare','rupture']);
});

test('Source combat can resume directly at a saved movement without replaying cleared movements', () => {
  const definition = sourceCombatBattle().combat;
  const state = createCombatState(definition, { startingMovementIndex: 2 });
  assert.equal(state.movementIndex, 2);
  assert.equal(state.movementCoherence, definition.movements[2].coherence);
  assert.equal(state.last.notice, definition.movements[2].title);
});

test('combat freezes in an explicit interlude until the reprise returns its resume verb', () => {
  const battle = structuredClone(sourceCombatBattle());
  battle.intro = [];
  battle.combat.movements.forEach((movement) => { movement.before = []; movement.after = []; });
  let handoff = null;
  const scene = makeCombatScene({
    battle,
    difficulty: {},
    onMovementInterlude: (value) => { handoff = value; return true; },
  });
  scene.enter();
  assert.equal(scene.battleView().phase, 'interlude');
  assert.equal(handoff.id, 'call-site');
  scene.update(90);
  assert.equal(scene.battleView().phase, 'interlude');
  handoff.resume();
  assert.equal(scene.battleView().phase, 'tool');
  assert.equal(scene.battleView().repriseReturn.id, 'call-site');
  assert.equal(scene.battleView().notice, 'TAKE ACCEPTED · SOURCE WRITE');
  scene.update(.85);
  assert.equal(scene.battleView().repriseReturn, null);
  scene.exit();
});

test('world-backed reprise exposes the recovered room pose and always clears its shadow lease on exit', () => {
  const shadows=[];
  let exited=0;
  const scene=makeSourceRepriseScene({plan,worldBacked:true,onShadowFrame:(frame)=>shadows.push(frame),onExit:()=>{exited+=1;}});
  scene.enter();
  scene.update(SOURCE_REPRISE_CAST_SECONDS);
  assert.equal(scene.worldView().yaw,0,'the room reacquires the saved camera direction while it resolves');
  scene.update(SOURCE_REPRISE_UNFOLD_SECONDS);
  assert.equal(scene.view().phase,'traverse');
  assert.deepEqual({x:scene.worldView().x,y:scene.worldView().y},{x:0,y:0});
  assert.equal(scene.worldView().yaw,undefined,'the player may look freely once the recovered route is playable');
  scene.key({code:'KeyW'});
  assert.ok(scene.worldView().x>0&&scene.worldView().x<=4);
  assert.ok(shadows.some(Boolean));
  scene.exit();scene.exit();
  assert.equal(shadows.at(-1),null);
  assert.equal(exited,1);
});
