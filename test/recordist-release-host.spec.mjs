import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as SAVE from '../src/game/save.js';
import { freshRunRecord } from '../src/progression/schema.js';
import { canQualifyBorrowedRecordist } from '../src/game/story-evidence.js';
import { makeRecordistReleaseScene } from '../src/game/recordist-release-scene.js';
import { beginRecordistRelease, normalizeRecordistRelease, recordistReleaseView, advanceRecordistRelease } from '../src/game/recordist-release.js';
import { recordistReleaseProps, recordistReleaseCarriedProps, recordistReleaseRestingProps } from '../src/render/recordist-release.js';
import { chapelLineOfSight } from '../src/game/chapel-apparitions.js';
import { CHAPEL_TAPE_DEMAND_FLAG, normalizeChapelTapeDemand, reduceChapelTapeDemand, chapelTapeDemandResume } from '../src/game/chapel-tape-demand.js';
import * as REAL_FP from '../src/world/floorplan.js';
import * as REAL_PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';

// Invoke the production main.js hosts with the production release reducer,
// scene and save normalizer. This is a bounded host fixture, not a played route.
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
function block(from, to) {
  const start = main.indexOf(from), end = main.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `missing production host: ${from}`);
  return main.slice(start, end);
}
const releaseHost = block('let recordistReleaseScene=null;', '\nfunction askAlanWhileCarrying(){');
const rememberHost = block('function rememberChapelTapeDemandDeparture(', '\nfunction finishChapelTapeDemand(){');
const restoreHost = block('function restoreChapelTapeDemandDeparture(){', '\n// The last walk owns a physical progression');
const signHost = block("  if(escape?.kind==='surfaced'&&escape.stage==='service-road'", '\n  // The Stillson never enters the field case.');
const clone = value => JSON.parse(JSON.stringify(value));
const E = { key: 'e', code: 'KeyE' };
const CELL = .5;
function fresh() {
  const save = SAVE.freshSave({ run: freshRunRecord({ id: 'earned-chapel-run', now: 1 }) });
  save.area = 'conservatory'; save.px = 184; save.py = 148;
  save.flags = { 'has.interface': true, 'finale.grant.route.surfaced': true };
  save.encounters.cleared = ['chapel'];
  return save;
}
function fixture({ save = fresh(), fork = true, ready = true, solid = () => false, propClear = () => true, physical = null, spans = null } = {}) {
  const stack = [], writes = [], spoken = [], endings = [], interactions = [], preparations = [];
  let now = 1000, focus = true, modal = false, special = false;
  const FP = {
    toRuntimePoint: p => ({ x: p.x * 2, y: p.y * 2 }),
    logicalToPhysical: physical || ((x, y) => ({ x, z: y, y: 0, renderGroup: 'ground' })),
    isSolid: solid, physicalSpanData: () => spans ? { cells: spans } : null,
  };
  const camera = { eye: { x: save.px * CELL, y: 1.65, z: save.py * CELL }, yaw: 0, pitch: 0 };
  const context = {
    console: { warn() {}, error() {} }, document: { hidden: false },
    getSave: () => save, saveCommit: patch => { Object.assign(save, patch); writes.push(clone(patch)); return save; },
    flagTest: key => save.flags[key] === true,
    finaleHasFork: () => fork, finaleGrant: id => save.flags[`finale.grant.${id}`] === true,
    finaleLock: id => save.flags[`finale.lock.${id}`] === true,
    canQualifyBorrowedRecordist, makeRecordistReleaseScene, beginRecordistRelease,
    normalizeRecordistRelease, recordistReleaseView, recordistReleaseProps,
    recordistReleaseCarriedProps, recordistReleaseRestingProps, chapelLineOfSight,
    normalizeChapelTapeDemand, reduceChapelTapeDemand, chapelTapeDemandResume, CHAPEL_TAPE_DEMAND_FLAG,
    chapelTapeDemandContext: () => ({ runId: save.run.id, chapelWon: save.encounters.cleared.includes('chapel'), chapelRoute: true }),
    chapelTapeDemandState: () => normalizeChapelTapeDemand(save.flags[CHAPEL_TAPE_DEMAND_FLAG], { runId: save.run.id }),
    commitChapelTapeDemand: (state, { commit = true } = {}) => {
      save.flags[CHAPEL_TAPE_DEMAND_FLAG] = state;
      if (commit) { writes.push({ flags: clone(save.flags) }); }
      return state;
    },
    syncChapelTapeDemandTimelineHold() {},
    R3: {
      r3dViewCamera: () => camera,
      r3dLookAngles: () => ({ yaw: camera.yaw, pitch: camera.pitch }),
      r3dSetLookAngles: value => Object.assign(camera, value),
      r3dRecordistReleaseReady: () => ready,
      r3dPrepareRecordistRelease: async () => { preparations.push(true); return ready; },
    },
    FP, PROPS: { propCanOccupy: propClear, propById: id => id === 'yard-booth-guard-ledger' ? { rx: 220, ry: 430 } : null },
    scenes: {
      push(scene) { stack.push(scene); scene.enter?.(); },
      remove(scene) { const at = stack.indexOf(scene); if (at < 0) return null; stack.splice(at, 1); scene.exit?.(); return scene; },
      blocksWorld: () => false, blocksInput: () => modal,
    },
    usingSpecialSpace: () => special, gameplayInputLifecycleActive: () => focus,
    paused: false, storyMode: true, finaleActive: false, escape: null,
    sourceContinuationScene: null, endingTimeline: null, activeEndingCutscene: null,
    renderMove: null, motionRig: null, trail: [], chapelTapeTugHeld: false, chapelTapeSavedProgress: 0,
    endingManifest: id => ({ objective: { pace: .58, timeline: [] }, cutscene: { endingId: id, beats: [] } }),
    startActiveEndingCutscene: spec => (context.activeEndingCutscene = { spec, embodiment: {},
      state: { cursor: 0, elapsedMs: 0, fired: [], interactions: [] } }),
    startEndingTimeline() {}, reduceEndingEmbodiment: value => value,
    applyLensPreset() {}, fireCue() {}, pushEvent() {}, SPEECH: { say: value => spoken.push(value) },
    ensureCtx() {}, actx: null, sfxGain: null, master: null,
    CHUNK_SURF_ENDING_ID: 'surfaced', MAIN_EXIT_CELL: { x: 65, y: 16 },
    CELL, D: metres => metres / CELL, px: save.px, py: save.py, mapWorldHeading: () => camera.yaw,
    performance: { now: () => now },
    chapelTapeRetakeRoom: () => null, chapelTapeDamageAtExit: () => false,
    advanceActiveEndingCutscene: value => interactions.push(value),
    completeSurfacedExit: () => endings.push('surfaced'), askAlanWhileCarrying() {},
  };
  vm.createContext(context);
  vm.runInContext(`${releaseHost}\n${rememberHost}\n${restoreHost}\nfunction signAtLedger(){${signHost}}`, context);
  const run = text => vm.runInContext(text, context);
  function aim() {
    const scene = stack.at(-1), view = scene?.view() || recordistReleaseView(save.recordistRelease), target = view.target;
    context.px = (target.x + .45) / CELL; context.py = (target.z + .55) / CELL;
    camera.eye = { x: context.px * CELL, y: 1.65, z: context.py * CELL };
    // This fixture controls only the offered camera/position dependencies; the
    // production host computes all interaction eligibility from them.
    const dx = target.x - camera.eye.x, dz = target.z - camera.eye.z, dy = target.y - camera.eye.y;
    camera.yaw = Math.atan2(dx, -dz); camera.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }
  function wait(seconds, scene = stack.at(-1)) { for (let i = 0; i < Math.round(seconds / .05); i++) { now += 50; scene.update(.05); } }
  function hold(seconds) { const scene = stack.at(-1); aim(); scene.keyup(E); scene.update(.01); scene.key(E); wait(seconds, scene); }
  return { context, camera, save, stack, writes, spoken, endings, interactions, preparations, run, aim, wait, hold,
    setFork: value => { fork = value; }, setFocus: value => { focus = value; },
    setModal: value => { modal = value; }, setReady: value => { ready = value; }, setSpecial: value => { special = value; } };
}
function reachCarry(h) {
  assert.equal(h.run('endSurfaced()'), true);
  h.hold(2.4); h.hold(1.5); h.wait(2.2); h.hold(2.8);
  assert.equal(h.save.recordistRelease.stage, 'carried');
}

test('actual surfaced host requires the earned chapel proof, both objects and an active owner', () => {
  for (const patch of [{ fork: false }, { flags: { 'has.interface': false } },
    { flags: { 'finale.grant.route.surfaced': false } }, { flags: { 'finale.lock.route.surfaced': true } },
    { status: 'return-committed' }]) {
    const save = fresh(); Object.assign(save.flags, patch.flags || {}); if (patch.status) save.run.status = patch.status;
    const h = fixture({ save, fork: patch.fork !== false });
    assert.equal(h.run('endSurfaced()'), false);
    assert.equal(h.stack.length, 0); assert.equal(h.context.escape, null); assert.equal(h.save.recordistRelease, null);
  }
});

test('selecting surfaced prepares a visible body and never substitutes for physically earning the carry', () => {
  const h = fixture(); assert.equal(h.run('endSurfaced()'), true);
  assert.equal(h.stack.length, 1); assert.equal(h.save.recordistRelease.stage, 'address');
  assert.equal(h.context.escape, null); assert.equal(h.endings.length, 0);
  assert.equal(h.save.flags[CHAPEL_TAPE_DEMAND_FLAG], undefined, 'the case departure starts only after lifting');
  h.aim(); h.stack[0].key(E); h.wait(20);
  assert.equal(h.save.recordistRelease.stage, 'address', 'the route-selection key cannot operate the rig');
  assert.equal(h.context.escape, null);
  const props = h.run('currentRecordistReleaseProps(1)');
  assert.equal(props[0].mesh, 'recordist_release_alan');
});

test('actual host transitions from rig to fork, slump and saved lift before starting the carry', () => {
  const h = fixture(); h.run('endSurfaced()'); h.hold(2.4);
  assert.equal(h.save.recordistRelease.stage, 'interrupt'); assert.equal(h.context.escape, null);
  h.setFork(false); h.hold(3); assert.equal(h.save.recordistRelease.stage, 'interrupt');
  h.setFork(true); h.hold(1.5); assert.equal(h.save.recordistRelease.stage, 'settling');
  h.wait(2.2); assert.equal(h.save.recordistRelease.stage, 'lift'); assert.equal(h.context.escape, null);
  h.hold(2.8);
  assert.equal(h.stack.length, 0); assert.equal(h.context.escape.kind, 'surfaced');
  assert.equal(h.save.recordistRelease.proof.lifted, true);
  assert.equal(h.save.flags[CHAPEL_TAPE_DEMAND_FLAG].status, 'departing');
  const liftSave = h.writes.findIndex(p => p.recordistRelease?.proof?.lifted);
  const departureSave = h.writes.findIndex(p => p.flags?.[CHAPEL_TAPE_DEMAND_FLAG]?.status === 'departing');
  assert.ok(liftSave >= 0 && departureSave > liftSave, 'physical lift is durable before the carry begins');
  assert.equal(h.endings.length, 0);
  const carried = h.run('currentRecordistReleaseProps(8)')[0];
  assert.equal(carried.mesh, 'recordist_release_alan');
  assert.ok(Math.abs(-carried.matrix[8] - Math.sin(h.camera.yaw)) < 1e-10);
  assert.ok(Math.abs(-carried.matrix[10] + Math.cos(h.camera.yaw)) < 1e-10);
});

test('actual camera pitch, aim, obstruction and world-live modal control release eligibility', () => {
  const h = fixture(); h.run('endSurfaced()'); h.aim();
  assert.equal(h.stack[0].view().inRange, true); assert.equal(h.stack[0].view().facing, true);
  h.hold(.6); assert.ok(h.stack[0].serialize().holdSeconds > .5);
  h.setModal(true); h.wait(.1);
  assert.equal(h.stack[0].serialize().holdSeconds, 0, 'input-modal scenes cancel even while world time remains live');
  h.setModal(false); h.setFocus(false); h.hold(3);
  assert.equal(h.stack[0].serialize().stage, 'address');
  h.setFocus(true); h.camera.yaw += Math.PI; h.stack[0].key(E); h.wait(3);
  assert.equal(h.stack[0].serialize().stage, 'address');
  h.aim(); h.camera.pitch *= -1;
  assert.equal(h.stack[0].view().facing, false, 'downward body target uses the same positive-up camera basis as rendering');
  const wall = fixture({ spans: new Map() }); wall.run('endSurfaced()'); wall.aim();
  assert.equal(wall.stack[0].view().inRange, true);
  assert.equal(wall.stack[0].view().facing, false, 'production span occlusion rejects an otherwise aligned target through a wall');
});

test('the real origin selector avoids the player and orients the anatomical front toward them', () => {
  for (const point of [{ x: 184, y: 148 }, { x: 189, y: 144 }, { x: 179, y: 144 }]) {
    const save = fresh(); save.px = point.x; save.py = point.y;
    const h = fixture({ save }); const origin = h.run('recordistReleaseOrigin()');
    const dx = save.px * CELL - origin.x, dz = save.py * CELL - origin.z, distance = Math.hypot(dx, dz);
    assert.ok(distance >= 1.1, 'the player does not begin inside Alan');
    const front = [-Math.sin(origin.yaw), -Math.cos(origin.yaw)];
    assert.ok((front[0] * dx + front[1] * dz) / distance > .999, 'real model -Z faces the player at all bearings');
  }
  const blocked = fixture({ solid: () => true });
  assert.equal(blocked.run('endSurfaced()'), false); assert.equal(blocked.stack.length, 0);
  const unsupported = fixture({ physical: (x, y) => ({ x, z: y, y: x === 184 && y === 148 ? 0 : 3, renderGroup: 'ground' }) });
  assert.throws(() => unsupported.run('recordistReleaseOrigin()'), /supported clear position/);
});

test('missing production character assets cannot turn a valid route into an invisible carry', async () => {
  const h = fixture({ ready: false }); h.run('endSurfaced()');
  assert.equal(await h.stack[0].initialize(), false);
  h.hold(20); assert.equal(h.save.recordistRelease.stage, 'address');
  assert.equal(h.context.escape, null); assert.equal(h.run('currentRecordistReleaseProps(4)').length, 0);
  h.setReady(true); h.hold(2.4); assert.equal(h.save.recordistRelease.stage, 'interrupt');
});

test('unfinished release reload preserves proof but requires new physical input, and old owners cannot save', () => {
  const h = fixture(); h.run('endSurfaced()'); h.hold(2.4); h.hold(.6);
  const next = fixture({ save: clone(h.save) });
  assert.equal(next.run('resumeRecordistReleaseFromSave()'), true);
  assert.equal(next.context.escape, null); assert.equal(next.stack[0].serialize().stage, 'interrupt');
  assert.equal(next.stack[0].serialize().holdSeconds, 0);
  assert.equal(next.stack[0].serialize().requiresRelease, true);
  const writes = next.writes.length; next.save.run.id = 'another-night';
  next.wait(3); next.stack[0].exit();
  assert.equal(next.writes.length, writes); assert.equal(next.context.escape, null);
});

test('carried reload restores departure position, Alan questions and the first signature before the final one', () => {
  const h = fixture(); reachCarry(h);
  h.context.escape.stage = 'service-road'; h.context.escape.alanQuestion = 3;
  h.context.px = 220; h.context.py = 430;
  h.run('signAtLedger()');
  assert.equal(h.context.escape.ledgerSignatures, 1); assert.equal(h.endings.length, 0);
  const savedDeparture = h.save.flags[CHAPEL_TAPE_DEMAND_FLAG].departure;
  assert.equal(savedDeparture.ledgerSignatures, 1); assert.equal(savedDeparture.alanQuestion, 3);
  assert.equal(h.run('endSurfaced()'), true, 'route selection is idempotent after the carry has begun');
  assert.equal(h.context.escape.stage, 'service-road');
  assert.equal(h.context.escape.ledgerSignatures, 1); assert.equal(h.context.escape.alanQuestion, 3);
  const reload = clone(h.save); reload.px = 180; reload.py = 140;
  const next = fixture({ save: reload });
  assert.equal(next.run('resumeRecordistReleaseFromSave()'), true);
  assert.equal(next.stack.length, 0); assert.equal(next.context.escape.stage, 'service-road');
  assert.equal(next.context.px, 220); assert.equal(next.context.py, 430);
  assert.equal(next.context.escape.ledgerSignatures, 1); assert.equal(next.context.escape.alanQuestion, 3);
  next.run('signAtLedger()');
  assert.equal(next.context.escape.ledgerSignatures, 2); assert.deepEqual(next.endings, ['surfaced']);
  assert.equal(next.save.flags[CHAPEL_TAPE_DEMAND_FLAG].departure.ledgerSignatures, 2);
});

test('a saved lift interrupted before departure resumes carrying at the current saved position', () => {
  const h = fixture(); reachCarry(h);
  const save = clone(h.save); delete save.flags[CHAPEL_TAPE_DEMAND_FLAG]; save.px = 210; save.py = 190;
  const next = fixture({ save }); assert.equal(next.run('resumeRecordistReleaseFromSave()'), true);
  assert.equal(next.context.escape.kind, 'surfaced'); assert.equal(next.stack.length, 0);
  assert.equal(next.context.px, 210); assert.equal(next.context.py, 190);
  assert.equal(next.save.flags[CHAPEL_TAPE_DEMAND_FLAG].departure.position.x, 210);
  const ended = fixture({ save: { ...clone(save), run: { ...clone(save.run), status: 'return-committed' } } });
  assert.equal(ended.run('resumeRecordistReleaseFromSave()'), false); assert.equal(ended.context.escape, null);
});

test('production save normalization round-trips stage proof and rejects foreign or forged carry state', async () => {
  const base = fresh(); let release = beginRecordistRelease({ runId: base.run.id, origin: { x: 25, y: 0, z: 34, yaw: .6 } });
  release = advanceRecordistRelease(release, { interactHeld: false, dt: .01 }).state;
  for (let i = 0; i < 24; i++) release = advanceRecordistRelease(release, { dt: .1, interactHeld: true, inRange: true, facing: true, hasRig: true }).state;
  await SAVE.withTransientGameState({ save: { ...base, recordistRelease: release } }, async () => {
    assert.equal(SAVE.getSave().recordistRelease.stage, 'interrupt');
    SAVE.saveCommit({ px: 81, py: 90 });
    const disk = clone(SAVE.getSave());
    await SAVE.withTransientGameState({ save: disk }, async () => {
      assert.deepEqual(SAVE.getSave().recordistRelease, release);
      assert.equal(SAVE.getSave().px, 81); assert.equal(SAVE.getSave().py, 90);
    });
  });
  await SAVE.withTransientGameState({ save: { ...base, run: freshRunRecord({ id: 'new-run', now: 2 }), recordistRelease: release } }, async () => {
    assert.equal(SAVE.getSave().recordistRelease, null);
  });
  await SAVE.withTransientGameState({ save: { ...base, recordistRelease: { ...release, stage: 'carried', proof: { lifted: true } } } }, async () => {
    assert.equal(SAVE.getSave().recordistRelease.stage, 'address');
    assert.equal(SAVE.getSave().recordistRelease.proof.lifted, false);
  });
  assert.equal(SAVE.freshSave().recordistRelease, null);
});

test('compiled chapel geometry supports the body and a collision-valid operator approach from nave and raised chancel', t => {
  REAL_FP.compile(conservatory.levels, conservatory);
  REAL_PROPS.propsInit(REAL_FP);
  const keys = new Set(['master', 'chapel']);
  for (const door of REAL_FP.doorState()) if (!door.keyId || keys.has(door.keyId)) REAL_FP.setDoorOpen(door.id, true);
  const results = [];
  for (const authored of [{ x: 92, y: 68 }, { x: 92, y: 74 }, { x: 92, y: 90 }]) {
    const start = REAL_FP.toRuntimePoint(authored), save = fresh();
    save.px = start.x; save.py = start.y;
    assert.equal(REAL_FP.isSolid(start.x, start.y), false);
    assert.equal(REAL_PROPS.propCanOccupy(start.x, start.y), true, 'the chosen actual starting stance is occupiable');
    const h = fixture({ save }); h.context.FP = REAL_FP; h.context.PROPS = REAL_PROPS;
    const origin = h.run('recordistReleaseOrigin()'), from = REAL_FP.logicalToPhysical(start.x, start.y);
    assert.ok(Math.hypot(origin.x - from.x * CELL, origin.z - from.z * CELL) >= 1.1);
    assert.ok(Math.abs(origin.y - 4.8) < .0001, 'the actor uses the real nave floor, not the camera height');
    const row = [{ x: 92, y: 72 }, { x: 92, y: 74 }, { x: 92, y: 70 }, { x: 90, y: 72 }, { x: 94, y: 72 }]
      .map(REAL_FP.toRuntimePoint).find(p => {
        const at = REAL_FP.logicalToPhysical(p.x, p.y);
        return Math.hypot(at.x * CELL - origin.x, at.z * CELL - origin.z) < .001;
      });
    assert.ok(row, 'origin belongs to an authored aisle candidate');
    for (const [dx, dz] of [[0, 0], [.45, 0], [-.45, 0], [0, .45], [0, -.45]]) {
      assert.equal(REAL_FP.isSolid(row.x + dx / CELL, row.y + dz / CELL), false);
      assert.equal(REAL_PROPS.propCanOccupy(row.x + dx / CELL, row.y + dz / CELL), true, 'anatomical footprint clears actual props');
    }
    h.save.recordistRelease = beginRecordistRelease({ runId: save.run.id, origin });
    const target = recordistReleaseView(h.save.recordistRelease).target;
    const queue = [{ ...start, steps: 0 }], seen = new Set([`${start.x},${start.y}`]);
    let found = null;
    for (let index = 0; index < queue.length && !found; index++) {
      const at = queue[index], physical = REAL_FP.logicalToPhysical(at.x, at.y);
      h.context.px = at.x; h.context.py = at.y;
      h.camera.eye = { x: physical.x * CELL, y: physical.y + 1.65, z: physical.z * CELL };
      const dx = target.x - h.camera.eye.x, dz = target.z - h.camera.eye.z;
      h.camera.yaw = Math.atan2(dx, -dz);
      h.camera.pitch = Math.atan2(target.y - h.camera.eye.y, Math.hypot(dx, dz));
      const ctx = h.run('recordistReleaseContext(recordistReleaseView(getSave().recordistRelease))');
      if (ctx.inRange && ctx.facing && h.camera.pitch >= -1.15) { found = { ...at, pitch: h.camera.pitch }; break; }
      for (const [x, y] of [[at.x + 1, at.y], [at.x - 1, at.y], [at.x, at.y + 1], [at.x, at.y - 1]]) {
        const id = `${x},${y}`;
        if (seen.has(id) || x < 172 || x > 198 || y < 116 || y > 186 || !REAL_PROPS.propCanOccupy(x, y)) continue;
        const step = REAL_FP.canStep(at.x, at.y, x, y, { keys });
        if (!step.ok || step.redirect) continue;
        seen.add(id); queue.push({ x, y, steps: at.steps + 1 });
      }
    }
    assert.ok(found, `the real walk/collision graph reaches an aimable arm-length interaction from (${authored.x},${authored.y})`);
    results.push({ from: authored, floor: from.y, origin, operator: found });
  }
  t.diagnostic(JSON.stringify({ kind: 'isolated-production-geometry-and-host', ordinaryPlay: false, results }));
});
