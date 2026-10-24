import { SOURCE_CONTINUATION as C, continuationCatchFloor, continuationSurfaces, continuationSolids, continuationDoors, continuationProps, continuationSurfaceY, continuationSurfaceContains, continuationSupportAt, continuationDropLip, continuationDropLips, continuationRefugeAt, continuationCatchObstacles, continuationBodyClearAt } from '../data/source-continuation.js';

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
const DOOR_IDS = new Set([...continuationDoors('catch'), ...continuationDoors('wrong-return')].map(d => d.id));
const WEIGHT_MODES = new Set(['warning', 'walking', 'falling', 'returning', 'rewinding', 'hoisting', 'traversing', 'lowering-warning', 'lowering']);
const GROUND_WEIGHT_MODES = new Set(['warning', 'walking', 'returning', 'rewinding']);
const localPose = value => value && ['x', 'z', 'feet'].every(k => Number.isFinite(value[k])) ? { x: clamp(value.x, -40, 15), z: clamp(value.z, -26, 12), feet: clamp(value.feet, -24, 8), yaw: angle(finite(value.yaw)), pitch: clamp(value.pitch, -1.3, 1.3), level: Math.round(clamp(value.level, 0, 6)) } : null;

export function freshSourceContinuation({ runId = '', returnPose = null } = {}) {
  return { version: 1, encounterId: C.encounterId, runId: String(runId), status: 'not-started', phase: 'wrong-return', direction: 'forward',
    ...C.spawn, elapsed: 0, accumulator: 0, wrongLap: 0, level: 0, fall: null, recovery: null, reveal: null, grace: 0,
    closure: { mode: 'dormant', elapsed: 0, frontZ: -4.5 },
    counterweight: { active: false, level: 0, mode: 'warning', elapsed: 0, ...C.catch.hoist.start, y: 3, pathIndex: 0, fall: null, cycle: 0 },
    knowledge: [], doorOpen: {}, doorMotion: {}, returnPose: pose(returnPose), exitPose: null, completed: false, handoff: false, exitReceipt: null,
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
    doorOpen: Object.fromEntries(Object.entries(value.doorOpen || {}).filter(([id]) => DOOR_IDS.has(id)).map(([id, open]) => [id, !!open])),
    caption: typeof value.caption === 'string' ? value.caption.slice(0, 300) : null };
  state.doorMotion = Object.fromEntries(Object.entries(value.doorMotion || {}).filter(([id, m]) => DOOR_IDS.has(id) && m && ['from', 'startedAt', 'duration'].every(k => Number.isFinite(m[k]))).map(([id, m]) => [id, { from: clamp(m.from, 0, 1), to: state.doorOpen[id] ? 1 : 0, startedAt: clamp(m.startedAt, 0, state.elapsed), duration: clamp(m.duration, 0, C.doorSwingSeconds) }]));
  state.closure = { mode: ['dormant', 'warning', 'closing', 'held'].includes(value.closure?.mode) ? value.closure.mode : 'dormant', elapsed: Math.max(0, finite(value.closure?.elapsed)), frontZ: clamp(value.closure?.frontZ ?? -4.5, -4.5, 2.7) };
  const w = value.counterweight || fresh.counterweight;
  state.counterweight = { active: !!w.active, level: Math.round(clamp(w.level, 0, 6)), mode: w.mode === 'settled' ? 'returning' : WEIGHT_MODES.has(w.mode) ? w.mode : 'warning', elapsed: Math.max(0, finite(w.elapsed)), x: clamp(w.x, -32, -14), z: clamp(w.z, -9, 9), y: clamp(w.y, -19, 6), pathIndex: Math.round(clamp(w.pathIndex, 0, 12)), fall: validFall(w.fall), cycle: Math.max(0, Math.floor(finite(w.cycle))) };
  if (!state.counterweight.fall && GROUND_WEIGHT_MODES.has(state.counterweight.mode) && !continuationSupportAt(state.counterweight.x, state.counterweight.z, { phase: 'catch', feet: state.counterweight.y })) {
    // Older saves can name a point on the former broad plate. Keep the same
    // catch/progress, but restart its announced physical approach on support.
    const level = state.counterweight.level, [x, z] = weightPaths[level]?.[0] || [-30.5, 7.5];
    Object.assign(state.counterweight, { x, z, y: continuationCatchFloor(level), mode: level === 6 ? 'returning' : 'warning', elapsed: 0, pathIndex: 0 });
  }
  state.fall = validFall(value.fall);
  const last = value.lastSafe;
  state.lastSafe = last && Number.isFinite(last.x) && Number.isFinite(last.z) && Number.isFinite(last.feet) ? { x: clamp(last.x, -40, 15), z: clamp(last.z, -26, 12), feet: clamp(last.feet, -20, 4), yaw: angle(finite(last.yaw)), pitch: clamp(last.pitch, -1.3, 1.3), level: Math.round(clamp(last.level, 0, 6)) } : { ...fresh.lastSafe };
  if (value.reveal && localPose(value.reveal.from)) state.reveal = { elapsed: clamp(value.reveal.elapsed, 0, C.revealSeconds), duration: C.revealSeconds, from: localPose(value.reveal.from) };
  if (value.recovery && typeof value.recovery.reason === 'string') {
    const r = value.recovery, from = localPose(r.from), target = localPose(r.target), path = Array.isArray(r.path) && r.path.length >= 2 && r.path.length <= 24 ? r.path.map(localPose) : null;
    const refuge = continuationRefugeAt({ ...state, level: Math.min(5, state.level) });
    if (from && target && path?.every(Boolean) && distance(target, refuge) < 1e-7 && Math.abs(target.feet - refuge.feet) < 1e-7 && recoveryPathValid(path, state.phase)) state.recovery = { reason: r.reason, kind: r.kind === 'guided-return' ? 'guided-return' : 'sling', from, target, path, duration: clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds), elapsed: clamp(r.elapsed, 0, clamp(r.duration, C.recoverySeconds, C.recoveryMaximumSeconds)), repaired: !!r.repaired };
    else { state.recovery = makeRecovery(state, r.reason); if (state.recovery.repaired) Object.assign(state, state.recovery.from); }
  }
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
  if (reverse) { state.phase = 'catch'; state.level = 5; Object.assign(state, C.catch.finalApproach); state.fall = null; state.recovery = null; state.reveal = null; state.grace = C.graceSeconds; state.lastSafe = { ...C.catch.finalApproach, level: 5 }; }
  return state;
}

function insideRefuge(state) { return state.phase === 'catch' ? distance(state, C.catch.refuge) < 1.65 : state.feet > 2.6 && state.x < 1 && state.z > -2.5; }
export function sourceContinuationDoorFraction(state, id) {
  const motion = state?.doorMotion?.[id];
  if (!motion) return state?.doorOpen?.[id] ? 1 : 0;
  const to = motion.to ? 1 : 0, progress = motion.duration > 0 ? clamp((finite(state.elapsed) - motion.startedAt) / motion.duration, 0, 1) : 1;
  return clamp(motion.from + (to - motion.from) * progress, 0, 1);
}
function staticSolidBlocks(x, z, state) {
  const r = C.bodyRadius;
  return continuationSolids(state).some(s => s.role !== 'closure' && state.feet + C.bodyHeight > s.minY + .05 && state.feet < s.maxY - .05 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ);
}
function solidBlocks(x, z, state) {
  const r = C.bodyRadius;
  if (continuationSolids(state).some(s => state.feet + C.bodyHeight > s.minY + .05 && state.feet < s.maxY - .05 && x + r > s.minX && x - r < s.maxX && z + r > s.minZ && z - r < s.maxZ)) return true;
  if (state.phase === 'wrong-return' && sourceContinuationDoorFraction(state, 'wrong-onward') < C.doorPassFraction && x < -3.1 + r && x > -3.5 && state.feet > 2.6 && z > -2 && z < 0) return true;
  if (state.phase === 'wrong-return' && sourceContinuationDoorFraction(state, 'wrong-false-return') < C.doorPassFraction && state.feet > 2.6 && Math.abs(x - 6) < .9 + r && z > 2 - r && z < 2.3) return true;
  if (state.phase === 'catch' && state.level === 5 && sourceContinuationDoorFraction(state, 'catch-final') < C.doorPassFraction && x > -24 - r && x < -23.5 && Math.abs(z) < .9 + r) return true;
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
const carryObstacles = continuationCatchObstacles();
const recoveryPathCache = new Map();
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, a.feet - b.feet);
function pathLength(path) { return path.slice(1).reduce((n, p, i) => n + pointDistance(path[i], p), 0); }
function bodySweepClear(a, b) {
  const count = Math.max(1, Math.ceil(pointDistance(a, b) / .07));
  for (let i = 0; i <= count; i++) {
    const t = i / count, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t };
    if (!continuationBodyClearAt(p, { radius: C.bodyRadius, height: C.bodyHeight, margin: .025, obstacles: carryObstacles })) return false;
  }
  return true;
}
function recoveryPathValid(path, phase) {
  const key = phase + JSON.stringify(path.map(p => [p.x, p.z, p.feet]));
  if (recoveryPathCache.has(key)) return recoveryPathCache.get(key);
  const valid = phase !== 'catch' || path.slice(1).every((p, i) => bodySweepClear(path[i], p));
  if (recoveryPathCache.size >= 64) recoveryPathCache.delete(recoveryPathCache.keys().next().value);
  recoveryPathCache.set(key, valid); return valid;
}
function obstacleCorners(minFeet, maxFeet) {
  const r = C.bodyRadius + .055, result = [];
  for (const s of carryObstacles) {
    if (minFeet >= s.maxY - 1e-7 || maxFeet + C.bodyHeight <= s.minY + 1e-7) continue;
    for (const x of [s.minX - r, s.maxX + r]) for (const z of [s.minZ - r, s.maxZ + r]) if (x >= -33 && x <= -12 && z >= -10 && z <= 10) result.push({ x, z });
  }
  return result;
}
function planePath(from, to, feet) {
  const a = { ...from, feet }, b = { ...to, feet };
  if (bodySweepClear(a, b)) return [a, b];
  const nodes = [a, b], seen = new Set([`${a.x},${a.z}`, `${b.x},${b.z}`]);
  for (const p of obstacleCorners(feet, feet)) {
    const key = `${p.x},${p.z}`;
    if (seen.has(key) || !continuationBodyClearAt({ ...p, feet }, { radius: C.bodyRadius, margin: .025, obstacles: carryObstacles })) continue;
    seen.add(key); nodes.push({ ...p, feet });
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set(), edges = new Map(); costs[0] = 0;
  for (let iteration = 0; iteration < nodes.length; iteration++) {
    let at = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (at < 0 || costs[i] < costs[at])) at = i;
    if (at < 0 || !Number.isFinite(costs[at])) break;
    if (at === 1) { const result = []; for (let i = 1; i >= 0; i = previous[i]) { result.unshift(nodes[i]); if (i === 0) break; } return result; }
    visited.add(at);
    for (let next = 0; next < nodes.length; next++) {
      if (visited.has(next)) continue;
      const key = at < next ? `${at}:${next}` : `${next}:${at}`;
      if (!edges.has(key)) edges.set(key, bodySweepClear(nodes[at], nodes[next]));
      if (!edges.get(key)) continue;
      const cost = costs[at] + pointDistance(nodes[at], nodes[next]);
      if (cost < costs[next] - 1e-8) { costs[next] = cost; previous[next] = at; }
    }
  }
  return null;
}
function slingPath(from, target, level) {
  const cruise = continuationCatchFloor(level) + C.recoveryRise;
  let prefix = null, lifted = null;
  if (bodySweepClear(from, { ...from, feet: cruise })) { prefix = [from]; lifted = { ...from, feet: cruise }; }
  else {
    const candidates = obstacleCorners(Math.min(from.feet, cruise), Math.max(from.feet, cruise))
      .filter(p => bodySweepClear({ ...p, feet: from.feet }, { ...p, feet: cruise }))
      .sort((a, b) => distance(from, a) - distance(from, b) || a.x - b.x || a.z - b.z);
    for (const candidate of candidates) { const path = planePath(from, candidate, from.feet); if (path) { prefix = path; lifted = { ...candidate, feet: cruise }; break; } }
  }
  if (!prefix) return null;
  const lateral = planePath(lifted, target, cruise);
  if (!lateral || !bodySweepClear({ ...target, feet: cruise }, target)) return null;
  return [...prefix, lifted, ...lateral.slice(1), target].filter((p, i, all) => i === 0 || pointDistance(p, all[i - 1]) > 1e-8);
}
function makeRecovery(state, reason) {
  const level = Math.min(5, state.level), target = { ...continuationRefugeAt({ ...state, level }), yaw: state.yaw, pitch: state.pitch, level };
  let from = { x: state.x, z: state.z, feet: state.feet, yaw: state.yaw, pitch: state.pitch, level }, repaired = false;
  let path = state.phase === 'catch' ? slingPath(from, target, level) : [from, { ...from, x: target.x }, target];
  if (!path) { from = { ...target }; path = [from, { ...target }]; repaired = true; }
  path = path.map(p => ({ ...from, ...p, yaw: from.yaw, pitch: from.pitch, level }));
  return { reason, kind: state.phase === 'catch' ? 'sling' : 'guided-return', from, target, path, duration: clamp(Math.max(C.recoverySeconds, pathLength(path) / C.recoverySpeed), C.recoverySeconds, C.recoveryMaximumSeconds), elapsed: 0, repaired };
}
function carryPose(recovery) {
  const total = pathLength(recovery.path), wanted = total * Math.min(1, recovery.elapsed / recovery.duration);
  let passed = 0;
  for (let i = 1; i < recovery.path.length; i++) {
    const a = recovery.path[i - 1], b = recovery.path[i], length = pointDistance(a, b);
    if (wanted <= passed + length + 1e-9) { const t = length ? Math.max(0, Math.min(1, (wanted - passed) / length)) : 1; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, feet: a.feet + (b.feet - a.feet) * t }; }
    passed += length;
  }
  return recovery.target;
}
export function sourceContinuationRecoveryPlan(value, reason = 'counterweight') { return makeRecovery(normalizeSourceContinuation(value), reason); }
function beginRecovery(state, reason, events) {
  if (state.recovery || state.grace > 0 || insideRefuge(state)) return;
  state.fall = null; state.recovery = makeRecovery(state, reason);
  if (state.recovery.repaired) Object.assign(state, state.recovery.from);
  state.caption = null; events.push({ type: 'capture', reason, duration: state.recovery.duration });
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
  [[-17.7, -4.5], [-17.7, 0], [-19.55, 0]],
  [[-20.5, 0], [-20.5, -4.5], [-25, -4.5], [-25, -3.45]],
  [[-25, -2.5], [-29.5, -2.5], [-29.5, 2], [-28.45, 2]],
  [[-27.5, 2], [-27.5, 6.5], [-23, 6.5], [-23, 5.45]],
  [[-23, 4.5], [-27.5, 4.5], [-27.5, 0], [-26.45, 0]],
  [[-29, 0], [-29, -4.5], [-25, -4.5], [-25, -3.45]],
];
function moveWeightTo(w, target, speed, dt) {
  const d = distance(w, target), amount = Math.min(d, speed * dt);
  if (d > 1e-8) { w.x += (target.x - w.x) / d * amount; w.z += (target.z - w.z) / d * amount; }
  return d <= amount + 1e-8;
}
function setWeightMode(w, mode, events, type) { w.mode = mode; w.elapsed = 0; if (type) events.push({ type, level: w.level, cycle: w.cycle }); }
function advanceWeight(state, dt, events) {
  const w = state.counterweight;
  if (!w.active) return;
  w.elapsed += dt;
  if (w.mode === 'warning') { if (w.elapsed >= C.catch.counterweightWarningSeconds) { w.mode = 'walking'; w.elapsed = 0; events.push({ type: 'counterweight-moves', level: w.level }); } return; }
  const h = C.catch.hoist;
  if (w.mode === 'returning') { if (moveWeightTo(w, h.shaft, h.returnSpeed, dt)) setWeightMode(w, 'rewinding', events, 'counterweight-rewind'); return; }
  if (w.mode === 'rewinding') { if (w.elapsed >= h.rewindSeconds) setWeightMode(w, 'hoisting', events, 'counterweight-hoist'); return; }
  if (w.mode === 'hoisting') { w.y = Math.min(h.travelY, w.y + h.upSpeed * dt); if (w.y >= h.travelY) { w.pathIndex = 0; setWeightMode(w, 'traversing', events, 'counterweight-traverse'); } return; }
  if (w.mode === 'traversing') {
    const targets = [{ x: h.start.x, z: h.shaft.z }, h.start], target = targets[w.pathIndex];
    if (target && moveWeightTo(w, target, h.traverseSpeed, dt)) w.pathIndex++;
    if (w.pathIndex >= targets.length) setWeightMode(w, 'lowering-warning', events, 'counterweight-lowering-warning');
    return;
  }
  if (w.mode === 'lowering-warning') { if (w.elapsed >= h.loweringWarningSeconds) setWeightMode(w, 'lowering', events, 'counterweight-lower'); return; }
  if (w.mode === 'lowering') {
    w.y = Math.max(C.catch.top, w.y - h.downSpeed * dt);
    if (w.y <= C.catch.top) { w.level = 0; w.pathIndex = 0; w.cycle++; setWeightMode(w, 'warning', events, 'counterweight-cycle'); }
    return;
  }
  if (w.mode === 'falling') {
    const support = fallStep(w.fall, 'catch', dt); Object.assign(w, { x: w.fall.x, y: w.fall.feet, z: w.fall.z });
    if (support) { w.y = support.y; w.level = support.level; w.fall = null; w.pathIndex = 0; w.mode = w.level >= 6 ? 'returning' : 'warning'; w.elapsed = 0; events.push({ type: 'counterweight-lands', level: w.level }); if (w.level >= 6) events.push({ type: 'counterweight-return', cycle: w.cycle }); }
  } else {
    const path = weightPaths[Math.min(5, w.level)], target = path[w.pathIndex];
    if (!target) {
      const lip = continuationDropLip({ level: w.level }) || { dx: 0, dz: 1 };
      w.fall = { x: w.x, z: w.z, feet: w.y, vx: lip.dx * .8, vz: lip.dz * .8, vy: 0, fromLevel: w.level, elapsed: 0, unsupported: false }; w.mode = 'falling';
    } else if (moveWeightTo(w, { x: target[0], z: target[1] }, C.catch.counterweightSpeed, dt)) w.pathIndex++;
  }
}
function weightTouchesPlayer(state) {
  const w = state.counterweight;
  return w.active && w.y < state.feet + C.bodyHeight && w.y + C.catch.hoist.drumHeight > state.feet + .05 && distance(state, w) < C.catch.counterweightRadius + C.bodyRadius + .07;
}
function tickWeight(state, dt, events) {
  advanceWeight(state, dt, events);
  if (weightTouchesPlayer(state)) beginRecovery(state, 'counterweight', events);
}
export function continuationFocus(state) {
  if (!state || state.status !== 'active' || state.fall || state.recovery || state.reveal) return null;
  const candidates = continuationDoors(state).filter(d => Math.abs(state.feet - d.y) < .55 && distance(state, d) <= 1.65).map(d => ({ ...d, type: d.role, title: d.role === 'return' ? 'RETURN TO THE FIRST DOOR' : d.role === 'final' ? 'OPEN THE GREY DOOR' : 'OPEN THE DOOR', text: d.role === 'return' ? 'Return to Source. This place will remain as you left it.' : 'The handle is within reach.', position: { x: d.x, y: d.y + 1.1, z: d.z } }));
  if (state.phase === 'catch') for (const lip of continuationDropLips(state)) if (distance(state, lip) <= .75) candidates.push({ ...lip, y: state.feet, type: 'drop', title: 'LOWER YOURSELF FROM THE EDGE', text: 'Look at what is beneath this edge.', position: { x: lip.x, y: state.feet, z: lip.z } });
  return candidates.filter(d => { if (state.phase === 'catch') return true; const dx = d.x - state.x, dz = d.z - state.z, len = Math.hypot(dx, dz); return len < .1 || (Math.sin(state.yaw) * dx - Math.cos(state.yaw) * dz) / len > .2; }).sort((a, b) => distance(state, a) - distance(state, b))[0] || null;
}
function interact(state, events) {
  const focus = continuationFocus(state); if (!focus) return;
  if (focus.type === 'return') { state.status = 'returned'; events.push({ type: 'return', returnPose: clone(state.returnPose) }); }
  else if (focus.type === 'final') toggleDoor(state, focus.id, events);
  else if (focus.type === 'drop') { beginFall(state, focus); events.push({ type: 'drop', level: state.level }); }
  else { toggleDoor(state, focus.id, events); learn(state, focus.type === 'false-return' ? 'false-return-porch' : 'seam-matches-first-door'); }
}
function toggleDoor(state, id, events) {
  const from = sourceContinuationDoorFraction(state, id), to = state.doorOpen[id] ? 0 : 1;
  state.doorOpen[id] = !!to;
  state.doorMotion[id] = { from, to, startedAt: state.elapsed, duration: C.doorSwingSeconds * Math.abs(to - from) };
  events.push({ type: 'door', id, open: !!to });
}
function tick(state, input, dt, events) {
  state.elapsed += dt; state.grace = Math.max(0, state.grace - dt);
  if (state.reveal) {
    state.reveal.elapsed = Math.min(state.reveal.duration, state.reveal.elapsed + dt);
    if (state.phase === 'catch') tickWeight(state, dt, events);
    if (state.reveal.elapsed + 1e-8 >= state.reveal.duration) { state.reveal = null; events.push({ type: 'reveal-complete' }); }
    return;
  }
  if (state.recovery) {
    const recovery = state.recovery; recovery.elapsed = Math.min(recovery.duration, recovery.elapsed + dt);
    Object.assign(state, carryPose(recovery));
    if (state.phase === 'catch') tickWeight(state, dt, events);
    if (recovery.elapsed + 1e-8 >= recovery.duration) {
      Object.assign(state, recovery.target); state.lastSafe = { ...recovery.target }; state.recovery = null; state.grace = C.graceSeconds;
      events.push({ type: 'recovered', reason: recovery.reason });
    }
    return;
  }
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
    if (state.x < C.wrongReturn.transferX && state.feet > 2.7) { state.phase = 'catch'; state.level = 0; state.reveal = { elapsed: 0, duration: C.revealSeconds, from: localPose(state) }; state.lastSafe = { x: -16, z: -1, feet: 3, yaw: state.yaw, pitch: state.pitch, level: 0 }; state.caption = null; learn(state, 'overhead-shaft'); events.push({ type: 'phase', phase: 'catch' }); }
  } else {
    tickWeight(state, dt, events);
    if (!state.fall && !state.recovery && state.level === 5 && sourceContinuationDoorFraction(state, 'catch-final') >= C.doorPassFraction && state.x > -23.8 && Math.abs(state.z) < .64) {
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
  while (state.accumulator + 1e-10 >= C.fixedStep && state.status === 'active') {
    const phaseBefore = state.phase, authoredBefore = !!(state.reveal || state.recovery);
    state.accumulator -= C.fixedStep; tick(state, input, C.fixedStep, events);
    // One input sample cannot retain its old direction across a camera/control
    // change. The host clears held keys on this event; discard its queued time
    // here too, so no later call replays the old movement under the new axes.
    if (state.phase !== phaseBefore || authoredBefore && !state.reveal && !state.recovery) { state.accumulator = 0; break; }
  }
  state.accumulator = Math.max(0, state.accumulator);
  const event = events.find(e => e.type === 'return' || e.type === 'complete') || events.at(-1) || null;
  return { state, event, events };
}
export function sourceContinuationFrame(value) {
  const state = normalizeSourceContinuation(value), player = { x: state.x, y: state.feet, z: state.z, yaw: state.yaw, pitch: state.pitch, eyeHeight: C.eyeHeight, visible: state.phase === 'catch' };
  const camera = state.phase === 'catch' ? { mode: 'top-down', eye: [-23, state.feet + 14, 0], target: [-23, state.feet, 0], up: [0, 0, -1], yaw: 0, pitch: -Math.PI / 2 } : { mode: 'first-person', eye: [state.x, state.feet + C.eyeHeight, state.z], yaw: state.yaw, pitch: state.pitch };
  const doors = continuationDoors(state).map(d => ({ ...d, openFraction: sourceContinuationDoorFraction(state, d.id) }));
  return { ...state, active: state.status === 'active', player, camera, presentation: { reveal: state.reveal, recovery: state.recovery }, focus: continuationFocus(state), geometry: { surfaces: continuationSurfaces(state), solids: continuationSolids(state), doors, props: continuationProps(state) }, cutaway: { omitAboveFeet: state.feet + .3, showLowerLevels: 2 }, objective: state.phase === 'wrong-return' ? 'Find the return you remember.' : 'Choose a shelf below. The open return remains beside the shaft.' };
}

// Audit telemetry, never a HUD or a steering input. This predicts contact only
// for a stationary exposed body on the authored route, not a moving player.
export function sourceContinuationThreatTelemetry(value, { horizonSeconds = 180 } = {}) {
  const state = normalizeSourceContinuation(value), w = state.counterweight, horizon = clamp(horizonSeconds, 0, 360);
  const result = { model: 'stationary-authored-route', counterfactual: true, assumption: 'Player remains at this pose while active grace counts down.', mode: w.mode, cycle: w.cycle, active: w.active, refuge: insideRefuge(state), distance: Math.hypot(state.x - w.x, state.z - w.z, state.feet - w.y), timeToContact: null, horizonSeconds: horizon };
  if (state.phase !== 'catch' || !w.active || result.refuge) return result;
  const dt = 1 / 60;
  for (let t = 0; t <= horizon + 1e-9; t += dt) {
    if (state.grace <= 0 && weightTouchesPlayer(state)) { result.timeToContact = t; break; }
    if (t + dt > horizon + 1e-9) break;
    advanceWeight(state, dt, []); state.grace = Math.max(0, state.grace - dt);
  }
  return result;
}
