// THE PRACTICE WING — the encounter with nothing in it.
//
// These hold one promise above all others: that nothing in that room acts. The
// moment a test can be written as "the room does X to the player", the design
// has slipped back into a ghost story and the game has stopped being about what
// he did to her. Everything below is a man, a file, and a bar it ends at.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { combatHudLayout } from '../src/render/combat-hud-layout.js';

import {
  PRACTICE_LISTENS_TO_STOP,
  PRACTICE_REVEALS,
  PRACTICE_ROOMS,
  createPracticeSession,
  listenPracticeBar,
  playPracticeBar,
  practiceCanStop,
  practiceInstrument,
  practiceRetakeCost,
  practiceSnapshot,
  practiceStop,
  windPracticeBack,
} from '../src/game/practice-room.js';
import { attachCombatDefinition } from '../src/data/combat-definitions.js';
import { cueInstrumentFamily, enemyAttackCue, enemyAttackVoice } from '../src/audio/piano-weapon.js';

const session = (over = {}) => createPracticeSession({ seed: 'wing', ...over });

test('the file cannot be finished, because there is nothing past the bar it ends at', () => {
  const wing = session({ bars: 9 });
  for (let push = 0; push < 40; push += 1) playPracticeBar(wing);
  assert.equal(wing.bar, 9, 'the playhead stops at the end of the file');
  assert.equal(practiceSnapshot(wing).atEnd, true);
  // No amount of playing produces a resolution, because the recording stops
  // where he started talking over her. There is no clean run to earn.
  assert.equal(practiceSnapshot(wing).stopped, false, 'reaching the end is not an ending');
});

test('winding back is free, always available, and costs him', () => {
  const wing = session();
  playPracticeBar(wing); playPracticeBar(wing);
  const first = windPracticeBack(wing);
  assert.equal(wing.bar, 1, 'from the top');
  assert.equal(first.retakes, 1);
  // Rising cost, because it is rising: the twelfth pass through a bar is worse
  // than the second. Nothing did this to him.
  const costs = [];
  for (let again = 0; again < 8; again += 1) costs.push(windPracticeBack(wing).cost);
  for (let index = 1; index < costs.length; index += 1) {
    assert.ok(costs[index] >= costs[index - 1], 'the cost of a repetition never falls');
  }
  assert.ok(costs.at(-1) > costs[0], 'and it does rise');
  assert.ok(costs.at(-1) <= 4, 'but it is capped — this is attrition, not a slot machine');
});

test('the cost is bounded and defined for any number of retakes', () => {
  for (const retakes of [0, 1, 5, 40, 4000]) {
    const cost = practiceRetakeCost(retakes);
    assert.ok(Number.isFinite(cost) && cost >= 0 && cost <= 4, `retake ${retakes} costs ${cost}`);
  }
});

test('listening is the only thing in the room that goes anywhere', () => {
  const wing = session();
  assert.equal(practiceCanStop(wing), false, 'he cannot put it down before he has heard it');
  const heard = [];
  for (let pass = 0; pass < PRACTICE_LISTENS_TO_STOP; pass += 1) heard.push(listenPracticeBar(wing));
  assert.deepEqual(heard.map((reveal) => reveal.id), PRACTICE_REVEALS.map((reveal) => reveal.id));
  assert.equal(practiceCanStop(wing), true);
  // The third pass is the one that costs him the story he was telling himself.
  assert.match(heard.at(-1).line, /It is you\./, 'the last thing on the bar is him');
});

test('listening past the end is safe and does not keep unlocking things', () => {
  const wing = session();
  for (let pass = 0; pass < 20; pass += 1) listenPracticeBar(wing);
  assert.equal(wing.listens, PRACTICE_LISTENS_TO_STOP, 'there are only three passes to make');
  assert.equal(practiceSnapshot(wing).next, null, 'and nothing left to hear');
});

test('putting it down is the hardest thing available, and it is what says her name', () => {
  const wing = session();
  assert.equal(practiceStop(wing), false, 'he cannot leave without having listened');
  assert.equal(wing.named, false);
  for (let pass = 0; pass < PRACTICE_LISTENS_TO_STOP; pass += 1) listenPracticeBar(wing);
  assert.equal(practiceStop(wing), true);
  assert.equal(wing.stopped, true);
  assert.equal(wing.named, true, 'he says it plainly, and only here');
  // Once his hand is off it, nothing moves.
  const before = { ...wing };
  playPracticeBar(wing);
  windPracticeBack(wing);
  assert.equal(wing.bar, before.bar, 'the playhead does not move after he stops');
  assert.equal(wing.retakes, before.retakes);
});

test('the wing sounds like the room it is bleeding through, not like the blow', () => {
  const wing = session();
  const families = new Set();
  for (let beat = 0; beat < 40; beat += 1) { families.add(practiceInstrument(wing)); playPracticeBar(wing); }
  assert.ok(families.size >= 2, 'more than one door is open');
  for (const family of families) {
    assert.ok(['piano', 'violin', 'marimba'].includes(family), `${family} is a stem family that exists`);
  }
  // Every authored room names an instrument the cue bank can actually play.
  for (const room of PRACTICE_ROOMS) {
    assert.ok(enemyAttackCue({ intentKind: 'broadcast', beat: 0, instrument: room.instrument }),
      `${room.id} has a playable stem`);
  }
});

test('the strike banner names what played, not what was inferred', () => {
  // Same intent, different room: the verb still carries the kind and the
  // instrument follows the sound. Before this the label was derived from the
  // intent and would have named an instrument that never sounded.
  const cue = enemyAttackCue({ intentKind: 'overload', beat: 1, instrument: 'violin' });
  assert.equal(cueInstrumentFamily(cue), 'violin');
  const voice = enemyAttackVoice('overload', cue);
  assert.equal(voice.instrument, 'VIOLIN', 'the banner says what you heard');
  assert.equal(voice.verb, 'OVERLOADS', 'and the kind survives in the verb');
  // Everywhere else nothing moved.
  const ordinary = enemyAttackCue({ intentKind: 'overload', beat: 1 });
  assert.equal(enemyAttackVoice('overload', ordinary).instrument, 'MARIMBA');
});

test('nothing in the wing is the subject of a verb of will', () => {
  // The prose rule, enforced. A room that wants something, a phrase that takes
  // itself again, a packing that fails of its own accord — each one moves the
  // agency somewhere he cannot be blamed for it, which is the move he has been
  // making for three years. He winds it back. He plays it again. He stops.
  const wing = JSON.parse(readFileSync('content/narrative/battle.practice.story.json', 'utf8'));
  const lines = Object.values(wing.nodes).flatMap((node) => node.lines || []).map((line) => String(line.text || ''));
  const forbidden = [
    /\bthe room (?:wants|takes|decides|waits|listens)/i,
    /\bthe phrase (?:goes back|takes it|wants|decides)/i,
    /\bnothing takes it\b/i,
    /\bthe score writes\b/i,
    /\bplays itself\b/i,
  ];
  for (const text of lines) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `"${text}" gives a thing a will of its own (${pattern})`);
    }
  }
});

test('the intents are things he does to a file', () => {
  const combat = attachCombatDefinition({ id: 'practice', enemy: 'X', rounds: [] }).combat;
  assert.deepEqual(combat.movements.map((movement) => movement.title),
    ['TAKE IT FROM THE TOP', 'AGAIN, FROM THE TOP', 'AND AGAIN'],
    'the room has one instruction and it gives it three times');
  const labels = combat.movements.flatMap((movement) => movement.intents.map((intent) => intent.label));
  for (const label of labels) {
    assert.ok(!/\bITSELF\b|\bMOVES\b|\bANSWERS\b|\bWRITES BACK\b/.test(label),
      `"${label}" is the building doing something`);
  }
  assert.ok(labels.includes('WIND IT BACK TWO BARS'));
  assert.ok(labels.includes('BOTH HANDS ON THE FADER'), 'and by the third movement he is mixing her');
});

test('he says her name in the one place he has nothing running', () => {
  const wing = JSON.parse(readFileSync('content/narrative/battle.practice.story.json', 'utf8'));
  const win = wing.nodes.win.lines;
  const named = win.find((line) => line.id === 'win.line.4.named');
  assert.ok(named, 'the named branch exists');
  assert.equal(named.who, 'me', 'he chooses to speak it — it is not narrated at him');
  assert.equal(named.text, 'Sarah.');
  assert.ok(named.prompt, 'and it is offered as a thing he decides to say');
  // The unnamed run cannot borrow the name it never earned.
  const unnamed = win.find((line) => line.id === 'win.line.4.unnamed');
  assert.ok(unnamed && !/Sarah/.test(unnamed.text), 'a man who never asked does not get to say it now');
});

test('adding the wing changed nothing for the encounters that are not it', () => {
  for (const profile of ['hall', 'natatorium', 'chapel']) {
    const combat = attachCombatDefinition({ id: profile, enemy: 'X', rounds: [] }).combat;
    assert.equal(combat.practice, undefined, `${profile} has no practice session`);
  }
  const practice = attachCombatDefinition({ id: 'practice', enemy: 'X', rounds: [] }).combat;
  assert.deepEqual(practice.practice, { bars: 4 }, 'he works the fragment, not the piece');
  assert.equal(practice.house, undefined, 'and the wing has no house — there is nobody in there');
});

// ── the wing, played ────────────────────────────────────────────────────────

import {
  COMBAT_ACTION,
  advanceEnemy,
  availableCombatActions,
  combatPractice,
  createCombatState,
  currentCombatIntent,
  reduceCombat,
} from '../src/game/combat-state.js';
import { COMBAT_RULES } from '../src/progression/difficulty-defs.js';

const FULL_BAG = { torch: true, recorder: true, rig: true, fork: true, radio: true };
const wingState = (over = {}) => createCombatState(
  attachCombatDefinition({ id: 'practice', enemy: 'X', rounds: [] }).combat,
  { difficulty: COMBAT_RULES.standard, tools: FULL_BAG, battery: 1, seed: 5, ...over },
);
const beat = (state, type) => {
  const next = reduceCombat(state, { type });
  return next.phase === 'enemy' ? advanceEnemy(next) : next;
};
const offered = (state) => availableCombatActions(state).filter((move) => move.enabled).map((move) => move.label);

test('the file runs, hits the bar it ends at, and he winds it back', () => {
  let state = wingState();
  assert.equal(combatPractice(state).bar, 1);
  const seen = new Set();
  for (let press = 0; press < 12; press += 1) {
    state = beat(state, COMBAT_ACTION.SHOUT);
    seen.add(combatPractice(state).bar);
  }
  assert.ok(combatPractice(state).retakes > 0, 'he has taken it from the top');
  assert.ok(seen.size > 1, 'and the playhead actually moves');
  assert.ok(state.composure < state.maxComposure, 'the repetition is what costs him');
});

test('nothing in the room strikes him — every beat that costs him is one of his own', () => {
  // There is no second, hidden bill in the wing. What a beat costs is the
  // authored damage of the intent that beat committed, and every intent in this
  // room is a thing he does to a file rather than a blow somebody throws. The
  // labels are checked statically above; this checks the arithmetic matches.
  let state = wingState();
  for (let press = 0; press < 10 && !state.result; press += 1) {
    const before = state.composure;
    const promised = currentCombatIntent(state)?.damage ?? 0;
    state = beat(state, COMBAT_ACTION.WAIT);
    const lost = before - state.composure;
    // One grid of headroom for the fragility every encounter carries in SIGNAL.
    // What must never appear is a second, wing-only charge on top — the lap is
    // bookkeeping and a line of text, and it was briefly a bill.
    assert.ok(lost <= promised + 5,
      `a beat cost ${lost} against a card that promised ${promised} — something else is billing him`);
  }
  assert.ok(state.composure < state.maxComposure, 'and the repetition does cost him');
});

test('he cannot play back a bar he has not reached', () => {
  let state = wingState();
  assert.ok(!offered(state).includes('LISTEN'), 'not offered away from the wall');
  const before = combatPractice(state).listens;
  state = reduceCombat(state, { type: COMBAT_ACTION.LISTEN });
  assert.equal(combatPractice(state).listens, before, 'and pressing it anyway does nothing');
  // Walk to the wall and it appears.
  let guard = 0;
  while (combatPractice(state).bar < combatPractice(state).bars && guard++ < 12) {
    state = beat(state, COMBAT_ACTION.WAIT);
  }
  assert.ok(offered(state).includes('LISTEN'), 'at the bar it ends at, the craft is on the table');
});

test('the arc does not end — it loops on AND AGAIN until he stops', () => {
  let state = wingState();
  const last = state.definition.movements.length - 1;
  for (let press = 0; press < 200 && !state.result; press += 1) {
    state = beat(state, COMBAT_ACTION.SHOUT);
  }
  if (!state.result) {
    assert.equal(state.movementIndex, last, 'it settles on the final movement');
  } else {
    // The only way this ends without him is attrition.
    assert.equal(state.result.result, 'lose', 'coherence cannot win the wing — there is nobody to reduce');
  }
});

test('putting it down is the only win, and it says her name', () => {
  let state = wingState();
  for (let pass = 0; pass < PRACTICE_LISTENS_TO_STOP; pass += 1) {
    let guard = 0;
    while (combatPractice(state).bar < combatPractice(state).bars && guard++ < 12) {
      state = beat(state, COMBAT_ACTION.HOLD);
    }
    state = beat(state, COMBAT_ACTION.LISTEN);
  }
  assert.equal(combatPractice(state).canStop, true);
  assert.ok(offered(state).includes('PUT IT DOWN'));
  state = beat(state, COMBAT_ACTION.PUT_IT_DOWN);
  assert.equal(state.result?.result, 'win');
  assert.equal(combatPractice(state).named, true, 'and that is where he says it');
  assert.match(state.last.notice, /YOU DO NOT WIND IT BACK/);
});

test('the transport claims a rail slot, and the wing never draws an apparition roster', () => {
  const panel = { x: 2, y: 2, w: 96, h: 30 };
  const bare = combatHudLayout({ panel, mode: 'command' });
  const wing = combatHudLayout({ panel, mode: 'command', rosterActive: true });
  assert.equal(bare.channels.h, 0, 'an ordinary encounter has no rail');
  assert.ok(wing.channels.h > 0, 'the wing gets the roster channel slot');
  assert.ok(wing.detail.y >= wing.channels.y + wing.channels.h, 'the detail line still clears it');
  // Nothing in the wing is a group, so the state must never carry Hall actors.
  const state = wingState();
  assert.equal(state.house, undefined, 'the removed room-target system is absent');
  assert.equal(state.apparitions, null, 'there is nobody in that room to draw');
  assert.ok(combatPractice(state), 'and the transport is what takes the slot instead');
});

test('the tile does not print the answer before he has heard it', () => {
  let state = wingState();
  let guard = 0;
  while (combatPractice(state).bar < combatPractice(state).bars && guard++ < 12) {
    state = beat(state, COMBAT_ACTION.HOLD);
  }
  const first = availableCombatActions(state).find((move) => move.id === COMBAT_ACTION.LISTEN);
  assert.ok(first, 'it is offered at the wall');
  // He does not know there is anything on that bar until he has played it once,
  // and a tile that names the reveal turns the wing into a labelled puzzle.
  for (const reveal of PRACTICE_REVEALS) {
    assert.ok(!first.detail.includes(reveal.label), `the tile gives away ${reveal.label}`);
  }
  state = beat(state, COMBAT_ACTION.LISTEN);
  guard = 0;
  while (combatPractice(state).bar < combatPractice(state).bars && guard++ < 12) {
    state = beat(state, COMBAT_ACTION.HOLD);
  }
  const second = availableCombatActions(state).find((move) => move.id === COMBAT_ACTION.LISTEN);
  assert.ok(second.detail.includes(PRACTICE_REVEALS[1].label),
    'once he knows there is something there, it says what he is going back for');
});

test('the click fades as he understands the room', () => {
  // Leila's returning click, as a number: loud while he has heard nothing, gone
  // by the time he has heard all of it. The renderer scales the return mark by
  // exactly this, so the two cannot drift.
  const wing = session();
  const level = (s) => Math.max(0, 1 - s.listens / PRACTICE_LISTENS_TO_STOP);
  assert.equal(level(wing), 1, 'it is loudest before he has played anything back');
  listenPracticeBar(wing);
  assert.ok(level(wing) < 1 && level(wing) > 0, 'and it attenuates as he does');
  while (wing.listens < PRACTICE_LISTENS_TO_STOP) listenPracticeBar(wing);
  assert.equal(level(wing), 0, 'by the end there is nothing coming back through the partition');
});

test('an hour in that room costs him whatever he presses', () => {
  // Bracing is a defence against something thrown at you. Nothing in the wing
  // throws anything, so HOLD walked the whole fragment for free and a player who
  // found LISTEN strolled out at full composure having felt nothing. Time in
  // there costs him; the only thing he controls is how much of it he spends.
  let state = wingState();
  const before = state.composure;
  for (let press = 0; press < 4 && !state.result; press += 1) state = beat(state, COMBAT_ACTION.HOLD);
  assert.ok(state.composure < before, 'bracing does not buy him a free pass through the bar');
});

test('the craft is cheaper than the reflex, and both cost something', () => {
  const play = (policy) => {
    let state = wingState();
    let decisions = 0;
    while (!state.result && decisions < 80) {
      const open = availableCombatActions(state).filter((move) => move.enabled).map((move) => move.id);
      state = beat(state, policy(open));
      decisions += 1;
    }
    return { state, decisions };
  };
  const listens = play((open) => open.includes(COMBAT_ACTION.PUT_IT_DOWN) ? COMBAT_ACTION.PUT_IT_DOWN
    : open.includes(COMBAT_ACTION.LISTEN) ? COMBAT_ACTION.LISTEN : COMBAT_ACTION.HOLD);
  const reflex = play(() => COMBAT_ACTION.HOLD);

  assert.equal(listens.state.result?.result, 'win', 'playing the bar back is the way out');
  assert.ok(listens.state.composure < listens.state.maxComposure,
    'and it still costs him — the wing is not free to anybody');
  assert.equal(reflex.state.result?.result, 'lose', 'and taking it from the top forever is not');
  assert.ok(reflex.decisions > listens.decisions,
    'the man who will not stop is in there longer, which is the whole of it');
});

// ── the click ───────────────────────────────────────────────────────────────

import {
  PRACTICE_RETURN_LAG_MS,
  PRACTICE_RUSH_CAP,
  createPracticeClick,
  practiceClickSchedule,
  practiceTempo,
  practiceTimeStretch,
} from '../src/audio/practice-click.js';
import { BATTLE_BEATS_PER_BAR, BATTLE_BPM } from '../src/audio/battle-music.js';

test('the click starts on the authored grid and only he moves it', () => {
  assert.equal(practiceTempo(0), BATTLE_BPM, 'a first pass is the tempo everything else is written at');
  assert.equal(practiceTimeStretch(0), 1, 'and nothing is stretched');
  // He is rushing it: the one tempo change in the wing, and it is his.
  assert.ok(practiceTempo(3) > practiceTempo(0), 'a man who cannot play the bar takes it faster');
  assert.ok(practiceTimeStretch(3) < 1, 'and the whole room stretches with him, in one piece');
  // Capped, or it stops being rushing and becomes a different piece of music.
  assert.equal(practiceTempo(999), BATTLE_BPM + PRACTICE_RUSH_CAP);
  assert.ok(practiceTempo(999) < BATTLE_BPM * 1.2, 'the cap keeps it a practice room');
});

test('the partition return sits where Leila puts it', () => {
  const schedule = practiceClickSchedule({ retakes: 0, bars: 2 });
  assert.equal(schedule.ticks.length, 2 * BATTLE_BEATS_PER_BAR);
  assert.equal(schedule.ticks.filter((entry) => entry.downbeat).length, 2, 'one counted beat per bar');
  for (const entry of schedule.ticks) {
    const lag = entry.returnAt - entry.at;
    assert.ok(Math.abs(lag - PRACTICE_RETURN_LAG_MS / 1000) < 1e-9, 'every tick comes back the same distance behind');
  }
  // "Not enough to count cleanly. Enough to pull the stick out of your hand if
  // you listened to it." Past ~100ms it stops smearing the beat and becomes a
  // second beat; under ~50ms you cannot hear it at all.
  assert.ok(PRACTICE_RETURN_LAG_MS > 50 && PRACTICE_RETURN_LAG_MS < 100);
  // And it is always behind, never on or ahead of the beat it reflects.
  assert.ok(schedule.ticks.every((entry) => entry.returnAt > entry.at));
});

test('rushing shortens the bar, and the drawn beat cannot drift from the heard one', () => {
  const first = practiceClickSchedule({ retakes: 0 });
  const rushed = practiceClickSchedule({ retakes: 4 });
  assert.ok(rushed.bar < first.bar, 'the bar gets shorter as he rushes');
  // The transport draws its beat from practiceTempo too, so one number moves both.
  assert.equal(rushed.tempo, practiceTempo(4));
  assert.ok(Math.abs(rushed.bar - 60 / practiceTempo(4) * BATTLE_BEATS_PER_BAR) < 1e-9);
});

test('the click is inert without an audio context and never throws', () => {
  const silent = createPracticeClick({});
  assert.equal(silent.available, false, 'no context, no metronome');
  assert.doesNotThrow(() => { silent.start(); silent.tick(); silent.setRetakes(3); silent.setReturnLevel(.5); silent.stop(); });
  assert.equal(silent.running, false, 'and it never claims to be running');
});
