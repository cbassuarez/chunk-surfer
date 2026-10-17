// Bronze Reliquary production bind contract. Metres, Y up, portrait faces +Z.
// Geometry carries the old anisotropic tape placement in its bind shape; skin
// it before remapping to tape so rotating stone never changes its proportions.
const joints = [
  ['root', null, [0, 0, 0]],
  ['neck_yaw', 'root', [-.24, 4.94, -.05]],
  ['neck_pitch', 'neck_yaw', [-.24, 4.94, -.05]],
  ['eye_L_yaw', 'neck_pitch', [-.67, 5.71, .445]],
  ['eye_L_pitch', 'eye_L_yaw', [-.67, 5.71, .445]],
  ['eye_L', 'eye_L_pitch', [-.67, 5.71, .445]],
  ['shutter_L', 'neck_pitch', [-.67, 5.71, .445]],
  ['eye_R_yaw', 'neck_pitch', [-.05, 5.71, .515]],
  ['eye_R_pitch', 'eye_R_yaw', [-.05, 5.71, .515]],
  ['eye_R', 'eye_R_pitch', [-.05, 5.71, .515]],
  ['shutter_R', 'neck_pitch', [-.05, 5.71, .515]],
  ['seal_plunger', 'root', [0, 1.25, .794]],
  ['linkage_L', 'root', [-.67, 1.25, .94]],
  ['linkage_R', 'root', [.67, 1.25, .94]],
  ['neck_latch', 'root', [-.24, 4.94, -.38]],
  ['seal_latch', 'root', [0, 1.25, .61]],
];
export const BUST_RELIQUARY_RIG = Object.freeze({
  version: 1, design: 'The Bronze Reliquary', assetWorldHeight: 6.5,
  worldToTapeScale: Object.freeze([4 / 3, 2, 2]),
  joints: Object.freeze(joints.map(([name, parent, pivot], index) => Object.freeze({name, parent, pivot: Object.freeze(pivot), index}))),
  jointIndex: Object.freeze(Object.fromEntries(joints.map(([name], index) => [name, index]))),
  neckPivot: Object.freeze([-.24, 4.94, -.05]),
  eyeCenters: Object.freeze({L: Object.freeze([-.67, 5.71, .445]), R: Object.freeze([-.05, 5.71, .515])}),
  eyeRadius: .105, sealCenter: Object.freeze([0, 1.25, .794]),
  sealRadius: .43, sealTravel: .035,
  collisionEnvelope: Object.freeze([2.1, 1.11]),
  clips: Object.freeze({'recognition-returned': 10, 'recognition-carried': 10, ritual: 5, settled: 1, blind: 1}),
  limits: Object.freeze({neckYaw: 22 * Math.PI / 180, neckPitch: 14 * Math.PI / 180, eyeYaw: 18 * Math.PI / 180, eyePitch: 12 * Math.PI / 180}),
});
