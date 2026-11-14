import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  caughtActorFrame,
  caughtHandFrame,
  createElleryCaughtPresentation,
  ELLERY_CAUGHT_TIMING,
  elleryCaughtFrame,
} from '../src/game/ellery-caught-presentation.js';
import { createElleryCaughtAudio, prewarmElleryCaughtAudio } from '../src/audio/ellery-caught-audio.js';

test('slow updates still show the impact and full black before checkpoint restoration', () => {
  const moments = [];
  const scene = createElleryCaughtPresentation({
    externalClock: true,
    draw: frame => moments.push(frame.phase),
    onImpact: () => moments.push('hit'),
    onBlack: () => { moments.push('restore'); return true; },
    onRestored: () => moments.push('control'),
  });
  scene.enter();
  scene.update(1);
  assert.deepEqual(moments, []);
  scene.advance(1);
  scene.render();
  scene.advance(1);
  assert.deepEqual(moments, ['hit', 'impact']);
  scene.render();
  scene.advance(1);
  assert.equal(scene.frame().darkness, 1);
  scene.render();
  scene.advance(1);
  scene.advance(1);
  assert.deepEqual(moments, ['hit', 'impact', 'black', 'restore', 'reveal', 'control']);
  assert.equal(scene.frame().darkness, 0);
  assert.equal(scene.frame().ambientGain, 1);
});

test('an interrupted or rejected restore retains one impact and one final handoff', async () => {
  let foreground = true, pending, impact = 0, attempts = 0, restored = 0, suspensions = 0;
  const scene = createElleryCaughtPresentation({
    active: () => foreground,
    onImpact: () => impact++,
    onSuspend: () => suspensions++,
    onBlack: () => {
      attempts++;
      return attempts === 1
        ? new Promise((_resolve, reject) => { pending = reject; })
        : true;
    },
    onRestored: () => restored++,
  });
  scene.update(1);
  scene.update(1);
  scene.render();
  scene.update(1);
  foreground = false;
  pending(new Error('first write failed'));
  await new Promise(resolve => setImmediate(resolve));
  scene.update(1);
  scene.update(1);
  assert.deepEqual([impact, attempts, restored, suspensions], [1, 1, 0, 1]);
  foreground = true;
  scene.update(.10);
  assert.equal(attempts, 1);
  scene.update(.2);
  scene.update(1);
  assert.deepEqual([impact, attempts, restored], [1, 2, 1]);
});

test('an opaque external draw starts the rewind without waiting for a second foreground frame', async () => {
  let attempts=0;
  const scene=createElleryCaughtPresentation({
    externalClock:true,
    onBlack:()=>{attempts++;return true;},
  });
  scene.enter();scene.advance(1);scene.advance(1);scene.render();
  assert.equal(attempts,0);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(attempts,1);
  assert.equal(scene.worldPresentation,'hidden');
  scene.advance(.15);
  assert.equal(scene.worldPresentation,'visible');
});

test('only the staged apparition can move, and reduced motion or a blocked line keeps its anchor', () => {
  const age = ELLERY_CAUGHT_TIMING.impactAt;
  const full = elleryCaughtFrame(age, { kind: 'apparition' });
  const reduced = elleryCaughtFrame(age, { kind: 'apparition', reducedMotion: true, reducedFlash: true });
  const held = { id: 'actual-staged-apparition', x: 3, y: 4, floorH: -4, strength: .3 };
  const target = { x: 4, y: 4 };
  assert.equal(caughtActorFrame(held, full, { target }).x, 3);
  const approach = elleryCaughtFrame(age - .025, { kind: 'apparition' });
  const advance = caughtActorFrame(held, approach, { target, allowReach: true });
  assert.equal(advance.id, held.id);
  assert.equal(advance.floorH, held.floorH);
  assert.ok(advance.x > held.x && advance.x < target.x);
  assert.equal(caughtActorFrame(held, full, { target, allowReach: true }).x, target.x);
  assert.equal(caughtActorFrame(held, reduced, { target, allowReach: true }).x, 3);
  assert.ok(reduced.printClose < full.printClose);
  assert.ok(reduced.printLight < full.printLight);
});

test('the catch exposes the actual room only around impact and softens the fallback when reduced', () => {
  const { impactAt, blackAt } = ELLERY_CAUGHT_TIMING;
  assert.equal(elleryCaughtFrame(0).printLight, 0);
  const fallback = elleryCaughtFrame(impactAt, { bearing: -.5 });
  assert.ok(fallback.side < 0 && fallback.printClose > .9);
  assert.ok(fallback.printLight > .8);
  const actor = elleryCaughtFrame(impactAt, { sourceVisible: true });
  assert.equal(actor.printClose, 0, 'do not occlude a real staged actor with the fallback closure');
  assert.ok(actor.printLight > .8, 'the actor can use the lit room as a readable backing');
  for (const frame of [elleryCaughtFrame(blackAt), elleryCaughtFrame(blackAt, { restoredAge: .2 })]) {
    assert.equal(frame.printLight, 0);
    assert.equal(frame.printClose, 0);
  }
});

test('the same staged hand rig finishes the grip, then releases to the restored view', () => {
  const held = { active: true, takeId: 12, performanceProgress: .45, proximity: .3, presence: .6,
    hands: [{ side: 'left', seat: .25, brace: .14, traction: .05 }], viewPull: { active: true } };
  const entering = caughtHandFrame(held, elleryCaughtFrame(0, { kind: 'hands' }));
  assert.equal(entering.performanceProgress, held.performanceProgress);
  const reached = caughtHandFrame(held, elleryCaughtFrame(.17, { kind: 'hands' }));
  assert.equal(reached.takeId, held.takeId);
  assert.equal(reached.hands[0].seat, 1);
  assert.equal(reached.viewPull.active, false);
  assert.equal(held.hands[0].seat, .25);
  assert.equal(caughtHandFrame(held, elleryCaughtFrame(.4, { kind: 'hands' })), null);
});

test('silent and unavailable audio cannot schedule a later scare; a warmed voice can be stopped', async () => {
  const played = [];
  const parameter = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelAndHoldAtTime() {} });
  const node = props => ({ connect() {}, disconnect() {}, ...props });
  const context = {
    state: 'running', currentTime: 3,
    decodeAudioData: async () => ({ duration: 2 }),
    createBufferSource: () => node({ playbackRate: parameter(),
      start(...args) { played.push(['start', ...args]); },
      stop(...args) { played.push(['stop', ...args]); this.onended?.(); },
    }),
    createBiquadFilter: () => node({ frequency: parameter(), Q: parameter() }),
    createGain: () => node({ gain: parameter() }),
    createStereoPanner: () => node({ pan: parameter() }),
  };
  const destination = node();
  const prepared = prewarmElleryCaughtAudio(context, async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  assert.equal(createElleryCaughtAudio({ context, destination }), null);
  assert.equal(await prepared, true);
  assert.equal(createElleryCaughtAudio({ context, destination, muted: true }), null);
  assert.deepEqual(played, []);
  const voice = createElleryCaughtAudio({ context, destination, kind: 'hands', bearing: Math.PI / 2 });
  assert.equal(played.length, 1);
  assert.equal(played[0][2], .285);
  voice.stop();
  voice.stop();
  assert.deepEqual(played.map(row => row[0]), ['start', 'stop']);
  assert.equal(voice.ended, true);
});
