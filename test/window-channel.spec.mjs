import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyWindowChannelReturn,
  createCombatState,
} from '../src/game/combat-state.js';
import {
  authoredCombatProfile,
  sourceCombatDefinition,
} from '../src/data/combat-definitions.js';
import { createBattleInterferenceDirector } from '../src/game/interference-director.js';
import { psychProfileChoice } from '../src/game/psychological-profile.js';
import { PARRY_IMPACT_SECONDS } from '../src/game/combat-parry.js';
import {
  WINDOW_CHANNEL_BATTLE_IDS,
  advanceWindowChannelScene,
  availableWindowReturnTier,
  canonicalWindowChannelBattleId,
  channelElapsedToParrySeconds,
  chargeWindowReturn,
  compileWindowChannelScene,
  freshWindowChannelProgress,
  spendWindowReturn,
  validateWindowChannelScene,
  windowChannelDeadlineMs,
} from '../src/game/window-channel.js';

const definition = (id) => id === 'source-final'
  ? sourceCombatDefinition()
  : {
      id,
      enemy: id.toUpperCase(),
      baseComposure: 40,
      ...authoredCombatProfile(id),
    };

test('every story movement owns one deterministic battle-specific channel tableau', () => {
  const expectedMotif = {
    natatorium: 'waterline',
    hall: 'watching-heads',
    practice: 'wrong-instrument',
    chapel: 'recordist',
    'source-final': 'call-site',
  };
  for (const battleId of WINDOW_CHANNEL_BATTLE_IDS) {
    const combat = definition(battleId);
    for (const [movementIndex, movement] of combat.movements.entries()) {
      const intent = movement.intents.find(({ kind }) => ['broadcast', 'overload', 'loop'].includes(kind));
      assert.ok(intent, `${battleId}:${movement.id} has an authored hostile strike`);
      const input = {
        battleId,
        movementId: movement.id,
        movementIndex,
        movementTitle: movement.title,
        intentId: intent.id,
        intentLabel: intent.label,
        intentKind: intent.kind,
        windowScale: 1,
      };
      const left = compileWindowChannelScene(input);
      const right = compileWindowChannelScene(input);
      assert.deepEqual(left, right, `${battleId}:${movement.id} is deterministic`);
      assert.ok(validateWindowChannelScene(left));
      assert.ok(left.motifs.includes(expectedMotif[battleId]));
      assert.ok(left.channelCount >= 1 && left.channelCount <= 3);
      const parried = advanceWindowChannelScene(left, { phase: 'parry', outcome: 'parried', parried: true });
      const damaged = advanceWindowChannelScene(left, { phase: 'damage', outcome: 'landed', damage: 10 });
      const returned = advanceWindowChannelScene(left, { phase: 'return', outcome: 'return', returnTier: 3, returnHits: 2 });
      assert.notDeepEqual(parried.resolution, damaged.resolution);
      assert.deepEqual(returned.resolution, {
        outcome: 'return', parried: false, damage: 0, returnTier: 3, returnHits: 2, phaseBreak: false,
      });
      assert.equal(JSON.stringify(left).includes('operator'), false);
    }
  }
  assert.equal(canonicalWindowChannelBattleId('training'), null);
  assert.equal(canonicalWindowChannelBattleId('practice-room-hush'), null);
});

test('assistance scales the shared channel deadline and elapsed desktop time consumes the parry phrase', () => {
  assert.equal(windowChannelDeadlineMs({ battleId: 'natatorium', movementIndex: 0 }), 7000);
  assert.equal(windowChannelDeadlineMs({ battleId: 'hall', movementIndex: 0 }), 5000);
  assert.equal(windowChannelDeadlineMs({ battleId: 'hall', movementIndex: 0, windowScale: 1.5 }), 7500);
  assert.equal(channelElapsedToParrySeconds(0, 5000), 0);
  assert.equal(channelElapsedToParrySeconds(2500, 5000), PARRY_IMPACT_SECONDS / 2);
  assert.equal(channelElapsedToParrySeconds(5000, 5000), PARRY_IMPACT_SECONDS);
});

test('Natatorium is defense-only; later battles bank two- and three-pass RETURN exactly once', () => {
  let natatorium = freshWindowChannelProgress('natatorium');
  natatorium = chargeWindowReturn(natatorium, { defended: true });
  assert.equal(natatorium.charge, 0);
  assert.equal(availableWindowReturnTier(natatorium), 0);

  let hall = freshWindowChannelProgress('hall');
  hall = chargeWindowReturn(hall, { defended: true });
  assert.equal(availableWindowReturnTier(hall), 0);
  hall = chargeWindowReturn(hall, { defended: true });
  assert.equal(availableWindowReturnTier(hall), 2);
  hall = chargeWindowReturn(hall, { defended: true });
  assert.equal(availableWindowReturnTier(hall), 3);
  const spent = spendWindowReturn(hall);
  assert.equal(spent.tier, 3);
  assert.equal(spent.hits, 2);
  assert.equal(spendWindowReturn(spent.state).hits, 0);
  assert.deepEqual(freshWindowChannelProgress('practice'), {
    battleId: 'practice', charge: 0, returned: false,
  }, 'a new battle cannot inherit the Hall charge');
  assert.deepEqual(freshWindowChannelProgress('hall', { battleId: 'hall', charge: 2 }), {
    battleId: 'hall', charge: 2, returned: false,
  }, 'the same active battle may recover its pending charge');
  assert.deepEqual(freshWindowChannelProgress('practice', { battleId: 'hall', charge: 3, returned: true }), {
    battleId: 'practice', charge: 0, returned: false,
  }, 'a recovered channel record cannot cross battle ids');
});

test('RETURN uses ordinary coherence transitions and standard perfect-counter hit size', () => {
  const initial = createCombatState(definition('hall'));
  const weak = applyWindowChannelReturn(initial, { hits: 1, tier: 2 });
  assert.equal(initial.movementCoherence - weak.movementCoherence, 10);
  assert.deepEqual(weak.last.windowReturn, { tier: 2, hits: 1 });

  const strong = applyWindowChannelReturn(initial, { hits: 2, tier: 3 });
  assert.equal(initial.movementCoherence - strong.movementCoherence, 20);
  assert.deepEqual(strong.last.windowReturn, { tier: 3, hits: 2 });

  const atBreak = { ...initial, movementCoherence: 10 };
  const transitioned = applyWindowChannelReturn(atBreak, { hits: 1, tier: 2 });
  assert.deepEqual(transitioned.last.transition, { from: 0, to: 1 });
  assert.equal(transitioned.movementIndex, 1);
});

test('the director schedules at most one idempotent channel attack per movement', async () => {
  const effectsLog = [];
  const returnChoices = ['cut', 'return'];
  const director = createBattleInterferenceDirector({
    getSettings: () => ({ enabled: true, intensity: 'hostile' }),
    getProfile: () => psychProfileChoice(true),
    getContext: () => ({ inputDevice: 'controller' }),
    effects: {
      arrangeMovement: async (scene) => effectsLog.push(['movement', scene.movementId]),
      beginWindowChannel: async (scene) => {
        effectsLog.push(['attack', scene.movementId]);
        return { outcome: 'cut', elapsedMs: 1000, reacquiredMain: true };
      },
      offerWindowReturn: async () => ({ outcome: returnChoices.shift() || 'cut' }),
      resolveWindowChannel: async () => true,
      channelInput: () => true,
    },
  });
  const hook = director.forBattle('hall', 'hall');
  const combat = definition('hall');
  for (const [movementIndex, movement] of combat.movements.entries()) {
    await hook.movement({ id: movement.id, index: movementIndex, title: movement.title });
    const intent = movement.intents.find(({ kind }) => ['broadcast', 'overload', 'loop'].includes(kind));
    const request = {
      movementIndex, movementId: movement.id, movementTitle: movement.title,
      intentId: intent.id, intentLabel: intent.label, intentKind: intent.kind, windowScale: 1,
    };
    assert.equal((await hook.beginWindowChannel(request)).outcome, 'cut');
    assert.equal((await hook.beginWindowChannel(request)).duplicate, true);
    await hook.completeWindowDefense();
    await hook.resolveWindowChannel();
  }
  assert.deepEqual(effectsLog.filter(([kind]) => kind === 'attack').map(([, id]) => id), [
    'seated', 'attention', 'applause',
  ]);
  assert.equal(hook.channelState().movementCount, 3);
  assert.equal(hook.channelState().returned, true);
  assert.equal(hook.windowChannelInput('confirm'), true);

  const resumed = director.forBattle('hall', 'hall', {
    battleId: 'hall', charge: 2, returned: false, movements: [0],
  });
  assert.equal(resumed.channelState().charge, 2);
  assert.deepEqual(resumed.channelState().movements, [0]);
  assert.equal((await resumed.beginWindowChannel({
    movementIndex: 0, movementId: 'seated', movementTitle: 'THE HOUSE IS SEATED',
    intentId: 'hall:regard', intentLabel: 'A FULL HOUSE REGARDS YOU',
    intentKind: 'broadcast', windowScale: 1,
  })).duplicate, true, 'reload recovery cannot schedule a second attack in the same movement');
});
