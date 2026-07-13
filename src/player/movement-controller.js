export const MOVEMENT_DEFAULTS = Object.freeze({
  maxSpeed: 2.65,
  reverseSpeedScale: 0.72,
  strafeSpeedScale: 0.78,
  accel: 16.0,
  brake: 22.0,
  friction: 18.0,
  keyboardTurnRate: Math.PI * 0.92,
  mouseSensitivity: 0.0024,
  pitchMin: -0.95,
  pitchMax: 0.95,
});

export function createMotionState({ x = 0, z = 0, yaw = 0 } = {}) {
  return {
    pos: { x, z },
    prevPos: { x, z },
    vel: { x: 0, z: 0 },
    yaw,
    targetYaw: yaw,
    visualYaw: yaw,
    pitch: 0,
    targetPitch: 0,
    visualPitch: 0,
    lastInputGeneration: 0,
  };
}

export function updateMovement(state, input, dt, { config = MOVEMENT_DEFAULTS, collision = null } = {}) {
  state.prevPos.x = state.pos.x;
  state.prevPos.z = state.pos.z;
  state.lastInputGeneration = input.generation ?? state.lastInputGeneration;

  state.targetYaw += (Number(input.turnX) || 0) * config.keyboardTurnRate * dt;
  state.targetYaw += (Number(input.pointerDx) || 0) * config.mouseSensitivity;
  state.targetPitch = clamp(state.targetPitch - (Number(input.pointerDy) || 0) * config.mouseSensitivity, config.pitchMin, config.pitchMax);

  const desiredLocal = normalize2({
    x: (Number(input.moveX) || 0) * config.strafeSpeedScale,
    z: (Number(input.moveY) || 0) * ((Number(input.moveY) || 0) < 0 ? config.reverseSpeedScale : 1),
  });
  const desiredSpeed = Math.hypot(desiredLocal.x, desiredLocal.z) > 0 ? config.maxSpeed : 0;
  const sin = Math.sin(state.targetYaw);
  const cos = Math.cos(state.targetYaw);
  const targetVel = {
    x: ((desiredLocal.x * cos) + (desiredLocal.z * sin)) * desiredSpeed,
    z: ((desiredLocal.z * cos) - (desiredLocal.x * sin)) * desiredSpeed,
  };
  const moving = desiredSpeed > 0;
  const rate = moving ? config.accel : config.brake;
  const t = 1 - Math.exp(-rate * dt);
  state.vel.x += (targetVel.x - state.vel.x) * t;
  state.vel.z += (targetVel.z - state.vel.z) * t;
  if (!moving) {
    const f = Math.exp(-config.friction * dt);
    state.vel.x *= f;
    state.vel.z *= f;
    if (Math.hypot(state.vel.x, state.vel.z) < 0.006) {
      state.vel.x = 0;
      state.vel.z = 0;
    }
  }
  const next = { x: state.pos.x + state.vel.x * dt, z: state.pos.z + state.vel.z * dt };
  const resolved = collision?.resolveMove ? collision.resolveMove(state.pos, next, state) : next;
  state.pos.x = resolved.x;
  state.pos.z = resolved.z;
  return state;
}

export function interpolatePosition(state, alpha) {
  const t = clamp(alpha, 0, 1);
  return { x: lerp(state.prevPos.x, state.pos.x, t), z: lerp(state.prevPos.z, state.pos.z, t) };
}

export function normalize2(v) {
  const len = Math.hypot(v.x, v.z);
  if (len <= 1e-6) return { x: 0, z: 0 };
  return { x: v.x / Math.max(1, len), z: v.z / Math.max(1, len) };
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
