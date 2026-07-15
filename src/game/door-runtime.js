export const DOOR_STATE = Object.freeze({
  CLOSED: 'closed', OPENING: 'opening', OPEN: 'open', CLOSING: 'closing',
});

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function freshDoorRuntime(definition) {
  const open = definition?.initialState === DOOR_STATE.OPEN;
  return {
    state: open ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED,
    openFraction: open ? 1 : 0,
    wedge: !!definition?.wedged,
    closerArmed: !!definition?.closerArmed,
    closeRequested: false,
  };
}

export function normalizeDoorEndpoint(value, definition) {
  const fresh = freshDoorRuntime(definition);
  if (!value || typeof value !== 'object') return fresh;
  const state = value.state === DOOR_STATE.OPEN ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED;
  return {
    ...fresh,
    state,
    openFraction: state === DOOR_STATE.OPEN ? 1 : 0,
    wedge: value.wedge == null ? fresh.wedge : !!value.wedge,
    closerArmed: value.closerArmed == null ? fresh.closerArmed : !!value.closerArmed,
  };
}

export function beginDoorOpen(runtime) {
  if (runtime.state === DOOR_STATE.OPEN || runtime.state === DOOR_STATE.OPENING) return false;
  runtime.state = DOOR_STATE.OPENING;
  runtime.closeRequested = false;
  return true;
}

export function beginDoorClose(runtime, { removeWedge = true } = {}) {
  if (runtime.wedge && removeWedge) runtime.wedge = false;
  if (runtime.wedge || runtime.state === DOOR_STATE.CLOSED || runtime.state === DOOR_STATE.CLOSING) return false;
  runtime.state = DOOR_STATE.CLOSING;
  runtime.closeRequested = true;
  return true;
}

export function requestCloser(runtime) {
  runtime.closerArmed = true;
  runtime.closeRequested = true;
}

export function advanceDoor(runtime, definition, dt, { sweepOccupied = false } = {}) {
  const previousState = runtime.state;
  const seconds = runtime.state === DOOR_STATE.CLOSING ? definition.closeSeconds : definition.openSeconds;
  const delta = Math.max(0, Number(dt) || 0) / Math.max(.05, seconds || .7);
  if (runtime.state === DOOR_STATE.OPENING) {
    runtime.openFraction = clamp01(runtime.openFraction + delta);
    if (runtime.openFraction >= 1) runtime.state = DOOR_STATE.OPEN;
  } else if (runtime.state === DOOR_STATE.CLOSING) {
    if (!sweepOccupied) runtime.openFraction = clamp01(runtime.openFraction - delta);
    if (runtime.openFraction <= 0) {
      runtime.state = DOOR_STATE.CLOSED;
      runtime.closeRequested = false;
    }
  } else if (runtime.state === DOOR_STATE.OPEN && runtime.closeRequested && !runtime.wedge && !sweepOccupied) {
    runtime.state = DOOR_STATE.CLOSING;
  }
  return previousState !== runtime.state ? runtime.state : null;
}

export function doorBlocksPassage(runtime) { return runtime.openFraction < .85; }

export function stableDoorEndpoint(runtime) {
  const open = runtime.state === DOOR_STATE.OPEN || runtime.state === DOOR_STATE.OPENING;
  return { state: open ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED, wedge: !!runtime.wedge, closerArmed: !!runtime.closerArmed };
}

export function normalizeDoorSave(value) {
  const source = value && typeof value === 'object' ? value : {};
  const states = source.states && typeof source.states === 'object' && !Array.isArray(source.states) ? source.states : {};
  return {
    schema: 2,
    states: Object.fromEntries(Object.entries(states).filter(([id, endpoint]) => (
      typeof id === 'string' && id.length <= 96 && endpoint && typeof endpoint === 'object'
    )).map(([id, endpoint]) => [id, {
      state: endpoint.state === DOOR_STATE.OPEN ? DOOR_STATE.OPEN : DOOR_STATE.CLOSED,
      wedge: !!endpoint.wedge,
      closerArmed: !!endpoint.closerArmed,
    }])),
    legacyOpen: Array.isArray(source.open) ? source.open.filter((id) => typeof id === 'string').slice(0, 64) : [],
  };
}

export function pointInDoorSweep(portal, x, y, radius = .72) {
  const dx = Number(x) - portal.cx, dy = Number(y) - portal.cy;
  const leafReachCells = Math.max(1.4, (portal.leaf?.width || 1) * 2 + radius);
  const cross = portal.widthAxis === 'x' ? Math.abs(dx) : Math.abs(dy);
  const along = portal.widthAxis === 'x' ? Math.abs(dy) : Math.abs(dx);
  return cross <= leafReachCells && along <= leafReachCells;
}
