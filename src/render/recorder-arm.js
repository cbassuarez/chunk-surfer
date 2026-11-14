import { Vector3 } from 'three';

const UPPER = .31, FOREARM = .27;
const LONG = new Vector3(0, 1, 0);

export function recorderElbow(side, wrist, handRotation) {
  const shoulder = new Vector3(side * .22, -.20, .10);
  const axis = wrist.clone().sub(shoulder);
  const distance = Math.max(.00001, axis.length());
  axis.divideScalar(distance);
  const along = (UPPER ** 2 - FOREARM ** 2 + distance ** 2) / (2 * distance);
  const centre = shoulder.clone().addScaledVector(axis, along);
  const radius = Math.sqrt(Math.max(0, UPPER ** 2 - along ** 2));
  const long = LONG.clone().applyQuaternion(handRotation);
  const pole = wrist.clone().addScaledVector(long, -FOREARM).sub(centre);
  pole.addScaledVector(axis, -pole.dot(axis));
  if (pole.lengthSq() < 1e-10) {
    pole.set(side, -1, 0);
    pole.addScaledVector(axis, -pole.dot(axis));
  }
  const elbow = centre.addScaledVector(pole.normalize(), radius);
  return { shoulder, elbow, long, reachable: distance <= UPPER + FOREARM && distance >= UPPER - FOREARM };
}
