import test from 'node:test';
import assert from 'node:assert/strict';
import { createWindowMediaEncounters } from '../src/game/window-media-encounters.js';
import { STUDY_EVENTS } from '../src/platform/window-media-studies.js';

const event = (type, detail = {}, outer = {}) => ({ type: 'event', event: { type, ...detail }, ...outer });
const pose = (detail = {}) => ({ type: 'pose', phase: 'catch', threat: { refuge: true }, recovery: null, reveal: null, ...detail });
function fixture(owner = 'tear:1', options = {}) {
  const commands = [], traces = [];
  const controller = createWindowMediaEncounters({ onCommand: value => commands.push(value), onTrace: value => traces.push(value) });
  controller.begin(owner, options);
  return { controller, commands, traces, owner,
    observe: trace => controller.observe(owner, trace),
    shows: () => commands.filter(command => command.type === 'show'),
    events: () => commands.filter(command => command.type === 'event'),
    ends: () => commands.filter(command => command.type === 'end'),
  };
}
function performedRetained() {
  const f = fixture();
  f.observe(event('memory-awake')); f.observe(event('live-start', { id: 'solo' })); f.controller.tick(10);
  assert.equal(f.controller.snapshot().active.study, 'retained');
  return f;
}

test('a witnessed memory starts one Quorum and repeated traces or begin calls cannot restart it', () => {
  const f = fixture();
  assert.equal(f.shows().length, 0);
  f.observe(event('memory-awake')); f.observe(event('memory-awake')); f.observe(event('reference-start'));
  f.controller.tick(2); f.controller.begin(f.owner);
  assert.deepEqual(f.shows().map(command => command.study), ['quorum']);
  assert.equal(f.controller.snapshot().active.elapsed, 2);
  const resumed = fixture('tear:resumed', { elapsed: 150, referenceStarted: true });
  assert.equal(resumed.controller.snapshot().hostElapsed, 150);
  assert.equal(resumed.controller.snapshot().active.elapsed, 0, 'host history cannot skip an unseen presentation');
});

test('Retained Take is staged while a real performed action is still live, before its release', () => {
  const f = fixture();
  f.observe(event('memory-awake')); f.observe(event('live-start', { id: 'ensemble' }));
  f.controller.tick(9.9); assert.equal(f.controller.snapshot().active.study, 'quorum');
  f.controller.tick(.1);
  assert.deepEqual(f.shows().map(command => command.study), ['quorum', 'retained']);
  assert.equal(f.events().length, 0, 'waiting ten seconds never manufactures a stop');
  assert.equal(f.controller.snapshot().live, true);
  assert.equal(f.ends()[0].key, f.shows()[0].key);
  assert.ok(f.shows()[1].key > f.shows()[0].key);
  f.observe(event('live-stop', { id: 'ensemble', reason: 'release' }));
  assert.equal(f.events()[0].event, STUDY_EVENTS.RETAINED_RELEASE);
  assert.equal(f.events()[0].key, f.shows()[1].key);
});

test('a pose cannot invent a live-start or retrospectively stage the study after release', () => {
  const f = fixture(); f.observe(event('memory-awake')); f.controller.tick(10);
  f.observe({ type: 'pose', phase: 'reference', memories: [{ live: true }] });
  assert.equal(f.shows().length, 1);
  f.observe(event('live-stop', { reason: 'release' })); assert.equal(f.events().length, 0);
  f.observe(event('live-start', { id: 'solo' })); assert.equal(f.shows()[1].study, 'retained');
  f.observe(event('live-stop', { id: 'another-memory', reason: 'release' })); assert.equal(f.events().length, 0);
  f.observe(event('live-stop', { id: 'solo', reason: 'release' })); assert.equal(f.events().length, 1);
});

test('pause, hidden, withdrawal and witness stops never become the performed-action release', () => {
  for (const reason of ['pause', 'hidden', 'withdraw', 'witness', 'failure', 'presentation-held']) {
    const f = performedRetained();
    f.observe(event('live-stop', { id: 'solo', reason }));
    f.controller.tick(50);
    assert.equal(f.events().length, 0, reason);
    assert.equal(f.controller.snapshot().active.study, 'retained');
    f.observe({ type: 'pose', phase: 'reference', memories: [{ live: true }] });
    f.observe(event('live-stop', { id: 'solo', reason: 'release' }));
    assert.equal(f.events().length, 0, 'a fresh witnessed live-start is required after interruption');
    f.observe(event('live-start', { id: 'solo' }));
    f.observe(event('live-stop', { id: 'solo', reason: 'release' }));
    assert.equal(f.events().length, 1);
  }
});

test('all authored timing freezes with application hold and resumes without clock catch-up', () => {
  const f = performedRetained();
  f.observe(event('live-stop', { id: 'solo', reason: 'release' }));
  f.controller.tick(3);
  const before = f.controller.snapshot().clock;
  f.controller.tick(100, { paused: true }); f.controller.tick(100, { hidden: true });
  assert.equal(f.controller.snapshot().clock, before); assert.equal(f.events().length, 1);
  f.controller.tick(.5); assert.equal(f.events()[1].event, STUDY_EVENTS.RETAINED_OCCUPY);
  f.controller.tick(3.49); assert.equal(f.controller.snapshot().active.study, 'retained');
  f.controller.tick(.01); assert.equal(f.controller.snapshot().active, null);
  f.controller.tick(100); assert.equal(f.events().length, 2); assert.equal(f.ends().length, 2);
});

test('Quorum retires after eighteen active seconds without converting hesitation into release', () => {
  const f = fixture(); f.observe(event('memory-awake'));
  f.controller.tick(17.99); assert.equal(f.controller.snapshot().active.study, 'quorum');
  f.controller.tick(.01); assert.equal(f.controller.snapshot().active, null); assert.equal(f.events().length, 0);
  f.observe(event('live-start', { id: 'later-solo' }));
  assert.equal(f.controller.snapshot().active.study, 'retained', 'a later real performance can still establish the stopped/live comparison');
  f.observe(event('live-stop', { id: 'later-solo', reason: 'release' })); assert.equal(f.events().length, 1);
});

test('Room Between follows witnessed recognition and yields immediately at the Catch threshold', () => {
  const f = fixture('continuation:1');
  f.observe(pose({ phase: 'wrong-return', threat: { refuge: false } })); assert.equal(f.shows().length, 0);
  f.observe(event('return-recognized', {}, { phase: 'wrong-return' }));
  assert.equal(f.shows()[0].study, 'room');
  f.observe(event('return-recognized')); assert.equal(f.shows().length, 1);
  f.observe(event('phase', { phase: 'catch' })); assert.equal(f.controller.snapshot().active, null);
  f.observe(event('phase', { phase: 'wrong-return' })); f.observe(event('return-recognized'));
  assert.equal(f.shows().length, 1, 'reverse crossings never repeat the same passive presentation');
  const timed = fixture('continuation:timed'); timed.observe(event('return-recognized'));
  timed.controller.tick(16); assert.equal(timed.controller.snapshot().active, null);
});

test('Weight Passes waits for counterweight evidence and a fresh safe refuge pose', () => {
  const f = fixture('continuation:1');
  f.observe(pose()); assert.equal(f.shows().length, 0, 'refuge alone is not the event');
  f.observe(event('counterweight-release', {}, { phase: 'catch' })); assert.equal(f.shows().length, 0);
  for (const unsafe of [pose({ threat: { refuge: false } }), pose({ recovery: {} }), pose({ reveal: {} }),
    pose({ fall: {} }), pose({ phase: 'wrong-return', fall: null })]) f.observe(unsafe);
  assert.equal(f.shows().length, 0);
  f.observe(pose({ fall: null })); assert.equal(f.shows()[0].study, 'weight');
  assert.equal(f.controller.snapshot().weightPending, false);
  f.controller.tick(15.99); assert.equal(f.controller.snapshot().active.study, 'weight');
  f.controller.tick(.01); assert.equal(f.controller.snapshot().active, null);
});

test('counterweight recovery can seed the passive observation but not display it during the recovery', () => {
  const f = fixture('continuation:recovered');
  f.observe(event('capture', { reason: 'counterweight' }, { phase: 'catch' }));
  f.observe(pose({ recovery: {} })); assert.equal(f.shows().length, 0);
  f.observe(event('recovered', { reason: 'counterweight' })); assert.equal(f.shows().length, 0);
  f.observe(pose()); assert.equal(f.shows()[0].study, 'weight');
  const other = fixture('continuation:other'); other.observe(event('recovered', { reason: 'wrong-turn' })); other.observe(pose());
  assert.equal(other.shows().length, 0);
});

test('Weight retires at the first observed danger and never restarts after leaving its refuge', () => {
  for (const boundary of [pose({ threat: { refuge: false } }), pose({ reveal: {} }), pose({ recovery: {} }),
    event('drop'), { type: 'control-boundary', reason: 'capture', phase: 'catch' }]) {
    const f = fixture('continuation:safety'); f.observe(event('counterweight-release')); f.observe(pose());
    const key = f.shows()[0].key;
    f.observe(boundary); assert.equal(f.controller.snapshot().active, null);
    assert.equal(f.ends()[0].key, key);
    f.observe(event('land')); f.observe(event('recovered', { reason: 'counterweight' })); f.observe(pose({ fall: null }));
    assert.equal(f.shows().length, 1, 'safety interruption cannot become repeated window spam');
  }
});

test('an actual drop keeps the pose unsafe until landing even if old refuge telemetry remains true', () => {
  const f = fixture('continuation:fall'); f.observe(event('counterweight-release'));
  f.observe(event('drop', {}, { phase: 'catch' })); f.observe(pose());
  assert.equal(f.shows().length, 0);
  f.observe(event('land')); f.observe(pose()); assert.equal(f.shows()[0].study, 'weight');
});

test('owner preemption, ending and stale traces use monotonic presentation keys and deterministic cleanup', () => {
  const f = fixture('tear:old', { referenceStarted: true });
  const oldKey = f.shows()[0].key;
  f.controller.begin('tear:new', { referenceStarted: true });
  assert.equal(f.ends()[0].owner, 'tear:old'); assert.equal(f.ends()[0].key, oldKey);
  assert.ok(f.shows()[1].key > oldKey);
  assert.equal(f.controller.observe('tear:old', event('live-start')), false);
  assert.equal(f.controller.end('tear:old'), false);
  f.controller.observe('tear:new', { type: 'pose', phase: 'ending' });
  assert.equal(f.controller.snapshot().owner, null);
  assert.equal(f.ends().length, 2);
  assert.equal(f.controller.observe('tear:new', event('memory-awake')), false);
  for (const trace of [{ type: 'restore-start' }, { type: 'handoff-begin' }, event('complete'), event('return')]) {
    f.controller.begin('next', { referenceStarted: true }); f.controller.observe('next', trace);
    assert.equal(f.controller.snapshot().owner, null);
  }
});

test('each owner has at most four one-shot shows and observed objects remain unchanged', () => {
  const f = performedRetained();
  f.observe(event('live-stop', { id: 'solo', reason: 'release' })); f.controller.tick(7);
  f.observe(event('return-recognized', {}, { phase: 'wrong-return' }));
  f.observe(event('counterweight-release')); f.observe(pose());
  const input = Object.freeze({ type: 'pose', phase: 'catch', threat: Object.freeze({ refuge: false }), recovery: null, reveal: null });
  f.observe(input);
  for (let index = 0; index < 20; index++) {
    f.observe(event('memory-awake')); f.observe(event('live-start')); f.observe(event('return-recognized'));
    f.observe(event('counterweight-release')); f.observe(pose()); f.controller.tick(20);
  }
  assert.deepEqual(f.shows().map(command => command.study), ['quorum', 'retained', 'room', 'weight']);
  assert.equal(f.controller.snapshot().showCount, 4);
  const broken = createWindowMediaEncounters({ onCommand() { throw Error('presentation unavailable'); } });
  broken.begin('passive'); assert.equal(broken.observe('passive', event('memory-awake')), true);
  assert.equal(broken.snapshot().active.study, 'quorum', 'passive delivery failure never takes scene control');
});
