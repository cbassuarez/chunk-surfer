import test from 'node:test';
import assert from 'node:assert/strict';
import { freshHandsInteraction, stepHandsInteraction, handsInteractionFrame, coastalHandsHeldLocal, HANDS_INTERACTION_MODE } from '../src/game/coastal-memory/hands-scene.js';
import { WINDING_PHASE } from '../src/game/coastal-memory/winding.js';

test('the interaction starts away and picks the box up', () => {
  let s = freshHandsInteraction();
  assert.equal(s.mode, HANDS_INTERACTION_MODE.AWAY);
  const r = stepHandsInteraction(s, { pickUp: true }, 0.016);
  assert.equal(r.state.mode, HANDS_INTERACTION_MODE.HANDLING);
  assert.ok(r.events.some((e) => e.type === 'pickup'));
});

test('look orbits the box; crank and shake drive the winding while handling', () => {
  let s = freshHandsInteraction();
  s = stepHandsInteraction(s, { pickUp: true }, 0.016).state;
  // Orbit.
  const turned = stepHandsInteraction(s, { lookDelta: { yaw: 0.5, pitch: 0.2 } }, 0.016);
  assert.ok(turned.state.boxYaw > 0);
  assert.ok(turned.state.boxPitch > 0);
  // Crank advances the tune.
  let cranked = stepHandsInteraction(turned.state, { pinHeld: true, crankDelta: 0.5 }, 0.25),events=[...cranked.events];
  for(let i=0;i<3;i++){cranked=stepHandsInteraction(cranked.state,{pinHeld:true,crankDelta:.25},.25);events.push(...cranked.events);}
  assert.ok(cranked.state.hands.winding.score > 0);
  assert.ok(events.some((e) => e.type === 'pluck'));
  // Shake jostles the train.
  const shaken = stepHandsInteraction(cranked.state, { pinHeld: false, crankDelta: 0, shake: 1 }, 0.25);
  assert.ok(shaken.events.some((e) => e.type === 'shake'));
  assert.equal(shaken.state.hands.winding.wear, cranked.state.hands.winding.wear, 'normal handling must not progressively destroy the box');
});

test('putting the box down releases the pin and slams the winding', () => {
  let s = freshHandsInteraction();
  s = stepHandsInteraction(s, { pickUp: true }, 0.016).state;
  for (let i = 0; i < 16; i++) s = stepHandsInteraction(s, { pinHeld: true, crankDelta: 0.25 }, 0.25).state;
  assert.ok(s.hands.winding.score > 0);
  const down = stepHandsInteraction(s, { putDown: true }, 0.016);
  assert.equal(down.state.mode, HANDS_INTERACTION_MODE.AWAY);
  assert.ok(down.events.some((e) => e.type === 'putdown'));
  assert.ok(down.events.some((e) => e.type === 'slam-start'));
});

test('the frame exposes a coherent UI contract for the renderer', () => {
  let s = freshHandsInteraction();
  s = stepHandsInteraction(s, { pickUp: true }, 0.016).state;
  const frame = handsInteractionFrame(s);
  assert.equal(frame.mode, HANDS_INTERACTION_MODE.HANDLING);
  assert.equal(frame.handling, true);
  assert.equal(typeof frame.boxPose.yaw, 'number');
  assert.equal(typeof frame.cylinderAngle, 'number');
  assert.equal(typeof frame.keyAngle, 'number');
  assert.ok(frame.ui.instruction, 'first pickup must show the hold-and-turn hint');
  assert.ok(frame.ui.putDown);
  // Away mode has no in-hand UI.
  const away = handsInteractionFrame(freshHandsInteraction());
  assert.equal(away.handling, false);
  assert.equal(away.ui.instruction, null);
  assert.equal(away.ui.putDown, null);
});

test('the held box floats in front of the eye and stays rigid', () => {
  const eye = [10, 2, 5];
  const held = coastalHandsHeldLocal({ eye, yaw: 0, pitch: 0, boxPose: {}, worldFromLocal: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
  assert.equal(held.length, 16);
  // The MESH ORIGIN sits half the scaled box height below the view point, so the
  // object's volumetric centre is what floats in front of the eye.
  const pivotY = 0.046 * 0.5;
  assert.ok(Math.abs(held[12] - eye[0]) < 1e-9);
  assert.ok(Math.abs(held[13] - (eye[1] - pivotY)) < 1e-9);
  assert.ok(Math.abs(held[14] - (eye[2] - 0.14)) < 1e-9);
  // Rotation columns are orthonormal (rigid, no scale).
  const cols = [[held[0], held[1], held[2]], [held[4], held[5], held[6]], [held[8], held[9], held[10]]];
  for (const c of cols) assert.ok(Math.abs(Math.hypot(...c) - 1) < 1e-9);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    const dot = cols[i][0] * cols[j][0] + cols[i][1] * cols[j][1] + cols[i][2] * cols[j][2];
    assert.ok(Math.abs(dot) < 1e-9);
  }
  // Shake jitters the pose without breaking rigidity.
  const shaken = coastalHandsHeldLocal({ eye, yaw: 1.2, pitch: -0.2, boxPose: { yaw: 0.5 }, shake: 1 });
  assert.ok(Math.abs(shaken[13] - held[13]) > 1e-6);
});

test('a rotated world frame is inverted so the held box lands at the eye', () => {
  // worldFromLocal = 90-degree yaw about Y plus a translation of (100, 0, 0).
  const worldFromLocal = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 100, 0, 0, 1];
  const eye = [110, 2, 5]; // forward at yaw 0 = (0,0,-1) in world
  const held = coastalHandsHeldLocal({ eye, yaw: 0, pitch: 0, boxPose: {}, worldFromLocal });
  // Apply worldFromLocal to heldLocal: the box must land at eye + (0, -0.12, -0.42).
  const boxWorld = [0, 0, 0];
  for (let r = 0; r < 3; r++) boxWorld[r] = worldFromLocal[0 * 4 + r] * held[12] + worldFromLocal[1 * 4 + r] * held[13] + worldFromLocal[2 * 4 + r] * held[14] + worldFromLocal[3 * 4 + r];
  const pivotY = 0.046 * 0.5;
  assert.ok(Math.abs(boxWorld[0] - 110) < 1e-6);
  assert.ok(Math.abs(boxWorld[1] - (2 - pivotY)) < 1e-6);
  assert.ok(Math.abs(boxWorld[2] - (5 - 0.14)) < 1e-6);
});
