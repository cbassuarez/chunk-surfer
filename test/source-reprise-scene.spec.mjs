import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SOURCE_REPRISE_JUMPSCARE_SECONDS,
  SOURCE_REPRISE_RETURN_SECONDS,
  makeSourceRepriseScene,
} from '../src/game/source-reprise-scene.js';
import { makeCombatScene } from '../src/game/combat.js';
import { createCombatState } from '../src/game/combat-state.js';
import { sourceCombatBattle } from '../src/data/combat-definitions.js';

const plan = {
  id: 'call-site',
  segments: [
    { kind: 'recording-room', id: 'take:1:main_b3', roomId: 'main_b3', frames: [] },
    { kind: 'recording-room', id: 'take:2:the_tub', roomId: 'the_tub', frames: [] },
  ],
};

function reachTraversal(scene) {
  scene.update(.72);
  scene.update(.62);
  assert.equal(scene.view().phase, 'traverse');
}

test('the reprise is player-paced and early R is a dry click only', () => {
  let clicks = 0;
  let commits = 0;
  const scene = makeSourceRepriseScene({ plan, onDryClick: () => { clicks += 1; }, onCommit: () => { commits += 1; } });
  scene.key({ key: 'r' });
  assert.equal(clicks, 1);
  assert.equal(commits, 0);
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
  assert.equal(scene.view().integrity, 86, 'even the fullest available pose block is never presented as exact');
  assert.match(scene.view().fault, /MISMATCH|GAP|DROP|SUBSTITUTE/);
  for (let index = 0; index < 8; index += 1) scene.key({ code: 'KeyW' });
  assert.equal(scene.view().segmentIndex, 1);
  assert.equal(scene.view().integrity, 18);
  assert.ok(scene.view().seamFlash > 0, 'the change between reconstructed places is an error seam, not a clean cut');
  assert.deepEqual(seams, [{ from: 'take:1:old', to: 'take:2:legacy', index: 1 }]);
});

test('player follows collisionless shadow through each seam to the real record mark', () => {
  const scene = makeSourceRepriseScene({ plan });
  reachTraversal(scene);
  assert.ok(scene.view().shadowStep > scene.view().step);
  for (let index = 0; index < 3; index += 1) scene.key({ code: 'KeyW' });
  assert.equal(scene.view().segmentIndex, 1);
  assert.equal(scene.view().step, 0);
  for (let index = 0; index < 3; index += 1) scene.key({ code: 'KeyW' });
  assert.equal(scene.view().phase, 'armed');
  assert.equal(scene.view().atMark, true);
});

test('holding movement traverses on the reprise clock without moving the live Source body', () => {
  const scene = makeSourceRepriseScene({ plan });
  reachTraversal(scene);
  scene.key({ code: 'KeyW' });
  scene.update(.36);
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
  scene.update(.72);
  scene.update(.62);
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
  scene.exit();
});
