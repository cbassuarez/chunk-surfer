import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPressurePerformance, PRESSURE_ROLES } from '../src/game/pressure-performance.js';
import { pressureInstances, pressureRoomAbsorptionStrength } from '../src/render/pressure-volume.js';

const input = (role, strength = 1) => ({
  id: `${role}:practice-lesson`, role, x: 144, y: 100, floorH: 6.22,
  heading: .7, motion: 'idle', strength, radiusM: 5.2, heightM: 1.83, widthM: .58,
});

function capturedActor(role, strength = 1) {
  const performance = createPressurePerformance();
  for (let i = 0; i < 6; i++) performance.tick(.25, { primary: input(role, strength) });
  return { performance, actor: performance.snapshot().primary };
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('a settled practice tenant keeps its captured human body while absorbing no room light', () => {
  const { actor } = capturedActor('tenant');
  const original = structuredClone(actor), body = pressureInstances(actor);
  freeze(actor);

  assert.equal(actor.strength, 1, 'the drawing must not disappear to avoid its volume');
  assert.equal(actor.performance.role, 'tenant');
  assert.equal(body.length, 1);
  assert.equal(body[0].mesh, 'pressure_body');
  assert.ok(body[0].pressure.strength > .99, 'the visible drawing lost its body strength');
  assert.equal(body[0].x, 72.25);
  assert.equal(body[0].z, 50.25);
  assert.equal(body[0].y, 6.22);
  assert.equal(body[0].scale, 1.83 / 2.18);
  assert.ok(Math.abs(body[0].yaw - .7) < 1e-12);
  assert.equal(body[0].character.clip, 'pressure_hold');
  assert.equal(body[0].character.time, 0);

  assert.equal(pressureRoomAbsorptionStrength(actor), 0);
  assert.deepEqual(actor, original, 'room-light selection rewrote the captured performance');
  assert.deepEqual(pressureInstances(actor), body, 'room-light selection changed the human drawing');
});

test('tenant arrival and authored cue poses stay visible independently of room absorption', () => {
  const performance = createPressurePerformance();
  performance.tick(.1, { primary: input('tenant', .8) });
  performance.cue('lean', 'tenant');
  performance.tick(.25, { primary: input('tenant', .8) });
  const actor = freeze(performance.snapshot().primary), before = structuredClone(actor);
  const ordinary = pressureInstances(actor), reduced = pressureInstances(actor, null, { reducedMotion: true });

  assert.equal(actor.performance.cue.name, 'lean');
  assert.ok(actor.performance.manifestation > 0 && actor.performance.manifestation < 1);
  assert.ok(ordinary[0].pressure.strength > 0);
  assert.ok(reduced[0].pressure.strength > 0);
  assert.equal(pressureRoomAbsorptionStrength(actor), 0);
  assert.deepEqual(pressureInstances(actor), ordinary);
  assert.deepEqual(pressureInstances(actor, null, { reducedMotion: true }), reduced);
  assert.deepEqual(actor, before);
});

test('all actual Pressure roles and legacy volume callers keep their existing room absorption', () => {
  for (const role of PRESSURE_ROLES.filter(role => role !== 'tenant')) {
    for (const strength of [0, .42, 1]) {
      const { actor } = capturedActor(role, strength), before = structuredClone(actor);
      freeze(actor);
      assert.equal(pressureRoomAbsorptionStrength(actor), strength, `${role} strength ${strength}`);
      assert.deepEqual(actor, before);
    }
  }
  assert.equal(pressureRoomAbsorptionStrength({ strength: .73 }), .73, 'legacy untyped volume changed');
  assert.equal(pressureRoomAbsorptionStrength({ strength: .61, performance: { role: 'future-pressure' } }), .61);
  assert.equal(pressureRoomAbsorptionStrength(null), 0);
  assert.equal(pressureRoomAbsorptionStrength(undefined), 0);
  assert.equal(pressureRoomAbsorptionStrength({}), 0);
});

test('the production room uniform separates tenant absorption from the body performance', () => {
  const source = readFileSync(new URL('../src/render/r3d.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{[^}]*pressureRoomAbsorptionStrength[^}]*\}\s*from '\.\/pressure-volume\.js'/);
  const call = source.match(/gl\.uniform4f\(U\('uHush'\),[^;]+;/)?.[0];
  assert.ok(call, 'actual production absence uniform was not found');
  const bind = Function('gl', 'U', 'state', 'pressureRoomAbsorptionStrength', call);
  for (const role of ['tenant', 'live-pressure', 'court-trace', 'legacy-pressure']) {
    const { actor } = capturedActor(role, .84), before = structuredClone(actor);
    let uniform;
    bind({ uniform4f: (...args) => { uniform = args; } }, name => name, { hush: actor }, pressureRoomAbsorptionStrength);
    assert.deepEqual(uniform, ['uHush', actor.x, actor.y, role === 'tenant' ? 0 : .84, actor.radiusM]);
    assert.deepEqual(actor, before, 'binding the room changed the figure');
  }
});
