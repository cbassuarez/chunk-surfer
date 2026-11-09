const NEAR = .05;
const FAR = 120;

export function sourceViewCamera({ camX = 0, camY = 0, camZ = 0, yaw = 0, pitch = 0, aspect = 1.6, near = NEAR, far = FAR } = {}) {
  const f = 1 / 0.95;
  const n = Math.max(.01, Number(near) || NEAR), fa = Math.max(n + 1, Number(far) || FAR);
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (fa + n) / (n - fa), -1,
    0, 0, (2 * fa * n) / (n - fa), 0,
  ]);
  const cp = Math.cos(pitch);
  const fwd = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const z = [-fwd[0], -fwd[1], -fwd[2]];
  const xl = Math.max(0.0001, Math.hypot(z[0], z[2]));
  const x = [z[2] / xl, 0, -z[0] / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const eye = [camX, camY, camZ];
  const view = new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2], 1,
  ]);
  return { view, projection, forward: fwd };
}
