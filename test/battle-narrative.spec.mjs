import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { runtimeBattle } from '../src/narrative/runtime-content.js';
import { visibleList } from '../src/game/conversation.js';
import { flagSet } from '../src/game/flags.js';
import { BATTLE_NAMING_FLAG, BATTLE_OCCASION_FLAG } from '../src/game/battle-occasion.js';
import { validateCombatDefinition, createCombatState } from '../src/game/combat-state.js';

// One document per room, for the same reason the chapel is one document: the
// pairs differed by five lines in total, and the practice pair by a single
// word. Whether he named her, and which of the two occasions this is, are
// threads inside the tree now.
const RECORDING_BATTLES = ['battle.natatorium', 'battle.practice', 'battle.hall'];
// One document — not seven sharing thirty-six of their thirty-nine lines, and
// no longer eleven conditioned readings inside one file either. One fight.
const CHAPEL_BATTLES = ['battle.chapel'];

test('every authored battle rehydrates into a valid combat definition', () => {
  for (const id of [...RECORDING_BATTLES, ...CHAPEL_BATTLES]) {
    const battle = runtimeBattle(id);
    assert.deepEqual(validateCombatDefinition(battle.combat), [], id);
    assert.doesNotThrow(() => createCombatState(battle.combat, {}), id);
  }
});

test('every movement of every battle carries a story beat (before or on-listen)', () => {
  for (const id of [...RECORDING_BATTLES, ...CHAPEL_BATTLES]) {
    const battle = runtimeBattle(id);
    battle.combat.movements.forEach((movement, index) => {
      const beats = (movement.before || []).length + (movement.onListen || []).length;
      assert.ok(beats > 0, `${id} movement ${index} (${movement.title}) has no dialogue beat`);
    });
  }
});

test('chapel battles run five movements ending on THE SOURCE, with no redact-era vocabulary', () => {
  for (const id of CHAPEL_BATTLES) {
    const battle = runtimeBattle(id);
    assert.equal(battle.combat.movements.length, 5, id);
    assert.equal(battle.combat.movements[4].title, 'THE SOURCE', id);
    const raw = JSON.stringify(battle);
    assert.ok(!raw.includes('BLACKED OUT'), `${id} still carries blackout vocabulary`);
    // Old checkpoint prompts must have been folded into playable channels —
    // the combat scene never reads checkpoint blocks.
    for (const movement of battle.combat.movements) {
      assert.ok(!movement.checkpoint || movement.checkpoint.prompt.length === 0,
        `${id} still relies on checkpoint prompts the scene cannot play`);
    }
  }
});

test('the chapel is one written fight, the same for everybody', () => {
  // Seven documents, then one document with eleven conditioned readings inside
  // it. Both were more machinery than the scene wanted. There are no conditions
  // in this tree at all now, so what the author reads is what the player gets.
  const battle = runtimeBattle('battle.chapel');
  const lines = [
    ...battle.intro,
    ...battle.combat.movements.flatMap((m) => [...(m.before || []), ...(m.onListen || []), ...(m.after || [])]),
    ...battle.win, ...battle.lose,
  ];
  assert.ok(lines.length, 'the chapel says something');
  for (const line of lines) {
    assert.equal(line.if, undefined, `${line.sourceId} still forks on a flag`);
  }
  // The one claim the fight is not allowed to make: it never shows a face
  // change, so it must not narrate one.
  for (const line of lines) {
    assert.doesNotMatch(line.text, /put on a face|it is wearing/i,
      `${line.sourceId} claims an unshown face transformation`);
  }
});

// ── the two threads inside a room fight ─────────────────────────────────────

// Everything one player actually hears, for one naming and one occasion.
function heard(id, naming, occasion) {
  flagSet(BATTLE_NAMING_FLAG, naming);
  flagSet(BATTLE_OCCASION_FLAG, occasion);
  const battle = runtimeBattle(id);
  const lines = [
    ...visibleList(battle.intro),
    ...battle.combat.movements.flatMap((movement) => [
      ...visibleList(movement.before), ...visibleList(movement.onListen), ...visibleList(movement.after),
    ]),
    ...visibleList(battle.win), ...visibleList(battle.lose),
  ];
  return { lines, text: lines.map((line) => line.text).join('\n') };
}

test('the natatorium keeps its mechanics but reauthors every attack below the surface', () => {
  const battle = runtimeBattle('battle.natatorium');
  assert.equal(battle.combat.presentation.mode, 'submerged');
  assert.deepEqual(battle.combat.presentation.movementDepths, [.35, .68, 1]);
  assert.deepEqual(battle.combat.music.submersion, {
    enabled: true, at: 'downbeat', lowpassHz: 720, q: .8, dryLeak: .08, rampSeconds: .18, surfaceSeconds: .6,
  });
  const labels = Object.fromEntries(battle.combat.movements.flatMap((movement) => movement.intents.map((intent) => [intent.id, intent.label])));
  assert.deepEqual(labels, {
    'natatorium:meter': 'METER MOVES BELOW THE WATERLINE',
    'natatorium:pressure': 'WATER HAMMERS BEHIND THE EARS',
    'natatorium:piano': 'TWO NOTES THROUGH THE SURFACE',
    'natatorium:voice': 'HER VOICE IN THE DRAIN RETURN',
    'natatorium:memory': 'SILT PASSED AS MEMORY',
    'natatorium:lean': 'UNDERTOW TAKES THE CASE',
    'natatorium:echo': 'FOURTH RETURN FROM THE BOTTOM',
    'natatorium:depth': 'BLACK WATER PRESSURE',
    'natatorium:absence': 'THE LADDER IS NOT ABOVE YOU',
  });
  assert.ok(battle.combat.movements.flatMap((movement) => movement.intents)
    .every((intent) => intent.presentation?.visualClass), 'every submerged intent declares a visual class');
  for (const occasion of ['recording-2', 'pre-recording-4']) {
    const text = heard('battle.natatorium', 'yes', occasion).text;
    assert.match(text, /coping rises past your eyes/i);
    assert.match(text, /cuffs, case and clothes are dry/i, 'victory explicitly surfaces the player dry');
    assert.match(text, /water acquires weight/i);
    assert.match(text, /soaked through/i);
    assert.match(text, /torch pack drowned/i);
  }
});

test('the broken pronoun interpolation stays fixed, and only the named thread says the name', () => {
  for (const id of ['battle.natatorium', 'battle.practice']) {
    const unnamed = heard(id, 'no', 'recording-2').text;
    assert.ok(!unnamed.includes('I recorded she'), `${id} regressed to "I recorded she"`);
    assert.match(unnamed, /I recorded her|Three years of her voice/, `${id} lost the corrected line`);
    assert.doesNotMatch(unnamed, /Sarah/, `${id} names her in a fight where the player never did`);
    assert.match(heard(id, 'yes', 'recording-2').text, /Sarah/, `${id} withholds the name it was given`);
  }
});

test('a fight the player never named her in is not narrated by her', () => {
  // Two of the three `unnamed` documents still labelled every one of her lines
  // `sarah`, so the speaker slot named her even when nothing else did. Unnamed,
  // it is `unknown` — voiced, because it is a mouth he cannot account for.
  for (const id of RECORDING_BATTLES) {
    const speakers = (naming) => new Set(heard(id, naming, 'recording-2').lines.map((line) => line.who));
    assert.ok(!speakers('no').has('sarah'), `${id} unnamed still speaks as sarah`);
    const named = speakers('yes');
    if (named.has('sarah')) {
      assert.ok(speakers('no').has('unknown') || speakers('no').has('direction'),
        `${id} drops her lines entirely when unnamed instead of reassigning them`);
    }
  }
});

test('the take-two fight and the one between takes are not the same fight', () => {
  // `recording-2` catches him mid-take with the meter live; winning means he
  // held the file. `pre-recording-4` catches him with the case still shut, and
  // losing injures him instead. Both mechanics already existed; the writing did
  // not know about either.
  for (const id of RECORDING_BATTLES) {
    const held = heard(id, 'no', 'recording-2');
    const ambush = heard(id, 'no', 'pre-recording-4');
    assert.notEqual(held.text, ambush.text, `${id} plays the same dialogue on both occasions`);
    assert.match(held.text, /take|rolling/i, `${id} take-two never mentions the take it is protecting`);
    assert.doesNotMatch(ambush.text, /Forty seconds into the take/,
      `${id} claims a take is running in the fight that happens between takes`);
  }
});

test('the room fights are delivered to the same wall as the chapel', () => {
  // The chapel's rebuild bought these guarantees and only the chapel was held to
  // them. A bark that runs longer than the exchange it happens inside is a
  // blocking line wearing a bark's clothes; a block over five lines is the wall
  // of prose the channel model exists to prevent.
  for (const id of RECORDING_BATTLES) {
    for (const naming of ['yes', 'no']) {
      for (const occasion of ['recording-2', 'pre-recording-4']) {
        flagSet(BATTLE_NAMING_FLAG, naming);
        flagSet(BATTLE_OCCASION_FLAG, occasion);
        const battle = runtimeBattle(id);
        const blocks = [visibleList(battle.intro), visibleList(battle.win), visibleList(battle.lose)];
        for (const movement of battle.combat.movements) {
          blocks.push(visibleList(movement.before), visibleList(movement.after));
          for (const line of visibleList(movement.onListen)) {
            assert.ok(line.text.length <= 96,
              `${line.sourceId} is ${line.text.length} characters — too long to bark`);
          }
        }
        for (const block of blocks) {
          assert.ok(block.length <= 5, `${id}/${naming}/${occasion}: a blocking block of ${block.length}`);
        }
      }
    }
  }
});

test('every line belongs to a thread that can actually be reached', () => {
  // A `when:` naming a flag nobody sets is a line that ships and never plays.
  const REACHABLE = new Set(['battle.naming == yes', 'battle.naming == no',
    'battle.occasion == recording-2', 'battle.occasion == pre-recording-4']);
  for (const id of RECORDING_BATTLES) {
    const seen = new Set();
    for (const naming of ['yes', 'no']) {
      for (const occasion of ['recording-2', 'pre-recording-4']) {
        for (const line of heard(id, naming, occasion).lines) seen.add(line.sourceId);
      }
    }
    const doc = JSON.parse(readFileSync(new URL(`../content/narrative/${id}.story.json`, import.meta.url), 'utf8'));
    for (const node of Object.values(doc.nodes)) {
      for (const line of node.lines || []) {
        if (line.when) assert.ok(REACHABLE.has(line.when), `${id}/${line.id} tests "${line.when}", which nothing sets`);
        assert.ok(seen.has(line.id), `${id}/${line.id} is unreachable under every thread`);
      }
    }
  }
});
