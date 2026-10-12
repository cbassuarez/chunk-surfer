import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Group, Vector3 } from 'three';
import { BATTLE_HAND_AXES, createBattleHandRig, HAND_FINGERS, HAND_LIMITS, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';

const bytes = readFileSync(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const digits = [...HAND_FINGERS, 'thumb'];
const contactsOf = grip => Object.fromEntries(digits.filter(digit => grip[digit]).map(digit => [digit, grip[digit]]));
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} differs from ${b}`);
const neutral = { index: [0, 0, 0], middle: [0, 0, 0], ring: [0, 0, 0], pinky: [0, 0, 0], spread: { index: 0, middle: 0, ring: 0, pinky: 0 }, thumb: { opposition: 0, abduction: 0, mcp: 0, ip: 0 } };

test('real anatomical GLB becomes five hierarchical chains with unchanged bind lengths', () => {
  const hand = createBattleHandRig(template);
  const initialLengths = new Map();
  for (const finger of HAND_FINGERS) {
    const chain = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(part => hand.joints[`${finger}-finger-${part}`]);
    assert.equal(chain[0].parent, hand.joints.wrist);
    for (let i = 1; i < chain.length; i++) {
      assert.equal(chain[i].parent, chain[i - 1]);
      initialLengths.set(chain[i].name, chain[i].position.length());
    }
  }
  for (let i = 0; i < 3; i++) {
    hand.setFingerPose({ index: [i * .5, i * .65, i * .4], middle: [i * .6, i * .7, i * .5], ring: [i * .7, i * .75, i * .55], pinky: [i * .75, i * .8, i * .6], thumb: { opposition: i * .6, abduction: i * .2, mcp: i * .5, ip: i * .6 } });
    for (const [name, length] of initialLengths) near(hand.joints[name].position.length(), length, 1e-9);
  }
  assert.equal(hand.nails.length, 5);
  for (const nail of hand.nails) assert.ok(nail.position.y > 0, 'WebXR +Y is dorsal: nails must never be placed on the palm');
  hand.dispose();
});

test('right and left use the same anatomical lengths and mirror the palm rather than curling backward', () => {
  const right = createBattleHandRig(template), left = createBattleHandRig(template, { side: 'left' });
  for (const hand of [right, left]) hand.setFingerPose(neutral);
  for (const digit of digits) {
    const a = right.getPad(digit, 'local'), b = left.getPad(digit, 'local');
    near(a.position.x, -b.position.x); near(a.position.y, b.position.y); near(a.position.z, b.position.z);
    near(a.normal.x, -b.normal.x); near(a.normal.y, b.normal.y); near(a.normal.z, b.normal.z);
  }
  const before = right.getPad('thumb', 'local').position.x;
  right.setFingerPose({ thumb: { opposition: 1.1 } });
  assert.ok(right.getPad('thumb', 'local').position.x < before - .035, 'CMC opposition sweeps the right thumb inward across the palm');
  assert.notDeepEqual(right.joints['thumb-metacarpal'].quaternion.toArray(), right.rest['thumb-metacarpal'].quaternion.toArray());
  assert.notDeepEqual(left.getPose().thumb, right.getPose().thumb, 'instances retain independent bone poses');
  right.dispose(); left.dispose();
});

test('canonical right-hand chirality agrees with the asset rather than treating its back as its palm', () => {
  const hand = createBattleHandRig(template); hand.setFingerPose(neutral);
  assert.equal(BATTLE_HAND_AXES.palm, '+Z');
  assert.equal(BATTLE_HAND_AXES.rightThumb, '+X');
  const tips = hand.getFingertips('local');
  assert.ok(tips.thumb.x > tips.index.x && tips.index.x > tips.pinky.x, 'with the right palm toward the viewer, the thumb is on the right');
  for (const digit of HAND_FINGERS) {
    const bone = hand.joints[`${digit}-finger-phalanx-distal`];
    const pad = hand.getPad(digit, 'local');
    assert.ok(pad.normal.z > .9, 'canonical +Z is the actual palmar surface');
    const nativePad = bone.worldToLocal(hand.root.localToWorld(pad.position.clone()));
    assert.ok(nativePad.y < -.005, 'pads use WebXR -Y, independently of the canonical basis');
    const nail = hand.nails.find(mesh => mesh.name === `right-${digit}-nail`);
    const dorsal = nail.getWorldPosition(new Vector3()).sub(bone.getWorldPosition(new Vector3())).normalize();
    assert.ok(dorsal.dot(pad.normal) < 0, 'the nail is on the opposite side from the pad');
  }
  hand.dispose();
});

test('every finger joint flexes toward its anatomical palm, never into dorsal hyperextension', () => {
  for (const side of ['right', 'left']) {
    const hand = createBattleHandRig(template, { side });
    for (const digit of HAND_FINGERS) for (const [index, part] of ['proximal', 'intermediate', 'distal'].entries()) {
      hand.setFingerPose(neutral);
      const bone = hand.joints[`${digit}-finger-phalanx-${part}`];
      // WebXR defines -Y as out of the palm, regardless of mesh mirroring.
      const anatomicalPalmar = new Vector3(0, -1, 0).transformDirection(bone.matrixWorld);
      const before = hand.getFingertips()[digit];
      const flexion = [0, 0, 0]; flexion[index] = .35;
      hand.setFingerPose({ [digit]: flexion });
      const motion = hand.getFingertips()[digit].sub(before);
      assert.ok(motion.dot(anatomicalPalmar) > .002, `${side} ${digit} ${part} bends into the palm`);
    }
    hand.dispose();
  }
});

test('thumb opposition rolls the pad inward and positive abduction lifts it away from the palm plane', () => {
  for (const side of ['right', 'left']) {
    const hand = createBattleHandRig(template, { side }); hand.setFingerPose(neutral);
    const open = hand.getPad('thumb', 'local');
    hand.setFingerPose({ thumb: { opposition: 1.1 } });
    const opposed = hand.getPad('thumb', 'local');
    assert.ok(Math.abs(opposed.position.x) < Math.abs(open.position.x) - .035, 'opposition crosses the palm');
    assert.ok(opposed.normal.z < -.45, 'opposed pad faces the palm rather than turning its nail inward');
    hand.setFingerPose({ thumb: { opposition: .6, abduction: 0 } });
    const inPlane = hand.getPad('thumb', 'local');
    hand.setFingerPose({ thumb: { abduction: .4 } });
    assert.ok(hand.getPad('thumb', 'local').position.z > inPlane.position.z + .015, 'palmar abduction moves into canonical +Z');
    for (const [name, part] of [['thumb-phalanx-proximal', 'mcp'], ['thumb-phalanx-distal', 'ip']]) {
      hand.setFingerPose(neutral);
      const bone = hand.joints[name], palmar = new Vector3(0, -1, 0).transformDirection(bone.matrixWorld);
      const before = hand.getFingertips().thumb;
      hand.setFingerPose({ thumb: { [part]: .35 } });
      assert.ok(hand.getFingertips().thumb.sub(before).dot(palmar) > .002, `${part} flexes toward its pad`);
    }
    hand.dispose();
  }
});

test('authored pose input clamps flexion, extension, spread and thumb ranges without moving joint centres', () => {
  const hand = createBattleHandRig(template);
  hand.setFingerPose({ index: [-90, 90, 90], middle: [90, -90, -90], spread: { index: 99, middle: -99 }, thumb: { opposition: 99, abduction: -99, mcp: 99, ip: 99 } });
  const pose = hand.getPose();
  assert.deepEqual(pose.index, [HAND_LIMITS.mcp[0], HAND_LIMITS.pip[1], HAND_LIMITS.dip[1]]);
  assert.deepEqual(pose.middle, [HAND_LIMITS.mcp[1], HAND_LIMITS.pip[0], HAND_LIMITS.dip[0]]);
  near(pose.spread.index, HAND_LIMITS.spread[1]); near(pose.spread.middle, HAND_LIMITS.spread[0]);
  near(pose.thumb.opposition, HAND_LIMITS.opposition[1]); near(pose.thumb.abduction, HAND_LIMITS.abduction[0]);
  for (const [name, bone] of Object.entries(hand.joints)) assert.deepEqual(bone.position.toArray(), hand.rest[name].position.toArray());
  hand.dispose();
});

for (const id of ['recorder', 'rig', 'radio', 'torch', 'fork', 'spanner', 'coffee']) test(`${id} calibrated grip reaches actual physical tool contacts within 2 mm`, () => {
  const tool = buildBattleHandTool(id), hand = createBattleHandRig(template);
  const grip = tool.contacts.right;
  hand.setRootPose(grip.wrist);
  hand.setFingerPose(grip.pose);
  const targets = contactsOf(grip), before = hand.getPose();
  const diagnostics = hand.measureGrip(targets);
  assert.deepEqual(hand.getPose(), before, 'measuring a contact does not change its collision-calibrated joint solution');
  for (const digit of Object.keys(targets)) {
    assert.ok(diagnostics[digit].reached, `${id} ${digit}: ${diagnostics[digit].error * 1000} mm`);
    assert.ok(diagnostics[digit].normalDot > .35, `${id} ${digit} uses the pad rather than the nail`);
    if (digit !== 'thumb') {
      const [, pip, dip] = diagnostics[digit].parameters;
      assert.ok(dip >= pip * .35 - 1e-8 && dip <= pip * .85 + .15 + 1e-8, 'ordinary grip maintains flexor coupling');
    }
  }
  hand.dispose(); tool.dispose();
});

test('grip contact survives presentation rotation, translation and scale without sliding a fingertip', () => {
  const tool = buildBattleHandTool('recorder'), hand = createBattleHandRig(template), composition = new Group();
  composition.position.set(.4, -.2, .3); composition.rotation.set(.2, -.3, .1); composition.scale.setScalar(1.75);
  composition.add(tool.group); tool.group.add(hand.root);
  hand.setRootPose(tool.contacts.right.wrist);
  hand.setFingerPose(tool.contacts.right.pose);
  composition.updateMatrixWorld(true);
  const targets = Object.fromEntries(Object.entries(contactsOf(tool.contacts.right)).map(([digit, target]) => [digit, { position: tool.group.localToWorld(new Vector3(...target.position)), normal: new Vector3(...target.normal).transformDirection(tool.group.matrixWorld) }]));
  const diagnostics = hand.measureGrip(targets);
  for (const digit of Object.keys(targets)) assert.ok(diagnostics[digit].error <= .002, `${digit} remains attached to the same physical tool surface`);
  const pose = hand.getPose();
  composition.rotation.set(-.3, .4, -.2); composition.position.set(-.6, .1, -.2); composition.updateMatrixWorld(true);
  for (const digit of Object.keys(targets)) {
    const target = tool.group.localToWorld(new Vector3(...tool.contacts.right[digit].position));
    assert.ok(hand.getPad(digit).position.distanceTo(target) < .0035, 'root motion moves the tool and the contact together');
  }
  assert.deepEqual(hand.getPose(), pose);
  hand.root.removeFromParent(); hand.dispose(); tool.dispose();
});

test('whole skinned hands clear the physical instrument chassis instead of only fitting fingertips', () => {
  const sizes = { recorder: [.274, .274 * 405 / 736, .044], rig: [.174, .103, .040], radio: [.102, .150, .040] };
  for (const [id, size] of Object.entries(sizes)) {
    const tool = buildBattleHandTool(id), hand = createBattleHandRig(template);
    hand.setRootPose(tool.contacts.right.wrist); hand.setFingerPose(tool.contacts.right.pose);
    hand.root.updateMatrixWorld(true); hand.skin.skeleton.update();
    for (let i = 0; i < hand.skin.geometry.attributes.position.count; i++) {
      const point = hand.skin.getVertexPosition(i, new Vector3()); hand.skin.localToWorld(point);
      const penetration = Math.min(...point.toArray().map((value, axis) => size[axis] / 2 - Math.abs(value)));
      assert.ok(penetration < .001, `${id} vertex ${i} penetrates ${penetration * 1000} mm`);
    }
    hand.dispose(); tool.dispose();
  }
});

test('whole skinned hands clear cylindrical, tapered and flat tool handles within soft-pad compression', () => {
  for (const id of ['torch', 'fork', 'spanner', 'coffee']) {
    const tool = buildBattleHandTool(id), hand = createBattleHandRig(template);
    hand.setRootPose(tool.contacts.right.wrist); hand.setFingerPose(tool.contacts.right.pose);
    hand.root.updateMatrixWorld(true); hand.skin.skeleton.update();
    for (let i = 0; i < hand.skin.geometry.attributes.position.count; i++) {
      const point = hand.skin.getVertexPosition(i, new Vector3()); hand.skin.localToWorld(point);
      let penetration;
      if (id === 'spanner') penetration = Math.min(.012 - Math.abs(point.x), .006 - Math.abs(point.z), point.y + .142, .056 - point.y);
      else {
        const bottom = id === 'torch' ? -.094 : id === 'fork' ? -.1145 : -.0735;
        const top = id === 'torch' ? .064 : id === 'fork' ? -.0095 : .0515;
        const radius = id === 'torch' ? .023 : id === 'fork' ? .009 : .027 + (point.y - bottom) / (top - bottom) * .011;
        penetration = Math.min(radius - Math.hypot(point.x, point.z), point.y - bottom, top - point.y);
        // Include the tuning fork's separate foot disc, where the little
        // finger could fit the shaft while still cutting through its foot.
        if (id === 'fork') penetration = Math.max(penetration, Math.min(.0125 - Math.hypot(point.x, point.z), point.y + .1215, -.1125 - point.y));
      }
      assert.ok(penetration < .001, `${id} vertex ${i} penetrates ${penetration * 1000} mm`);
    }
    hand.dispose(); tool.dispose();
  }
});

test('left index presses a real recorder key with the pad facing its surface', () => {
  const tool = buildBattleHandTool('recorder'), hand = createBattleHandRig(template, { side: 'left' });
  hand.setFingerPose(tool.controls.rec.pose);
  hand.setRootPose(tool.controls.rec.wrist);
  const { index } = hand.solveGrip({ index: tool.controls.rec });
  assert.ok(index.error < .0001); assert.ok(index.normalDot > .999);
  for (const digit of ['middle', 'ring', 'pinky']) assert.ok(hand.getPad(digit).position.y < hand.getPad('index').position.y - .03, 'unused digits stay curled back from the operating index');
  hand.dispose(); tool.dispose();
});

test('unreachable contacts report failure while joint centres and root stay fixed', () => {
  const hand = createBattleHandRig(template), rootPosition = hand.root.position.toArray();
  const result = hand.solveGrip({ index: { position: [10, 10, 10], normal: [0, 0, 1] } });
  assert.equal(result.index.reached, false);
  assert.ok(result.index.error > 10);
  assert.deepEqual(hand.root.position.toArray(), rootPosition);
  for (const [name, bone] of Object.entries(hand.joints)) assert.deepEqual(bone.position.toArray(), hand.rest[name].position.toArray());
  hand.dispose();
});
