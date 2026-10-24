import { SOURCE_EARTHFALL as C, SOURCE_EARTHFALL_CUES, SOURCE_EARTHFALL_MATERIAL_CELL, earthfallContains, earthfallCatchHeight, earthfallCatchVelocity, earthfallExitDoorHeight, sourceEarthfallFracturePose } from '../data/source-earthfall.js';

const copy = value => JSON.parse(JSON.stringify(value));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));
const angle = value => Math.atan2(Math.sin(finite(value)), Math.cos(finite(value)));
const phases = new Set(['intact', 'fracturing', 'falling', 'catching', 'landed']);
const cueTypes = new Set([...SOURCE_EARTHFALL_CUES.map(cue => cue.type), 'catch', 'land']);
const withinDoor = x => Math.abs(x) <= C.door.width / 2 - C.bodyRadius;
const receiptId = (state, type) => `${C.sequenceId}:${state.runId}:${type}`;
const localPose = value => value && typeof value === 'object' ? copy(value) : null;

export function freshSourceEarthfall({ runId = '', returnPose = null } = {}) {
  return { version: C.version, sequenceId: C.sequenceId, runId: String(runId), status: 'active', phase: 'intact',
    ...C.spawn, clock: 0, elapsed: 0, accumulator: 0, committed: false, committedAt: null,
    velocityY: 0, catchElapsed: 0, catchVelocity: -C.terminalSpeed,
    entryDoor: { open: true, progress: 1 }, exitDoor: { open: false, progress: 0 },
    receipts: [], exitReceipt: null, returnPose: localPose(returnPose) };
}

export function normalizeSourceEarthfall(value, { runId, returnPose } = {}) {
  const fresh = freshSourceEarthfall({ runId: runId ?? value?.runId ?? '', returnPose: returnPose ?? value?.returnPose });
  if (!value || value.version !== C.version || value.sequenceId !== C.sequenceId
    || runId != null && String(runId) !== String(value.runId)) return fresh;
  const state = { ...fresh,
    status: ['active', 'returned', 'completed'].includes(value.status) ? value.status : 'active',
    phase: phases.has(value.phase) ? value.phase : 'intact',
    x: finite(value.x, fresh.x), z: finite(value.z, fresh.z),
    feet: clamp(value.feet, C.lowerFloor, C.upperFloor), yaw: angle(value.yaw), pitch: clamp(value.pitch ?? 0, -1.3, 1.3),
    clock: Math.max(0, finite(value.clock)), elapsed: Math.max(0, finite(value.elapsed)),
    accumulator: clamp(value.accumulator ?? 0, 0, C.fixedStep), committed: !!value.committed,
    committedAt: Number.isFinite(value.committedAt) ? Math.max(0, value.committedAt) : null,
    velocityY: clamp(value.velocityY ?? 0, -C.terminalSpeed, 0),
    catchElapsed: clamp(value.catchElapsed ?? 0, 0, C.catch.settleSeconds),
    catchVelocity: clamp(value.catchVelocity ?? -C.terminalSpeed, -C.terminalSpeed, 0),
    entryDoor: { open: value.entryDoor?.open !== false, progress: clamp(value.entryDoor?.progress ?? 1, 0, 1) },
    exitDoor: { open: !!value.exitDoor?.open, progress: clamp(value.exitDoor?.progress ?? 0, 0, 1) },
    returnPose: localPose(value.returnPose) || fresh.returnPose,
  };
  const seen = new Set();
  state.receipts = (Array.isArray(value.receipts) ? value.receipts : []).filter(receipt => cueTypes.has(receipt?.type)
    && Number.isFinite(receipt.at) && !seen.has(receipt.type) && seen.add(receipt.type)).map(receipt => ({
      id: receiptId(state, receipt.type), type: receipt.type, at: clamp(receipt.at, 0, state.clock),
      position: { x: finite(receipt.position?.x), y: finite(receipt.position?.y), z: finite(receipt.position?.z) },
      gain: clamp(receipt.gain ?? .5, 0, 1),
    }));
  if (!state.committed) {
    state.phase = 'intact'; state.feet = C.upperFloor; state.velocityY = 0;
    state.elapsed = 0; state.committedAt = null; state.catchElapsed = 0; state.receipts = [];
    state.exitDoor = { open: false, progress: 0 };
  } else {
    state.committedAt ??= Math.max(0, state.clock - state.elapsed);
    state.clock = Math.max(state.clock, state.committedAt + state.elapsed);
    if (state.phase === 'intact') state.phase = 'fracturing';
    if (state.phase === 'catching') {
      state.feet = earthfallCatchHeight(state.catchElapsed, state.catchVelocity);
      state.velocityY = earthfallCatchVelocity(state.catchElapsed, state.catchVelocity);
    }
    if (state.phase === 'landed' || state.status === 'completed') {
      state.phase = 'landed'; state.feet = C.lowerFloor; state.velocityY = 0; state.catchElapsed = C.catch.settleSeconds;
    }
    if (state.phase !== 'landed') state.exitDoor = { open: false, progress: 0 };
  }
  if (state.status === 'completed') state.exitReceipt = { id: `${C.sequenceId}:${state.runId}:source-II`, delivered: !!value.exitReceipt?.delivered };
  return state;
}

export function sourceEarthfallSupportAt(x, z, value = {}) {
  const state = normalizeSourceEarthfall(value);
  const upper = state.phase === 'intact' || state.phase === 'fracturing';
  if (!earthfallContains(upper ? C.earth : C.catch, x, z)) return null;
  if (upper) return { id: 'earthfall-upper-earth', y: C.upperFloor, material: 'source-earth', kind: 'earth' };
  const y = state.phase === 'catching' ? earthfallCatchHeight(state.catchElapsed, state.catchVelocity)
    : state.phase === 'landed' ? C.lowerFloor : C.catch.interceptY;
  return { id: 'earthfall-folio-catch', y, material: 'source-folio', kind: 'catch' };
}

function receipt(state, type, events) {
  if (state.receipts.some(item => item.type === type)) return;
  const position = type === 'catch' || type === 'land' ? { x: state.x, y: state.feet, z: state.z }
    : type === 'footing-loss' ? { x: state.x, y: C.upperFloor, z: state.z }
    : { x: 0, y: C.upperFloor, z: -14 };
  const item = { id: receiptId(state, type), type, at: state.clock, position,
    gain: SOURCE_EARTHFALL_CUES.find(cue => cue.type === type)?.gain ?? (type === 'land' ? .25 : .4) };
  state.receipts.push(item); events.push({ ...copy(item), age: 0 });
}

const doorFrame = (state, kind) => ({ id: `source-earthfall-${kind}`, kind,
  x: 0, z: kind === 'entry' ? 0 : C.passage.exitZ, y: kind === 'entry' ? C.upperFloor : earthfallExitDoorHeight(state.elapsed),
  width: C.door.width, height: C.door.height,
  open: !!state[`${kind}Door`].open, progress: state[`${kind}Door`].progress,
  passable: state[`${kind}Door`].progress >= 1 - 1e-8 && (kind === 'entry' ? ['intact', 'fracturing'].includes(state.phase) : state.phase === 'landed'),
  locked: kind === 'exit' && state.phase !== 'landed',
});

export function sourceEarthfallFocus(value) {
  const state = normalizeSourceEarthfall(value);
  if (state.status !== 'active') return null;
  for (const kind of ['entry', 'exit']) {
    const door = doorFrame(state, kind);
    if (Math.abs(state.feet - door.y) > .45 || Math.hypot(state.x, state.z - door.z) > C.door.focusDistance) continue;
    if (kind === 'entry' && !['intact', 'fracturing'].includes(state.phase)) continue;
    return { ...door, title: door.locked ? 'THE DOOR IS BELOW YOU' : door.open ? 'CLOSE THE DOOR' : 'OPEN THE DOOR',
      position: { x: door.x, y: door.y + 1.1, z: door.z } };
  }
  return null;
}

function interact(state, events) {
  const focus = sourceEarthfallFocus(state);
  if (!focus || focus.locked) return;
  const door = state[`${focus.kind}Door`]; door.open = !door.open;
  events.push({ type: 'door', id: focus.id, open: door.open });
}

function crossingX(from, to, z) {
  return from.x + (to.x - from.x) * ((z - from.z) / ((to.z - from.z) || 1));
}
function doorBlocks(state, from, to) {
  for (const kind of ['entry', 'exit']) {
    const door = doorFrame(state, kind);
    if (Math.abs(state.feet - door.y) > .45 || (from.z > door.z) === (to.z > door.z)) continue;
    const x = crossingX(from, to, door.z);
    if (Math.abs(x) <= C.door.width / 2 + C.bodyRadius && (!door.passable || !withinDoor(x))) return true;
  }
  return false;
}
function move(state, input, dt, events) {
  if (input.acceptedStep === false) return;
  const forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1);
  const length = Math.max(1, Math.hypot(forward, side));
  const grounded = ['intact', 'fracturing', 'landed'].includes(state.phase);
  const amount = (grounded ? C.walkSpeed : C.airSpeed) * dt / length;
  const dx = (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * amount;
  const dz = (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * amount;
  const from = { x: state.x, z: state.z }, to = { x: state.x + dx, z: state.z + dz };
  // Grounded movement ends at the actual finite sheet, whose edge is rendered.
  // Airborne movement never snaps or clamps to an invisible path/corridor.
  if (grounded && !earthfallContains(state.phase === 'landed' ? C.catch : C.earth, to.x, to.z, C.bodyRadius) || doorBlocks(state, from, to)) return;
  state.x = to.x; state.z = to.z;
  if (!state.committed && from.z > C.commitmentZ && to.z <= C.commitmentZ
    && to.z < from.z) {
    state.committed = true; state.committedAt = state.clock; state.elapsed = 0; state.phase = 'fracturing';
    receipt(state, 'strain', events);
  }
  if (['intact', 'fracturing'].includes(state.phase) && from.z < 0 && to.z >= 0 && withinDoor(crossingX(from, to, 0)) && doorFrame(state, 'entry').passable) {
    state.status = 'returned'; events.push({ type: 'return', returnPose: copy(state.returnPose), committed: state.committed });
  }
  if (state.phase === 'landed' && from.z > C.passage.exitZ && to.z <= C.passage.exitZ
    && withinDoor(crossingX(from, to, C.passage.exitZ)) && doorFrame(state, 'exit').passable) {
    state.status = 'completed'; state.exitReceipt = { id: `${C.sequenceId}:${state.runId}:source-II`, delivered: false };
    events.push({ type: 'enter-source-II', receipt: state.exitReceipt.id });
  }
}

function tick(state, input, dt, events) {
  state.clock += dt;
  for (const kind of ['entry', 'exit']) {
    const door = state[`${kind}Door`];
    if (kind === 'exit' && state.phase !== 'landed') { door.open = false; door.progress = 0; }
    else door.progress = clamp(door.progress + (door.open ? 1 : -1) * dt / C.door.openSeconds, 0, 1);
  }
  if (state.committed) state.elapsed = Math.max(state.elapsed, state.clock - state.committedAt);
  for (const cue of SOURCE_EARTHFALL_CUES) if (state.committed && state.elapsed + 1e-8 >= cue.at) receipt(state, cue.type, events);
  if (state.phase === 'fracturing' && state.elapsed + 1e-8 >= C.footingLossAt) {
    state.phase = 'falling'; state.velocityY = 0;
  }
  move(state, input, dt, events);
  if (state.status !== 'active') return;
  if (state.phase === 'falling') {
    state.velocityY = Math.max(-C.terminalSpeed, state.velocityY - C.gravity * dt);
    const next = state.feet + state.velocityY * dt;
    if (next <= C.catch.interceptY && earthfallContains(C.catch, state.x, state.z)) {
      state.feet = C.catch.interceptY; state.phase = 'catching'; state.catchElapsed = 0; state.catchVelocity = state.velocityY;
      receipt(state, 'catch', events);
    } else state.feet = next;
  } else if (state.phase === 'catching') {
    state.catchElapsed = Math.min(C.catch.settleSeconds, state.catchElapsed + dt);
    state.feet = earthfallCatchHeight(state.catchElapsed, state.catchVelocity);
    state.velocityY = earthfallCatchVelocity(state.catchElapsed, state.catchVelocity);
    if (state.catchElapsed + 1e-8 >= C.catch.settleSeconds) {
      state.phase = 'landed'; state.feet = C.lowerFloor; state.velocityY = 0; receipt(state, 'land', events);
    }
  }
}

export function stepSourceEarthfall(value, input = {}) {
  const state = normalizeSourceEarthfall(value), events = [];
  if (state.status !== 'active' || input.paused || input.protected || input.assetsReady === false || input.renderReady === false) return { state, events, event: null, saveDue: false };
  const look = input.look || {};
  state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta));
  state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.3, 1.3);
  if (input.interact) interact(state, events);
  state.accumulator += clamp(input.dt ?? 0, 0, C.maxFrameDelta);
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') {
    state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events);
  }
  state.accumulator = Math.max(0, state.accumulator);
  return { state, events, event: events.find(event => event.type === 'return' || event.type === 'enter-source-II') || events.at(-1) || null, saveDue: events.length > 0 };
}

export function sourceEarthfallFrame(value) {
  const state = normalizeSourceEarthfall(value);
  const material = sourceEarthfallFracturePose(SOURCE_EARTHFALL_MATERIAL_CELL.index, state.elapsed, SOURCE_EARTHFALL_MATERIAL_CELL.center);
  const catchSurfaceY = state.phase === 'landed' ? 0 : state.phase === 'catching'
    ? earthfallCatchHeight(state.catchElapsed, state.catchVelocity) : C.catch.interceptY;
  const lost = !['intact', 'fracturing'].includes(state.phase);
  const player = { x: state.x, y: state.feet, z: state.z, feet: state.feet, yaw: state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight };
  return { ...state, active: state.status === 'active', player, catchSurfaceY,
    supported: !lost || state.phase === 'catching' || state.phase === 'landed', upperSupport: !lost,
    fracture: state.committed ? clamp(state.elapsed / C.footingLossAt, 0, 1) : 0,
    falling: state.phase === 'falling', focus: sourceEarthfallFocus(state),
    entryDoor: doorFrame(state, 'entry'), exitDoor: doorFrame(state, 'exit'),
    geometry: {
      upperEarth: { id: 'earthfall-upper-earth', ...C.earth, y: C.upperFloor, support: !lost, material: 'source-earth' },
      catchSurface: { id: 'earthfall-folio-catch', ...C.catch, y: catchSurfaceY, material: 'source-folio' },
      lowerApron: { id: 'earthfall-lower-apron', ...C.catch, y: C.lowerFloor, material: 'source-path' },
      path: { minX: -C.passage.halfWidth, maxX: C.passage.halfWidth, minZ: C.passage.exitZ - 3, maxZ: 3, y: C.lowerFloor },
    },
    anchors: { entry: { x: 0, y: 101.2, z: 0 }, earth: { x: 0, y: 100, z: -14 },
      front: { x: state.x, y: state.feet + 1, z: state.z }, fallingMaterial: { x: material.x, y: material.y, z: material.z },
      catch: { x: state.x, y: catchSurfaceY, z: state.z }, exit: { x: 0, y: earthfallExitDoorHeight(state.elapsed) + 1.2, z: C.passage.exitZ } },
    events: state.receipts.map(item => ({ ...copy(item), age: Math.max(0, state.clock - item.at) })),
  };
}
