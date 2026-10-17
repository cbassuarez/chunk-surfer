import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BufferGeometry, DoubleSide, Euler, Float32BufferAttribute, Mesh, MeshBasicMaterial, Quaternion, Raycaster, Triangle, Vector3 } from 'three';
import { createBattleHandRig, parseBattleHandTemplate } from '../src/render/battle-hand-rig.js';
import { buildBattleHandTool } from '../src/render/battle-hand-tools.js';
import { battleHandFraming, battleHandPerformance, battleHandReach } from '../src/render/battle-hand-performance.js';

const bytes = readFileSync(new URL('../public/assets/battle-hands/right.glb', import.meta.url));
const template = await parseBattleHandTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const directions = [[1, .372, .217], [.237, 1, .417], [.417, .213, 1]].map(v => new Vector3(...v).normalize());
const operatedTools = [
  ['recorder', 'DA-1000 chassis', { rec: 'monitor', stop: 'stop', takes: 'playback' }],
  ['radio', 'portable short-wave radio', { tune: 'tune', transmit: 'radio-decoy' }],
  ['rig', 'bent interface chassis', { tune: 'runaway-feedback', invert: 'invert' }],
];

function posedSurface(hand) {
  hand.root.updateMatrixWorld(true); hand.skin.skeleton.update();
  const points = [], skinPositions = hand.skin.geometry.attributes.position;
  for (let i = 0; i < skinPositions.count; i++) points.push(hand.skin.localToWorld(hand.skin.getVertexPosition(i, new Vector3())));
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points.flatMap(p => p.toArray()), 3));
  geometry.setIndex(hand.skin.geometry.index.clone()); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  const surface = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide })); surface.updateMatrixWorld(true);
  // Nails are separate rigid surfaces; include their vertices in both body and
  // opposite-hand clearance checks without treating them as a closed skin.
  for (const nail of hand.nails) for (let i = 0; i < nail.geometry.attributes.position.count; i++) points.push(nail.localToWorld(new Vector3().fromBufferAttribute(nail.geometry.attributes.position, i)));
  return { surface, points, dispose() { geometry.dispose(); surface.material.dispose(); } };
}

function assertOutsideHand(points, other, label) {
  const ray = new Raycaster(), positions = other.geometry.attributes.position, index = other.geometry.index;
  const triangles = [];
  for (let i = 0; i < index.count; i += 3) triangles.push(new Triangle(...[0, 1, 2].map(offset => new Vector3().fromBufferAttribute(positions, index.getX(i + offset)))));
  for (const point of points) {
    if (!other.geometry.boundingBox.containsPoint(point)) continue;
    let insideVotes = 0;
    for (const direction of directions) {
      ray.set(point, direction);
      let previous = -1, crossings = 0;
      for (const hit of ray.intersectObject(other, false)) if (hit.distance > 1e-7 && hit.distance - previous > 1e-6) { previous = hit.distance; crossings++; }
      if (crossings % 2) insideVotes++;
    }
    if (insideVotes < 2) continue;
    let depth = Infinity;
    for (const triangle of triangles) depth = Math.min(depth, triangle.closestPointToPoint(point, new Vector3()).distanceTo(point));
    assert.ok(depth < .001, `${label} skin/nail crosses the other hand by ${depth * 1000} mm`);
  }
}

function assertOutsideChassis(points, chassis, label) {
  const bounds = chassis.geometry.boundingBox;
  for (const point of points) {
    const local = chassis.worldToLocal(point.clone());
    const penetration = Math.min(local.x - bounds.min.x, bounds.max.x - local.x, local.y - bounds.min.y, bounds.max.y - local.y, local.z - bounds.min.z, bounds.max.z - local.z);
    assert.ok(penetration < .001, `${label} skin/nail penetrates the chassis by ${penetration * 1000} mm`);
  }
}

for (const [id, body, actions] of operatedTools) test(`${id} operating hand, nails and supporting hand clear each other throughout control travel`, () => {
  const tool = buildBattleHandTool(id), right = createBattleHandRig(template), left = createBattleHandRig(template, { side: 'left' });
  right.setRootPose(tool.contacts.right.wrist); right.setFingerPose(tool.contacts.right.pose);
  const rightSurface = posedSurface(right), chassis = tool.group.getObjectByName(body);
  chassis.geometry.computeBoundingBox();
  for (const [key, action] of Object.entries(actions)) for (const controlPressure of [0, .5, 1]) {
    tool.update({ action, side: 'player', active: true, progress: .5, impactFired: true, controlPressure });
    const control = tool.controls[key];
    left.setRootPose(control.wrist); left.setFingerPose(control.pose);
    // The forearm extends opposite the wrist's +Y finger axis. A positive
    // vertical component makes the sleeve return below the hand, rather than
    // emerge horizontally across the screen or extend above the instrument.
    const fingerAxis = new Vector3(0, 1, 0).applyQuaternion(left.root.quaternion);
    assert.ok(fingerAxis.y > .3, `${id}:${key} forearm returns below the wrist`);
    assert.ok(control.wrist.position[1] < control.position[1], `${id}:${key} wrist approaches from below`);
    const diagnostic = left.measureGrip({ index: control }).index;
    assert.ok(diagnostic.error < .0001, `${id}:${key} pad contact`);
    // A real index presses with the forward portion of its pad at an oblique
    // angle. Requiring a perfectly flush pad forces the operating palm back
    // through the cradling hand. Still reject sideways and dorsal contacts.
    assert.ok(diagnostic.normalDot > .75, `${id}:${key} palmar pad presses inward within 41 degrees`);
    const leftSurface = posedSurface(left);
    assertOutsideChassis(leftSurface.points, chassis, `${id}:${key}`);
    assertOutsideHand(leftSurface.points, rightSurface.surface, `${id}:${key} left`);
    assertOutsideHand(rightSurface.points, leftSurface.surface, `${id}:${key} right`);
    leftSurface.dispose();
  }
  rightSurface.dispose(); right.dispose(); left.dispose(); tool.dispose();
});

function blendPose(from, to, amount) {
  const pose = {};
  for (const digit of ['index', 'middle', 'ring', 'pinky']) pose[digit] = from[digit].map((value, i) => value + (to[digit][i] - value) * amount);
  for (const key of ['thumb', 'spread']) pose[key] = Object.fromEntries(Object.entries(from[key]).map(([name, value]) => [name, value + (to[key][name] - value) * amount]));
  return pose;
}

// Find the actual combat clock sample for an amount of reaching, rather than
// substituting an independent animation curve in this geometry regression.
function performanceAtReach(tool, move, amount, injury, withdrawing) {
  let low = withdrawing ? .37 : 0, high = withdrawing ? .86 : .28;
  const frame = { tool, move, actionActor: 'player', now: 0, injury };
  for (let i = 0; i < 20; i++) {
    const middle = (low + high) / 2;
    const performance = battleHandPerformance({ ...frame, rawProgress: middle });
    if (withdrawing ? performance.operation > amount : performance.operation < amount) low = middle;
    else high = middle;
  }
  return battleHandPerformance({ ...frame, rawProgress: (low + high) / 2 });
}

test('operating hands clear the items and each other during actual reach and withdrawal, including critical injury', () => {
  const framing = battleHandFraming({ width: 1728, height: 585 });
  for (const [id, body, actions] of operatedTools) {
    const tool = buildBattleHandTool(id), right = createBattleHandRig(template), left = createBattleHandRig(template, { side: 'left' });
    tool.group.add(right.root); right.setRootPose(tool.contacts.right.wrist); right.setFingerPose(tool.contacts.right.pose);
    const chassis = tool.group.getObjectByName(body); chassis.geometry.computeBoundingBox();
    for (const injury of ['steady', 'critical']) for (const withdrawing of [false, true]) {
      for (const [key, move] of Object.entries(actions)) for (const amount of [.25, .5, .75, .9, 1]) {
        const performance = performanceAtReach(id, move, amount, injury, withdrawing);
        const reach = battleHandReach(performance.operation);
        tool.group.position.set(...framing.tool.map((value, i) => value + performance.toolOffset[i]));
        tool.group.rotation.set(-.045 + reach.progress * .025 + performance.toolRotation[0], -.08 + performance.toolRotation[1], -.025 + performance.toolRotation[2]);
        tool.update({ action: move, side: 'player', active: true, progress: performance.rawProgress, controlPressure: reach.progress });
        tool.group.updateMatrixWorld(true);
        const control = tool.controls[key], wrist = tool.group.localToWorld(new Vector3(...control.wrist.position));
        const wristRotation = tool.group.getWorldQuaternion(new Quaternion()).multiply(new Quaternion(...control.wrist.quaternion));
        const position = new Vector3(...framing.leftWrist.map((value, i) => value + performance.leftOffset[i])).lerp(wrist, reach.progress);
        position.z += reach.cameraArc;
        const rotation = new Quaternion().setFromEuler(new Euler(...performance.leftRotation)).slerp(wristRotation, reach.progress);
        left.setRootPose({ position: position.toArray(), quaternion: rotation });
        left.setFingerPose(blendPose({ ...performance.leftFingers, thumb: performance.thumb, spread: performance.spread }, control.pose, reach.closure));
        const leftSurface = posedSurface(left), rightSurface = posedSurface(right);
        const label = `${id}:${key} ${injury} ${withdrawing ? 'withdrawal' : 'reach'} ${amount}`;
        assertOutsideChassis(leftSurface.points, chassis, label);
        assertOutsideHand(leftSurface.points, rightSurface.surface, `${label} left`);
        assertOutsideHand(rightSurface.points, leftSurface.surface, `${label} right`);
        leftSurface.dispose(); rightSurface.dispose();
      }
    }
    right.dispose(); left.dispose(); tool.dispose();
  }
});
