import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import * as L from '../src/game/cassette-ledger.js';
import { checkoffPlan, checkoffPenAt, makeWorkOrderCheckoffScene, CHECKOFF_TIMING } from '../src/game/work-order-checkoff.js';
import { workOrderInkLayout } from '../src/game/work-order-ink.js';
import { createWorkOrderInkSurface } from '../src/render/work-order-ink-canvas.js';
import { workOrderWritingRotation } from '../src/render/work-order-rig.js';

const before = L.recordLevelCheck(L.signWorkOrder(L.createCassetteLedger('contract'), { time: '21:42' }));
const take = (outcome, roomId = 'main_b3') => L.recordOnCassette(before, 1, { roomId, outcome, cause: 'BREATH', atSec: 41 }).ledger;
const writeAt = CHECKOFF_TIMING.wait + CHECKOFF_TIMING.raise + CHECKOFF_TIMING.settle;
function fixture(outcome = 'clean', extra = {}) {
  const ledger = take(outcome);
  const plan = checkoffPlan(ledger.marks, before.order, { roomId: 'main_b3', outcome });
  const drawn = [], closed = [], seen = [], sounds = [];
  const foley = Object.fromEntries(['lift', 'stroke', 'stopStroke', 'lower', 'stop'].map(key => [key, data => sounds.push([key, data])]));
  const scene = makeWorkOrderCheckoffScene({ plan, drawSheet: frame => drawn.push(frame), onSeen: order => seen.push(order),
    onClose: () => closed.push(true), foley, ...extra });
  return { scene, plan, ledger, drawn, closed, seen, sounds };
}
function run(scene, seconds) {
  for (let remaining = seconds; remaining > .000001; remaining -= .01) scene.advance(Math.min(.01, remaining));
}

test('the writing palm faces the paper through the whole stroke and withdrawal', () => {
  for (const outcome of ['clean', 'rejected', 'spoilt']) {
    const { plan } = fixture(outcome);
    for (let time = -.35; time < plan.writing + CHECKOFF_TIMING.penRelease; time += .01) {
      const { nib } = checkoffPenAt(plan, time);
      if (!nib) continue;
      const orientation = workOrderWritingRotation(nib.x);
      const palm = new Vector3(0, 0, 1).applyQuaternion(orientation);
      assert.ok(palm.z < -.8, 'the back of the right hand stays toward the eye');
      const alongFingers = new Vector3(0, 1, 0).applyQuaternion(orientation);
      assert.ok(alongFingers.x < -.45, 'the fingers lead inward from the right wrist');
    }
  }
});

test('the current clean tick and strike lead, and the finished view preserves every real mark', () => {
  const { plan, ledger } = fixture();
  assert.deepEqual(plan.steps.map(step => step.stroke.width), [.42, .36]);
  assert.deepEqual(plan.after, workOrderInkLayout(ledger.marks).flatMap(mark => mark.strokes));
  assert.ok(plan.writing < .7);
  assert.ok(plan.steps[0].end >= .18, 'the short tick gets its own readable beat before the strike');
  assert.equal(checkoffPlan(ledger.marks, ledger.order), null);
  const middle = checkoffPenAt(plan, plan.steps[0].end / 2);
  assert.deepEqual([middle.nib.x, middle.nib.y], middle.strokes.at(-1).points.at(-1));
  assert.equal(middle.nib.height, 0);
  const transfer = checkoffPenAt(plan, (plan.steps[0].end + plan.steps[1].start) / 2);
  assert.ok(transfer.nib.height > 0);
  assert.deepEqual(transfer.strokes, [plan.steps[0].stroke]);
});

test('the pen approaches from below the row, lifts before translating and clears the read hold', () => {
  const { scene, plan, drawn } = fixture();
  const { penApproach, penRelease, cleanHold } = CHECKOFF_TIMING;
  assert.equal(checkoffPenAt(plan, -penApproach - .01).nib, null);
  const approaching = checkoffPenAt(plan, -penApproach).nib;
  assert.ok(approaching.x > plan.initial[0] && approaching.y > plan.initial[1]);
  assert.ok(approaching.height > 0);
  const raised = checkoffPenAt(plan, plan.writing + penRelease * .05).nib;
  assert.deepEqual([raised.x, raised.y], plan.final);
  assert.ok(raised.height > 0, 'the pen breaks contact before moving over the completed line');
  const withdrawing = checkoffPenAt(plan, plan.writing + penRelease * .5).nib;
  assert.ok(withdrawing.x > raised.x && withdrawing.y > raised.y);
  run(scene, writeAt + plan.writing + penRelease + .02);
  scene.render();
  assert.equal(drawn.at(-1).nib, null);
  assert.deepEqual(drawn.at(-1).strokes.map(stroke => stroke.points), plan.after.map(stroke => stroke.points));
  assert.ok(cleanHold - penRelease > .7);
});

test('rejection holds the right row and rehearses only the finishing word', () => {
  const { scene, plan, ledger, drawn } = fixture('rejected');
  const note = workOrderInkLayout(ledger.marks).findLast(mark => mark.kind === 'note');
  assert.deepEqual(plan.steps.map(step => step.stroke), note.strokes.slice(-plan.steps.length));
  assert.ok(plan.before.length > plan.steps.length);
  assert.ok(plan.steps.every(step => step.end > step.start));
  assert.deepEqual(plan.after, workOrderInkLayout(ledger.marks).flatMap(mark => mark.strokes));
  run(scene, writeAt + plan.steps[0].end / 2);
  scene.render();
  assert.deepEqual(drawn.at(-1).strokes.slice(0, plan.before.length), plan.before);
  assert.ok(drawn.at(-1).strokes.at(-1).width > plan.steps[0].stroke.width);
  run(scene, plan.writing);
  scene.render();
  for (const [index, stroke] of drawn.at(-1).strokes.entries()) {
    assert.equal(stroke.points, plan.after[index].points);
    assert.equal(stroke.width > plan.after[index].width, plan.steps.some(step => step.stroke === plan.after[index]));
  }
});

test('a higher-priority owner delays the presentation while the sheet itself leaves the room and look live', () => {
  let ready = false;
  const { scene, sounds } = fixture('clean', { ready: () => ready });
  run(scene, 2);
  assert.equal(scene.view().phase, 'waiting');
  assert.equal(scene.handlesEscape, false);
  assert.deepEqual(sounds, []);
  ready = true;
  run(scene, writeAt + .04);
  assert.equal(scene.view().phase, 'writing');
  assert.equal(scene.blocksWorld, false);
  assert.equal(scene.blocksInput, false);
  assert.equal(scene.allowsLook, true);
  assert.deepEqual(sounds.map(([name]) => name), ['lift', 'stroke']);
});

test('movement dismisses in the same input event and a lower finishes without losing the filed ink', () => {
  const { scene, plan, ledger, closed, seen, drawn, sounds } = fixture();
  run(scene, writeAt + .04);
  assert.equal(scene.key({ key: 'w', code: 'KeyW' }), false);
  assert.equal(scene.view().phase, 'lowering');
  assert.equal(scene.blocksInput, false);
  assert.deepEqual(seen, [ledger.order]);
  scene.render();
  const before = drawn.at(-1);
  run(scene, .12);
  scene.render();
  const during = drawn.at(-1);
  assert.ok(during.nib.height > before.nib.height);
  assert.deepEqual(during.strokes, before.strokes);
  run(scene, CHECKOFF_TIMING.lower);
  assert.deepEqual(closed, [true]);
  assert.deepEqual(plan.after, workOrderInkLayout(ledger.marks).flatMap(mark => mark.strokes));
  assert.equal(sounds.filter(([name]) => name === 'lower').length, 1);
});

test('pending escape, reduced motion and a competing capture each release cleanly', () => {
  const pending = fixture();
  assert.equal(pending.scene.key({ key: 'Escape' }), true);
  assert.deepEqual(pending.closed, [true]);
  assert.ok(!pending.sounds.some(([name]) => name === 'lift'));
  const reduced = fixture('rejected', { reducedMotion: true });
  run(reduced.scene, .24);
  reduced.scene.render();
  assert.equal(reduced.drawn.at(-1).nib, null);
  assert.deepEqual(reduced.drawn.at(-1).strokes.map(stroke => stroke.points), reduced.plan.after.map(stroke => stroke.points));
  assert.ok(!reduced.sounds.some(([name]) => name === 'stroke'));
  let interrupted = false;
  const competing = fixture('clean', { interrupted: () => interrupted });
  run(competing.scene, writeAt + .03);
  assert.ok(competing.scene.presentationLift > .99);
  interrupted = true;
  assert.equal(competing.scene.presentationLift, 0, 'HUSH gets the room and the lamp on the contact frame');
  competing.scene.render();
  run(competing.scene, .05);
  assert.deepEqual(competing.closed, [true]);
  assert.deepEqual(competing.drawn, []);
  assert.deepEqual(competing.seen, [], 'a capture can already have restored an older run snapshot');
  assert.ok(!competing.sounds.some(([name]) => name === 'lower'), 'contact does not play a voluntary paper put-down');
});

test('the shared ink canvas distinguishes rewound branches with the same sequential mark IDs', () => {
  const coords = [];
  const ctx = { clearRect() {}, beginPath() {}, moveTo: (...xy) => coords.push(xy), lineTo() {}, stroke() {} };
  const ink = createWorkOrderInkSurface({ createCanvas: () => ({ getContext: () => ctx }) });
  const b3 = take('clean'), pool = take('clean', 'the_tub');
  assert.deepEqual(b3.marks.map(mark => mark.id), pool.marks.map(mark => mark.id));
  const first = ink.draw(b3.marks).version, oldY = coords.at(-1)[1];
  assert.equal(ink.draw(b3.marks).version, first);
  assert.equal(ink.draw(pool.marks).version, first + 1);
  assert.notEqual(coords.at(-1)[1], oldY);
});
