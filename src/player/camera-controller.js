export const CAMERA_DEFAULTS = Object.freeze({ yawFollow: 22.0, pitchFollow: 24.0 });

export function updateCameraVisual(state, dt, { config = CAMERA_DEFAULTS } = {}) {
  const yawDelta = shortestAngle(state.targetYaw - state.visualYaw);
  const yawT = 1 - Math.exp(-config.yawFollow * dt);
  const pitchT = 1 - Math.exp(-config.pitchFollow * dt);
  state.visualYaw += yawDelta * yawT;
  state.visualPitch += (state.targetPitch - state.visualPitch) * pitchT;
  state.yaw = state.targetYaw;
  state.pitch = state.targetPitch;
  return state;
}

export function shortestAngle(a) {
  let x = Number(a) || 0;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

export function snapCameraVisual(state) {
  state.visualYaw = state.targetYaw;
  state.visualPitch = state.targetPitch;
  return state;
}
