import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShutDoorAnswer } from '../src/game/shut-door-answer.js';
import { lockedDoorAnswer } from '../src/data/elsewhere-worlds.js';
import * as CUES from '../src/audio/cues.js';

const baseline = JSON.parse(readFileSync(new URL('./fixtures/shut-door-answer-baseline.json', import.meta.url), 'utf8'));
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const runtime = {};
const context = () => ({ eligible: true, runtime, phase: 'chapel-outskirts', doorId: 'source-chapel-door-3' });
const seed = Array.from({ length: 100 }, (_, i) => i).find(i => lockedDoorAnswer(i, 2));
const reply = () => ({ answer: lockedDoorAnswer(seed, 2), position: { x: 42, z: -20 } });

test('captured production baseline queues repeated replies and only checks that Source still exists', () => {
  const callbacks = [], heard = [], spoken = [];
  const run = new Function('setTimeout', 'usingSourceSpace', 'R3', 'px', 'py', 'CELL', 'playOutskirtDoorRattle', 'SPEECH',
    `${baseline.function}; return answerOutskirtDoor;`)(
    callback => callbacks.push(callback), () => true, { r3dLookAngles: () => ({ yaw: 0 }) }, 40, -20, 1,
    cue => heard.push(cue), { say: line => spoken.push(line) });
  for (let i = 0; i < 4; i += 1) run(reply());
  assert.equal(callbacks.length, 4, 'one held key can leave multiple independent wall-clock callbacks');
  // No pause/focus/recording/scene/door identity inputs exist in this callback.
  callbacks.forEach(callback => callback());
  assert.equal(heard.length, 4);
  assert.equal(spoken.length, 4);
});

test('one actual authored reply waits on game time and preserves its source position and wording', () => {
  const scheduler = createShutDoorAnswer(), result = reply(), original = structuredClone(result);
  assert.equal(scheduler.request(result, context()), true);
  const seconds = result.answer.delayMs / 1000;
  assert.equal(scheduler.advance(seconds - 0.01, context()), null);
  assert.deepEqual(scheduler.advance(0.01, context()), original);
  assert.equal(scheduler.advance(10, context()), null);
  assert.deepEqual(result, original, 'authored result is not mutated');
});

test('held or repeated interaction neither queues nor postpones the first response', () => {
  const scheduler = createShutDoorAnswer(), first = reply();
  scheduler.request(first, context());
  const seconds = first.answer.delayMs / 1000;
  scheduler.advance(seconds / 2, context());
  for (let i = 0; i < 30; i += 1) {
    assert.equal(scheduler.request({ ...reply(), answer: { ...reply().answer, line: 'later attempt', delayMs: 10000 } }, context()), false);
  }
  assert.deepEqual(scheduler.advance(seconds / 2, context()), first);
  assert.equal(scheduler.request(reply(), context()), false, 'a continuous try owns at most one response');
  assert.equal(scheduler.advance(30, context()), null);
});

for (const reason of ['pause', 'hidden', 'unfocused', 'recording', 'listening', 'playback', 'blocking-scene', 'left-source', 'out-of-reach']) {
  test(`${reason} discards a pending response rather than saving it for return`, () => {
    const scheduler = createShutDoorAnswer();
    scheduler.request(reply(), context());
    assert.equal(scheduler.advance(0, { ...context(), eligible: false }), null);
    assert.deepEqual(scheduler.snapshot(), { doorId: null, position: null, pending: false, spent: false, remaining: 0 });
    assert.equal(scheduler.advance(10, context()), null);
    assert.equal(scheduler.request(reply(), context()), true, 'later deliberate interaction can start a new reply');
  });
}

for (const [name, change] of [
  ['another door', { doorId: 'source-chapel-door-4' }],
  ['another phase', { phase: 'bells' }],
  ['another runtime/run', { runtime: {} }],
]) {
  test(`${name} cannot inherit the old response`, () => {
    const scheduler = createShutDoorAnswer();
    scheduler.request(reply(), context());
    assert.equal(scheduler.advance(5, { ...context(), ...change }), null);
    assert.equal(scheduler.advance(5, context()), null);
  });
}

test('leaving reach after an answer permits a later fresh encounter without storing a reply', () => {
  const scheduler = createShutDoorAnswer();
  scheduler.request(reply(), context());
  assert.ok(scheduler.advance(5, context()));
  scheduler.advance(0, { ...context(), doorId: null });
  assert.equal(scheduler.advance(5, context()), null);
  assert.equal(scheduler.request(reply(), context()), true);
  assert.ok(scheduler.advance(5, context()));
});

test('invalid elapsed values cannot consume or accelerate the response', () => {
  const scheduler = createShutDoorAnswer();
  scheduler.request(reply(), context());
  const before = scheduler.snapshot();
  for (const dt of [0, -1, NaN, Infinity, undefined]) assert.equal(scheduler.advance(dt, context()), null);
  assert.deepEqual(scheduler.snapshot(), before);
});

test('the first unanswering try and a missing source do not spend the response', () => {
  const scheduler = createShutDoorAnswer();
  assert.equal(lockedDoorAnswer(seed, 1), null);
  assert.equal(scheduler.request({ answer: lockedDoorAnswer(seed, 1), position: { x: 42, z: -20 } }, context()), false);
  assert.equal(scheduler.request({ answer: reply().answer }, context()), false);
  assert.equal(scheduler.request(reply(), context()), true);
});

test('trying another door clears the first pending response even when the new try has no answer', () => {
  const scheduler = createShutDoorAnswer();
  scheduler.request(reply(), context());
  const next = { ...context(), doorId: 'source-chapel-door-4' };
  assert.equal(scheduler.request({ answer: null, position: { x: 44, z: -20 } }, next), false);
  assert.equal(scheduler.advance(10, context()), null);
});

test('production no longer owns a raw delayed door callback and ticks through blocked world frames', () => {
  const answer = main.match(/function answerOutskirtDoor\(result\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(answer, /setTimeout/, 'the source of the captured failure must be removed');
  assert.match(answer, /outskirtDoorAnswer\.request\(/);
  const loop = main.slice(main.indexOf('function loop(){'), main.indexOf('function loop(){') + 10000);
  assert.ok(loop.indexOf('tickOutskirtDoorAnswer(dt)') >= 0);
  assert.ok(loop.indexOf('tickOutskirtDoorAnswer(dt)') < loop.indexOf('if(!scenes.blocksWorld())'), 'loss of a scene context must be observed even while world progression is blocked');
});

test('production context independently enforces presence, recording, scene and same-door reach gates', () => {
  const source = main.match(/function outskirtDoorAnswerContext\([^)]*\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'test the actual main context adapter, not a second copy of its eligibility expression');
  const owner = { doorId: context().doorId, position: { x: 42, z: -20 } };
  const door = { id: owner.doorId, shut: true, erased: false, opened: false };
  const actualRuntime = { state: () => ({ phase: context().phase }), doorFieldDoors: () => [door] };
  const base = {
    storyMode: true, inRogue: true, usingSourceSpace: () => true, paused: false,
    document: { hidden: false, hasFocus: () => true },
    scenes: { blocksInput: () => false, blocksWorld: () => false },
    REC: { isRecording: () => false, isListening: () => false }, PB: { isPlaying: () => false },
    chunkSurfRuntime: actualRuntime, outskirtDoorAnswer: { snapshot: () => owner }, px: 40, py: -20, CELL: 1,
  };
  const read = (patch = {}, focus = null) => {
    const inputs = { ...base, ...patch };
    return new Function(...Object.keys(inputs), `${source};return outskirtDoorAnswerContext;`)(...Object.values(inputs))(focus);
  };
  const good = read();
  assert.equal(good.eligible, true);
  assert.equal(good.runtime, actualRuntime);
  assert.equal(good.phase, context().phase);
  assert.equal(good.doorId, owner.doorId);
  for (const patch of [
    { storyMode: false }, { inRogue: false }, { usingSourceSpace: () => false }, { paused: true },
    { document: { hidden: true, hasFocus: () => true } },
    { document: { hidden: false, hasFocus: () => false } },
    { scenes: { blocksInput: () => true, blocksWorld: () => false } },
    { scenes: { blocksInput: () => false, blocksWorld: () => true } },
    { REC: { isRecording: () => true, isListening: () => false } },
    { REC: { isRecording: () => false, isListening: () => true } },
    { PB: { isPlaying: () => true } }, { px: 48 },
    { chunkSurfRuntime: { ...actualRuntime, doorFieldDoors: () => [] } },
    { chunkSurfRuntime: { ...actualRuntime, doorFieldDoors: () => [{ ...door, erased: true }] } },
    { chunkSurfRuntime: { ...actualRuntime, doorFieldDoors: () => [{ ...door, opened: true }] } },
  ]) assert.equal(read(patch).eligible, false, `context must be rejected: ${Object.keys(patch).join(',')}`);
  assert.equal(read({}, { kind: 'outskirt-door', id: owner.doorId }).eligible, true);
  assert.equal(read({}, { kind: 'land-door', id: owner.doorId }).eligible, false);
  assert.equal(read({}, { kind: 'outskirt-door', id: 'another-door' }).eligible, false);
});

test('production response preserves the old sensory treatment and pans from the door at emission time', () => {
  const source = main.match(/function tickOutskirtDoorAnswer\(dt\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  const scheduler = createShutDoorAnswer(), heard = [], spoken = [], look = { yaw: 0 };
  scheduler.request(reply(), context());
  const run = new Function('outskirtDoorAnswer', 'outskirtDoorAnswerContext', 'R3', 'playOutskirtDoorRattle', 'SPEECH',
    `let px=40,py=-20,outskirtDoorReplyOwner=null;const CELL=1,OUTSKIRT_DOOR_REPLY_GROUP='outskirt-door-answer';
    const CUES={stopCueGroup(){}};function cancelOutskirtDoorAnswer(){outskirtDoorAnswer.cancel();}
    ${source};return {tick:tickOutskirtDoorAnswer,pose:(x,y,yaw)=>{px=x;py=y;R3.look.yaw=yaw;}};`)(
    scheduler, context, { look, r3dLookAngles: () => look }, cue => heard.push(cue), { say: line => spoken.push(line) });
  run.tick(reply().answer.delayMs / 1000 - .01);
  assert.equal(heard.length, 0);
  run.pose(42, -22, Math.PI / 2);
  run.tick(.01);
  run.tick(10);
  assert.equal(heard.length, 1);
  const pan = Math.max(-1, Math.min(1, Math.sin(Math.atan2(42 - 42, -(-20 - -22)) - Math.PI / 2)));
  const expected = reply().answer.kind === 'knock'
    ? { gain: .42, pan, lowpassHz: 650, rate: .55, count: 3, spacing: .34, group: 'outskirt-door-answer' }
    : { gain: .26, pan, lowpassHz: 1100, rate: 1.55, count: 4, spacing: .11, group: 'outskirt-door-answer' };
  assert.deepEqual(heard, [expected]);
  assert.deepEqual(spoken, [{ who: 'you', text: reply().answer.line }]);
});

test('brief away events cancel even when no animation frame runs in the background', () => {
  for (const name of ['settleAfterAway', 'onBlur']) {
    const source = main.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.match(source, /cancelOutskirtDoorAnswer\(/, `${name} must discard the pending response and stop its active delayed voices`);
  }
  const hidden = main.slice(main.lastIndexOf("document.addEventListener('visibilitychange'"));
  assert.ok(hidden.startsWith("document.addEventListener('visibilitychange'"),'the actual global visibility listener exists');
  assert.match(hidden.slice(0, 1600), /if\(document\.hidden\)\{[\s\S]*?cancelOutskirtDoorAnswer\(/);
  const pagehide = main.slice(main.indexOf("window.addEventListener('pagehide'"));
  assert.match(pagehide.slice(0, 700), /cancelOutskirtDoorAnswer\(/);
});

test('actual cue groups stop delayed reply tails on recording, phase changes and away, without stopping the player handle', async () => {
  const voices = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  const audio = {
    currentTime: 10,
    decodeAudioData: async () => ({ duration: 1 }),
    createGain: () => ({ ...node(), gain: parameter() }),
    createBiquadFilter: () => ({ ...node(), frequency: parameter() }),
    createStereoPanner: () => ({ ...node(), pan: parameter() }),
    createBufferSource: () => {
      const source = { ...node(), playbackRate: parameter(), stopped: false,
        start(at) { this.startedAt = at; }, stop() { this.stopped = true; } };
      voices.push(source);
      return source;
    },
  };
  CUES.cuesInit(audio, node());
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    await CUES.preload(CUES.CUE.door);
  } finally { globalThis.fetch = originalFetch; }

  const extract = name => {
    const source = main.match(new RegExp(`function ${name}\\([^)]*\\)\\{[\\s\\S]*?\\n\\}`))?.[0];
    assert.ok(source, `actual production ${name} is present`);
    return source;
  };
  const make = () => {
    const scheduler = createShutDoorAnswer();
    let liveContext = context();
    const source = ['playOutskirtDoorRattle', 'cancelOutskirtDoorAnswer', 'tickOutskirtDoorAnswer'].map(extract).join('\n');
    const run = new Function('CUES', 'outskirtDoorAnswer', 'outskirtDoorAnswerContext',
      `let px=40,py=-20,outskirtDoorReplyOwner=null;const CELL=1,OUTSKIRT_DOOR_REPLY_GROUP='outskirt-door-answer';
      const R3={r3dLookAngles:()=>({yaw:0})},SPEECH={say(){}};
      ${source};return {tick:tickOutskirtDoorAnswer,rattle:playOutskirtDoorRattle,cancel:cancelOutskirtDoorAnswer};`)(
      CUES, scheduler, () => liveContext);
    return { ...run, scheduler, context: patch => { liveContext = { ...context(), ...patch }; } };
  };

  try {
    // The captured old callback schedules the same real cue voices without an
    // owner group. Stopping the new reply group cannot reach those old tails.
    const old = make(), callbacks = [];
    const oldAnswer = new Function('setTimeout', 'usingSourceSpace', 'R3', 'px', 'py', 'CELL', 'playOutskirtDoorRattle', 'SPEECH',
      `${baseline.function};return answerOutskirtDoor;`)(
      callback => callbacks.push(callback), () => true, { r3dLookAngles: () => ({ yaw: 0 }) }, 40, -20, 1, old.rattle, { say() {} });
    oldAnswer(reply());
    callbacks[0]();
    const count = reply().answer.kind === 'knock' ? 3 : 4;
    assert.equal(CUES.liveCueCount(), count);
    assert.ok(voices.some(voice => voice.startedAt > audio.currentTime), 'the original reply includes audio already scheduled into the future');
    assert.equal(CUES.stopCueGroup('outskirt-door-answer', 0), 0, 'the captured unowned reply cannot be stopped as a reply');
    assert.equal(CUES.liveCueCount(), count);
    CUES.stopAllCues(0);

    for (const loss of ['recording', 'phase', 'away']) {
      const run = make(), firstVoice = voices.length;
      run.scheduler.request(reply(), context());
      run.tick(5);
      assert.equal(CUES.cueGroupSize('outskirt-door-answer'), count);
      run.rattle();
      assert.equal(CUES.liveCueCount(), count + 3, 'initial player handle feedback remains ungrouped');
      if (loss === 'recording') { run.context({ eligible: false }); run.tick(.01); }
      if (loss === 'phase') { run.context({ phase: 'bells' }); run.tick(.01); }
      if (loss === 'away') run.cancel();
      assert.equal(CUES.cueGroupSize('outskirt-door-answer'), 0, loss);
      assert.equal(CUES.liveCueCount(), 3, `${loss} stops reply voices and preserves the player handle`);
      assert.ok(voices.slice(firstVoice, firstVoice + count).every(voice => voice.stopped), `${loss} also stops reply sources whose scheduled start is still in the future`);
      assert.ok(voices.slice(firstVoice + count).every(voice => !voice.stopped), `${loss} does not stop unrelated handle feedback`);
      CUES.stopAllCues(0);
    }
  } finally { CUES.stopAllCues(0); CUES.cuesInit(null, null); }
});
