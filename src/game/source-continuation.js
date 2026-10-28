import { SOURCE_CONTINUATION as C, CONTINUATION_CATCH_STAGES, continuationStage, continuationRadialPoint, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationDoors, continuationProps, continuationSurfaceY, continuationSurfaceContains, continuationSupportAt, continuationDropLip, continuationDropLips, continuationRefugeAt, continuationCatchObstacles, continuationBodyClearAt } from '../data/source-continuation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const clamp = (n, a, b) => Math.max(a, Math.min(b, finite(n, a)));
const angle = n => Math.atan2(Math.sin(n), Math.cos(n));
const pose = value => {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y) && !Number.isFinite(value.z) || Object.values(value).some(v => typeof v === 'number' && !Number.isFinite(v))) return null;
  try { return clone(value); } catch { return null; }
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const position = (value, fallback = C.spawn) => ({ x: clamp(value?.x ?? fallback.x, C.bounds.minX, C.bounds.maxX), z: clamp(value?.z ?? fallback.z, C.bounds.minZ, C.bounds.maxZ), feet: clamp(value?.feet ?? fallback.feet, C.bounds.minY, C.bounds.maxY), yaw: angle(finite(value?.yaw, fallback.yaw || 0)), pitch: clamp(value?.pitch ?? fallback.pitch ?? 0, -1.42, 1.3), level: Math.round(clamp(value?.level ?? fallback.level ?? 0, 0, C.catch.levels - 1)) });
const ACTIVE = new Set(['not-started', 'active', 'returned', 'completed']);
const DOOR_IDS = new Set(continuationDoors().map(d => d.id));
const WEIGHT_MODES = new Set(['warning', 'walking', 'falling', 'returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering']);
const startWeight = () => ({ active: false, level: 0, mode: 'warning', elapsed: 0, ...C.catch.hoist.start, y: C.catch.top, pathIndex: 0, fall: null, cycle: 0 });
export function freshSourceContinuation({ runId = '', returnPose = null } = {}) {
  return { version: 1, layoutVersion: C.layoutVersion, encounterId: C.encounterId, runId: String(runId), status: 'not-started', phase: 'wrong-return', direction: 'forward',
    ...C.spawn, elapsed: 0, accumulator: 0, wrongLap: 0, level: 0, fall: null, recovery: null, reveal: null, grace: 0,
    closure: { mode: 'dormant', elapsed: 0, frontX: C.wrongReturn.closureStartX, frontZ: -12, exposure: 0 },
    counterweight: startWeight(), knowledge: [], doorOpen: {}, doorMotion: {}, returnPose: pose(returnPose), exitPose: null,
    completed: false, handoff: false, exitReceipt: null, lastSafe: { ...C.spawn, level: 0 }, caption: null };
}
function validFall(value) {
  if (!value || !['x', 'z', 'feet', 'vx', 'vz', 'vy'].every(k => Number.isFinite(value[k]))) return null;
  return { x: clamp(value.x, C.bounds.minX, C.bounds.maxX), z: clamp(value.z, C.bounds.minZ, C.bounds.maxZ), feet: clamp(value.feet, C.bounds.minY, C.bounds.maxY), vx: clamp(value.vx, -3, 3) || 0, vz: clamp(value.vz, -3, 3) || 0, vy: clamp(value.vy, -35, 3) || 0, fromLevel: Math.round(clamp(value.fromLevel, 0, C.catch.levels - 1)), elapsed: Math.max(0, finite(value.elapsed)), unsupported: !!value.unsupported };
}
function migrateLegacy(state, value) {
  if (value.layoutVersion === C.layoutVersion) return state;
  state.knowledge = [...new Set([...state.knowledge, ...(value.elapsed > .01 || value.phase === 'catch' ? ['remembered-earlier-construction'] : [])])];
  state.reveal = state.fall = state.recovery = null;
  if (state.phase === 'catch') {
    state.level = Math.round(clamp(value.level, 0, 5) * (C.catch.levels - 1) / 5);
    const at = value.completed ? C.catch.finalApproach : continuationRefugeAt(state);
    Object.assign(state, position({ ...at, level: state.level })); state.feet = continuationCatchFloor(state.level);
    state.counterweight = { ...startWeight(), active: !!value.counterweight?.active, cycle: Math.max(0, Math.floor(finite(value.counterweight?.cycle))) };
  } else if (finite(value.feet) > 2.6) Object.assign(state, { x: -16, z: -12, feet: 8.4 });
  else if (finite(value.wrongLap) > 0) Object.assign(state, { x: -10, z: -22, feet: 0 });
  else Object.assign(state, C.spawn);
  state.lastSafe = position(state); state.grace = C.graceSeconds;
  state.closure = { mode: 'dormant', elapsed: 0, frontX: C.wrongReturn.closureStartX, frontZ: -12, exposure: 0 };
  return state;
}
export function normalizeSourceContinuation(value, { runId, returnPose } = {}) {
  const fresh = freshSourceContinuation({ runId: runId ?? value?.runId ?? '', returnPose });
  if (!value || value.version !== 1 || value.encounterId !== C.encounterId || runId != null && String(runId) !== String(value.runId)) return fresh;
  const w = value.counterweight || fresh.counterweight;
  let state = { ...fresh, ...position(value), status: ACTIVE.has(value.status) ? value.status : fresh.status,
    phase: value.phase === 'catch' ? 'catch' : 'wrong-return', direction: value.direction === 'reverse' ? 'reverse' : 'forward',
    elapsed: Math.max(0, finite(value.elapsed)), accumulator: clamp(value.accumulator, 0, C.fixedStep), wrongLap: Math.round(clamp(value.wrongLap, 0, 3)),
    grace: clamp(value.grace, 0, C.graceSeconds), completed: !!value.completed, handoff: !!value.handoff,
    returnPose: pose(value.returnPose) || fresh.returnPose, exitPose: pose(value.exitPose),
    knowledge: Array.isArray(value.knowledge) ? [...new Set(value.knowledge.filter(v => typeof v === 'string').slice(0, 80))] : [],
    doorOpen: Object.fromEntries(Object.entries(value.doorOpen || {}).filter(([id]) => DOOR_IDS.has(id)).map(([id, open]) => [id, !!open])),
    caption: null, lastSafe: position(value.lastSafe), fall: validFall(value.fall), reveal: null,
    closure: { mode: ['dormant', 'primed', 'warning', 'closing', 'held'].includes(value.closure?.mode) ? value.closure.mode : 'dormant', elapsed: Math.max(0, finite(value.closure?.elapsed)), frontX: clamp(value.closure?.frontX ?? C.wrongReturn.closureStartX, C.wrongReturn.closureEndX, C.wrongReturn.closureStartX), frontZ: -12, exposure: Math.max(0, finite(value.closure?.exposure)) },
    counterweight: { active: !!w.active, level: Math.round(clamp(w.level, 0, C.catch.levels - 1)), mode: WEIGHT_MODES.has(w.mode) ? w.mode : 'warning', elapsed: Math.max(0, finite(w.elapsed)), x: clamp(w.x, C.bounds.minX, C.bounds.maxX), z: clamp(w.z, C.bounds.minZ, C.bounds.maxZ), y: clamp(w.y, C.bounds.minY, C.catch.hoist.travelY), pathIndex: Math.round(clamp(w.pathIndex, 0, 32)), fall: validFall(w.fall), cycle: Math.max(0, Math.floor(finite(w.cycle))) },
  };
  state.doorMotion = Object.fromEntries(Object.entries(value.doorMotion || {}).filter(([id, m]) => DOOR_IDS.has(id) && m && ['from', 'startedAt', 'duration'].every(k => Number.isFinite(m[k]))).map(([id, m]) => [id, { from: clamp(m.from, 0, 1), to: state.doorOpen[id] ? 1 : 0, startedAt: clamp(m.startedAt, 0, state.elapsed), duration: clamp(m.duration, 0, C.doorSwingSeconds),...(m.automatic===true?{automatic:true}:{}) }]));
  if (value.recovery && typeof value.recovery.reason === 'string' && Array.isArray(value.recovery.path) && value.recovery.path.length > 1 && value.recovery.path.length <= 48 && value.recovery.path.every(p => ['x', 'z', 'feet'].every(k => Number.isFinite(p[k])))) {
    const r = value.recovery, path = r.path.map(p => position(p));
    state.recovery = { reason: r.reason, kind: r.kind === 'guided-return' ? 'guided-return' : 'sling', from: position(r.from), target: position(r.target), path,
      duration: clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds), elapsed: clamp(r.elapsed, 0, clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds)), repaired: !!r.repaired };
  }
  if (value.exitReceipt && typeof value.exitReceipt.id === 'string') state.exitReceipt = { id: `${state.runId}:source-continuation-exit`, delivered: !!value.exitReceipt.delivered };
  state = migrateLegacy(state, value);
  if (['warning', 'walking'].includes(state.counterweight.mode) && !continuationSupportAt(state.counterweight.x, state.counterweight.z, { feet: state.counterweight.y })) { const at = weightPaths[state.counterweight.level]?.[0] || C.catch.hoist.start; Object.assign(state.counterweight, at, { y: continuationCatchFloor(state.counterweight.level), pathIndex: 0, mode: 'warning', elapsed: 0, fall: null }); }
  if (!state.fall && !state.recovery && (!continuationSupportAt(state.x, state.z, state) || staticSolidBlocks(state.x, state.z, state))) {
    const safe = continuationSupportAt(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet }) && !staticSolidBlocks(state.lastSafe.x, state.lastSafe.z, { ...state, feet: state.lastSafe.feet });
    Object.assign(state, safe ? state.lastSafe : state.phase === 'catch' ? continuationRefugeAt(state) : C.spawn);
  }
  return state;
}
export function resumeSourceContinuation(value, { reverse = false, runId, returnPose } = {}) {
  const state = normalizeSourceContinuation(value, { runId, returnPose }); state.status = 'active'; state.direction = reverse ? 'reverse' : 'forward';
  if (reverse) { state.phase = 'catch'; state.level = C.catch.levels - 1; Object.assign(state, C.catch.finalApproach); state.fall = state.recovery = state.reveal = null; state.grace = C.graceSeconds; state.lastSafe = position(state); }
  return state;
}
function insideRefuge(state) {
  if (state.phase === 'catch' && state.level === 0 && state.x > -25.35 && state.z > -13.1 && state.z < -10.9) return true;
  const refuge = continuationRefugeAt(state);
  return Math.abs(state.feet - refuge.feet) < .4 && distance(state, refuge) < (state.phase === 'catch' ? 1.28 : 2.5);
}
export function sourceContinuationDoorFraction(state, id) {
  const motion = state?.doorMotion?.[id]; if (!motion) return state?.doorOpen?.[id] ? 1 : 0;
  const to = motion.to ? 1 : 0, progress = motion.duration > 0 ? clamp((finite(state.elapsed) - motion.startedAt) / motion.duration, 0, 1) : 1;
  return clamp(motion.from + (to - motion.from) * progress, 0, 1);
}
function staticSolidBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationSolids(state).some(s => s.role !== 'closure' && state.feet + C.bodyHeight > s.minY + .04 && state.feet < s.maxY - .04 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function doorBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationDoors().some(d => {
    if (d.role === 'false-return' || sourceContinuationDoorFraction(state, d.id) >= C.doorPassFraction || Math.abs(state.feet - d.y) >= .6) return false;
    const n = d.normal || (Math.abs(Math.sin(d.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 }), dx = x - d.x, dz = z - d.z;
    return Math.abs(dx * n.x + dz * n.z) < .12 + r && Math.abs(-dx * n.z + dz * n.x) < d.width / 2 + r;
  });
}
function solidBlocks(x, z, state) {
  if (staticSolidBlocks(x, z, state) || doorBlocks(x, z, state)) return true;
  return continuationSolids(state).some(s => s.role === 'closure' && state.feet + C.bodyHeight > s.minY + .04 && state.feet < s.maxY - .04 && x + C.bodyRadius > s.minX && x - C.bodyRadius < s.maxX && z + C.bodyRadius > s.minZ && z - C.bodyRadius < s.maxZ);
}
export function sourceContinuationCanOccupy(x, z, state) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || solidBlocks(x, z, state)) return false;
  const support = continuationSupportAt(x, z, state);
  if (!support) return false;
  // A higher overlapping deck is a ceiling, not a floor the body can clip into.
  return !continuationSurfaces().some(s => s.y > support.y + .04 && s.y - s.thickness < support.y + C.bodyHeight - .03 && continuationSurfaceContains(s, x, z));
}
function move(state, dx, dz) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .055));
  for (let i = 0; i < steps; i++) {
    if (sourceContinuationCanOccupy(state.x + dx / steps, state.z, state)) state.x += dx / steps;
    if (sourceContinuationCanOccupy(state.x, state.z + dz / steps, state)) state.z += dz / steps;
    const support = continuationSupportAt(state.x, state.z, state);
    if (support) { state.feet = support.y; if (support.surface.region === 'catch') state.level = support.level; }
  }
}
function learn(state, id) { if (!state.knowledge.includes(id)) state.knowledge.push(id); }
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, a.feet - b.feet);
function pathLength(path) { return path.slice(1).reduce((n, p, i) => n + pointDistance(path[i], p), 0); }
function bodySweepClear(a, b) {
  const count = Math.max(1, Math.ceil(pointDistance(a, b) / .09));
  for (let i = 0; i <= count; i++) { const t = i / count, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t };
    if (!continuationBodyClearAt(p, { radius: C.bodyRadius, height: C.bodyHeight, margin: .015 })) return false; }
  return true;
}
function makeRecovery(state, reason) {
  const level = state.level, refuge = continuationRefugeAt(state), target = { ...position({ ...refuge, yaw: state.yaw, pitch: state.pitch }), level };
  let from = position(state), path = [], repaired = false;
  if (state.phase === 'catch') {
    const stage = continuationStage(level), center = C.catch.center, cruise = stage.y + C.recoveryRise;
    let theta = Math.atan2(state.z - center.z, state.x - center.x); while (theta < stage.startAngle) theta += Math.PI * 2; while (theta > stage.endAngle) theta -= Math.PI * 2;
    const r = stage.outerRadius + 1.25, first = { ...from, feet: cruise }, radial = { ...from, ...continuationRadialPoint(r, theta), feet: cruise };
    path = [from, first, radial]; const delta = angle(stage.refugeAngle - theta), n = Math.max(1, Math.ceil(Math.abs(delta) / .15));
    for (let k = 1; k <= n; k++) path.push({ ...from, ...continuationRadialPoint(r, theta + delta * k / n), feet: cruise });
    path.push({ ...target, feet: cruise }, target);
  } else {
    const cruise = Math.max(state.feet, target.feet) + 3.2;
    path = [from, { ...from, feet: cruise }, { ...from, x: target.x, feet: cruise }, { ...target, feet: cruise }, target];
  }
  path = path.filter((p, i, all) => i === 0 || pointDistance(p, all[i - 1]) > 1e-7);
  // Save corruption/retired layout repair is distinct from ordinary capture.
  // A valid live capture must take the physical cable route above the slab.
  if (!path.slice(1).every((p, i) => bodySweepClear(path[i], p))) { from = { ...target }; path = [from, { ...target }]; repaired = true; }
  return { reason, kind: state.phase === 'catch' ? 'sling' : 'guided-return', from, target, path, duration: clamp(Math.max(C.recoverySeconds, pathLength(path) / C.recoverySpeed), C.recoverySeconds, C.recoveryMaximumSeconds), elapsed: 0, repaired };
}
function carryPose(recovery) {
  const total = pathLength(recovery.path), wanted = total * Math.min(1, recovery.elapsed / recovery.duration); let passed = 0;
  for (let i = 1; i < recovery.path.length; i++) { const a = recovery.path[i - 1], b = recovery.path[i], length = pointDistance(a, b);
    if (wanted <= passed + length + 1e-9) { const t = length ? clamp((wanted - passed) / length, 0, 1) : 1; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t }; } passed += length; }
  return recovery.target;
}
export function sourceContinuationRecoveryPlan(value, reason = 'counterweight') { return makeRecovery(normalizeSourceContinuation(value), reason); }
function beginRecovery(state, reason, events) {
  if (state.recovery || state.grace > 0 || insideRefuge(state)) return;
  state.fall = null; state.recovery = makeRecovery(state, reason);
  if (state.recovery.repaired) Object.assign(state, state.recovery.from);
  events.push({ type: 'capture', reason, duration: state.recovery.duration, repaired: state.recovery.repaired });
}
function wakeWeight(state, events) {
  if (state.counterweight.active) return; const w = state.counterweight; w.active = true; w.mode = 'warning'; w.elapsed = 0;
  events.push({ type: 'counterweight-warning', level: w.level, cycle: w.cycle, reason: 'first-voluntary-descent', position: { x: w.x, y: w.y, z: w.z } });
}
function beginFall(state, lip, events) {
  state.fall = { x: state.x, z: state.z, feet: state.feet, vx: lip.dx * .8 || 0, vz: lip.dz * .8 || 0, vy: 0, fromLevel: state.level, elapsed: 0, unsupported: false };
  wakeWeight(state, events); learn(state, `release-${state.level}`);
}
function fallStep(fall, dt) {
  const oldFeet = fall.feet; fall.elapsed += dt; fall.x += fall.vx * dt; fall.z += fall.vz * dt;
  const supportHere = continuationSupportAt(fall.x, fall.z, { feet: fall.feet }, { minY: fall.feet - .01, maxY: fall.feet + .01 });
  if (!supportHere) fall.unsupported = true;
  if (!fall.unsupported) return null;
  fall.vy -= C.gravity * dt; fall.feet += fall.vy * dt;
  return continuationSupportAt(fall.x, fall.z, { feet: fall.feet }, { minY: fall.feet - .0001, maxY: oldFeet + .0001 });
}
const radial = (r, a) => continuationRadialPoint(r, a);
const weightPaths = [
  [radial(11.2, .8), radial(9, .8), radial(8, 0), { x: continuationDropLip({ level: 0 }).x, z: continuationDropLip({ level: 0 }).z }],
  [radial(8, 0), ...[.45, .9, 1.35, 1.8, 2.25, 2.7, Math.PI].map(a => radial(8, a)), { x: continuationDropLip({ level: 1 }).x, z: continuationDropLip({ level: 1 }).z }],
  [radial(7, Math.PI), ...[2.9, 2.55, 2.2, 1.85, Math.PI / 2 + .15].map(a => radial(7, a)), { x: continuationDropLip({ level: 2 }).x, z: continuationDropLip({ level: 2 }).z }],
  [radial(6, Math.PI / 2 + .15), ...[1.3, .8, .3, 0, .4, .9, 1.4, 1.9, 2.4, 2.8, Math.PI].map(a => radial(7, a)), radial(9.4, Math.PI)],
];
function moveWeightTo(w, target, speed, dt) { const d = distance(w, target), amount = Math.min(d, speed * dt); if (d > 1e-8) { w.x += (target.x - w.x) / d * amount; w.z += (target.z - w.z) / d * amount; } return d <= amount + 1e-8; }
function setWeightMode(w, mode, events, type) { w.mode = mode; w.elapsed = 0; if (type) events.push({ type, level: w.level, cycle: w.cycle, position: { x: w.x, y: w.y, z: w.z } }); }
function advanceWeight(state, dt, events) {
  const w = state.counterweight, h = C.catch.hoist; if (!w.active) return; w.elapsed += dt;
  if (w.mode === 'warning') { if (w.elapsed >= C.catch.counterweightWarningSeconds) setWeightMode(w, 'walking', events, 'counterweight-moves'); return; }
  if (w.mode === 'returning') { if (moveWeightTo(w, h.shaft, h.returnSpeed, dt)) setWeightMode(w, 'rewinding', events, 'counterweight-rewind'); return; }
  if (w.mode === 'rewinding') { if (w.elapsed >= h.rewindSeconds) setWeightMode(w, 'hoisting', events, 'counterweight-hoist'); return; }
  if (w.mode === 'hoisting') { w.y = Math.min(h.travelY, w.y + h.upSpeed * dt); if (w.y >= h.travelY) { w.pathIndex = 0; setWeightMode(w, 'traversing', events, 'counterweight-traverse'); } return; }
  if (w.mode === 'traversing') { const targets = [{ x: h.start.x, z: h.shaft.z }, h.start], target = targets[w.pathIndex]; if (target && moveWeightTo(w, target, h.traverseSpeed, dt)) w.pathIndex++; if (w.pathIndex >= targets.length) setWeightMode(w, 'lowering-warning', events, 'counterweight-lowering-warning'); return; }
  if (w.mode === 'lowering-warning') { if (w.elapsed >= h.loweringWarningSeconds) setWeightMode(w, 'lowering', events, 'counterweight-lower'); return; }
  if (w.mode === 'lowering') { w.y = Math.max(C.catch.top, w.y - h.downSpeed * dt); if (w.y <= C.catch.top) { w.level = 0; w.pathIndex = 0; w.cycle++; setWeightMode(w, 'warning', events, 'counterweight-cycle'); } return; }
  if (w.mode === 'falling') {
    const support = fallStep(w.fall, dt); Object.assign(w, { x: w.fall.x, y: w.fall.feet, z: w.fall.z });
    if (support) { w.y = support.y; w.level = support.level; w.fall = null; w.pathIndex = 0; setWeightMode(w, 'warning', events, 'counterweight-lands'); }
    return;
  }
  const path = weightPaths[w.level], target = path?.[w.pathIndex];
  if (target) { if (moveWeightTo(w, target, C.catch.counterweightSpeed, dt)) w.pathIndex++; return; }
  if (w.level === C.catch.levels - 1) { setWeightMode(w, 'returning', events, 'counterweight-return'); return; }
  const lip = continuationDropLip({ level: w.level });
  w.fall = { x: w.x, z: w.z, feet: w.y, vx: lip.dx * .8 || 0, vz: lip.dz * .8 || 0, vy: 0, fromLevel: w.level, elapsed: 0, unsupported: false }; setWeightMode(w, 'falling', events, 'counterweight-release');
}
function weightTouchesPlayer(state) { const w = state.counterweight; return w.active && w.y < state.feet + C.bodyHeight && w.y + C.catch.hoist.drumHeight > state.feet + .05 && distance(state, w) < C.catch.counterweightRadius + C.bodyRadius + .07; }
function tickWeight(state, dt, events) { advanceWeight(state, dt, events); if (weightTouchesPlayer(state)) beginRecovery(state, 'counterweight', events); }
export function continuationFocus(state) {
  if (!state || state.status !== 'active' || state.fall || state.recovery) return null;
  const candidates = continuationDoors().filter(d => Math.abs(state.feet - d.y) < .55 && distance(state, d) <= 1.7).map(d => ({ ...d, type: d.role, title: d.role === 'return' ? 'OPEN THE RETURN DOOR' : d.role === 'final' ? 'OPEN THE GREY DOOR' : 'OPEN THE DOOR', text: 'The handle is within reach.', position: { x: d.x, y: d.y + 1.1, z: d.z } }));
  if (state.phase === 'catch') for (const lip of continuationDropLips(state)) if (distance(state, lip) <= .7) candidates.push({ ...lip, y: state.feet, type: 'drop', title: 'LOWER YOURSELF FROM THE EDGE', text: 'Look at the supporting structure below.', position: { x: lip.x, y: state.feet, z: lip.z } });
  return candidates.filter(d => { const dx = d.x - state.x, dz = d.z - state.z, len = Math.hypot(dx, dz); return d.type === 'drop' || len < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / len > .1; }).sort((a, b) => distance(state, a) - distance(state, b))[0] || null;
}
function toggleDoor(state, id, events) { const from = sourceContinuationDoorFraction(state, id), to = state.doorOpen[id] ? 0 : 1; state.doorOpen[id] = !!to; state.doorMotion[id] = { from, to, startedAt: state.elapsed, duration: C.doorSwingSeconds * Math.abs(to - from) }; events.push({ type: 'door', id, open: !!to }); }
function approachDoors(state, events) {
  // Forward thresholds acknowledge a visible approach. Return doors still
  // belong to an intentional retreat; neither opening nor looking crosses one.
  for (const door of continuationDoors()) {
    if (!['onward', 'false-return', 'final'].includes(door.role) || door.phase !== state.phase
      || Math.abs(state.feet - door.y) >= .55) continue;
    const dx = door.x - state.x, dz = door.z - state.z, metres = Math.hypot(dx, dz);
    const n = door.normal || (Math.abs(Math.sin(door.yaw)) > .5 ? { x: 1, z: 0 } : { x: 0, z: 1 });
    const aligned = Math.abs(-dx * n.z + dz * n.x) <= door.width / 2 + .45;
    const seen = metres < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / metres > .35;
    if (!aligned || !seen) continue;
    // The existing saved leaf motion is also the once-only arrival record.
    // A deliberate manual reversal keeps its meaning on later approaches.
    if (metres <= C.doorApproachDistance && !state.doorOpen[door.id] && !state.doorMotion[door.id]) {
      toggleDoor(state, door.id, events);state.doorMotion[door.id].automatic=true;events.at(-1).automatic = true;
    }
    if (door.role === 'false-return' && metres <= 1.7 && sourceContinuationDoorFraction(state, door.id) >= C.doorPassFraction)
      learn(state, 'false-return-porch');
  }
}
function interact(state, events) { const focus = continuationFocus(state); if (!focus) return; if (focus.type === 'drop') { beginFall(state, focus, events); events.push({ type: 'drop', level: state.level, id: focus.id }); } else {
  if(state.doorOpen[focus.id]&&state.doorMotion[focus.id]?.automatic)return;
  toggleDoor(state, focus.id, events); if (focus.type === 'false-return') learn(state, 'false-return-porch');
} }
function returnCrossed(state, before) {
  return continuationDoors().some(d => {
    if (d.role !== 'return' || sourceContinuationDoorFraction(state, d.id) < C.doorPassFraction || Math.abs(state.feet - d.y) >= .5) return false;
    const n = d.normal || { x: 0, z: 1 }, dx = state.x - d.x, dz = state.z - d.z;
    return Math.abs(-dx * n.z + dz * n.x) < d.width / 2 - C.bodyRadius && (before.x - d.x) * n.x + (before.z - d.z) * n.z <= C.bodyRadius && dx * n.x + dz * n.z > C.bodyRadius;
  });
}
function phaseCrossing(state, before, events) {
  const d = C.wrongReturn.threshold, clear = sourceContinuationDoorFraction(state, 'wrong-onward') >= C.doorPassFraction && Math.abs(state.feet - d.y) < .35 && Math.abs(state.z - d.z) < d.halfWidth - C.bodyRadius;
  if (!clear) return;
  if (state.phase === 'wrong-return' && state.x < d.x - C.bodyRadius && before.x >= d.x - C.bodyRadius) { state.phase = 'catch'; state.level = 0; learn(state, 'entered-the-spindle'); events.push({ type: 'phase', phase: 'catch', doorId: 'wrong-onward', crossed: true }); }
  else if (state.phase === 'catch' && state.level === 0 && state.x > d.x + C.bodyRadius && before.x <= d.x + C.bodyRadius) { state.phase = 'wrong-return'; events.push({ type: 'phase', phase: 'wrong-return', doorId: 'wrong-onward', crossed: true }); }
}
function tickClosure(state, dt, events) {
  const c = state.closure;
  if (state.knowledge.includes('false-return-porch') && state.feet > 8 && state.x > 3 && state.x < 9 && state.z > 1 && c.mode === 'dormant') { c.mode = 'primed'; c.elapsed = 0; learn(state, 'upper-return-is-different'); events.push({ type: 'return-recognized', position: { x: 6, y: 8.4, z: 3.5 } }); }
  if (c.mode === 'primed' && state.z < -2) { c.exposure += dt; if (c.exposure >= C.wrongReturn.pressureDelay) { c.mode = 'warning'; c.elapsed = 0; events.push({ type: 'closure-warning', position: { x: c.frontX, y: 9.4, z: -12 } }); } }
  else if (c.mode === 'warning' || c.mode === 'closing') { c.elapsed += dt; if (c.elapsed >= C.wrongReturn.warningSeconds) { c.mode = 'closing'; c.frontX = Math.max(C.wrongReturn.closureEndX, C.wrongReturn.closureStartX - (c.elapsed - C.wrongReturn.warningSeconds) * C.wrongReturn.closureSpeed); if (state.feet > 8 && Math.abs(state.x - c.frontX) < .65 && state.z > -14 && state.z < -10) beginRecovery(state, 'closing-front', events); } }
}
function tick(state, input, dt, events) {
  state.elapsed += dt; state.grace = Math.max(0, state.grace - dt);
  if (state.recovery) { const recovery = state.recovery; recovery.elapsed = Math.min(recovery.duration, recovery.elapsed + dt); Object.assign(state, carryPose(recovery)); tickWeight(state, dt, events); if (recovery.elapsed + 1e-8 >= recovery.duration) { Object.assign(state, position(recovery.target)); state.lastSafe = position(state); state.recovery = null; state.grace = C.graceSeconds; events.push({ type: 'recovered', reason: recovery.reason }); } return; }
  if (state.fall) {
    const support = fallStep(state.fall, dt); Object.assign(state, { x: state.fall.x, z: state.fall.z, feet: state.fall.feet });
    if (support) { state.feet = support.y; state.level = support.level; state.fall = null; learn(state, `catch-${state.level}`); state.lastSafe = position(state); events.push({ type: 'land', level: state.level, surface: support.id }); }
    else if (state.feet < C.bounds.minY || state.fall.elapsed > 8) { const fromLevel = state.fall.fromLevel; state.fall = null; state.level = fromLevel; Object.assign(state, continuationRefugeAt(state)); state.lastSafe = position(state); state.grace = C.graceSeconds; events.push({ type: 'recovered', reason: 'unsupported-save-repair', repaired: true }); }
  } else {
    approachDoors(state, events);
    const before = { x: state.x, z: state.z }, forward = clamp(input.forward ?? 0, -1, 1), side = clamp(input.side ?? 0, -1, 1), len = Math.max(1, Math.hypot(forward, side)), amount = C.walkSpeed * dt / len;
    move(state, (Math.sin(state.yaw) * forward + Math.cos(state.yaw) * side) * amount, (-Math.cos(state.yaw) * forward + Math.sin(state.yaw) * side) * amount);
    phaseCrossing(state, before, events);
    if (returnCrossed(state, before)) { state.status = 'returned'; events.push({ type: 'return', returnPose: clone(state.returnPose) }); return; }
    if (state.feet < .5 && state.z < -18) { state.wrongLap = Math.max(state.wrongLap, 1); learn(state, 'under-the-return'); }
    if (state.feet > 4 && state.feet < 5) learn(state, 'middle-construction');
    if (state.feet > 8) state.wrongLap = Math.max(state.wrongLap, 2);
    if (state.phase === 'catch' && state.level === C.catch.levels - 1 && sourceContinuationDoorFraction(state, 'catch-final') >= C.doorPassFraction && Math.abs(state.z - C.catch.finalDoor.z) < .9 - C.bodyRadius && before.x <= C.catch.finalDoor.x + C.bodyRadius && state.x > C.catch.finalDoor.x + C.bodyRadius) {
      const id = `${state.runId}:source-continuation-exit`, firstCompletion = !state.completed; state.completed = true; state.status = 'completed'; state.exitReceipt = state.exitReceipt || { id, delivered: false }; events.push({ type: 'complete', receipt: id, firstCompletion }); return;
    }
  }
  tickClosure(state, dt, events); tickWeight(state, dt, events);
}
export function stepSourceContinuation(value, input = {}) {
  const state = normalizeSourceContinuation(value), events = [];
  if (input.paused || input.renderReady === false || !['active', 'not-started'].includes(state.status)) return { state, event: null, events };
  if (state.status === 'not-started') state.status = 'active';
  const look = input.look || {}; state.yaw = angle(Number.isFinite(look.yaw) ? look.yaw : state.yaw + finite(look.dx ?? input.yawDelta)); state.pitch = clamp(Number.isFinite(look.pitch) ? look.pitch : state.pitch + finite(look.dy ?? input.pitchDelta), -1.42, 1.3);
  if (input.interact) interact(state, events);
  if (state.status !== 'active') return { state, event: events.at(-1) || null, events };
  state.accumulator += clamp(input.dt ?? 0, 0, .25);
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') { const phase = state.phase, authored = !!(state.recovery || state.fall); state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events); if (phase !== state.phase || authored && !state.recovery && !state.fall) { state.accumulator = 0; break; } }
  state.accumulator = Math.max(0, state.accumulator);
  return { state, event: events.find(e => e.type === 'return' || e.type === 'complete') || events.at(-1) || null, events };
}
export function sourceContinuationFrame(value) {
  const state = normalizeSourceContinuation(value), player = { x: state.x, y: state.feet, z: state.z, yaw: state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight, visible: false };
  return { ...state, active: state.status === 'active', player, camera: { mode: 'first-person', eye: [state.x, state.feet + C.eyeHeight, state.z], yaw: state.yaw, pitch: state.pitch },
    presentation: { reveal: null, recovery: state.recovery }, focus: continuationFocus(state), geometry: { surfaces: continuationSurfaces(), solids: continuationSolids(state), doors: continuationDoors().map(d => ({ ...d, openFraction: sourceContinuationDoorFraction(state, d.id) })), props: continuationProps() },
    cutaway: null, objective: state.phase === 'wrong-return' ? 'Explore the remembered construction.' : 'Read the support before choosing a descent.' };
}
export function sourceContinuationThreatTelemetry(value, { horizonSeconds = 180 } = {}) {
  const state = normalizeSourceContinuation(value), w = state.counterweight, horizon = clamp(horizonSeconds, 0, 360);
  const result = { model: 'stationary-authored-route', counterfactual: true, assumption: 'Player remains at this pose while active grace counts down.', mode: w.mode, cycle: w.cycle, active: w.active, refuge: insideRefuge(state), distance: Math.hypot(state.x - w.x, state.z - w.z, state.feet - w.y), timeToContact: null, horizonSeconds: horizon };
  if (!w.active || result.refuge) return result;
  for (let t = 0; t <= horizon + 1e-9; t += 1 / 60) { if (state.grace <= 0 && weightTouchesPlayer(state)) { result.timeToContact = t; break; } if (t + 1 / 60 > horizon + 1e-9) break; advanceWeight(state, 1 / 60, []); state.grace = Math.max(0, state.grace - 1 / 60); }
  return result;
}
