import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorRedactionChallenge,
  applyOpponentMove,
  createRedactionState,
  graftSignal,
  revealHidden,
  toggleRedaction,
  validateBattleDefinition,
  validateReading,
  visibleTokenIds,
} from '../src/game/redaction.js';
import {
  chapelBoss,
  hallBattle,
  natatoriumBattle,
  practiceBattle,
} from '../src/data/battles.js';
import { endingChoice, guardEpilogue } from '../src/data/conservatory-script.js';
import { surfacedEnding } from '../src/data/chunk-surf-script.js';

function tokenId(challenge, ref) {
  const key = String(ref).toUpperCase();
  const token = challenge.tokens.find((t) => t.id.endsWith(`:${ref}`) || String(t.text).toUpperCase() === key);
  assert.ok(token, `missing token ${ref}`);
  return token.id;
}

function redactAllExcept(state, refs) {
  const keep = new Set(refs.map((ref) => tokenId(state.challenge, ref)));
  for (const token of state.challenge.tokens) {
    if (visibleTokenIds(state).includes(token.id) && !keep.has(token.id)) toggleRedaction(state, token.id);
  }
}

test('hidden and grafted tokens participate in semantic readings', () => {
  const challenge = authorRedactionChallenge('grammar', [
    'ROOM', 'IS', 'EMPTY',
    { id: 'not', text: 'NOT', kind: 'hidden' },
    { id: 'return', text: 'RETURN', kind: 'graft' },
  ], {
    readings: [
      {
        id: 'grammar:return',
        required: ['not', 'return'],
        forbidden: ['empty'],
        maxVisible: 2,
        meaning: 'Absence becomes returnable.',
        grants: ['route.surfaced'],
        locks: ['route.sacrifice'],
        routeBias: 'surfaced',
        pressureDelta: -2,
      },
    ],
  });
  const state = createRedactionState(challenge);
  assert.equal(validateReading(state).ok, false);
  assert.equal(revealHidden(state), true);
  assert.equal(graftSignal(state), true);
  redactAllExcept(state, ['not', 'return']);
  const verdict = validateReading(state);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.readingId, 'grammar:return');
  assert.deepEqual(verdict.grants, ['route.surfaced']);
  assert.deepEqual(verdict.locks, ['route.sacrifice']);
  assert.equal(verdict.meaning, 'Absence becomes returnable.');
});

test('opponent insertions are visible textual arguments', () => {
  const challenge = authorRedactionChallenge('argument', [
    'I', 'DID', 'NOT', 'AGREE',
    { id: 'body', text: 'BODY', kind: 'insertion' },
  ], {
    readings: [
      { id: 'argument:refusal', required: ['not'], forbidden: ['agree', 'body'], maxVisible: 3, meaning: 'Refusal survives.' },
      { id: 'argument:body', required: ['body'], forbidden: ['not'], maxVisible: 3, meaning: 'The Surfer makes body the premise.' },
    ],
    opponentMoves: [
      { insert: ['body'], scrape: ['agree'], notice: 'It writes BODY where the sentence was safest.' },
    ],
  });
  const state = createRedactionState(challenge);
  assert.equal(visibleTokenIds(state).includes(tokenId(challenge, 'body')), false);
  toggleRedaction(state, tokenId(challenge, 'agree'));
  const move = applyOpponentMove(state);
  assert.equal(move.notice, 'It writes BODY where the sentence was safest.');
  assert.equal(visibleTokenIds(state).includes(tokenId(challenge, 'body')), true);
});

test('all authored battles use the same redaction contract', () => {
  const battles = [
    natatoriumBattle(true),
    practiceBattle(true),
    hallBattle(true),
    chapelBoss({ kind: 'name', value: 'Sarah', listened: 5 }),
  ];
  for (const battle of battles) {
    const errors = validateBattleDefinition(battle);
    assert.deepEqual(errors, [], battle.id);
    for (const challenge of battle.challenges) {
      assert.ok(challenge.readings.length >= 2, `${battle.id}:${challenge.id} needs multiple readings`);
      for (const reading of challenge.readings) {
        assert.ok(reading.meaning, `${battle.id}:${challenge.id}:${reading.id} lacks meaning`);
      }
    }
  }
});

test('chapel finale has five pages and gates inversion/surfaced by authored meanings', () => {
  const battle = chapelBoss({ kind: 'nothing', listened: 5 });
  assert.equal(battle.challenges.length, 5);
  assert.equal(battle.health, 5);
  assert.deepEqual(battle.tools, { fork: true, rig: true });
  assert.deepEqual(battle.challenges.map((c) => c.title), [
    'THE ROOM',
    'THE PREVIOUS RECORDIST',
    'THE SURFER',
    'THE CONTRACT',
    'THE SOURCE',
  ]);
  const source = battle.challenges.at(-1);
  const grants = new Set(source.readings.flatMap((r) => r.grants));
  const locks = new Set(source.readings.flatMap((r) => r.locks));
  assert.ok(grants.has('route.surfaced'));
  assert.ok(grants.has('route.inversion'));
  assert.ok(locks.has('route.surfaced'));
});


test('finale choice tree reflects authored route availability without exposing route names', () => {
  const base = endingChoice({
    hasRig: true,
    canInvert: false,
    canSurface: false,
    readings: [{ challengeId: 'chapel-source', readingId: 'source-you', meaning: 'You leave yourself as the source.', text: 'SOURCE IS YOU' }],
    locks: ['route.surfaced'],
    sourceReading: { text: 'SOURCE IS YOU' },
  });
  assert.equal(base.start.choices.some((c) => c.set?.includes('ending.choice=inversion')), false);
  assert.equal(base.start.choices.some((c) => c.set?.includes('ending.choice=surfaced')), false);
  assert.ok(base.start.lines.some((l) => /SOURCE IS YOU/.test(l.text)));

  const full = endingChoice({
    hasRig: true,
    canInvert: true,
    canSurface: true,
    readings: [
      { challengeId: 'chapel-recordist', readingId: 'still-here', meaning: 'The prior recordist is still recoverable.', text: 'STILL HERE' },
      { challengeId: 'chapel-source', readingId: 'signal-process-release', meaning: 'Signal process release.', text: 'SIGNAL PROCESS RELEASE' },
    ],
    grants: ['route.inversion', 'route.surfaced'],
    sourceReading: { text: 'SIGNAL PROCESS RELEASE' },
  });
  const choiceText = full.start.choices.map((c) => c.text).join(' / ');
  assert.match(choiceText, /broken rig/);
  assert.match(choiceText, /borrowed body/);
  assert.doesNotMatch(choiceText, /SURFACED|INVERSION|SACRIFICE/);
});

test('surfaced ending and epilogue acknowledge the recovered recordist', () => {
  const ending = surfacedEnding({ sourceReading: { text: 'BODY BORROWED RETURN' } });
  assert.ok(ending.some((line) => /BODY BORROWED RETURN/.test(line.text)));
  const epilogue = guardEpilogue('surfaced');
  assert.ok(epilogue.some((line) => /Two of you/.test(line.text)));
  assert.ok(epilogue.some((line) => /RETURNED/.test(line.text)));
});
