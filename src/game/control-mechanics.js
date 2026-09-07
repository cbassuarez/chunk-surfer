// Presentation-only switch mechanics. Gameplay never waits for these curves.
// Travel and filament heat are separate: a released switch may remain lit,
// and a mechanically held switch need not have power behind its lens.
export const CONTROL_TIMING = Object.freeze({ press: 70, release: 120, minimumPress: 90, warm: 140, cool: 230 });
export const CONTROL_REGISTRY_LIMIT = 256;
export const CONTROL_LATCH_TRAVEL = .8;
const controls = new Map();
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const clock = () => globalThis.performance?.now?.() ?? Date.now();
const instant = (now) => Number.isFinite(now) ? now : clock();
const smooth = (p) => { const n = clamp01(p); return n * n * (3 - 2 * n); };
const curve = (motion, now) => motion.from + (motion.to - motion.from) * smooth((now - motion.at) / motion.duration);

function entryFor(id, now, create = true) {
  if (typeof id !== 'string' || !id || id.length > 192) return null;
  let entry = controls.get(id);
  if (!entry && create) {
    if (controls.size >= CONTROL_REGISTRY_LIMIT) controls.delete(controls.keys().next().value);
    entry = {
      held: false, latched: false, releaseAt: null, minimumUntil: now,
      travel: { from: 0, to: 0, at: now, duration: 1 },
      heat: { from: 0, to: 0, at: now, duration: 1 },
      lastAt: now,
    };
    controls.set(id, entry);
  } else if (entry) {
    // LRU bounds the registry without evicting frequently drawn controls.
    controls.delete(id);
    controls.set(id, entry);
  }
  return entry;
}

function timeFor(entry, now) {
  entry.lastAt = Math.max(entry.lastAt, now);
  return entry.lastAt;
}

function travelAt(entry, now) {
  if (entry.releaseAt !== null && now >= entry.releaseAt && !entry.held) {
    const at = entry.releaseAt;
    entry.travel = { from: curve(entry.travel, at), to: entry.latched ? CONTROL_LATCH_TRAVEL : 0,
      at, duration: CONTROL_TIMING.release };
    entry.releaseAt = null;
  }
  return clamp01(curve(entry.travel, now));
}

export function pressControl(id, { held = true, now } = {}) {
  const at = instant(now);
  const entry = entryFor(id, at);
  if (!entry) return false;
  const time = timeFor(entry, at);
  const from = travelAt(entry, time);
  // Keyboard repeat must not restart the plunge on every repeat event.
  if (!entry.held) {
    entry.travel = { from, to: 1, at: time, duration: CONTROL_TIMING.press };
    entry.minimumUntil = time + CONTROL_TIMING.minimumPress;
  }
  entry.held = !!held;
  entry.releaseAt = entry.held ? null : entry.minimumUntil;
  return true;
}

export function releaseControl(id, { now } = {}) {
  const at = instant(now);
  const entry = entryFor(id, at, false);
  if (!entry) return false;
  const time = timeFor(entry, at);
  travelAt(entry, time);
  entry.held = false;
  entry.releaseAt = Math.max(time, entry.minimumUntil);
  return true;
}

export function cancelControlScope(prefix) {
  if (typeof prefix !== 'string') return 0;
  let removed = 0;
  for (const id of controls.keys()) {
    if (id.startsWith(prefix)) { controls.delete(id); removed += 1; }
  }
  return removed;
}

export function sampleControl(id, { lit = false, latched = false, enabled = true, reducedMotion = false, now } = {}) {
  const at = instant(now);
  const entry = entryFor(id, at);
  if (!entry) return { travel: enabled && latched ? CONTROL_LATCH_TRAVEL : 0, lampHeat: enabled && lit ? 1 : 0 };
  const time = timeFor(entry, at);
  const from = travelAt(entry, time);
  const latch = !!latched && !!enabled;
  if (entry.latched !== latch) {
    entry.latched = latch;
    if (latch && !entry.held) {
      if (entry.travel.to === 1 && time < entry.minimumUntil) entry.releaseAt = entry.minimumUntil;
      else {
        entry.travel = { from, to: CONTROL_LATCH_TRAVEL, at: time, duration: CONTROL_TIMING.press };
        entry.releaseAt = null;
      }
    } else if (!entry.held) entry.releaseAt = Math.max(time, entry.minimumUntil);
  }
  if (!enabled && (entry.held || entry.travel.to !== 0 || entry.releaseAt !== null)) {
    entry.held = false;
    entry.releaseAt = time;
  }
  const heatTarget = enabled && lit ? 1 : 0;
  if (entry.heat.to !== heatTarget) {
    entry.heat = { from: curve(entry.heat, time), to: heatTarget, at: time,
      duration: heatTarget ? CONTROL_TIMING.warm : CONTROL_TIMING.cool };
  }
  const travel = travelAt(entry, time);
  return {
    travel: reducedMotion ? (enabled && (entry.held || entry.travel.to === 1) ? 1 : latch ? CONTROL_LATCH_TRAVEL : 0) : travel,
    lampHeat: reducedMotion ? heatTarget : clamp01(curve(entry.heat, time)),
  };
}

// Deterministic diagnostics for lifecycle tests; never drawn in game imagery.
export function controlMechanicsSnapshot() {
  return { size: controls.size, ids: [...controls.keys()] };
}
