import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Euler, Group, Quaternion, Vector3 } from 'three';
import { createRecorderRigMotion, recorderBracketFrame, BRACKET_POSITION, BRACKET_PITCH, BRACKET_LENS_Y } from '../src/render/recorder-rig-motion.js';
import { resolveRecorderLamp, resolveTorchFrame } from '../src/render/torch-optics.js';
import { recorderElbow } from '../src/render/recorder-arm.js';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { RECORDER_BRACE_CONTACTS } from '../src/render/recorder-hand-poses.js';
import { poseRecorderBrace, poseRecorderIndex, recorderKeyMotion, RECORDER_KEY_X, RECORDER_KEY_Y,
  RECORDER_KEY_Z, RECORDER_KEY_FACE, RECORDER_KEY_TRAVEL } from '../src/render/recorder-hand-motion.js';

function near(a, b, eps = 1e-6) {
  assert.ok(a.distanceTo(b) < eps, `${a.toArray()} differs from ${b.toArray()}`);
}
const vec = values => new Vector3(...values);

test('bracket beam comes from the physical lens under the same case rotation', () => {
  const motion = createRecorderRigMotion();
  motion.footfall({ footSide: 'right', speed: 6, interval: .31 }, 1);
  const pose = motion.frame(1.08, { moving: true, raised: true });
  const frame = recorderBracketFrame(pose);
  const mount = new Quaternion().setFromEuler(new Euler(BRACKET_PITCH, 0, 0));
  const caseRotation = new Quaternion().setFromEuler(new Euler(...pose.rotation));
  near(vec(frame.origin), new Vector3(0, BRACKET_LENS_Y + .012, 0).applyQuaternion(mount)
    .add(vec(BRACKET_POSITION)).applyQuaternion(caseRotation).add(vec(pose.position)));
  near(vec(frame.forward), new Vector3(0, 1, 0).applyQuaternion(mount).applyQuaternion(caseRotation));
  const camera = { eye: [3, 1.7, -8], yaw: -.6, pitch: .2 };
  const view = new Quaternion().setFromEuler(new Euler(camera.pitch, -camera.yaw, 0, 'YXZ'));
  const world = resolveRecorderLamp({ ...camera, lamp: frame });
  near(vec(world.origin), vec(frame.origin).applyQuaternion(view).add(vec(camera.eye)));
  near(vec(world.forward), vec(frame.forward).applyQuaternion(view));
  assert.deepEqual(resolveRecorderLamp(camera), resolveTorchFrame(camera));
});

test('accepted left and right steps give alternating sway, a dip, and recovery', () => {
  const motion = createRecorderRigMotion(), neutral = motion.frame(0);
  assert.deepEqual(motion.frame(1, { moving: true }).position, neutral.position);
  motion.footfall({ footSide: 'left', speed: 2.6 }, 2);
  const left = motion.frame(2.08, { moving: true });
  motion.footfall({ footSide: 'right', speed: 2.6 }, 3);
  const right = motion.frame(3.08, { moving: true });
  assert.ok(left.position[0] < 0 && right.position[0] > 0);
  assert.ok(left.position[1] < neutral.position[1]);
  assert.ok(left.rotation[0] < neutral.rotation[0]);
  const reduced = motion.frame(3.08, { moving: true, reducedMotion: true });
  assert.ok(Math.abs(reduced.rotation[1]) < Math.abs(right.rotation[1]) / 4);
  near(vec(motion.frame(4.4).position), vec(neutral.position));
  motion.reset();
  assert.deepEqual(motion.frame(5).position, neutral.position);
});

test('the live deck drops below view and comes back up through the same hand and torch pose', () => {
  const motion = createRecorderRigMotion();
  const raised = motion.frame(0, { raised: true });
  const dropping = motion.frame(.04, { raised: true, lowered: true });
  assert.ok(dropping.lowering > 0 && dropping.lowering < 1);
  assert.ok(dropping.position[1] < raised.position[1]);
  assert.ok(recorderBracketFrame(dropping).origin[1] < recorderBracketFrame(raised).origin[1]);
  for (let i = 2; i <= 12; i++) motion.frame(i * .04, { raised: true, lowered: true });
  const rising = motion.frame(.52, { raised: true });
  assert.ok(rising.lowering > 0 && rising.lowering < dropping.lowering + .1);
  const reduced = motion.frame(.56, { raised: true, reducedMotion: true });
  assert.deepEqual(reduced.position, raised.position);
});

test('shipped grip faces the recorder side and both arms reach each key during stride', async () => {
  const file = await readFile(new URL('../public/assets/battle-hands/recordist.glb', import.meta.url));
  const template = await parseBattleHandTemplate(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  const left = createBattleHandRig(template, { side: 'left' }), right = createBattleHandRig(template);
  const recorder = new Group();
  poseRecorderBrace(left, recorder);
  const palm = new Vector3(0, 0, 1).applyQuaternion(left.root.quaternion);
  assert.ok(palm.x > .9);
  assert.deepEqual(Object.keys(left.skin.morphTargetDictionary), ['index', 'middle', 'ring', 'pinky', 'thumb']);
  assert.ok(left.skin.morphTargetInfluences.every(value => value > 0));
  const motion = createRecorderRigMotion();
  const armReaches = (hand, sign) => {
    const { position, quaternion } = hand.root;
    const arm = recorderElbow(sign, position, quaternion);
    assert.ok(arm.reachable);
    assert.ok(Math.abs(arm.elbow.distanceTo(position) - .27) < 1e-6);
    assert.ok(Math.abs(arm.shoulder.distanceTo(arm.elbow) - .31) < 1e-6);
  };
  try {
    for (const raised of [false, true]) for (const side of ['left', 'right']) {
      motion.footfall({ footSide: side, speed: 7.5, interval: .3 }, 1);
      for (let i = 0; i < 16; i++) {
        const pose = motion.frame(1 + i / 60, { raised, moving: true });
        recorder.position.set(...pose.position);
        recorder.rotation.set(...pose.rotation);
        recorder.updateMatrixWorld(true);
        poseRecorderBrace(left, recorder);
        armReaches(left, -1);
        for (const [digit, contact] of Object.entries(RECORDER_BRACE_CONTACTS)) {
          const pad = left.getPad(digit);
          const local = recorder.worldToLocal(pad.position);
          const gap = local.sub(vec(contact.position)).dot(vec(contact.normal));
          assert.ok(gap > -.002 && gap < .0045, digit + ': pad stays against the case');
        }
        if (!raised) continue;
        for (const x of RECORDER_KEY_X) for (const travel of [0, .8, 1]) {
          poseRecorderIndex(right, recorder, { x, approach: 1, travel });
          const pad = right.getPad('index');
          const front = recorder.localToWorld(new Vector3(x, RECORDER_KEY_Y,
            RECORDER_KEY_Z + RECORDER_KEY_FACE - RECORDER_KEY_TRAVEL * travel));
          near(pad.position, front);
          const outward = new Vector3(0, 0, 1).applyQuaternion(recorder.quaternion);
          assert.ok(pad.normal.dot(outward) < -.62, 'pad faces the cap on the player side');
          armReaches(right, 1);
        }
      }
    }
  } finally {
    left.dispose(); right.dispose();
  }
});

test('a second key retracts before crossing and the cap moves only after contact', () => {
  for (const reducedMotion of [false, true]) for (const from of RECORDER_KEY_X) for (const to of RECORDER_KEY_X) {
    const options = { from, to, reducedMotion, initialApproach: 1 };
    for (let elapsed = 0; elapsed < 240; elapsed += 2) {
      const { x, approach, pressure } = recorderKeyMotion(elapsed, options);
      if (x !== from && x !== to && elapsed < 107) assert.ok(approach < .001);
      if (pressure > 0) { assert.equal(x, to); assert.equal(approach, 1); }
    }
    const down = recorderKeyMotion(240, options);
    assert.deepEqual(down, { x: to, approach: 1, pressure: 1 });
    assert.deepEqual(recorderKeyMotion(420, { ...options, releaseAge: 120 }), { x: to, approach: 0, pressure: 0 });
  }
});
