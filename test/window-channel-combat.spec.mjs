import test from 'node:test';
import assert from 'node:assert/strict';

import { makeCombatScene } from '../src/game/combat.js';
import { authoredCombatProfile } from '../src/data/combat-definitions.js';

const flush = async () => {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
};

function harness() {
  const profile = authoredCombatProfile('natatorium');
  const battle = {
    id: 'natatorium', enemy: 'THE TEST RETURN', intro: [], win: [], lose: [],
    combat: {
      id: 'natatorium', enemy: 'THE TEST RETURN', baseComposure: 40,
      ...profile,
      movements: [profile.movements[0]],
    },
  };
  let releaseChannel;
  const channel = new Promise((resolve) => { releaseChannel = resolve; });
  const calls = [];
  const noop = () => {};
  const interference = {
    enter: async () => {},
    movement: async (event) => calls.push(['movement', event.id]),
    beginWindowChannel: () => channel,
    completeWindowDefense: async () => {
      calls.push(['defense']);
      return { defended: true, returned: true, hits: 1, tier: 2 };
    },
    resolveWindowChannel: async () => { calls.push(['restore']); },
    impact: async (event) => { calls.push(['impact', event.received]); },
    finish: async () => {},
    active: () => true,
    statusLine: () => '',
    channelState: () => ({ charge: calls.filter(([kind]) => kind === 'defense').length }),
  };
  const scene = makeCombatScene({
    battle,
    difficulty: {},
    getAudio: () => null,
    playSound: noop,
    fx: { stopCues: noop, flash: noop, cue: noop, glitch: noop, shake: noop },
    audio: { stopTyping: noop, menuMove: noop, menuConfirm: noop },
    loadout: { tools: {} },
    resources: { playImpact: noop, playTool: noop },
    interference,
  });
  scene.enter();
  scene.key({ key: 'ArrowDown' });
  scene.key({ key: 'Enter' });
  scene.update(2);
  return { scene, calls, releaseChannel };
}

test('the real enemy beat pauses for channel defense, then requires the ordinary parry before RETURN', async () => {
  const { scene, calls, releaseChannel } = harness();
  assert.equal(scene.battleView().phase, 'channel');
  assert.deepEqual(calls.find(([kind]) => kind === 'movement'), ['movement', 'room']);
  scene.update(20);
  assert.equal(scene.battleView().resolution.elapsed, 0, 'combat time cannot run behind the hostile windows');

  releaseChannel({
    outcome: 'cut', elapsedMs: 1000, deadlineMs: 5000, reacquiredMain: true, scene: { movementId: 'room' },
  });
  await flush();
  assert.equal(scene.battleView().phase, 'resolve');
  assert.equal(scene.battleView().resolution.windowChannel.reacquiredMain, true);
  const coherenceBefore = scene.battleView().state.movementCoherence;
  scene.key({ key: 'Enter' });
  await flush();
  assert.equal(calls.filter(([kind]) => kind === 'defense').length, 1);
  assert.equal(scene.battleView().resolution.windowDefense.returned, true);
  assert.equal(coherenceBefore - scene.battleView().state.movementCoherence, 10);
  scene.exit();
});

test('channel timeout spends the parry but applies no damage beyond the one ordinary enemy packet', async () => {
  const { scene, calls, releaseChannel } = harness();
  const composureAfterEnemyReducer = scene.battleView().state.composure;
  releaseChannel({
    outcome: 'timeout', elapsedMs: 5000, deadlineMs: 5000, scene: { movementId: 'room' },
  });
  await flush();
  assert.equal(scene.battleView().resolution.parry.spent, true);
  scene.update(.2);
  scene.update(2);
  await flush();
  assert.equal(scene.battleView().state.composure, composureAfterEnemyReducer);
  assert.equal(calls.filter(([kind]) => kind === 'defense').length, 0);
  assert.equal(calls.filter(([kind]) => kind === 'impact').length, 1);
  scene.exit();
});
