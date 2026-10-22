import { SOURCE_CONTINUATION as C, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationDoors, continuationProps, continuationSurfaceY, continuationSurfaceContains, continuationSupportAt, continuationDropLip, continuationDropLips, continuationRefugeAt } from '../data/source-continuation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, a, b) => Math.max(a, Math.min(b, finite(n, a)));
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const pose = value => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) && !Number.isFinite(value.z) || Object.values(value).some(v => typeof v === 'number' && !Number.isFinite(v))) return null;
  try { return clone(value); } catch { return null; }
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ACTIVE = new Set(['not-started', 'active', 'returned', 'completed']);

export function freshSourceContinuation({ runId = '', returnPose = null } = {}) {
  return { version: 1, encounterId: C.encounterId, runId: String(runId), status: 'not-started', phase: 'wrong-return', direction: 'forward',
    ...C.spawn, elapsed: 0, accumulator: 0, wrongLap: 0, level: 0, fall: null, recovery: null, grace: 0,
    closure: { mode: 'dormant', elapsed: 0, frontZ: -4.5 },
    counterweight: { active: false, level: 0, mode: 'warning', elapsed: 0, x: -16.5, z: -7, y: 3, pathIndex: 0, fall: null },
    knowledge: [], doorOpen: {}, returnPose: pose(returnPose), exitPose: null, completed: false, handoff: false, exitReceipt: null,
    lastSafe: { ...C.spawn, level: 0 }, caption: null };
}
export function normalizeSourceContinuation(value, { runId, returnPose } = {}) {
  const fresh = freshSourceContinuation({ runId: runId ?? value?.runId ?? '', returnPose });
  if (!value || value.version !== 1 || value.encounterId !== C.encounterId || runId != null && String(runId) !== String(value.runId)) return fresh;
  const state = { ...fresh, status: ACTIVE.has(value.status) ? value.status : fresh.status, phase: value.phase === 'catch' ? 'catch' : 'wrong-return', direction: value.direction === 'reverse' ? 'reverse' : 'forward',
    x: clamp(value.x, -40, 15), z: clamp(value.z, -26, 12), feet: clamp(value.feet, -24, 8), yaw: angle(finite(value.yaw)), pitch: clamp(value.pitch, -1.3, 1.3),
    elapsed: Math.max(0, finite(value.elapsed)), accumulator: clamp(value.accumulator, 0, C.fixedStep), wrongLap: Math.round(clamp(value.wrongLap, 0, 2)), level: Math.round(clamp(value.level, 0, 6)),
    grace: clamp(value.grace, 0, C.graceSeconds), completed: !!value.completed, handoff: !!value.handoff,
    returnPose: pose(value.returnPose) || fresh.returnPose, exitPose: pose(value.exitPose),
    knowledge: Array.isArray(value.knowledge) ? [...new Set(value.knowledge.filter(v => typeof v === 'string').slice(0, 40))] : [],
    doorOpen: Object.fromEntries(Object.entries(value.doorOpen || {}).filter(([id]) => [...continuationDoors('catch'), ...continuationDoors('wrong-return')].some(d => d.id === id)).map(([id, open]) => [id, !!open])),
    caption: typeof value.caption === 'string' ? value.caption.slice(0, 300) : null };
  state.closure = { mode: ['dormant', 'warning', 'closing', 'held'].includes(value.closure?.mode) ? value.closure.mode : 'dormant', elapsed: Math.max(0, finite(value.closure?.elapsed)), frontZ: clamp(value.closure?.frontZ ?? -4.5, -4.5, 2.7) };
  const w = value.counterweight || fresh.counterweight;
  state.counterweight = { active: !!w.active, level: Math.round(clamp(w.level, 0, 6)), mode: ['warning', 'walking', 'falling', 'settled'].includes(w.mode) ? w.mode : 'warning', elapsed: Math.max(0, finite(w.elapsed)), x: clamp(w.x, -32, -14), z: clamp(w.z, -9, 9), y: clamp(w.y, -19, 4), pathIndex: Math.round(clamp(w.pathIndex, 0, 12)), fall: validFall(w.fall) };
  state.fall = validFall(value.fall);
  const last = value.lastSafe;
  state.lastSafe = last && Number.isFinite(last.x) && Number.isFinite(last.z) && Number.isFinite(last.feet) ? { x: clamp(last.x, -40, 15), z: clamp(last.z, -26, 12), feet: clamp(last.feet, -20, 4), yaw: angle(finite(last.yaw)), pitch: clamp(last.pitch, -1.3, 1.3), level: Math.round(clamp(last.level, 0, 6)) } : { ...fresh.lastSafe };
  if (value.recovery && typeof value.recovery.reason === 'string') state.recovery = { reason: value.recovery.reason, elapsed: clamp(value.recovery.elapsed, 0, C.recoverySeconds), target: { ...continuationRefugeAt(state), yaw: state.yaw, pitch: state.pitch } };
  if (value.exitReceipt && typeof value.exitReceipt.id === 'string') state.exitReceipt = { id: `${state.runId}:source-continuation-exit`, delivered: !!value.exitReceipt.delivered };
  if (!state.fall && !state.recovery && (!continuationSupportAt(state.x, state.z, state) || staticSolidBlocks(state.x, state.z, state))) {
    const safe = continuationSupportAt(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet }) && !staticSolidBlocks(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet });
    Object.assign(state, safe ? state.lastSafe : state.phase === 'catch' ? { ...continuationRefugeAt(state) } : C.spawn);
  }
  return state;
}
function validFall(value) {
  if (!value || !['x', 'z', 'feet', 'vx', 'vz', 'vy'].every(k => Number.isFinite(value[k]))) return null;
  return { x: clamp(value.x, -40, 15), z: clamp(value.z, -26, 12), feet: clamp(value.feet, -24, 8), vx: clamp(value.vx, -3, 3), vz: clamp(value.vz, -3, 3), vy: clamp(value.vy, -30, 3), fromLevel: Math.round(clamp(value.fromLevel, 0, 6)), elapsed: Math.max(0, finite(value.elapsed)), unsupported: !!value.unsupported };
}
export function resumeSourceContinuation(value, { reverse = false, runId, returnPose } = {}) {
  const state = normalizeSourceContinuation(value, { runId, returnPose });
  state.status = 'active'; state.direction = reverse ? 'reverse' : 'forward';
  if (reverse) { state.phase = 'catch'; state.level = 5; Object.assign(state, C.catch.finalApproach); state.fall = null; state.recovery = null; state.grace = C.graceSeconds; state.lastSafe = { ...C.catch.finalApproach, level: 5 }; }
  return state;
}

function insideRefuge(state) { return state.phase === 'catch' ? distance(state, C.catch.refuge) < 1.65 : state.feet > 2.6 && state.x < 1 && state.z > -2.5; }
function staticSolidBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationSolids(state).some(s => s.role !== 'closure' && state.feet + 1.7 > s.minY + .05 && state.feet < s.maxY - .05 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function solidBlocks(x, z, state) {
  const r = C.bodyRadius;
  if (continuationSolids(state).some(s => state.feet + 1.7 > s.minY + .05 && state.feet < s.maxY - .05 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ)) return true;
  if (state.phase === 'wrong-return' && !state.doorOpen['wrong-onward'] && x < -3.1 + r && x > -3.5 && state.feet > 2.6 && z > -2 && z < 0) return true;
  if (state.phase === 'catch' && state.level === 5 && !state.doorOpen['catch-final'] && x > -24 - r && x < -23.5 && Math.abs(z) < .86) return true;
  const w = state.counterweight;
  return state.phase === 'catch' && w.active && !state.grace && !insideRefuge(state) && Math.abs(state.feet - w.y) < 1.4 && Math.hypot(x - w.x, z - w.z) < C.catch.counterweightRadius + r;
}
export function sourceContinuationCanOccupy(x, z, state) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || solidBlocks(x, z, state)) return false;
  return !!continuationSupportAt(x, z, state);
}
function move(state, dx, dz) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .06));
  for (let i = 0; i < steps; i++) {
    if (sourceContinuationCanOccupy(state.x + dx / steps, state.z, state)) state.x += dx / steps;
    if (sourceContinuationCanOccupy(state.x, state.z + dz / steps, state)) state.z += dz / steps;
    const support = continuationSupportAt(state.x, state.z, state);
    if (support) { state.feet = support.y; state.level = support.level; }
  }
}
function learn(state, id) { if (!state.knowledge.includes(id)) state.knowledge.push(id); }
function beginRecovery(state, reason, events) {
  if (state.recovery || state.grace > 0 || insideRefuge(state)) return;
  state.fall = null; state.recovery = { reason, elapsed: 0, target: { ...continuationRefugeAt({ ...state, level: Math.min(5, state.level) }), yaw: state.yaw, pitch: state.pitch } };
  state.caption = 'The shelf holds you for a moment. The open return is still there.'; events.push({ type: 'capture', reason });
}
function beginFall(state, lip) {
  state.fall = { x: state.x, z: state.z, feet: state.feet, vx: lip.dx * .8, vz: lip.dz * .8, vy: 0, fromLevel: state.level, elapsed: 0, unsupported: false };
  state.counterweight.active = true; learn(state, `release-${state.level}`);
}
function fallStep(fall, phase, dt) {
  const oldFeet = fall.feet; fall.elapsed += dt; fall.x += fall.vx * dt; fall.z += fall.vz * dt;
  const supportHere = continuationSupportAt(fall.x, fall.z, { phase, feet: fall.feet }, { minY: fall.feet - .01, maxY: fall.feet + .01 });
  if (!supportHere) fall.unsupported = true;
  if (!fall.unsupported) return null;
  fall.vy -= C.gravity * dt; fall.feet += fall.vy * dt;
  return continuationSupportAt(fall.x, fall.z, { phase, feet: fall.feet }, { minY: fall.feet - .0001, maxY: oldFeet + .0001 });
}
const weightPaths = [
  [[-17, -7], [-17, 0], [-19.55, 0]],
  [[-17, 0], [-17, -7], [-25, -7], [-25, -3.45]],
  [[-25, -7], [-31, -7], [-31, 2], [-28.45, 2]],
  [[-31, 2], [-31, 8], [-23, 8], [-23, 5.45]],
  [[-23, 8], [-31, 8], [-31, 0], [-26.45, 0]],
  [[-29, 0], [-29, -5], [-25, -5], [-25, -3.45]],
];
function tickWeight(state, dt, events) {
  const w = state.counterweight;
  if (!w.active || w.mode === 'settled') return;
  w.elapsed += dt;
  if (w.mode === 'warning') { if (w.elapsed >= C.catch.counterweightWarningSeconds) { w.mode = 'walking'; w.elapsed = 0; events.push({ type: 'counterweight-moves', level: w.level }); } return; }
  if (w.mode === 'falling') {
    const support = fallStep(w.fall, 'catch', dt); Object.assign(w, { x: w.fall.x, y: w.fall.feet, z: w.fall.z });
    if (support) { w.y = support.y; w.level = support.level; w.fall = null; w.pathIndex = 0; w.mode = w.level >= 6 ? 'settled' : 'warning'; w.elapsed = 0; events.push({ type: 'counterweight-lands', level: w.level }); }
  } else {
    const path = weightPaths[Math.min(5, w.level)], target = path[w.pathIndex];
    if (!target) {
      const lip = continuationDropLip({ level: w.level }) || { dx: 0, dz: 1 };
      w.fall = { x: w.x, z: w.z, feet: w.y, vx: lip.dx * .8, vz: lip.dz * .8, vy: 0, fromLevel: w.level, elapsed: 0, unsupported: false }; w.mode = 'falling';
    } else { const d = Math.hypot(target[0] - w.x, target[1] - w.z), amount = Math.min(d, C.catch.counterweightSpeed * dt); if (d > 1e-8) { w.x += (target[0] - w.x) / d * amount; w.z += (target[1] - w.z) / d * amount; } if (d <= amount + 1e-8) w.pathIndex++; }
  }
  if (Math.abs(state.feet - w.y) < 1.4 && distance(state, w) < C.catch.counterweightRadius + C.bodyRadius + .07) beginRecovery(state, 'counterweight', events);
}
export function continuationFocus(state) {
  if (!state || state.status !== 'active' || state.fall || state.recovery) return null;
  const candidates = continuationDoors(state).filter(d => Math.abs(state.feet - d.y) < .55 && distance(state, d) <= 1.65).map(d => ({ ...d, type: d.role, title: d.role === 'return' ? 'RETURN TO THE FIRST DOOR' : d.role === 'final' ? 'OPEN THE GREY DOOR' : 'OPEN THE DOOR', text: d.role === 'return' ? 'Return to Source. This place will remain as you left it.' : 'The handle is within reach.', position: { x: d.x, y: d.y + 1.1, z: d.z } }));
  if (state.phase === 'catch') for (const lip of continuationDropLips(state)) if (distance(state, lip) <= .75) candidates.push({ ...lip, y: state.feet, type: 'drop', title: 'LOWER YOURSELF FROM THE EDGE', text: 'Look at what is beneath this edge.', position: { x: lip.x, y: state.feet, z: lip.z } });
  return candidates.filter(d => { if (state.phase === 'catch') return true; const dx = d.x - state.x, dz = d.z - state.z, len = Math.hypot(dx, dz); return len < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / len > .2; }).sort((a, b) => distance(state, a) - distance(state, b))[0] || null;
}
function interact(state, events) {
  const focus = continuationFocus(state); if (!focus) return;
  if (focus.type === 'return') { state.status = 'returned'; events.push({ type: 'return', returnPose: clone(state.returnPose) }); }
  else if (focus.type === 'final') { state.doorOpen[focus.id] = !state.doorOpen[focus.id]; events.push({ type: 'door', id: focus.id, open: state.doorOpen[focus.id] }); }
  else if (focus.type === 'drop') { beginFall(state, focus); events.push({ type: 'drop', level: state.level }); }
  else { state.doorOpen[focus.id] = !state.doorOpen[focus.id]; learn(state, focus.type === 'false-return' ? 'false-return-porch' : 'seam-matches-first-door'); events.push({ type: 'door', id: focus.id, open: state.doorOpen[focus.id] }); }
}
function tick(state, input, dt, events) {
  state.elapsed += dt; state.grace = Math.max(0, state.grace - dt);
  if (state.recovery) { state.recovery.elapsed += dt; if (state.recovery.elapsed + 1e-8 >= C.recoverySeconds) { Object.assign(state, state.recovery.target); state.recovery = null; state.grace = C.graceSeconds; events.push({ type: 'recovered' }); } return; }
  if (state.fall) {
    const support = fallStep(state.fall, state.phase, dt); Object.assign(state, { x: state.fall.x, z: state.fall.z, feet: state.fall.feet });
    if (support) { const fromLevel = state.fall.fromLevel; state.feet = support.y; state.level = support.level; state.fall = null; learn(state, `catch-${state.level}`); events.push({ type: 'land', level: state.level, surface: support.id });
      if (support.surface.role === 'recovery-shelf' || state.level === 6) { state.level = Math.min(5, fromLevel); state.grace = 0; beginRecovery(state, 'loose-lining', events); learn(state, `missed-footprint-${fromLevel}`); }
      else state.lastSafe = { x: state.x, z: state.z, feet: state.feet, yaw: state.yaw, pitch: state.pitch, level: state.level };
    }
    else if (state.feet < -21 || state.fall.elapsed > 8) { state.level = Math.min(5, state.fall.fromLevel); state.grace = 0; beginRecovery(state, 'lower-shelf', events); }
  } else {
    const forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1), len = Math.max(1, Math.hypot(forward, side)), amount = C.walkSpeed * dt / len;
    const dx = state.phase === 'catch' ? side * amount : (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * amount;
    const dz = state.phase === 'catch' ? -forward * amount : (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * amount;
    move(state, dx, dz);
  }
  if (state.phase === 'wrong-return') {
    if (state.z < -16) { state.wrongLap = Math.max(1, state.wrongLap); learn(state, 'case-hinge'); }
    if (state.feet > 2.7 && state.x > 2 && state.z > -5 && state.wrongLap && state.closure.mode === 'dormant') { state.wrongLap = 2; state.closure.mode = 'warning'; state.closure.elapsed = 0; learn(state, 'upper-return-is-different'); state.caption = 'The entry is below you. Something closes along the return.'; events.push({ type: 'closure-warning' }); }
    if (state.closure.mode === 'warning' || state.closure.mode === 'closing') { state.closure.elapsed += dt; if (state.closure.elapsed >= C.wrongReturn.warningSeconds) { state.closure.mode = 'closing'; state.closure.frontZ = Math.min(2.7, -4.5 + (state.closure.elapsed - C.wrongReturn.warningSeconds) * C.wrongReturn.closureSpeed); if (state.feet > 2.7 && state.x > 1.1 && Math.abs(state.z - state.closure.frontZ) < .55) beginRecovery(state, 'closing-front', events); } }
    if (state.doorOpen['wrong-onward'] && state.x < C.wrongReturn.transferX && state.feet > 2.7) { state.phase = 'catch'; state.level = 0; state.lastSafe = { x: -16, z: -1, feet: 3, yaw: state.yaw, pitch: state.pitch, level: 0 }; learn(state, 'overhead-shaft'); events.push({ type: 'phase', phase: 'catch' }); }
  } else {
    tickWeight(state, dt, events);
    if (!state.fall && !state.recovery && state.level === 5 && state.doorOpen['catch-final'] && state.x > -23.8 && Math.abs(state.z) < .64) {
      const id = `${state.runId}:source-continuation-exit`, firstCompletion = !state.completed;
      state.completed = true; state.status = 'completed'; state.exitReceipt = state.exitReceipt || { id, delivered: false };
      events.push({ type: 'complete', receipt: id, firstCompletion });
    }
  }
}
export function stepSourceContinuation(value, input = {}) {
  const state = normalizeSourceContinuation(value), events = [];
  if (input.paused || input.renderReady === false || !['active', 'not-started'].includes(state.status)) return { state, event: null, events };
  if (state.status === 'not-started') state.status = 'active';
  if (state.phase !== 'catch') { const look = input.look || {}; state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta)); state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.3, 1.3); }
  if (input.interact) interact(state, events);
  if (state.status !== 'active') return { state, event: events.at(-1) || null, events };
  let remaining = clamp(input.dt ?? 0, 0, .25); state.accumulator += remaining;
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') { state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events); }
  state.accumulator = Math.max(0, state.accumulator);
  const event = events.find(e => e.type === 'return' || e.type === 'complete') || events.at(-1) || null;
  return { state, event, events };
}
export function sourceContinuationFrame(value) {
  const state = normalizeSourceContinuation(value), player = { x: state.x, y: state.feet, z: state.z, yaw: state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight, visible: state.phase === 'catch' };
  const camera = state.phase === 'catch' ? { mode: 'top-down', eye: [-23, state.feet + 14, 0], target: [-23, state.feet, 0], up: [0, 0, -1], yaw: 0, pitch: -Math.PI / 2 } : { mode: 'first-person', eye: [state.x, state.feet + C.eyeHeight, state.z], yaw: state.yaw, pitch: state.pitch };
  return { ...state, active: state.status === 'active', player, camera, focus: continuationFocus(state), geometry: { surfaces: continuationSurfaces(state), solids: continuationSolids(state), doors: continuationDoors(state), props: continuationProps(state) }, cutaway: { omitAboveFeet: state.feet + .3, showLowerLevels: 2 }, objective: state.phase === 'wrong-return' ? 'Find the return you remember.' : 'Choose a shelf below. The open return remains beside the shaft.' };
}
