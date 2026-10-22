import { SOURCE_DEMOLITION as PLAN, SOURCE_DEMOLITION_ANCHORS as ANCHORS,
  SOURCE_DEMOLITION_CUES as CUES } from '../data/source-demolition.js';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, finite(value, lo)));
const smooth = (lo, hi, value) => { const t = clamp((value - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); };
const validNumber = value => value !== null && value !== undefined && Number.isFinite(Number(value));
const types = new Set(['strain', 'infill', 'course', 'roof', 'release', 'consumed']);
const eventId = type => `${PLAN.sequenceId}:${type}`;
const copyPosition = (value, fallback = ANCHORS.building) => value
  && ['x', 'y', 'z'].every(key => validNumber(value[key]))
  ? { x: Number(value.x), y: Number(value.y), z: Number(value.z) } : { ...fallback };
const insidePocket = (along, across) => along >= PLAN.pocket.from && along <= PLAN.pocket.to
  && Math.abs(across) <= PLAN.pocket.halfWidth;

export function normalizeSourceDemolition(value = null, { pastFirstLift = false } = {}) {
  const candidate = value && typeof value === 'object' ? value : {};
  // The retired Outskirts sequence has different coordinates and receipts.
  // It can never become an already running threshold event after a reload.
  const source = candidate.sequenceId === PLAN.sequenceId ? candidate : {};
  const committed = !!source.committed || ['active', 'spent'].includes(source.status);
  const skipped = !committed && (pastFirstLift || source.status === 'skipped' || !!source.skipped);
  const elapsed = committed ? clamp(source.elapsed, 0, PLAN.duration) : 0;
  const clock = clamp(Math.max(elapsed, finite(source.clock)), 0, 86400);
  const caught = committed && !!source.caught;
  const consumed = caught && !!source.consumed;
  const recognized = !skipped && (committed || !!source.recognized || source.status === 'recognized');
  const anchored = !skipped; // A fixed fixture, visible before the player exits.
  const receipts = [];
  for (const receipt of Array.isArray(source.receipts) ? source.receipts : []) {
    if (!types.has(receipt?.type) || receipts.some(item => item.type === receipt.type)) continue;
    receipts.push({ id: eventId(receipt.type), type: receipt.type,
      at: clamp(receipt.at, 0, clock), elapsed: clamp(receipt.elapsed, 0, PLAN.duration),
      position: copyPosition(receipt.position, ANCHORS[receipt.type]),
      gain: clamp(receipt.gain ?? 1, 0, 1), suppressed: !!receipt.suppressed });
  }
  // Imported/incomplete receipts must never turn an already damaged frontage
  // into a backlog of fresh attacks. Live advance writes a cue before normalising.
  const baseline = (type, at) => {
    if (receipts.some(receipt => receipt.type === type)) return;
    receipts.push({ id: eventId(type), type, at: Math.max(0, clock - elapsed + at),
      elapsed: at, position: copyPosition(null, ANCHORS[type]), gain: 1, suppressed: true });
  };
  if (recognized) baseline('strain', 0);
  if (committed) for (const cue of CUES) if (cue.at <= elapsed) baseline(cue.type, cue.at);
  if (consumed) baseline('consumed', clamp(source.consumedAt, 0, elapsed));
  return {
    version: PLAN.version, sequenceId: PLAN.sequenceId,
    status: skipped ? 'skipped' : committed ? elapsed >= PLAN.duration ? 'spent' : 'active'
      : recognized ? 'recognized' : 'unseen',
    anchored, recognized, committed, skipped, clock, elapsed,
    caught, caughtAt: caught ? clamp(source.caughtAt, 0, elapsed) : null,
    consumed, consumedAt: consumed ? clamp(source.consumedAt, 0, elapsed) : null,
    consumedPosition: consumed ? copyPosition(source.consumedPosition, ANCHORS.pocket) : null,
    pocketEntered: consumed,
    released: consumed && !!source.released,
    lastAlong: validNumber(source.lastAlong) ? clamp(source.lastAlong, -1e6, 1e6) : null,
    lastAcross: validNumber(source.lastAcross) ? clamp(source.lastAcross, -1e4, 1e4) : null,
    lastEligible: !!source.lastEligible && validNumber(source.lastAlong) && validNumber(source.lastAcross),
    receipts,
  };
}

// Advance is pure. `protected` continues the physical sequence but permanently
// receipts missed sound cues; `suspended` freezes lived time (pause/focus/exit).
// Movement must be an accepted, small forward body step. Merely loading a
// nearby save, a probe warp, turning, waiting or opening the leaf never commits.
export function advanceSourceDemolition(value, {
  dt = 0, along = null, across = null, movingForward = false,
  eligible = false, protected: isProtected = false, suspended = false, restored = false,
  portalPassable = false,
} = {}) {
  const before = normalizeSourceDemolition(value);
  const state = { ...before, receipts: before.receipts.map(receipt => ({ ...receipt, position: { ...receipt.position } })) };
  const positionValid = validNumber(along) && validNumber(across);
  along = positionValid ? Number(along) : 0;
  across = positionValid ? Number(across) : 0;
  const lived = !!eligible && !suspended && positionValid;
  const delta = lived ? clamp(dt, 0, PLAN.maxTick) : 0;
  const events = [];
  let immediate = false;
  const receipt = (type, at, position, gain = 1) => {
    if (state.receipts.some(item => item.type === type)) return;
    const item = { id: eventId(type), type, at,
      elapsed: state.elapsed, position: copyPosition(position, ANCHORS[type]), gain,
      suppressed: !!isProtected || !!restored };
    state.receipts.push(item); immediate = true;
    if (!item.suppressed) events.push({ ...item, age: Math.max(0, state.clock - item.at) });
  };
  if (restored) for (const item of state.receipts) item.suppressed = true;
  if (lived && !state.skipped) {
    state.clock = Math.min(86400, state.clock + delta);
    const ordinaryStep = delta > 0 && before.lastEligible && !restored && !!movingForward
      && along > before.lastAlong + 1e-5
      && Math.hypot(along - before.lastAlong, across - before.lastAcross) <= PLAN.maxAcceptedStep;
    const crossing = ordinaryStep && before.lastAlong < PLAN.commitmentAt && along >= PLAN.commitmentAt;
    const fraction = crossing ? (PLAN.commitmentAt - before.lastAlong) / (along - before.lastAlong) : 0;
    const crossingAcross = crossing ? before.lastAcross + (across - before.lastAcross) * fraction : Infinity;
    if (!state.committed && along > PLAN.nearTo) {
      state.skipped = true; state.status = 'skipped'; immediate = true;
    } else if (!state.committed && !isProtected && portalPassable && crossing
      && Math.abs(crossingAcross) <= PLAN.commitmentHalfWidth) {
      state.committed = true; state.recognized = true; state.status = 'active'; immediate = true;
      receipt('strain', state.clock, ANCHORS.strain, .62);
    }
    if (state.committed) {
      state.elapsed = Math.min(PLAN.duration, before.elapsed + delta);
      for (const cue of CUES) if (state.elapsed >= cue.at && !state.receipts.some(item => item.type === cue.type)) {
        receipt(cue.type, state.clock - (state.elapsed - cue.at), ANCHORS[cue.type], cue.gain);
      }
      const front = PLAN.along - PLAN.frontReach * smooth(PLAN.releaseFrom, PLAN.releaseTo, state.elapsed);
      const wavePresent = state.elapsed >= PLAN.releaseFrom && state.elapsed <= 12;
      if (!state.caught && wavePresent && Math.abs(across) <= PLAN.pocket.halfWidth
        && along >= front && along <= PLAN.along + 6) {
        state.caught = true; state.caughtAt = state.elapsed; immediate = true;
      }
      // The wave can touch a watching body thirty metres out. Consumption is
      // reserved for physically entering the filled dark region at the facade.
      if (!state.consumed && state.elapsed >= PLAN.fillReadyAt && insidePocket(along, across)) {
        // The outward wave can have passed while someone watches safely. Its
        // remaining opaque region is still a place they may later walk into.
        if (!state.caught) { state.caught = true; state.caughtAt = state.elapsed; }
        state.consumed = true; state.consumedAt = state.elapsed;
        state.consumedPosition = { x: across, y: PLAN.floor + .95, z: -along };
        state.pocketEntered = true;
        receipt('consumed', state.clock, state.consumedPosition, .82);
      }
      if (state.consumed && !state.released && !insidePocket(along, across)) {
        state.released = true; immediate = true;
      }
      const consumedClock = state.receipts.find(item => item.type === 'consumed')?.at;
      if (before.consumed && !state.released && Number.isFinite(consumedClock)
        && before.clock - consumedClock < PLAN.occupancyBeat && state.clock - consumedClock >= PLAN.occupancyBeat) immediate = true;
      if (state.elapsed >= PLAN.duration && before.elapsed < PLAN.duration) immediate = true;
    }
  }
  state.lastEligible = lived && !restored;
  state.lastAlong = lived ? along : null;
  state.lastAcross = lived ? across : null;
  const next = normalizeSourceDemolition(state);
  const changed = JSON.stringify(next) !== JSON.stringify(before);
  const saveDue = immediate || (next.committed && Math.floor(next.elapsed) !== Math.floor(before.elapsed));
  return { state: next, events, changed, immediate, saveDue };
}

export function sourceDemolitionFrame(value, { along = null, across = null } = {}) {
  const state = normalizeSourceDemolition(value);
  const valid = validNumber(along) && validNumber(across);
  along = valid ? Number(along) : 0; across = valid ? Number(across) : 0;
  const elapsed = state.elapsed;
  const peel = state.committed ? smooth(0, 4, elapsed) : 0;
  const course = state.committed ? smooth(3.2, 10, elapsed) : 0;
  const roof = state.committed ? smooth(7.5, 15.4, elapsed) : 0;
  const release = state.committed ? smooth(PLAN.releaseFrom, PLAN.releaseTo, elapsed) : 0;
  const loss = .23 * peel + .43 * course + .34 * roof;
  const frontAlong = PLAN.along - PLAN.frontReach * release;
  const consumedClock = state.receipts.find(receipt => receipt.type === 'consumed')?.at ?? state.clock;
  // The final approach belongs to the real spirit volumes for a short beat
  // before the opaque region. Use lived time even if a late entry happens
  // after the18-second structural clock has already stopped.
  const consumption = state.consumed ? smooth(consumedClock, consumedClock + PLAN.occupancyBeat, state.clock) : 0;
  const pocketReady = state.consumed && !state.released && consumption >= 1;
  const blackness = pocketReady && valid && insidePocket(along, across) ? 1 : 0;
  const near = valid && along >= PLAN.nearFrom && along <= PLAN.nearTo;
  const phase = state.skipped ? 'skipped' : !state.committed ? state.recognized ? 'strain' : 'dormant'
    : state.consumed && !state.released ? 'nothingness'
      : elapsed >= PLAN.duration ? 'spent' : elapsed < PLAN.releaseFrom ? 'peel'
        : elapsed < PLAN.releaseTo ? 'release' : 'dissolution';
  return {
    active: !state.skipped && near && state.anchored && (state.recognized || state.committed),
    preload: !state.skipped && valid && along >= PLAN.preloadFrom && along <= PLAN.nearTo,
    live: state.committed && elapsed < PLAN.duration,
    sequenceId: state.sequenceId, phase, elapsed,
    anchored: state.anchored, recognized: state.recognized, committed: state.committed, skipped: state.skipped,
    caught: state.caught, consumed: state.consumed, released: state.released,
    loss, shell: 1 - loss, stages: { peel, course, roof }, release,
    frontAlong, frontReach: PLAN.frontReach * release,
    consumption,
    // This describes occupancy of a fixed opaque WORLD volume. It is never
    // an instruction to fade the framebuffer, change exposure or move the eye.
    blackness, blackPocket: { ...PLAN.pocket, active: pocketReady },
    anchors: { ...ANCHORS, front: { x: PLAN.across, y: PLAN.floor + .95, z: -frontAlong },
      consumed: state.consumedPosition },
    events: state.receipts.filter(receipt => !receipt.suppressed).map(receipt => ({
      id: receipt.id, type: receipt.type, age: Math.max(0, state.clock - receipt.at),
      at: receipt.at, elapsed: receipt.elapsed, position: { ...receipt.position }, gain: receipt.gain,
    })),
  };
}
