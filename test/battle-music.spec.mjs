import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import {
  BATTLE_BAR_SECONDS,
  BATTLE_LOOP_SECONDS,
  BATTLE_SOLO_BARS,
  alignBattleBuffer,
  battleEntryVariant,
  battleLoopFrameCount,
  createBattleMusicSession,
  nextBattleBarAt,
} from '../src/audio/battle-music.js';
import { authoredCombatProfile, sourceCombatDefinition } from '../src/data/combat-definitions.js';

function fakeParam(value = 0) {
  return {
    value,
    calls: [],
    setValueAtTime(next, time) { this.value = next; this.calls.push(['set', next, time]); },
    linearRampToValueAtTime(next, time) { this.value = next; this.calls.push(['ramp', next, time]); },
    cancelScheduledValues(time) { this.calls.push(['cancel', time]); },
  };
}

function audioBuffer({ channels = 2, length = 9600, sampleRate = 168, label = '' } = {}) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  data.forEach((channel, channelIndex) => {
    for (let index = 0; index < Math.min(32, channel.length); index += 1) channel[index] = (index + 1) * (channelIndex + 1) / 100;
  });
  return {
    label,
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (index) => data[index],
  };
}

function fakeContext() {
  const starts = [];
  const stops = [];
  const gains = [];
  const context = {
    currentTime: 10,
    sampleRate: 168,
    destination: { connect() {}, disconnect() {} },
    createBuffer(channels, length, sampleRate) { return audioBuffer({ channels, length, sampleRate, label: `aligned-${length}` }); },
    createGain() {
      const gain = fakeParam(1);
      const node = { gain, connect() {}, disconnect() {} };
      gains.push(node);
      return node;
    },
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        onended: null,
        connect() {},
        disconnect() {},
        start(when, offset = 0) { starts.push({ source, buffer: source.buffer, when, offset }); },
        stop(when) { stops.push({ source, when }); },
      };
      return source;
    },
  };
  return { context, starts, stops, gains };
}

function fixtureBank() {
  const bank = new Map();
  bank.set('bed', audioBuffer({ length: 9604, label: 'bed' }));
  bank.set('lead-1', audioBuffer({ length: 7700, label: 'lead-1' }));
  bank.set('lead-2', audioBuffer({ length: 8400, label: 'lead-2' }));
  bank.set('lead-3', audioBuffer({ length: 8400, label: 'lead-3' }));
  for (let variant = 1; variant <= 3; variant += 1) {
    bank.set(`entry-${variant}-fill`, audioBuffer({ length: 84 + variant * 7, label: `fill-${variant}` }));
    bank.set(`entry-${variant}-tail`, audioBuffer({ length: 56 + variant, label: `tail-${variant}` }));
  }
  return bank;
}

assert.equal(battleLoopFrameCount(168), 9600, 'forty bars resolve to one exact common frame count');
const aligned = alignBattleBuffer(fakeContext().context, audioBuffer({ length: 9700 }));
assert.equal(aligned.length, 9600);
assert.equal(aligned.duration, BATTLE_LOOP_SECONDS);
assert.ok(Math.abs(aligned.getChannelData(0)[0] - .01) < 1e-7, 'alignment copies rather than stretches samples');
assert.equal(alignBattleBuffer(fakeContext().context, aligned), aligned, 'already aligned performances are reused without another large allocation');
assert.equal(nextBattleBarAt(10.1, 10), 10 + BATTLE_BAR_SECONDS);

const runVariants = ['natatorium', 'practice', 'hall'].map((id) => battleEntryVariant('run-stable', id));
assert.equal(new Set(runVariants).size, 3, 'the three regular encounters receive a stable entry permutation');
assert.equal(battleEntryVariant('run-stable', 'natatorium'), battleEntryVariant('run-stable', 'natatorium'), 'retries retain the entry pair');
assert.ok(new Set(['run-a', 'run-b', 'run-c', 'run-d'].map((runId) => battleEntryVariant(runId, 'natatorium'))).size > 1, 'different run ids vary the deterministic entry pair');

const firstAudio = fakeContext();
const firstBank = fixtureBank();
const first = createBattleMusicSession({
  combatId: 'natatorium',
  runId: 'run-stable',
  musicProfile: { mode: 'fixed', lead: 'lead-1' },
  context: firstAudio.context,
  destination: firstAudio.context.destination,
  bufferBank: firstBank,
});
const startSnapshot = await first.start();
const entrySourceCount = firstAudio.starts.length;
await first.start();
assert.equal(firstAudio.starts.length, entrySourceCount, 'duplicate start calls cannot schedule a second entrance');
const variant = startSnapshot.entryVariant;
const fill = firstBank.get(`entry-${variant}-fill`);
const tail = firstBank.get(`entry-${variant}-tail`);
const fillStart = firstAudio.starts.find((entry) => entry.buffer === fill);
const tailStart = firstAudio.starts.find((entry) => entry.buffer === tail);
const bedStart = firstAudio.starts.find((entry) => entry.source.loop && entry.buffer === firstBank.get('bed'));
// The fill is a pickup INTO beat one, so the grid is decided first and the fill
// is scheduled backwards from it. It used to be the other way round — the fill
// started at the lookahead and its own file length chose the downbeat — which put
// the bed's first beat at a different fraction of a bar for every variant.
const countInBars = Math.max(1, Math.ceil(fill.duration / BATTLE_BAR_SECONDS));
assert.equal(startSnapshot.downbeatAt, 10.06 + countInBars * BATTLE_BAR_SECONDS,
  'the downbeat lands on the bar grid, not wherever the fill file happens to end');
assert.equal(fillStart.when, startSnapshot.downbeatAt - fill.duration,
  'and the fill ends exactly on the downbeat');
assert.ok(fillStart.when >= 10.06, 'a pickup is never scheduled in the past');
assert.equal(tailStart.when, startSnapshot.downbeatAt, 'matching tail starts exactly on beat one');
// One fill, one tail, same take: the pair is 1:1 and never crossed.
assert.equal(firstAudio.starts.filter((entry) => /entry-\d-fill/.test(entry.id || '')).length,
  firstAudio.starts.filter((entry) => /entry-\d-tail/.test(entry.id || '')).length);
for (const other of [1, 2, 3].filter((n) => n !== variant)) {
  assert.ok(!firstAudio.starts.some((entry) => entry.buffer === firstBank.get(`entry-${other}-fill`)
    || entry.buffer === firstBank.get(`entry-${other}-tail`)),
    `variant ${other} contributes neither half of the entrance`);
}
assert.equal(bedStart.when, tailStart.when, 'bed and tail share one AudioContext timestamp');
assert.equal(bedStart.buffer.length, 9600);
assert.equal(bedStart.source.loopEnd, BATTLE_LOOP_SECONDS);

firstAudio.context.currentTime = startSnapshot.downbeatAt;
assert.equal(first.update().phase, 'running');
firstAudio.context.currentTime += .2;
first.onCombatEvent({ perfect: true });
let music = first.snapshot();
assert.equal(music.activeLead, 'lead-1');
assert.equal(music.windowStartAt, nextBattleBarAt(firstAudio.context.currentTime + .06, startSnapshot.downbeatAt));
assert.equal(music.windowEndAt - music.windowStartAt, BATTLE_SOLO_BARS * BATTLE_BAR_SECONDS);
const firstWindowEnd = music.windowEndAt;
firstAudio.context.currentTime = music.windowStartAt + BATTLE_BAR_SECONDS;
first.onCombatEvent({ perfect: true });
assert.equal(first.snapshot().pendingLead, 'lead-1', 'a perfect during a solo queues instead of overlapping');
firstAudio.context.currentTime = firstWindowEnd;
first.update();
const restUntil = first.snapshot().restUntil;
firstAudio.context.currentTime = restUntil - .05;
first.update();
music = first.snapshot();
assert.equal(music.windowStartAt, restUntil, 'queued performance respects the four-bar minimum rest');
assert.equal(firstAudio.starts.filter((entry) => entry.buffer === firstBank.get('lead-1')).length, 1, 'later gates reuse the silently running written performance');

const frozenSnapshot = JSON.stringify(first.snapshot());
first.update();
assert.equal(JSON.stringify(first.snapshot()), frozenSnapshot, 'a frozen AudioContext clock freezes the musical grid');

first.setDialogueActive(true);
assert.equal(first.snapshot().dialogueActive, true);
assert.ok(firstAudio.gains[0].gain.calls.some((call) => call[0] === 'ramp' && call[1] === .42));
first.setDialogueActive(false);
assert.ok(firstAudio.gains[0].gain.calls.some((call) => call[0] === 'ramp' && call[1] === .74));

const movementAudio = fakeContext();
const movement = createBattleMusicSession({
  combatId: 'source-final',
  runId: 'run-stable',
  musicProfile: { mode: 'movement', movementLeads: ['lead-1', 'lead-2', 'lead-3'] },
  context: movementAudio.context,
  destination: movementAudio.context.destination,
  bufferBank: fixtureBank(),
});
await movement.start();
const movementStart = movement.snapshot();
movementAudio.context.currentTime = movementStart.downbeatAt + .2;
movement.onCombatEvent({ perfect: true });
movementAudio.context.currentTime = movement.snapshot().windowStartAt + BATTLE_BAR_SECONDS;
movement.onCombatEvent({ transition: { from: 0, to: 1 }, perfect: false });
assert.equal(movement.snapshot().targetLead, 'lead-2');
assert.equal(movement.snapshot().pendingLead, 'lead-2', 'boss movements replace the pending voice without cutting the active one');

const fallbackAudio = fakeContext();
const fallback = createBattleMusicSession({
  combatId: 'hall', runId: 'run-stable', musicProfile: { mode: 'fixed', lead: 'lead-3' },
  context: fallbackAudio.context, destination: fallbackAudio.context.destination, bufferBank: fixtureBank(),
});
await fallback.start();
const fallbackDeadline = fallback.snapshot().fallbackAt;
fallbackAudio.context.currentTime = fallbackDeadline - .05;
fallback.update();
assert.equal(fallback.snapshot().activeLead, 'lead-3', 'bar-eight fallback prevents a bed-only encounter');
fallbackAudio.context.currentTime += 1;
fallback.finish();
assert.ok(fallbackAudio.stops.every((entry) => entry.when >= fallbackAudio.context.currentTime + BATTLE_BAR_SECONDS), 'normal resolution uses a one-bar fade');

const incompleteAudio = fakeContext();
const incompleteBank = fixtureBank();
const selected = battleEntryVariant('run-incomplete', 'practice');
incompleteBank.delete(`entry-${selected}-tail`);
const incomplete = createBattleMusicSession({
  combatId: 'practice', runId: 'run-incomplete', musicProfile: { mode: 'fixed', lead: 'lead-2' },
  context: incompleteAudio.context, destination: incompleteAudio.context.destination, bufferBank: incompleteBank,
});
await incomplete.start();
assert.notEqual(incomplete.snapshot().entryVariant, selected, 'an incomplete pair advances to the next complete pair');

const missingLeadAudio = fakeContext();
const missingLeadBank = fixtureBank();
missingLeadBank.delete('lead-2');
const missingLead = createBattleMusicSession({
  combatId: 'practice', runId: 'run-missing-lead', musicProfile: { mode: 'fixed', lead: 'lead-2' },
  context: missingLeadAudio.context, destination: missingLeadAudio.context.destination, bufferBank: missingLeadBank,
});
await missingLead.start();
missingLeadAudio.context.currentTime = missingLead.snapshot().fallbackAt - .05;
missingLead.update();
assert.equal(missingLead.snapshot().activeLead, 'lead-3', 'a missing authored lead advances to the next valid voice');

const abortAudio = fakeContext();
const abortSession = createBattleMusicSession({
  combatId: 'natatorium', runId: 'run-abort', musicProfile: { mode: 'fixed', lead: 'lead-1' },
  context: abortAudio.context, destination: abortAudio.context.destination, bufferBank: fixtureBank(),
});
await abortSession.start();
abortAudio.context.currentTime = abortSession.snapshot().downbeatAt;
abortSession.abort();
assert.equal(abortSession.snapshot().status, 'fading');
assert.ok(abortAudio.stops.every((entry) => Math.abs(entry.when - (abortAudio.context.currentTime + .12)) < 1e-9), 'aborts use the 100ms fade plus a short stop guard');

const unavailableAudio = fakeContext();
const unavailableBank = fixtureBank();
unavailableBank.delete('bed');
const unavailable = createBattleMusicSession({
  combatId: 'chapel', runId: 'run-stable', musicProfile: { mode: 'fixed', lead: 'lead-1' },
  context: unavailableAudio.context, destination: unavailableAudio.context.destination, bufferBank: unavailableBank,
});
assert.equal((await unavailable.start()).status, 'unavailable');
assert.equal(unavailableAudio.starts.length, 0, 'missing bed never produces a partial entrance');

assert.deepEqual(authoredCombatProfile('natatorium').music, { mode: 'fixed', lead: 'lead-1' });
assert.deepEqual(authoredCombatProfile('practice').music, { mode: 'fixed', lead: 'lead-2' });
assert.deepEqual(authoredCombatProfile('hall').music, { mode: 'fixed', lead: 'lead-3' });
assert.deepEqual(sourceCombatDefinition().music.movementLeads, ['lead-1', 'lead-2', 'lead-3']);
assert.deepEqual(authoredCombatProfile('chapel').music.movementLeads, ['lead-1', 'lead-2', 'lead-3', 'lead-1', 'lead-3']);

for (const name of ['bed', 'lead-1', 'lead-2', 'lead-3', 'entry-1-fill', 'entry-1-tail', 'entry-2-fill', 'entry-2-tail', 'entry-3-fill', 'entry-3-tail']) {
  await access(`public/audio/game/battle/${name}.mp3`);
}
const audioProject = JSON.parse(await readFile('content/audio/audio-project.audio.json', 'utf8'));
for (const cueId of ['battle.bed', 'battle.lead.1', 'battle.lead.2', 'battle.lead.3', 'battle.entry.1', 'battle.entry.2', 'battle.entry.3']) {
  assert.ok(audioProject.cues.some((cue) => cue.id === cueId), `canonical audio project includes ${cueId}`);
}

console.log('battle music scheduler tests passed');
