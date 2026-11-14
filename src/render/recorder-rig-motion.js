const IDLE_PITCH = -Math.atan2(.13, .40);
export const BRACKET_POSITION = Object.freeze([0, .14, -.045]);
export const BRACKET_PITCH = -Math.PI / 2 - IDLE_PITCH;
export const BRACKET_LENS_Y = .1188457447;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const radians = degrees => degrees * Math.PI / 180;

// Three.js Euler XYZ, shared by the model and the world light.
export function rotateRecorderVector([x, y, z], [pitch, yaw, roll]) {
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const a = x * cr - y * sr, b = x * sr + y * cr;
  const c = z * cy - a * sy;
  return [a * cy + z * sy, b * cp - c * sp, b * sp + c * cp];
}

function lensOnCase(y) {
  const axial = rotateRecorderVector([0, y, 0], [BRACKET_PITCH, 0, 0]);
  return BRACKET_POSITION.map((value, axis) => value + axial[axis]);
}
const LENS = lensOnCase(BRACKET_LENS_Y + .012);
const AXIS = rotateRecorderVector([0, 1, 0], [BRACKET_PITCH, 0, 0]);
const RIGHT = [1, 0, 0];
const UP = rotateRecorderVector([0, 0, 1], [BRACKET_PITCH, 0, 0]);

export function recorderBracketFrame(pose) {
  const origin = rotateRecorderVector(LENS, pose.rotation).map((v, i) => v + pose.position[i]);
  return { origin, forward: rotateRecorderVector(AXIS, pose.rotation),
    right: rotateRecorderVector(RIGHT, pose.rotation), up: rotateRecorderVector(UP, pose.rotation) };
}

// Foot contacts come from accepted player travel and authored stair contacts.
// The spring is evaluated analytically so a late render cannot replay impacts.
export function createRecorderRigMotion() {
  let plant = null, previous = null, aimYaw = 0, aimPitch = 0, lowering = 0;
  return {
    reset() { plant = previous = null; aimYaw = aimPitch = lowering = 0; },
    footfall(event, now) {
      const speed = Number(event.speed) || 2.6;
      plant = { at: now - clamp(Number(event.latenessSeconds) || 0, 0, .1),
        interval: clamp(Number(event.interval) || .42, .22, .9),
        strength: clamp(.65 + speed * .16, .7, 1.85),
        side: event.footSide === 'left' ? -1 : 1 };
    },
    frame(now, { look, moving = false, raised = false, visible = true, lowered = false, reducedMotion = false, active = true } = {}) {
      const yaw = Number(look?.yaw) || 0, pitch = Number(look?.pitch) || 0;
      const dt = previous ? clamp(now - previous.now, 0, .1) : 0;
      const target = lowered ? 1 : 0;
      lowering = !previous || !raised || reducedMotion ? target : target + (lowering - target) * Math.exp(-dt * 19);
      if (active && previous && now > previous.now && now - previous.now < .25) {
        const turn = yaw - previous.yaw;
        aimYaw = clamp(aimYaw * Math.exp(-dt * 14) + Math.atan2(Math.sin(turn), Math.cos(turn)) * .40, -.09, .09);
        aimPitch = clamp(aimPitch * Math.exp(-dt * 14) - (pitch - previous.pitch) * .40, -.07, .07);
      } else { aimYaw = 0; aimPitch = 0; }
      previous = { now, yaw, pitch };
      const age = plant && active ? Math.max(0, now - plant.at) : Infinity;
      const stride = plant ? plant.interval : .42;
      const strength = plant && age < 1 ? plant.strength : 0;
      const phase = Number.isFinite(age) ? Math.min(1.4, age / stride) * Math.PI : 0;
      const swing = moving ? Math.sin(phase) * strength : 0;
      const impulse = Number.isFinite(age) ? Math.exp(-age * 11) * Math.sin(age * 17) * strength : 0;
      const side = plant?.side || 0;
      const scale = reducedMotion ? .18 : 1;
      const posture = raised ? 0 : visible ? 1 : 2;
      return {
        lowering,
        position: [scale * side * swing * .006, -.13 - .065 * posture - .34 * lowering - (visible ? 0 : .11) - scale * impulse * .014, -.40],
        rotation: [IDLE_PITCH - radians(7) * Math.min(1, posture + lowering) + scale * (aimPitch - impulse * .033 + swing * .005),
          scale * (aimYaw + side * (swing * .014 + impulse * .014)), scale * side * (swing * .018 + impulse * .015)],
      };
    },
  };
}
