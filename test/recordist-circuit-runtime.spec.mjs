import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceSpaceRuntime } from '../src/game/source-space-runtime.js';
import { buildBellsGodPreset } from '../src/game/chunk-surf-god.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { TOWER_PERSONAL_JOURNEY as PLAN, towerPersonalWorld } from '../src/data/tower-personal-journey.js';
import { COASTAL_MEMORY_LAYOUT } from '../src/data/coastal-memory.js';
import { towerPersonalWorldPieces } from '../src/render/tower-personal-worlds.js';
import { towerPersonalPiecePresent } from '../src/game/tower-personal-visibility.js';
import { runtimeTree } from '../src/narrative/runtime-content.js';

const back = { x: 12, y: -4300, facing: .37, yaw: .581, pitch: -.12 };
function make() {
  const rt = createSourceSpaceRuntime({ initialState: buildBellsGodPreset(440, { seed: 4417 }).state });
  rt.enterTowerLand('school-hall', { returnPose: back });
  return rt;
}
function world(rt, point) {
  const frame = rt.towerLandFrame(), origin = rt.state().landscapeOrigin;
  return { x: origin.x + frame.placement.across + point.x / CELL,
    y: origin.y + frame.placement.along + point.z / CELL, yaw: point.yaw ?? .2, pitch: point.pitch ?? -.1 };
}
function cross(rt, id) {
  const door = towerPersonalWorld(rt.towerLandState()).doors.find(d => d.id === id);
  assert.ok(door, id);
  const from = world(rt, { x: door.center.x - door.normal.x, z: door.center.z - door.normal.z });
  const to = world(rt, { x: door.center.x + door.normal.x * .45, z: door.center.z + door.normal.z * .45 });
  rt.setPlayerPosition(from);
  assert.equal(rt.geometry.canStep(from.x, from.y, to.x, to.y).ok, true, `${rt.towerLandState()} ${id} physical aperture`);
  return rt.onStep(from, to);
}
function reachReturn() {
  const rt = make();
  for (const expected of ['tape-field', 'dead-broadcast', 'ash-room']) {
    assert.equal(cross(rt, 'onward').event, 'personal-transition');
    assert.equal(rt.towerLandState(), expected);
  }
  rt.setPlayerPosition(world(rt, { x: PLAN.recordist.x, z: PLAN.recordist.z + 3.5 }));
  for (let t = 0; t < 9.1; t += .1) rt.tickTowerLand(.1, { recorderHeld: true, audibleSeconds: .1, recordingOffset: t % 14 });
  assert.equal(rt.towerLandFrame().recordingHeard, true);
  cross(rt, 'onward');
  assert.equal(rt.towerLandState(), 'return-hall');
  return rt;
}

test('legacy crossings own destination ground and reload migrates atomically to coastal memory', () => {
  const rt = make();
  assert.equal(rt.leaveTowerLand(), null, 'entry commits before the original exit becomes available');
  const loop = cross(rt, 'entrance');
  assert.equal(loop.event, 'personal-transition');
  assert.equal(rt.towerLandState(), 'school-hall');
  assert.deepEqual(rt.towerLandFrame().returnPose, back);
  for (const stage of ['tape-field', 'dead-broadcast', 'ash-room']) {
    const event = cross(rt, 'onward');
    assert.equal(event.event, 'personal-transition');
    assert.equal(rt.towerLandState(), stage);
    const saved = JSON.parse(JSON.stringify(rt.state())), pose = rt.towerLandFrame().pose;
    assert.ok(rt.geometry.cellAt(pose.x, pose.y), `${stage} arrival support`);
    assert.equal(rt.sourceObjective().label, '');
    const resumed = createSourceSpaceRuntime({ initialState: saved }), coast = resumed.coastalMemoryState();
    assert.equal(resumed.towerLandState(), null, 'the retired active pocket cannot resume over the new visit');
    assert.equal(coast.active, true);
    assert.deepEqual(coast.pose, COASTAL_MEMORY_LAYOUT.spawn);
    assert.deepEqual(coast.returnPose, back, 'migration loses the exact borrowed Source pose');
    assert.deepEqual(resumed.state().station.personal, { ...saved.station.personal, active: false },
      'migration rewrites earned legacy stage or recording evidence');
    const reloaded = createSourceSpaceRuntime({ initialState: JSON.parse(JSON.stringify(resumed.state())) });
    assert.deepEqual(reloaded.coastalMemoryState(), coast, 'a second reload restarted the new visit');
  }
  cross(rt, 'back');
  assert.equal(rt.towerLandState(), 'dead-broadcast');
  cross(rt, 'onward');
  assert.equal(rt.towerLandState(), 'ash-room');
});

test('authored routes remain physically supported and furniture never blocks the main aisle', () => {
  const rt = make();
  for (const stage of ['school-hall', 'tape-field', 'dead-broadcast', 'ash-room']) {
    assert.equal(rt.towerLandState(), stage);
    const points = towerPersonalWorld(stage).route;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const count = Math.ceil(Math.hypot(bx - ax, bz - az) / .4);
      for (let step = 0; step < count; step++) {
        const t = step / count, u = (step + 1) / count;
        const a = world(rt, { x: ax + (bx - ax) * t, z: az + (bz - az) * t });
        const b = world(rt, { x: ax + (bx - ax) * u, z: az + (bz - az) * u });
        assert.equal(rt.geometry.canStep(a.x, a.y, b.x, b.y).ok, true, `${stage} route ${i} at ${t}`);
      }
    }
    if (stage !== 'ash-room') cross(rt, 'onward');
  }
});

test('collapse removes the same furniture from rendering, collision and inspection in every motion mode', () => {
  const rt = reachReturn();
  const chair = towerPersonalWorldPieces('return-hall').find(p => p.solid && p.id.includes('chairs'));
  assert.ok(chair);
  const at = world(rt, { x: chair.localX, z: chair.localZ });
  assert.equal(rt.geometry.canStep(at.x, at.y, at.x, at.y).ok, false, 'chair initially occupies its footprint');
  rt.setPlayerPosition(world(rt, { x: PLAN.boy.x, z: PLAN.boy.z + 2.5 }));
  for (let t = 0; t < 12; t += .1) rt.tickTowerLand(.1);
  assert.equal(rt.towerLandFrame().collapse, 1);
  const normal = rt.propInstances(undefined, undefined, { time: 15, reducedMotion: false }).filter(p => p.sourceStructure === 'tower-land');
  const reduced = rt.propInstances(undefined, undefined, { time: 15, reducedMotion: true }).filter(p => p.sourceStructure === 'tower-land');
  assert.deepEqual(normal.map(p => p.id), reduced.map(p => p.id));
  assert.ok(!normal.some(p => p.id === chair.id));
  assert.equal(rt.geometry.canStep(at.x, at.y, at.x, at.y).ok, true, 'vanished chair cannot block the body');
  assert.ok(!rt.towerLandSpots().some(p => p.id === chair.id), 'vanished chair cannot be inspected');
  assert.ok(normal.some(p => p.id.includes('return') || p.id.includes('exit')), 'the real exit remains');
  for (let t = 0; t < 60; t += .25) rt.tickTowerLand(.25);
  const result = cross(rt, 'road-exit');
  assert.equal(result.event, 'personal-exit');
  assert.deepEqual(Object.fromEntries(Object.keys(back).map(k => [k, result.position[k]])), back);
  assert.equal(rt.state().station.personal.rewardEarned, true);
  assert.equal(rt.consumeTowerPersonalReward(), true);
  assert.equal(rt.consumeTowerPersonalReward(), false);
});

test('dissolution is deterministic and permanent floor or exit pieces never disappear', () => {
  const scene = { stage: 'return-hall', collapse: .5, seed: 4417 };
  const piece = { id: 'chair' };
  assert.equal(towerPersonalPiecePresent(piece, scene), towerPersonalPiecePresent(piece, { ...scene }));
  assert.equal(towerPersonalPiecePresent(piece, { ...scene, collapse: 1 }), false);
  assert.equal(towerPersonalPiecePresent({ ...piece, permanent: true }, { ...scene, collapse: 1 }), true);
  assert.equal(towerPersonalPiecePresent(piece, { ...scene, stage: 'ash-room', collapse: 1 }), true);
});


test('every inspectable circuit prop resolves authored prose, including backtracking doors', () => {
  const tree = runtimeTree('source-space.door-field');
  for (const stage of ['school-hall', 'tape-field', 'dead-broadcast', 'ash-room', 'return-hall']) {
    for (const piece of towerPersonalWorldPieces(stage).filter(p => p.look)) {
      assert.ok(tree[piece.look]?.lines?.length, `${stage}: ${piece.id} -> ${piece.look}`);
    }
  }
});


test('exterior ground stays visible beyond low route banks without granting walkable support', () => {
  const rt = make();
  cross(rt, 'onward');
  for (const stage of ['tape-field', 'dead-broadcast']) {
    assert.equal(rt.towerLandState(), stage);
    const outside = world(rt, { x: 80, z: -40 });
    assert.equal(rt.geometry.cellAt(outside.x, outside.y), null);
    assert.equal(rt.geometry.canStep(outside.x, outside.y, outside.x, outside.y).ok, false);
    const visible = rt.geometry.renderCellAt(outside.x, outside.y);
    assert.ok(visible && !visible.solid, 'the renderer sees open ground instead of an infinite wall');
    assert.equal(visible.floor, rt.geometry.renderCellAt(rt.towerLandFrame().pose.x, rt.towerLandFrame().pose.y).floor);
    if (stage === 'tape-field') cross(rt, 'onward');
  }
});
