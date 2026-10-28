import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordingPressurePerformance } from '../src/game/recording-pressure.js';
import { TAKE_HUNTER, armTakeHunter, freshTakeHunter, stepTakeHunter,
  tryCancelTake } from '../src/game/take-hunter.js';

const frame = (hunter, extra = {}) => ({ takeId: 'take:1', roomId: 'main_b3',
  recording: true, tutorial: false, slating: false, stalled: false,
  hunter, atSec: 7.123456789, ...extra });
const fixture = (emit) => {
  const heard = [];
  const performance = createRecordingPressurePerformance({ emit: emit || (event => { heard.push(event); }) });
  return { performance, heard };
};
const closeHunter = () => ({ ...armTakeHunter(freshTakeHunter(), { cause: 'case', roll: 0 }),
  cells: 6, seconds: 10, warningSeconds: TAKE_HUNTER.dragWarningSeconds });

test('a real noise arms one answer; repeated frames preserve its exact tape time and provenance', () => {
  const { performance, heard } = fixture();
  performance.update(frame(freshTakeHunter()));
  const hunter = armTakeHunter(freshTakeHunter(), { cause: 'voice', roll: 0 });
  const original = { ...hunter };
  performance.update(frame(hunter));
  for (let tick = 0; tick < 20; tick += 1) performance.update(frame(hunter, { atSec: 8 + tick / 10 }));
  assert.equal(heard.length, 1);
  assert.equal(heard[0].kind, 'recording.answer');
  assert.equal(heard[0].atSec, 7.123456789, 'event time is not rounded, reconstructed or frame-derived');
  assert.equal(heard[0].provenance, 'take-hunter');
  assert.equal(heard[0].cause, 'voice');
  assert.equal(heard[0].takeId, 'take:1');
  assert.equal(heard[0].roomId, 'main_b3');
  assert.deepEqual(hunter, original, 'the presentation controller cannot advance danger');
  assert.equal(performance.inspect().events[0].eventId, heard[0].eventId);
});

test('a warning performs once through pause/stall/resume, with registered STOP presses rather than repeated ticks', () => {
  const { performance, heard } = fixture();
  let hunter = closeHunter();
  performance.update(frame(hunter));
  assert.deepEqual(heard.map(e => e.kind), ['recording.answer', 'recording.drag']);
  performance.update(frame(hunter, { stalled: true }));
  performance.update(frame(hunter));
  assert.equal(heard.length, 2, 'resuming the same state does not restart its sound');

  for (let press = 1; press <= hunter.cancelNeeds; press += 1) {
    const attempt = tryCancelTake(hunter);
    hunter = attempt.state;
    performance.stopPress(frame(hunter, { atSec: 8 + press / 10 }));
    performance.stopPress(frame(hunter, { atSec: 20 }));
    performance.update(frame(hunter));
  }
  const brakes = heard.filter(e => e.kind === 'recording.brake');
  assert.deepEqual(brakes.map(e => e.tries), [1, 2, 3, 4, 5]);
  assert.deepEqual(brakes.map(e => e.remaining), [5, 4, 3, 2, 1]);
  assert.ok(brakes.every(e => e.needs === 6));
  assert.equal(new Set(heard.map(e => e.eventId)).size, heard.length);
  assert.equal(heard.filter(e => e.kind === 'recording.drag').length, 1,
    'successful forcing does not start another warning');
});

test('silence releases the transport once, without a second release when the same quiet loses the hunter', () => {
  const { performance, heard } = fixture();
  let hunter = closeHunter();
  performance.update(frame(hunter));
  let lost = false;
  for (let tick = 0; tick < 300 && !lost; tick += 1) {
    const result = stepTakeHunter(hunter, 0.1, { recording: true, heard: 0 });
    hunter = result.state;
    lost = !!result.lost;
    performance.update(frame(hunter, { atSec: 8 + tick / 10, lost }));
  }
  assert.equal(lost, true);
  const releases = heard.filter(e => e.kind === 'recording.release');
  assert.equal(releases.length, 1);
  assert.equal(releases[0].reason, 'quiet');

  hunter = armTakeHunter(hunter, { cause: 'voice', roll: 0 });
  performance.update(frame(hunter, { atSec: 40 }));
  assert.equal(heard.filter(e => e.kind === 'recording.answer').length, 2, 'a fresh hunt has its own answer');
  performance.update(frame(freshTakeHunter(), { lost: true, atSec: 45 }));
  performance.update(frame(freshTakeHunter(), { lost: true, atSec: 46 }));
  const later = heard.filter(e => e.kind === 'recording.release');
  assert.equal(later.length, 2);
  assert.equal(later[1].reason, 'lost', 'an explicit lost result can supply a missed quiet edge');
  assert.notEqual(later[0].eventId, later[1].eventId);
});

test('an inactive state alone does not invent quiet recovery after contact or interruption', () => {
  const { performance, heard } = fixture();
  performance.update(frame(closeHunter()));
  performance.update(frame(freshTakeHunter()));
  assert.equal(heard.some(e => e.kind === 'recording.release'), false);
});

test('early STOP, ended takes and explicit reset cannot replay cues; a new take has fresh identity', () => {
  const { performance, heard } = fixture();
  const hunter = armTakeHunter(freshTakeHunter(), { roll: 0 });
  performance.update(frame(hunter));
  performance.stopPress(frame(tryCancelTake(hunter).state));
  assert.deepEqual(heard.map(e => e.kind), ['recording.answer'], 'an accepted early STOP has no brake cue');
  performance.update(frame(hunter, { recording: false }));
  performance.update(frame(hunter));
  assert.equal(heard.length, 1, 'a stopped take cannot be reopened by a stale frame');
  assert.equal(performance.inspect().transport.phase, 'normal');

  performance.update(frame(hunter, { takeId: 'take:2', atSec: 0.125 }));
  assert.equal(heard.length, 2);
  assert.notEqual(heard[0].eventId, heard[1].eventId);
  performance.reset();
  performance.update(frame(hunter, { takeId: 'take:2' }));
  assert.equal(heard.length, 2, 'reset retires the old take rather than replaying its opening');
  performance.update(frame(hunter, { takeId: 'take:3' }));
  assert.equal(heard.length, 3);
});

test('tutorial, slate and stalled transport suppress audio without spending a live edge', () => {
  for (const condition of ['tutorial', 'slating', 'stalled']) {
    const { performance, heard } = fixture();
    const hunter = closeHunter();
    performance.update(frame(hunter, { [condition]: true }));
    performance.stopPress(frame({ ...hunter, cancelTries: 1 }, { [condition]: true }));
    assert.equal(heard.length, 0);
    performance.update(frame(hunter));
    performance.update(frame(hunter));
    assert.deepEqual(heard.map(e => e.kind), ['recording.answer', 'recording.drag']);
  }
});

test('audio stays in B3 while the transport model remains available elsewhere', () => {
  const { performance, heard } = fixture();
  const hunter = { ...closeHunter(), cancelTries: 1 };
  performance.update(frame(hunter, { roomId: 'amplifications' }));
  performance.stopPress(frame(hunter, { roomId: 'amplifications' }));
  assert.deepEqual(heard, []);
  assert.equal(performance.inspect().transport.phase, 'seized');
  assert.equal(performance.inspect().transport.tries, 1);
});

test('failed audio is not retained as tape evidence and cannot retry at a fictitious later time', () => {
  let calls = 0;
  const { performance } = fixture(() => { calls += 1; return false; });
  const hunter = armTakeHunter(freshTakeHunter(), { roll: 0 });
  performance.update(frame(hunter));
  performance.update(frame(hunter, { atSec: 60 }));
  assert.equal(calls, 1);
  assert.deepEqual(performance.inspect().events, []);
  assert.doesNotThrow(() => createRecordingPressurePerformance({ emit: () => { throw Error('unavailable'); } })
    .update(frame(hunter)));
});

test('missing identity or tape time cannot generate an invented event', () => {
  const { performance, heard } = fixture();
  const hunter = closeHunter();
  performance.update(frame(hunter, { takeId: null }));
  performance.update(frame(hunter, { atSec: NaN }));
  performance.update(frame(hunter, { atSec: -1 }));
  assert.deepEqual(heard, []);
  performance.update(frame(hunter));
  assert.equal(heard.length, 2);
});
