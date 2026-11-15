// HANDS AND THE LIGHT. Seb, 2026-11-14: a torch needs a hand. The DA-1000 held
// up in front of you takes both, so there is no lighting up with the machine in
// your face, and there is no light on the recorder any more. A headlamp, kitted
// out at the van instead of a handheld light, needs no hands at all.
//
// Mid-take the torch is still allowed. It costs what it really costs: the deck
// comes down off your chest on its strap (the take keeps rolling), a hand goes
// for the torch, and all of that handling is on the tape.

export const HEADLAMP_KIT = 'headlamp';

export function torchKind(fieldKit) {
  return fieldKit?.flashlight === HEADLAMP_KIT ? 'headlamp' : 'handheld';
}

// What reaching for the light does from what the hands are doing now.
//   recorder: 'raised' (both hands on the machine) or 'away' (on its strap, in
//   the case, or lowered while it rolls).
//   carrying: something held in both arms (a body, a load).
export function torchReach({ kind = 'handheld', lightOn = false, recorder = 'away', recording = false, carrying = false } = {}) {
  if (lightOn) return { action: 'off', noise: kind === 'headlamp' ? 'headlamp-click' : 'torch-click' };
  if (kind === 'headlamp') return { action: 'on', noise: 'headlamp-click' };
  if (carrying) return { action: 'refuse', reason: 'hands-full' };
  if (recorder === 'raised') return { action: 'stow-recorder', noise: recording ? 'recorder-stow' : 'recorder-away' };
  return { action: 'on', noise: 'torch-click' };
}

// Raising the machine takes both hands: a lit handheld torch goes back in the
// pocket first. A headlamp stays on.
export function recorderRaiseCost({ kind = 'handheld', lightOn = false } = {}) {
  return kind === 'handheld' && lightOn ? 'torch-away' : null;
}

// How loud the handling is, on the same scale as every other sound the
// recordist makes (REC.emitNoise; ROOM_TONE.spoilNoise is .18). The stow is
// cloth, the strap's buckle and the case against the hip, close to the mic:
// plainly on the tape and something a listener can hear, but not by itself
// enough to ruin it. Done near anything else loud, it will.
export const TORCH_HANDLING_NOISE = Object.freeze({
  'torch-click': .02,
  'headlamp-click': .02,
  'recorder-away': .04,
  'recorder-stow': .14,
  'torch-away': .06,
});

// The light's origin and aim in view space (+X right, +Y up, -Z forward,
// metres), as torch-optics.js resolveRecorderLamp reads a lamp.
export const HEADLAMP_LAMP = Object.freeze({
  origin: Object.freeze([0, .085, .04]),
  forward: Object.freeze([0, 0, -1]),
  right: Object.freeze([1, 0, 0]),
  up: Object.freeze([0, 1, 0]),
});

const normalize = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// THE KIT TORCHES AS THE HAND HOLDS THEM. One pose drives both the drawn torch
// (render/torch-rig.js) and the world's beam, so the light leaves the lens you
// can see. Everything here is in view space: +X right, +Y up, -Z forward, metres.
//
// The models are the van's own (scripts/bench-model-details.mjs benchFlashlight),
// authored in bench units. One scale for the whole family: the FL-1's barrel
// (radius .132) is the 23 mm handle the recordist grip was baked against
// (render/battle-hand-grips.js HANDLE_GRIPS.torch, wrapped-tool-print.js).
// That makes the FL-1 257 mm long with a 64 mm lens, about a two-cell Maglite.
export const TORCH_MODEL_SCALE = .023 / .132;
// The grip frame is the baked grip's: the barrel along +Y, its middle at
// y = -.015. Measured from the GLBs (barrel .132..1.292, so its middle is .712).
const BARREL_MIDDLE = .712, GRIP_MIDDLE = -.015;
// lens: the centre of the clear optic. beam: the way it faces. up: the model
// axis that faces up in the hand. The FL-3 is a right-angle light: its head
// faces off the side of the barrel, so the barrel stands upright in the fist.
export const HANDHELD_TORCH_MODELS = Object.freeze({
  reference: Object.freeze({ model: 'flashlight-reference', barrelRadius: .132, lens: Object.freeze([0, 1.47, 0]), beam: Object.freeze([0, 1, 0]), up: Object.freeze([0, 0, 1]) }),
  throw: Object.freeze({ model: 'flashlight-throw', barrelRadius: .14, lens: Object.freeze([0, 1.595, 0]), beam: Object.freeze([0, 1, 0]), up: Object.freeze([0, 0, 1]) }),
  flood: Object.freeze({ model: 'flashlight-flood', barrelRadius: .163, lens: Object.freeze([0, 1.322, .218]), beam: Object.freeze([0, 0, 1]), up: Object.freeze([0, 1, 0]) }),
});
export function torchModelToGrip([x, y, z]) {
  return [x * TORCH_MODEL_SCALE, (y - BARREL_MIDDLE) * TORCH_MODEL_SCALE + GRIP_MIDDLE, z * TORCH_MODEL_SCALE];
}

// Close in, the way a torch is carried to see by: the fist about a forearm's
// length in front of the chest, a little right of centre, the beam aimed to
// meet the middle of the view a few metres ahead. `grip` is where the grip
// frame's origin sits; `roll` cants the torch about its beam.
export const HANDHELD_TORCH_POSE = Object.freeze({ grip: Object.freeze([.15, -.24, -.33]), aimAt: 6, roll: 0 });

// A rotation (3x3, rows) taking the local pair (beam, up) onto (forward, upward).
function alignBasis(beam, up, forward, upward) {
  const lb = normalize(beam), lu = normalize(sub(up, lb.map((v) => v * dot(up, lb)))), lr = cross(lb, lu);
  const tb = normalize(forward), tu = normalize(sub(upward, tb.map((v) => v * dot(upward, tb)))), tr = cross(tb, tu);
  return [0, 1, 2].map((i) => [0, 1, 2].map((j) => tb[i] * lb[j] + tu[i] * lu[j] + tr[i] * lr[j]));
}
const apply = (m, v) => m.map((row) => dot(row, v));
function quaternionOf(m) {
  const [[a, b, c], [d, e, f], [g, h, k]] = m, trace = a + e + k;
  let q;
  if (trace > 0) { const s = .5 / Math.sqrt(trace + 1); q = [(h - f) * s, (c - g) * s, (d - b) * s, .25 / s]; }
  else if (a > e && a > k) { const s = 2 * Math.sqrt(1 + a - e - k); q = [.25 * s, (b + d) / s, (c + g) / s, (h - f) / s]; }
  else if (e > k) { const s = 2 * Math.sqrt(1 + e - a - k); q = [(b + d) / s, .25 * s, (f + h) / s, (c - g) / s]; }
  else { const s = 2 * Math.sqrt(1 + k - a - e); q = [(c + g) / s, (f + h) / s, .25 * s, (d - b) / s]; }
  return normalize(q);
}
const rotateAbout = (v, axis, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle), k = cross(axis, v), d = dot(axis, v);
  return v.map((x, i) => x * c + k[i] * s + axis[i] * d * (1 - c));
};

// The walk's sway (radians, from the footfall spring the recorder uses) moves
// the hand and the beam together. Returns the grip frame for drawing and the
// lamp frame (lens origin, beam axis) for the world, from the same rotation.
export function handheldTorchPose({ model = 'reference', sway = [0, 0, 0], drop = 0, pose = HANDHELD_TORCH_POSE } = {}) {
  const spec = HANDHELD_TORCH_MODELS[model] || HANDHELD_TORCH_MODELS.reference;
  const [pitch = 0, yaw = 0, roll = 0] = sway;
  const grip = [pose.grip[0] + roll * .05, pose.grip[1] - drop + pitch * .04, pose.grip[2]];
  const target = [Math.sin(yaw) * pose.aimAt, Math.sin(pitch) * pose.aimAt, -pose.aimAt];
  const forward = normalize(sub(target, grip));
  const upward = rotateAbout([0, 1, 0], forward, Number(pose.roll) || 0);
  const rotation = alignBasis(spec.beam, spec.up, forward, upward);
  const origin = grip.map((v, i) => v + apply(rotation, torchModelToGrip(spec.lens))[i]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { model: spec.model, barrelRadius: spec.barrelRadius * TORCH_MODEL_SCALE, grip, rotation,
    quaternion: quaternionOf(rotation), scale: TORCH_MODEL_SCALE, lamp: { origin, forward, right, up } };
}
export function handheldTorchLamp(options = {}) {
  return handheldTorchPose(options).lamp;
}
