import test from 'node:test';
import assert from 'node:assert/strict';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import { CELL, F } from '../src/data/floorplan/legend.js';
import { buildSourceFalseReturnLayout, buildSourceFalseReturnPracticeLayout } from '../src/game/source-false-return-layout.js';
import { MAIN_STAIR_GEOMETRY as STAIR } from '../src/data/main-stair-geometry.js';
import { freshSourceFalseReturn, stepSourceFalseReturn, sourceFalseReturnDoorFraction } from '../src/game/source-false-return.js';

FP.compile(conservatory.levels, conservatory);
PROPS.propsInit(FP);
const source = FP.physicalRenderPlanFor(149, 137);
const originalProps = PROPS.renderInstances({ inscriptions: false });
const build = options => buildSourceFalseReturnLayout({ floorplan: FP, props: originalProps, propSources: PROPS.allProps(), ...options });
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const key = (x, z) => `${Math.round(x * 4)},${Math.round(z * 4)}`;

function pathTo(layout, state, goal) {
  const nodes = [{ x: state.x, z: state.z, parent: -1 }], seen = new Set([key(state.x, state.z)]);
  for (let i = 0; i < nodes.length; i++) {
    const p = nodes[i];
    if (goal(p)) {
      const path = [];
      for (let j = i; nodes[j].parent >= 0; j = nodes[j].parent) path.push(nodes[j]);
      return path.reverse();
    }
    for (const [dx, dz] of [[.25, 0], [-.25, 0], [0, .25], [0, -.25]]) {
      const x = p.x + dx, z = p.z + dz, id = key(x, z);
      if (seen.has(id) || !layout.canOccupy(x, z, state)) continue;
      seen.add(id); nodes.push({ x, z, parent: i });
    }
  }
  assert.fail(`No route from ${state.x},${state.z}`);
}
function walkPath(layout, state, path) {
  for (const target of path) {
    const dx = target.x - state.x, dz = target.z - state.z, distance = Math.hypot(dx, dz);
    const result = stepSourceFalseReturn(state, { dt: distance / 3, forward: 1, look: { yaw: Math.atan2(dx, -dz) } }, layout);
    state = result.state;
    near(state.x, target.x, 1e-5); near(state.z, target.z, 1e-5);
  }
  return state;
}

test('layout copies the actual practice raster and physical door schedule without changing Ellery', () => {
  const realDoors = FP.saveDoorState(), bytes = source.rgba.slice(), materials = source.material.slice();
  const layout = build();
  assert.deepEqual(layout.spawn, { x: 75, z: 58.75, feet: 4.8, yaw: -Math.PI / 2, pitch: 0 });
  assert.ok(layout.doors.filter(d => d.counted).length > 40);
  assert.ok(layout.doors.every(d => d.counted === !d.entry));
  assert.deepEqual(layout.doors.filter(d => d.openInitial).map(d => d.id), ['practice-side']);
  for (const id of ['practice-west-1', 'practice-east-1', 'practice-west-2', 'practice-east-2', 'practice-west-3', 'front-main', 'foh-office', 'academic-theory'])
    assert.equal(layout.doors.find(d => d.id === id)?.counted, true, id);
  for (const d of layout.doors) {
    const real = FP.doorState().find(p => p.id === d.id), at = FP.logicalToPhysical(real.cx, real.cy);
    near(d.x, at.x * CELL); near(d.z, at.z * CELL); near(d.feet, at.y);
    assert.equal(d.mesh, real.mesh); assert.equal(d.frameMesh, real.frameMesh); assert.equal(d.headMesh, real.headMesh);
    assert.equal(d.swing, real.swing); assert.deepEqual(d.leaf, real.leaf); assert.deepEqual(d.aperture, real.aperture);
    assert.notStrictEqual(d.activeLeaves, real.activeLeaves); assert.deepEqual(d.roomSide, d.normal);
  }
  assert.deepEqual(layout.doors.find(d => d.id === 'practice-west-1').normal, { x: -1, z: 0 });
  assert.deepEqual(layout.doors.find(d => d.id === 'practice-east-2').roomBounds,
    { minX: 64, maxX: 76, minZ: 54.5, maxZ: 60.5 });
  assert.equal(layout.lightingContext.zone, 6); assert.equal(layout.lightingContext.group, 'upper');
  assert.deepEqual(FP.saveDoorState(), realDoors); assert.deepEqual(source.rgba, bytes); assert.deepEqual(source.material, materials);
});

test('collision and rendering read the same detached crop, with visible seals at real-world exits', () => {
  const layout = buildSourceFalseReturnPracticeLayout({ floorplan: FP, props: originalProps }), p = layout.plan;
  let copiedAir = 0;
  for (let z = 0; z < p.h; z++) for (let x = 0; x < p.w; x++) {
    const i = z * p.w + x, offset = i * 4, xm = (p.originX + x + .5) * CELL, zm = (p.originY + z + .5) * CELL;
    assert.equal(p.rgba[offset + 2] & (F.CLOSED | F.DOOR), 0);
    const support = layout.supportAt(xm, zm);
    if (p.rgba[offset + 2] & F.SOLID) { assert.equal(support, null); continue; }
    const si = (p.originY + z - source.originY) * source.w + p.originX + x - source.originX;
    assert.equal(p.rgba[offset], source.rgba[si * 4]); assert.equal(p.rgba[offset + 1], source.rgba[si * 4 + 1]);
    assert.equal(p.rgba[offset + 3], source.rgba[si * 4 + 3]); assert.equal(p.material[i], source.material[si]);
    near(support.floor, FP.decodeH(p.rgba[offset])); near(support.ceil, FP.decodeH(p.rgba[offset + 1])); copiedAir++;
  }
  assert.ok(copiedAir > 2000);
  for (const [x, z] of [[61, 43], [100.25, 45.75], [92.75, 50], [101.5, 46], [60, 41.5]]) {
    assert.equal(layout.supportAt(x, z), null, `real exit ${x},${z} is locally sealed`);
    assert.equal(layout.canOccupy(x, z), false);
  }
  assert.equal(layout.supportAt(61.5, 44.5)?.floor, 4.800000000000001);
  const corridor = layout.supportAt(61.5, 56.75); assert.ok(corridor);
  assert.equal(layout.canOccupy(59.9, 55.25, { feet: 4.8 }), false, 'body corner cannot clip the actual room wall');
  assert.equal(layout.canOccupy(61.5, 56.75, { feet: 5.5 }), false, 'wrong-height state cannot enter this floor');
});

test('the five real doors can be reached and opened with production movement, then a real threshold returns to Source', () => {
  const layout = build(); let state = freshSourceFalseReturn({ runId: 'layout-route', spawn: layout.spawn });
  state = stepSourceFalseReturn(state, { dt: 0 }, layout).state;
  // East 2 is the room through which the actual practice-side arrival enters.
  for (const id of ['practice-east-2', 'practice-west-1', 'practice-east-1', 'practice-west-2', 'practice-west-3']) {
    const d = layout.doors.find(d => d.id === id);
    const approach = { x: d.x + d.normal.x * (id === 'practice-east-2' ? .75 : -.75), z: d.z };
    const path = pathTo(layout, state, p => Math.abs(p.x - approach.x) < .02 && Math.abs(p.z - approach.z) < .02);
    state = walkPath(layout, state, path);
    const dx = d.x - state.x, dz = d.z - state.z;
    state = stepSourceFalseReturn(state, { dt: .8, interact: true, look: { yaw: Math.atan2(dx, -dz) } }, layout).state;
    assert.equal(sourceFalseReturnDoorFraction(state, id), 1); assert.ok(state.opened.includes(id));
    assert.equal(state.status, 'active', 'opening is separate from crossing');
  }
  const fifth = layout.doors.find(d => d.id === 'practice-west-3');
  state = walkPath(layout, state, pathTo(layout, state, p => Math.abs(p.x - fifth.x - .75) < .02 && Math.abs(p.z - fifth.z) < .02));
  const result = stepSourceFalseReturn(state, { dt: .5, forward: 1, look: { yaw: -Math.PI / 2 } }, layout);
  assert.equal(result.state.status, 'completed'); assert.equal(result.state.exitReceipt.doorId, fifth.id);
  assert.equal(result.events.filter(e => e.type === 'complete').length, 1);
});

test('both local loops are reachable before blocked real-world exits, and every room remains bounded', () => {
  const layout = build(), state = { feet: 4.8, x: layout.spawn.x, z: layout.spawn.z,
    doorOpen: Object.fromEntries(layout.doors.map(d => [d.id, true])) };
  for (const loop of layout.loops.filter(l => l.id === 'false-ellery-entry' || l.id === 'false-ellery-chapel')) {
    const route = pathTo(layout, state, p => p.x >= loop.bounds.minX && p.x <= loop.bounds.maxX
      && p.z >= loop.bounds.minZ && p.z <= loop.bounds.maxZ);
    assert.ok(route.length > 0); assert.ok(layout.canOccupy(route.at(-1).x, route.at(-1).z, state));
    assert.deepEqual(loop.arrival, layout.spawn);
  }
  const entry = layout.loops.find(l => l.id.includes('entry'));
  assert.equal(entry.sourceAfterFifth, true); assert.ok(entry.bounds.maxX < layout.doors.find(d => d.entry).x);
  const chapel = layout.loops.find(l => l.id.includes('chapel'));
  assert.ok(chapel.bounds.maxZ < layout.doors.find(d => d.id === 'chapel-c17').z);
  assert.equal(layout.canOccupy(52.5, 49, state), false, 'the retained piano blocks its actual rendered position');
  const closed = { feet: 4.8, doorOpen: { 'practice-east-2': false } };
  near(layout.supportAt(63.25, 56.75)?.floor, 4.8);
  assert.equal(layout.canOccupy(63.25, 56.75, closed), false, 'local leaf owns the aperture collision');
  assert.equal(layout.canOccupy(63.25, 56.75, { ...closed, doorOpen: { 'practice-east-2': true } }), true);
});

test('arrays, render transforms, lights and door metadata are detached, and no mutator is required', () => {
  const matrix = new Float32Array(16).fill(1), nested = { tones: ['A', 'B'] };
  const prop = { id: 'copy-proof', mesh: 'music_stand', x: 61, z: 58, y: 4.8, matrix, nested };
  const light = { id: 'copy-light', x: 61, z: 58, y: 7, color: [.7, .6, .4], metadata: { circuit: ['practice'] } };
  const readonly = { physicalRenderPlanFor: FP.physicalRenderPlanFor, doorState: FP.doorState, logicalToPhysical: FP.logicalToPhysical,
    floorplan: FP.floorplan, physicalSpanData: FP.physicalSpanData };
  const layout = buildSourceFalseReturnLayout({ floorplan: readonly, props: [prop], lights: [light] });
  for (const field of ['rgba', 'material', 'ambient']) {
    assert.notStrictEqual(layout.plan[field].buffer, source[field].buffer);
  }
  layout.props[0].matrix[0] = 7; layout.props[0].nested.tones.push('C');
  layout.lights[0].color[0] = 0; layout.lights[0].metadata.circuit.push('other');
  assert.equal(matrix[0], 1); assert.deepEqual(nested.tones, ['A', 'B']);
  assert.deepEqual(light.color, [.7, .6, .4]); assert.deepEqual(light.metadata.circuit, ['practice']);
  const second = build();
  layout.doors[0].leaf.width = 100; layout.doors[0].activeLeaves.push(9);
  assert.notEqual(second.doors[0].leaf.width, 100); assert.ok(!second.doors[0].activeLeaves.includes(9));
  assert.equal(second.props.some(p => p.id === 'practice-piano-4'), true);
  assert.equal(second.props.some(p => p.id === 'main-open-well-stair'), true);
  assert.equal(second.props.some(p => p.id === 'opening-street-ground'), false);
  assert.equal(second.props.some(p => p.id === 'pub-service-tray'), false);
});

test('whole floorset resolves stacked storeys and copies the actual slice, props and lighting for each observer', () => {
  const contexts = [], layout = build({ lights: context => {
    contexts.push(structuredClone(context));
    return [{ id: `light:${context.group}`, x: context.origin.x, z: context.origin.z, y: context.feet + 2, color: [.6, .5, .4] }];
  } });
  const examples = new Map();
  for (const [key, spans] of FP.physicalSpanData().cells) for (const s of spans) {
    if (s.logicalX < 0 || !['ground', 'basement', 'upper', 'academic', 'hall', 'tower'].includes(s.renderGroup)
      || s.ceil - s.floor < 1.8 || s.spaceId === 'main_stair' || examples.has(s.renderGroup)) continue;
    const [cx, cz] = key.split(',').map(Number), x = (cx + .5) * CELL, z = (cz + .5) * CELL;
    if (!layout.supportAt(x, z, { feet: s.floor })) continue;
    examples.set(s.renderGroup, { x, z, feet: s.floor, logicalX: s.logicalX, logicalY: s.logicalY });
  }
  assert.equal(examples.size, 6);
  for (const [group, state] of examples) {
    const before = FP.physicalRenderPlanFor(state.logicalX, state.logicalY), bytes = before.rgba.slice();
    const view = layout.planFor(state);
    assert.equal(view.observer.group, group); near(view.observer.floor, state.feet);
    assert.equal(view.plan.key, before.key); assert.equal(view.lightingContext.group, group);
    assert.notStrictEqual(view.plan.rgba.buffer, before.rgba.buffer);
    for (let i = 0; i < view.plan.w * view.plan.h; i++) {
      assert.equal(view.plan.rgba[i * 4], before.rgba[i * 4]); assert.equal(view.plan.rgba[i * 4 + 1], before.rgba[i * 4 + 1]);
      assert.equal(view.plan.rgba[i * 4 + 2], before.rgba[i * 4 + 2] & ~(F.DOOR | F.CLOSED));
    }
    assert.ok(view.props.length > 0); assert.equal(view.lights[0].id, `light:${group}`);
    assert.deepEqual(before.rgba, bytes);
  }
  assert.ok(contexts.length >= 7);
  let stacked = 0;
  for (const [key, spans] of FP.physicalSpanData().cells) {
    const [cx, cz] = key.split(',').map(Number), x = (cx + .5) * CELL, z = (cz + .5) * CELL;
    const lower = spans.find(s => s.renderGroup === 'ground'), upper = spans.find(s => s.renderGroup === 'academic');
    if (!lower || !upper) continue;
    const low = layout.supportAt(x, z, { feet: lower.floor }), high = layout.supportAt(x, z, { feet: upper.floor });
    if (!low || !high) continue;
    near(low.floor, lower.floor); near(high.floor, upper.floor); assert.ok(high.floor - low.floor > 8); stacked++;
  }
  assert.ok(stacked > 100, 'the same physical XZ retains distinct actual ground and academic floors');
});

test('all four canonical main stair flights support continuous physical movement with no invented upper ground plane', () => {
  const layout = build(); let sampled = 0;
  for (const flight of STAIR.flights) {
    let feet = flight.fromH, moving = null;
    for (let k = 1; k < flight.rises * 4; k++) {
      const p = k / (flight.rises * 4), angle = flight.theta0 + flight.sweep * p;
      const x = STAIR.center.x + Math.sin(angle) * 1.75, z = STAIR.center.z - Math.cos(angle) * 1.75;
      const support = layout.supportAt(x, z, { feet }); assert.ok(support, `${flight.id} sample ${k}`);
      const expected = flight.fromH + (flight.toH - flight.fromH) * Math.floor(p * flight.rises + 1e-7) / flight.rises;
      near(support.floor, expected); assert.equal(layout.canOccupy(x, z, { feet: support.floor }), true, `${flight.id} sample ${k}`);
      if (!moving) moving = freshSourceFalseReturn({ runId: flight.id, spawn: { x, z, feet: support.floor, yaw: 0, pitch: 0 } });
      else {
        const dx = x - moving.x, dz = z - moving.z;
        moving = stepSourceFalseReturn(moving, { dt: Math.hypot(dx, dz) / 3, forward: 1,
          look: { yaw: Math.atan2(dx, -dz) } }, layout).state;
        near(moving.x, x, 1e-5); near(moving.z, z, 1e-5); near(moving.feet, expected);
      }
      const view = layout.planFor({ x, z, feet: support.floor });
      assert.equal(view.observer.spaceId, 'main_stair'); assert.ok(view.props.some(prop => prop.id === 'main-open-well-stair'));
      feet = support.floor; sampled++;
    }
  }
  assert.ok(sampled > 200);
  assert.equal(layout.supportAt(STAIR.center.x, STAIR.center.z, { feet: 4.8 }), null, 'upper well is empty, not a floor');
  assert.equal(layout.supportAt(STAIR.center.x, STAIR.center.z, { feet: 10 }), null, 'academic well remains empty');
});

test('an open Source-bound outside throat admits body corners only after five openings', () => {
  const layout = build(), d = layout.doors.find(d => d.id === 'front-main');
  const before = { feet: d.feet, doorOpen: { [d.id]: true }, opened: [] };
  const after = { ...before, opened: layout.doors.filter(d => d.counted).slice(0, 5).map(d => d.id) };
  assert.equal(layout.supportAt(d.x, d.z - .3, before), null);
  assert.equal(layout.supportAt(d.x, d.z - .3, after)?.sourceThroat, d.id);
  assert.equal(layout.canOccupy(d.x, d.z + .05, after), true);
  assert.equal(layout.supportAt(d.x, d.z - .3, { ...after, doorOpen: { [d.id]: false } }), null);
  assert.ok(layout.loops.filter(loop => loop.sourceAfterFifth).every(loop => loop.beforeCount === 5));
  assert.ok(!layout.supportAt(-20, -20, { feet: 0 }), 'street cannot become an ordinary walkable destination');
});

test('real paired assemblies retain fixed-leaf collision, active opening width, and one assembly count', () => {
  const layout = build(), d = layout.doors.find(d => d.id === 'chapel-c17');
  assert.equal(d.leafCount, 2); assert.deepEqual(d.activeLeaves, [1]);
  const along = width => ({ x: d.x + Math.cos(d.yaw) * width, z: d.z + Math.sin(d.yaw) * width });
  const positive = along(d.halfWidth / 2), negative = along(-d.halfWidth / 2);
  const open = { feet: d.feet, doorOpen: { [d.id]: true } };
  assert.ok(layout.supportAt(negative.x, negative.z, open), 'the floor continues under the fixed physical leaf');
  assert.equal(layout.canOccupy(negative.x, negative.z, open), false, 'fixed leaf remains physical after active leaf opens');
  assert.equal(layout.canOccupy(positive.x, positive.z, open), true, 'active half admits a full body');
  assert.equal(layout.canOccupy(d.x, d.z, open), false, 'body cannot straddle a fixed-leaf seam');
  const revealed = { ...open, opened: layout.doors.filter(door => door.counted).slice(0, 5).map(door => door.id) };
  assert.equal(layout.supportAt(negative.x, negative.z, revealed)?.sourceThroat, undefined);
  assert.equal(layout.supportAt(positive.x, positive.z, revealed)?.sourceThroat, d.id);
  // Corner queries already represent points at the body edge. An extra radius
  // here would shrink the active half twice and reject this otherwise safe body.
  const nearSeam = along(.25);
  assert.equal(layout.canOccupy(nearSeam.x, nearSeam.z, revealed), true);
  let state = freshSourceFalseReturn({ runId: 'actual-paired-door', spawn: {
    x: positive.x, z: d.z - .75, feet: d.feet, yaw: Math.PI, pitch: 0 } });
  state = stepSourceFalseReturn(state, { dt: .8, interact: true }, layout).state;
  assert.deepEqual(state.opened, ['chapel-c17']);
  state = stepSourceFalseReturn(state, { dt: .8, interact: true }, layout).state;
  state = stepSourceFalseReturn(state, { dt: .8, interact: true }, layout).state;
  assert.deepEqual(state.opened, ['chapel-c17'], 'a pair and repeated use remain one distinct assembly');
  const single = layout.doors.find(door => door.id === 'practice-east-2');
  assert.equal(layout.canOccupy(single.x, single.z + .5, { feet: single.feet, doorOpen: { [single.id]: true } }), false,
    'open single door jamb matches the visible aperture, even where its half-metre raster is wider');
});

test('the live west-3 Source approach crosses its raster wall depth without a sideways detour', () => {
  const hostProps = PROPS.renderInstances({ inscriptions: true }), layout = build({ props: hostProps });
  const d = layout.doors.find(door => door.id === 'practice-west-3');
  near(d.x, 59.25); near(d.z, 63.75);
  const opened = ['practice-east-2', 'upper-bridge-west', 'practice-west-1', 'practice-east-1', 'practice-west-3'];
  let state = freshSourceFalseReturn({ runId: 'live-west-3-raster-gap', spawn: {
    x: 60.24, z: 63.69, feet: d.feet, yaw: -Math.PI / 2, pitch: 0 } });
  state.opened = [...opened];
  state.doorOpen = Object.fromEntries(layout.doors.map(door => [door.id, door.id !== 'practice-west-2']));
  // The live trace stopped at x60.22. At the next step x60.20 the NW body
  // corner is (59.98,63.47), inside the visible aperture but north of its
  // half-metre raster opening. The old .55m Source throat did not reach it.
  for (let x = 60.24; x >= 59.30; x -= .02) {
    assert.equal(layout.canOccupy(x, 63.69, state), true, `continuous approach at x${x}`);
  }
  const result = stepSourceFalseReturn(state, { dt: .4, forward: 1 }, layout);
  assert.equal(result.state.status, 'completed');
  assert.equal(result.state.exitReceipt.doorId, d.id);
  near(result.state.z, 63.69); assert.equal(result.events.filter(e => e.type === 'complete').length, 1);
  for (const z of [d.z - .29, d.z + .29]) {
    assert.equal(layout.canOccupy(d.x + .1, z, state), false, `visible jamb remains solid at z${z}`);
  }
  assert.equal(layout.canOccupy(60.20, 63.69, { ...state, opened: opened.slice(0, 4) }), false,
    'the ordinary raster remains authoritative before Source replaces the opening');
  assert.equal(layout.canOccupy(60.20, 63.69, { ...state, doorOpen: { ...state.doorOpen, [d.id]: false } }), false,
    'a closed leaf does not acquire Source floor support');
  const obstruction = { id: 'mouth-blocking-proof', mesh: 'upright_piano', x: 60, z: 63.69, y: d.feet,
    yaw: 0, scale: 1, zone: 6, blocks: true, w: .3, d: .3 };
  const obstructed = build({ props: [...hostProps, obstruction] });
  assert.equal(obstructed.canOccupy(60.20, 63.69, state), false, 'Source support still checks prop collision');
});
