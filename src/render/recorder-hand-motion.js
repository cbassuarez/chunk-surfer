import { Quaternion, Vector3 } from 'three';
import { RECORDER_BRACE, RECORDER_PRESS } from './recorder-hand-poses.js';

export const RECORDER_KEY_X = Object.freeze([.0341, .071, .108]);
export const RECORDER_KEY_Y = -.0555;
export const RECORDER_KEY_Z = .0308;
export const RECORDER_KEY_FACE = .0016;
export const RECORDER_KEY_TRAVEL = .002;

const HOVER = .019;
const blend = (a, b, t) => a + (b - a) * t;
const smooth = value => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

// Retract before crossing the face. At contact the same displacement moves
// the key cap and the index pad. The recorder can accept input immediately.
export function recorderKeyMotion(elapsed, { from, to, initialApproach = 0, releaseAge = 0, reducedMotion = false }) {
  const withdraw = initialApproach && Math.abs(from - to) > .001 ? 44 : 0;
  const reach = elapsed - withdraw;
  const x = reducedMotion || reach >= 78 ? to : blend(from, to, smooth(reach / 78));
  const arrival = reducedMotion ? 0 : 114;
  const pressure = smooth((reach - arrival) / 28) * (1 - smooth(releaseAge / 40));
  const retreat = 1 - smooth((releaseAge - 40) / (reducedMotion ? 24 : 80));
  let approach = (reducedMotion ? 1 : smooth((reach - 62) / 52)) * retreat;
  if (!reducedMotion && reach < 0) approach = initialApproach * (1 - smooth(elapsed / withdraw));
  return { x, approach, pressure };
}

export function poseRecorderBrace(hand, caseGroup) {
  hand.setFingerPose(RECORDER_BRACE.pose);
  hand.setRootPose({
    position: caseGroup.localToWorld(new Vector3(...RECORDER_BRACE.position)),
    quaternion: caseGroup.quaternion.clone().multiply(new Quaternion(...RECORDER_BRACE.quaternion)),
  });
}

export function poseRecorderIndex(hand, caseGroup, { x, approach, travel }) {
  const { quaternion, hoverIndex, pose } = RECORDER_PRESS;
  const target = new Vector3(x, RECORDER_KEY_Y,
    RECORDER_KEY_Z + RECORDER_KEY_FACE + HOVER * (1 - approach) - RECORDER_KEY_TRAVEL * travel);
  const orientation = caseGroup.quaternion.clone().multiply(new Quaternion(...quaternion));
  hand.setRootPose({ position: [0, 0, 0], quaternion: orientation });
  hand.setFingerPose({ ...pose, index: hoverIndex.map((angle, i) => blend(angle, pose.index[i], approach)) });
  hand.setRootPose({ position: caseGroup.localToWorld(target).sub(hand.getPad('index').position) });
}
