import test from 'node:test';
import assert from 'node:assert/strict';
import { createStandingTearScene } from '../src/game/standing-tear-scene.js';
import { freshStandingTear } from '../src/game/standing-tear.js';
import { STANDING_TEAR_MEMORIES } from '../src/data/standing-tear-pressure.js';
import { createSourceContinuationScene } from '../src/game/source-continuation-scene.js';
import { freshSourceContinuation } from '../src/game/source-continuation.js';
import { continuationRefugeAt } from '../src/data/source-continuation.js';
import { createWindowMediaEncounterPresentation } from '../src/platform/window-media-encounter-presentation.js';
import { STUDY_EVENTS } from '../src/platform/window-media-studies.js';

// Developer checkpoints below skip reaching these places. Ordinary production
// scene input/reducers create every observed event after initialization. The
// renderer, audio device, desktop director and image encoding are substitutes:
// this suite proves live scene wiring, not earned progression or visual quality.
const image = value => `data:image/png;base64,${value}`;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function fixture() {
  const shown = [], ended = [], events = [], held = [], registered = [], released = [], observed = [], pending = [];
  const canvas = { width: 640, height: 360, rendered: 0 }, copies = [];
  let visible = null, nextToken = 0;
  const audio = { event() {}, update() {}, stop() {}, pause() {}, setPaused() {}, destroy() {} };
  const renderer = { initialize: async () => true, ready: () => true,
    render() { canvas.rendered++; return true; }, dispose() {} };
  const director = {
    async beginStudy(plan, { key, isCurrent }) {
      if (!isCurrent()) return null; visible = key; shown.push({ plan, key }); return { native: false };
    },
    async endStudy(key) { if (visible === key) visible = null; ended.push(key); return true; },
    compositionEvent(event) { events.push({ event, key: visible }); }, holdComposition(value) { held.push(value); },
  };
  const documentApi = { createElement() {
    const copy = { width: 0, height: 0, getContext: () => ({ drawImage(source) { copy.fromRendered = source.rendered; } }) };
    copies.push(copy); return copy;
  } };
  const presenter = createWindowMediaEncounterPresentation({ director, documentApi, getCanvas: () => canvas,
    effects: {
      registerSnapshot(data) { const token = `snapshot-scene-${++nextToken}`; registered.push({ token, data }); return token; },
      releaseSnapshots(tokens) { released.push(...tokens); },
    },
    makeRoomFrames(_canvas, { previousCanvas }) {
      assert.ok(previousCanvas && previousCanvas !== canvas, 'Room receives a copied earlier ready frame');
      assert.ok(previousCanvas.fromRendered < canvas.rendered, 'recognition is presented after its baseline render');
      return { snapshotFrames: ['left', 'middle', 'right'].map(image), contradictionFrame: image('altered-middle') };
    },
    makeWeightFrames: () => [
      ['held', 'support-empty', 'receiver-empty'], ['departing', 'support-empty', 'receiver-empty'],
      ['above-empty', 'crossing', 'receiver-empty'], ['above-empty', 'support-empty', 'receiver-empty'],
      ['above-empty', 'support-empty', 'receiver-empty'],
    ].map(row => row.map(image)),
  });
  const onTrace = value => { observed.push(value); pending.push(value); };
  async function present(scene, owner, dt = 0, held = false) {
    scene.render();
    const view = scene.view(), frame = owner === 'standing-tear' ? view.frame : view;
    presenter.update({ owner, frame, traces: pending.splice(0), dt, held });
    await presenter.whenIdle(); return frame;
  }
  async function step(scene, owner, dt = .1, held = false) { scene.update(dt); return present(scene, owner, dt, held); }
  return { presenter, audio, renderer, onTrace, observed, shown, ended, events, held, registered, released, copies, canvas, present, step };
}

test('ordinary Standing Tear movement wakes a real memory, stages Quorum then Retained, and releases only on the real live-stop', async () => {
  const f = fixture(), memory = STANDING_TEAR_MEMORIES[0];
  const checkpoint = freshStandingTear({ runId: 'developer-staged-media-scene' });
  checkpoint.phase = 'work'; checkpoint.elapsed = 3; checkpoint.entryFoldingIssued = true;
  checkpoint.pose = { ...checkpoint.pose, x: memory.source.x, z: memory.source.z, yaw: 0 };
  let yaw = 0;
  const scene = createStandingTearScene({ checkpoint, runId: checkpoint.runId, renderer: f.renderer, audio: f.audio,
    getLook: () => ({ yaw, pitch: 0 }), onTrace: f.onTrace });
  try {
    await scene.initialize(); await f.present(scene, 'standing-tear');
    assert.equal(f.shown.length, 0, 'the staged position alone does not invent a memory-awake action');
    scene.key({ key: 'w', repeat: false });
    // Small ordinary reversals stay within the same memory's pressure field.
    // No teleport, test-only live event, or transport control is introduced.
    for (let frame = 0; frame < 105; frame++) {
      yaw = Math.floor(frame / 10) % 2 ? Math.PI : 0;
      await f.step(scene, 'standing-tear');
    }
    assert.ok(f.observed.some(value => value.type === 'event' && value.event.type === 'memory-awake'));
    assert.ok(f.observed.some(value => value.type === 'event' && value.event.type === 'live-start'));
    assert.deepEqual(f.shown.map(value => value.plan.compositionId), ['study:quorum', 'study:retained']);
    assert.equal(f.presenter.snapshot().model.live, true, 'Retained is already visible while the player still performs');
    assert.equal(f.events.length, 0);
    scene.pause(); await f.present(scene, 'standing-tear', 0, true);
    assert.ok(f.observed.some(value => value.type === 'event' && value.event.type === 'live-stop' && value.event.reason === 'pause'));
    assert.equal(f.events.length, 0, 'the real scene pause envelope does not masquerade as authored release');
    scene.resume(); scene.key({ key: 'w', repeat: false }); await f.step(scene, 'standing-tear');
    scene.keyup({ key: 'w' }); await f.step(scene, 'standing-tear');
    assert.ok(f.observed.some(value => value.type === 'event' && value.event.type === 'live-stop' && value.event.reason === 'release'));
    assert.deepEqual(f.events.map(value => value.event), [STUDY_EVENTS.RETAINED_RELEASE]);
    assert.equal(f.events[0].key, f.shown[1].key);
  } finally { scene.exit(); await f.presenter.stop(); }
});

test('the actual Wrong Return recognition envelope uses an earlier ready render before presenting Room', async () => {
  const f = fixture(), gate = deferred();
  const checkpoint = freshSourceContinuation({ runId: 'developer-staged-upper-return' });
  Object.assign(checkpoint, { status: 'active', x: 6, z: 3.5, feet: 8.4,
    knowledge: ['false-return-porch'], lastSafe: { x: 6, z: 3.5, feet: 8.4 } });
  let ready = false;
  const renderer = { ...f.renderer, initialize: async () => { await gate.promise; ready = true; return true; }, ready: () => ready };
  const scene = createSourceContinuationScene({ checkpoint, renderer, audio: f.audio, onTrace: f.onTrace });
  try {
    const opening = scene.initialize();
    await f.present(scene, 'source-continuation'); assert.equal(f.copies.length, 0, 'the loading view is not an earlier ready world frame');
    gate.resolve(true); await opening;
    await f.present(scene, 'source-continuation'); assert.equal(f.copies.length, 1);
    await f.step(scene, 'source-continuation');
    const recognized = f.observed.find(value => value.type === 'event' && value.event.type === 'return-recognized');
    assert.ok(recognized); assert.equal(recognized.phase, 'wrong-return');
    assert.equal(f.shown[0].plan.compositionId, 'study:room');
    assert.equal(f.registered.length, 4);
  } finally { gate.resolve(true); scene.exit(); await f.presenter.stop(); }
  assert.equal(new Set(f.released).size, f.registered.length, 'the scene handoff releases the whole owned Room package');
});

test('real Catch counterweight and refuge telemetry stage Weight, then ordinary walking retires it on leaving refuge', async () => {
  const f = fixture(), checkpoint = freshSourceContinuation({ runId: 'developer-staged-refuge' });
  Object.assign(checkpoint, { status: 'active', phase: 'catch', level: 0, ...continuationRefugeAt({ phase: 'catch', level: 0 }) });
  checkpoint.lastSafe = { x: checkpoint.x, z: checkpoint.z, feet: checkpoint.feet };
  // This developer checkpoint starts after the machinery's route, on its
  // supported upper surface. The real reducer emits its release on the next
  // tick; this suite does not replay or assert the already-tested pursuit path.
  Object.assign(checkpoint.counterweight, { active: true, mode: 'walking', pathIndex: 32 });
  const scene = createSourceContinuationScene({ checkpoint, renderer: f.renderer, audio: f.audio, onTrace: f.onTrace });
  try {
    await scene.initialize(); await f.present(scene, 'source-continuation');
    await f.step(scene, 'source-continuation');
    assert.ok(f.observed.some(value => value.type === 'event' && value.event.type === 'counterweight-release'));
    const pose = f.observed.find(value => value.type === 'pose');
    assert.equal(pose.phase, 'catch'); assert.equal(pose.threat.refuge, true);
    assert.equal(Object.hasOwn(pose, 'fall'), false, 'this is the actual trace shape; current view supplies authoritative safety');
    assert.equal(f.shown[0].plan.compositionId, 'study:weight');
    assert.equal(f.presenter.snapshot().model.inRefuge, true);
    scene.setLook({ yaw: .92 - Math.PI / 2, pitch: 0 }); scene.key({ key: 'w', repeat: false });
    for (let frame = 0; frame < 6; frame++) await f.step(scene, 'source-continuation');
    assert.ok(f.observed.some(value => value.type === 'pose' && value.threat.refuge === false));
    assert.equal(f.presenter.snapshot().presentation, null, 'precision traversal has no lingering peripheral presentation');
    assert.equal(f.presenter.snapshot().model.active, null);
  } finally { scene.exit(); await f.presenter.stop(); }
  assert.equal(new Set(f.released).size, f.registered.length);
});
