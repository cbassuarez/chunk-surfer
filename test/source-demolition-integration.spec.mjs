import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL } from '../src/data/floorplan/legend.js';
import { SOURCE_HANGING_SHORE as SHORE, SOURCE_SHORE_DIRECT_METRES } from '../src/data/source-hanging-shore.js';
import { SOURCE_PRE_TAPE } from '../src/data/source-level.js';
import { buildChunkSurfGodPreset, CHUNK_SURF_GOD_PRESET as PRESET } from '../src/game/chunk-surf-god.js';
import { CHUNK_SURF_PHASE, normalizeChunkSurfState, reduceChunkSurf } from '../src/game/chunk-surf-state.js';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';

const json = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, label = 'physical coordinate') => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
function fixture({ state = null, along = -.4, across = 0, open = true } = {}) {
  const built = buildChunkSurfGodPreset(PRESET.LANDING, { seed: 4417, injuries: 0, hasRig: true });
  const saves = [], scares = [], completions = [];
  const initial = state || (open ? reduceChunkSurf(built.state, { type: 'SOURCE_LANDING_DOOR_OPENED' }) : built.state);
  const runtime = createSourceSpaceRuntime({ initialState: initial,
    onState: (value, options) => saves.push({ state: json(value), ...options }),
    onScare: event => scares.push(event), onComplete: (...args) => completions.push(args) });
  const origin = runtime.state().landscapeOrigin;
  let pose = { x: origin.x + (SHORE.portal.x + across) / CELL,
    y: origin.y + (SHORE.portal.z - along) / CELL, facing: 0 };
  runtime.setPlayerPosition(pose);
  const position = (x, z) => ({ x: origin.x + x / CELL, y: origin.y + z / CELL, facing: 0 });
  function warp(nextAlong, nextAcross = runtime.demolitionFrame().across) {
    pose = position(SHORE.portal.x + nextAcross, SHORE.portal.z - nextAlong);
    runtime.setPlayerPosition(pose); return pose;
  }
  function tick(options = {}, dt = .1) {
    const args = { px: pose.x, py: pose.y, facing: pose.facing, yaw: 0,
      demolitionAssetsReady: true, ...options };
    runtime.tickDemolition(dt, args);
    // Match main's two owners: the global encounter clock then the existing
    // Source simulation, without advancing the encounter for a second time.
    runtime.tick(dt, { ...args, demolitionAlreadyTicked: true });
    return runtime.demolitionFrame();
  }
  function moveLocal(x, z, { options = {}, dt = 1 / 60, allowBlocked = false } = {}) {
    const to = position(x, z), allowed = runtime.geometry.canStep(pose.x, pose.y, to.x, to.y);
    if (allowed.ok) { runtime.onStep(pose, to); runtime.setPlayerPosition(to); pose = to; }
    else if (!allowBlocked) assert.fail(`ordinary shore step blocked: ${JSON.stringify({ x, z, allowed })}`);
    return { frame: tick(options, dt), allowed };
  }
  function step(nextAlong, nextAcross = runtime.demolitionFrame().across, options = {}, dt = .1) {
    return moveLocal(SHORE.portal.x + nextAcross, SHORE.portal.z - nextAlong, { options, dt }).frame;
  }
  function walkToLocal(x, z, options = {}) {
    for (let i = 0; i < 6000; i++) {
      const lx = (pose.x - origin.x) * CELL, lz = (pose.y - origin.y) * CELL;
      const distance = Math.hypot(x - lx, z - lz); if (distance < 1e-7) return;
      const step = Math.min(.08, distance);
      moveLocal(lx + (x - lx) * step / distance, lz + (z - lz) * step / distance,
        { options, dt: step / 4.8 });
    }
    assert.fail('ordinary shore walk did not reach target');
  }
  const walk = (nextAlong, options = {}) => walkToLocal(SHORE.portal.x, SHORE.portal.z - nextAlong, options);
  function wait(seconds, options = {}) { let frame; for (let i = 0; i < Math.round(seconds * 10); i++) frame = tick(options); return frame; }
  const props = options => runtime.propInstances(pose.x, pose.y, { flashMode: 'full', ...options });
  return { runtime, origin, saves, scares, completions, position, warp, tick, step, walk, walkToLocal, moveLocal, wait, props, pose: () => ({ ...pose }) };
}
function commit(f = fixture()) {
  f.tick(); f.tick(); f.walk(1.3);
  assert.equal(f.runtime.state().sourceDemolition.committed, true); return f;
}
const omen = f => f.props().filter(p => p.sourceStructure?.startsWith('source-demolition'));
const matrices = props => props.map(p => ({ id: p.id, mesh: p.mesh, matrix: [...p.matrix], variant: p.apparitionVariant }));
function protectedSemantics(state) {
  const keys = ['active','completed','phase','checkpointId','attempts','injuriesAtEntry','visited','recorded','tuned',
    'optionalTraces','sourceContacts','pursuitBeat','pursuitsCleared','finalEncounter','finale'];
  return json({ ...Object.fromEntries(keys.map(key => [key, state[key]])), horizon: state.horizon });
}

test('real open threshold submits one fixed intact fixture but cannot attack until the capsule has cleared the exit', () => {
  const f = fixture(); f.tick(); f.tick();
  assert.equal(f.runtime.sourceShoreFrame().outside, false);
  const before = f.runtime.demolitionFrame(); assert.equal(before.preload, true);
  // Submission is not a claim of indoor visibility: the established white
  // aperture compositor remains authoritative until the body actually exits.
  assert.ok(omen(f).length > 1, 'intact geometry is prepared before the ordinary crossing');
  assert.equal(before.committed, false); assert.deepEqual(before.events, []);
  const fixed = matrices(omen(f)); f.tick({ yaw: Math.PI, suspendedPresentation: true });
  assert.deepEqual(matrices(omen(f)), fixed);
  assert.deepEqual(before.origin, { x: f.origin.x * CELL + 16, y: 0, z: f.origin.y * CELL - 242 });
  f.walk(1.2); assert.equal(f.runtime.state().sourceDemolition.committed, false);
  assert.equal(f.runtime.sourceShoreFrame().outside, true, 'cell ownership changes before full capsule clearance');
  f.walk(1.3); const after = f.runtime.demolitionFrame();
  assert.equal(after.committed, true); assert.deepEqual(after.events.map(e => e.type), ['strain']);
  assert.equal(f.saves.at(-1).immediate, true); assert.equal(f.runtime.state().phase, CHUNK_SURF_PHASE.LANDSCAPE);
  assert.equal('demolition' in f.runtime.state().horizon, false);
});

test('missing assets, closed leaf, protected crossing, waiting and pose jumps never manufacture a commitment', () => {
  const absent = fixture(); absent.tick({ demolitionAssetsReady: false }); absent.walk(6, { demolitionAssetsReady: false });
  assert.equal(absent.runtime.state().sourceDemolition.committed, false); assert.deepEqual(omen(absent), []);
  assert.equal(absent.runtime.geometry.renderedFloorAt(), 0); absent.tick();
  assert.equal(absent.runtime.state().sourceDemolition.committed, false, 'asset arrival cannot replay the discarded crossing');
  const closed = fixture({ open: false }); closed.tick(); closed.tick();
  const outside = closed.position(4, SHORE.portal.z - 1.4);
  assert.equal(closed.runtime.geometry.canStep(closed.pose().x, closed.pose().y, outside.x, outside.y).ok, false);
  closed.wait(2); assert.equal(closed.runtime.state().sourceDemolition.committed, false);
  for (const mode of ['protected','pose','large-step','wait']) {
    const f = fixture({ along: 1.1 }); f.tick(); f.tick();
    if (mode === 'protected') { f.step(1.3, 0, { protectedPresentation: true }); f.tick(); }
    if (mode === 'pose') { f.warp(1.3); f.tick(); }
    if (mode === 'large-step') f.step(8);
    if (mode === 'wait') f.wait(2);
    assert.equal(f.runtime.state().sourceDemolition.committed, false, mode);
  }
});

test('actual released geometry and sound anchors agree after3.15s and remain fixed through a head turn', () => {
  const f = commit(); f.wait(3);
  assert.equal(f.runtime.demolitionFrame().release, 0);
  assert.equal(omen(f).some(p => p.sourceStructure === 'source-demolition-spirit'), false);
  f.wait(.2); const after = f.runtime.demolitionFrame();
  assert.ok(after.release > 0); assert.ok(after.events.some(e => e.type === 'release'));
  assert.ok(omen(f).some(p => p.sourceStructure === 'source-demolition-spirit'));
  for (const event of after.events) assert.deepEqual(event.position, after.anchors[event.type]);
  const before = matrices(omen(f)), anchors = json(after.anchors);
  f.tick({ yaw: Math.PI, suspendedPresentation: true });
  assert.deepEqual(matrices(omen(f)), before); assert.deepEqual(f.runtime.demolitionFrame().anchors, anchors);
  const lights = f.runtime.localLights().filter(l => l.id.startsWith('source-demolition:work-'));
  assert.equal(lights.length, 2); assert.ok(lights.every(l => l.y > 0 && l.y < 10 && l.intensity > 0));
});

test('new top-level state survives JSON normalization and runtime reload without reversing loss or repeating old attacks', () => {
  const f = commit(); f.walk(5); f.wait(5);
  const before = f.runtime.demolitionFrame(), saved = json(f.runtime.state());
  assert.deepEqual(normalizeChunkSurfState(saved).sourceDemolition, saved.sourceDemolition);
  const r = fixture({ state: normalizeChunkSurfState(saved), along: before.along, across: before.across });
  const resumed = r.tick({ yaw: Math.PI });
  assert.deepEqual(resumed.origin, before.origin); assert.ok(resumed.elapsed >= before.elapsed); assert.ok(resumed.loss >= before.loss);
  assert.deepEqual(resumed.events, []);
  assert.deepEqual(r.runtime.state().sourceDemolition.receipts.map(e => e.id), saved.sourceDemolition.receipts.map(e => e.id));
  const elapsed = resumed.elapsed; r.wait(2, { suspendedPresentation: true }); close(r.runtime.demolitionFrame().elapsed, elapsed);
  r.wait(3, { protectedPresentation: true }); r.tick();
  assert.equal(r.runtime.state().sourceDemolition.receipts.find(e => e.type === 'roof').suppressed, true);
  assert.equal(r.runtime.demolitionFrame().events.some(e => e.type === 'roof'), false);
});

test('normal4.8m/s walking crosses bodies and a bounded black region early, without relocation, cost or route change', () => {
  const f = fixture(); f.tick(); f.tick(); const semantic = protectedSemantics(f.runtime.state());
  const samples = [8, 20, 30, 40].map(along => {
    const p = f.position(4, SHORE.portal.z - along);
    return { p, floor: f.runtime.geometry.floorAt(p.x, p.y), step: f.runtime.geometry.canStep(p.x, p.y, p.x, p.y - .16) };
  });
  let firstBlack = null;
  for (let i = 0; i < 510 && f.runtime.demolitionFrame().along < 40; i++) {
    const nextAlong = Math.min(40, f.runtime.demolitionFrame().along + .08);
    const frame = f.step(nextAlong, 0, {}, 1 / 60);
    close(frame.along, nextAlong); assert.equal(f.runtime.geometry.renderedFloorAt(), 0);
    if (frame.blackness && firstBlack === null) {
      firstBlack = frame.along;
      assert.equal(omen(f).filter(p => p.sourceStructure === 'source-demolition-void').length, 1);
      assert.equal(f.props({ suppressActors: true }).some(p => p.sourceStructure === 'source-demolition-void'), false);
      assert.equal(f.props({ flashMode: 'off' }).some(p => p.sourceStructure === 'source-demolition-void'), false);
    }
  }
  assert.ok(firstBlack > 25 && firstBlack < 30, `black arrived at ${firstBlack}m instead of the first few seconds`);
  assert.equal(f.runtime.demolitionFrame().released, true); assert.equal(f.runtime.demolitionFrame().blackness, 0);
  assert.ok(f.props().some(p => p.id === 'source-shore-piece:practice-stand'), 'the existing40m remnant remains available');
  assert.deepEqual(protectedSemantics(f.runtime.state()), semantic); assert.deepEqual(f.scares, []); assert.deepEqual(f.completions, []);
  for (const { p, floor, step } of samples) {
    assert.equal(f.runtime.geometry.floorAt(p.x, p.y), floor);
    assert.deepEqual(f.runtime.geometry.canStep(p.x, p.y, p.x, p.y - .16), step);
  }
  assert.equal(f.runtime.state().sourceDemolition.receipts.filter(e => e.type === 'consumed').length, 1);
});

test('a stopping witness can watch, then enter late; reload during body fill and retreat preserve the geographic release', () => {
  const f = commit(); f.walk(5); f.wait(20);
  assert.equal(f.runtime.demolitionFrame().elapsed, 18); assert.equal(f.runtime.demolitionFrame().consumed, false);
  f.walk(8.1); assert.equal(f.runtime.demolitionFrame().consumed, true);
  const r = fixture({ state: json(f.runtime.state()), along: 8.1 }); r.tick(); r.wait(.7);
  assert.equal(r.runtime.demolitionFrame().blackness, 1);
  r.walk(7.9); assert.equal(r.runtime.demolitionFrame().released, true); assert.equal(r.runtime.demolitionFrame().blackness, 0);
  r.walk(12); assert.equal(r.runtime.demolitionFrame().blackness, 0, 'return cannot repeat the same consumption');
});

test('the original170m crossing, moving first lift, receiving ledge and offset cleft still work through ordinary steps', () => {
  assert.equal(SOURCE_SHORE_DIRECT_METRES, 170);
  const f = commit(); let boarded = false, reachedLedge = false;
  for (let i = 0; i < 5000; i++) {
    const p = f.pose(), x = (p.x - f.origin.x) * CELL, z = (p.y - f.origin.y) * CELL;
    f.moveLocal(x, z - .08, { allowBlocked: true });
    const shore = f.runtime.sourceShoreFrame(); boarded ||= shore.lift.boarded;
    if (shore.surface === 'ledge' && shore.bodyFloor >= 4.2 - 1e-6) { reachedLedge = true; break; }
  }
  assert.equal(boarded, true); assert.equal(reachedLedge, true); assert.equal(f.runtime.state().sourceShore.ridden, true);
  assert.equal(f.runtime.state().firstLiftCompleted, false, 'the lift itself is not the Source-proper handoff');
  assert.equal(f.runtime.geometry.renderedFloorAt(), 4.2); assert.equal(f.runtime.traversalFrame().locksMovement, false);
  for (const [x,z] of [[4,-388],[10,-388],[10,-392],[9,-392.7],[4,-396],[4,-399]]) f.walkToLocal(x,z);
  assert.equal(f.runtime.state().firstLiftCompleted, true); assert.equal(f.runtime.sourceShoreFrame().proper, true);
  assert.equal(f.runtime.demolitionFrame().active, false); assert.deepEqual(omen(f), []);
});

test('the retired late-Outskirts event is absent and its original receding elevation remains', () => {
  const b = buildChunkSurfGodPreset(PRESET.FIRST_CONTACT, { seed: 4417, injuries: 0 });
  b.state.horizon.demolition = { version: 1, sequenceId: 'source-demolition:conservatoire-west-v1', committed: true, elapsed: 18 };
  const r = createSourceSpaceRuntime({ initialState: b.state }); r.setPlayerPosition(b.position); r.completeNormalExit();
  const o = r.state().landscapeOrigin, p = { x: o.x, y: o.y + SOURCE_PRE_TAPE.from + .99 - SOURCE_PRE_TAPE.stillLength - 903 / CELL - .5, facing: 0 };
  r.setPlayerPosition(p); r.tickDemolition(.1, { px: p.x, py: p.y, demolitionAssetsReady: true, yaw: 0 });
  assert.equal(r.state().phase, CHUNK_SURF_PHASE.HORIZON); assert.equal('demolition' in r.state().horizon, false);
  assert.equal(r.state().sourceDemolition.status, 'skipped'); assert.equal(r.demolitionFrame().active, false);
  const props = r.propInstances(p.x, p.y);
  assert.equal(props.filter(p => p.id === 'source-outskirt-elevation').length, 1);
  assert.equal(props.some(p => p.sourceStructure?.startsWith('source-demolition')), false);
  assert.equal(r.localLights().some(l => l.id.startsWith('source-demolition:work-')), false);
});

test('the early work lights append to the existing room seam rather than replacing the light behind the player',()=>{
 const normal=fixture(),baseline=fixture();normal.tick();baseline.tick({demolitionAssetsReady:false});
 assert.deepEqual(normal.runtime.localLights(),baseline.runtime.localLights(),'opening the white aperture does not leak the new practicals into the room');
 normal.walk(5);baseline.walk(5,{demolitionAssetsReady:false});
 const old=baseline.runtime.localLights(),withOmen=normal.runtime.localLights();
 assert.ok(old.some(l=>l.id==='source-landing:getin-grey-door-seam'&&l.intensity>0));
 assert.deepEqual(withOmen.filter(l=>!l.id.startsWith('source-demolition:work-')),old);
 assert.equal(withOmen.filter(l=>l.id.startsWith('source-demolition:work-')).length,2);
});
