import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createOutskirtsExperience } from '../src/game/outskirts-experience.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildPreTapeGodPreset, PRE_TAPE_GOD_STOPS } from '../src/game/chunk-surf-god.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { CAUSAL_SPINE_IDS, packShadowFrames, unpackShadowFrames, shadowFrameAt, validateCausalTape } from '../src/causal/tape.js';
import { CausalRecorder } from '../src/causal/recorder.js';
import { initGameStorage, loadLatestCausalTape } from '../src/platform/storage/storageService.js';

const capture = (t, elapsed, locomotion = null) => ({ t, x: 1, y: -300, floorH: 15.2, yaw: 0, pitch: 0,
  roomId: 'source_space', renderGroup: 'source-space', spaceId: 'source-space',
  outskirtsCharacters: { version: 1, clock: elapsed + 80, fold: { version: 1, phase: elapsed < 2.55 ? 'force' : 'pain', elapsed, seed: 4417 }, locomotion },
});
const body = (clip, clipTime) => ({ pass: 6, along: 225, across: -5, yaw: 3.13, heading: 3.13, headYaw: .1,
  pitch: .1, speed: 0, gaitTime: .45, walkWeight: 0, clip, clipTime, leftContact: 1, rightContact: 1, floorOffset: .12 });

test('optional character tracks round-trip, interpolate the force window, and tolerate frames without locomotion', () => {
  const source = [capture(0, 1.1), capture(1450, 2.55), capture(3000, 4.1)];
  const packed = JSON.parse(JSON.stringify(packShadowFrames(source)));
  assert.equal(unpackShadowFrames(packed).length, 3);
  const middle = shadowFrameAt({ shadowFrames: packed }, 725);
  assert.equal(middle.outskirtsCharacters.fold.elapsed, 1.825);
  assert.equal(middle.outskirtsCharacters.fold.phase, 'force');
  assert.equal(middle.outskirtsCharacters.locomotion, null);
  assert.equal(shadowFrameAt({ shadowFrames: packed }, 1450).outskirtsCharacters.fold.phase, 'pain');
  assert.equal(shadowFrameAt({ shadowFrames: packed }, 2225).outskirtsCharacters.fold.elapsed, 3.325);
  const legacy = packShadowFrames([{ t: 0, x: 1, y: 2 }, { t: 1000, x: 2, y: 2 }]);
  assert.ok(!Object.hasOwn(shadowFrameAt({ shadowFrames: legacy }, 500), 'outskirtsCharacters'));
  const exit = packShadowFrames([capture(0, 4), { t: 100, x: 2, y: 2, spaceId: 'conservatory' }]);
  assert.ok(!Object.hasOwn(unpackShadowFrames(exit)[1], 'outskirtsCharacters'), 'the character track leaked into another chapter');
});

test('recorded turns take the short angular path and do not interpolate across clip resets', () => {
  const first = capture(0, 4, body('turn', 1.1));
  const second = capture(1000, 5, { ...body('idle', .1), yaw: -3.13, heading: -3.13 });
  const tape = { shadowFrames: packShadowFrames([first, second]) };
  const before = shadowFrameAt(tape, 400).outskirtsCharacters.locomotion;
  const after = shadowFrameAt(tape, 600).outskirtsCharacters.locomotion;
  assert.equal(before.clip, 'turn'); assert.equal(before.clipTime, 1.1);
  assert.equal(after.clip, 'idle'); assert.equal(after.clipTime, .1);
  assert.ok(Math.abs(before.heading) > 3.13 && Math.abs(after.heading) > 3.13, 'the body spun through zero at the angle seam');
});

test('decoded Overprint frames follow the recorded operator while the replay observer changes passes', () => {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const recordedBody = { ...body('walk', 4), pass: 1, along: 41.4, across: -1, heading: .4, yaw: .6, speed: 1.2, walkWeight: 1 };
  built.state.outskirtsExperience = { clock: 80, history: [
    { pass: 0, along: 6, across: -2, yaw: .6, clock: 0, body: { ...recordedBody, pass: 0, along: 6 } },
    { pass: 0, along: 26, across: 0, yaw: .6, clock: 20, body: { ...recordedBody, pass: 0, along: 26, gaitTime: 20 } },
    { pass: 1, along: 40.4, across: 0, yaw: 0, clock: 80, body: recordedBody },
  ] };
  const commits = [], runtime = createSourceSpaceRuntime({ initialState: built.state, onState: v => commits.push(v) });
  runtime.setPlayerPosition(built.position);
  const originAlong = runtime.outskirtsLastLight().along;
  const put = along => {
    const position = { ...built.position, y: built.position.y - (along - originAlong) / CELL };
    runtime.setPlayerPosition(position); return position;
  };
  const decoded = shadowFrameAt({ shadowFrames: packShadowFrames([capture(0, 4, recordedBody), capture(1000, 5, recordedBody)]) }, 500);
  assert.equal(runtime.applyOutskirtsCharacterFrame(decoded.outskirtsCharacters), true);
  const ghosts = along => { const p = put(along); return runtime.propInstances(p.x, p.y, { viewYaw: Math.PI }).filter(v => v.id.startsWith('outskirts-double')); };
  const first = ghosts(41.4), beforeRoadThreshold = ghosts(30), anotherPass = ghosts(110);
  assert.equal(first.length, 3); assert.equal(beforeRoadThreshold.length, 3); assert.equal(anotherPass.length, 3);
  const poses = instances => instances.map(v => ({ matrix: [...v.matrix], character: v.character }));
  assert.deepEqual(poses(anotherPass), poses(first), 'the viewer changed the sampled traversal');
  assert.deepEqual(poses(beforeRoadThreshold), poses(first), 'the viewer consumed the encounter threshold');
  const frozen = runtime.outskirtsCharacterFrame();
  runtime.tickOutskirtsCharacters(.2, { suspended: true, viewYaw: -2 });
  assert.deepEqual(runtime.outskirtsCharacterFrame(), frozen);
  assert.deepEqual(poses(ghosts(110)), poses(first), 'a suspended replay tick stole recorded authority');
  assert.equal(ghosts(500).length, 0, 'far-away recorded characters bypass spatial culling');
  assert.deepEqual(commits, [], 'sampling replay emitted a character checkpoint');
  put(110); runtime.tickOutskirtsCharacters(.1, { suspended: false });
  assert.equal(ghosts(110).length, 0, 'live simulation retained the previous replay operator');
  assert.equal(commits.length, 1, 'returning to live simulation has no pass checkpoint');
});

test('the first pass boundary saves the actual preceding walk before any Fold encounter', () => {
  const built = buildPreTapeGodPreset(0, { seed: 4417, marbleEyes: 'returned' });
  const checkpoints = [], runtime = createSourceSpaceRuntime({ initialState: built.state, onState: (state, meta) => checkpoints.push({ state, meta }) });
  runtime.setPlayerPosition(built.position);
  const originAlong = runtime.outskirtsLastLight().along;
  const put = along => { const p = { ...built.position, y: built.position.y - (along - originAlong) / CELL }; runtime.setPlayerPosition(p); return p; };
  for (let i = 0; i <= 345; i++) { put(6 + i * .1); runtime.tickOutskirtsCharacters(.1, { viewYaw: i < 200 ? .3 : 0 }); }
  const causal = checkpoints.filter(v => v.meta.recordCausal);
  assert.equal(causal.length, 2, 'movement records a full-state causal event more than once per pass');
  const saved = causal.at(-1).state;
  assert.ok(saved.outskirtsExperience.history.filter(p => p.pass === 0).length > 100);
  assert.ok(saved.outskirtsExperience.history.some(p => p.pass === 1));
  assert.ok(!saved.outskirtsExperience.actions.includes('r6:hatch-impact'), 'the history checkpoint triggers the Fold hatch');
  const decoded = shadowFrameAt({ shadowFrames: packShadowFrames([{ ...capture(0, 0), outskirtsCharacters: runtime.outskirtsCharacterFrame() }]) }, 0);
  const replay = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(saved)) });
  const view = put(41); replay.setPlayerPosition(view); replay.applyOutskirtsCharacterFrame(decoded.outskirtsCharacters);
  assert.equal(replay.propInstances(view.x, view.y, {}).filter(v => v.id.startsWith('outskirts-double')).length, 3, 'the early saved replay lost its preceding pass');
});

test('finalized stored tapes retain continuing struggle and recorded gait while the observer is stationary', async () => {
  const memory = new Map();
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, String(value)), removeItem: key => memory.delete(key) };
  try {
    await initGameStorage({ kind: 'browser', gameVersion: 'CHARACTER-TEST' });
    const recorder = new CausalRecorder(); recorder.begin({ runId: 'outskirts-character-acceptance' });
    for (const id of CAUSAL_SPINE_IDS) recorder.recordAnchor({ id, verb: 'haunt', required: true, locus: { x: 1, y: 2, spaceId: id === 'spine:source-threshold' ? 'source-space' : 'conservatory' } });
    // Capture the actual seated encounter, including its current world placement
    // and ordinary frontal approach, rather than a synthetic foldNear input.
    const stop = PRE_TAPE_GOD_STOPS.find(p => p.id === 'pre-tape-fold-approach');
    const built = buildPreTapeGodPreset(stop.depth, { seed: 4417, marbleEyes: 'returned' });
    const approach = { ...built.position, x: built.position.x + stop.across / CELL };
    const runtime = createSourceSpaceRuntime({ initialState: built.state });
    runtime.setPlayerPosition(approach); runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw, pitch: stop.pitch });
    assert.equal(runtime.outskirtsCharacterFrame().fold.phase, 'armed');
    const position = { ...approach, x: approach.x - 1 };
    assert.equal(runtime.geometry.canStep(approach.x, approach.y, position.x, position.y).ok, true);
    runtime.setPlayerPosition(position); runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw, pitch: stop.pitch });
    assert.equal(runtime.outskirtsCharacterFrame().fold.phase, 'force');
    assert.equal(runtime.outskirtsCharacterFrame().fold.elapsed, 0);
    const liveGuard = runtime.propInstances(position.x, position.y, { viewYaw: stop.yaw }).find(p => p.id === 'r6-booth-guard');
    assert.equal(liveGuard.mesh, 'outskirts_fold_guard');
    assert.deepEqual(liveGuard.character.contacts.seat, [0, .47, .04]);
    recorder.recordEvent({ type: 'space.source-state', actor: 'playerShadow', payload: { spaceId: 'source-space', sourceState: runtime.state() } });
    const captureRuntime = () => ({ ...position, floorH: runtime.geometry.floorAt(position.x, position.y),
      yaw: stop.yaw, pitch: stop.pitch, roomId: 'source_space', renderGroup: 'source-space', spaceId: 'source-space',
      outskirtsCharacters: runtime.outskirtsCharacterFrame() });
    recorder.tick(0, captureRuntime());
    for (let i = 0; i < 360; i++) {
      runtime.tickOutskirtsCharacters(.05, { viewYaw: stop.yaw, pitch: stop.pitch });
      recorder.tick(.05, captureRuntime());
    }
    const captured = recorder.frames.length;
    assert.ok(captured >= 170, `stationary observing undersampled the character: ${captured} frames`);
    const result = await recorder.finalize({ summary: { id: 'return:character-acceptance' }, endingId: 'sacrifice', injuries: 0, completedAt: 1 });
    assert.equal(result.ok, true);
    const stored = JSON.parse(JSON.stringify(await loadLatestCausalTape()));
    assert.equal(validateCausalTape(stored).ok, true);
    const replay = shadowFrameAt(stored, 15500).outskirtsCharacters;
    assert.ok(replay.fold.elapsed > 15 && replay.fold.phase === 'pain');
    assert.equal(replay.locomotion.pass, 6);
    assert.ok(Math.abs(replay.locomotion.across + 4.85) < 1e-5, 'recorded observer is not at the current frontal approach');
    assert.ok(Math.abs(replay.locomotion.yaw - stop.yaw) < 1e-5); assert.equal(replay.locomotion.pitch, stop.pitch);
    assert.equal(replay.locomotion.floorOffset, .12);
    const sourceState = stored.events.find(e => e.type === 'space.source-state').payload.sourceState;
    const replayRuntime = createSourceSpaceRuntime({ initialState: sourceState }); replayRuntime.setPlayerPosition(position);
    assert.equal(replayRuntime.applyOutskirtsCharacterFrame(replay), true);
    const replayGuard = replayRuntime.propInstances(position.x, position.y, { viewYaw: stop.yaw }).find(p => p.id === 'r6-booth-guard');
    assert.deepEqual([...replayGuard.matrix], [...liveGuard.matrix], 'saved replay moved or turned the seated guard');
    assert.deepEqual(replayGuard.character.contacts, liveGuard.character.contacts);
    assert.equal(replayGuard.character.clip, 'writhe');
    assert.ok(Math.abs(replayGuard.character.time - (replay.fold.elapsed - 12)) < 1e-5);
    const readOnly = createOutskirtsExperience(sourceState.outskirtsExperience);
    const history = readOnly.snapshot().history;
    assert.equal(readOnly.applyCharacterFrame(replay), true);
    assert.deepEqual(readOnly.characterFrame(), replay);
    assert.deepEqual(readOnly.snapshot().history, history);
    assert.deepEqual(readOnly.events(), [], 'saved replay re-fired live encounter sound cues');
    assert.equal(readOnly.characterFrame().locomotion.clip, 'idle');
    if (process.argv.includes('--artifact')) await writeFile(new URL('../artifacts/outskirts-characters/causal-capture.json', import.meta.url), JSON.stringify(stored, null, 2) + '\n');
  } finally { if (oldStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = oldStorage; }
});
