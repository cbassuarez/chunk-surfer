export const HOME_OLDV_STEP_LIMIT = 16;

// The notice belongs to the commons. The snow beside the pump retains the
// part of the approach that contains the bends around the trough and verge.
const commons = { left: -28, right: -15, near: 48, far: 59 };
const inCommons = (x, z, margin = 0) => x >= commons.left - margin && x <= commons.right + margin
  && z >= commons.near - margin && z <= commons.far + margin;
const onPumpSnow = (x, z, margin = 0) => x >= -28 - margin && x <= -20 + margin
  && z >= 48 - margin && z <= 55.5 + margin;

export function advanceHomeOldv(homeState, x, z) {
  const oldv = homeState?.oldv;
  if (oldv?.returned) return homeState;
  if (oldv?.left && inCommons(x, z)) {
    return { ...homeState, oldv: { ...oldv, returned: true } };
  }
  if (!oldv && inCommons(x, z)) {
    return { ...homeState, oldv: { steps: [], left: false, returned: false } };
  }
  if (oldv && !oldv.left && !inCommons(x, z, 4)) {
    return { ...homeState, oldv: { ...oldv, left: true } };
  }
  return homeState;
}

export function rememberHomeFootfall(homeState, x, z, yaw, step, snowUnderfoot) {
  const oldv = homeState?.oldv;
  if (!oldv || oldv.left || !snowUnderfoot || !onPumpSnow(x, z)) return homeState;
  const side = step % 2 === 0 ? 1 : -1;
  const heading = Math.atan2(Math.sin(yaw), Math.cos(yaw));
  const row = [x + Math.cos(heading) * side * .104,
    z - Math.sin(heading) * side * .104, heading, side];
  const steps = [...oldv.steps.slice(1 - HOME_OLDV_STEP_LIMIT), row];
  return { ...homeState, oldv: { ...oldv, steps } };
}

export function normalizeHomeOldv(value) {
  if (!value || !Array.isArray(value.steps)) return null;
  const steps = value.steps.slice(-HOME_OLDV_STEP_LIMIT).filter(row =>
    Array.isArray(row) && row.length === 4 && row.every(Number.isFinite)
    && onPumpSnow(row[0], row[1], .11)
    && Math.abs(row[2]) <= Math.PI && (row[3] === -1 || row[3] === 1));
  return { steps, left: value.left === true, returned: value.left === true && value.returned === true };
}
