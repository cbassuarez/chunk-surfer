import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { BUST_RELIQUARY_RIG } from '../src/data/bust-reliquary-rig.js';
import { HORIZON_BUST_AUDIENCE } from '../src/game/horizon-bust.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET } from '../src/game/chunk-surf-god.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const copy = value => JSON.parse(JSON.stringify(value));
function onTape(marbleEyes, onState = () => {}) {
  const built = buildChunkSurfGodPreset(CHUNK_SURF_GOD_PRESET.NORMAL_EXIT, { seed: 4417 });
  const runtime = createSourceSpaceRuntime({
    initialState: { ...built.state, profile: { ...built.state.profile, marbleEyes } },
    onState,
  });
  runtime.setPlayerPosition(built.position);
  runtime.completeNormalExit();
  const bust = runtime.horizonBustPoint();
  runtime.setPlayerPosition({ x: bust.x, y: bust.y + 12, facing: 0 });
  return runtime;
}
function hearAudience(runtime, mode) {
  for (let i = 0; i < HORIZON_BUST_AUDIENCE[mode].length; i++) {
    const result = runtime.talkToHorizonBust();
    assert.equal(result.eligible, true);
    assert.equal(result.offers, i === HORIZON_BUST_AUDIENCE[mode].length - 1);
  }
}
function approachSeal(runtime) {
  const seal = runtime.horizonBustSealPoint();
  const position = { x: seal.x, y: seal.y + 1.4, facing: 0 };
  runtime.setPlayerPosition(position);
  assert.equal(runtime.horizonBustAtSeal(), true, 'the real reachable seal accepts a standing audience position');
  assert.equal(runtime.geometry.canStep(position.x, position.y + 1, position.x, position.y).ok, true, 'the pedestal collision leaves room to reach the seal');
  return position;
}

for (const mode of ['returned', 'carried']) {
  const writes = [];
  const runtime = onTape(mode, (state, options) => writes.push({ state: copy(state), options }));
  const beforeAudience = runtime.horizonFrame();
  assert.equal(runtime.horizonBustPlacement().performance.clip, 'blind');
  assert.equal(runtime.prepareHorizonBustSeal(), false, 'a player cannot prepare initiation before hearing the portrait');
  const first = runtime.talkToHorizonBust();
  assert.equal(first.beat, 1);
  assert.equal(first.evidence.mode, mode);
  assert.equal(runtime.state().profile.marbleEyes, mode);
  assert.equal(runtime.state().finale.route, null);
  assert.equal(runtime.horizonBustPlacement().performance.clip, `recognition-${mode}`);
  assert.equal(runtime.horizonBustPlacement().performance.time, 0);
  assert.ok(writes.some(write => write.options?.immediate && write.state.finale.bust.performance.recognition.received), 'first recognition is saved at its event boundary');
  const initialFrame = runtime.tickHorizonBust(.8);
  assert.equal(initialFrame.time, .8);
  const contacts = runtime.takeHorizonBustCues();
  assert.ok(contacts.length > 0, 'actual runtime exposes the authored recognition contacts');
  assert.equal(runtime.takeHorizonBustCues().length, 0, 'the main loop drains each contact exactly once');
  const pausedState = copy(runtime.state().finale.bust.performance);
  runtime.tickHorizonBust(60, { paused: true });
  assert.deepEqual(runtime.state().finale.bust.performance, pausedState);
  runtime.tickHorizonBust(60, { hidden: true });
  assert.deepEqual(runtime.state().finale.bust.performance, pausedState);
  assert.deepEqual(runtime.takeHorizonBustCues(), []);
  const saved = copy(runtime.state());
  const restored = createSourceSpaceRuntime({ initialState: saved });
  const bust = restored.horizonBustPoint();
  restored.setPlayerPosition({ x: bust.x, y: bust.y + 12, facing: 0 });
  assert.equal(restored.horizonBustPlacement().performance.time, 10, 'mid-recognition reload settles the already received performance');
  restored.tickHorizonBust(1);
  assert.deepEqual(restored.takeHorizonBustCues(), [], 'restoration does not repeat shutter or bearing effects');
  assert.equal(restored.state().profile.marbleEyes, mode, 'recognition never transfers the evidence objects');

  // The remaining authored audience can finish while the mechanism performs.
  for (let i = 1; i < HORIZON_BUST_AUDIENCE[mode].length; i++) runtime.talkToHorizonBust();
  assert.equal(runtime.state().finale.route, null, 'questions and a full audience still cannot substitute for consent');
  runtime.tickHorizonBust(10);
  runtime.takeHorizonBustCues();
  assert.equal(runtime.prepareHorizonBustSeal(), true);
  assert.equal(runtime.state().finale.bust.sealReady, true);
  const position = approachSeal(runtime);
  const focus = runtime.focusAt(position.x, position.y, position.facing);
  assert.equal(focus?.kind, 'horizon-bust-seal', 'the reachable seal wins focus over the monument behind it');
  assert.equal(runtime.inspectFocused(position.x, position.y, position.facing).event, 'horizon-bust-seal');
  assert.equal(runtime.state().finale.route, null, 'focusing and considering the seal are not acceptance');
  assert.equal(runtime.horizonBustSealPoint().elevation, BUST_RELIQUARY_RIG.sealCenter[1]);
  assert.equal(runtime.horizonBustSealPoint().elevation, 1.25, 'the interaction and production rig share a reachable seal height');

  const beforeConsent = runtime.horizonFrame();
  const result = runtime.decideHorizonBust(true);
  assert.equal(result.accepted, true);
  assert.equal(runtime.state().finale.route, 'tower');
  assert.equal(runtime.state().profile.marbleEyes, mode, 'initiation preserves carried/returned ownership');
  const consentFrame = runtime.horizonFrame();
  assert.equal(consentFrame.towerPath.length, 4, 'the visible road is supplied on the consent frame');
  assert.equal(runtime.horizonBustPlacement().performance.routeOpen, true);
  assert.equal(runtime.horizonBustPlacement().performance.time, 0, 'route availability does not wait for the ritual');
  assert.equal(runtime.horizonBustPlacement().performance.blocksMovement, false);
  assert.equal(consentFrame.lateral, beforeConsent.lateral);
  assert.equal(consentFrame.depth, beforeConsent.depth, 'consent never relocates the player');
  const path = runtime.takeHorizonBustDetour().path;
  const origin = runtime.state().landscapeOrigin;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let step = 0; step < steps; step++) {
      const t = step / steps, u = (step + 1) / steps;
      const from = { x: origin.x + a.x + (b.x - a.x) * t, y: origin.y + a.y + (b.y - a.y) * t };
      const to = { x: origin.x + a.x + (b.x - a.x) * u, y: origin.y + a.y + (b.y - a.y) * u };
      assert.equal(runtime.geometry.canStep(from.x, from.y, to.x, to.y).ok, true, 'every road segment has physical footing while ritual time remains zero');
    }
  }
  assert.equal(runtime.chooseHorizonExit('chapel').handled, false, 'the disclosed irreversible outcome applies immediately');
  runtime.tickHorizonBust(1.25);
  const ritualContacts = runtime.takeHorizonBustCues();
  assert.ok(ritualContacts.some(cue => cue.id === 'seal-contact'));
  assert.ok(ritualContacts.every(cue => cue.phase === 'ritual'));
  const interrupted = copy(runtime.state());
  const resumed = createSourceSpaceRuntime({ initialState: interrupted });
  resumed.setPlayerPosition(position);
  assert.equal(resumed.horizonBustPlacement().performance.clip, 'settled');
  assert.equal(resumed.horizonFrame().towerPath.length, 4);
  resumed.tickHorizonBust(30);
  assert.deepEqual(resumed.takeHorizonBustCues(), [], 'a committed interrupted ritual restores its final pose without effects');
  const priorReceipt = copy(resumed.state().finale.bust.performance.ritual);
  assert.equal(resumed.decideHorizonBust(true).handled, false);
  resumed.inspectFocused(position.x, position.y, position.facing);
  assert.deepEqual(resumed.state().finale.bust.performance.ritual, priorReceipt, 'repeat audiences cannot replay initiation');
  assert.ok(beforeAudience.active);
}

const reduced = onTape('returned');
hearAudience(reduced, 'returned');
const reducedFrame = reduced.tickHorizonBust(.01, { reducedMotion: true });
assert.equal(reducedFrame.phase, 'attentive');
assert.equal(reducedFrame.time, 10);
assert.ok(reduced.takeHorizonBustCues().length <= 1, 'reduced motion uses a clear seated pose without compressed sound bursts');
reduced.prepareHorizonBustSeal();
approachSeal(reduced);
reduced.decideHorizonBust(true);
assert.equal(reduced.horizonFrame().towerPath.length, 4);
assert.equal(reduced.tickHorizonBust(.01, { reducedMotion: true }).clip, 'settled');
assert.ok(reduced.takeHorizonBustCues().length <= 1);

const skip = onTape('carried');
skip.talkToHorizonBust();
skip.tickHorizonBust(.8);
skip.skipHorizonBustPerformance();
assert.equal(skip.horizonBustPlacement().performance.time, 10);
assert.equal(skip.state().finale.route, null);
assert.deepEqual(skip.takeHorizonBustCues(), [], 'skipping only settles presentation and drops its unplayed queue');

for (const mode of [null, 'declined']) {
  const blind = onTape(mode);
  blind.talkToHorizonBust();
  blind.tickHorizonBust(30);
  assert.equal(blind.horizonBustPlacement().performance.clip, 'blind');
  assert.equal(blind.horizonBustPlacement().performance.eyesVisible, false);
  assert.deepEqual(blind.takeHorizonBustCues(), []);
  assert.equal(blind.prepareHorizonBustSeal(), false);
  assert.equal(blind.state().profile.marbleEyes, mode);
}

const declined = onTape('returned');
hearAudience(declined, 'returned');
declined.prepareHorizonBustSeal();
approachSeal(declined);
assert.equal(declined.decideHorizonBust(false).accepted, false);
assert.equal(declined.state().finale.bust.performance.ritual.received, false);
assert.equal(declined.horizonFrame().towerPath.length, 0);
assert.equal(declined.state().profile.marbleEyes, 'returned');
assert.equal(declined.chooseHorizonExit('chapel').handled, true);

assert.equal(CELL, .5, 'the standing/reach checks use actual game units');
console.log('bust reliquary runtime tests ok');
