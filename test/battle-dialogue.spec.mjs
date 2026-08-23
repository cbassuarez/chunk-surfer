// Battle dialogue, and the four promises the rebuild is made of.
//
// It was off for two compounding reasons. The writing, and — underneath it — a
// delivery model that did not do what the authoring format said it did:
//
//   `on-listen` WAS NOT A CHANNEL. combat.js concatenated it onto `before`, so
//   a round authored in three movements arrived as one wall of prose with the
//   fight waiting behind it.
//   `after` OPENED THE NEXT MOVEMENT rather than closing its own, so every
//   button line in the game landed as somebody else's first line.
//   NOTHING AUTO-ADVANCED. Not one authored line set `auto`; the chapel was
//   thirty-seven discrete confirm presses with no hold-to-skip and no mouse.
//   And the chapel was SEVEN DOCUMENTS sharing thirty-six of their thirty-nine
//   lines, to express three sentences of difference.
//
// This file holds the fixed versions of the delivery model to the wall.
//
// The authoring answer to that last one went through two shapes: one document
// with the confession threaded through it as eleven conditioned readings, and
// then — because that was still more machinery than the scene wanted — one
// written fight, the same for everybody, with no conditions in it at all. The
// reading tests went with it. The delivery guarantees below did not: they are
// what makes any writing arrive the way it was written.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { rehydrateBattle } from '../src/narrative/runtime-content.js';
import { visibleList } from '../src/game/conversation.js';
import { TRACE_SOURCES, attachSignalRole } from '../src/narrative/signal-role.js';
import { hardWrapBattleText } from '../src/game/combat-dialogue-model.js';

const DOC = JSON.parse(readFileSync(new URL('../content/narrative/battle.chapel.story.json', import.meta.url), 'utf8'));
const combatSource = readFileSync(new URL('../src/game/combat.js', import.meta.url), 'utf8');

// What the player actually hears. There is one of these now.
function playthrough() {
  const battle = rehydrateBattle(DOC);
  const blocks = [visibleList(battle.intro)];
  const barks = [];
  for (const movement of battle.combat.movements) {
    blocks.push(visibleList(movement.before));
    barks.push(...visibleList(movement.onListen));
    blocks.push(visibleList(movement.after));
  }
  blocks.push(visibleList(battle.win));
  return { battle, blocks: blocks.filter((block) => block.length), barks };
}

// ── the channels mean what they are called ──────────────────────────────────

test('before blocks, on-listen does not, and after closes its own movement', () => {
  // `on-listen` was concatenated onto `before` at two call sites and delivered
  // as the second half of one block. It is a bark now — thrown between
  // exchanges, over the top of the command deck rather than in place of it.
  assert.doesNotMatch(combatSource, /\[\s*\.\.\.\(?\w*\??\.?before[^\]]*onListen/,
    'before and on-listen must not be concatenated into one queue again');
  assert.match(combatSource, /function armBarks/);
  assert.match(combatSource, /function nextBark/);
  // A bark draws over the deck and does not take the talk phase.
  assert.match(combatSource, /if \(bark && phase !== 'talk'\)/);
  // And `after` opens nothing: it is spoken, then the next movement is entered.
  assert.match(combatSource, /if \(closing\.length\) speak\(closing, openNext\)/);
});

test('a bark is short enough to be heard between two beats', () => {
  // An exchange is about a second and a bit. A bark that runs longer than the
  // fight it is happening inside is a blocking line wearing a bark's clothes.
  for (const line of playthrough().barks) {
    assert.ok(line.text.length <= 96,
      `${line.sourceId} is ${line.text.length} characters — too long to bark: "${line.text}"`);
  }
});

test('no blocking block is a wall of prose', () => {
  // The old 3→4 break was seven lines in one uninterruptible run, and the intro
  // was another seven.
  for (const block of playthrough().blocks) {
    assert.ok(block.length <= 7,
      `a blocking block of ${block.length} lines (${block[0]?.sourceId})`);
  }
});

test('the fight is markedly less press-heavy than it was', () => {
  // Thirty-seven discrete confirm presses, minimum 160ms dwell each, no
  // hold-to-skip and inert pointer input.
  const { blocks, barks } = playthrough();
  const presses = blocks.reduce((sum, block) => sum + block.length, 0);
  assert.ok(presses <= 30, `the chapel still needs ${presses} presses`);
  assert.ok(barks.length >= 8, `the chapel only barks ${barks.length} times — the fight is still silent`);
});

test('a second run of a fight is not the first run again', () => {
  // The seen-text acceleration has existed in conversation.js since it shipped
  // and combat never had it.
  assert.match(combatSource, /replay\?\.seenTextMode\?\.\(\)/);
  assert.match(combatSource, /activeLineSeenBefore/);
  assert.match(combatSource, /replay\?\.markLine\?\./);
});

// ── the fragment device ─────────────────────────────────────────────────────

test('a lead-in is a line shape, not a speaker', () => {
  // Authored as `who`, a fragment rendered as a shouted uppercase label, hard
  // truncated at panel width with no overflow mark, knocked out of VOICED so it
  // typed instead of speaking and the music never ducked for it.
  const leads = Object.values(DOC.nodes)
    .flatMap((node) => node.lines || [])
    .filter((line) => line.lead);
  assert.ok(leads.length, 'the chapel still uses the device');
  for (const line of leads) {
    assert.ok(line.who, `${line.id} keeps a real speaker alongside its lead-in`);
    assert.ok(line.who.length < 20, `${line.id} put the fragment back in the speaker slot`);
  }
  assert.match(combatSource, /hardWrapBattleText\(lead, dlgW\)/, 'the lead-in wraps');
});

test('a lead-in survives a narrow window', () => {
  const lead = 'do you think you have ever felt anything';
  const wide = hardWrapBattleText(lead, 96);
  const narrow = hardWrapBattleText(lead, 28);
  assert.equal(wide.join(' '), lead, 'nothing is lost at a wide width');
  assert.equal(narrow.join(' '), lead, 'and nothing is lost at a narrow one');
  assert.ok(narrow.length > 1, 'it wraps rather than truncating');
});

// ── the Surfer may only ever repeat ─────────────────────────────────────────

test('every Surfer line names where it heard it', () => {
  // The doctrine has not moved. What moved is that it is enforced by naming a
  // source rather than by matching a growing list of literal sentences in the
  // engine — which is what made a rewrite impractical.
  const traces = Object.values(DOC.nodes)
    .flatMap((node) => node.lines || [])
    .filter((line) => line.who === 'surfer');
  assert.ok(traces.length >= 8, 'the Surfer speaks in this fight');
  for (const line of traces) {
    assert.ok(TRACE_SOURCES[line.quotes], `${line.id} quotes "${line.quotes}", which is not a source`);
    assert.doesNotThrow(() => attachSignalRole(line), `${line.id} is a valid trace`);
  }
});

test('a Surfer line that cannot name a source is refused', () => {
  assert.throws(() => attachSignalRole({ who: 'surfer', text: 'Something of my own.' }),
    /only repeat recorded or institutional language/);
  assert.throws(() => attachSignalRole({ who: 'surfer', text: 'Anything.', quotes: 'thin air' }),
    /unknown Chunk Surfer trace source/);
});

