import test from 'node:test';
import assert from 'node:assert/strict';
import { freshWinding, stepWinding, windingWearGain, windingKeyAngle, windingCylinderAngle, windingSummary, WINDING_PHASE, WINDING_TUNING } from '../src/game/coastal-memory/winding.js';
import { CLAIR_DE_LUNE_SCORE_SECONDS } from '../src/data/clair-de-lune-music-box.js';
import { MUSIC_BOX_REFERENCE_SECONDS } from '../src/data/music-box-reference.js';

const SCORE = CLAIR_DE_LUNE_SCORE_SECONDS;
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
function run(state, input, count = 1, dt = .25) {
  const events = [];
  for (let i = 0; i < count; i++) {
    const result = stepWinding(state, input, dt);
    for (const event of result.events) assert.ok(Number.isFinite(event.at) && event.at >= 0 && event.at <= Math.min(.25, Math.max(0, dt)), 'event has a finite, step-relative time');
    for (let j = 1; j < result.events.length; j++) assert.ok(result.events[j].at >= result.events[j - 1].at, 'events remain in time order');
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
const crank = (state = freshWinding(), turnsPerSecond = 1, seconds = 1) => run(state, { held: true, turn: turnsPerSecond }, Math.round(seconds / .25));
const release = (state, count = 1, dt = .25) => run(state, { held: false, turn: 0 }, count, dt);

test('the broken box plays only while its winding key is manually supported and turned', () => {
  const start = freshWinding();
  assert.equal(start.phase, WINDING_PHASE.REST);
  assert.equal(start.durationSeconds, MUSIC_BOX_REFERENCE_SECONDS);
  const held = run(start, { held: true, turn: 0 }, 4);
  assert.equal(held.state.score, 0);
  assert.equal(held.events.length, 0);
  const cranked = crank(held.state);
  assert.equal(cranked.state.phase, WINDING_PHASE.CRANKING);
  near(cranked.state.playbackSeconds, 1);
  near(cranked.state.score, SCORE / MUSIC_BOX_REFERENCE_SECONDS);
  assert.equal(cranked.state.playbackRate, 1);
  assert.ok(cranked.state.wind > 0 && windingKeyAngle(cranked.state) < 0);
  assert.ok(cranked.events.some(e => e.type === 'wind-start'));
  assert.equal(cranked.events.filter(e => e.type === 'play-start').length, 1);
  assert.equal(cranked.state.attempts, 1);
  const heldStill = run(cranked.state, { held: true, turn: 0 }, 4);
  assert.equal(heldStill.state.phase, WINDING_PHASE.HELD);
  assert.equal(heldStill.state.playbackRate, 0);
  assert.equal(heldStill.state.playbackSeconds, cranked.state.playbackSeconds);
  assert.equal(heldStill.events.find(e => e.type === 'play-stop').reason, 'key-still');
});

test('release slams only the key; cylinder and recorded phrase hold their exact phase', () => {
  const cranked = crank(freshWinding(), 1, 3).state;
  const score = cranked.score, playback = cranked.playbackSeconds;
  const cylinder = windingCylinderAngle(cranked), key = windingKeyAngle(cranked);
  const released = release(cranked, 1, .016);
  assert.equal(released.state.phase, WINDING_PHASE.SLAMMING);
  assert.equal(released.state.playbackRate, 0);
  assert.ok(released.events.some(e => e.type === 'slam-start'));
  assert.equal(released.events.find(e => e.type === 'play-stop').reason, 'released');
  assert.equal(released.state.score, score);
  assert.equal(released.state.playbackSeconds, playback);
  assert.equal(windingCylinderAngle(released.state), cylinder);
  assert.ok(windingKeyAngle(released.state) > key, 'the winding key recoils');
  const stopped = release(released.state, 10);
  assert.equal(stopped.state.phase, WINDING_PHASE.REST);
  assert.equal(stopped.state.wind, 0);
  assert.equal(stopped.state.score, score);
  assert.equal(stopped.events.filter(e => e.type === 'slam-end').length, 1);
  assert.equal(stopped.events.some(e => e.type === 'pluck'), false, 'no backward rake is invented');
});

test('waiting cannot rewind or restart; the next manual turn resumes the stopped phrase', () => {
  const stopped = release(crank().state, 10).state;
  const playback = stopped.playbackSeconds;
  const waited = release(stopped, 100);
  assert.equal(waited.events.length, 0);
  assert.equal(waited.state.playbackSeconds, playback);
  const resumed = crank(waited.state);
  near(resumed.state.playbackSeconds, playback + 1);
  assert.equal(resumed.events.find(e => e.type === 'play-start').playbackSeconds, playback);
  assert.equal(resumed.state.attempts, 2);
});

test('slow and fast supported turns keep the reference pitch and rate; no guessed ratchet clicks are added', () => {
  const slow = crank(freshWinding(), .2);
  const fast = crank(freshWinding(), 1);
  const runaway = crank(freshWinding(), 100);
  assert.ok(fast.state.wind > slow.state.wind);
  assert.ok(runaway.state.wind <= 1);
  for (const result of [slow, fast, runaway]) {
    near(result.state.playbackSeconds, 1);
    assert.equal(result.state.playbackRate, 1);
    assert.equal(result.events.some(e => e.type === 'wind-click'), false);
  }
});

test('negative or imperceptibly small turns cannot reverse or run the tune', () => {
  for (const turn of [-4, 0, WINDING_TUNING.minTurnRate / 2]) {
    const fresh = run(freshWinding(), { held: true, turn }, 20);
    assert.equal(fresh.state.wind, 0);
    assert.equal(fresh.state.score, 0);
    assert.equal(fresh.events.length, 0);
  }
  const played = crank().state;
  const reversed = run(played, { held: true, turn: -4 }, 20);
  assert.equal(reversed.state.playbackSeconds, played.playbackSeconds);
  assert.equal(reversed.state.keyPhase, played.keyPhase);
  assert.ok(reversed.events.every(e => e.direction !== -1));
});

test('catching a recoiling key restores agency immediately without a second capture or reset', () => {
  const released = release(crank().state, 1, .016).state;
  const caught = run(released, { held: true, turn: 0 }, 1, .016);
  assert.equal(caught.state.phase, WINDING_PHASE.HELD);
  assert.equal(caught.state.playbackSeconds, released.playbackSeconds);
  near(caught.state.keyPhase, released.keyPhase);
  assert.equal(caught.events.find(e => e.type === 'slam-end').reason, 'caught');
  const resumed = crank(caught.state);
  assert.ok(resumed.state.playbackSeconds > released.playbackSeconds);
});

test('repeated attempts preserve recorded errors without inventing snapped tines or a damage cascade', () => {
  let state = freshWinding();
  const events = [];
  let before = 0;
  for (let attempt = 0; attempt < 8; attempt++) {
    const played = crank(state, .4, .5);
    const stopped = release(played.state, 4);
    events.push(...played.events, ...stopped.events); state = stopped.state;
    assert.ok(state.playbackSeconds >= before);
    before = state.playbackSeconds;
    assert.equal(state.wear, 0);
  }
  assert.equal(windingWearGain(1), 1);
  assert.ok(events.some(e => e.type === 'pluck'));
  for (const event of events.filter(e => e.type === 'pluck')) {
    assert.equal(event.direction, 1);
    assert.equal(event.state, 'whole');
    assert.equal(event.cents, 0);
    assert.equal(event.proxy, true, 'pinning study is explicitly distinct from actual recorded errors');
  }
  assert.equal(events.some(e => ['tick', 'lurch', 'drive-slip'].includes(e.type)), false);
  const indices = events.filter(e => e.type === 'pluck').map(e => e.index);
  assert.equal(indices.length, new Set(indices).size, 'resuming does not duplicate a crossed pin');
});

test('the complete selected recording ends once rather than wrapping or inventing a new phrase', () => {
  const result = crank(freshWinding(), 1, 50);
  assert.equal(result.state.playbackSeconds, MUSIC_BOX_REFERENCE_SECONDS);
  assert.equal(result.state.score, SCORE);
  assert.equal(result.state.stopReason, 'reference-end');
  assert.equal(result.state.playbackRate, 0);
  assert.equal(result.events.filter(e => e.type === 'tune-end').length, 1);
  const stopped = release(result.state, 10);
  const resumed = crank(stopped.state);
  assert.equal(resumed.state.playbackSeconds, MUSIC_BOX_REFERENCE_SECONDS);
  assert.equal(resumed.events.some(e => e.type === 'play-start' || e.type === 'tune-end'), false);
});

test('forward transport and recoil agree across frame partitions and save/reload', () => {
  const coarse = run(freshWinding(), { held: true, turn: 1 }, 8, .25);
  const fine = run(freshWinding(), { held: true, turn: 1 }, 120, 1 / 60);
  near(coarse.state.playbackSeconds, fine.state.playbackSeconds);
  near(coarse.state.wind, fine.state.wind);
  near(coarse.state.keyPhase, fine.state.keyPhase);
  assert.deepEqual(coarse.events.filter(e => e.type === 'pluck').map(e => e.index), fine.events.filter(e => e.type === 'pluck').map(e => e.index));
  const released = release(coarse.state, 1, .1).state;
  const reloaded = release(JSON.parse(JSON.stringify(released)), 1, .1);
  const continued = release(released, 1, .1);
  assert.deepEqual(reloaded, continued);
  const restCoarse = release(coarse.state, 4).state;
  const restFine = release(fine.state, 60, 1 / 60).state;
  near(restCoarse.keyPhase, restFine.keyPhase);
  near(restCoarse.playbackSeconds, restFine.playbackSeconds);
});

test('zero-time release edges stop immediately without erasing progress or duplicating the slam', () => {
  const running = crank().state;
  const paused = stepWinding(running, { held: false, turn: 0 }, 0);
  assert.equal(paused.state.playbackSeconds, running.playbackSeconds);
  assert.equal(paused.state.keyPhase, running.keyPhase);
  assert.equal(paused.state.phase, WINDING_PHASE.SLAMMING);
  assert.equal(paused.state.slamElapsed, 0);
  assert.equal(paused.events.filter(e => e.type === 'slam-start').length, 1);
  assert.equal(paused.events.filter(e => e.type === 'play-stop').length, 1);
  const repeated = stepWinding(paused.state, { held: false, turn: 0 }, 0);
  assert.equal(repeated.events.length, 0);
  assert.equal(repeated.state.playbackSeconds, running.playbackSeconds);
  const fresh = stepWinding(freshWinding(), { held: true, turn: 4 }, 0);
  assert.equal(fresh.state.keyPhase, 0);
  assert.equal(fresh.state.playbackSeconds, 0);
  assert.equal(fresh.events.length, 0);
});

test('malformed input and legacy reverse-phase saves cannot erase progress or flood events', () => {
  const running = crank().state;
  const legacy = stepWinding({ phase: 'slamming', score: 12, wind: .5, keyPhase: 2 }, {}, .25);
  near(legacy.state.score, 12);
  assert.equal(legacy.events.some(e => e.direction === -1), false);
  for (const number of [NaN, Infinity, -Infinity, -2, undefined]) {
    const result = stepWinding({ ...running, wind: number, keyPhase: number }, { held: true, turn: number }, number);
    assert.ok(Object.values(windingSummary(result.state)).every(v => Number.isFinite(v) || typeof v === 'boolean' || typeof v === 'string'));
    assert.ok(result.events.length <= 5, 'bounded input cannot create an event flood');
    assert.ok(result.state.playbackSeconds >= running.playbackSeconds);
  }
  assert.equal(WINDING_TUNING.catchScore.length, 0);
});
