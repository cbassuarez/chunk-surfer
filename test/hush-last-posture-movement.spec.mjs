import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { HUSH_POSTURE_ASSET_SHA256, HUSH_POSTURE_NATIVE_HEIGHT_M } from '../src/data/generated/hush-last-posture-support.js';
import { hushDoorPosture } from '../src/game/hush-clearance.js';
import { conservatory } from '../src/data/floorplan/conservatory.js';
import * as FP from '../src/world/floorplan.js';
import { pressureInstances } from '../src/render/pressure-volume.js';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { createPressurePerformance } from '../src/game/pressure-performance.js';
import { stepPressureGait } from '../src/game/pressure-gait.js';
import { HUSH_DENSITY_LIMITS as LIMITS, HUSH_POSTURE_LEGS, freshHushDensityPose,
  normalizeHushDensityPose, stepHushDensityPose, hushDensityCharacter, hushDensityContactWeight } from '../src/game/hush-density-performance.js';

const json = value => JSON.parse(JSON.stringify(value));
const bytes = readFileSync(process.env.HUSH_POSTURE_TEST_ASSET || new URL('../public/assets/hush-density.glb', import.meta.url));
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const body = asset.entries.find(e => e.name === 'hush_density_volume');
const reference = sampleCharacterPose(asset, body, { clip: 'pressure_hold', time: 0 });
function deform(primitive, vertex, pose) {
  const p = Array.from(primitive.positions.subarray(vertex * 3, vertex * 3 + 3)), out = [0, 0, 0];
  for (let j = 0; j < 4; j++) {
    const at = primitive.joints[vertex * 4 + j] * 16, w = primitive.weights[vertex * 4 + j];
    for (let k = 0; k < 3; k++) out[k] += (pose.bones[at + k] * p[0] + pose.bones[at + 4 + k] * p[1]
      + pose.bones[at + 8 + k] * p[2] + pose.bones[at + 12 + k]) * w;
  }
  return out;
}
const rotate = (p, yaw) => [Math.cos(yaw) * p[0] - Math.sin(yaw) * p[2], p[1], Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const soles = {};
for (const side of ['L', 'R']) {
  const joints = new Set(body.skin.joints.flatMap((node, i) => new RegExp(`^(?:foot|toe)_${side}$`).test(asset.nodes[node].name) ? [i] : []));
  const candidates = [];
  for (const primitive of body.primitives) for (let vertex = 0; vertex < primitive.vertexCount; vertex++) {
    let weight = 0; for (let j = 0; j < 4; j++) if (joints.has(primitive.joints[vertex * 4 + j])) weight += primitive.weights[vertex * 4 + j];
    if (weight > .99) candidates.push({ primitive, vertex, p: deform(primitive, vertex, reference) });
  }
  const low = Math.min(...candidates.map(c => c.p[1]));
  soles[side] = candidates.filter(c => c.p[1] < low + .006);
}

test('the production rig provides real anatomical feet for the bounded runtime reach contract', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), HUSH_POSTURE_ASSET_SHA256);
  assert.ok(asset.nodes.some(n => n.name === 'head'));
  assert.equal(asset.nodes.some(n => /^fold_/.test(n.name || '')), false);
  for (const side of ['L', 'R']) {
    assert.ok(soles[side].length > 20, `missing actual weighted ${side} sole`);
    const jointPosition = name => {
      let node = asset.nodes.findIndex(n => n.name === name), p = [0, 0, 0];
      assert.ok(node >= 0);
      while (node >= 0) {
        const n = asset.nodes[node];
        assert.deepEqual(n.rotation, [0, 0, 0, 1], 'support contract needs explicit identity joint axes');
        assert.deepEqual(n.scale, [1, 1, 1]); assert.equal(n.matrix, null);
        p = p.map((v, k) => v + n.translation[k]); node = n.parent;
      }
      return p;
    };
    const hip = jointPosition(`thigh_${side}`), knee = jointPosition(`shin_${side}`), ankle = jointPosition(`foot_${side}`);
    assert.ok(distance(hip, HUSH_POSTURE_LEGS[side].hip) < .00001, 'runtime hip contract differs from actual rig construction');
    assert.ok(distance(ankle, HUSH_POSTURE_LEGS[side].ankle) < .00001, 'runtime ankle contract differs from actual rig construction');
    assert.ok(Math.abs(distance(hip, knee) + distance(knee, ankle) - HUSH_POSTURE_LEGS[side].reach) < .00001,
      'runtime leg reach differs from actual rig construction');
  }
});

test('normal accepted travel keeps actual weighted soles fixed through gathering and clearance turns', () => {
  let worst = 0, floorDrift = 0, floorPenetration = 0, checked = 0, gathered = 0;
  for (const speed of [.1, .65, 1.6, 3.1, 3.3]) for (const scale of [1, 1.83 / HUSH_POSTURE_NATIVE_HEIGHT_M]) for (const turning of [false, true]) {
    let d = freshHushDensityPose(73), root = [7, -12], heading = 0, held = {};
    for (let n = 0; n < 500; n++) {
      const dt = .01, h = turning ? Math.sin(n / 240) * .35 : 0;
      const wx = Math.sin(h) * speed * dt, wz = -Math.cos(h) * speed * dt;
      root[0] += wx; root[1] += wz;
      d = stepHushDensityPose(d, { dt, acceptedMetres: speed * dt,
        acceptedDelta: { x: Math.cos(h) * wx + Math.sin(h) * wz, z: -Math.sin(h) * wx + Math.cos(h) * wz },
        headingDelta: h - heading, clearanceM: turning && n > 220 ? .5 : null });
      heading = h;
      assert.equal(d.release, 0);
      const visual = heading + d.clearanceTurn;
      const descriptor = hushDensityCharacter({ density: d }, { scale, presentationHeadingDelta: d.clearanceTurn });
      const before = structuredClone(descriptor), pose = sampleCharacterPose(asset, body, descriptor);
      assert.deepEqual(descriptor, before, 'sampling mutates the saved presentation');
      for (const contact of descriptor.support.contacts) {
        if (!turning) {
          for (const { primitive, vertex } of soles[contact.side]) {
            floorPenetration = Math.max(floorPenetration, -deform(primitive, vertex, pose)[1] * scale);
          }
          if (!contact.planted && contact.offset[1] > .025) gathered++;
        }
        if (!contact.planted) { delete held[contact.side]; continue; }
        checked++;
        const points = soles[contact.side].map(({ primitive, vertex }) => {
          const p = rotate(deform(primitive, vertex, pose).map(v => v * scale), visual);
          return [p[0] + root[0], p[1], p[2] + root[1]];
        });
        const key = d.feet[contact.side].landing;
        if (held[contact.side]?.key === key) for (let v = 0; v < points.length; v++) {
          worst = Math.max(worst, distance(points[v], held[contact.side].points[v]));
          floorDrift = Math.max(floorDrift, Math.abs(points[v][1] - held[contact.side].points[v][1]));
        } else held[contact.side] = { key, points };
      }
    }
  }
  assert.ok(checked > 5000, 'support checks never actually reached grounded parts of the gait');
  assert.ok(worst < .005, `actual supported soles slide ${(worst * 1000).toFixed(2)}mm`);
  assert.ok(floorDrift < .003, `support changes floor height ${(floorDrift * 1000).toFixed(2)}mm`);
  assert.ok(gathered > 100, 'swing check must actually observe lifted free feet');
  assert.ok(floorPenetration < .003, `swing sole penetrates flat floor ${(floorPenetration * 1000).toFixed(2)}mm`);
  console.log(`Last Posture actual weighted soles: ${(worst * 1000).toFixed(3)}mm total drift, ${(floorDrift * 1000).toFixed(3)}mm vertical, ${(floorPenetration * 1000).toFixed(3)}mm floor penetration; ${checked} supported samples.`);
});

test('the anatomical body sweeps through the compiled Ellery practice, service, academic and single-active chapel openings', () => {
  FP.compile(conservatory.levels, conservatory);
  const ids = ['b3-b2-service', 'practice-west-3', 'academic-gallery-lobby', 'chapel-c17'];
  for (const id of ids) FP.setDoorOpen(id, true);
  const doors = FP.doorState().filter(door => ids.includes(door.id));
  assert.equal(doors.length, ids.length);
  let minWidth = Infinity, minHeight = Infinity, minFloor = Infinity, checked = 0;
  for (const door of doors) {
    const centre = FP.logicalPointToPhysical(door.cx, door.cy);
    const yaw = (door.widthAxis === 'x' ? 0 : Math.PI / 2) + FP.arcYawOffset(door.cx, door.cy, centre.x, centre.z);
    const across = [Math.cos(yaw), Math.sin(yaw)];
    const logicalAcross = door.widthAxis === 'x' ? [1, 0] : [0, 1];
    const logicalDepth = [-logicalAcross[1], logicalAcross[0]];
    for (const direction of [-1, 1]) for (const lateral of [0, .25, .50]) {
      const heading = yaw + (direction === 1 ? 0 : Math.PI);
      const driver = createPressurePerformance();
      let point, floorAt, tested = 0;
      for (let distance = 1.95; distance >= -1.95; distance -= .02) {
        point = { x: door.cx - .5 + logicalAcross[0] * lateral / .5 + logicalDepth[0] * distance * direction / .5,
          y: door.cy - .5 + logicalAcross[1] * lateral / .5 + logicalDepth[1] * distance * direction / .5,
          heightM: 2.18 };
        assert.equal(FP.isSolid(point.x, point.y), false, door.id);
        const physical = FP.logicalToPhysical(point.x, point.y);
        assert.ok(Math.abs(physical.y - centre.y) <= .23, door.id);
        const posture = hushDoorPosture({ point, physical, heading, doorAt: FP.doorAt,
          physicalPoint: FP.logicalPointToPhysical, arcYawOffset: FP.arcYawOffset });
        const actor = driver.tick(.02 / .65625, { primary: { ...point, id: door.id, role: 'live-pressure',
          x: physical.x, y: physical.z, floorH: physical.y, heading, motion: 'hunt', doorPosture: posture } }).primary;
        assert.equal(actor.x, physical.x);
        assert.equal(actor.y, physical.z);
        if (!posture || Math.abs(distance) > 1.3) continue;
        const instance = pressureInstances(actor, null)[0];
        assert.equal(instance.scaleX, 1);
        assert.equal(instance.scale, 2.18 / HUSH_POSTURE_NATIVE_HEIGHT_M);
        floorAt = instance.y;
        const pose = sampleCharacterPose(asset, body, instance.character);
        const c = Math.cos(instance.yaw), s = Math.sin(instance.yaw);
        for (const primitive of body.primitives) for (let v = 0; v < primitive.vertexCount; v++) {
          const at = v * 3, x = primitive.positions[at], y = primitive.positions[at + 1], z = primitive.positions[at + 2];
          let lx = 0, ly = 0, lz = 0;
          for (let j = 0; j < 4; j++) {
            const at = v * 4 + j, bone = primitive.joints[at] * 16, weight = primitive.weights[at];
            if (!weight) continue;
            const m = pose.bones;
            lx += weight * (m[bone] * x + m[bone + 4] * y + m[bone + 8] * z + m[bone + 12]);
            ly += weight * (m[bone + 1] * x + m[bone + 5] * y + m[bone + 9] * z + m[bone + 13]);
            lz += weight * (m[bone + 2] * x + m[bone + 6] * y + m[bone + 10] * z + m[bone + 14]);
          }
          const worldX = instance.x - centre.x * .5 + (c * lx - s * lz) * instance.scale;
          const worldZ = instance.z - centre.z * .5 + (s * lx + c * lz) * instance.scale;
          const height = floorAt - centre.y + ly * instance.scale;
          minFloor = Math.min(minFloor, ly * instance.scale);
          const depth = worldX * -across[1] + worldZ * across[0];
          // Full half-metre approach/exit on both sides of the rendered door.
          if (Math.abs(depth) > .53) continue;
          const cross = worldX * across[0] + worldZ * across[1];
          minWidth = Math.min(minWidth, cross - posture.lo, posture.hi - cross);
          minHeight = Math.min(minHeight, posture.height - height);
          tested++;
        }
      }
      assert.ok(tested > 100000, `no meaningful mesh sweep for ${door.id}`);
      checked += tested;
    }
    FP.setDoorOpen(door.id, false);
    const physical = FP.logicalToPhysical(door.cx - .5, door.cy - .5);
    const closed = hushDoorPosture({ point: { x: door.cx - .5, y: door.cy - .5 }, physical, heading: yaw,
      doorAt: FP.doorAt, physicalPoint: FP.logicalPointToPhysical, arcYawOffset: FP.arcYawOffset });
    assert.equal(closed, null);
  }
  assert.ok(minWidth >= .012, `jamb margin ${minWidth.toFixed(4)}m`);
  assert.ok(minHeight >= .004, `lintel margin ${minHeight.toFixed(4)}m`);
  assert.ok(minFloor >= -.003, `doorway stance penetrates its support by ${(-minFloor * 1000).toFixed(2)}mm`);
  console.log(`Last Posture Ellery sweeps: ${checked} in-throat vertex samples, ${(minWidth * 1000).toFixed(2)}mm jamb and ${(minHeight * 1000).toFixed(2)}mm lintel margins.`);
});

test('gathering windows release each foot instead of calling a swinging foot planted', () => {
  assert.equal(hushDensityContactWeight(.20, 'R'), 0);
  assert.equal(hushDensityContactWeight(.70, 'L'), 0);
  assert.equal(hushDensityContactWeight(.50, 'R'), 1);
  assert.equal(hushDensityContactWeight(0, 'L'), 1);
  for (const phase of [.03, .16, .37, .71]) for (const side of ['L', 'R'])
    assert.ok(Math.abs(hushDensityContactWeight(phase, side) - hushDensityContactWeight(phase + 100, side)) < 1e-10);
});

test('accepted floor changes retain real world sole height until that support is honestly released', () => {
  let worst = 0, checked = 0;
  for (const slope of [-.18, .18]) for (const scale of [1, 1.83 / HUSH_POSTURE_NATIVE_HEIGHT_M]) {
    let d = freshHushDensityPose(52), z = 0, floor = 2.4, held = {};
    for (let n = 0; n < 350; n++) {
      const distanceM = .016, rise = distanceM * slope;
      z -= distanceM; floor += rise;
      d = stepHushDensityPose(d, { dt: .01, acceptedMetres: distanceM,
        acceptedDelta: { x: 0, z: -distanceM }, acceptedFloorDelta: rise });
      const descriptor = hushDensityCharacter({ density: d }, { scale }), pose = sampleCharacterPose(asset, body, descriptor);
      for (const contact of descriptor.support.contacts) {
        if (!contact.planted) { delete held[contact.side]; continue; }
        checked++;
        const points = soles[contact.side].map(({ primitive, vertex }) => {
          const p = deform(primitive, vertex, pose).map(v => v * scale);
          return [p[0], floor + p[1], z + p[2]];
        });
        const key = d.feet[contact.side].landing;
        if (held[contact.side]?.key === key) for (let v = 0; v < points.length; v++) worst = Math.max(worst, distance(points[v], held[contact.side].points[v]));
        else held[contact.side] = { key, points };
      }
    }
  }
  assert.ok(checked > 400, 'ramp test never observes actual grounded sole samples');
  assert.ok(worst < .005, `accepted floor changes drag supported real soles ${(worst * 1000).toFixed(2)}mm`);
  console.log(`Last Posture sloped support: ${(worst * 1000).toFixed(3)}mm world drift, ${checked} supported samples.`);
  const airborne = stepHushDensityPose(freshHushDensityPose(52), { dt: .02, acceptedFloorDelta: -.3, unsupported: true });
  const free = hushDensityCharacter({ density: airborne });
  assert.equal(free.support.mode, 'unsupported');
  assert.ok(free.support.contacts.every(c => !c.planted && c.weight === 0));
});

test('actual animated anatomical vertices remain inside the shared colour/depth conservative palette bounds', () => {
  for (const speed of [0, 1.6, 7.8]) {
    let d = freshHushDensityPose(3);
    for (let n = 0; n < 150; n++) {
      d = stepHushDensityPose(d, { dt: .02, acceptedMetres: speed * .02, upcomingClearanceM: n > 40 ? .5 : 1 });
      if (n % 11) continue;
      const pose = sampleCharacterPose(asset, body, hushDensityCharacter({ density: d }, { presentationHeadingDelta: d.clearanceTurn }));
      for (const primitive of body.primitives) for (let v = 0; v < primitive.vertexCount; v += 37) {
        const p = deform(primitive, v, pose);
        for (let k = 0; k < 3; k++) assert.ok(p[k] >= pose.bounds.min[k] - .0001 && p[k] <= pose.bounds.max[k] + .0001,
          `posed vertex outside actual shared bounds: ${speed}m/s, axis${k}`);
      }
    }
  }
});

test('Source sprint releases both real soles shallowly and regrounds once only after actual travel stops', () => {
  let d = freshHushDensityPose(81);
  for (let n = 0; n < 120; n++) d = stepHushDensityPose(d, { dt: .02, acceptedMetres: 7.8 * .02 });
  assert.equal(d.release, 1);
  const fast = hushDensityCharacter({ density: d }), pose = sampleCharacterPose(asset, body, fast);
  assert.equal(fast.support.mode, 'released');
  assert.ok(fast.support.contacts.every(c => !c.planted && c.weight === 1 && c.offset[1] === LIMITS.releasedClearanceM));
  for (const side of ['L', 'R']) for (const sole of soles[side]) {
    const p = deform(sole.primitive, sole.vertex, pose);
    assert.ok(p[1] - sole.p[1] > .05 && p[1] - sole.p[1] < .06, 'released sole is floor-sliding or flailing upwards');
  }
  const phase = d.phase;
  for (let n = 0; n < 500; n++) d = stepHushDensityPose(d, { dt: .02 });
  assert.equal(d.phase, phase); assert.equal(d.release, 0);
  const stopped = hushDensityCharacter({ density: d });
  assert.equal(stopped.clip, 'pressure_hold'); assert.equal(stopped.blend, undefined);
  assert.ok(stopped.support.contacts.every(c => c.planted && c.offset[1] === 0));
  for (let n = 0; n < 500; n++) d = stepHushDensityPose(d, { dt: .02 });
  assert.deepEqual(hushDensityCharacter({ density: d }), stopped);
});

test('the actual navigator completes stationary 90/180-degree sound turns with two bounded foot arcs', () => {
  let worst = 0, checked = 0, minimumSeparation = Infinity;
  for (const bearing of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    let x = 24, y = -14, gait = { phase: 'load', seed: 19, cycle: 0, heading: 0, elapsed: .4, duration: .4 };
    const driver = createPressurePerformance(), cycles = new Set();
    let held = {}, previousCycle = null, finished = false;
    for (let n = 0; n < 2000; n++) {
      const next = stepPressureGait(gait, { dt: .02, x, y,
        targetX: 24 + Math.sin(bearing) * 10, targetY: -14 - Math.cos(bearing) * 10, speed: 2 });
      x = next.x; y = next.y; gait = next.gait;
      const incoming = { id: 'actual-pivot', role: 'live-pressure', x, y, floorH: 4.2, gait, motion: 'hunt' };
      const actor = driver.tick(.02, { primary: incoming }).primary;
      if (gait.phase !== 'advance' || !gait.pivot) {
        if (cycles.size && gait.phase === 'advance') { finished = true; break; }
        continue;
      }
      if (previousCycle !== gait.cycle) { held = {}; previousCycle = gait.cycle; }
      cycles.add(gait.cycle);
      const d = actor.performance.density;
      assert.equal(x, 24); assert.equal(y, -14); assert.equal(d.phase, 0);
      assert.equal(d.pivot, true); assert.equal(d.pivotProgress, gait.progress);
      const descriptor = hushDensityCharacter(actor.performance), pose = sampleCharacterPose(asset, body, descriptor);
      assert.equal(descriptor.clip, 'pressure_hold'); assert.equal(descriptor.blend, undefined);
      assert.equal(descriptor.support.mode, 'pivot');
      const centres = {};
      for (const contact of descriptor.support.contacts) {
        const points = soles[contact.side].map(({ primitive, vertex, p: ref }) => {
          const p = rotate(deform(primitive, vertex, pose), gait.heading);
          assert.ok(p[1] - ref[1] > -.006 && p[1] - ref[1] < .062, 'pivot foot drops through the floor or flails');
          return [p[0] + (x + .5) * .5, p[1] + 4.2, p[2] + (y + .5) * .5];
        });
        centres[contact.side] = points.reduce((out, p) => out.map((v, k) => v + p[k] / points.length), [0, 0, 0]);
        if (!contact.planted) { delete held[contact.side]; continue; }
        checked++;
        if (held[contact.side]) for (let v = 0; v < points.length; v++) worst = Math.max(worst, distance(points[v], held[contact.side][v]));
        else held[contact.side] = points;
      }
      const separation = Math.cos(gait.heading) * (centres.R[0] - centres.L[0])
        + Math.sin(gait.heading) * (centres.R[2] - centres.L[2]);
      minimumSeparation = Math.min(minimumSeparation, separation);
      if (n % 17 === 0) {
        const restored = createPressurePerformance(json(driver.snapshot()));
        assert.deepEqual(restored.tick(.01, { primary: incoming }), createPressurePerformance(driver.snapshot()).tick(.01, { primary: incoming }));
      }
    }
    assert.ok(finished); assert.ok(cycles.size >= (Math.abs(bearing) > 2 ? 3 : 1));
  }
  assert.ok(checked > 100);
  assert.ok(worst < .005, `stationary pivot slides a planted actual sole ${(worst * 1000).toFixed(2)}mm`);
  assert.ok(minimumSeparation > .18, `feet cross each other during the navigator turn (${minimumSeparation.toFixed(3)}m)`);
  console.log(`Last Posture actual scheduler pivots: ${(worst * 1000).toFixed(3)}mm planted drift; ${minimumSeparation.toFixed(3)}m minimum left/right separation.`);
});

test('accepted notice waits, rebalances once, and a held obstruction finishes its one recoil', () => {
  const c = d => hushDensityCharacter({ density: d });
  let d = stepHushDensityPose(freshHushDensityPose(18), { dt: .02, listening: true, listenTurn: .5 });
  const before = c(d);
  for (let n = 0; n < 40; n++) d = stepHushDensityPose(d, { dt: .02, listening: true, listenTurn: .5 });
  assert.deepEqual(c(d), before, 'notice instantly follows the sound with its head');
  for (let n = 0; n < 55; n++) d = stepHushDensityPose(d, { dt: .02, listening: true, listenTurn: .5 });
  assert.notDeepEqual(c(d).joints.head, before.joints.head);
  for (let n = 0; n < 400; n++) d = stepHushDensityPose(d, { dt: .02, listening: true });
  const finished = c(d);
  for (let n = 0; n < 400; n++) d = stepHushDensityPose(d, { dt: .02, listening: true });
  assert.deepEqual(c(d), finished);
  d = stepHushDensityPose(d, { dt: .02, blocked: true });
  for (let n = 0; n < 40; n++) d = stepHushDensityPose(d, { dt: .02, blocked: true });
  const recoil = c(d);
  for (let n = 0; n < 500; n++) d = stepHushDensityPose(d, { dt: .02, blocked: true });
  assert.notDeepEqual(c(d).joints.chest, recoil.joints.chest);
  const blocked = c(d);
  for (let n = 0; n < 500; n++) d = stepHushDensityPose(d, { dt: .02, blocked: true });
  assert.deepEqual(c(d), blocked, 'held obstruction generates perpetual struggling/breathing');
});

test('legacy fold snapshots migrate their distance exactly once, and saved anatomical anchors resume identically', () => {
  const old = normalizeHushDensityPose({ version: 1, phase: 12, rate: 2, seed: 7, compression: .22 });
  assert.ok(Math.abs(old.phase * LIMITS.cycleMetres - 6) < 1e-12);
  assert.equal(old.postureVersion, 2); assert.ok(Object.values(old.feet).every(f => !f.active));
  assert.deepEqual(normalizeHushDensityPose(json(old)), old);
  let d = freshHushDensityPose(48);
  for (let n = 0; n < 85; n++) d = stepHushDensityPose(d, { dt: .02, acceptedMetres: .032, acceptedDelta: { x: .006, z: -.03 }, headingDelta: .004 });
  const restored = normalizeHushDensityPose(json(d));
  const options = { dt: .02, acceptedMetres: .032, acceptedDelta: { x: .006, z: -.03 }, acceptedFloorDelta: .004, headingDelta: .004 };
  assert.deepEqual(stepHushDensityPose(restored, options), stepHushDensityPose(d, options));
  assert.deepEqual(hushDensityCharacter({ density: restored }), hushDensityCharacter({ density: d }));
});

test('zero time holds every support fact; transfers reset contacts without treating atlas distance as a stride', () => {
  let d = stepHushDensityPose(freshHushDensityPose(4), { dt: .1, acceptedMetres: .1 });
  assert.deepEqual(stepHushDensityPose(d, { dt: 0, acceptedMetres: 100, headingDelta: 3, resetSupport: true }), d);
  const reset = stepHushDensityPose(d, { dt: .02, acceptedMetres: 0, acceptedDelta: { x: 800, z: -900 }, resetSupport: true });
  assert.equal(reset.phase, d.phase);
  assert.ok(Object.values(reset.feet).every(f => !f.active && f.offset.every(v => v === 0)));
  const safe = hushDensityCharacter({ density: d, reducedMotion: true });
  assert.equal(safe.clip, 'pressure_hold'); assert.equal(safe.support, undefined); assert.equal(safe.blend, undefined);
  const comfort = stepHushDensityPose(d, { dt: .2, acceptedMetres: 3, headingDelta: 1, reducedMotion: true });
  assert.equal(comfort.phase, d.phase); assert.equal(comfort.compression, d.compression);
  assert.ok(Object.values(comfort.feet).every(f => !f.active), 'comfort preserves stale unseen world plants after its root moves');
  const resumed = stepHushDensityPose(comfort, { dt: .02 });
  assert.equal(resumed.phase, d.phase, 'comfort spends accumulated invisible travel on resume');
});

test('stationary desktop intent cannot walk a saved phase or acquire any observer facts', () => {
  const density = { ...freshHushDensityPose(10), phase: 38.27, event: 'notice', eventTime: 2.3 };
  const a = hushDensityCharacter({ density, time: 10, camera: [10, 30], target: [9, 9] });
  const b = hushDensityCharacter({ density: json(density), time: 999, camera: [-10, -30], target: [0, 0] });
  assert.deepEqual(a, b); assert.equal(a.clip, 'pressure_hold'); assert.equal(a.blend, undefined); assert.equal(a.time, 0);
  assert.equal(a.joints.pelvis, undefined); assert.equal(a.joints.posture_root, undefined);
  assert.ok(Object.keys(a.joints).every(name => asset.nodes.some(n => n.name === name)));
});
