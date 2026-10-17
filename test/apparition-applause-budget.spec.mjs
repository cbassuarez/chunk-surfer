import assert from 'node:assert/strict';
import test, { after } from 'node:test';

const originalPerformance = globalThis.performance;
const originalDocument = globalThis.document;
let now = 1000;
globalThis.performance = { now: () => now };
globalThis.document ||= { title: 'Chunk Surfer', baseURI: 'http://localhost/' };
const REC = await import('../src/game/recordist.js');
const { getSave } = await import('../src/game/save.js');
const oldReduceDread = getSave().settings.reduceDread;
let serial = 0;

after(() => {
  globalThis.performance = originalPerformance;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
  getSave().settings.reduceDread = oldReduceDread;
  REC.recState().phase = 'idle';
});

async function fresh({ pool = false, onStab = null } = {}) {
  now = 1000;
  getSave().settings.reduceDread = false;
  REC.recState().phase = 'idle';
  const director = await import(`../src/game/stabs.js?applause-budget=${++serial}`);
  director.stabsInit({ onStab });
  if (pool) director.buildStabPool([{ buffer: {}, analysis: { attack: .01, zcr: .3, rms: .2, length: .3 } }]);
  return director;
}

const finishOpeningQuiet = () => { now = 1000 + 4 * 60 * 1000; };

test('external material shares the full opening quiet without requiring the composer pool', async () => {
  const director = await fresh();
  assert.equal(director.poolSize(), 0);
  now = 240999;
  assert.equal(director.externalScareBudgetReady(), false);
  assert.equal(director.reserveExternalScare(), false);
  now += 1;
  assert.equal(director.externalScareBudgetReady(), true);
  assert.equal(director.externalScareBudgetReady(), true, 'eligibility polling does not spend the budget');
  assert.equal(director.reserveExternalScare(), true);
  assert.equal(director.reserveExternalScare(), false, 'reservation rechecks eligibility atomically');
});

test('an external reservation or silent control spends restraint without firing or teaching a stab lesson', async () => {
  const fired = [];
  const director = await fresh({ onStab: (event) => fired.push(event) });
  director.loadStabState({ trueCount: 1, falseCount: 1 });
  director.reportRelief(1);
  const lessons = director.saveStabState();
  finishOpeningQuiet();
  assert.equal(director.reserveExternalScare({ nowMs: now }), true);
  assert.equal(director.expectation(), 0);
  assert.equal(director.stabStats().sinceLastSec, 0);
  assert.deepEqual(director.saveStabState(), lessons);
  assert.deepEqual(fired, []);
  now += 149999;
  assert.equal(director.externalScareBudgetReady(), false);
  now += 1;
  assert.equal(director.externalScareBudgetReady(), true);
});

test('ordinary and external scares deny each other through the same 150-second cooldown', async () => {
  const fired = [];
  const director = await fresh({ pool: true, onStab: (event) => fired.push(event) });
  finishOpeningQuiet();
  assert.equal(director.reserveExternalScare(), true);
  director.reportRelief(1);
  assert.equal(director.updateStabs(0), null, 'the ordinary stab cannot immediately replace a silent control');
  now += 150000;
  assert.equal(director.updateStabs(.01)?.kind, 'true');
  assert.equal(fired.length, 1);
  assert.equal(director.externalScareBudgetReady(), false, 'the ordinary stab spends the external budget too');
  assert.deepEqual(director.saveStabState(), { trueCount: 1, falseCount: 0 });
});

test('external scares share the exact per-room count and entering a room does not erase cooldown', async () => {
  const director = await fresh();
  finishOpeningQuiet();
  assert.equal(director.reserveExternalScare(), true);
  now += 150000;
  assert.equal(director.reserveExternalScare(), true);
  now += 150000;
  assert.equal(director.externalScareBudgetReady(), false, 'two reservations exhaust this room');
  director.enteredRoom();
  assert.equal(director.reserveExternalScare(), true);
  director.enteredRoom();
  assert.equal(director.externalScareBudgetReady(), false, 'room entry cannot clear a just-spent global cooldown');
});

test('all recording phases exclude external scares, while normal stab recording semantics stay intact', async () => {
  const director = await fresh({ pool: true });
  finishOpeningQuiet();
  assert.equal(REC.startListening(), true);
  assert.equal(REC.startRecording(), true);
  for (const takeElapsed of [0, REC.takeDuration() * .4, REC.takeDuration() * .9]) {
    REC.recState().takeElapsed = takeElapsed;
    assert.equal(director.externalScareBudgetReady(), false);
    assert.equal(director.reserveExternalScare(), false);
  }
  REC.recState().takeElapsed = 0;
  REC.stallTake();
  assert.equal(director.externalScareBudgetReady(), false);
  REC.recState().slating = true;
  assert.equal(director.externalScareBudgetReady(), false);
  REC.recState().slating = false;
  REC.recState().stalled = false;
  director.reportRelief(1);
  assert.equal(director.updateStabs(0)?.kind, 'true', 'ordinary core still permits its pre-existing early-take behavior');
  REC.recState().phase = 'idle';

  const late = await fresh({ pool: true });
  finishOpeningQuiet();
  REC.startListening(); REC.startRecording();
  REC.recState().takeElapsed = REC.takeDuration() * .9;
  late.reportRelief(1);
  assert.equal(late.updateStabs(0), null, 'ordinary core still protects the final 15 percent');
  REC.recState().phase = 'idle';
});

test('Reduce Dread and invalid clocks cannot claim or mutate a budget', async () => {
  const director = await fresh();
  finishOpeningQuiet();
  for (const nowMs of [NaN, Infinity, -Infinity]) {
    assert.equal(director.externalScareBudgetReady({ nowMs }), false);
    assert.equal(director.reserveExternalScare({ nowMs }), false);
  }
  getSave().settings.reduceDread = true;
  assert.equal(director.externalScareBudgetReady(), false);
  assert.equal(director.reserveExternalScare(), false);
  getSave().settings.reduceDread = false;
  assert.equal(director.reserveExternalScare(), true, 'denials did not spend a room slot or cooldown');
});

test('away time cannot serve the shared cooldown or the initial trust interval', async () => {
  const director = await fresh();
  finishOpeningQuiet();
  assert.equal(director.reserveExternalScare(), true);
  now += 120000;
  director.settleAfterAway(120000);
  now += 149999;
  assert.equal(director.externalScareBudgetReady(), false);
  now += 1;
  assert.equal(director.externalScareBudgetReady(), true);

  const opening = await fresh();
  now += 180000;
  opening.settleAfterAway(180000);
  finishOpeningQuiet();
  assert.equal(opening.externalScareBudgetReady(), false);
  now += 180000;
  assert.equal(opening.externalScareBudgetReady(), true);
});
