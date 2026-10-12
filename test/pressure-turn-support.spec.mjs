import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCharacterAsset, sampleCharacterPose } from '../src/render/character-asset.js';
import { pressureInstances } from '../src/render/pressure-volume.js';
import { CELL } from '../src/data/floorplan/legend.js';
import { stepPressureGait } from '../src/game/pressure-gait.js';
import { createPressurePerformance } from '../src/game/pressure-performance.js';

const bytes = readFileSync(process.env.PRESSURE_TEST_ASSET || new URL('../public/assets/pressure-character.glb', import.meta.url));
const asset = parseCharacterAsset(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const body = asset.entries.find(entry => entry.name === 'pressure_body');
const distance = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
const smooth = value => { const u = Math.max(0, Math.min(1, value)); return u * u * (3 - 2 * u); };
const rotate = (p, yaw) => [Math.cos(yaw) * p[0] - Math.sin(yaw) * p[2], p[1], Math.sin(yaw) * p[0] + Math.cos(yaw) * p[2]];
function deform(primitive, vertex, pose) {
  const p = Array.from(primitive.positions.subarray(vertex * 3, vertex * 3 + 3));
  for (let m = 0; m < body.morphCount; m++) for (let k = 0; k < 3; k++) p[k] += primitive.targets[m].positions[vertex * 3 + k] * pose.morphs[m];
  const q = [0, 0, 0];
  for (let j = 0; j < 4; j++) { const at = primitive.joints[vertex * 4 + j] * 16, w = primitive.weights[vertex * 4 + j];
    for (let k = 0; k < 3; k++) q[k] += (pose.bones[at + k] * p[0] + pose.bones[at + 4 + k] * p[1] + pose.bones[at + 8 + k] * p[2] + pose.bones[at + 12 + k]) * w;
  }
  return q;
}
function frame(u, turn, { start = .3, height = 2.18, blocked = false, pivot = false,
  stepDistanceMetres = .42, legacyDistance = false, floorH = 4.2, x0 = 12.25, z0 = -6.75 } = {}) {
  const target = start + turn, heading = start + turn * smooth(u / .38);
  const travel = pivot ? 0 : stepDistanceMetres * u, x = x0 + Math.sin(target) * travel, z = z0 - Math.cos(target) * travel;
  const actor = { id: 'support-test', x: x / CELL - .5, y: z / CELL - .5, floorH, strength: 1, heightM: height,
    performance: { version: 1, role: 'live-pressure', heading, clip: pivot ? 'pressure_pivot' : 'pressure_advance', time: .72 * u, loop: false,
      seed: 19, manifestation: 1, motion: 'approach', reducedMotion: false, cue: null,
      gait: { version: 1, phase: 'advance', cycle: 1, seed: 19, elapsed: .64 * u, duration: .64,
        travelMetres: travel, progress: u, pivot, heading, listenTurn: 0, stepStartX: x0 / CELL - .5, stepStartY: z0 / CELL - .5,
        stepTargetX: (x0 + Math.sin(target) * stepDistanceMetres) / CELL - .5,
        stepTargetY: (z0 - Math.cos(target) * stepDistanceMetres) / CELL - .5,
        stepSpeed: stepDistanceMetres / CELL / .64, ...(legacyDistance ? {} : { stepDistanceMetres }),
        startHeading: start, targetHeading: target, blocked } } };
  const [instance] = pressureInstances(actor, null);
  return { instance, actor, x0, z0, start, target };
}
function worldPoint(p, instance) {
  return rotate(p.map(v => v * instance.scale), instance.yaw).map((v, k) => v + [instance.x, instance.y, instance.z][k]);
}
function soleVertices(reference, side) {
  const joints = new Set(body.skin.joints.flatMap((node, i) => new RegExp(`^(?:foot|toe)_${side}$`).test(asset.nodes[node].name) ? [i] : [])), candidates = [];
  for (const primitive of body.primitives) for (let v = 0; v < primitive.vertexCount; v++) {
    let weight = 0; for (let j = 0; j < 4; j++) if (joints.has(primitive.joints[v * 4 + j])) weight += primitive.weights[v * 4 + j];
    if (weight > .95) candidates.push({ primitive, v, p: deform(primitive, v, reference) });
  }
  assert.ok(candidates.length > 20, `actual ${side} supported foot is missing`);
  const low = Math.min(...candidates.map(item => item.p[1]));
  return candidates.filter(item => item.p[1] < low + .008);
}

test('captured turn contacts hold real weighted soles through translating and stationary releases', () => {
  assert.ok(asset.clips.has('pressure_advance') && asset.clips.has('pressure_pivot') && asset.clips.has('pressure_arrest'), 'the real Arrested clips must be baked');
  const reference = sampleCharacterPose(asset, body, { clip: 'pressure_arrest', time: 1 });
  const soles = { L: soleVertices(reference, 'L'), R: soleVertices(reference, 'R') };
  let slide = 0, floorError = 0;
  for (const pivot of [false, true]) for (const turn of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) {
    for (const height of [2.18, 1.83]) for (let n = 0; n <= 50; n++) {
      const u = n / 50, f = frame(u, turn, { height, start: turn < 0 ? 3 : .3, pivot });
      const before = structuredClone(f.instance.character), pose = sampleCharacterPose(asset, body, f.instance.character);
      assert.deepEqual(f.instance.character, before, 'the sampler rewrites captured support data');
      for (const side of ['L', 'R']) {
        if (side === 'R' ? u > .58 : u < .38) continue;
        const anchorYaw = side === 'R' ? f.start : f.target;
        const root = [f.x0, f.instance.y, f.z0];
        if (side === 'L' && !pivot) { root[0] += Math.sin(f.target) * .42; root[2] -= Math.cos(f.target) * .42; }
        for (const { primitive, v, p } of soles[side]) {
          const actual = worldPoint(deform(primitive, v, pose), f.instance);
          const expected = rotate(p.map(value => value * f.instance.scale), anchorYaw).map((value, k) => value + root[k]);
          slide = Math.max(slide, distance(actual, expected)); floorError = Math.max(floorError, Math.abs(actual[1] - expected[1]));
          assert.ok(distance(actual, expected) < .025, `${side}@${u} turn${turn.toFixed(2)} weighted sole slips ${(distance(actual, expected) * 1000).toFixed(1)}mm`);
        }
      }
    }
  }
  assert.ok(floorError < .012, 'turning a planted foot lifts or penetrates the floor');
  console.log(`Pressure turn support: maximum weighted-sole drift ${(slide * 1000).toFixed(2)}mm / floor deviation ${(floorError * 1000).toFixed(2)}mm`);
});

test('turn support preserves the real navigation root, sampled clock and deterministic blocked pose', () => {
  const f = frame(.27, Math.PI / 2, { blocked: true }), before = structuredClone(f.actor);
  assert.ok(Math.abs(f.instance.x - (f.actor.x + .5) * CELL) < 1e-9);
  assert.ok(Math.abs(f.instance.z - (f.actor.y + .5) * CELL) < 1e-9);
  assert.ok(Math.abs(f.instance.yaw - f.actor.performance.heading) < 1e-9);
  assert.equal(f.instance.character.time, f.actor.performance.time);
  const pose = sampleCharacterPose(asset, body, f.instance.character);
  for (let i = 0; i < 5; i++) assert.deepEqual(sampleCharacterPose(asset, body, f.instance.character), pose);
  assert.deepEqual(f.actor, before);
  const safe = pressureInstances(f.actor, null, { reducedMotion: true })[0];
  assert.deepEqual(safe.character.support, f.instance.character.support, 'comfort removes the physical contact correction');
  for (const key of ['x', 'y', 'z', 'yaw', 'scale']) assert.equal(safe[key], f.instance[key]);
  assert.throws(() => sampleCharacterPose(asset, body, { ...f.instance.character, support: { ...f.instance.character.support,
    contacts: [{ side: 'R', yaw: NaN, offset: [0, 0, 0], weight: 1 }] } }), /support anchor invalid/);
});

test('short committed strides and legacy missing distance keep actual soles at the captured world anchors', () => {
  const reference = sampleCharacterPose(asset, body, { clip: 'pressure_arrest', time: 1 });
  const soles = { L: soleVertices(reference, 'L'), R: soleVertices(reference, 'R') };
  let worst = 0, floor = 0;
  const strides = [.001, .01, .05, .2, .42].map(stepDistanceMetres => ({ stepDistanceMetres, legacyDistance: false }));
  strides.push({ stepDistanceMetres: .42, legacyDistance: true });
  for (const options of strides) for (const height of [1.83, 2.18]) for (const floorH of [-1.2, 20]) {
    for (const turn of [-Math.PI / 4, 0, Math.PI / 4]) for (let n = 0; n <= 50; n++) {
      const u = n / 50, f = frame(u, turn, { ...options, height, floorH, x0: -33.75, z0: 86.25 });
      assert.equal(Object.hasOwn(f.actor.performance.gait, 'stepDistanceMetres'), !options.legacyDistance);
      assert.equal(f.instance.y, floorH); assert.equal(f.instance.scale, height / 2.18);
      const pose = sampleCharacterPose(asset, body, f.instance.character);
      for (const side of ['L', 'R']) {
        if (side === 'R' ? u > .58 : u < .38) continue;
        const root = [f.x0, floorH, f.z0], yaw = side === 'R' ? f.start : f.target;
        if (side === 'L') { root[0] += Math.sin(f.target) * options.stepDistanceMetres; root[2] -= Math.cos(f.target) * options.stepDistanceMetres; }
        for (const { primitive, v, p } of soles[side]) {
          const actual = worldPoint(deform(primitive, v, pose), f.instance);
          const expected = rotate(p.map(value => value * f.instance.scale), yaw).map((value, k) => value + root[k]);
          worst = Math.max(worst, distance(actual, expected)); floor = Math.max(floor, Math.abs(actual[1] - expected[1]));
          assert.ok(distance(actual, expected) < .025, `${options.stepDistanceMetres}m ${side}@${u}: actual short-stride sole misses its world anchor`);
        }
      }
    }
  }
  assert.ok(floor < .012, 'a short stride loses physical floor support');
  console.log(`Pressure committed strides .001–.42m and legacy default: weighted-sole drift ${(worst * 1000).toFixed(2)}mm / floor deviation ${(floor * 1000).toFixed(2)}mm`);
});

test('large release turns retain continuous actual leg surfaces and conservative bounds', () => {
  const reference = sampleCharacterPose(asset, body, { clip: 'pressure_arrest', time: 1 });
  const surfaces = body.primitives.map(primitive => {
    const points = Array.from({ length: primitive.vertexCount }, (_, v) => deform(primitive, v, reference)), seen = new Set(), edges = [];
    for (let i = 0; i < primitive.indices.length; i += 3) for (let k = 0; k < 3; k++) {
      const a = primitive.indices[i + k], b = primitive.indices[i + (k + 1) % 3], key = Math.min(a, b) * primitive.vertexCount + Math.max(a, b);
      if (seen.has(key)) continue; seen.add(key); const length = distance(points[a], points[b]);
      if (length > .005) edges.push({ a, b, length });
    }
    return { primitive, edges };
  });
  let worst = 0;
  for (const stepDistanceMetres of [.001, .42]) for (const pivot of [false, true]) for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI]) for (const u of [0, .1, .2, .3, .38, .5, .58, .7, .85, 1]) {
    const { instance } = frame(u, turn, { pivot, stepDistanceMetres }), pose = sampleCharacterPose(asset, body, instance.character);
    for (const { primitive, edges } of surfaces) {
      const points = Array.from({ length: primitive.vertexCount }, (_, v) => deform(primitive, v, pose));
      for (const { a, b, length } of edges) worst = Math.max(worst, distance(points[a], points[b]) / length);
      for (let v = 0; v < points.length; v += 29) for (let k = 0; k < 3; k++) assert.ok(points[v][k] >= pose.bounds.min[k] - 1e-4 && points[v][k] <= pose.bounds.max[k] + 1e-4);
    }
  }
  assert.ok(worst < 8, `turn IK stretches the actual weighted surface ${worst.toFixed(2)}x`);
  console.log(`Pressure release turn maximum sampled surface extension: ${worst.toFixed(2)}x`);
});

test('actual 90 and 180 degree sound turns use bounded stationary pivots with planted weighted feet', () => {
  const reference = sampleCharacterPose(asset, body, { clip: 'pressure_arrest', time: 1 });
  const soles = { L: soleVertices(reference, 'L'), R: soleVertices(reference, 'R') };
  for (const bearing of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    let x = 24, y = -14, gait = { phase: 'load', seed: 19, cycle: 0, heading: 0, elapsed: .4, duration: .4 };
    const cycles = new Set(), targetX = x + Math.sin(bearing) * 10, targetY = y - Math.cos(bearing) * 10;
    let finished = false;
    for (let frame = 0; frame < 2000; frame++) {
      const next = stepPressureGait(gait, { dt: .02, x, y, targetX, targetY, speed: 2 });
      x = next.x; y = next.y; gait = next.gait;
      if (gait.phase !== 'advance') continue;
      const actor = { id: 'real-scheduler-turn', x, y, floorH: 4.2, heightM: 2.18, strength: 1,
        performance: { version: 1, role: 'live-pressure', heading: gait.heading, clip: gait.pivot ? 'pressure_pivot' : 'pressure_advance',
          time: gait.progress * .72, loop: false, seed: 19, manifestation: 1, motion: 'approach', reducedMotion: false, cue: null, gait } };
      const [instance] = pressureInstances(actor, null), pose = sampleCharacterPose(asset, body, instance.character);
      assert.ok(Math.abs(Math.atan2(Math.sin(gait.targetHeading - gait.startHeading), Math.cos(gait.targetHeading - gait.startHeading))) <= Math.PI / 4 + 1e-5);
      if (gait.pivot) { cycles.add(gait.cycle); assert.equal(gait.travelMetres, 0); assert.ok(Math.hypot(x - gait.stepStartX, y - gait.stepStartY) < 1e-8, 'stationary pivot moves the real collider'); }
      for (const side of ['L', 'R']) {
        if (side === 'R' ? gait.progress > .58 : gait.progress < .38) continue;
        const root = [(gait.stepStartX + .5) * CELL, 4.2, (gait.stepStartY + .5) * CELL], yaw = side === 'R' ? gait.startHeading : gait.targetHeading;
        if (side === 'L' && !gait.pivot) { root[0] += Math.sin(gait.targetHeading) * gait.stepDistanceMetres; root[2] -= Math.cos(gait.targetHeading) * gait.stepDistanceMetres; }
        for (const { primitive, v, p } of soles[side]) {
          const actual = worldPoint(deform(primitive, v, pose), instance), expected = rotate(p, yaw).map((value, k) => value + root[k]);
          assert.ok(distance(actual, expected) < .025, `actual scheduler ${side} turn slides a weighted foot`);
        }
      }
      if (!gait.pivot && gait.progress > .4) { finished = true; break; }
    }
    assert.equal(finished, true, 'the actual sound bearing never reaches a translating advance');
    assert.ok(cycles.size >= Math.ceil(Math.abs(bearing) / (Math.PI / 4)) - 1, 'a large bearing bypasses the constrained pivot sequence');
  }
});

test('blocked recovery holds real supported surfaces throughout fade-out, resets only while absent, and replays the frozen pose', () => {
  const reference = sampleCharacterPose(asset, body, { clip: 'pressure_arrest', time: 1 });
  const soles = { L: soleVertices(reference, 'L'), R: soleVertices(reference, 'R') };
  for (const stepDistanceMetres of [.05, .42]) for (const progress of [.27, .45, .72]) {
    const initial = frame(progress, Math.PI / 4, { height: 1.83, floorH: -1.2, stepDistanceMetres });
    let gait = initial.actor.performance.gait, x = initial.actor.x, y = initial.actor.y;
    const performance = createPressurePerformance();
    const incoming = () => ({ id: initial.actor.id, role: 'live-pressure', x, y, floorH: -1.2, heightM: 1.83, strength: 1, motion: 'hunt', gait });
    const present = dt => {
      const snapshot = performance.tick(dt, { primary: incoming() });
      return { snapshot, instance: pressureInstances(snapshot.primary, null)[0] };
    };
    const advance = present(.25), advancePose = sampleCharacterPose(asset, body, advance.instance.character);
    for (let n = 0; n < 50 && gait.phase !== 'recover'; n++) {
      const result = stepPressureGait(gait, { dt: .02, x, y, targetX: gait.stepTargetX, targetY: gait.stepTargetY,
        speed: 2, resolveMove: from => ({ ...from }) });
      x = result.x; y = result.y; gait = result.gait;
    }
    assert.equal(gait.phase, 'recover', 'the real blocked scheduler must enter recovery');
    assert.equal(gait.recoveryReset, false);
    let previousVisibility = 1, absentAtSeam = false, sampledFade = 0;
    for (let n = 0; n < 40; n++) {
      const rendered = present(.02), visibility = rendered.snapshot.primary.performance.manifestation;
      assert.equal(x, initial.actor.x); assert.equal(y, initial.actor.y);
      assert.equal(rendered.snapshot.primary.performance.heading, initial.actor.performance.heading);
      if (!gait.recoveryReset) {
        assert.ok(visibility <= previousVisibility + 1e-8, 'recovery brightens during withdrawal'); previousVisibility = visibility;
        if (rendered.instance) {
          sampledFade++;
          assert.deepEqual(rendered.instance.character.support, advance.instance.character.support, 'fade-out changes captured support anchors');
          const pose = sampleCharacterPose(asset, body, rendered.instance.character);
          assert.deepEqual(pose.bones, advancePose.bones, 'the visible recovery body changes its frozen deformation');
          assert.deepEqual(pose.morphs, advancePose.morphs);
          for (const side of ['L', 'R']) {
            if (side === 'R' ? progress > .58 : progress < .38) continue;
            for (const { primitive, v } of soles[side]) assert.ok(distance(worldPoint(deform(primitive, v, pose), rendered.instance), worldPoint(deform(primitive, v, advancePose), advance.instance)) < .001, 'supported weighted surface slides during fade-out');
          }
          const replay = createPressurePerformance(); replay.applyFrame(JSON.parse(JSON.stringify(rendered.snapshot)));
          const replayInstance = pressureInstances(replay.snapshot().primary, null)[0];
          assert.deepEqual(replayInstance, rendered.instance, 'saved recovery frame reconstructs different support');
          assert.deepEqual(sampleCharacterPose(asset, body, replayInstance.character), pose, 'saved recovery pose changes its actual palette');
        }
      } else {
        if (!absentAtSeam) {
          assert.equal(visibility, 0, 'the stance resets before the volume is completely absent');
          assert.equal(rendered.instance, undefined); absentAtSeam = true;
        }
        if (rendered.instance) {
          assert.equal(rendered.instance.character.support, undefined, 'arrested recovery keeps obsolete stride anchors');
          assert.equal(rendered.instance.character.clip, 'pressure_arrest');
          const pose = sampleCharacterPose(asset, body, rendered.instance.character);
          for (const side of ['L', 'R']) for (const { primitive, v, p } of soles[side]) {
            const actual = worldPoint(deform(primitive, v, pose), rendered.instance), expected = worldPoint(p, rendered.instance);
            assert.ok(distance(actual, expected) < .001, 'fade-in does not use the planted arrested stance at the same collider root');
          }
        }
      }
      if (gait.recoveryReset && gait.elapsed > .7) break;
      const result = stepPressureGait(gait, { dt: .02, x, y, targetX: gait.stepTargetX, targetY: gait.stepTargetY, speed: 2 });
      x = result.x; y = result.y; gait = result.gait;
    }
    assert.ok(sampledFade > 5 && absentAtSeam, 'the real recovery did not expose a verifiable frozen withdrawal and zero seam');
  }
});
