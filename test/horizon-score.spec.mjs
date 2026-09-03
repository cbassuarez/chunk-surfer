// THE SCORE, AND THE ROOM IT NOW KNOWS IT IS IN.
//
// The elegant part of this module was already right and is deliberately left
// alone: position IS the playhead, there is no transport, standing still holds
// a drone and walking back rewinds. What it had no idea about was space. It was
// a mono buffer into a bare GainNode — no pan, no filter, no distance — in a
// hundred-and-twenty-eight-metre-wide picture. You could turn a full circle on
// the tape and the audio was bit-identical.
//
// Driven against a stub AudioContext, because the behaviours worth pinning are
// all decisions the module makes rather than sounds a device produces.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createHorizonScore } from '../src/audio/horizon-score.js';

function harness() {
  const state = { t: 0, pans: [], tones: [], sources: 0, filters: 0 };
  const mk = () => ({
    connect() {}, disconnect() {}, type: '',
    gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, setValueCurveAtTime() {} },
    Q: { value: 0, setValueAtTime() {} },
  });
  const ctx = {
    get currentTime() { return state.t; }, sampleRate: 48000,
    createGain: () => mk(),
    createStereoPanner: () => {
      const n = mk();
      n.pan = { _v: 0, get value() { return this._v; }, set value(v) { this._v = v; state.pans.push(v); } };
      return n;
    },
    createBiquadFilter: () => {
      state.filters += 1;
      const n = mk();
      n.frequency = { _v: 18000, get value() { return this._v; }, set value(v) { this._v = v; state.tones.push(v); }, setValueAtTime() {} };
      return n;
    },
    createBufferSource: () => {
      state.sources += 1;
      const n = mk();
      n.detune = { value: 0 }; n.playbackRate = { value: 1 };
      n.start = () => {}; n.stop = () => {};
      return n;
    },
    decodeAudioData: async () => ({ duration: 259.39 }),
  };
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const score = createHorizonScore(ctx, { destination: mk(), url: 'tape.opus', random: () => 0.5 });
  const run = (frames, seconds, room, dtMs = 50) => {
    for (let i = 0; i < frames; i += 1) { state.t += dtMs / 1000; score.tick(seconds(i), dtMs, 1, room); }
  };
  return { state, score, run };
}

test('the playhead glides across a grid step and snaps across a warp', async () => {
  // The body moves on a grid, so position arrives as a staircase: one jump of
  // about half a second of tape per step, while the camera glides between the
  // same two cells. Consecutive 150ms grains were reading windows half a second
  // apart, which stutters a piece meant to be continuous.
  const { state, score } = harness();
  await score.load();
  score.tick(10, 16, 1, {});
  const walked = [];
  for (let i = 0; i < 12; i += 1) { state.t += 0.016; walked.push(score.tick(10.5, 16, 1, {}).position); }
  assert.ok(walked[0] > 10 && walked[0] < 10.1, `the step is not taken in one frame (${walked[0]})`);
  assert.ok(walked.at(-1) > walked[0], 'and it keeps closing');
  for (let i = 1; i < walked.length; i += 1) assert.ok(walked[i] >= walked[i - 1], 'monotone');

  // A warp is not a walk — sliding the playhead 190 seconds across the tape to
  // catch up would be audible as a scrub nobody performed.
  assert.equal(score.tick(200, 16, 1, {}).position, 200);
});

test('grains follow the body across the corridor, and the head as it turns', async () => {
  const left = harness(); await left.score.load();
  left.run(40, (i) => 100 + i * 0.1, { lateral: -1, facing: 0 });
  const right = harness(); await right.score.load();
  right.run(40, (i) => 100 + i * 0.1, { lateral: 1, facing: 0 });
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  assert.ok(left.state.pans.length, 'grains are panned at all');
  assert.ok(mean(left.state.pans) < -0.3, `standing left puts the field left (${mean(left.state.pans).toFixed(2)})`);
  assert.ok(mean(right.state.pans) > 0.3, `and right, right (${mean(right.state.pans).toFixed(2)})`);

  // Turning has to move it too, or the score is telling the ears nothing about
  // where the body is looking — which is what it used to do.
  const turned = harness(); await turned.score.load();
  turned.run(40, (i) => 100 + i * 0.1, { lateral: 1, facing: Math.PI });
  assert.ok(mean(turned.state.pans) < 0, 'facing about-turn mirrors the field');
});

test('the collapse takes the top off, not just the level', async () => {
  const { state, score, run } = harness();
  await score.load();
  assert.equal(state.filters, 1, 'a tone filter exists at all');
  run(60, () => 250, { collapse: 1, depth01: 1 });
  assert.ok(state.tones.length, 'the filter moves');
  assert.ok(state.tones.at(-1) < 2000, `and closes down (${Math.round(state.tones.at(-1))}Hz)`);
});

test('a slow frame still books a continuous stream of grains', async () => {
  // Grains were scheduled at most one per animation frame against a 52ms
  // interval, so below about nineteen frames a second the stream under-ran into
  // audible gaps. The scheduler books a short window ahead of the audio clock
  // instead, so a dropped frame costs nothing.
  //
  // The body walks at about 3.7 tape-seconds per second out there, so the long
  // frame advances the tape by that much: this test is about the FRAME being
  // slow, not the body, and holding the position still would now be measuring
  // the stillness gate below instead of the scheduler.
  const { state, score } = harness();
  await score.load();
  score.tick(10, 16, 1, {});
  const before = state.sources;
  state.t += 0.2;
  score.tick(10 + 3.7 * 0.2, 200, 1, {});
  assert.ok(state.sources - before >= 3,
    `one long frame books a window, not a grain (${state.sources - before})`);
});

// Walk a body at the nominal pace for a second, then hold it still for a second,
// and count what each books and at what level.
// `settle` seconds are ticked but not counted, so the counts describe the
// steady state rather than the ramp between the two — the gate is smoothed on
// purpose, so a step-to-step gap on the grid is not heard as stopping.
function walkThenStand({ state, score }, { seconds = 1, settle = 0, dtMs = 16, rate } = {}) {
  const dt = dtMs / 1000;
  let tape = 10;
  let booked = 0;
  let last = null;
  for (let elapsed = 0; elapsed < seconds + settle; elapsed += dt) {
    const before = state.sources;
    tape += rate * dt;
    state.t += dt;
    last = score.tick(tape, dtMs, 1, {});
    if (elapsed >= settle) booked += state.sources - before;
  }
  return { booked, last };
}

test('standing still thins the stream to a held tone instead of holding it at full level', async () => {
  // THE COMPLAINT THIS ANSWERS. The playhead was always a real scrub, but the
  // grain scheduler ran off ctx.currentTime and booked ~19 grains a second
  // forever at an unchanged level, so a stopped body got the same 150ms window
  // held indefinitely — the most sustained version of the piece, not the
  // quietest. Stopping has to sound like stopping.
  const { state, score } = harness();
  await score.load();
  const walking = walkThenStand({ state, score }, { rate: 3.7, settle: 1 });
  const standing = walkThenStand({ state, score }, { rate: 0, settle: 2 });

  assert.ok(standing.booked < walking.booked * 0.55,
    `standing thins the stream (${standing.booked} vs ${walking.booked})`);
  assert.ok(standing.booked > 0, 'and does not stop it: this is a held tone, not silence');
  assert.ok(standing.last.carried < walking.last.carried * 0.4,
    `standing drops the level (${standing.last.carried} vs ${walking.last.carried})`);
  assert.ok(standing.last.carried > 0.05, 'but something is still playing');

  // And walking again restores both, so the player controls it with their legs.
  const again = walkThenStand({ state, score }, { rate: 3.7, settle: 1 });
  assert.ok(again.last.carried > standing.last.carried * 2.5, 'walking on opens it back up');
});

test('the pitch bend is a gesture at walking pace, not a switch pinned to its clamp', async () => {
  // velocity used to be the glide's own residual over dt — about 11x the true
  // tape rate and frame-rate dependent — so `clamp(velocity * 90, -220, 220)`
  // saturated the instant a key went down and sat at 0 whenever it did not.
  const { state, score } = harness();
  await score.load();
  const walking = walkThenStand({ state, score }, { rate: 3.7 });
  assert.ok(Math.abs(walking.last.velocity - 3.7) < 0.6,
    `velocity reports the real tape rate (${walking.last.velocity})`);
  const bend = walking.last.velocity * 32;
  assert.ok(Math.abs(bend) < 220, `the bend has headroom at a walk (${bend} cents)`);
  assert.ok(Math.abs(bend) > 60, 'and is still an audible gesture');
});

test('pace is measured the same at 30fps and at 120fps', async () => {
  // The old derivation divided the glide residual by dt, so the identical walk
  // reported a different pace at a different frame rate.
  const slow = harness(); await slow.score.load();
  const fast = harness(); await fast.score.load();
  const a = walkThenStand(slow, { rate: 3.7, dtMs: 33 });
  const b = walkThenStand(fast, { rate: 3.7, dtMs: 8 });
  assert.ok(Math.abs(a.last.velocity - b.last.velocity) < 0.35,
    `same walk, same pace (${a.last.velocity} vs ${b.last.velocity})`);
});

test('a failed low-memory decode falls back instead of going silent', async () => {
  // decodeAudioData DETACHES the buffer it is handed, so the reduceMemory
  // fallback was retrying with an empty ArrayBuffer — it threw, the whole load
  // landed in the outer catch, and the tape played in silence with a warning
  // that named the wrong cause.
  let offlineTried = false, fallbackBytes = -1;
  globalThis.OfflineAudioContext = class {
    constructor() {}
    decodeAudioData() { offlineTried = true; return Promise.reject(new Error('no')); }
  };
  const { state, score } = harness();
  state.ctxDecode = true;
  const ctxAny = score;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) });
  const low = createHorizonScore({
    get currentTime() { return 0; }, sampleRate: 48000,
    createGain: () => ({ connect() {}, disconnect() {}, gain: { value: 0 } }),
    createBiquadFilter: () => ({ connect() {}, disconnect() {}, type: '', frequency: { value: 0 }, Q: { value: 0 } }),
    decodeAudioData: (bytes) => { fallbackBytes = bytes.byteLength; return Promise.resolve({ duration: 1 }); },
  }, { destination: null, url: 'tape.opus', reduceMemory: true, random: () => 0.5 });
  await low.load();
  assert.ok(offlineTried, 'the low-memory path is attempted');
  assert.equal(fallbackBytes, 16, 'and the fallback gets bytes rather than a detached buffer');
  assert.ok(low.ready(), 'so the score actually loads');
  delete globalThis.OfflineAudioContext;
  void ctxAny;
});
