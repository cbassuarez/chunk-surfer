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

// Held low in the right hand, where the corner view shows it, and aimed a few
// metres down the view. The walk's sway (radians, from the same footfall spring
// the recorder uses) moves the hand and the beam together.
export const HANDHELD_TORCH_REST = Object.freeze({ origin: Object.freeze([.24, -.27, -.34]), aimAt: 6 });
export function handheldTorchLamp({ sway = [0, 0, 0], drop = 0 } = {}) {
  const [pitch = 0, yaw = 0, roll = 0] = sway;
  const origin = [HANDHELD_TORCH_REST.origin[0] + roll * .05, HANDHELD_TORCH_REST.origin[1] - drop + pitch * .04, HANDHELD_TORCH_REST.origin[2]];
  const target = [Math.sin(yaw) * HANDHELD_TORCH_REST.aimAt, Math.sin(pitch) * HANDHELD_TORCH_REST.aimAt, -HANDHELD_TORCH_REST.aimAt];
  const forward = normalize(target.map((v, i) => v - origin[i]));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { origin, forward, right, up };
}
